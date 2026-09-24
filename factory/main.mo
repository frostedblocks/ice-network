import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Blob "mo:base/Blob";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat8";
import Nat32 "mo:base/Nat32";
import Nat64 "mo:base/Nat64";
import Char "mo:base/Char";
import Text "mo:base/Text";
import Buffer "mo:base/Buffer";
import Array "mo:base/Array";
import Iter "mo:base/Iter";
import ExperimentalCycles "mo:base/ExperimentalCycles";
import Error "mo:base/Error";
import Time "mo:base/Time";
import Int "mo:base/Int";

/// Master Factory — provision user_site canisters, detach/relink, cycles top-up.
/// https://github.com/frostedblocks/ice-network
persistent actor class Factory() = this {

  type CanisterId = Principal;

  type CanisterSettings = {
    controllers : ?[Principal];
    compute_allocation : ?Nat;
    memory_allocation : ?Nat;
    freezing_threshold : ?Nat;
    reserved_cycles_limit : ?Nat;
    log_visibility : ?{ #controllers; #public_ };
    wasm_memory_limit : ?Nat;
  };

  type CreateCanisterArgs = {
    settings : ?CanisterSettings;
    sender_canister_version : ?Nat64;
  };

  type CreateCanisterResult = {
    canister_id : CanisterId;
  };

  type InstallMode = {
    #install;
    #reinstall;
    #upgrade : ?{
      skip_pre_upgrade : ?Bool;
      wasm_memory_persistence : ?{ #keep; #replace };
    };
  };

  type InstallCodeArgs = {
    mode : InstallMode;
    canister_id : CanisterId;
    wasm_module : Blob;
    arg : Blob;
    sender_canister_version : ?Nat64;
  };

  type UpdateSettingsArgs = {
    canister_id : CanisterId;
    settings : CanisterSettings;
    sender_canister_version : ?Nat64;
  };

  type DepositCyclesArgs = {
    canister_id : CanisterId;
  };

  type IC = actor {
    create_canister : shared CreateCanisterArgs -> async CreateCanisterResult;
    install_code : shared InstallCodeArgs -> async ();
    update_settings : shared UpdateSettingsArgs -> async ();
    deposit_cycles : shared DepositCyclesArgs -> async ();
  };

  type Account = { owner : Principal; subaccount : ?Blob };
  type TransferFromArgs = {
    spender_subaccount : ?Blob;
    from : Account;
    to : Account;
    amount : Nat;
    fee : ?Nat;
    memo : ?Blob;
    created_at_time : ?Nat64;
  };
  type TransferFromError = {
    #BadFee : { expected_fee : Nat };
    #BadBurn : { min_burn_amount : Nat };
    #InsufficientFunds : { balance : Nat };
    #InsufficientAllowance : { allowance : Nat };
    #TooOld;
    #CreatedInFuture : { ledger_time : Nat64 };
    #Duplicate : { duplicate_of : Nat };
    #TemporarilyUnavailable;
    #GenericError : { error_code : Nat; message : Text };
  };
  type TransferFromResult = { #Ok : Nat; #Err : TransferFromError };

  type TransferArgs = {
    from_subaccount : ?Blob;
    to : Account;
    amount : Nat;
    fee : ?Nat;
    memo : ?Blob;
    created_at_time : ?Nat64;
  };
  type TransferError = {
    #BadFee : { expected_fee : Nat };
    #BadBurn : { min_burn_amount : Nat };
    #InsufficientFunds : { balance : Nat };
    #TooOld;
    #CreatedInFuture : { ledger_time : Nat64 };
    #Duplicate : { duplicate_of : Nat };
    #TemporarilyUnavailable;
    #GenericError : { error_code : Nat; message : Text };
  };
  type TransferResult = { #Ok : Nat; #Err : TransferError };

  /// Stable shape — keep transfer_from only for upgrade compat.
  let IcpLedger = actor "ryjl3-tyaaa-aaaaa-aaaba-cai" : actor {
    icrc2_transfer_from : shared (TransferFromArgs) -> async TransferFromResult;
  };

  private transient let IcpLedgerExt = actor "ryjl3-tyaaa-aaaaa-aaaba-cai" : actor {
    icrc1_balance_of : shared query (Account) -> async Nat;
    icrc1_transfer : shared (TransferArgs) -> async TransferResult;
  };

  private let ICP_TRANSFER_FEE_E8S : Nat = 10_000;
  /// Auto-convert this much ICP → factory cycles on every mint (from factory ICP balance).
  private let ICP_PER_MINT_TO_CYCLES_E8S : Nat = 270_000_000; // 2.7 ICP
  private let CMC_PRINCIPAL : Principal = Principal.fromText("rkp4c-7iaaa-aaaaa-aaaca-cai");

  private func userDepositSubaccount(user : Principal) : Blob {
    let pbytes = Blob.toArray(Principal.toBlob(user));
    let out = Array.init<Nat8>(32, 0);
    let n = pbytes.size();
    let len = if (n > 31) { 31 } else { n };
    out[0] := Nat8.fromNat(len);
    var i = 0;
    while (i < len) {
      out[i + 1] := pbytes[i];
      i += 1;
    };
    Blob.fromArray(Array.freeze(out))
  };

  private func hexByte(b : Nat8) : Text {
    let hex = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
    let n = Nat8.toNat(b);
    hex[n / 16] # hex[n % 16]
  };

  private func blobToHex(b : Blob) : Text {
    var s = "";
    for (byte in Blob.toArray(b).vals()) {
      s #= hexByte(byte);
    };
    s
  };

  /// Claim fee from NNS deposit on factory (user sent ICP to factory subaccount).
  private func claimNnsDeposit(user : Principal, amountE8s : Nat) : async ?Text {
    if (amountE8s == 0) { return null };
    let sub = userDepositSubaccount(user);
    let need = amountE8s + ICP_TRANSFER_FEE_E8S;
    let bal = await IcpLedgerExt.icrc1_balance_of({
      owner = Principal.fromActor(this);
      subaccount = ?sub;
    });
    if (bal < need) {
      return ?(
        "NNS fee not received yet. Send "
          # Nat.toText(need)
          # " e8s ICP (fee + 0.0001 ledger) from NNS to the factory deposit account for your principal."
      );
    };
    let tr = await IcpLedgerExt.icrc1_transfer({
      from_subaccount = ?sub;
      to = { owner = Principal.fromActor(this); subaccount = null };
      amount = amountE8s;
      fee = ?ICP_TRANSFER_FEE_E8S;
      memo = null;
      created_at_time = null;
    });
    switch (tr) {
      case (#Ok _) {
        totalIcpReceivedE8s += amountE8s;
        null
      };
      case (#Err _) { ?"Deposit claim failed. Wait and retry, or send a bit more ICP." };
    }
  };

  public query func getNnsDepositInfo(user : Principal) : async {
    owner : Principal;
    subaccountHex : Text;
    note : Text;
  } {
    {
      owner = Principal.fromActor(this);
      subaccountHex = blobToHex(userDepositSubaccount(user));
      note = "Pay detach/relink fees from NNS to this owner + subaccount.";
    }
  };

  public shared func fetchNnsDepositBalance(user : Principal) : async Nat {
    await IcpLedgerExt.icrc1_balance_of({
      owner = Principal.fromActor(this);
      subaccount = ?userDepositSubaccount(user);
    })
  };

  public type CreateUserSiteResult = {
    #ok : Principal;
    #err : Text;
  };

  public type OpResult = {
    #ok : Text;
    #err : Text;
  };

  /// Keep legacy stable principals (upgrade compat — do not remove).
  private let DFX_CONTROLLER : Principal = Principal.fromText(
    "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe"
  );
  private let NNS_CONTROLLER : Principal = Principal.fromText(
    "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"
  );

  /// Stable management interface — keep shape compatible with previous deploy.
  private let IC_MANAGEMENT : actor {
    create_canister : shared CreateCanisterArgs -> async CreateCanisterResult;
    install_code : shared InstallCodeArgs -> async ();
    update_settings : shared UpdateSettingsArgs -> async ();
  } = actor ("aaaaa-aa");

  /// deposit_cycles is a separate transient ref (avoid stable interface break).
  private transient let IC_DEPOSIT : actor {
    deposit_cycles : shared DepositCyclesArgs -> async ();
  } = actor ("aaaaa-aa");

  // ---------- HTTP outcalls (domain validation) ----------
  type HttpHeader = { name : Text; value : Text };
  type HttpMethod = { #get; #post; #head };
  type HttpResponsePayload = {
    status : Nat;
    headers : [HttpHeader];
    body : Blob;
  };
  type TransformArgs = {
    response : HttpResponsePayload;
    context : Blob;
  };
  type TransformContext = {
    function : shared query (TransformArgs) -> async HttpResponsePayload;
    context : Blob;
  };
  type HttpRequestArgs = {
    url : Text;
    max_response_bytes : ?Nat64;
    headers : [HttpHeader];
    body : ?Blob;
    method : HttpMethod;
    transform : ?TransformContext;
  };
  private transient let IC_HTTP : actor {
    http_request : shared HttpRequestArgs -> async HttpResponsePayload;
  } = actor ("aaaaa-aa");

  /// Cycles attached per domain-validation outcall (fail closed if insufficient).
  private let HTTP_OUTCALL_CYCLES : Nat = 100_000_000_000; // 0.1 T
  private let FACTORY_MIN_RESERVE_CYCLES : Nat = 3_000_000_000_000; // never drain factory
  private let AUTO_TOPUP_THRESHOLD : Nat = 2_000_000_000_000; // match site low
  private let AUTO_TOPUP_DEPOSIT : Nat = 1_000_000_000_000; // 1 T per auto top-up
  private let AUTO_TOPUP_MAX_PER_DAY : Nat = 3;
  private let DAY_NS : Int = 24 * 60 * 60 * 1_000_000_000;

  /// canister_status for controller checks (not part of stable IC_MANAGEMENT type).
  type DefiniteCanisterSettings = {
    controllers : [Principal];
    compute_allocation : Nat;
    memory_allocation : Nat;
    freezing_threshold : Nat;
    reserved_cycles_limit : Nat;
    log_visibility : { #controllers; #public_ };
    wasm_memory_limit : Nat;
  };
  type CanisterStatusResult = {
    status : { #running; #stopping; #stopped };
    settings : DefiniteCanisterSettings;
    module_hash : ?Blob;
    memory_size : Nat;
    cycles : Nat;
    reserved_cycles : Nat;
    idle_cycles_burned_per_day : Nat;
  };
  private transient let IC_STATUS : actor {
    canister_status : shared ({ canister_id : Principal }) -> async CanisterStatusResult;
  } = actor ("aaaaa-aa");

  /// Stable actor type must stay compatible with previous deploy (isRegistered/isOwner only).
  private let ICE_MAIN : actor {
    isRegistered : shared query Principal -> async Bool;
    isOwner : shared query Principal -> async Bool;
  } = actor ("6jf55-2qaaa-aaaan-q6mwq-cai");

  /// Extended ICE interface for profile seed (not stored stable).
  private transient let ICE_PROFILE : actor {
    getProfile : shared query Principal -> async ?{
      username : Text;
      bio : Text;
      avatarURL : Text;
    };
  } = actor ("6jf55-2qaaa-aaaan-q6mwq-cai");

  /// Fee-at-mint: waive site mint fee (masters / referral unlock).
  private transient let ICE_MINT_FEE : actor {
    isMintFeeWaived : shared query Principal -> async Bool;
  } = actor ("6jf55-2qaaa-aaaan-q6mwq-cai");

  /// ICE social: mark author posts private after detach / public after reattach.
  private transient let ICE_NETWORK_PRIVACY : actor {
    setUserNetworkPrivate : shared (user : Principal, isPrivate : Bool) -> async Text;
  } = actor ("6jf55-2qaaa-aaaan-q6mwq-cai");

  type DomainStatus = {
    customDomain : Text;
    publicUrl : Text;
    dnsConfigured : Bool;
    readyForDetach : Bool;
    canisterId : Principal;
    domainConnectedAt : Int;
  };

  type UserSiteActor = actor {
    bootstrap : shared (
      factory : Principal,
      iceMain : Principal,
      username : Text,
      bio : Text,
      avatarURL : Text
    ) -> async Text;
    onDetach : shared () -> async Text;
    onRelink : shared (factory : Principal) -> async Text;
    getOwner : shared query () -> async Principal;
    setDomainConnection : shared (domain : Text, url : Text) -> async Text;
    confirmDnsConfigured : shared () -> async Text;
    getDomainStatus : shared query () -> async DomainStatus;
    isReadyToDetach : shared query () -> async Bool;
    isLowCycles : shared query () -> async Bool;
    /// Align canister owner with factory mapping (photo upload auth)
    syncOwner : shared (newOwner : Principal) -> async Text;
    getCyclesGauge : shared query () -> async {
      balance : Nat;
      lastCheck : Int;
      estimatedDaysLeft : Nat;
      lowCycles : Bool;
      warning : ?Text;
    };
  };

  /// Factory-side domain registry (enforces detach gate; synced to site when possible).
  type DomainRecord = {
    domain : Text;
    publicUrl : Text;
    dnsConfigured : Bool;
    connectedAt : Int;
  };

  /// Central mint Registry — only this Factory writes; used to gate reattach.
  type RegistryActor = actor {
    registerMint : shared (canisterId : Principal, siteOwner : Principal) -> async Text;
    markDetached : shared (canisterId : Principal) -> async Text;
    markRelinked : shared (canisterId : Principal, siteOwner : Principal) -> async Text;
    isFactoryMinted : shared query (canisterId : Principal) -> async Bool;
    isEligibleForReattach : shared query (canisterId : Principal) -> async Bool;
    logEmergencyReset : shared (canisterId : Principal, by : Principal) -> async Text;
  };

  /// Audit log for factory resets (user + emergency).
  public type ResetLogEntry = {
    site : Principal;
    siteOwner : Principal;
    triggeredBy : Principal;
    at : Int;
    kind : Text; // "user" | "emergency"
  };

  /// Half-finished mint (canister may exist without full factory index / Registry).
  /// stage: created | installed | bootstrapped | controllers | registry
  public type PendingMint = {
    site : Principal;
    intendedOwner : Principal;
    stage : Text;
    lastError : Text;
    createdAt : Int;
    updatedAt : Int;
  };

  // Mainnet create fee is taken from attached cycles; leave headroom on factory
  private let CREATE_FEE_CYCLES : Nat = 500_000_000_000;
  private let INITIAL_SITE_CYCLES : Nat = 500_000_000_000;
  private let MIN_FACTORY_BALANCE : Nat = CREATE_FEE_CYCLES + INITIAL_SITE_CYCLES + 100_000_000_000;

  // Default service fees (admin-adjustable)
  /// One charge: site mint = canister cycles + network maintain (fee-at-mint product rule).
  private stable var MINT_FEE_E8S : Nat = 1_000_000_000; // 10 ICP
  /// Share of mint fee converted to factory cycles via CMC (rest → DFX ops / network).
  private stable var MINT_CYCLES_SHARE_E8S : Nat = 270_000_000; // 2.7 ICP
  private stable var DETACH_FEE_E8S : Nat = 10_000_000; // 0.1 ICP
  private stable var RELINK_FEE_E8S : Nat = 10_000_000; // 0.1 ICP
  /// Custom domain connect fee (ICRC-2 from site owner II).
  private stable var DOMAIN_CONNECT_FEE_E8S : Nat = 100_000_000; // 1 ICP
  /// Claimant pays this when claiming a site transfer offer (0 = free).
  private stable var TRANSFER_FEE_E8S : Nat = 10_000_000; // 0.1 ICP
  /// ICP e8s charged per 1_000_000_000_000 cycles topped up (default: 0.5 ICP per 1T)
  private stable var TOPUP_ICP_E8S_PER_T : Nat = 50_000_000;
  private stable var totalIcpReceivedE8s : Nat = 0;

  /// One-time site transfer offers (owner → new II). Code shown once to creator.
  type TransferOffer = {
    code : Text;
    site : Principal;
    fromOwner : Principal;
    createdAt : Int;
    expiresAt : Int;
    claimed : Bool;
    claimedBy : ?Principal;
  };
  type TransferLogEntry = {
    site : Principal;
    fromOwner : Principal;
    toOwner : Principal;
    at : Int;
    kind : Text; // "claim" | "admin_force" | "cancel"
  };
  private let TRANSFER_OFFER_TTL_NS : Int = 48 * 60 * 60 * 1_000_000_000;
  private stable var transferOfferEntries : [(Principal, TransferOffer)] = [];
  private stable var transferLogEntries : [TransferLogEntry] = [];

  /// Long-lived site recovery codes (owner can regenerate). Not returned by public queries.
  private stable var recoveryCodeEntries : [(Principal, Text)] = []; // site -> code
  /// One-shot reveal after mint / regen (user -> code)
  private stable var pendingRecoveryRevealEntries : [(Principal, Text)] = [];

  /// User asked master for a recovery code after proving an II session.
  type RecoveryRequest = {
    site : Principal;
    requester : Principal;
    registeredOwner : ?Principal;
    at : Int;
    note : Text;
  };
  private stable var recoveryRequestEntries : [RecoveryRequest] = [];

  /// One-time principal migration: users claim site by canister id while window is open.
  private stable var principalMigrationOpen : Bool = false;
  private stable var migrationClaimedEntries : [(Principal, Principal)] = []; // site -> newOwner

  private stable var userSiteWasm : Blob = Blob.fromArray([]);
  private stable var userCanistersEntries : [(Principal, Principal)] = [];
  private stable var activeSubsEntries : [(Principal, Bool)] = [];
  /// site -> owner (kept after detach so relink can verify)
  private stable var siteOwnersEntries : [(Principal, Principal)] = [];
  /// owner -> last site even if detached
  private stable var lastSiteEntries : [(Principal, Principal)] = [];
  /// site -> domain/DNS (required before detach)
  private stable var siteDomainEntries : [(Principal, DomainRecord)] = [];
  /// site -> hostname already paid for via DOMAIN_CONNECT_FEE (re-charge if domain changes)
  private stable var domainPaidForEntries : [(Principal, Text)] = [];
  /// lowercase hostname -> site (public hosting lookup)
  private stable var domainIndexEntries : [(Text, Principal)] = [];
  private stable var owner : Principal = Principal.fromText("aaaaa-aa");
  /// Central Registry canister (aaaaa-aa until adminSetRegistry).
  private stable var registryId : Principal = Principal.fromText("aaaaa-aa");
  /// Factory-reset audit log (capped when read; oldest trimmed in memory).
  private stable var resetLogEntries : [ResetLogEntry] = [];
  private stable var pendingMintsEntries : [(Principal, PendingMint)] = [];
  /// site -> last successful *user* factory-reset timestamp (nanoseconds)
  private stable var lastUserResetEntries : [(Principal, Int)] = [];
  /// User self-reset cooldown: 24 hours
  private let USER_RESET_COOLDOWN_NS : Int = 24 * 60 * 60 * 1_000_000_000;

  /// Auto top-up prefs keyed by site owner principal.
  type AutoTopUpPref = {
    enabled : Bool;
    maxIcpE8sPerTopUp : Nat;
    maxTopUpsPerDay : Nat;
    topUpsToday : Nat;
    dayBucket : Int;
    lastTopUpAt : Int;
  };
  type CycleAlert = {
    site : Principal;
    owner : Principal;
    at : Int;
    balance : Nat;
    kind : Text;
    message : Text;
  };
  private stable var autoTopUpEntries : [(Principal, AutoTopUpPref)] = [];
  private stable var cycleAlertEntries : [CycleAlert] = [];
  private transient var autoTopUp = HashMap.HashMap<Principal, AutoTopUpPref>(0, Principal.equal, Principal.hash);

  /// ICE assets frontend — custom domains for public sites point here (SPA host routing).
  private let ASSETS_CANISTER_ID : Text = "6hhqv-baaaa-aaaan-q6mxq-cai";

  private transient var userCanisters = HashMap.HashMap<Principal, Principal>(0, Principal.equal, Principal.hash);
  private transient var activeSubs = HashMap.HashMap<Principal, Bool>(0, Principal.equal, Principal.hash);
  private transient var siteOwners = HashMap.HashMap<Principal, Principal>(0, Principal.equal, Principal.hash);
  private transient var lastSite = HashMap.HashMap<Principal, Principal>(0, Principal.equal, Principal.hash);
  private transient var siteDomains = HashMap.HashMap<Principal, DomainRecord>(0, Principal.equal, Principal.hash);
  private transient var domainPaidFor = HashMap.HashMap<Principal, Text>(0, Principal.equal, Principal.hash);
  private transient var domainIndex = HashMap.HashMap<Text, Principal>(0, Text.equal, Text.hash);
  private transient var pendingMints = HashMap.HashMap<Principal, PendingMint>(0, Principal.equal, Principal.hash);
  private transient var lastUserReset = HashMap.HashMap<Principal, Int>(0, Principal.equal, Principal.hash);
  private transient var wasmUploadBuf = Buffer.Buffer<Nat8>(0);
  /// site -> open/claimed transfer offer
  private transient var transferOffers = HashMap.HashMap<Principal, TransferOffer>(0, Principal.equal, Principal.hash);
  /// plaintext code -> site (for claim lookup)
  private transient var transferCodes = HashMap.HashMap<Text, Principal>(0, Text.equal, Text.hash);
  private transient var recoveryCodes = HashMap.HashMap<Principal, Text>(0, Principal.equal, Principal.hash);
  private transient var recoveryCodeIndex = HashMap.HashMap<Text, Principal>(0, Text.equal, Text.hash);
  private transient var pendingRecoveryReveal = HashMap.HashMap<Principal, Text>(0, Principal.equal, Principal.hash);
  private transient var migrationClaimed = HashMap.HashMap<Principal, Principal>(0, Principal.equal, Principal.hash);

  system func preupgrade() {
    userCanistersEntries := Iter.toArray(userCanisters.entries());
    activeSubsEntries := Iter.toArray(activeSubs.entries());
    siteOwnersEntries := Iter.toArray(siteOwners.entries());
    lastSiteEntries := Iter.toArray(lastSite.entries());
    siteDomainEntries := Iter.toArray(siteDomains.entries());
    domainPaidForEntries := Iter.toArray(domainPaidFor.entries());
    domainIndexEntries := Iter.toArray(domainIndex.entries());
    pendingMintsEntries := Iter.toArray(pendingMints.entries());
    lastUserResetEntries := Iter.toArray(lastUserReset.entries());
    autoTopUpEntries := Iter.toArray(autoTopUp.entries());
    transferOfferEntries := Iter.toArray(transferOffers.entries());
    recoveryCodeEntries := Iter.toArray(recoveryCodes.entries());
    pendingRecoveryRevealEntries := Iter.toArray(pendingRecoveryReveal.entries());
    migrationClaimedEntries := Iter.toArray(migrationClaimed.entries());
  };

  system func postupgrade() {
    userCanisters := HashMap.fromIter<Principal, Principal>(
      userCanistersEntries.vals(), userCanistersEntries.size(), Principal.equal, Principal.hash
    );
    activeSubs := HashMap.fromIter<Principal, Bool>(
      activeSubsEntries.vals(), activeSubsEntries.size(), Principal.equal, Principal.hash
    );
    siteOwners := HashMap.fromIter<Principal, Principal>(
      siteOwnersEntries.vals(), siteOwnersEntries.size(), Principal.equal, Principal.hash
    );
    lastSite := HashMap.fromIter<Principal, Principal>(
      lastSiteEntries.vals(), lastSiteEntries.size(), Principal.equal, Principal.hash
    );
    domainPaidFor := HashMap.fromIter<Principal, Text>(
      domainPaidForEntries.vals(), domainPaidForEntries.size(), Principal.equal, Principal.hash
    );
    domainPaidForEntries := [];
    siteDomains := HashMap.fromIter<Principal, DomainRecord>(
      siteDomainEntries.vals(), siteDomainEntries.size(), Principal.equal, Principal.hash
    );
    domainIndex := HashMap.fromIter<Text, Principal>(
      domainIndexEntries.vals(), domainIndexEntries.size(), Text.equal, Text.hash
    );
    pendingMints := HashMap.fromIter<Principal, PendingMint>(
      pendingMintsEntries.vals(), pendingMintsEntries.size(), Principal.equal, Principal.hash
    );
    pendingMintsEntries := [];
    lastUserReset := HashMap.fromIter<Principal, Int>(
      lastUserResetEntries.vals(), lastUserResetEntries.size(), Principal.equal, Principal.hash
    );
    lastUserResetEntries := [];
    autoTopUp := HashMap.fromIter<Principal, AutoTopUpPref>(
      autoTopUpEntries.vals(), autoTopUpEntries.size(), Principal.equal, Principal.hash
    );
    autoTopUpEntries := [];
    transferOffers := HashMap.fromIter<Principal, TransferOffer>(
      transferOfferEntries.vals(), transferOfferEntries.size(), Principal.equal, Principal.hash
    );
    transferCodes := HashMap.HashMap<Text, Principal>(0, Text.equal, Text.hash);
    for ((site, off) in transferOffers.entries()) {
      if (not off.claimed and Text.size(off.code) > 0) {
        transferCodes.put(off.code, site);
      };
    };
    transferOfferEntries := [];
    recoveryCodes := HashMap.fromIter<Principal, Text>(
      recoveryCodeEntries.vals(), recoveryCodeEntries.size(), Principal.equal, Principal.hash
    );
    recoveryCodeIndex := HashMap.HashMap<Text, Principal>(0, Text.equal, Text.hash);
    for ((site, code) in recoveryCodes.entries()) {
      if (Text.size(code) > 0) { recoveryCodeIndex.put(code, site) };
    };
    recoveryCodeEntries := [];
    pendingRecoveryReveal := HashMap.fromIter<Principal, Text>(
      pendingRecoveryRevealEntries.vals(),
      pendingRecoveryRevealEntries.size(),
      Principal.equal,
      Principal.hash
    );
    pendingRecoveryRevealEntries := [];
    migrationClaimed := HashMap.fromIter<Principal, Principal>(
      migrationClaimedEntries.vals(),
      migrationClaimedEntries.size(),
      Principal.equal,
      Principal.hash
    );
    migrationClaimedEntries := [];
    // Rebuild domain index from siteDomains if empty after first upgrade with this feature
    if (domainIndex.size() == 0 and siteDomains.size() > 0) {
      for ((site, rec) in siteDomains.entries()) {
        if (Text.size(rec.domain) > 0) {
          domainIndex.put(toLowerAscii(rec.domain), site);
        };
      };
    };
    userCanistersEntries := [];
    activeSubsEntries := [];
    siteOwnersEntries := [];
    lastSiteEntries := [];
    siteDomainEntries := [];
    domainIndexEntries := [];
  };

  private func toLowerAscii(t : Text) : Text {
    Text.map(
      t,
      func(c : Char) : Char {
        let n = Char.toNat32(c);
        if (n >= 65 and n <= 90) { Char.fromNat32(n + 32) } else { c }
      }
    )
  };

  private func normalizeHostname(raw : Text) : Text {
    var d = toLowerAscii(raw);
    if (Text.startsWith(d, #text "https://")) {
      d := Text.replace(d, #text "https://", "");
    } else if (Text.startsWith(d, #text "http://")) {
      d := Text.replace(d, #text "http://", "");
    };
    // strip trailing slash / path
    if (Text.contains(d, #text "/")) {
      let chars = Text.toArray(d);
      var out = "";
      label scan for (c in chars.vals()) {
        if (c == '/') { break scan };
        out #= Text.fromChar(c);
      };
      d := out;
    };
    // strip trailing dot
    if (Text.endsWith(d, #text ".")) {
      let chars = Text.toArray(d);
      var out = "";
      var i = 0;
      let last = if (chars.size() > 0) { chars.size() - 1 } else { 0 };
      while (i < last) {
        out #= Text.fromChar(chars[i]);
        i += 1;
      };
      d := out;
    };
    d
  };

  private func isOwner(p : Principal) : Bool {
    Principal.equal(p, owner) and not Principal.equal(owner, Principal.fromText("aaaaa-aa"))
  };

  private func hexNibble(c : Char) : ?Nat8 {
    let n = Nat32.toNat(Char.toNat32(c));
    if (n >= 48 and n <= 57) { ?Nat8.fromNat(n - 48) }
    else if (n >= 97 and n <= 102) { ?Nat8.fromNat(n - 87) }
    else if (n >= 65 and n <= 70) { ?Nat8.fromNat(n - 55) }
    else { null }
  };

  private func decodeHex(hex : Text) : ?Blob {
    let chars = Text.toArray(hex);
    let len = chars.size();
    if (len % 2 != 0) { return null };
    let out = Buffer.Buffer<Nat8>(len / 2);
    var i = 0;
    while (i < len) {
      switch (hexNibble(chars[i]), hexNibble(chars[i + 1])) {
        case (?hi, ?lo) { out.add(hi * 16 + lo) };
        case _ { return null };
      };
      i += 2;
    };
    ?Blob.fromArray(Buffer.toArray(out))
  };

  /// CMC notify_top_up result type (matches live CMC candid).
  type NotifyTopUpResult = {
    #Ok : Nat;
    #Err : {
      #Refunded : { reason : Text; block_index : ?Nat64 };
      #InvalidTransaction : Text;
      #Processing;
      #TransactionTooOld : Nat64;
      #Other : { error_code : Nat64; error_message : Text };
    };
  };

  private transient let CMC : actor {
    notify_top_up : shared ({ block_index : Nat64; canister_id : Principal }) -> async NotifyTopUpResult;
  } = actor ("rkp4c-7iaaa-aaaaa-aaaca-cai");

  /// ICRC-1 memo required by CMC for notify_top_up (ASCII "TPUP" as LE u64).
  private let CMC_TOP_UP_MEMO : Blob = Blob.fromArray([0x54, 0x50, 0x55, 0x50, 0, 0, 0, 0]);

  /// Convert factory-held ICP into cycles on this factory via CMC (best-effort).
  private func convertIcpToFactoryCycles(amountE8s : Nat) : async Text {
    if (amountE8s == 0) { return "Skip: zero amount" };
    let factoryId = Principal.fromActor(this);
    let bal = await IcpLedgerExt.icrc1_balance_of({
      owner = factoryId;
      subaccount = null;
    });
    let need = amountE8s + ICP_TRANSFER_FEE_E8S;
    if (bal < need) {
      return (
        "Skip ICP→cycles: factory has "
          # Nat.toText(bal)
          # " e8s ICP, need "
          # Nat.toText(need)
          # " (2.7 ICP + ledger fee). Mint continues if cycles already OK."
      );
    };
    let tr = await IcpLedgerExt.icrc1_transfer({
      from_subaccount = null;
      to = {
        owner = CMC_PRINCIPAL;
        subaccount = ?userDepositSubaccount(factoryId);
      };
      amount = amountE8s;
      fee = ?ICP_TRANSFER_FEE_E8S;
      memo = ?CMC_TOP_UP_MEMO;
      created_at_time = null;
    });
    switch (tr) {
      case (#Err _) {
        "ICP transfer to CMC failed — mint continues if cycles OK"
      };
      case (#Ok blockIndex) {
        try {
          let res = await CMC.notify_top_up({
            block_index = Nat64.fromNat(blockIndex);
            canister_id = factoryId;
          });
          switch (res) {
            case (#Ok cyclesGot) {
              "Converted "
                # Nat.toText(amountE8s)
                # " e8s ICP → "
                # Nat.toText(cyclesGot)
                # " cycles on factory"
            };
            case (#Err e) {
              switch (e) {
                case (#InvalidTransaction t) { "CMC reject: " # t };
                case (#Refunded r) { "CMC refunded: " # r.reason };
                case (#Processing) { "CMC processing — retry mint later if cycles low" };
                case (#TransactionTooOld _) { "CMC: transaction too old" };
                case (#Other o) { "CMC: " # o.error_message };
              }
            };
          }
        } catch (err) {
          "CMC notify_top_up trap: " # Error.message(err)
        }
      };
    }
  };

  /// Ops: convert N e8s ICP on factory into factory cycles (default 2.7 ICP).
  public shared(msg) func adminConvertIcpToCycles(amountE8s : Nat) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    let amt = if (amountE8s == 0) { ICP_PER_MINT_TO_CYCLES_E8S } else { amountE8s };
    await convertIcpToFactoryCycles(amt)
  };

  public shared func getFactoryIcpBalanceE8s() : async Nat {
    await IcpLedgerExt.icrc1_balance_of({
      owner = Principal.fromActor(this);
      subaccount = null;
    })
  };


  /// After mint fee lands on factory: convert cycles share via CMC; surplus to DFX ops.
  private func distributeMintFeeProceeds(feeE8s : Nat) : async Text {
    if (feeE8s == 0) { return "No mint fee" };
    let mintShare = if (feeE8s >= MINT_CYCLES_SHARE_E8S) { MINT_CYCLES_SHARE_E8S } else { feeE8s };
    let rest = if (feeE8s > mintShare) { feeE8s - mintShare } else { 0 };
    var note = "";
    if (mintShare > 0) {
      note #= (await convertIcpToFactoryCycles(mintShare)) # " ";
    };
    if (rest > ICP_TRANSFER_FEE_E8S) {
      let toDfx = rest - ICP_TRANSFER_FEE_E8S;
      let tr2 = await IcpLedgerExt.icrc1_transfer({
        from_subaccount = null;
        to = { owner = DFX_CONTROLLER; subaccount = null };
        amount = toDfx;
        fee = ?ICP_TRANSFER_FEE_E8S;
        memo = null;
        created_at_time = null;
      });
      switch (tr2) {
        case (#Ok _) {
          note #= "Network ops " # Nat.toText(toDfx) # " e8s to DFX. ";
        };
        case (#Err _) {
          note #= "Network ops transfer failed (ICP remains on factory). ";
        };
      };
    };
    if (Text.size(note) == 0) { "Mint fee held on factory" } else { note }
  };

  private func chargeIcp(from : Principal, amountE8s : Nat) : async ?Text {
    if (amountE8s == 0) { return null };
    let transferResult = await IcpLedger.icrc2_transfer_from({
      spender_subaccount = null;
      from = { owner = from; subaccount = null };
      to = { owner = Principal.fromActor(this); subaccount = null };
      amount = amountE8s;
      fee = ?ICP_TRANSFER_FEE_E8S;
      memo = null;
      created_at_time = null;
    });
    switch (transferResult) {
      case (#Ok _) {
        totalIcpReceivedE8s += amountE8s;
        null
      };
      case (#Err err) {
        switch (err) {
          case (#InsufficientAllowance _) {
            ?"Payment failed: approve the fee (+ ledger fee) for the factory, then try again"
          };
          case (#InsufficientFunds _) {
            ?"Payment failed: not enough liquid ICP"
          };
          case (#TemporarilyUnavailable) {
            ?"Payment failed: ledger temporarily unavailable"
          };
          case (#GenericError g) { ?("Payment failed: " # g.message) };
          case (_) { ?"Payment failed: ICP transfer error" };
        }
      };
    }
  };

  /// Refund ICP to user after a post-pay action failed. Factory pays ledger fee.
  /// Returns null on success, or error text if refund could not be sent.
  private func refundIcp(to : Principal, amountE8s : Nat) : async ?Text {
    if (amountE8s == 0) { return null };
    if (Principal.isAnonymous(to)) { return ?"Refund failed: invalid principal" };
    let tr = await IcpLedgerExt.icrc1_transfer({
      from_subaccount = null;
      to = { owner = to; subaccount = null };
      amount = amountE8s;
      fee = ?ICP_TRANSFER_FEE_E8S;
      memo = null;
      created_at_time = null;
    });
    switch (tr) {
      case (#Ok _) {
        if (totalIcpReceivedE8s >= amountE8s) {
          totalIcpReceivedE8s -= amountE8s;
        } else {
          totalIcpReceivedE8s := 0;
        };
        null
      };
      case (#Err err) {
        switch (err) {
          case (#InsufficientFunds _) {
            ?"Refund failed: factory ICP balance too low — contact support with your principal"
          };
          case (#GenericError g) { ?("Refund failed: " # g.message) };
          case (_) { ?"Refund failed: ledger error — contact support" };
        }
      };
    }
  };

  /// True if this Factory principal is still a controller of the site canister.
  private func factoryIsController(cid : Principal) : async Bool {
    let me = Principal.fromActor(this);
    try {
      let st = await IC_STATUS.canister_status({ canister_id = cid });
      for (c in st.settings.controllers.vals()) {
        if (Principal.equal(c, me)) { return true };
      };
      false
    } catch (_) {
      false
    }
  };

  private func requireFactoryController(cid : Principal) : async ?Text {
    if (await factoryIsController(cid)) { null } else {
      ?(
        "Factory is not a controller of "
          # Principal.toText(cid)
          # ". Re-add the factory principal as a controller (My Site → Infrastructure) before upgrade/reset."
      )
    }
  };

  private func siteActor(cid : Principal) : UserSiteActor {
    actor (Principal.toText(cid)) : UserSiteActor
  };

  private func icpForCycles(cyclesAmount : Nat) : Nat {
    // Pro-rate: (cycles / 1T) * TOPUP_ICP_E8S_PER_T, rounded up to whole e8s.
    // Example: 0.5T at 0.5 ICP/T → 0.25 ICP (25_000_000 e8s)
    if (cyclesAmount == 0) { return 0 };
    let t = 1_000_000_000_000 : Nat;
    let numer = cyclesAmount * TOPUP_ICP_E8S_PER_T;
    let cost = (numer + t - 1) / t;
    if (cost == 0) { 1 } else { cost }
  };

  // ---------- admin / wasm ----------

  public shared(msg) func claimOwner() : async Text {
    if (not Principal.equal(owner, Principal.fromText("aaaaa-aa"))) {
      return "Already claimed";
    };
    owner := msg.caller;
    "Owner claimed"
  };

  public query func getOwner() : async Principal { owner };

  public query func getRegistryId() : async Principal { registryId };

  /// Owner: wire the central mint Registry (must authorize this Factory on the Registry first).
  public shared(msg) func adminSetRegistry(reg : Principal) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (Principal.isAnonymous(reg)) { return "Invalid registry" };
    registryId := reg;
    "Registry set: " # Principal.toText(reg)
  };

  private func registryConfigured() : Bool {
    not Principal.equal(registryId, Principal.fromText("aaaaa-aa"))
  };

  private func registryActor() : RegistryActor {
    actor (Principal.toText(registryId)) : RegistryActor
  };

  /// Notify central Registry of a mint.
  /// Returns null on success or registry not configured; ?error text if Registry write failed.
  private func registerMintWithRegistry(cid : Principal, siteOwner : Principal) : async ?Text {
    if (not registryConfigured()) { return null };
    try {
      let r = await registryActor().registerMint(cid, siteOwner);
      if (Text.startsWith(r, #text "Not authorized") or Text.startsWith(r, #text "Invalid")) {
        return ?r;
      };
      null
    } catch (e) {
      ?("Registry registerMint trap: " # Error.message(e))
    }
  };

  private func markDetachedInRegistry(cid : Principal) : async () {
    if (not registryConfigured()) { return };
    try {
      ignore await registryActor().markDetached(cid);
    } catch (_) {};
  };

  private func markRelinkedInRegistry(cid : Principal, siteOwner : Principal) : async () {
    if (not registryConfigured()) { return };
    try {
      ignore await registryActor().markRelinked(cid, siteOwner);
    } catch (_) {};
  };

  /// True if Registry says this canister was factory-minted (required for reattach).
  /// When Registry is configured, local maps alone are never enough.
  private func registryAllowsReattach(cid : Principal) : async Bool {
    if (not registryConfigured()) {
      // Fallback only until Registry is wired
      switch (siteOwners.get(cid)) {
        case (?_) { true };
        case null { false };
      }
    } else {
      try {
        await registryActor().isEligibleForReattach(cid)
      } catch (_) {
        false
      }
    }
  };

  /// Owner: push all known factory sites into the Registry (one-time after wiring).
  public shared(msg) func adminBackfillRegistry() : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (not registryConfigured()) { return "Registry not set — call adminSetRegistry first" };
    var n : Nat = 0;
    var fails : Nat = 0;
    for ((cid, siteOwner) in siteOwners.entries()) {
      switch (await registerMintWithRegistry(cid, siteOwner)) {
        case null { n += 1 };
        case (?_) { fails += 1 };
      };
    };
    for ((user, cid) in userCanisters.entries()) {
      switch (await registerMintWithRegistry(cid, user)) {
        case null { n += 1 };
        case (?_) { fails += 1 };
      };
    };
    "Backfill OK attempts≈"
      # Nat.toText(n)
      # " · failures="
      # Nat.toText(fails)
  };

  /// Owner: ensure every factory-known site is in Registry; report missing.
  public shared(msg) func adminReconcileRegistry() : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (not registryConfigured()) { return "Registry not set — call adminSetRegistry first" };
    var ok : Nat = 0;
    var fixed : Nat = 0;
    var failed : Nat = 0;
    let seen = HashMap.HashMap<Principal, Bool>(0, Principal.equal, Principal.hash);

    let touch = func(cid : Principal, siteOwner : Principal) : async () {
      switch (seen.get(cid)) {
        case (?true) { return };
        case _ { seen.put(cid, true) };
      };
      try {
        let already = await registryActor().isFactoryMinted(cid);
        if (already) {
          ok += 1;
        } else {
          switch (await registerMintWithRegistry(cid, siteOwner)) {
            case null { fixed += 1 };
            case (?_) { failed += 1 };
          };
        };
      } catch (_) {
        failed += 1;
      };
    };

    for ((cid, siteOwner) in siteOwners.entries()) {
      await touch(cid, siteOwner);
    };
    for ((user, cid) in userCanisters.entries()) {
      await touch(cid, user);
    };
    "Registry reconcile: already="
      # Nat.toText(ok)
      # " · fixed="
      # Nat.toText(fixed)
      # " · failed="
      # Nat.toText(failed)
  };

  /// Owner: reassign a site canister to a different II (principal mismatch recovery).
  /// Does not mint a new canister — moves factory index only.
  public shared(msg) func adminReassignSite(site : Principal, newOwner : Principal) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (Principal.isAnonymous(newOwner) or Principal.isAnonymous(site)) {
      return "Invalid principal";
    };
    // Unlink any other user currently pointing at this site
    for ((u, c) in userCanisters.entries()) {
      if (Principal.equal(c, site) and not Principal.equal(u, newOwner)) {
        userCanisters.delete(u);
      };
    };
    // If newOwner had a different site linked, keep lastSite but drop live link
    switch (userCanisters.get(newOwner)) {
      case (?other) {
        if (not Principal.equal(other, site)) {
          lastSite.put(newOwner, other);
          userCanisters.delete(newOwner);
        };
      };
      case null {};
    };
    userCanisters.put(newOwner, site);
    lastSite.put(newOwner, site);
    siteOwners.put(site, newOwner);
    activeSubs.put(site, true);
    switch (await registerMintWithRegistry(site, newOwner)) {
      case (?err) {
        return "Site reassigned to "
          # Principal.toText(newOwner)
          # " but Registry update failed: "
          # err;
      };
      case null {};
    };
    "Site "
      # Principal.toText(site)
      # " reassigned to "
      # Principal.toText(newOwner)
  };

  public query func getFactoryCycles() : async Nat {
    ExperimentalCycles.balance()
  };

  /// Whether the factory can mint a new user_site right now (cycles + WASM).
  /// UI should block paid Join when canMint is false so users do not pay without a site.
  public query func getProvisionCapacity() : async {
    factoryCycles : Nat;
    minRequired : Nat;
    wasmReady : Bool;
    canMint : Bool;
    message : Text;
  } {
    let bal = ExperimentalCycles.balance();
    let wasmOk = userSiteWasm.size() >= 8;
    let cyclesOk = bal >= MIN_FACTORY_BALANCE;
    let can = wasmOk and cyclesOk;
    {
      factoryCycles = bal;
      minRequired = MIN_FACTORY_BALANCE;
      wasmReady = wasmOk;
      canMint = can;
      message = if (not wasmOk) {
        "Factory has no user_site WASM — ops must upload WASM before Join can create websites."
      } else if (not cyclesOk) {
        "Factory cycles too low to create websites (have "
          # Nat.toText(bal)
          # ", need "
          # Nat.toText(MIN_FACTORY_BALANCE)
          # "). Do not pay Join until ops tops up the factory."
      } else {
        "Factory can mint personal websites."
      };
    }
  };

  public query func getFees() : async {
    mintFeeE8s : Nat;
    mintCyclesShareE8s : Nat;
    mintNetworkOpsE8s : Nat;
    detachFeeE8s : Nat;
    relinkFeeE8s : Nat;
    domainConnectFeeE8s : Nat;
    transferFeeE8s : Nat;
    topupIcpE8sPerT : Nat;
    totalIcpReceivedE8s : Nat;
  } {
    let ops = if (MINT_FEE_E8S > MINT_CYCLES_SHARE_E8S) {
      MINT_FEE_E8S - MINT_CYCLES_SHARE_E8S
    } else { 0 };
    {
      mintFeeE8s = MINT_FEE_E8S;
      mintCyclesShareE8s = MINT_CYCLES_SHARE_E8S;
      mintNetworkOpsE8s = ops;
      detachFeeE8s = DETACH_FEE_E8S;
      relinkFeeE8s = RELINK_FEE_E8S;
      domainConnectFeeE8s = DOMAIN_CONNECT_FEE_E8S;
      transferFeeE8s = TRANSFER_FEE_E8S;
      topupIcpE8sPerT = TOPUP_ICP_E8S_PER_T;
      totalIcpReceivedE8s;
    }
  };

  public shared(msg) func adminSetMintFee(feeE8s : Nat, cyclesShareE8s : Nat) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (feeE8s == 0) { return "Mint fee must be > 0" };
    if (cyclesShareE8s > feeE8s) { return "Cycles share cannot exceed mint fee" };
    MINT_FEE_E8S := feeE8s;
    MINT_CYCLES_SHARE_E8S := cyclesShareE8s;
    "Mint fee set to " # Nat.toText(feeE8s) # " e8s (cycles share " # Nat.toText(cyclesShareE8s) # ")"
  };

  public shared(msg) func adminSetFees(
    detachFeeE8s : Nat,
    relinkFeeE8s : Nat,
    topupIcpE8sPerT : Nat
  ) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    DETACH_FEE_E8S := detachFeeE8s;
    RELINK_FEE_E8S := relinkFeeE8s;
    TOPUP_ICP_E8S_PER_T := topupIcpE8sPerT;
    "Fees updated"
  };

  public shared(msg) func adminSetTransferFee(feeE8s : Nat) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    TRANSFER_FEE_E8S := feeE8s;
    "Transfer claim fee set to " # Nat.toText(feeE8s) # " e8s"
  };

  public shared(msg) func adminSetDomainConnectFee(feeE8s : Nat) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (feeE8s == 0) { return "Fee must be > 0" };
    DOMAIN_CONNECT_FEE_E8S := feeE8s;
    "Domain connect fee set to " # Nat.toText(feeE8s) # " e8s"
  };

  public shared(msg) func setUserSiteWasm(wasm : Blob) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    wasmUploadBuf := Buffer.Buffer<Nat8>(0);
    userSiteWasm := wasm;
    "WASM stored (" # Nat.toText(wasm.size()) # " bytes)"
  };

  public shared(msg) func clearUserSiteWasm() : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    userSiteWasm := Blob.fromArray([]);
    wasmUploadBuf := Buffer.Buffer<Nat8>(0);
    "WASM cleared"
  };

  public shared(msg) func appendUserSiteWasm(chunk : Blob) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (chunk.size() == 0) { return "Empty chunk" };
    for (b in Blob.toArray(chunk).vals()) { wasmUploadBuf.add(b) };
    "Staging " # Nat.toText(wasmUploadBuf.size()) # " bytes (call finalizeUserSiteWasm)"
  };

  public shared(msg) func appendUserSiteWasmHex(hex : Text) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    switch (decodeHex(hex)) {
      case null { "Invalid hex" };
      case (?chunk) {
        if (chunk.size() == 0) { return "Empty chunk" };
        for (b in Blob.toArray(chunk).vals()) { wasmUploadBuf.add(b) };
        "Staging " # Nat.toText(wasmUploadBuf.size()) # " bytes (call finalizeUserSiteWasm)"
      };
    }
  };

  public shared(msg) func finalizeUserSiteWasm() : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (wasmUploadBuf.size() == 0) { return "Nothing staged — append chunks first" };
    let bytes = Buffer.toArray(wasmUploadBuf);
    if (bytes.size() < 4 or bytes[0] != 0 or bytes[1] != 0x61 or bytes[2] != 0x73 or bytes[3] != 0x6d) {
      return "Staged data is not valid WASM (bad magic)";
    };
    userSiteWasm := Blob.fromArray(bytes);
    wasmUploadBuf := Buffer.Buffer<Nat8>(0);
    "WASM finalized (" # Nat.toText(userSiteWasm.size()) # " bytes)"
  };

  public query func getWasmSize() : async Nat { userSiteWasm.size() };

  public query func getWasmMagicHex() : async Text {
    let arr = Blob.toArray(userSiteWasm);
    if (arr.size() < 4) { return "too short" };
    let hexChars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
    var out = "";
    var i = 0;
    while (i < 4) {
      let b = Nat8.toNat(arr[i]);
      out #= hexChars[b / 16] # hexChars[b % 16];
      i += 1;
    };
    out
  };

  // ---------- provisioning ----------

  private func requireIceRegistered(user : Principal) : async ?Text {
    try {
      let reg = await ICE_MAIN.isRegistered(user);
      if (reg) { null } else {
        ?"Join ICE first (free username). Then mint your site — 10 ICP covers your canister and the network."
      }
    } catch (e) {
      ?("Could not verify ICE registration: " # Error.message(e))
    }
  };

  private func fetchIceProfile(user : Principal) : async {
    username : Text;
    bio : Text;
    avatarURL : Text;
  } {
    try {
      switch (await ICE_PROFILE.getProfile(user)) {
        case (?p) { p };
        case null {
          {
            username = "Member";
            bio = "A quieter place for real conversation.";
            avatarURL = "";
          }
        };
      }
    } catch (_) {
      {
        username = "Member";
        bio = "A quieter place for real conversation.";
        avatarURL = "";
      }
    }
  };

  private func putPending(
    cid : Principal,
    owner : Principal,
    stage : Text,
    lastError : Text,
    createdAt : Int
  ) {
    let now = Time.now();
    pendingMints.put(
      cid,
      {
        site = cid;
        intendedOwner = owner;
        stage;
        lastError;
        createdAt = if (createdAt == 0) { now } else { createdAt };
        updatedAt = now;
      },
    );
  };

  private func clearPending(cid : Principal) {
    pendingMints.delete(cid);
  };

  private func finishLinkMaps(user : Principal, cid : Principal) {
    userCanisters.put(user, cid);
    lastSite.put(user, cid);
    siteOwners.put(cid, user);
    activeSubs.put(cid, true);
  };

  private func makeRecoveryCode(user : Principal) : Text {
    let t = Int.abs(Time.now());
    let h = Nat32.toNat(Principal.hash(user));
    "ICE-RCV-" # Nat.toText(t) # "-" # Nat.toText(h)
  };

  /// Issue/rotate recovery code for a site; queues one-shot reveal for owner.
  private func issueRecoveryCode(site : Principal, ownerP : Principal) : Text {
    switch (recoveryCodes.get(site)) {
      case (?old) { recoveryCodeIndex.delete(old) };
      case null {};
    };
    let code = makeRecoveryCode(ownerP);
    recoveryCodes.put(site, code);
    recoveryCodeIndex.put(code, site);
    pendingRecoveryReveal.put(ownerP, code);
    code
  };

  /// Production default controllers:
  ///   1) site owner II — full user control
  ///   2) NNS founder (gmtr2) — NNS dapp visibility / recovery
  ///   3) dfx ops deploy principal — ops recovery
  ///   4) Factory — mint/reset/upgrade/relink authority
  private func standardControllerPrincipals(user : Principal) : [Principal] {
    let factoryId = Principal.fromActor(this);
    [user, NNS_CONTROLLER, DFX_CONTROLLER, factoryId]
  };

  private func applyStandardControllersInternal(user : Principal, cid : Principal) : async ?Text {
    try {
      await IC_MANAGEMENT.update_settings({
        canister_id = cid;
        settings = {
          controllers = ?standardControllerPrincipals(user);
          compute_allocation = null;
          memory_allocation = null;
          freezing_threshold = null;
          reserved_cycles_limit = null;
          log_visibility = null;
          wasm_memory_limit = null;
        };
        sender_canister_version = null;
      });
      null
    } catch (e) {
      ?Error.message(e)
    }
  };

  private func installAndBootstrap(user : Principal, cid : Principal, reinstall : Bool) : async ?Text {
    if (userSiteWasm.size() < 8) {
      return ?"No user_site WASM stored";
    };
    let factoryId = Principal.fromActor(this);
    let initArg = to_candid (user);
    let mode : InstallMode = if (reinstall) { #reinstall } else { #install };
    try {
      await IC_MANAGEMENT.install_code({
        mode;
        canister_id = cid;
        wasm_module = userSiteWasm;
        arg = initArg;
        sender_canister_version = null;
      });
    } catch (e) {
      return ?("install_code failed: " # Error.message(e));
    };
    let prof = await fetchIceProfile(user);
    try {
      ignore await siteActor(cid).bootstrap(
        factoryId,
        Principal.fromText("6jf55-2qaaa-aaaan-q6mwq-cai"),
        prof.username,
        prof.bio,
        prof.avatarURL
      );
    } catch (_) {};
    null
  };

  /// Resume from a known partial mint stage through maps + Registry.
  private func completeFromStage(user : Principal, cid : Principal, startStage : Text) : async CreateUserSiteResult {
    let createdAt = switch (pendingMints.get(cid)) {
      case (?p) { p.createdAt };
      case null { Time.now() };
    };
    var stage = startStage;

    if (stage == "created") {
      switch (await installAndBootstrap(user, cid, false)) {
        case (?err) {
          // try reinstall if already partially installed
          switch (await installAndBootstrap(user, cid, true)) {
            case (?err2) {
              putPending(cid, user, "created", err2, createdAt);
              return #err(
                "Resume install failed for "
                  # Principal.toText(cid)
                  # ": "
                  # err2
                  # ". Ops: adminResumePendingMint / adminAbandonPendingMint."
              );
            };
            case null {};
          };
        };
        case null {};
      };
      stage := "bootstrapped";
      putPending(cid, user, stage, "", createdAt);
    } else if (stage == "installed" or stage == "bootstrapped") {
      // ensure wasm+bootstrap once more is safe via reinstall only if empty? just continue
      putPending(cid, user, "bootstrapped", "", createdAt);
      stage := "bootstrapped";
    };

    if (stage == "bootstrapped" or stage == "controllers") {
      switch (await applyStandardControllersInternal(user, cid)) {
        case (?err) {
          putPending(cid, user, "bootstrapped", err, createdAt);
          return #err(
            "Controllers failed for "
              # Principal.toText(cid)
              # ": "
              # err
              # ". Ops: adminResumePendingMint."
          );
        };
        case null {};
      };
      stage := "controllers";
      putPending(cid, user, stage, "", createdAt);
    };

    finishLinkMaps(user, cid);
    stage := "registry";
    putPending(cid, user, stage, "", createdAt);

    switch (await registerMintWithRegistry(cid, user)) {
      case (?regErr) {
        putPending(cid, user, "registry", regErr, createdAt);
        return #err(
          "Site "
            # Principal.toText(cid)
            # " linked locally but Registry failed: "
            # regErr
            # ". Ops: adminReconcileRegistry or adminResumePendingMint."
        );
      };
      case null {};
    };

    clearPending(cid);
    // Mint-time recovery code (revealed once via revealPendingRecoveryCode)
    ignore issueRecoveryCode(cid, user);
    // Best-effort auto top-up after mint (never on detach). No UI detach prompts here.
    try {
      await checkAndTopUpWithPayer(user, cid);
    } catch (_) {};
    #ok(cid)
  };


  private func mintFeeWaived(user : Principal) : async Bool {
    try {
      await ICE_MINT_FEE.isMintFeeWaived(user)
    } catch (_) {
      // If ICE query fails, still allow master via local isOwner on skip path only
      false
    }
  };

  private func provisionFor(user : Principal, skipRegCheck : Bool) : async CreateUserSiteResult {
    if (Principal.isAnonymous(user)) {
      return #err("Anonymous cannot create a site");
    };

    switch (userCanisters.get(user)) {
      case (?existing) {
        clearPending(existing);
        return #ok(existing);
      };
      case null {};
    };

    // Auto-resume any pending mint for this owner
    for ((cid, p) in pendingMints.entries()) {
      if (Principal.equal(p.intendedOwner, user)) {
        return await completeFromStage(user, cid, p.stage);
      };
    };

    if (not skipRegCheck) {
      switch (await requireIceRegistered(user)) {
        case (?err) { return #err(err) };
        case null {};
      };
    };

    if (userSiteWasm.size() < 8) {
      return #err("No user_site WASM stored. Owner: clearUserSiteWasm + appendUserSiteWasmHex");
    };

    let magic = Blob.toArray(userSiteWasm);
    if (magic[0] != 0 or magic[1] != 0x61 or magic[2] != 0x73 or magic[3] != 0x6d) {
      return #err("Stored module is not WASM (bad magic). Re-upload with appendUserSiteWasmHex");
    };

    // Fee-at-mint: charge 10 ICP once for a fresh mint (not on resume / admin / waived).
    // Hold ICP on factory until mint succeeds, then split cycles vs network ops.
    var chargedMintFee = false;
    if (not skipRegCheck) {
      let waived = await mintFeeWaived(user);
      if (not waived and MINT_FEE_E8S > 0) {
        switch (await chargeIcp(user, MINT_FEE_E8S)) {
          case (?err) { return #err(err) };
          case null {};
        };
        chargedMintFee := true;
      };
    };

    // Best-effort: convert any prior ICP on factory into cycles before create
    ignore await convertIcpToFactoryCycles(ICP_PER_MINT_TO_CYCLES_E8S);

    let bal = ExperimentalCycles.balance();
    if (bal < MIN_FACTORY_BALANCE) {
      if (chargedMintFee) {
        ignore await refundIcp(user, MINT_FEE_E8S);
      };
      return #err(
        "Factory cycles too low: have " # Nat.toText(bal)
          # " need at least " # Nat.toText(MIN_FACTORY_BALANCE)
          # ". Mint fee refunded if charged. Ops must top up factory cycles."
      );
    };

    let factoryId = Principal.fromActor(this);
    let settings : CanisterSettings = {
      controllers = ?[factoryId];
      compute_allocation = null;
      memory_allocation = null;
      freezing_threshold = null;
      reserved_cycles_limit = null;
      log_visibility = null;
      wasm_memory_limit = null;
    };

    let cyclesToAttach = CREATE_FEE_CYCLES + INITIAL_SITE_CYCLES;

    let created = try {
      await (
        with cycles = cyclesToAttach
      ) IC_MANAGEMENT.create_canister({
        settings = ?settings;
        sender_canister_version = null;
      })
    } catch (e) {
      if (chargedMintFee) {
        ignore await refundIcp(user, MINT_FEE_E8S);
      };
      return #err("create_canister failed: " # Error.message(e));
    };

    let cid = created.canister_id;
    let createdAt = Time.now();
    putPending(cid, user, "created", "", createdAt);

    // From created → install/bootstrap → controllers → maps → registry
    let result = await completeFromStage(user, cid, "created");
    switch (result) {
      case (#ok _) {
        if (chargedMintFee) {
          ignore await distributeMintFeeProceeds(MINT_FEE_E8S);
        };
      };
      case (#err _) {
        // Pending mint retained — ICP stays on factory for resume (no second charge).
        // Do not refund: canister may already exist.
      };
    };
    result
  };

  public query func listPendingMints() : async [PendingMint] {
    let buf = Buffer.Buffer<PendingMint>(pendingMints.size());
    for ((_, p) in pendingMints.entries()) { buf.add(p) };
    Buffer.toArray(buf)
  };

  /// Owner: finish a half-created site from its last recorded stage.
  public shared(msg) func adminResumePendingMint(site : Principal) : async CreateUserSiteResult {
    if (not isOwner(msg.caller)) { return #err("Not authorized") };
    switch (pendingMints.get(site)) {
      case null {
        // Allow resume if we know owner from siteOwners/lastSite
        switch (siteOwners.get(site)) {
          case (?owner) {
            return await completeFromStage(owner, site, "bootstrapped");
          };
          case null {
            return #err("No pending mint for " # Principal.toText(site));
          };
        };
      };
      case (?p) {
        await completeFromStage(p.intendedOwner, site, p.stage)
      };
    }
  };

  /// Owner: drop pending tracking (does not delete the canister — may still burn cycles).
  public shared(msg) func adminAbandonPendingMint(site : Principal) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    switch (pendingMints.get(site)) {
      case null { "No pending mint for " # Principal.toText(site) };
      case (?p) {
        clearPending(site);
        // If never fully linked, leave lastSite hint for ops
        lastSite.put(p.intendedOwner, site);
        siteOwners.put(site, p.intendedOwner);
        "Abandoned pending mint "
          # Principal.toText(site)
          # " for "
          # Principal.toText(p.intendedOwner)
          # " (canister may still exist; stop/top-up via NNS if needed)"
      };
    }
  };

  /// Caller must already be registered on ICE (free Join).
  /// Fresh mint charges MINT_FEE_E8S (10 ICP) unless waived; retries/resume do not re-charge.
  /// Idempotent: returns existing linked site if present.
  public shared(msg) func createUserSite() : async CreateUserSiteResult {
    await provisionFor(msg.caller, false)
  };

  /// Same as createUserSite — preferred name for post-Join retries (no second mint fee if pending/linked).
  public shared(msg) func ensureUserSite() : async CreateUserSiteResult {
    await provisionFor(msg.caller, false)
  };

  public shared(msg) func adminCreateUserSite(user : Principal) : async CreateUserSiteResult {
    if (not isOwner(msg.caller)) { return #err("Not authorized") };
    await provisionFor(user, true)
  };

  /// Master: create/link a site for a principal who already joined ICE but has no canister.
  /// Never charges Join fee. Idempotent if they already have a linked site.
  public shared(msg) func adminProvisionSite(user : Principal) : async CreateUserSiteResult {
    if (not isOwner(msg.caller)) { return #err("Not authorized") };
    if (Principal.isAnonymous(user)) { return #err("Invalid user") };
    switch (userCanisters.get(user)) {
      case (?existing) { return #ok(existing) };
      case null {};
    };
    // Prefer existing last site over minting a brand-new one
    switch (lastSite.get(user)) {
      case (?old) {
        userCanisters.put(user, old);
        siteOwners.put(old, user);
        activeSubs.put(old, true);
        switch (await registerMintWithRegistry(old, user)) {
          case (?regErr) {
            return #err(
              "Re-linked last site "
                # Principal.toText(old)
                # " but Registry failed: "
                # regErr
            );
          };
          case null {};
        };
        return #ok(old);
      };
      case null {};
    };
    await provisionFor(user, true)
  };

  public query func getUserCanister(user : Principal) : async ?Principal {
    userCanisters.get(user)
  };

  /// Last known site for user (even if detached).
  public query func getLastSite(user : Principal) : async ?Principal {
    switch (userCanisters.get(user)) {
      case (?c) { ?c };
      case null { lastSite.get(user) };
    }
  };

  public query func isLinked(user : Principal) : async Bool {
    switch (userCanisters.get(user)) {
      case (?_) { true };
      case null { false };
    }
  };

  public query func getSiteOwner(site : Principal) : async ?Principal {
    siteOwners.get(site)
  };

  // ---------- domain / DNS (required before detach) ----------

  private func resolveCallerSite(user : Principal) : ?Principal {
    switch (userCanisters.get(user)) {
      case (?c) { ?c };
      case null { lastSite.get(user) };
    }
  };

  private func domainReady(rec : DomainRecord) : Bool {
    Text.size(rec.domain) > 0 and Text.size(rec.publicUrl) > 0 and rec.dnsConfigured
      and domainRecordIntegrity(rec)
  };

  /// Domain index + public URL host must agree with stored domain (detach / ready gate).
  private func domainRecordIntegrity(rec : DomainRecord) : Bool {
    if (Text.size(rec.domain) == 0 or Text.size(rec.publicUrl) == 0) { return false };
    if (not validHostname(rec.domain)) { return false };
    if (not validPublicUrl(rec.publicUrl)) { return false };
    let urlHost = normalizeHostname(rec.publicUrl);
    if (urlHost != rec.domain) { return false };
    true
  };

  private func validHostname(d : Text) : Bool {
    let n = Text.size(d);
    if (n < 3 or n > 253) { return false };
    if (Text.contains(d, #text " ")) { return false };
    if (Text.contains(d, #text "://")) { return false };
    if (Text.contains(d, #text "/")) { return false };
    Text.contains(d, #text ".")
  };

  private func validPublicUrl(u : Text) : Bool {
    let n = Text.size(u);
    if (n < 8 or n > 512) { return false };
    Text.startsWith(u, #text "https://") or Text.startsWith(u, #text "http://")
  };

  private func callerOwnsSite(user : Principal, cid : Principal) : async Bool {
    var owns = false;
    switch (siteOwners.get(cid)) {
      case (?o) { if (Principal.equal(o, user)) { owns := true } };
      case null {};
    };
    switch (userCanisters.get(user)) {
      case (?c) { if (Principal.equal(c, cid)) { owns := true } };
      case null {};
    };
    if (not owns) {
      try {
        let o = await siteActor(cid).getOwner();
        if (Principal.equal(o, user)) { owns := true };
      } catch (_) {};
    };
    owns
  };

  /// Charge 1 ICP (DOMAIN_CONNECT_FEE) if this site has not already paid for hostname `d`.
  private func requireDomainConnectPayment(user : Principal, cid : Principal, d : Text) : async ?Text {
    switch (domainPaidFor.get(cid)) {
      case (?paid) {
        if (paid == d) { return null };
      };
      case null {};
    };
    // Grandfather: already verified DNS for this host before fees existed
    switch (siteDomains.get(cid)) {
      case (?rec) {
        if (rec.domain == d and rec.dnsConfigured) {
          domainPaidFor.put(cid, d);
          return null;
        };
      };
      case null {};
    };
    switch (await chargeIcp(user, DOMAIN_CONNECT_FEE_E8S)) {
      case (?err) { ?err };
      case null {
        domainPaidFor.put(cid, d);
        null
      };
    }
  };

  /// Apply domain + https URL on factory maps and site canister (no payment).
  private func applyDomainConnection(cid : Principal, d : Text, u : Text) : async () {
    switch (siteDomains.get(cid)) {
      case (?old) {
        if (Text.size(old.domain) > 0) {
          let oldKey = toLowerAscii(old.domain);
          switch (domainIndex.get(oldKey)) {
            case (?mapped) {
              if (Principal.equal(mapped, cid)) { domainIndex.delete(oldKey) };
            };
            case null {};
          };
        };
      };
      case null {};
    };
    let rec : DomainRecord = {
      domain = d;
      publicUrl = u;
      dnsConfigured = false;
      connectedAt = 0;
    };
    siteDomains.put(cid, rec);
    domainIndex.put(d, cid);
    try {
      ignore await siteActor(cid).setDomainConnection(d, u);
    } catch (_) {};
  };

  /// One-step connect: charge 1 ICP (ICRC-2) if needed, then set domain + https://domain (set_domain).
  /// DNS records are shown client-side; call checkDns after DNS is live to enable HTTPS/detach.
  public shared(msg) func connectDomain(domain : Text) : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    let cid = switch (resolveCallerSite(user)) {
      case null { return #err("No website. Create a site first.") };
      case (?c) { c };
    };
    if (not (await callerOwnsSite(user, cid))) {
      return #err("Not the owner of this website");
    };

    let d = normalizeHostname(domain);
    if (Text.contains(domain, #text "/") and not Text.startsWith(domain, #text "http")) {
      return #err("Domain must be hostname only (e.g. mysite.example.com), no path");
    };
    if (not validHostname(d)) {
      return #err("Invalid domain. Use mysite.example.com");
    };
    let u = "https://" # d;

    switch (domainIndex.get(d)) {
      case (?other) {
        if (not Principal.equal(other, cid)) {
          return #err("Domain already linked to another site: " # Principal.toText(other));
        };
      };
      case null {};
    };

    switch (await requireDomainConnectPayment(user, cid, d)) {
      case (?err) { return #err(err) };
      case null {};
    };

    await applyDomainConnection(cid, d, u);

    #ok(
      "Domain " # d # " connected (1 ICP paid or already covered). "
        # "Add the DNS records shown, then press Check DNS. Assets: "
        # ASSETS_CANISTER_ID
    )
  };

  /// Verify DNS via on-chain ICP validate and mark ready (enables HTTPS hosting / detach).
  public shared(msg) func checkDns() : async OpResult {
    await confirmSiteDnsInternal(msg.caller)
  };

  /// Set custom domain + public URL (charges 1 ICP if this hostname not yet paid).
  public shared(msg) func setSiteDomainConnection(domain : Text, publicUrl : Text) : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    let cid = switch (resolveCallerSite(user)) {
      case null { return #err("No website. Create a site first.") };
      case (?c) { c };
    };
    if (not (await callerOwnsSite(user, cid))) {
      return #err("Not the owner of this website");
    };

    let d = normalizeHostname(domain);
    if (Text.contains(domain, #text "/") and not Text.startsWith(domain, #text "http")) {
      return #err("Domain must be hostname only (e.g. mysite.example.com), no path");
    };
    var u = publicUrl;
    if (Text.size(u) == 0 and Text.size(d) > 0) {
      u := "https://" # d;
    };
    if (not validHostname(d)) {
      return #err("Invalid domain. Use mysite.example.com");
    };
    if (not validPublicUrl(u)) {
      return #err("Invalid public URL. Use https://yoursite.com");
    };
    let urlHost = normalizeHostname(u);
    if (urlHost != d) {
      return #err(
        "Public URL host must match domain. Use https://" # d # " (got host " # urlHost # ")."
      );
    };

    switch (domainIndex.get(d)) {
      case (?other) {
        if (not Principal.equal(other, cid)) {
          return #err("Domain already linked to another site: " # Principal.toText(other));
        };
      };
      case null {};
    };

    switch (await requireDomainConnectPayment(user, cid, d)) {
      case (?err) { return #err(err) };
      case null {};
    };

    await applyDomainConnection(cid, d, u);

    #ok(
      "Domain " # d # " saved for " # Principal.toText(cid)
        # ". Point DNS at assets " # ASSETS_CANISTER_ID
        # ", then Check DNS."
    )
  };

  /// Owner confirms DNS is configured for their site (required before detach / HTTPS ready).
  private func confirmSiteDnsInternal(user : Principal) : async OpResult {
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    let cid = switch (resolveCallerSite(user)) {
      case null { return #err("No website") };
      case (?c) { c };
    };
    switch (siteDomains.get(cid)) {
      case null {
        return #err("Connect Domain first (pay 1 ICP and set your hostname).");
      };
      case (?rec) {
        if (Text.size(rec.domain) == 0 or Text.size(rec.publicUrl) == 0) {
          return #err("Connect Domain first.");
        };
        if (not domainRecordIntegrity(rec)) {
          return #err(
            "Domain record integrity failed: public URL host must match domain. Reconnect domain."
          );
        };
        switch (domainIndex.get(rec.domain)) {
          case null {
            return #err("Domain not indexed. Connect Domain again, then Check DNS.");
          };
          case (?mapped) {
            if (not Principal.equal(mapped, cid)) {
              return #err(
                "Domain is indexed to another site ("
                  # Principal.toText(mapped)
                  # "). Cannot confirm DNS."
              );
            };
          };
        };
        if (not (await callerOwnsSite(user, cid))) {
          return #err("Not the owner of this website");
        };
        // Must have paid for this domain (or grandfather verified host)
        switch (domainPaidFor.get(cid)) {
          case (?paid) {
            if (paid != rec.domain) {
              return #err("Domain fee not paid for this hostname. Press Connect Domain (1 ICP).");
            };
          };
          case null {
            if (rec.dnsConfigured) {
              domainPaidFor.put(cid, rec.domain);
            } else {
              return #err("Domain fee not paid. Press Connect Domain (1 ICP) first.");
            };
          };
        };

        switch (await validateDomainOnChain(rec.domain)) {
          case (#err e) { return #err(e) };
          case (#ok _) {};
        };

        let updated : DomainRecord = {
          domain = rec.domain;
          publicUrl = rec.publicUrl;
          dnsConfigured = true;
          connectedAt = Time.now();
        };
        siteDomains.put(cid, updated);

        try {
          ignore await siteActor(cid).confirmDnsConfigured();
        } catch (_) {};

        #ok(
          "DNS verified for " # rec.domain
            # ". HTTPS hosting enabled. You can open https://"
            # rec.domain
            # " when ICP registration completes."
        )
      };
    }
  };

  public shared(msg) func confirmSiteDns() : async OpResult {
    await confirmSiteDnsInternal(msg.caller)
  };

  public query func getSiteDomainConnection(site : Principal) : async ?DomainRecord {
    siteDomains.get(site)
  };

  public query func isSiteReadyToDetach(site : Principal) : async Bool {
    switch (siteDomains.get(site)) {
      case (?rec) { domainReady(rec) };
      case null { false };
    }
  };

  /// Public: resolve hostname → personal site canister (for custom-domain hosting on assets SPA).
  public query func getSiteByDomain(domain : Text) : async ?Principal {
    let d = normalizeHostname(domain);
    domainIndex.get(d)
  };

  /// Assets canister that serves the public ICE app / personal site viewer.
  public query func getHostingAssetsCanisterId() : async Text {
    ASSETS_CANISTER_ID
  };

  public type HostingDomainRow = {
    domain : Text;
    site : Principal;
    publicUrl : Text;
    dnsConfigured : Bool;
  };

  /// Public list of registered personal domains (for ic-domains sync / ops).
  public query func listHostingDomains() : async [HostingDomainRow] {
    let buf = Buffer.Buffer<HostingDomainRow>(siteDomains.size());
    for ((site, rec) in siteDomains.entries()) {
      if (Text.size(rec.domain) > 0) {
        buf.add({
          domain = rec.domain;
          site;
          publicUrl = rec.publicUrl;
          dnsConfigured = rec.dnsConfigured;
        });
      };
    };
    Buffer.toArray(buf)
  };

  /// Text file body for assets `/.well-known/ic-domains` (one host per line) + static ICE domains.
  public query func getIcDomainsFileBody() : async Text {
    var body = "frostedblocks.com\nwww.frostedblocks.com\n";
    for ((site, rec) in siteDomains.entries()) {
      ignore site;
      if (Text.size(rec.domain) > 0) {
        let d = rec.domain;
        if (d != "frostedblocks.com" and d != "www.frostedblocks.com") {
          body #= d # "\n";
        };
      };
    };
    body
  };

  // ---------- factory reset (reinstall original WASM + empty defaults) ----------

  private func appendResetLog(entry : ResetLogEntry) {
    let maxKeep : Nat = 200;
    let prev = resetLogEntries;
    let n = prev.size();
    if (n + 1 <= maxKeep) {
      resetLogEntries := Array.tabulate<ResetLogEntry>(n + 1, func(i) {
        if (i < n) { prev[i] } else { entry }
      });
    } else {
      // drop oldest
      resetLogEntries := Array.tabulate<ResetLogEntry>(maxKeep, func(i) {
        if (i < maxKeep - 1) { prev[i + 1] } else { entry }
      });
    };
  };

  /// True if caller is an IC controller of the site canister (or mapped site owner).
  private func isSiteController(cid : Principal, caller : Principal) : async Bool {
    if (Principal.isAnonymous(caller)) { return false };
    switch (siteOwners.get(cid)) {
      case (?o) { if (Principal.equal(o, caller)) { return true } };
      case null {};
    };
    switch (userCanisters.get(caller)) {
      case (?c) { if (Principal.equal(c, cid)) { return true } };
      case null {};
    };
    try {
      let st = await IC_STATUS.canister_status({ canister_id = cid });
      for (c in st.settings.controllers.vals()) {
        if (Principal.equal(c, caller)) { return true };
      };
      false
    } catch (_) {
      false
    }
  };

  private func resolveSiteOwner(cid : Principal) : async ?Principal {
    switch (siteOwners.get(cid)) {
      case (?o) { ?o };
      case null {
        try {
          ?(await siteActor(cid).getOwner())
        } catch (_) {
          null
        }
      };
    }
  };

  /// Core reset: #reinstall factory WASM (wipes stable memory), bootstrap defaults, keep controllers.
  /// Factory must be a controller of the target canister. Only callable via authorized public methods.
  private func performFactoryReset(
    cid : Principal,
    siteOwner : Principal,
    triggeredBy : Principal,
    kind : Text
  ) : async OpResult {
    if (userSiteWasm.size() < 8) {
      return #err("No user_site WASM on factory. Ops must upload WASM first.");
    };
    let magic = Blob.toArray(userSiteWasm);
    if (magic[0] != 0 or magic[1] != 0x61 or magic[2] != 0x73 or magic[3] != 0x6d) {
      return #err("Stored module is not valid WASM");
    };

    switch (await requireFactoryController(cid)) {
      case (?err) { return #err(err) };
      case null {};
    };

    let initArg = to_candid (siteOwner);
    try {
      await IC_MANAGEMENT.install_code({
        mode = #reinstall;
        canister_id = cid;
        wasm_module = userSiteWasm;
        arg = initArg;
        sender_canister_version = null;
      });
    } catch (e) {
      return #err(
        "Reinstall failed (factory must be a controller): " # Error.message(e)
      );
    };

    let factoryId = Principal.fromActor(this);
    let prof = await fetchIceProfile(siteOwner);
    try {
      ignore await siteActor(cid).bootstrap(
        factoryId,
        Principal.fromText("6jf55-2qaaa-aaaan-q6mwq-cai"),
        prof.username,
        prof.bio,
        prof.avatarURL
      );
    } catch (e) {
      // Site is reinstalled; bootstrap failed — still report partial success
      appendResetLog({
        site = cid;
        siteOwner;
        triggeredBy;
        at = Time.now();
        kind;
      });
      return #ok(
        "WASM reinstalled for "
          # Principal.toText(cid)
          # " but bootstrap failed: "
          # Error.message(e)
      );
    };

    // Restore factory-side domain record onto wiped site (optional)
    switch (siteDomains.get(cid)) {
      case (?rec) {
        try {
          ignore await siteActor(cid).setDomainConnection(rec.domain, rec.publicUrl);
          if (rec.dnsConfigured) {
            ignore await siteActor(cid).confirmDnsConfigured();
          };
        } catch (_) {};
      };
      case null {};
    };

    // Keep network link if still in userCanisters
    var linked = false;
    for ((u, c) in userCanisters.entries()) {
      if (Principal.equal(c, cid)) { linked := true };
    };
    if (linked) {
      try {
        ignore await siteActor(cid).onRelink(factoryId);
      } catch (_) {};
    };

    appendResetLog({
      site = cid;
      siteOwner;
      triggeredBy;
      at = Time.now();
      kind;
    });

    if (kind == "emergency" and registryConfigured()) {
      try {
        ignore await registryActor().logEmergencyReset(cid, triggeredBy);
      } catch (_) {};
    };

    #ok(
      "Factory reset complete for "
        # Principal.toText(cid)
        # " ("
        # kind
        # "). Original WASM + empty defaults restored."
    )
  };

  private func userResetCooldownRemaining(cid : Principal) : Int {
    switch (lastUserReset.get(cid)) {
      case null { 0 };
      case (?t) {
        let elapsed = Time.now() - t;
        if (elapsed >= USER_RESET_COOLDOWN_NS) { 0 } else { USER_RESET_COOLDOWN_NS - elapsed };
      };
    }
  };

  /// UI: can the caller request a user factory-reset now?
  public query(msg) func getUserResetStatus() : async {
    attached : Bool;
    isLinkedOwner : Bool;
    allowed : Bool;
    cooldownRemainingNs : Int;
    cooldownHours : Nat;
    message : Text;
  } {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) {
      return {
        attached = false;
        isLinkedOwner = false;
        allowed = false;
        cooldownRemainingNs = 0;
        cooldownHours = 24;
        message = "Not authenticated";
      };
    };
    switch (userCanisters.get(user)) {
      case null {
        {
          attached = false;
          isLinkedOwner = false;
          allowed = false;
          cooldownRemainingNs = 0;
          cooldownHours = 24;
          message = "Reset only while site is attached to ICE";
        }
      };
      case (?cid) {
        var ownerOk = true;
        switch (siteOwners.get(cid)) {
          case (?o) { ownerOk := Principal.equal(o, user) };
          case null {};
        };
        let rem = userResetCooldownRemaining(cid);
        let coolOk = rem == 0;
        let allowed = ownerOk and coolOk;
        {
          attached = true;
          isLinkedOwner = ownerOk;
          allowed;
          cooldownRemainingNs = rem;
          cooldownHours = 24;
          message = if (not ownerOk) {
            "Only the linked site owner Internet Identity may reset"
          } else if (not coolOk) {
            "Rate limited: one user factory reset per 24 hours on this site"
          } else {
            "Ready — reset permanently erases site data"
          };
        }
      };
    }
  };

  /// Linked site owner only: full factory reset. Rate limited to once per 24h per site.
  /// Not available when detached. NNS/dfx controllers cannot use this path (owner II only).
  public shared(msg) func requestFactoryReset() : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };

    let cid = switch (userCanisters.get(user)) {
      case null {
        return #err(
          "Reset to factory state is only available while your site is attached to the ICE network."
        );
      };
      case (?c) { c };
    };

    // Owner-only: must be the II linked as site owner (not merely any IC controller)
    switch (siteOwners.get(cid)) {
      case (?o) {
        if (not Principal.equal(o, user)) {
          return #err(
            "Not authorized: only the linked site owner Internet Identity may request a factory reset"
          );
        };
      };
      case null {
        // Fall back: caller must match userCanisters key (already true) and be a controller
        let allowed = await isSiteController(cid, user);
        if (not allowed) {
          return #err("Not authorized: only the site owner may request a factory reset");
        };
      };
    };

    let rem = userResetCooldownRemaining(cid);
    if (rem > 0) {
      let hoursLeft = rem / (60 * 60 * 1_000_000_000);
      return #err(
        "Rate limited: user factory reset is allowed once per 24 hours. Try again in about "
          # Int.toText(if (hoursLeft < 1) { 1 } else { hoursLeft })
          # " hour(s). Emergency: master Profile → Resets."
      );
    };

    let siteOwner = switch (await resolveSiteOwner(cid)) {
      case (?o) { o };
      case null { user };
    };

    let result = await performFactoryReset(cid, siteOwner, user, "user");
    switch (result) {
      case (#ok _) {
        lastUserReset.put(cid, Time.now());
      };
      case (#err _) {};
    };
    result
  };

  /// Master/ops: force-reset any registered (minted) site even if user offline / site broken.
  /// No user rate limit. Factory owner only. Always logged.
  public shared(msg) func adminForceResetSite(site : Principal) : async OpResult {
    if (not isOwner(msg.caller)) {
      return #err("Not authorized — factory owner only");
    };
    if (Principal.isAnonymous(site)) { return #err("Invalid site") };

    // Must be known to factory or Registry
    var known = false;
    switch (siteOwners.get(site)) {
      case (?_) { known := true };
      case null {};
    };
    if (not known) {
      for ((_, c) in userCanisters.entries()) {
        if (Principal.equal(c, site)) { known := true };
      };
    };
    if (not known and registryConfigured()) {
      try {
        known := await registryActor().isFactoryMinted(site);
      } catch (_) {};
    };
    if (not known) {
      return #err("Unknown canister — not in factory mint records / Registry");
    };

    let siteOwner = switch (await resolveSiteOwner(site)) {
      case (?o) { o };
      case null {
        return #err("Cannot resolve site owner for reinstall init args");
      };
    };

    await performFactoryReset(site, siteOwner, msg.caller, "emergency")
  };

  public query func getResetLog(limit : Nat) : async [ResetLogEntry] {
    let maxN = if (limit == 0 or limit > 100) { 50 } else { limit };
    let n = resetLogEntries.size();
    if (n == 0) { return [] };
    let start = if (n > maxN) { n - maxN } else { 0 };
    Array.tabulate<ResetLogEntry>(n - start, func(i) { resetLogEntries[start + i] })
  };

  /// All known sites (user, site) for master emergency panel — linked and last-known.
  public query func listRegisteredSites() : async [(Principal, Principal, Bool)] {
    let buf = Buffer.Buffer<(Principal, Principal, Bool)>(0);
    // Linked first
    for ((u, c) in userCanisters.entries()) {
      buf.add((u, c, true));
    };
    // Owners not currently linked
    for ((c, u) in siteOwners.entries()) {
      var already = false;
      for ((u2, c2) in userCanisters.entries()) {
        if (Principal.equal(c2, c)) { already := true };
      };
      if (not already) {
        buf.add((u, c, false));
      };
    };
    Buffer.toArray(buf)
  };

  /// Shared upgrade path: install latest stored user_site WASM with #upgrade (data preserved).
  private func performUserSiteUpgrade(cid : Principal, siteOwner : Principal) : async OpResult {
    if (userSiteWasm.size() < 8) {
      return #err("No user_site WASM on factory. Ops must upload WASM first.");
    };
    switch (await requireFactoryController(cid)) {
      case (?err) { return #err(err) };
      case null {};
    };
    let initArg = to_candid (siteOwner);
    try {
      // Enhanced orthogonal persistence requires wasm_memory_persistence on upgrade.
      await IC_MANAGEMENT.install_code({
        mode = #upgrade(
          ?{
            skip_pre_upgrade = null;
            wasm_memory_persistence = ?#keep;
          }
        );
        canister_id = cid;
        wasm_module = userSiteWasm;
        arg = initArg;
        sender_canister_version = null;
      });
    } catch (e) {
      return #err("Upgrade failed: " # Error.message(e));
    };
    // Keep owner aligned with factory mapping so II owner can upload photos
    try {
      ignore await siteActor(cid).syncOwner(siteOwner);
    } catch (_) {};
    // Re-apply domain to site if we have a factory record
    switch (siteDomains.get(cid)) {
      case (?rec) {
        try {
          ignore await siteActor(cid).setDomainConnection(rec.domain, rec.publicUrl);
          if (rec.dnsConfigured) {
            ignore await siteActor(cid).confirmDnsConfigured();
          };
        } catch (_) {};
      };
      case null {};
    };
    #ok("Upgraded site " # Principal.toText(cid) # " to latest user_site WASM")
  };

  /// Factory owner: re-sync site canister owner from factory mapping (fixes photo upload auth).
  public shared(msg) func adminSyncSiteOwner(site : Principal) : async OpResult {
    if (not isOwner(msg.caller)) {
      return #err("Not authorized — factory owner only");
    };
    let siteOwner = switch (await resolveSiteOwner(site)) {
      case (?o) { o };
      case null {
        switch (siteOwners.get(site)) {
          case (?o) { o };
          case null { return #err("Cannot resolve site owner") };
        }
      };
    };
    try {
      let r = await siteActor(site).syncOwner(siteOwner);
      #ok(r)
    } catch (e) {
      let em = Error.message(e);
      if (Text.contains(em, #text "IC0536") or Text.contains(em, #text "has no update method")) {
        #ok(
          "Site has no syncOwner method (old WASM). Factory registry owner is "
            # Principal.toText(siteOwner)
            # " — that is authoritative for My Site / transfer."
        )
      } else {
        #err("syncOwner failed: " # em)
      }
    }
  };

  /// Upgrade caller's site to latest stored user_site WASM (factory must be controller).
  public shared(msg) func upgradeMySite() : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    let cid = switch (resolveCallerSite(user)) {
      case null { return #err("No website") };
      case (?c) { c };
    };
    var owns = false;
    switch (siteOwners.get(cid)) {
      case (?o) { if (Principal.equal(o, user)) { owns := true } };
      case null {};
    };
    switch (userCanisters.get(user)) {
      case (?c) { if (Principal.equal(c, cid)) { owns := true } };
      case null {};
    };
    if (not owns and not isOwner(user)) {
      return #err("Not authorized to upgrade this site");
    };
    let siteOwner = switch (siteOwners.get(cid)) {
      case (?o) { o };
      case null { user };
    };
    await performUserSiteUpgrade(cid, siteOwner)
  };

  /// Factory owner: upgrade any known site to latest user_site WASM (preserves stable data).
  public shared(msg) func adminUpgradeUserSite(site : Principal) : async OpResult {
    if (not isOwner(msg.caller)) {
      return #err("Not authorized — factory owner only");
    };
    if (Principal.isAnonymous(site)) { return #err("Invalid site") };

    var known = false;
    switch (siteOwners.get(site)) {
      case (?_) { known := true };
      case null {};
    };
    if (not known) {
      for ((_, c) in userCanisters.entries()) {
        if (Principal.equal(c, site)) { known := true };
      };
    };
    if (not known and registryConfigured()) {
      try {
        known := await registryActor().isFactoryMinted(site);
      } catch (_) {};
    };
    if (not known) {
      return #err("Unknown canister — not in factory mint records / Registry");
    };

    let siteOwner = switch (await resolveSiteOwner(site)) {
      case (?o) { o };
      case null {
        switch (siteOwners.get(site)) {
          case (?o) { o };
          case null {
            return #err("Cannot resolve site owner for upgrade init args");
          };
        }
      };
    };

    await performUserSiteUpgrade(site, siteOwner)
  };

  // ---------- detach / reattach (ICP fees) ----------

  /// Detach enabled. Set true only to emergency-pause.
  private let DETACH_PAUSED : Bool = false;
  /// Match user_site LOW_CYCLES_THRESHOLD (2 T) — refuse detach when site may freeze soon.
  private let SITE_DETACH_MIN_CYCLES : Nat = 2_000_000_000_000;
  /// Registry / factory alert floor for ops dashboards
  private let REGISTRY_LOW_CYCLES : Nat = 200_000_000_000; // 0.2 T

  /// Ops health: factory mint capacity + optional registry balance (if configured).
  public shared func getNetworkCyclesHealth() : async {
    factoryCycles : Nat;
    factoryCanMint : Bool;
    factoryMinMint : Nat;
    registryCycles : ?Nat;
    registryLow : Bool;
    message : Text;
  } {
    let fBal = ExperimentalCycles.balance();
    let canMint = fBal >= MIN_FACTORY_BALANCE and userSiteWasm.size() >= 8;
    var regBal : ?Nat = null;
    var regLow = false;
    if (registryConfigured()) {
      try {
        let reg = actor (Principal.toText(registryId)) : actor {
          getCyclesBalance : shared query () -> async Nat;
        };
        let b = await reg.getCyclesBalance();
        regBal := ?b;
        regLow := b < REGISTRY_LOW_CYCLES;
      } catch (_) {
        regLow := true;
      };
    };
    {
      factoryCycles = fBal;
      factoryCanMint = canMint;
      factoryMinMint = MIN_FACTORY_BALANCE;
      registryCycles = regBal;
      registryLow = regLow;
      message = if (not canMint) {
        "Factory cannot mint sites (low cycles or missing WASM)."
      } else if (regLow and registryConfigured()) {
        "Factory OK; Registry cycles low or unreadable — top up Registry soon."
      } else {
        "Factory mint capacity OK."
      };
    }
  };

  /// Detach: unlink site from the main ICE network index. User canister stays intact
  /// (controllers, data, domain). Mint record remains in the central Registry for reattach.
  /// Requires domain + public URL + DNS confirmed + healthy site cycles. Fee via II approve + chargeIcp.
  public shared(msg) func detach() : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };

    if (DETACH_PAUSED) {
      return #err("Detach is temporarily paused by the network operator.");
    };

    switch (userCanisters.get(user)) {
      case null {
        return #err("No linked website to detach. Create or reattach a site first.");
      };
      case (?cid) {
        // Gate: URL + DNS + domain record integrity (host match + index)
        var ready = false;
        var integrityOk = false;
        switch (siteDomains.get(cid)) {
          case (?rec) {
            integrityOk := domainRecordIntegrity(rec);
            ready := domainReady(rec);
            // Ensure domain still maps to this site before detach
            if (ready) {
              switch (domainIndex.get(rec.domain)) {
                case (?mapped) {
                  if (not Principal.equal(mapped, cid)) {
                    ready := false;
                    integrityOk := false;
                  };
                };
                case null {
                  ready := false;
                  integrityOk := false;
                };
              };
            };
          };
          case null { ready := false };
        };
        if (not ready) {
          // Site fallback only when no factory record, or factory record is integrity-clean
          // (never bypass a mismatched domain / public URL on the factory index).
          switch (siteDomains.get(cid)) {
            case null {
              try {
                ready := await siteActor(cid).isReadyToDetach();
              } catch (_) {};
            };
            case (?_) {
              if (integrityOk) {
                try {
                  ready := await siteActor(cid).isReadyToDetach();
                } catch (_) {};
              };
            };
          };
        };
        if (not ready) {
          return #err(
            "Before detach: connect a public URL and DNS for this website (My Site → Domain & DNS), confirm DNS after ICP validate succeeds, and ensure public URL host matches domain."
          );
        };

        // On-chain re-validate domain before detach — fail closed
        switch (siteDomains.get(cid)) {
          case (?rec) {
            switch (await validateDomainOnChain(rec.domain)) {
              case (#err e) {
                return #err("Detach blocked — domain re-validation failed: " # e);
              };
              case (#ok _) {};
            };
          };
          case null {};
        };

        // Gate: site must not be near freeze (low cycles)
        var cyclesLow = false;
        var cyclesBal : Nat = 0;
        try {
          let g = await siteActor(cid).getCyclesGauge();
          cyclesBal := g.balance;
          cyclesLow := g.lowCycles or g.balance < SITE_DETACH_MIN_CYCLES;
        } catch (_) {
          try {
            cyclesLow := await siteActor(cid).isLowCycles();
          } catch (_) {
            // Unreadable: allow detach but message if we know low only
            cyclesLow := false;
          };
        };
        if (cyclesLow) {
          return #err(
            "Detach blocked: site cycles are low ("
              # Nat.toText(cyclesBal)
              # " e8s-scale balance units; need at least ~2 T). Top up the site canister via NNS first so it does not freeze while independent."
          );
        };

        switch (await chargeIcp(user, DETACH_FEE_E8S)) {
          case (?err) { return #err(err) };
          case null {};
        };

        try {
          ignore await siteActor(cid).onDetach();
        } catch (_) {};

        // Unlink from live network maps — canister + Registry mint record remain
        userCanisters.delete(user);
        activeSubs.put(cid, false);
        lastSite.put(user, cid);
        siteOwners.put(cid, user);
        await markDetachedInRegistry(cid);

        // ICE main: hide this author's posts from global/public feeds (self + followers only)
        try {
          ignore await ICE_NETWORK_PRIVACY.setUserNetworkPrivate(user, true);
        } catch (_) {};

        #ok(
          "Detached " # Principal.toText(cid)
            # " from the ICE network. Your canister is intact; reattach anytime if it was factory-minted. Posts stay visible to you and people who follow you only."
        )
      };
    }
  };

  /// Reattach (relink): rejoin the ICE factory network.
  /// Registry must confirm the canister was previously minted by this Factory — rejects all others.
  /// Optional siteId: if null, uses lastSite for caller.
  public shared(msg) func relink(siteId : ?Principal) : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };

    switch (userCanisters.get(user)) {
      case (?existing) {
        return #err(
          "Already linked to " # Principal.toText(existing)
        );
      };
      case null {};
    };

    let cid = switch (siteId) {
      case (?s) { s };
      case null {
        switch (lastSite.get(user)) {
          case (?s) { s };
          case null {
            return #err("No site to reattach. Pass your canister principal or create a new site.");
          };
        }
      };
    };

    // Registry gate: only factory-minted canisters may rejoin (no local-only bypass when Registry is live)
    if (registryConfigured()) {
      var minted = false;
      var regUnreachable : ?Text = null;
      try {
        minted := await registryActor().isEligibleForReattach(cid);
      } catch (e) {
        regUnreachable := ?Error.message(e);
      };
      switch (regUnreachable) {
        case (?msg) {
          return #err(
            "Reattach blocked: Registry unreachable (" # msg # "). Retry later or contact ops."
          );
        };
        case null {};
      };
      if (not minted) {
        return #err(
          "Reattach rejected: canister "
            # Principal.toText(cid)
            # " was not minted by this ICE Factory (Registry has no record)."
        );
      };
    } else {
      let minted = await registryAllowsReattach(cid);
      if (not minted) {
        return #err(
          "Reattach rejected: no local mint record and Registry is not configured."
        );
      };
    };

    // Must own this site according to factory records, or be site.getOwner
    var owns = false;
    switch (siteOwners.get(cid)) {
      case (?o) { if (Principal.equal(o, user)) { owns := true } };
      case null {};
    };
    if (not owns) {
      try {
        let o = await siteActor(cid).getOwner();
        if (Principal.equal(o, user)) { owns := true };
      } catch (e) {
        return #err("Cannot verify site ownership: " # Error.message(e));
      };
    };
    if (not owns) {
      return #err("Not the owner of this canister");
    };

    // Another user must not already have this site linked
    for ((u, c) in userCanisters.entries()) {
      if (Principal.equal(c, cid) and not Principal.equal(u, user)) {
        return #err("Site is already linked to another user");
      };
    };

    // Pre-pay checks done. Charge, then mutate; refund if post-pay work fails.
    switch (await chargeIcp(user, RELINK_FEE_E8S)) {
      case (?err) { return #err(err) };
      case null {};
    };

    let factoryId = Principal.fromActor(this);
    try {
      ignore await siteActor(cid).onRelink(factoryId);
    } catch (e) {
      let refundNote = switch (await refundIcp(user, RELINK_FEE_E8S)) {
        case null { " ICP fee refunded." };
        case (?rerr) { " ICP fee NOT refunded (" # rerr # ") — contact support." };
      };
      return #err(
        "Reattach failed after payment: " # Error.message(e) # "." # refundNote
      );
    };

    userCanisters.put(user, cid);
    lastSite.put(user, cid);
    siteOwners.put(cid, user);
    activeSubs.put(cid, true);
    await markRelinkedInRegistry(cid, user);

    // ICE main: posts public again on reattach
    try {
      ignore await ICE_NETWORK_PRIVACY.setUserNetworkPrivate(user, false);
    } catch (_) {};

    #ok("Reattached " # Principal.toText(cid) # " to the ICE network")
  };

  /// Public helper: can this canister reattach? (Registry / local mint record)
  public shared func isEligibleForReattach(site : Principal) : async Bool {
    await registryAllowsReattach(site)
  };

  // ---------- cycles top-up ----------

  /// If site cycles fall below ~1T, charge 0.5 ICP (ICRC-2 from payer) via CMC → site cycles.
  /// Best-effort: silent no-op on failure (no approve, low ICP, status unreadable, etc.).
  private let CHECK_TOPUP_MIN_CYCLES : Nat = 999_000_000_000;
  private let CHECK_TOPUP_ICP_E8S : Nat = 50_000_000; // 0.5 ICP

  private func checkAndTopUpWithPayer(payer : Principal, userSite : Principal) : async () {
    if (Principal.isAnonymous(payer) or Principal.isAnonymous(userSite)) { return };

    var bal : Nat = 0;
    var gotBal = false;
    try {
      let st = await IC_STATUS.canister_status({ canister_id = userSite });
      bal := st.cycles;
      gotBal := true;
    } catch (_) {
      try {
        let g = await siteActor(userSite).getCyclesGauge();
        bal := g.balance;
        gotBal := true;
      } catch (_) {};
    };
    if (not gotBal) { return };
    if (bal >= CHECK_TOPUP_MIN_CYCLES) { return };

    let amount : Nat = CHECK_TOPUP_ICP_E8S;
    // ICRC-2: payer → CMC (site subaccount) + TPUP memo, then notify_top_up → userSite
    let transferResult = await IcpLedger.icrc2_transfer_from({
      spender_subaccount = null;
      from = { owner = payer; subaccount = null };
      to = {
        owner = CMC_PRINCIPAL;
        subaccount = ?userDepositSubaccount(userSite);
      };
      amount = amount;
      fee = ?ICP_TRANSFER_FEE_E8S;
      memo = ?CMC_TOP_UP_MEMO;
      created_at_time = null;
    });
    switch (transferResult) {
      case (#Err _) {};
      case (#Ok blockIndex) {
        try {
          ignore await CMC.notify_top_up({
            block_index = Nat64.fromNat(blockIndex);
            canister_id = userSite;
          });
        } catch (_) {};
      };
    };
  };

  /// Auto top-up when site cycles < ~1T: 0.5 ICP from caller (ICRC-2) → CMC → userSite cycles.
  /// Site canisters may call with userSite = self; payer is resolved to the site owner.
  /// Does not trap. Not used on detach.
  public shared({ caller }) func checkAndTopUp(userSite : Principal) : async () {
    if (Principal.isAnonymous(caller) or Principal.isAnonymous(userSite)) { return };

    var payer = caller;
    // Photo path: user_site invokes factory — charge the site owner, not the canister
    if (Principal.equal(caller, userSite)) {
      switch (siteOwners.get(userSite)) {
        case (?o) { payer := o };
        case null {
          try {
            payer := await siteActor(userSite).getOwner();
          } catch (_) { return };
        };
      };
    };

    await checkAndTopUpWithPayer(payer, userSite)
  };

  /// Quote ICP e8s required to top up `cyclesAmount` cycles.
  public query func quoteTopUpIcpE8s(cyclesAmount : Nat) : async Nat {
    icpForCycles(cyclesAmount)
  };

  /// Legacy factory-mediated top-up (ICRC-2). Prefer NNS "Add cycles" on the site canister itself —
  /// UI uses NNS-only top-up so users pay from their NNS wallet without ICE II approve.
  /// `amount` = cycles to deposit. Factory must hold enough cycles.
  public shared(msg) func topUpCycles(canisterId : Principal, amount : Nat) : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    if (amount == 0) { return #err("amount (cycles) must be > 0") };

    // Ownership: linked owner, last site, siteOwners map, or site.getOwner
    var allowed = false;
    switch (userCanisters.get(user)) {
      case (?c) { if (Principal.equal(c, canisterId)) { allowed := true } };
      case null {};
    };
    if (not allowed) {
      switch (lastSite.get(user)) {
        case (?c) { if (Principal.equal(c, canisterId)) { allowed := true } };
        case null {};
      };
    };
    if (not allowed) {
      switch (siteOwners.get(canisterId)) {
        case (?o) { if (Principal.equal(o, user)) { allowed := true } };
        case null {};
      };
    };
    if (not allowed) {
      try {
        let o = await siteActor(canisterId).getOwner();
        if (Principal.equal(o, user)) { allowed := true };
      } catch (_) {};
    };
    // Factory deployer can top up any site (ops recovery)
    if (not allowed and not isOwner(user)) {
      return #err(
        "Not authorized to top up this canister. Log in with the Internet Identity that owns this site (same II as My Site)."
      );
    };

    let factoryBal = ExperimentalCycles.balance();
    // Keep 100B headroom on factory — check BEFORE charging ICP
    if (factoryBal < amount + 100_000_000_000) {
      return #err(
        "Factory is temporarily low on cycles for deposits (have "
          # Nat.toText(factoryBal) # ", need "
          # Nat.toText(amount + 100_000_000_000)
          # "). No ICP was charged. Try again later or contact ops."
      );
    };

    let icpCost = icpForCycles(amount);
    // Cycles availability already checked — charge only after gates pass
    switch (await chargeIcp(user, icpCost)) {
      case (?err) { return #err(err) };
      case null {};
    };

    try {
      await (
        with cycles = amount
      ) IC_DEPOSIT.deposit_cycles({ canister_id = canisterId });
    } catch (e) {
      let refundNote = switch (await refundIcp(user, icpCost)) {
        case null { " ICP fee refunded." };
        case (?rerr) { " ICP fee NOT refunded (" # rerr # ") — contact support." };
      };
      return #err(
        "deposit_cycles failed: " # Error.message(e) # "." # refundNote
      );
    };

    #ok(
      "Deposited " # Nat.toText(amount) # " cycles into "
        # Principal.toText(canisterId)
        # " (charged " # Nat.toText(icpCost) # " e8s ICP)"
    )
  };

  // ---------- admin link helpers ----------

  public shared(msg) func adminLinkUserCanister(user : Principal, site : Principal) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (Principal.isAnonymous(user)) { return "Invalid user" };
    userCanisters.put(user, site);
    lastSite.put(user, site);
    siteOwners.put(site, user);
    activeSubs.put(site, true);
    "Linked " # Principal.toText(user) # " -> " # Principal.toText(site)
  };

  public shared(msg) func adminUnlinkUserCanister(user : Principal) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    switch (userCanisters.get(user)) {
      case null { "No link for " # Principal.toText(user) };
      case (?cid) {
        userCanisters.delete(user);
        activeSubs.put(cid, false);
        lastSite.put(user, cid);
        "Unlinked " # Principal.toText(user) # " from " # Principal.toText(cid)
      };
    }
  };

  public shared(msg) func adminRecreateUserSite(user : Principal) : async CreateUserSiteResult {
    if (not isOwner(msg.caller)) { return #err("Not authorized") };
    switch (userCanisters.get(user)) {
      case (?old) {
        userCanisters.delete(user);
        activeSubs.put(old, false);
      };
      case null {};
    };
    await provisionFor(user, true)
  };

  public shared(msg) func cancelSubscription(user : Principal) : async Text {
    if (not isOwner(msg.caller) and not Principal.equal(msg.caller, user)) {
      return "Not authorized";
    };
    switch (userCanisters.get(user)) {
      case null { return "No canister" };
      case (?cid) {
        activeSubs.put(cid, false);
        "Subscription cancelled"
      };
    }
  };

  /// Apply standard multi-controllers (owner + NNS founder + dfx + factory).
  public shared(msg) func applyStandardControllers(user : Principal) : async Text {
    if (not isOwner(msg.caller) and not Principal.equal(msg.caller, user)) {
      return "Not authorized";
    };
    switch (userCanisters.get(user)) {
      case null { return "No canister" };
      case (?cid) {
        switch (await applyStandardControllersInternal(user, cid)) {
          case (?err) {
            "applyStandardControllers failed (factory must be a controller): " # err
          };
          case null {
            "Controllers set: owner II + NNS (gmtr2) + dfx + factory on " # Principal.toText(cid)
          };
        }
      };
    }
  };

  /// Alias of applyStandardControllers (dfx is already in the default set).
  public shared(msg) func applyStandardControllersWithOps(user : Principal) : async Text {
    await applyStandardControllers(user)
  };

  /// Public docs for UI: who is on the standard controller set.
  public query func getControllerPolicy() : async {
    roles : [(Text, Text)];
    factoryMustRemain : Bool;
    dfxInDefault : Bool;
    note : Text;
  } {
    {
      roles = [
        ("owner", "Site owner Internet Identity — full control of their canister"),
        ("nns_founder", Principal.toText(NNS_CONTROLLER) # " — NNS visibility / founder recovery"),
        ("dfx_ops", Principal.toText(DFX_CONTROLLER) # " — dfx deploy / ops recovery"),
        ("factory", "This Factory principal — mint, reset, upgrade, relink via factory methods"),
      ];
      factoryMustRemain = true;
      dfxInDefault = true;
      note = "Default controllers: owner + NNS founder + dfx + factory. Destructive recovery should still prefer Factory APIs (requestFactoryReset / adminForceResetSite).";
    }
  };

  /// Owner/ops: set explicit controller list. Factory principal is always forced into the list
  /// so reset/upgrade recovery never permanently loses Factory control.
  public shared(msg) func adminSetControllers(site : Principal, controllers : [Principal]) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (controllers.size() == 0) { return "Need at least one controller" };
    let factoryId = Principal.fromActor(this);
    var hasFactory = false;
    for (c in controllers.vals()) {
      if (Principal.equal(c, factoryId)) { hasFactory := true };
    };
    let finalControllers : [Principal] = if (hasFactory) {
      controllers
    } else {
      Array.tabulate<Principal>(controllers.size() + 1, func(i) {
        if (i < controllers.size()) { controllers[i] } else { factoryId }
      })
    };
    try {
      await IC_MANAGEMENT.update_settings({
        canister_id = site;
        settings = {
          controllers = ?finalControllers;
          compute_allocation = null;
          memory_allocation = null;
          freezing_threshold = null;
          reserved_cycles_limit = null;
          log_visibility = null;
          wasm_memory_limit = null;
        };
        sender_canister_version = null;
      });
      "Controllers updated on "
        # Principal.toText(site)
        # (if (hasFactory) { "" } else { " (factory principal auto-added)" })
    } catch (e) {
      "adminSetControllers failed: " # Error.message(e)
    }
  };

  /// Public: is the Factory still a controller of this site? (ops / UI health)
  public shared func isFactoryControllerOf(site : Principal) : async Bool {
    await factoryIsController(site)
  };

  /// Legacy alias
  public shared(msg) func handoverControllers(user : Principal) : async Text {
    await applyStandardControllers(user)
  };

  public query func listActiveCanisters() : async [(Principal, Principal)] {
    let buf = Buffer.Buffer<(Principal, Principal)>(0);
    for ((u, c) in userCanisters.entries()) {
      switch (activeSubs.get(c)) {
        case (?true) { buf.add((u, c)) };
        case _ {};
      };
    };
    Buffer.toArray(buf)
  };

  // ---------- HTTP transform + domain validation (fail closed) ----------

  /// Strip non-deterministic headers for consensus on HTTP outcall responses.
  public query func transformHttpResponse(args : TransformArgs) : async HttpResponsePayload {
    {
      status = args.response.status;
      body = args.response.body;
      headers = [];
    }
  };

  /// Live ICP custom-domain validate via management http_request. Fail closed.
  private func validateDomainOnChain(domain : Text) : async OpResult {
    let d = normalizeHostname(domain);
    if (not validHostname(d)) {
      return #err("Invalid domain for on-chain validation.");
    };
    let bal = ExperimentalCycles.balance();
    if (bal < HTTP_OUTCALL_CYCLES + FACTORY_MIN_RESERVE_CYCLES) {
      return #err(
        "Factory cycles too low for domain validation outcall (need reserve). Try again later."
      );
    };
    let url =
      "https://icp0.io/custom-domains/v1/"
        # d
        # "/validate";
    try {
      let res = await (
        with cycles = HTTP_OUTCALL_CYCLES
      ) IC_HTTP.http_request({
        url;
        max_response_bytes = ?Nat64.fromNat(10_000);
        headers = [{ name = "User-Agent"; value = "ICE-Factory/1.0" }];
        body = null;
        method = #get;
        transform = ?{
          function = transformHttpResponse;
          context = Blob.fromArray([]);
        };
      });
      if (res.status >= 200 and res.status < 300) {
        #ok("ICP validate HTTP " # Nat.toText(res.status) # " for " # d)
      } else {
        #err(
          "ICP domain validate failed (HTTP "
            # Nat.toText(res.status)
            # ") for "
            # d
            # ". Fix DNS / ic-domains / registration, then retry."
        )
      }
    } catch (e) {
      #err(
        "Domain validation outcall failed (fail closed): "
          # Error.message(e)
      )
    }
  };

  /// Soft probe for UI/ops (does not mutate state).
  public shared(msg) func probeDomainValidate(domain : Text) : async OpResult {
    if (Principal.isAnonymous(msg.caller)) { return #err("Anonymous") };
    await validateDomainOnChain(domain)
  };

  // ---------- Auto cycle top-up + owner alerts ----------

  private func dayBucketNow() : Int {
    Time.now() / DAY_NS
  };

  private func pushAlert(
    site : Principal,
    ownerP : Principal,
    balance : Nat,
    kind : Text,
    message : Text
  ) {
    let entry : CycleAlert = {
      site;
      owner = ownerP;
      at = Time.now();
      balance;
      kind;
      message;
    };
    let buf = Buffer.Buffer<CycleAlert>(cycleAlertEntries.size() + 1);
    for (a in cycleAlertEntries.vals()) { buf.add(a) };
    buf.add(entry);
    // keep last 100
    let arr = Buffer.toArray(buf);
    let start = if (arr.size() > 100) { arr.size() - 100 } else { 0 };
    cycleAlertEntries := Array.tabulate<CycleAlert>(
      arr.size() - start,
      func(i) { arr[start + i] }
    );
  };

  /// Owner enables auto top-up with explicit caps (requires ICP ICRC-2 allowance when triggered).
  public shared(msg) func setAutoTopUp(
    enabled : Bool,
    maxIcpE8sPerTopUp : Nat,
    maxTopUpsPerDay : Nat
  ) : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    switch (userCanisters.get(user)) {
      case null {
        return #err("No linked site. Auto top-up only for linked (non-detached) sites.");
      };
      case (?_) {};
    };
    if (enabled) {
      if (maxIcpE8sPerTopUp == 0 or maxIcpE8sPerTopUp > 500_000_000) {
        return #err("maxIcpE8sPerTopUp must be between 1 and 5 ICP (e8s).");
      };
      let dayCap = if (maxTopUpsPerDay == 0) { 1 } else if (maxTopUpsPerDay > AUTO_TOPUP_MAX_PER_DAY) {
        AUTO_TOPUP_MAX_PER_DAY
      } else { maxTopUpsPerDay };
      autoTopUp.put(
        user,
        {
          enabled = true;
          maxIcpE8sPerTopUp;
          maxTopUpsPerDay = dayCap;
          topUpsToday = 0;
          dayBucket = dayBucketNow();
          lastTopUpAt = 0;
        }
      );
      #ok(
        "Auto top-up ON for your site. Caps: "
          # Nat.toText(maxIcpE8sPerTopUp)
          # " e8s ICP/top-up, "
          # Nat.toText(dayCap)
          # "/day. Pre-approve factory ICRC-2 allowance before low-cycle events. Factory never spends its own reserve."
      )
    } else {
      autoTopUp.put(
        user,
        {
          enabled = false;
          maxIcpE8sPerTopUp = 0;
          maxTopUpsPerDay = 0;
          topUpsToday = 0;
          dayBucket = dayBucketNow();
          lastTopUpAt = 0;
        }
      );
      #ok("Auto top-up OFF.")
    }
  };

  public query func getAutoTopUpStatus(user : Principal) : async ?AutoTopUpPref {
    autoTopUp.get(user)
  };

  public query func getMyCycleAlerts(limit : Nat) : async [CycleAlert] {
    // Note: query has no msg.caller in older Motoko — expose filtered list via shared query pattern
    // Use shared method below for auth.
    let maxN = if (limit == 0 or limit > 50) { 20 } else { limit };
    let n = cycleAlertEntries.size();
    if (n == 0) { return [] };
    let start = if (n > maxN) { n - maxN } else { 0 };
    Array.tabulate<CycleAlert>(n - start, func(i) { cycleAlertEntries[start + i] })
  };

  public shared query(msg) func getOwnerCycleAlerts(limit : Nat) : async [CycleAlert] {
    let user = msg.caller;
    let maxN = if (limit == 0 or limit > 50) { 20 } else { limit };
    let buf = Buffer.Buffer<CycleAlert>(0);
    let n = cycleAlertEntries.size();
    var i = n;
    while (i > 0 and buf.size() < maxN) {
      i -= 1;
      let a = cycleAlertEntries[i];
      if (Principal.equal(a.owner, user)) { buf.add(a) };
    };
    Buffer.toArray(buf)
  };

  /// Trigger auto top-up for caller's site if enabled, low, and factory has reserve.
  /// Charges owner's ICP (ICRC-2) — never drains factory.
  public shared(msg) func tryAutoTopUpMySite() : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    let cid = switch (userCanisters.get(user)) {
      case null { return #err("No linked site (detached sites are skipped).") };
      case (?c) { c };
    };
    await runAutoTopUp(user, cid)
  };

  /// Ops/public nudge: attempt auto top-up for a linked site if owner enabled it.
  public shared(_msg) func tryAutoTopUpSite(site : Principal) : async OpResult {
    let ownerP = switch (siteOwners.get(site)) {
      case (?o) { o };
      case null { return #err("Unknown site owner") };
    };
    // Must still be linked
    switch (userCanisters.get(ownerP)) {
      case (?c) {
        if (not Principal.equal(c, site)) {
          return #err("Site not currently linked (detached) — skip.");
        };
      };
      case null { return #err("Owner has no linked site — skip.") };
    };
    await runAutoTopUp(ownerP, site)
  };

  private func runAutoTopUp(user : Principal, cid : Principal) : async OpResult {
    let pref = switch (autoTopUp.get(user)) {
      case null {
        return #err("Auto top-up not enabled. Call setAutoTopUp(true, ...) first.");
      };
      case (?p) {
        if (not p.enabled) {
          return #err("Auto top-up is disabled for this owner.");
        };
        p
      };
    };

    // Factory headroom — never drain
    let factoryBal = ExperimentalCycles.balance();
    if (factoryBal < FACTORY_MIN_RESERVE_CYCLES + AUTO_TOPUP_DEPOSIT) {
      pushAlert(cid, user, factoryBal, "factory_reserve", "Factory reserve too low for auto top-up");
      return #err(
        "Factory reserve too low for auto top-up (protecting factory). No ICP charged."
      );
    };

    // Day bucket reset
    var p = pref;
    let bucket = dayBucketNow();
    if (p.dayBucket != bucket) {
      p := {
        enabled = p.enabled;
        maxIcpE8sPerTopUp = p.maxIcpE8sPerTopUp;
        maxTopUpsPerDay = p.maxTopUpsPerDay;
        topUpsToday = 0;
        dayBucket = bucket;
        lastTopUpAt = p.lastTopUpAt;
      };
    };
    if (p.topUpsToday >= p.maxTopUpsPerDay) {
      pushAlert(cid, user, 0, "cap", "Daily auto top-up cap reached");
      return #err("Daily auto top-up cap reached. Raise cap or wait until tomorrow.");
    };

    // Site cycles
    var bal : Nat = 0;
    var low = false;
    try {
      let g = await siteActor(cid).getCyclesGauge();
      bal := g.balance;
      low := g.lowCycles or g.balance < AUTO_TOPUP_THRESHOLD;
    } catch (_) {
      try {
        low := await siteActor(cid).isLowCycles();
      } catch (e) {
        pushAlert(cid, user, 0, "read_fail", Error.message(e));
        return #err("Could not read site cycles: " # Error.message(e));
      };
    };
    if (not low) {
      return #ok(
        "Site cycles healthy (" # Nat.toText(bal) # "). No top-up needed."
      );
    };

    pushAlert(cid, user, bal, "low", "Site below auto top-up threshold");

    let amount = AUTO_TOPUP_DEPOSIT;
    let icpCost = icpForCycles(amount);
    if (icpCost > p.maxIcpE8sPerTopUp) {
      pushAlert(cid, user, bal, "budget", "ICP cost exceeds owner maxIcpE8sPerTopUp");
      return #err(
        "Top-up would cost "
          # Nat.toText(icpCost)
          # " e8s ICP but your cap is "
          # Nat.toText(p.maxIcpE8sPerTopUp)
          # ". Raise maxIcpE8sPerTopUp or top up manually."
      );
    };

    // Re-check factory after async gap
    let factoryBal2 = ExperimentalCycles.balance();
    if (factoryBal2 < FACTORY_MIN_RESERVE_CYCLES + amount) {
      return #err("Factory reserve check failed before deposit. No ICP charged.");
    };

    switch (await chargeIcp(user, icpCost)) {
      case (?err) {
        pushAlert(cid, user, bal, "charge_fail", err);
        return #err("ICP charge failed (approve allowance?): " # err);
      };
      case null {};
    };

    try {
      await (
        with cycles = amount
      ) IC_DEPOSIT.deposit_cycles({ canister_id = cid });
    } catch (e) {
      let refundNote = switch (await refundIcp(user, icpCost)) {
        case null { " ICP refunded." };
        case (?rerr) { " ICP NOT refunded (" # rerr # ")." };
      };
      pushAlert(cid, user, bal, "topup_fail", Error.message(e));
      return #err("deposit_cycles failed: " # Error.message(e) # "." # refundNote);
    };

    autoTopUp.put(
      user,
      {
        enabled = p.enabled;
        maxIcpE8sPerTopUp = p.maxIcpE8sPerTopUp;
        maxTopUpsPerDay = p.maxTopUpsPerDay;
        topUpsToday = p.topUpsToday + 1;
        dayBucket = p.dayBucket;
        lastTopUpAt = Time.now();
      }
    );
    pushAlert(
      cid,
      user,
      bal + amount,
      "topup_ok",
      "Auto top-up deposited " # Nat.toText(amount) # " cycles"
    );
    #ok(
      "Auto top-up: deposited "
        # Nat.toText(amount)
        # " cycles into "
        # Principal.toText(cid)
        # " (charged "
        # Nat.toText(icpCost)
        # " e8s ICP from owner)."
    )
  };

  /// Scan linked sites (limit) and attempt auto top-up where enabled. Skips detached.
  public shared(msg) func scanAutoTopUpLinked(limit : Nat) : async Text {
    if (not isOwner(msg.caller)) {
      return "Not authorized — factory owner only for batch scan";
    };
    let maxN = if (limit == 0 or limit > 20) { 10 } else { limit };
    var okN = 0;
    var skipN = 0;
    var failN = 0;
    var n = 0;
    label sites for ((user, cid) in userCanisters.entries()) {
      if (n >= maxN) { break sites };
      n += 1;
      switch (autoTopUp.get(user)) {
        case null { skipN += 1 };
        case (?p) {
          if (not p.enabled) { skipN += 1 } else {
            switch (await runAutoTopUp(user, cid)) {
              case (#ok m) {
                if (Text.contains(m, #text "No top-up needed")) { skipN += 1 } else {
                  okN += 1
                };
              };
              case (#err _) { failN += 1 };
            };
          };
        };
      };
    };
    "scanAutoTopUp: ok="
      # Nat.toText(okN)
      # " skip="
      # Nat.toText(skipN)
      # " fail="
      # Nat.toText(failN)
  };

  // ---------- Auto-push latest WASM to controlled linked sites ----------

  public type WasmPushResult = {
    upgraded : Nat;
    skipped : Nat;
    failed : [(Principal, Text)];
  };

  /// Factory owner: push latest user_site WASM to linked sites where factory is controller.
  /// Skips detached, non-controlled, and critically low-cycle sites. Logs failures; never force.
  public shared(msg) func adminPushLatestWasmToAll(limit : Nat) : async WasmPushResult {
    if (not isOwner(msg.caller)) {
      return { upgraded = 0; skipped = 0; failed = [(Principal.fromActor(this), "Not authorized")] };
    };
    if (userSiteWasm.size() < 8) {
      return {
        upgraded = 0;
        skipped = 0;
        failed = [(Principal.fromActor(this), "No WASM on factory")];
      };
    };
    let maxN = if (limit == 0 or limit > 50) { 20 } else { limit };
    var upgraded : Nat = 0;
    var skipped : Nat = 0;
    let failed = Buffer.Buffer<(Principal, Text)>(0);
    var n = 0;
    label walk for ((user, cid) in userCanisters.entries()) {
      if (n >= maxN) { break walk };
      n += 1;
      // Detached sites are not in userCanisters — already skipped
      // Controller check
      let isCtrl = await factoryIsController(cid);
      if (not isCtrl) {
        skipped += 1;
        failed.add((cid, "Factory not controller — skip"));
        continue walk;
      };
      // Low cycles: skip force upgrade if near freeze
      try {
        let g = await siteActor(cid).getCyclesGauge();
        if (g.balance < 500_000_000_000) {
          skipped += 1;
          failed.add((cid, "Site cycles critically low — skip upgrade"));
          continue walk;
        };
      } catch (_) {
        // unreadable — try upgrade carefully
      };
      let siteOwner = switch (siteOwners.get(cid)) {
        case (?o) { o };
        case null { user };
      };
      switch (await performUserSiteUpgrade(cid, siteOwner)) {
        case (#ok _) { upgraded += 1 };
        case (#err e) {
          failed.add((cid, e));
        };
      };
    };
    { upgraded; skipped; failed = Buffer.toArray(failed) }
  };

  // ---------- site transfer (owner offer → recipient claim) ----------

  private func pushTransferLog(e : TransferLogEntry) {
    let buf = Buffer.Buffer<TransferLogEntry>(transferLogEntries.size() + 1);
    for (x in transferLogEntries.vals()) { buf.add(x) };
    buf.add(e);
    // Cap log at 200
    if (buf.size() > 200) {
      let start = buf.size() - 200;
      transferLogEntries := Array.tabulate<TransferLogEntry>(200, func(i) { buf.get(start + i) });
    } else {
      transferLogEntries := Buffer.toArray(buf);
    };
  };

  private func makeTransferCode(user : Principal) : Text {
    let t = Int.abs(Time.now());
    let h = Nat32.toNat(Principal.hash(user));
    "ICE-XFER-"
      # Nat.toText(t)
      # "-"
      # Nat.toText(h)
  };

  private func clearOfferMaps(site : Principal, code : Text) {
    transferOffers.delete(site);
    if (Text.size(code) > 0) { transferCodes.delete(code) };
  };

  /// Full handoff: registry + controllers + site syncOwner. Caller already authorized.
  private func performSiteHandoff(fromOwner : Principal, toOwner : Principal, site : Principal) : async OpResult {
    if (Principal.isAnonymous(toOwner)) { return #err("Invalid recipient") };
    if (Principal.equal(fromOwner, toOwner)) {
      return #err("Recipient is already the owner");
    };
    switch (await requireFactoryController(site)) {
      case (?err) { return #err(err) };
      case null {};
    };
    // Multi-site: recipient may already own other sites. Only remap this site.
    // Clear preferred pointer from anyone else still pointing at this site.
    for ((u, c) in userCanisters.entries()) {
      if (Principal.equal(c, site) and not Principal.equal(u, toOwner)) {
        userCanisters.delete(u);
        lastSite.put(u, site);
        // If they still own other sites, restore preferred to one of them
        for ((s2, o2) in siteOwners.entries()) {
          if (Principal.equal(o2, u) and not Principal.equal(s2, site)) {
            userCanisters.put(u, s2);
          };
        };
      };
    };
    // fromOwner: drop preferred if it was this site; keep other owned sites
    switch (userCanisters.get(fromOwner)) {
      case (?c) {
        if (Principal.equal(c, site)) {
          userCanisters.delete(fromOwner);
          lastSite.put(fromOwner, site);
          for ((s2, o2) in siteOwners.entries()) {
            if (Principal.equal(o2, fromOwner) and not Principal.equal(s2, site)) {
              userCanisters.put(fromOwner, s2);
            };
          };
        };
      };
      case null {};
    };
    // Preferred/active for recipient becomes the transferred site
    userCanisters.put(toOwner, site);
    lastSite.put(toOwner, site);
    siteOwners.put(site, toOwner);
    activeSubs.put(site, true);

    switch (await applyStandardControllersInternal(toOwner, site)) {
      case (?err) {
        return #err("Controllers update failed (factory must remain controller): " # err);
      };
      case null {};
    };
    // Older site WASM (e.g. sxpaw) may lack syncOwner — registry + controllers are enough.
    var syncNote = "";
    try {
      ignore await siteActor(site).syncOwner(toOwner);
    } catch (e) {
      let em = Error.message(e);
      if (Text.contains(em, #text "IC0536") or Text.contains(em, #text "has no update method")) {
        syncNote := " (site WASM has no syncOwner — ownership is still remapped in factory registry/controllers)";
      } else {
        syncNote := " (syncOwner warning: " # em # " — run adminSyncSiteOwner if needed)";
      };
    };
    ignore await registerMintWithRegistry(site, toOwner);
    #ok(
      "Site "
        # Principal.toText(site)
        # " transferred to "
        # Principal.toText(toOwner)
        # syncNote
    )
  };

  /// Owner: create a one-time transfer offer. Returns plaintext code once.
  public shared(msg) func createSiteTransferOffer() : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    let site = switch (userCanisters.get(user)) {
      case null { return #err("No linked website to transfer. Attach a site first.") };
      case (?c) { c };
    };
    switch (siteOwners.get(site)) {
      case (?o) {
        if (not Principal.equal(o, user)) {
          return #err("Only the registered site owner can create a transfer offer");
        };
      };
      case null { return #err("Site owner mapping missing") };
    };
    switch (await requireFactoryController(site)) {
      case (?err) { return #err(err) };
      case null {};
    };
    // Replace any prior open offer
    switch (transferOffers.get(site)) {
      case (?old) {
        if (not old.claimed) { transferCodes.delete(old.code) };
      };
      case null {};
    };
    let now = Time.now();
    let code = makeTransferCode(user);
    let offer : TransferOffer = {
      code;
      site;
      fromOwner = user;
      createdAt = now;
      expiresAt = now + TRANSFER_OFFER_TTL_NS;
      claimed = false;
      claimedBy = null;
    };
    transferOffers.put(site, offer);
    transferCodes.put(code, site);
    #ok(code)
  };

  public shared(msg) func cancelSiteTransferOffer() : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    let site = switch (userCanisters.get(user)) {
      case null {
        // Allow cancel if they still have an offer as fromOwner
        var found : ?Principal = null;
        for ((s, off) in transferOffers.entries()) {
          if (Principal.equal(off.fromOwner, user) and not off.claimed) {
            found := ?s;
          };
        };
        switch (found) {
          case null { return #err("No open transfer offer") };
          case (?s) { s };
        };
      };
      case (?c) { c };
    };
    switch (transferOffers.get(site)) {
      case null { return #err("No open transfer offer") };
      case (?off) {
        if (not Principal.equal(off.fromOwner, user) and not isOwner(user)) {
          return #err("Not authorized");
        };
        if (off.claimed) { return #err("Offer already claimed") };
        clearOfferMaps(site, off.code);
        pushTransferLog({
          site;
          fromOwner = off.fromOwner;
          toOwner = off.fromOwner;
          at = Time.now();
          kind = "cancel";
        });
        #ok("Transfer offer cancelled")
      };
    }
  };

  public shared query(msg) func getMyTransferOfferStatus() : async {
    hasOffer : Bool;
    site : ?Principal;
    expiresAt : Int;
    claimed : Bool;
    transferFeeE8s : Nat;
  } {
    let user = msg.caller;
    switch (userCanisters.get(user)) {
      case null {
        {
          hasOffer = false;
          site = null;
          expiresAt = 0;
          claimed = false;
          transferFeeE8s = TRANSFER_FEE_E8S;
        }
      };
      case (?site) {
        switch (transferOffers.get(site)) {
          case null {
            {
              hasOffer = false;
              site = ?site;
              expiresAt = 0;
              claimed = false;
              transferFeeE8s = TRANSFER_FEE_E8S;
            }
          };
          case (?off) {
            {
              hasOffer = not off.claimed and Time.now() < off.expiresAt;
              site = ?site;
              expiresAt = off.expiresAt;
              claimed = off.claimed;
              transferFeeE8s = TRANSFER_FEE_E8S;
            }
          };
        }
      };
    }
  };

  /// Recipient: claim a site with the one-time offer code (full handoff).
  public shared(msg) func claimSiteTransfer(code : Text) : async OpResult {
    let toOwner = msg.caller;
    if (Principal.isAnonymous(toOwner)) { return #err("Anonymous") };
    let trimmed = Text.trim(code, #char ' ');
    if (Text.size(trimmed) < 8) { return #err("Invalid transfer code") };
    let site = switch (transferCodes.get(trimmed)) {
      case null { return #err("Unknown or expired transfer code") };
      case (?s) { s };
    };
    let offer = switch (transferOffers.get(site)) {
      case null { return #err("Transfer offer not found") };
      case (?o) { o };
    };
    if (offer.claimed) { return #err("Transfer offer already claimed") };
    if (Time.now() > offer.expiresAt) {
      clearOfferMaps(site, offer.code);
      return #err("Transfer offer expired — ask the owner to create a new one");
    };
    if (not Text.equal(offer.code, trimmed)) {
      return #err("Invalid transfer code");
    };
    if (TRANSFER_FEE_E8S > 0) {
      switch (await chargeIcp(toOwner, TRANSFER_FEE_E8S)) {
        case (?err) { return #err(err) };
        case null {};
      };
    };
    let result = await performSiteHandoff(offer.fromOwner, toOwner, site);
    switch (result) {
      case (#err e) {
        if (TRANSFER_FEE_E8S > 0) {
          ignore await refundIcp(toOwner, TRANSFER_FEE_E8S);
        };
        #err(e)
      };
      case (#ok msg) {
        clearOfferMaps(site, offer.code);
        transferOffers.put(
          site,
          {
            code = "";
            site;
            fromOwner = offer.fromOwner;
            createdAt = offer.createdAt;
            expiresAt = offer.expiresAt;
            claimed = true;
            claimedBy = ?toOwner;
          }
        );
        pushTransferLog({
          site;
          fromOwner = offer.fromOwner;
          toOwner;
          at = Time.now();
          kind = "claim";
        });
        #ok(msg)
      };
    }
  };

  /// Master/ops: force transfer without a code (emergency).
  public shared(msg) func adminForceSiteTransfer(site : Principal, toOwner : Principal) : async OpResult {
    if (not isOwner(msg.caller)) {
      return #err("Not authorized — factory owner only");
    };
    let fromOwner = switch (siteOwners.get(site)) {
      case (?o) { o };
      case null { return #err("Unknown site owner") };
    };
    // Cancel open offer if any
    switch (transferOffers.get(site)) {
      case (?off) {
        if (not off.claimed) { transferCodes.delete(off.code) };
        transferOffers.delete(site);
      };
      case null {};
    };
    let result = await performSiteHandoff(fromOwner, toOwner, site);
    switch (result) {
      case (#err e) { #err(e) };
      case (#ok msg) {
        pushTransferLog({
          site;
          fromOwner;
          toOwner;
          at = Time.now();
          kind = "admin_force";
        });
        #ok(msg)
      };
    }
  };

  public shared(msg) func adminCancelSiteTransfer(site : Principal) : async OpResult {
    if (not isOwner(msg.caller)) {
      return #err("Not authorized — factory owner only");
    };
    switch (transferOffers.get(site)) {
      case null { #err("No transfer offer for site") };
      case (?off) {
        if (off.claimed) { return #err("Offer already claimed") };
        clearOfferMaps(site, off.code);
        pushTransferLog({
          site;
          fromOwner = off.fromOwner;
          toOwner = off.fromOwner;
          at = Time.now();
          kind = "cancel";
        });
        #ok("Transfer offer cancelled")
      };
    }
  };

  public query func getTransferLog(limit : Nat) : async [TransferLogEntry] {
    let maxN = if (limit == 0 or limit > 50) { 20 } else { limit };
    let n = transferLogEntries.size();
    if (n == 0) { return [] };
    let start = if (n > maxN) { n - maxN } else { 0 };
    Array.tabulate<TransferLogEntry>(n - start, func(i) { transferLogEntries[start + i] })
  };

  /// All sites owned by caller (multi-site). Derived from siteOwners map.
  public shared query(msg) func listMySites() : async [Principal] {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return [] };
    let buf = Buffer.Buffer<Principal>(0);
    for ((site, ownerP) in siteOwners.entries()) {
      if (Principal.equal(ownerP, user)) {
        // Prefer currently linked (activeSubs) first — still include all owned
        buf.add(site);
      };
    };
    Buffer.toArray(buf)
  };

  /// Admin/ops: sites owned by a given user.
  public query func getUserSites(user : Principal) : async [Principal] {
    let buf = Buffer.Buffer<Principal>(0);
    for ((site, ownerP) in siteOwners.entries()) {
      if (Principal.equal(ownerP, user)) { buf.add(site) };
    };
    Buffer.toArray(buf)
  };

  /// Set preferred/primary site (must own it). Used by post-login picker.
  public shared(msg) func setPreferredSite(site : Principal) : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    switch (siteOwners.get(site)) {
      case null { return #err("Unknown site") };
      case (?o) {
        if (not Principal.equal(o, user)) {
          return #err("Not the owner of this site");
        };
      };
    };
    userCanisters.put(user, site);
    lastSite.put(user, site);
    activeSubs.put(site, true);
    #ok("Preferred site set to " # Principal.toText(site))
  };

  /// Create transfer offer for a specific owned site (multi-site safe).
  public shared(msg) func createSiteTransferOfferFor(site : Principal) : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    switch (siteOwners.get(site)) {
      case null { return #err("Unknown site") };
      case (?o) {
        if (not Principal.equal(o, user)) {
          return #err("Only the registered site owner can create a transfer offer");
        };
      };
    };
    switch (await requireFactoryController(site)) {
      case (?err) { return #err(err) };
      case null {};
    };
    switch (transferOffers.get(site)) {
      case (?old) {
        if (not old.claimed) { transferCodes.delete(old.code) };
      };
      case null {};
    };
    let now = Time.now();
    let code = makeTransferCode(user);
    let offer : TransferOffer = {
      code;
      site;
      fromOwner = user;
      createdAt = now;
      expiresAt = now + TRANSFER_OFFER_TTL_NS;
      claimed = false;
      claimedBy = null;
    };
    transferOffers.put(site, offer);
    transferCodes.put(code, site);
    // Also set preferred so legacy createSiteTransferOffer paths stay coherent
    userCanisters.put(user, site);
    #ok(code)
  };

  // ---------- site recovery codes (II principal mismatch) ----------

  /// One-shot: return mint/regen code for caller, then clear pending reveal.
  public shared(msg) func revealPendingRecoveryCode() : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    switch (pendingRecoveryReveal.get(user)) {
      case null { #err("No pending recovery code to reveal") };
      case (?code) {
        pendingRecoveryReveal.delete(user);
        #ok(code)
      };
    }
  };

  /// Owner: regenerate recovery code for preferred site (old code dies).
  public shared(msg) func regenerateSiteRecoveryCode() : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    let site = switch (userCanisters.get(user)) {
      case null { return #err("No preferred site — select a site first") };
      case (?c) { c };
    };
    switch (siteOwners.get(site)) {
      case (?o) {
        if (not Principal.equal(o, user)) {
          return #err("Not the owner of this site");
        };
      };
      case null { return #err("Unknown site owner") };
    };
    let code = issueRecoveryCode(site, user);
    #ok(code)
  };

  public shared(msg) func regenerateSiteRecoveryCodeFor(site : Principal) : async OpResult {
    let user = msg.caller;
    if (Principal.isAnonymous(user)) { return #err("Anonymous") };
    switch (siteOwners.get(site)) {
      case (?o) {
        if (not Principal.equal(o, user) and not isOwner(user)) {
          return #err("Not authorized");
        };
      };
      case null { return #err("Unknown site") };
    };
    let ownerP = switch (siteOwners.get(site)) {
      case (?o) { o };
      case null { user };
    };
    let code = issueRecoveryCode(site, ownerP);
    // If master regenerated for someone else, queue reveal for the site owner
    if (not Principal.equal(msg.caller, ownerP)) {
      pendingRecoveryReveal.put(ownerP, code);
    };
    #ok(code)
  };

  public shared query(msg) func hasSiteRecoveryCode() : async Bool {
    let user = msg.caller;
    switch (userCanisters.get(user)) {
      case null { false };
      case (?site) {
        switch (recoveryCodes.get(site)) {
          case null { false };
          case (?c) { Text.size(c) > 0 };
        }
      };
    }
  };

  /// Log in with any II, paste recovery code → site remaps to this II (full handoff).
  public shared(msg) func claimSiteWithRecoveryCode(code : Text) : async OpResult {
    let toOwner = msg.caller;
    if (Principal.isAnonymous(toOwner)) { return #err("Anonymous") };
    let trimmed = Text.trim(code, #char ' ');
    if (Text.size(trimmed) < 8) { return #err("Invalid recovery code") };
    let site = switch (recoveryCodeIndex.get(trimmed)) {
      case null { return #err("Unknown recovery code") };
      case (?s) { s };
    };
    let stored = switch (recoveryCodes.get(site)) {
      case null { return #err("Recovery code not found for site") };
      case (?c) { c };
    };
    if (not Text.equal(stored, trimmed)) {
      return #err("Invalid recovery code");
    };
    let fromOwner = switch (siteOwners.get(site)) {
      case (?o) { o };
      case null { return #err("Site has no registered owner") };
    };
    if (Principal.equal(fromOwner, toOwner)) {
      return #ok("You already own this site (" # Principal.toText(site) # ")");
    };
    switch (await requireFactoryController(site)) {
      case (?err) { return #err(err) };
      case null {};
    };
    let result = await performSiteHandoff(fromOwner, toOwner, site);
    switch (result) {
      case (#err e) { #err(e) };
      case (#ok msg) {
        // Rotate code after successful recovery so the old code cannot be reused
        ignore issueRecoveryCode(site, toOwner);
        #ok(msg # " Save your new recovery code via My Site → Transfer.")
      };
    }
  };

  /// Master: issue recovery code for a site (queued for site owner reveal).
  /// Prefer adminApproveRecoveryRequest after the user proves an II session.
  public shared(msg) func adminGenerateSiteRecoveryCode(site : Principal) : async OpResult {
    if (not isOwner(msg.caller)) {
      return #err("Not authorized — factory owner only");
    };
    let ownerP = switch (siteOwners.get(site)) {
      case (?o) { o };
      case null { return #err("Unknown site owner") };
    };
    let code = issueRecoveryCode(site, ownerP);
    #ok(code)
  };

  /// User: prove an II session and request master help for a site recovery code.
  public shared(msg) func requestSiteRecovery(site : Principal, note : Text) : async OpResult {
    let requester = msg.caller;
    if (Principal.isAnonymous(requester)) { return #err("Anonymous") };
    if (Principal.isAnonymous(site)) { return #err("Invalid site") };
    let registeredOwner = siteOwners.get(site);
    // Replace any prior open request from this requester for this site
    let buf = Buffer.Buffer<RecoveryRequest>(0);
    for (r in recoveryRequestEntries.vals()) {
      let same =
        Principal.equal(r.site, site) and Principal.equal(r.requester, requester);
      if (not same) { buf.add(r) };
    };
    let noteTrim = Text.trim(note, #char ' ');
    let noteFinal = if (Text.size(noteTrim) > 200) {
      // Motoko Text has no slice in older base — keep full if short tools missing
      noteTrim
    } else { noteTrim };
    buf.add({
      site;
      requester;
      registeredOwner;
      at = Time.now();
      note = noteFinal;
    });
    // Cap queue
    if (buf.size() > 100) {
      let start = buf.size() - 100;
      recoveryRequestEntries := Array.tabulate<RecoveryRequest>(100, func(i) {
        buf.get(start + i)
      });
    } else {
      recoveryRequestEntries := Buffer.toArray(buf);
    };
    #ok(
      "Recovery request filed for site "
        # Principal.toText(site)
        # ". Master must verify your identity, then approve. Your II principal: "
        # Principal.toText(requester)
    )
  };

  public query func listPendingRecoveryRequests() : async [RecoveryRequest] {
    recoveryRequestEntries
  };

  public shared query(msg) func getMyRecoveryRequests() : async [RecoveryRequest] {
    let user = msg.caller;
    let buf = Buffer.Buffer<RecoveryRequest>(0);
    for (r in recoveryRequestEntries.vals()) {
      if (Principal.equal(r.requester, user)) { buf.add(r) };
    };
    Buffer.toArray(buf)
  };

  /// Master: after verifying the requester’s identity offline, approve and issue code.
  /// Code is returned once to master AND queued for the requester via revealPendingRecoveryCode.
  public shared(msg) func adminApproveRecoveryRequest(
    site : Principal,
    requester : Principal,
    identityVerified : Bool
  ) : async OpResult {
    if (not isOwner(msg.caller)) {
      return #err("Not authorized — factory owner only");
    };
    if (not identityVerified) {
      return #err("Refuse: set identityVerified=true only after you verified the user is legitimate");
    };
    if (Principal.isAnonymous(requester) or Principal.isAnonymous(site)) {
      return #err("Invalid principal");
    };
    var found = false;
    let buf = Buffer.Buffer<RecoveryRequest>(0);
    for (r in recoveryRequestEntries.vals()) {
      if (Principal.equal(r.site, site) and Principal.equal(r.requester, requester)) {
        found := true;
      } else {
        buf.add(r);
      };
    };
    if (not found) {
      return #err("No matching recovery request — user must call requestSiteRecovery while signed in first");
    };
    recoveryRequestEntries := Buffer.toArray(buf);
    // Issue code; queue reveal for the requester (the II that proved the session)
    switch (recoveryCodes.get(site)) {
      case (?old) { recoveryCodeIndex.delete(old) };
      case null {};
    };
    let code = makeRecoveryCode(requester);
    recoveryCodes.put(site, code);
    recoveryCodeIndex.put(code, site);
    pendingRecoveryReveal.put(requester, code);
    #ok(code)
  };

  public shared(msg) func adminRejectRecoveryRequest(site : Principal, requester : Principal) : async OpResult {
    if (not isOwner(msg.caller)) {
      return #err("Not authorized — factory owner only");
    };
    var found = false;
    let buf = Buffer.Buffer<RecoveryRequest>(0);
    for (r in recoveryRequestEntries.vals()) {
      if (Principal.equal(r.site, site) and Principal.equal(r.requester, requester)) {
        found := true;
      } else {
        buf.add(r);
      };
    };
    if (not found) { return #err("No matching request") };
    recoveryRequestEntries := Buffer.toArray(buf);
    #ok("Recovery request rejected")
  };

  // ---------- one-time principal migration (claim by canister id) ----------

  public query func getPrincipalMigrationStatus() : async {
    open : Bool;
    claimedCount : Nat;
  } {
    {
      open = principalMigrationOpen;
      claimedCount = migrationClaimed.size();
    }
  };

  public shared(msg) func adminSetPrincipalMigration(open : Bool) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    principalMigrationOpen := open;
    if (open) {
      "Principal migration OPEN — non-master users can claim a registered site by canister id once"
    } else {
      "Principal migration CLOSED"
    }
  };

  /// Existing accounts only: while migration is open, claim a factory-registered site by id.
  /// Remaps ownership + controllers to the caller's current II. Each site once.
  public shared(msg) func claimSiteByCanisterId(site : Principal) : async OpResult {
    let toOwner = msg.caller;
    if (Principal.isAnonymous(toOwner)) { return #err("Anonymous") };
    if (not principalMigrationOpen) {
      return #err("Principal migration is not open");
    };
    // Masters skip this path — they already have access
    if (isOwner(toOwner)) {
      return #err("Master accounts do not use principal migration");
    };
    if (Principal.isAnonymous(site)) { return #err("Invalid site") };

    switch (migrationClaimed.get(site)) {
      case (?who) {
        if (Principal.equal(who, toOwner)) {
          return #ok("You already claimed this site in migration");
        };
        return #err("This site was already claimed in the one-time migration");
      };
      case null {};
    };

    let fromOwner = switch (siteOwners.get(site)) {
      case (?o) { o };
      case null {
        return #err("Site is not in the factory registry (existing accounts only)");
      };
    };

    if (Principal.equal(fromOwner, toOwner)) {
      migrationClaimed.put(site, toOwner);
      userCanisters.put(toOwner, site);
      lastSite.put(toOwner, site);
      activeSubs.put(site, true);
      return #ok("Already the registered owner — preferred site set");
    };

    switch (await requireFactoryController(site)) {
      case (?err) { return #err(err) };
      case null {};
    };

    let result = await performSiteHandoff(fromOwner, toOwner, site);
    switch (result) {
      case (#err e) { #err(e) };
      case (#ok msg) {
        migrationClaimed.put(site, toOwner);
        ignore issueRecoveryCode(site, toOwner);
        #ok(msg # " Migration claim complete. Save your new ICE-RCV recovery code from My Site.")
      };
    }
  };

  public query func health() : async Text {
    // touch legacy stables so they are not flagged unused
    ignore Principal.toText(DFX_CONTROLLER);
    ignore Principal.toText(NNS_CONTROLLER);
    "Master Factory OK · wasm=" # Nat.toText(userSiteWasm.size())
      # " bytes · cycles=" # Nat.toText(ExperimentalCycles.balance())
      # " · linked=" # Nat.toText(userCanisters.size())
  };
};
