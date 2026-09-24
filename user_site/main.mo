import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Array "mo:base/Array";
import Time "mo:base/Time";
import Nat "mo:base/Nat";
import Nat16 "mo:base/Nat16";
import Nat32 "mo:base/Nat32";
import Text "mo:base/Text";
import Blob "mo:base/Blob";
import Char "mo:base/Char";
import Buffer "mo:base/Buffer";
import Iter "mo:base/Iter";
import ExperimentalCycles "mo:base/ExperimentalCycles";

/// Personal user website canister template.
/// Stable DB: pages, settings, features + profile + local feed + photos.
/// Deployed by Ice Factory; owner is sole IC controller after create.
/// Photos: max 10, WebP only, ≤1.5 MB each after client compression; owner-only write; HTTP serve.
/// ICE main stores image links only, never bytes.
persistent actor class UserSite(initOwner : Principal) = this {

  // ---------- types ----------

  public type Post = {
    id : Nat;
    content : Text;
    timestamp : Time.Time;
    imageURL : ?Text;
  };

  public type Page = {
    id : Text;
    title : Text;
    body : Text;
    updatedAt : Time.Time;
  };

  public type SiteProfile = {
    username : Text;
    bio : Text;
    avatarURL : Text;
  };

  /// Metadata only — image bytes stay on this canister; clients store/display URLs.
  public type PhotoMeta = {
    id : Nat;
    contentType : Text;
    size : Nat;
    uploadedAt : Int;
    path : Text;
    url : Text;
  };

  public type PhotoQuota = {
    used : Nat;
    maxPhotos : Nat;
    maxBytesPerPhoto : Nat;
    remaining : Nat;
  };

  public type UploadPhotoResult = {
    #ok : PhotoMeta;
    #err : Text;
  };

  public type ChunkedBeginResult = {
    #ok : { uploadId : Nat; maxChunkBytes : Nat; maxPhotoBytes : Nat };
    #err : Text;
  };

  public type ChunkedStatus = {
    uploadId : Nat;
    contentType : Text;
    totalSize : Nat;
    chunkCount : Nat;
    receivedChunks : Nat;
    receivedBytes : Nat;
    missingIndices : [Nat];
  };

  public type HeaderField = (Text, Text);

  /// Boundary nodes may send certificate_version; required for reliable HTTP serving.
  public type HttpRequest = {
    method : Text;
    url : Text;
    headers : [HeaderField];
    body : Blob;
    certificate_version : ?Nat16;
  };

  /// Minimal streaming token (unused — photos fit in a single response).
  public type StreamingToken = {
    key : Text;
    index : Nat;
    content_encoding : Text;
  };

  public type StreamingCallbackHttpResponse = {
    body : Blob;
    token : ?StreamingToken;
  };

  public type StreamingStrategy = {
    #Callback : {
      callback : shared query (StreamingToken) -> async StreamingCallbackHttpResponse;
      token : StreamingToken;
    };
  };

  public type HttpResponse = {
    status_code : Nat16;
    headers : [HeaderField];
    body : Blob;
    streaming_strategy : ?StreamingStrategy;
    upgrade : ?Bool;
  };

  type StoredPhoto = {
    id : Nat;
    contentType : Text;
    data : Blob;
    uploadedAt : Int;
  };

  public type CyclesGauge = {
    balance : Nat;
    lastCheck : Int;
    estimatedDaysLeft : Nat;
    lowCycles : Bool;
    warning : ?Text;
  };

  public type SiteStatus = {
    owner : Principal;
    linkedToNetwork : Bool;
    factoryId : ?Principal;
    profile : SiteProfile;
    pageCount : Nat;
    cycles : CyclesGauge;
  };

  /// Custom domain + public URL + DNS confirmation (required before detach).
  public type DomainStatus = {
    customDomain : Text;
    publicUrl : Text;
    dnsConfigured : Bool;
    readyForDetach : Bool;
    canisterId : Principal;
    domainConnectedAt : Int;
  };

  // Low-cycles warning threshold (2 T cycles)
  private let LOW_CYCLES_THRESHOLD : Nat = 2_000_000_000_000;
  /// Photo library limits (owner storage on this canister only).
  private let MAX_PHOTOS : Nat = 10;
  /// Max stored size after client compression (WebP only).
  private let MAX_PHOTO_BYTES : Nat = 1_572_864; // 1.5 MB
  /// Single-call upload (matches max after compression).
  private let MAX_SINGLE_UPLOAD_BYTES : Nat = 1_572_864; // 1.5 MB
  private let MAX_CHUNK_BYTES : Nat = 500_000;
  private let MAX_CHUNKS : Nat = 4; // 4 * 500KB >= 1.5 MB

  private stable var owner : Principal = initOwner;
  private stable var nextPostId : Nat = 0;
  private stable var nextPhotoId : Nat = 0;
  private stable var nextUploadId : Nat = 0;
  private stable var linkedToNetwork : Bool = true;
  private stable var factoryId : ?Principal = null;
  private stable var iceMainId : ?Principal = null;
  private stable var profileInitialized : Bool = false;

  /// Hostname only (e.g. mysite.example.com) — no protocol/path.
  private stable var customDomain : Text = "";
  /// Public URL (e.g. https://mysite.example.com).
  private stable var publicUrl : Text = "";
  /// Owner confirmed DNS records point at this canister.
  private stable var dnsConfigured : Bool = false;
  private stable var domainConnectedAt : Int = 0;

  private stable var profile : SiteProfile = {
    username = "";
    bio = "";
    avatarURL = "";
  };

  private func textHash(t : Text) : Nat32 { Text.hash(t) };
  private func natHash(n : Nat) : Nat32 { Nat32.fromNat(n) };

  // Stable snapshots
  private stable var pagesEntries : [(Text, Page)] = [];
  private stable var settingsEntries : [(Text, Text)] = [];
  private stable var featuresEntries : [(Text, Bool)] = [];
  private stable var postsEntries : [(Nat, Post)] = [];
  private stable var followingEntries : [(Principal, Bool)] = [];
  private stable var feedEntries : [Post] = [];
  private stable var photosEntries : [(Nat, StoredPhoto)] = [];
  /// In-progress chunked upload (at most one; cleared on finalize/abort/timeout).
  private stable var pendingUploadEntries : ?{
    id : Nat;
    contentType : Text;
    totalSize : Nat;
    chunkCount : Nat;
    chunks : [(Nat, Blob)];
    receivedBytes : Nat;
    createdAt : Int;
  } = null;

  private transient var pages = HashMap.HashMap<Text, Page>(0, Text.equal, textHash);
  private transient var settings = HashMap.HashMap<Text, Text>(0, Text.equal, textHash);
  private transient var features = HashMap.HashMap<Text, Bool>(0, Text.equal, textHash);
  private transient var posts = HashMap.HashMap<Nat, Post>(0, Nat.equal, natHash);
  private transient var following = HashMap.HashMap<Principal, Bool>(0, Principal.equal, Principal.hash);
  private transient var localFeed = Buffer.Buffer<Post>(0);
  private transient var photos = HashMap.HashMap<Nat, StoredPhoto>(0, Nat.equal, natHash);

  private stable var lastCyclesCheck : Int = 0;
  private stable var cyclesAtCheck : Nat = 0;

  system func preupgrade() {
    pagesEntries := Iter.toArray(pages.entries());
    settingsEntries := Iter.toArray(settings.entries());
    featuresEntries := Iter.toArray(features.entries());
    postsEntries := Iter.toArray(posts.entries());
    followingEntries := Iter.toArray(following.entries());
    feedEntries := Buffer.toArray(localFeed);
    photosEntries := Iter.toArray(photos.entries());
  };

  system func postupgrade() {
    pages := HashMap.fromIter<Text, Page>(pagesEntries.vals(), pagesEntries.size(), Text.equal, textHash);
    settings := HashMap.fromIter<Text, Text>(settingsEntries.vals(), settingsEntries.size(), Text.equal, textHash);
    features := HashMap.fromIter<Text, Bool>(featuresEntries.vals(), featuresEntries.size(), Text.equal, textHash);
    posts := HashMap.fromIter<Nat, Post>(postsEntries.vals(), postsEntries.size(), Nat.equal, natHash);
    following := HashMap.fromIter<Principal, Bool>(
      followingEntries.vals(), followingEntries.size(), Principal.equal, Principal.hash
    );
    localFeed := Buffer.Buffer<Post>(feedEntries.size());
    for (p in feedEntries.vals()) { localFeed.add(p) };
    photos := HashMap.fromIter<Nat, StoredPhoto>(
      photosEntries.vals(), photosEntries.size(), Nat.equal, natHash
    );
    pagesEntries := [];
    settingsEntries := [];
    featuresEntries := [];
    postsEntries := [];
    followingEntries := [];
    feedEntries := [];
    photosEntries := [];
  };

  private func isOwner(p : Principal) : Bool {
    Principal.equal(p, owner)
  };

  private func isFactory(p : Principal) : Bool {
    switch (factoryId) {
      case (?f) { Principal.equal(p, f) };
      case null { false };
    }
  };

  /// After successful photo store: ask factory to top up this site if cycles are low.
  /// Best-effort; never fails the upload. Factory charges site owner via ICRC-2 if approved.
  private func requestFactoryCheckAndTopUp() : async () {
    switch (factoryId) {
      case null {};
      case (?f) {
        try {
          let fac = actor (Principal.toText(f)) : actor {
            checkAndTopUp : shared (Principal) -> async ();
          };
          await fac.checkAndTopUp(Principal.fromActor(this));
        } catch (_) {};
      };
    }
  };

  /// Default profile page — same shape as master ICE profile landing.
  private func buildDefaultProfilePage(prof : SiteProfile) : Page {
    let name = if (Text.size(prof.username) > 0) { prof.username } else { "Member" };
    let bio = if (Text.size(prof.bio) > 0) {
      prof.bio
    } else {
      "Welcome to my personal ICE website."
    };
    let body =
      "# " # name # "\n\n"
      # bio # "\n\n"
      # "---\n"
      # "This is my personal website canister on the Internet Computer.\n"
      # "Powered by ICE Network.";
    {
      id = "profile";
      title = name # " — Profile";
      body;
      updatedAt = Time.now();
    }
  };

  private func seedEmptyDbDefaults() {
    if (settings.get("theme") == null) {
      settings.put("theme", "ice-dark");
    };
    if (settings.get("displayName") == null) {
      settings.put("displayName", profile.username);
    };
    if (features.get("localFeed") == null) {
      features.put("localFeed", true);
    };
    if (features.get("p2pFollow") == null) {
      features.put("p2pFollow", true);
    };
    if (features.get("publicProfile") == null) {
      features.put("publicProfile", true);
    };
  };

  // ---------- lifecycle / network ----------

  /// Called by factory right after install_code.
  /// Sets network link + seeds empty DB + default profile page (master-style).
  public shared(msg) func bootstrap(
    factory : Principal,
    iceMain : Principal,
    username : Text,
    bio : Text,
    avatarURL : Text
  ) : async Text {
    // Only factory (first bootstrap) or owner may call
    let allowed =
      isOwner(msg.caller)
      or Principal.equal(msg.caller, factory)
      or (not profileInitialized and factoryId == null);
    if (not allowed) { return "Not authorized" };

    factoryId := ?factory;
    iceMainId := ?iceMain;
    linkedToNetwork := true;

    let uname =
      if (Text.size(username) > 0) { username }
      else { "Member" };
    let ubio =
      if (Text.size(bio) > 0) { bio }
      else { "A quieter place for real conversation." };

    profile := {
      username = uname;
      bio = ubio;
      avatarURL;
    };
    profileInitialized := true;

    // Empty stable DB defaults + default profile page (identical structure to master profile)
    seedEmptyDbDefaults();
    settings.put("displayName", uname);
    pages.put("profile", buildDefaultProfilePage(profile));

    "Bootstrapped profile for " # uname
  };

  /// Factory calls this on detach — site stays live, network flag off.
  public shared(msg) func onDetach() : async Text {
    if (not isFactory(msg.caller) and not isOwner(msg.caller)) {
      return "Not authorized";
    };
    linkedToNetwork := false;
    "Detached from ICE network index (canister still running)"
  };

  /// Factory calls this on relink — reconnect to network services.
  public shared(msg) func onRelink(factory : Principal) : async Text {
    if (not isOwner(msg.caller) and not Principal.equal(msg.caller, factory) and not isFactory(msg.caller)) {
      return "Not authorized";
    };
    factoryId := ?factory;
    linkedToNetwork := true;
    if (features.get("localFeed") == null) { features.put("localFeed", true) };
    if (features.get("p2pFollow") == null) { features.put("p2pFollow", true) };
    "Relinked to ICE network"
  };

  public shared(msg) func init(newOwner : Principal) : async () {
    if (Principal.equal(owner, Principal.fromText("aaaaa-aa")) or isOwner(msg.caller)) {
      owner := newOwner;
    };
  };

  public query func getOwner() : async Principal { owner };

  public query func getCanisterId() : async Principal {
    Principal.fromActor(this)
  };

  public query func isLinkedToNetwork() : async Bool { linkedToNetwork };

  public query func getProfile() : async SiteProfile { profile };

  public query func getSiteStatus() : async SiteStatus {
    {
      owner;
      linkedToNetwork;
      factoryId;
      profile;
      pageCount = pages.size();
      cycles = cyclesGaugeInternal();
    }
  };

  // ---------- domain / DNS (required before detach) ----------

  private func stripPrefix(s : Text, pref : Text) : Text {
    if (Text.startsWith(s, #text pref)) {
      let prefLen = Text.size(pref);
      let chars = Text.toArray(s);
      var out = "";
      var i = prefLen;
      while (i < chars.size()) {
        out #= Text.fromChar(chars[i]);
        i += 1;
      };
      out
    } else { s }
  };

  private func trimDomain(raw : Text) : Text {
    // Strip scheme and path if user pasted a full URL into domain field
    var s = stripPrefix(raw, "https://");
    s := stripPrefix(s, "http://");
    // Drop path/query
    let chars = Text.toArray(s);
    var out = "";
    label scan for (c in chars.vals()) {
      if (c == '/' or c == '?' or c == '#') { break scan };
      out #= Text.fromChar(c);
    };
    // Drop trailing dot
    if (Text.endsWith(out, #text ".")) {
      let ochars = Text.toArray(out);
      var o2 = "";
      var j = 0;
      let last = if (ochars.size() > 0) { ochars.size() - 1 } else { 0 };
      while (j < last) {
        o2 #= Text.fromChar(ochars[j]);
        j += 1;
      };
      out := o2;
    };
    out
  };

  private func isValidHostname(d : Text) : Bool {
    let n = Text.size(d);
    if (n < 3 or n > 253) { return false };
    if (Text.contains(d, #text " ")) { return false };
    if (Text.contains(d, #text "://")) { return false };
    if (Text.contains(d, #text "/")) { return false };
    if (not Text.contains(d, #text ".")) { return false };
    true
  };

  private func isValidPublicUrl(u : Text) : Bool {
    let n = Text.size(u);
    if (n < 8 or n > 512) { return false };
    Text.startsWith(u, #text "https://") or Text.startsWith(u, #text "http://")
  };

  private func domainReadyInternal() : Bool {
    Text.size(customDomain) > 0 and Text.size(publicUrl) > 0 and dnsConfigured
  };

  public query func getDomainStatus() : async DomainStatus {
    {
      customDomain;
      publicUrl;
      dnsConfigured;
      readyForDetach = domainReadyInternal();
      canisterId = Principal.fromActor(this);
      domainConnectedAt;
    }
  };

  public query func isReadyToDetach() : async Bool {
    domainReadyInternal()
  };

  /// Set public hostname + URL. Clears DNS confirmation so owner must re-confirm after DNS setup.
  public shared(msg) func setDomainConnection(domain : Text, url : Text) : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    let d = trimDomain(domain);
    var u = url;
    // If URL empty, build https://domain
    if (Text.size(u) == 0 and Text.size(d) > 0) {
      u := "https://" # d;
    };
    if (not isValidHostname(d)) {
      return "Invalid domain. Use a hostname like mysite.example.com (no https:// or path)."
    };
    if (not isValidPublicUrl(u)) {
      return "Invalid public URL. Use https://yoursite.com (or http://)."
    };
    // Public URL host must match domain (align with factory T10 integrity).
    let urlHost = trimDomain(u);
    if (urlHost != d) {
      return "Public URL host must match domain. Use https://" # d;
    };
    customDomain := d;
    publicUrl := u;
    dnsConfigured := false;
    domainConnectedAt := 0;
    "Domain saved. Add DNS records, then Check DNS on My Site."
  };

  /// Owner / factory: DNS verified (HTTPS ready).
  public shared(msg) func confirmDnsConfigured() : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    if (Text.size(customDomain) == 0 or Text.size(publicUrl) == 0) {
      return "Set domain and public URL first (setDomainConnection)."
    };
    dnsConfigured := true;
    domainConnectedAt := Time.now();
    "DNS verified. HTTPS hosting enabled."
  };

  public shared(msg) func clearDomainConnection() : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    customDomain := "";
    publicUrl := "";
    dnsConfigured := false;
    domainConnectedAt := 0;
    "Domain connection cleared"
  };

  // ---------- profile / pages / settings / features ----------

  public shared(msg) func setProfile(username : Text, bio : Text, avatarURL : Text) : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    profile := { username; bio; avatarURL };
    profileInitialized := true;
    settings.put("displayName", username);
    // Keep default profile page in sync
    pages.put("profile", buildDefaultProfilePage(profile));
    "Profile updated"
  };

  public shared(msg) func upsertPage(id : Text, title : Text, body : Text) : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    if (Text.size(id) == 0) { return "Page id required" };
    pages.put(id, { id; title; body; updatedAt = Time.now() });
    "Page saved: " # id
  };

  public shared(msg) func deletePage(id : Text) : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    if (id == "profile") { return "Cannot delete default profile page" };
    pages.delete(id);
    "Page deleted"
  };

  public query func getPage(id : Text) : async ?Page {
    pages.get(id)
  };

  public query func listPages() : async [Page] {
    let buf = Buffer.Buffer<Page>(pages.size());
    for ((_, p) in pages.entries()) { buf.add(p) };
    Buffer.toArray(buf)
  };

  public shared(msg) func setSetting(key : Text, value : Text) : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    settings.put(key, value);
    "OK"
  };

  public query func getSetting(key : Text) : async ?Text {
    settings.get(key)
  };

  public query func listSettings() : async [(Text, Text)] {
    Iter.toArray(settings.entries())
  };

  public shared(msg) func setFeature(key : Text, enabled : Bool) : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    features.put(key, enabled);
    "OK"
  };

  public query func getFeature(key : Text) : async ?Bool {
    features.get(key)
  };

  public query func listFeatures() : async [(Text, Bool)] {
    Iter.toArray(features.entries())
  };

  // ---------- posts / p2p ----------

  public shared(msg) func makeLocalPost(content : Text, imageURL : ?Text) : async ?Nat {
    if (not isOwner(msg.caller)) { return null };
    let id = nextPostId;
    nextPostId += 1;
    let p : Post = { id; content; timestamp = Time.now(); imageURL };
    posts.put(id, p);
    localFeed.add(p);
    ?id
  };

  public query func getLocalFeed(limit : Nat) : async [Post] {
    let size = localFeed.size();
    if (size == 0) { return [] };
    let start = if (size > limit) { size - limit } else { 0 };
    Array.tabulate<Post>(Nat.min(limit, size), func(i) {
      localFeed.get(start + i)
    })
  };

  public shared(msg) func followPeer(peerCanister : Principal) : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    if (not linkedToNetwork) { return "Site is detached — relink to use network features" };
    following.put(peerCanister, true);
    "Following " # Principal.toText(peerCanister)
  };

  public shared(msg) func unfollowPeer(peerCanister : Principal) : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    following.delete(peerCanister);
    "Unfollowed"
  };

  public query func getFollowing() : async [Principal] {
    let buf = Buffer.Buffer<Principal>(0);
    for ((p, _) in following.entries()) { buf.add(p) };
    Buffer.toArray(buf)
  };

  public shared(msg) func syncFromPeer(_peer : Principal, _limit : Nat) : async [Post] {
    if (not isOwner(msg.caller)) { return [] };
    if (not linkedToNetwork) { return [] };
    []
  };

  // ---------- photos (max 10 × 1 MB, owner-only write, HTTP serve) ----------

  private func selfCanisterIdText() : Text {
    Principal.toText(Principal.fromActor(this))
  };

  private func photoPath(id : Nat) : Text {
    "/photos/" # Nat.toText(id)
  };

  /// Public raw HTTP URL — ICE main / frontend store this link only, never bytes.
  private func photoPublicUrl(id : Nat) : Text {
    "https://" # selfCanisterIdText() # ".raw.icp0.io" # photoPath(id)
  };

  private func toPhotoMeta(p : StoredPhoto) : PhotoMeta {
    {
      id = p.id;
      contentType = p.contentType;
      size = p.data.size();
      uploadedAt = p.uploadedAt;
      path = photoPath(p.id);
      url = photoPublicUrl(p.id);
    }
  };

  private func normalizeContentType(ct : Text) : Text {
    let t = Text.map(
      ct,
      func(c : Char) : Char {
        let n = Char.toNat32(c);
        if (n >= 65 and n <= 90) { Char.fromNat32(n + 32) } else { c }
      }
    );
    var base = t;
    if (Text.contains(t, #text ";")) {
      let chars = Text.toArray(t);
      var out = "";
      label scan for (c in chars.vals()) {
        if (c == ';') { break scan };
        out #= Text.fromChar(c);
      };
      base := out;
    };
    Text.trim(base, #text " ")
  };

  /// Only WebP is accepted (frontend compresses to WebP before upload).
  private func isAllowedImageType(ct : Text) : Bool {
    normalizeContentType(ct) == "image/webp"
  };

  /// True if blob is WebP (RIFF....WEBP).
  private func isWebPBlob(data : Blob) : Bool {
    let bytes = Blob.toArray(data);
    if (bytes.size() < 12) { return false };
    bytes[0] == 0x52
      and bytes[1] == 0x49
      and bytes[2] == 0x46
      and bytes[3] == 0x46
      and bytes[8] == 0x57
      and bytes[9] == 0x45
      and bytes[10] == 0x42
      and bytes[11] == 0x50
  };

  /// Accept only WebP content-type and WebP magic bytes.
  private func resolveUploadContentType(contentType : Text, data : Blob) : ?Text {
    if (not isWebPBlob(data)) { return null };
    if (Text.size(contentType) == 0 or isAllowedImageType(contentType)) {
      return ?"image/webp";
    };
    null
  };

  private func parseNatDigits(s : Text) : ?Nat {
    if (Text.size(s) == 0) { return null };
    var n : Nat = 0;
    for (c in s.chars()) {
      let code = Char.toNat32(c);
      if (code < 48 or code > 57) { return null };
      n := n * 10 + Nat32.toNat(code - 48);
    };
    ?n
  };

  /// Parse "/photos/3" or "/photos/3?x=1" (leading path only).
  private func parsePhotoIdFromUrl(url : Text) : ?Nat {
    var path = url;
    // drop query
    if (Text.contains(path, #text "?")) {
      let chars = Text.toArray(path);
      var out = "";
      label scan for (c in chars.vals()) {
        if (c == '?') { break scan };
        out #= Text.fromChar(c);
      };
      path := out;
    };
    // drop fragment
    if (Text.contains(path, #text "#")) {
      let chars = Text.toArray(path);
      var out = "";
      label scan for (c in chars.vals()) {
        if (c == '#') { break scan };
        out #= Text.fromChar(c);
      };
      path := out;
    };
    // normalize: ensure leading slash for startsWith checks
    if (not Text.startsWith(path, #text "/") and Text.startsWith(path, #text "photos/")) {
      path := "/" # path;
    };
    if (Text.startsWith(path, #text "/photos/")) {
      var idText = stripPrefix(path, "/photos/");
      if (Text.endsWith(idText, #text "/")) {
        let chars = Text.toArray(idText);
        var out = "";
        var i = 0;
        let last = if (chars.size() > 0) { chars.size() - 1 } else { 0 };
        while (i < last) {
          out #= Text.fromChar(chars[i]);
          i += 1;
        };
        idText := out;
      };
      return parseNatDigits(idText);
    };
    if (Text.startsWith(path, #text "/photo/")) {
      return parseNatDigits(stripPrefix(path, "/photo/"));
    };
    null
  };

  public query func getPhotoQuota() : async PhotoQuota {
    let used = photos.size();
    {
      used;
      maxPhotos = MAX_PHOTOS;
      maxBytesPerPhoto = MAX_PHOTO_BYTES;
      remaining = if (used >= MAX_PHOTOS) { 0 } else { MAX_PHOTOS - used };
    }
  };

  public query func listPhotos() : async [PhotoMeta] {
    let buf = Buffer.Buffer<PhotoMeta>(photos.size());
    for ((_, p) in photos.entries()) {
      buf.add(toPhotoMeta(p));
    };
    // Sort by id ascending for stable UI
    Array.sort<PhotoMeta>(
      Buffer.toArray(buf),
      func(a : PhotoMeta, b : PhotoMeta) : { #less; #equal; #greater } {
        if (a.id < b.id) { #less } else if (a.id > b.id) { #greater } else { #equal }
      }
    )
  };

  public query func getPhotoMeta(id : Nat) : async ?PhotoMeta {
    switch (photos.get(id)) {
      case null { null };
      case (?p) { ?toPhotoMeta(p) };
    }
  };

  /// Factory-only: keep canister owner in sync with factory user mapping (upload auth).
  public shared(msg) func syncOwner(newOwner : Principal) : async Text {
    // Mainnet factory principal (also accept stored factoryId after bootstrap).
    let factoryPrincipal = Principal.fromText("xfwx3-7yaaa-aaaas-qgxpq-cai");
    let allowed =
      isFactory(msg.caller) or Principal.equal(msg.caller, factoryPrincipal);
    if (not allowed) {
      return "Only factory can sync owner";
    };
    if (Principal.isAnonymous(newOwner)) {
      return "Invalid owner";
    };
    if (factoryId == null) {
      factoryId := ?factoryPrincipal;
    };
    owner := newOwner;
    "Owner synced to " # Principal.toText(newOwner)
  };

  private func clearPendingUpload() {
    pendingUploadEntries := null;
  };

  /// Owner-only: upload compressed WebP only (≤1.5 MB). Chunked path for edge cases.
  public shared(msg) func uploadPhoto(contentType : Text, data : Blob) : async UploadPhotoResult {
    if (not isOwner(msg.caller)) {
      return #err(
        "Only the site owner (Internet Identity) can upload photos. Caller "
          # Principal.toText(msg.caller)
          # " is not owner "
          # Principal.toText(owner)
          # ". If this is your site, open My Site → Domain & DNS → Upgrade site software, or contact ops to sync owner."
      );
    };
    if (photos.size() >= MAX_PHOTOS) {
      return #err(
        "Photo limit reached: you already have "
          # Nat.toText(photos.size())
          # " of "
          # Nat.toText(MAX_PHOTOS)
          # " photos. Delete one before uploading another."
      );
    };
    let sz = data.size();
    if (sz == 0) {
      return #err("Empty file. Choose an image to upload.");
    };
    if (sz > MAX_PHOTO_BYTES) {
      return #err(
        "WebP too large after compression ("
          # Nat.toText(sz)
          # " bytes). Maximum is 1.5 MB. Resize/compress further and retry."
      );
    };
    let resolvedType = switch (resolveUploadContentType(contentType, data)) {
      case null {
        return #err(
          "Only WebP is accepted (got \""
            # contentType
            # "\"). Compress to WebP in the browser before upload."
        );
      };
      case (?t) { t };
    };
    let id = nextPhotoId;
    nextPhotoId += 1;
    let stored : StoredPhoto = {
      id;
      contentType = resolvedType;
      data;
      uploadedAt = Time.now();
    };
    photos.put(id, stored);
    try { await requestFactoryCheckAndTopUp() } catch (_) {};
    #ok(toPhotoMeta(stored))
  };

  /// Owner-only: start a chunked upload (total ≤ 1.5 MB WebP).
  public shared(msg) func beginChunkedUpload(
    contentType : Text,
    totalSize : Nat,
    chunkCount : Nat
  ) : async ChunkedBeginResult {
    if (not isOwner(msg.caller)) {
      return #err("Only the site owner can upload photos.");
    };
    if (photos.size() >= MAX_PHOTOS) {
      return #err("Photo limit reached (10/10). Delete one first.");
    };
    if (not isAllowedImageType(contentType)) {
      return #err("Only image/webp is accepted for chunked upload.");
    };
    if (totalSize == 0 or totalSize > MAX_PHOTO_BYTES) {
      return #err(
        "totalSize must be 1.."
          # Nat.toText(MAX_PHOTO_BYTES)
          # " bytes (max 1.5 MB WebP)."
      );
    };
    if (chunkCount == 0 or chunkCount > MAX_CHUNKS) {
      return #err(
        "chunkCount must be 1.." # Nat.toText(MAX_CHUNKS)
      );
    };
    // Rough check: chunkCount * max chunk must cover totalSize
    if (chunkCount * MAX_CHUNK_BYTES < totalSize) {
      return #err("chunkCount too small for totalSize with 500KB chunks.");
    };
    let uid = nextUploadId;
    nextUploadId += 1;
    pendingUploadEntries := ?{
      id = uid;
      contentType;
      totalSize;
      chunkCount;
      chunks = [];
      receivedBytes = 0;
      createdAt = Time.now();
    };
    #ok({
      uploadId = uid;
      maxChunkBytes = MAX_CHUNK_BYTES;
      maxPhotoBytes = MAX_PHOTO_BYTES;
    })
  };

  /// Owner-only: append one chunk (index 0..chunkCount-1). Missing/corrupt chunks fail finalize.
  public shared(msg) func uploadPhotoChunk(
    uploadId : Nat,
    index : Nat,
    data : Blob
  ) : async Text {
    if (not isOwner(msg.caller)) {
      return "Only the site owner can upload photos.";
    };
    switch (pendingUploadEntries) {
      case null { return "No pending upload. Call beginChunkedUpload first." };
      case (?p) {
        if (p.id != uploadId) {
          return "Unknown uploadId (stale). Begin a new chunked upload.";
        };
        if (index >= p.chunkCount) {
          clearPendingUpload();
          return "Chunk index out of range — upload aborted.";
        };
        let sz = data.size();
        if (sz == 0 or sz > MAX_CHUNK_BYTES) {
          return "Chunk size must be 1.." # Nat.toText(MAX_CHUNK_BYTES) # " bytes.";
        };
        // Reject duplicate index by replacing; recompute receivedBytes from map
        var chunks = Buffer.Buffer<(Nat, Blob)>(p.chunks.size() + 1);
        var replaced = false;
        for ((i, b) in p.chunks.vals()) {
          if (i == index) {
            chunks.add((index, data));
            replaced := true;
          } else {
            chunks.add((i, b));
          };
        };
        if (not replaced) { chunks.add((index, data)) };
        var total : Nat = 0;
        for ((_, b) in chunks.vals()) { total += b.size() };
        if (total > p.totalSize) {
          clearPendingUpload();
          return "Chunks exceed declared totalSize — upload aborted.";
        };
        pendingUploadEntries := ?{
          id = p.id;
          contentType = p.contentType;
          totalSize = p.totalSize;
          chunkCount = p.chunkCount;
          chunks = Buffer.toArray(chunks);
          receivedBytes = total;
          createdAt = p.createdAt;
        };
        "Chunk " # Nat.toText(index) # " stored (" # Nat.toText(sz) # " bytes)"
      };
    }
  };

  public query func getChunkedUploadStatus() : async ?ChunkedStatus {
    switch (pendingUploadEntries) {
      case null { null };
      case (?p) {
        var present = HashMap.HashMap<Nat, Bool>(p.chunkCount, Nat.equal, natHash);
        for ((i, _) in p.chunks.vals()) { present.put(i, true) };
        let missing = Buffer.Buffer<Nat>(0);
        var i : Nat = 0;
        while (i < p.chunkCount) {
          if (present.get(i) == null) { missing.add(i) };
          i += 1;
        };
        ?{
          uploadId = p.id;
          contentType = p.contentType;
          totalSize = p.totalSize;
          chunkCount = p.chunkCount;
          receivedChunks = p.chunks.size();
          receivedBytes = p.receivedBytes;
          missingIndices = Buffer.toArray(missing);
        }
      };
    }
  };

  /// Owner-only: reassemble chunks; fail closed if any missing or size mismatch / bad type.
  public shared(msg) func finalizeChunkedUpload(uploadId : Nat) : async UploadPhotoResult {
    if (not isOwner(msg.caller)) {
      return #err("Only the site owner can upload photos.");
    };
    if (photos.size() >= MAX_PHOTOS) {
      clearPendingUpload();
      return #err("Photo limit reached — upload aborted.");
    };
    switch (pendingUploadEntries) {
      case null { return #err("No pending upload.") };
      case (?p) {
        if (p.id != uploadId) {
          return #err("Unknown uploadId.");
        };
        var byIndex = HashMap.HashMap<Nat, Blob>(p.chunkCount, Nat.equal, natHash);
        for ((i, b) in p.chunks.vals()) { byIndex.put(i, b) };
        var missing = false;
        var i : Nat = 0;
        let parts = Buffer.Buffer<Blob>(p.chunkCount);
        while (i < p.chunkCount) {
          switch (byIndex.get(i)) {
            case null { missing := true };
            case (?b) { parts.add(b) };
          };
          i += 1;
        };
        if (missing) {
          // Keep pending so client can re-send missing chunks
          return #err(
            "Missing chunks — re-upload missing indices, then finalize again. Call getChunkedUploadStatus."
          );
        };
        // Concatenate
        var total : Nat = 0;
        for (b in parts.vals()) { total += b.size() };
        if (total != p.totalSize) {
          clearPendingUpload();
          return #err(
            "Size mismatch after reassembly: got "
              # Nat.toText(total)
              # ", declared "
              # Nat.toText(p.totalSize)
              # ". Upload aborted."
          );
        };
        if (total > MAX_PHOTO_BYTES) {
          clearPendingUpload();
          return #err("Reassembled WebP exceeds 1.5 MB — aborted.");
        };
        // Build final blob
        let out = Buffer.Buffer<Nat8>(total);
        for (b in parts.vals()) {
          for (byte in Blob.toArray(b).vals()) { out.add(byte) };
        };
        let data = Blob.fromArray(Buffer.toArray(out));
        let resolvedType = switch (resolveUploadContentType(p.contentType, data)) {
          case null {
            clearPendingUpload();
            return #err("Only WebP is accepted after reassembly. Upload aborted.");
          };
          case (?t) { t };
        };
        let id = nextPhotoId;
        nextPhotoId += 1;
        let stored : StoredPhoto = {
          id;
          contentType = resolvedType;
          data;
          uploadedAt = Time.now();
        };
        photos.put(id, stored);
        clearPendingUpload();
        try { await requestFactoryCheckAndTopUp() } catch (_) {};
        #ok(toPhotoMeta(stored))
      };
    }
  };

  /// Owner-only: discard in-progress chunked upload (rollback).
  public shared(msg) func abortChunkedUpload() : async Text {
    if (not isOwner(msg.caller)) {
      return "Only the site owner can abort uploads.";
    };
    clearPendingUpload();
    "Chunked upload aborted; no photo stored."
  };

  /// Owner-only: delete a photo by id. Frees a slot.
  public shared(msg) func deletePhoto(id : Nat) : async Text {
    if (not isOwner(msg.caller)) {
      return "Only the site owner (Internet Identity) can delete photos.";
    };
    switch (photos.get(id)) {
      case null { "Photo not found" };
      case (?_) {
        photos.delete(id);
        // Clear profile/settings links that pointed at this photo
        let url = photoPublicUrl(id);
        if (profile.avatarURL == url) {
          profile := {
            username = profile.username;
            bio = profile.bio;
            avatarURL = "";
          };
        };
        switch (settings.get("bannerURL")) {
          case (?b) {
            if (b == url) { settings.put("bannerURL", "") };
          };
          case null {};
        };
        "Deleted photo " # Nat.toText(id)
      };
    }
  };

  /// Owner-only: set profile avatarURL to this photo’s public link (bytes stay here).
  public shared(msg) func usePhotoAsAvatar(id : Nat) : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    switch (photos.get(id)) {
      case null { "Photo not found" };
      case (?_) {
        let url = photoPublicUrl(id);
        profile := {
          username = profile.username;
          bio = profile.bio;
          avatarURL = url;
        };
        settings.put("avatarPhotoId", Nat.toText(id));
        "Avatar set to " # url
      };
    }
  };

  /// Owner-only: set banner URL setting to this photo’s public link.
  public shared(msg) func usePhotoAsBanner(id : Nat) : async Text {
    if (not isOwner(msg.caller)) { return "Only owner" };
    switch (photos.get(id)) {
      case null { "Photo not found" };
      case (?_) {
        let url = photoPublicUrl(id);
        settings.put("bannerURL", url);
        settings.put("bannerPhotoId", Nat.toText(id));
        "Banner set to " # url
      };
    }
  };

  public query func getBannerURL() : async Text {
    switch (settings.get("bannerURL")) {
      case (?u) { u };
      case null { "" };
    }
  };

  /// Serve photos over HTTP (public read). Method GET /photos/{id}.
  public query func http_request(req : HttpRequest) : async HttpResponse {
    let method = Text.map(
      req.method,
      func(c : Char) : Char {
        let n = Char.toNat32(c);
        if (n >= 97 and n <= 122) { Char.fromNat32(n - 32) } else { c }
      }
    );
    if (method != "GET" and method != "HEAD") {
      return {
        status_code = 405;
        headers = [("content-type", "text/plain; charset=utf-8"), ("allow", "GET, HEAD")];
        body = Text.encodeUtf8("Method not allowed");
        streaming_strategy = null;
        upgrade = null;
      };
    };
    switch (parsePhotoIdFromUrl(req.url)) {
      case null {
        // Simple root info
        if (req.url == "/" or req.url == "" or Text.startsWith(req.url, #text "/?")) {
          return {
            status_code = 200;
            headers = [("content-type", "text/plain; charset=utf-8")];
            body = Text.encodeUtf8(
              "ICE user site canister. Photos: GET /photos/{id} · max "
                # Nat.toText(MAX_PHOTOS)
                # " × 1 MB."
            );
            streaming_strategy = null;
            upgrade = null;
          };
        };
        {
          status_code = 404;
          headers = [("content-type", "text/plain; charset=utf-8")];
          body = Text.encodeUtf8("Not found. Use GET /photos/{id}");
          streaming_strategy = null;
          upgrade = null;
        }
      };
      case (?id) {
        switch (photos.get(id)) {
          case null {
            {
              status_code = 404;
              headers = [("content-type", "text/plain; charset=utf-8")];
              body = Text.encodeUtf8("Photo not found");
              streaming_strategy = null;
              upgrade = null;
            }
          };
          case (?p) {
            let body = if (method == "HEAD") { Blob.fromArray([]) } else { p.data };
            {
              status_code = 200;
              headers = [
                ("content-type", p.contentType),
                ("cache-control", "public, max-age=3600"),
                ("access-control-allow-origin", "*"),
                ("x-content-type-options", "nosniff"),
              ];
              body;
              streaming_strategy = null;
              upgrade = null;
            }
          };
        }
      };
    }
  };

  // ---------- cycles ----------

  private func cyclesGaugeInternal() : CyclesGauge {
    let bal = ExperimentalCycles.balance();
    let low = bal < LOW_CYCLES_THRESHOLD;
    {
      balance = bal;
      lastCheck = lastCyclesCheck;
      estimatedDaysLeft = if (bal > 0) { bal / 1_000_000_000 } else { 0 };
      lowCycles = low;
      warning = if (low) {
        ?"Low cycles (under 2 T) — top up from My Site before the canister freezes."
      } else { null };
    }
  };

  public query func getCyclesGauge() : async CyclesGauge {
    cyclesGaugeInternal()
  };

  public query func isLowCycles() : async Bool {
    ExperimentalCycles.balance() < LOW_CYCLES_THRESHOLD
  };

  public shared(msg) func recordCyclesSnapshot() : async () {
    if (not isOwner(msg.caller)) { return };
    lastCyclesCheck := Time.now();
    cyclesAtCheck := ExperimentalCycles.balance();
    ignore cyclesAtCheck;
  };

  /// Claim ownership only when unset/anonymous (not a free-for-all takeover).
  public shared(msg) func acceptOwnership() : async Text {
    if (isOwner(msg.caller)) {
      "Already owner"
    } else if (Principal.isAnonymous(owner) or Principal.equal(owner, Principal.fromText("aaaaa-aa"))) {
      owner := msg.caller;
      "Ownership accepted"
    } else {
      "Owner already set — only factory can reassign via syncOwner"
    }
  };
};
