import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Nat "mo:base/Nat";
import Nat32 "mo:base/Nat32";
import Int "mo:base/Int";
import Text "mo:base/Text";
import Char "mo:base/Char";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import Iter "mo:base/Iter";

/**
 * I.C.E. Messaging Canister
 * ------------------------
 * Separate from the main social canister to isolate cycle costs.
 *
 * Guest chats: secret-token threads (ephemeral, max 20 msgs, idle 2h, max 40 open).
 * DMs: pair conversations with daily limits.
 */
persistent actor Messaging {

  // ==================== TYPES ====================

  type Message = {
    id : Nat;
    conversationId : Nat;
    from : Principal;
    content : Text;
    timestamp : Time.Time;
  };

  type Conversation = {
    id : Nat;
    participants : [Principal];
    lastMessageAt : Time.Time;
    messageCount : Nat;
  };

  type GuestThreadMeta = {
    token : Text;
    createdAt : Int;
    lastActive : Int;
  };

  type GuestChatOk = {
    token : Text;
    conversationId : Nat;
  };

  type GuestChatResult = {
    #ok : GuestChatOk;
    #err : Text;
  };

  type SendResult = {
    #ok : Nat;
    #err : Text;
  };

  type GuestThreadInfo = {
    id : Nat;
    tokenPreview : Text;
    lastActive : Int;
    messageCount : Nat;
    expiresAt : ?Int;
  };

  // ==================== STORAGE ====================

  private stable var nextConversationId : Nat = 0;
  private stable var nextMessageId : Nat = 0;
  private stable var guestTokenNonce : Nat = 0;

  // Core maps must survive upgrades (were incorrectly transient — that broke guest replies after every deploy).
  private transient var conversations = HashMap.HashMap<Nat, Conversation>(0, Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) });
  private transient var messages = HashMap.HashMap<Nat, Message>(0, Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) });
  private transient var conversationMessages = HashMap.HashMap<Nat, [Nat]>(0, Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) });
  private transient var pairIndex = HashMap.HashMap<Text, Nat>(0, Text.equal, Text.hash);
  private transient var dailyCounts = HashMap.HashMap<Principal, { count : Nat; lastReset : Time.Time }>(0, Principal.equal, Principal.hash);

  private stable var conversationEntries : [(Nat, Conversation)] = [];
  private stable var messageEntries : [(Nat, Message)] = [];
  private stable var conversationMessageEntries : [(Nat, [Nat])] = [];
  private stable var pairIndexEntries : [(Text, Nat)] = [];

  /// Legacy shared guest inbox (kept for upgrade compat; new chats use tokens).
  private stable var guestInboxEntries : [(Principal, Nat)] = [];
  private transient var guestInboxIndex = HashMap.HashMap<Principal, Nat>(0, Principal.equal, Principal.hash);
  private stable var lastAnonGuestAt : Int = 0;

  /// messageId -> expiresAt (ns)
  private stable var guestExpiryEntries : [(Nat, Int)] = [];
  private transient var guestExpiry = HashMap.HashMap<Nat, Int>(0, Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) });

  /// token -> conversationId
  private stable var guestTokenEntries : [(Text, Nat)] = [];
  private transient var guestTokenIndex = HashMap.HashMap<Text, Nat>(0, Text.equal, Text.hash);

  /// conversationId -> guest meta
  private stable var guestMetaEntries : [(Nat, GuestThreadMeta)] = [];
  private transient var guestMeta = HashMap.HashMap<Nat, GuestThreadMeta>(0, Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) });

  /// token -> last guest send time (cooldown)
  private transient var guestTokenCooldown = HashMap.HashMap<Text, Int>(0, Text.equal, Text.hash);

  // ==================== CONSTANTS ====================

  private let MAX_MESSAGES_PER_CONVERSATION : Nat = 100;
  private let MAX_GUEST_MESSAGES_PER_THREAD : Nat = 20;
  /// Guest may send this many messages until master replies; then the counter resets.
  private let MAX_GUEST_UNANSWERED : Nat = 3;
  private let MAX_OPEN_GUEST_THREADS : Nat = 40;
  private let MAX_MESSAGES_PER_DAY : Nat = 50;
  private let MAX_CONTENT_LENGTH : Nat = 1000;
  private let MAX_GUEST_CONTENT_LENGTH : Nat = 900; // room for ice1: ciphertext
  /// Encrypted ice1: payloads can exceed plain max after base64.
  private let MAX_CIPHER_CONTENT_LENGTH : Nat = 2500;
  private let MAX_GUEST_LABEL : Nat = 80;
  private let MESSAGE_TTL_NANOS : Int = 90 * 24 * 60 * 60 * 1_000_000_000;
  private let DAY_NANOS : Int = 24 * 60 * 60 * 1_000_000_000;
  private let ANON_GUEST_COOLDOWN_NS : Int = 45_000_000_000; // 45s per token / anon start
  private let GUEST_IDLE_TTL_NS : Int = 2 * 60 * 60 * 1_000_000_000; // 2h idle
  private let GUEST_MAX_LIFETIME_NS : Int = 24 * 60 * 60 * 1_000_000_000; // 24h hard cap
  private let DEFAULT_MASTER : Principal = Principal.fromText(
    "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"
  );
  /// Founder principals that can read/reply to guest public chats
  /// (keep in sync with ICE TRUSTED_MASTER_PRINCIPALS + frontend).
  private let TRUSTED_MASTERS : [Principal] = [
    Principal.fromText("gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"),
    Principal.fromText("4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"),
    Principal.fromText("d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae"),
    Principal.fromText("zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae"),
    Principal.fromText("vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe"),
  ];

  system func preupgrade() {
    conversationEntries := Iter.toArray(conversations.entries());
    messageEntries := Iter.toArray(messages.entries());
    conversationMessageEntries := Iter.toArray(conversationMessages.entries());
    pairIndexEntries := Iter.toArray(pairIndex.entries());
    guestInboxEntries := Iter.toArray(guestInboxIndex.entries());
    guestExpiryEntries := Iter.toArray(guestExpiry.entries());
    guestTokenEntries := Iter.toArray(guestTokenIndex.entries());
    guestMetaEntries := Iter.toArray(guestMeta.entries());
  };

  system func postupgrade() {
    conversations := HashMap.fromIter<Nat, Conversation>(
      conversationEntries.vals(), conversationEntries.size(), Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) }
    );
    conversationEntries := [];
    messages := HashMap.fromIter<Nat, Message>(
      messageEntries.vals(), messageEntries.size(), Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) }
    );
    messageEntries := [];
    conversationMessages := HashMap.fromIter<Nat, [Nat]>(
      conversationMessageEntries.vals(), conversationMessageEntries.size(), Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) }
    );
    conversationMessageEntries := [];
    pairIndex := HashMap.fromIter<Text, Nat>(
      pairIndexEntries.vals(), pairIndexEntries.size(), Text.equal, Text.hash
    );
    pairIndexEntries := [];

    guestInboxIndex := HashMap.fromIter<Principal, Nat>(
      guestInboxEntries.vals(), guestInboxEntries.size(), Principal.equal, Principal.hash
    );
    guestInboxEntries := [];
    guestExpiry := HashMap.fromIter<Nat, Int>(
      guestExpiryEntries.vals(), guestExpiryEntries.size(), Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) }
    );
    guestExpiryEntries := [];
    guestTokenIndex := HashMap.fromIter<Text, Nat>(
      guestTokenEntries.vals(), guestTokenEntries.size(), Text.equal, Text.hash
    );
    guestTokenEntries := [];
    guestMeta := HashMap.fromIter<Nat, GuestThreadMeta>(
      guestMetaEntries.vals(), guestMetaEntries.size(), Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) }
    );
    guestMetaEntries := [];

    // Repair orphans from older builds that persisted guestMeta but wiped conversations.
    let orphanIds = Buffer.Buffer<Nat>(0);
    for ((cid, meta) in guestMeta.entries()) {
      switch (conversations.get(cid)) {
        case (?_) {};
        case null {
          // Recreate an empty shell so founder can still fetch the token / continue the thread.
          conversations.put(
            cid,
            {
              id = cid;
              participants = [DEFAULT_MASTER];
              lastMessageAt = meta.lastActive;
              messageCount = 0;
            },
          );
          conversationMessages.put(cid, []);
        };
      };
    };
    ignore orphanIds;
  };

  // ==================== HELPERS ====================

  private func pairKey(a : Principal, b : Principal) : Text {
    let sa = Principal.toText(a);
    let sb = Principal.toText(b);
    if (sa < sb) { sa # ":" # sb } else { sb # ":" # sa }
  };

  private func isParticipant(conv : Conversation, user : Principal) : Bool {
    for (p in conv.participants.vals()) {
      if (Principal.equal(p, user)) { return true };
    };
    false
  };

  private func isTrustedMaster(user : Principal) : Bool {
    if (Principal.isAnonymous(user)) { return false };
    let t = Principal.toText(user);
    // Explicit text checks (same pattern as ICE backend) — avoid any fromText edge cases.
    if (t == "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae") { return true };
    if (t == "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe") { return true };
    if (t == "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae") { return true };
    if (t == "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae") { return true };
    if (t == "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe") { return true };
    for (p in TRUSTED_MASTERS.vals()) {
      if (Principal.equal(p, user)) { return true };
    };
    false
  };

  private func isGuestConversation(conversationId : Nat) : Bool {
    switch (guestMeta.get(conversationId)) {
      case (?_) { true };
      case null {
        for ((_, cid) in guestInboxIndex.entries()) {
          if (cid == conversationId) { return true };
        };
        false
      };
    }
  };

  /// Guest threads: listed participant OR any trusted master founder account.
  private func canAccessConversation(conv : Conversation, conversationId : Nat, user : Principal) : Bool {
    if (isParticipant(conv, user)) { return true };
    if (isGuestConversation(conversationId) and isTrustedMaster(user)) { return true };
    false
  };

  private func makeGuestToken() : Text {
    guestTokenNonce += 1;
    let raw =
      Nat.toText(Int.abs(Time.now())) # ":" #
      Nat.toText(guestTokenNonce) # ":" #
      Nat.toText(nextConversationId) # ":" #
      Nat.toText(nextMessageId);
    let h1 = Nat32.toNat(Text.hash(raw));
    let h2 = Nat32.toNat(Text.hash(raw # "!ice"));
    "g" # Nat.toText(h1) # "x" # Nat.toText(h2) # "n" # Nat.toText(guestTokenNonce)
  };

  private func tokenPreview(token : Text) : Text {
    let chars = Iter.toArray(Text.toIter(token));
    if (chars.size() <= 10) { token }
    else {
      Text.fromIter(Array.tabulate<Char>(6, func(i) { chars[i] }).vals()) # "…"
    }
  };

  private func isIceCipher(content : Text) : Bool {
    Text.startsWith(content, #text "ice1:")
  };

  private func validClientToken(t : Text) : Bool {
    let n = Text.size(t);
    if (n < 16 or n > 64) { return false };
    for (c in t.chars()) {
      let ok =
        (c >= 'a' and c <= 'z') or
        (c >= 'A' and c <= 'Z') or
        (c >= '0' and c <= '9') or
        c == '-' or c == '_';
      if (not ok) { return false };
    };
    true
  };

  private func clipGuestLabel(fromLabel : Text) : Text {
    var nameTag = Text.trim(fromLabel, #char ' ');
    if (Text.size(nameTag) > MAX_GUEST_LABEL) {
      let chars = Iter.toArray(Text.toIter(nameTag));
      nameTag := Text.fromIter(
        Array.tabulate<Char>(MAX_GUEST_LABEL, func(i) { chars[i] }).vals()
      );
    };
    nameTag
  };

  private func deleteMessageFully(messageId : Nat) {
    switch (messages.get(messageId)) {
      case (?m) {
        messages.delete(messageId);
        guestExpiry.delete(messageId);
        switch (conversationMessages.get(m.conversationId)) {
          case (?ids) {
            let kept = Array.filter<Nat>(ids, func(id) { id != messageId });
            conversationMessages.put(m.conversationId, kept);
            switch (conversations.get(m.conversationId)) {
              case (?conv) {
                conversations.put(
                  m.conversationId,
                  {
                    id = conv.id;
                    participants = conv.participants;
                    lastMessageAt = conv.lastMessageAt;
                    messageCount = kept.size();
                  },
                );
              };
              case null {};
            };
          };
          case null {};
        };
      };
      case null {
        guestExpiry.delete(messageId);
      };
    };
  };

  private func wipeGuestConversation(conversationId : Nat) : Nat {
    var removed : Nat = 0;
    switch (conversationMessages.get(conversationId)) {
      case (?ids) {
        for (id in ids.vals()) {
          messages.delete(id);
          guestExpiry.delete(id);
          removed += 1;
        };
      };
      case null {};
    };
    conversationMessages.delete(conversationId);
    conversations.delete(conversationId);
    switch (guestMeta.get(conversationId)) {
      case (?meta) {
        guestTokenIndex.delete(meta.token);
        guestTokenCooldown.delete(meta.token);
        guestMeta.delete(conversationId);
      };
      case null {};
    };
    // Drop legacy shared-inbox index rows that pointed at this conversation.
    let legacyDrop = Buffer.Buffer<Principal>(0);
    for ((master, cid) in guestInboxIndex.entries()) {
      if (cid == conversationId) { legacyDrop.add(master) };
    };
    for (master in legacyDrop.vals()) {
      guestInboxIndex.delete(master);
    };
    removed
  };

  private func conversationExpiresAt(conversationId : Nat) : ?Int {
    var soonest : ?Int = null;
    switch (conversationMessages.get(conversationId)) {
      case (?ids) {
        for (id in ids.vals()) {
          switch (guestExpiry.get(id)) {
            case (?exp) {
              switch (soonest) {
                case null { soonest := ?exp };
                case (?s) { if (exp < s) { soonest := ?exp } };
              };
            };
            case null {};
          };
        };
      };
      case null {};
    };
    soonest
  };

  private func purgeExpiredGuestMessages() : Nat {
    let now = Time.now();
    var removed : Nat = 0;

    // Wipe whole guest threads past post-reply idle TTL or hard lifetime.
    // Unreplied threads (no guestExpiry scheduled) stay until GUEST_MAX_LIFETIME_NS
    // so the founder can still answer — do not kill them after 2h of silence alone.
    let deadThreads = Buffer.Buffer<Nat>(0);
    for ((cid, meta) in guestMeta.entries()) {
      let idleDead = switch (conversationExpiresAt(cid)) {
        case (?exp) { exp <= now };
        case null { false };
      };
      let lifeDead = now - meta.createdAt >= GUEST_MAX_LIFETIME_NS;
      if (idleDead or lifeDead) {
        deadThreads.add(cid);
      };
    };
    for (cid in deadThreads.vals()) {
      removed += wipeGuestConversation(cid);
    };

    // Orphan expiry entries (messages only — avoid wiping live unreplied threads)
    let toDelete = Buffer.Buffer<Nat>(0);
    for ((mid, exp) in guestExpiry.entries()) {
      if (exp <= now) { toDelete.add(mid) };
    };
    for (mid in toDelete.vals()) {
      deleteMessageFully(mid);
      removed += 1;
    };
    removed
  };

  /// Update last-active only (guest sends). Does not start the 2h delete timer.
  private func bumpGuestActivity(conversationId : Nat) {
    let now = Time.now();
    switch (guestMeta.get(conversationId)) {
      case (?meta) {
        guestMeta.put(conversationId, {
          token = meta.token;
          createdAt = meta.createdAt;
          lastActive = now;
        });
      };
      case null {};
    };
  };

  /// After a founder reply: sliding 2h idle window for the whole exchange.
  private func scheduleGuestIdleExpiry(conversationId : Nat) {
    let now = Time.now();
    let expiresAt = now + GUEST_IDLE_TTL_NS;
    switch (guestMeta.get(conversationId)) {
      case (?meta) {
        guestMeta.put(conversationId, {
          token = meta.token;
          createdAt = meta.createdAt;
          lastActive = now;
        });
      };
      case null {};
    };
    switch (conversationMessages.get(conversationId)) {
      case (?ids) {
        for (id in ids.vals()) {
          guestExpiry.put(id, expiresAt);
        };
      };
      case null {};
    };
  };

  private func trimGuestConversation(conversationId : Nat) {
    switch (conversationMessages.get(conversationId)) {
      case (?ids) {
        if (ids.size() > MAX_GUEST_MESSAGES_PER_THREAD) {
          let overflow = ids.size() - MAX_GUEST_MESSAGES_PER_THREAD;
          var i : Nat = 0;
          while (i < overflow) {
            messages.delete(ids[i]);
            guestExpiry.delete(ids[i]);
            i += 1;
          };
          let kept = Array.tabulate<Nat>(MAX_GUEST_MESSAGES_PER_THREAD, func(j) {
            ids[overflow + j]
          });
          conversationMessages.put(conversationId, kept);
          switch (conversations.get(conversationId)) {
            case (?conv) {
              conversations.put(conversationId, {
                id = conv.id;
                participants = conv.participants;
                lastMessageAt = conv.lastMessageAt;
                messageCount = kept.size();
              });
            };
            case null {};
          };
        };
      };
      case null {};
    };
  };

  private func checkAndIncrementDailyLimit(user : Principal) : Bool {
    let now = Time.now();
    switch (dailyCounts.get(user)) {
      case (?entry) {
        if (now - entry.lastReset > DAY_NANOS) {
          dailyCounts.put(user, { count = 1; lastReset = now });
          true
        } else if (entry.count >= MAX_MESSAGES_PER_DAY) {
          false
        } else {
          dailyCounts.put(user, { count = entry.count + 1; lastReset = entry.lastReset });
          true
        }
      };
      case null {
        dailyCounts.put(user, { count = 1; lastReset = now });
        true
      };
    }
  };

  private func trimConversation(conversationId : Nat) {
    if (isGuestConversation(conversationId)) {
      trimGuestConversation(conversationId);
      return;
    };
    switch (conversationMessages.get(conversationId)) {
      case (?ids) {
        if (ids.size() > MAX_MESSAGES_PER_CONVERSATION) {
          let overflow = ids.size() - MAX_MESSAGES_PER_CONVERSATION;
          var i : Nat = 0;
          while (i < overflow) {
            messages.delete(ids[i]);
            i += 1;
          };
          let kept = Array.tabulate<Nat>(MAX_MESSAGES_PER_CONVERSATION, func(j) {
            ids[overflow + j]
          });
          conversationMessages.put(conversationId, kept);
        };
      };
      case null {};
    };
  };

  private func dropOldestGuestThreadIfNeeded() {
    if (guestMeta.size() < MAX_OPEN_GUEST_THREADS) { return };
    var oldestId : ?Nat = null;
    var oldestActive : Int = 0;
    for ((cid, meta) in guestMeta.entries()) {
      switch (oldestId) {
        case null {
          oldestId := ?cid;
          oldestActive := meta.lastActive;
        };
        case (?_) {
          if (meta.lastActive < oldestActive) {
            oldestId := ?cid;
            oldestActive := meta.lastActive;
          };
        };
      };
    };
    switch (oldestId) {
      case (?cid) { ignore wipeGuestConversation(cid) };
      case null {};
    };
  };

  /// How many guest (non-master) messages since the last master reply (or start of thread).
  private func guestMessagesSinceMasterReply(conversationId : Nat) : Nat {
    switch (conversationMessages.get(conversationId)) {
      case null { 0 };
      case (?ids) {
        var count : Nat = 0;
        var idx : Nat = ids.size();
        while (idx > 0) {
          idx -= 1;
          switch (messages.get(ids[idx])) {
            case (?m) {
              if (isTrustedMaster(m.from)) {
                return count;
              } else {
                count += 1;
              };
            };
            case null {};
          };
        };
        count
      };
    }
  };

  private func appendGuestMessage(conversationId : Nat, from : Principal, content : Text, now : Int) : Nat {
    let messageId = nextMessageId;
    nextMessageId += 1;
    let message : Message = {
      id = messageId;
      conversationId = conversationId;
      from = from;
      content = content;
      timestamp = now;
    };
    messages.put(messageId, message);
    switch (conversationMessages.get(conversationId)) {
      case (?ids) {
        conversationMessages.put(conversationId, Array.append(ids, [messageId]));
      };
      case null {
        conversationMessages.put(conversationId, [messageId]);
      };
    };
    switch (conversations.get(conversationId)) {
      case (?conv) {
        conversations.put(conversationId, {
          id = conv.id;
          participants = conv.participants;
          lastMessageAt = now;
          messageCount = conv.messageCount + 1;
        });
      };
      case null {};
    };
    trimGuestConversation(conversationId);
    bumpGuestActivity(conversationId);
    // If founder already replied (idle timer armed), slide the 2h window on further guest traffic.
    switch (conversationExpiresAt(conversationId)) {
      case (?_) { scheduleGuestIdleExpiry(conversationId) };
      case null {};
    };
    messageId
  };

  private func messagesForConversation(conversationId : Nat, now : Int) : [Message] {
    switch (conversationMessages.get(conversationId)) {
      case (?ids) {
        let buf = Buffer.Buffer<Message>(ids.size());
        for (id in ids.vals()) {
          let expired = switch (guestExpiry.get(id)) {
            case (?exp) { exp <= now };
            case null { false };
          };
          if (not expired) {
            switch (messages.get(id)) {
              case (?m) { buf.add(m) };
              case null {};
            };
          };
        };
        Buffer.toArray(buf)
      };
      case null { [] };
    }
  };

  // ==================== PUBLIC API — DMs ====================

  public shared(msg) func getOrCreateConversation(other : Principal) : async ?Nat {
    if (Principal.equal(msg.caller, other)) {
      return null;
    };

    let key = pairKey(msg.caller, other);

    switch (pairIndex.get(key)) {
      case (?id) { ?id };
      case null {
        let id = nextConversationId;
        nextConversationId += 1;

        let conv : Conversation = {
          id = id;
          participants = [msg.caller, other];
          lastMessageAt = Time.now();
          messageCount = 0;
        };

        conversations.put(id, conv);
        pairIndex.put(key, id);
        conversationMessages.put(id, []);
        ?id
      };
    }
  };

  public shared(msg) func sendMessage(conversationId : Nat, content : Text) : async SendResult {
    ignore purgeExpiredGuestMessages();
    let body = Text.trim(content, #char ' ');
    if (Text.size(body) == 0) {
      return #err("Empty message.");
    };
    let maxLen =
      if (isIceCipher(body)) { MAX_CIPHER_CONTENT_LENGTH } else { MAX_CONTENT_LENGTH };
    if (Text.size(body) > maxLen) {
      return #err("Message too long (max " # Nat.toText(maxLen) # " characters).");
    };

    // Heal orphan guest meta left by older upgrades (meta without conversation record).
    switch (conversations.get(conversationId)) {
      case null {
        switch (guestMeta.get(conversationId)) {
          case (?meta) {
            if (isTrustedMaster(msg.caller)) {
              conversations.put(
                conversationId,
                {
                  id = conversationId;
                  participants = [DEFAULT_MASTER];
                  lastMessageAt = meta.lastActive;
                  messageCount = 0;
                },
              );
              conversationMessages.put(conversationId, []);
            };
          };
          case null {};
        };
      };
      case (?_) {};
    };

    switch (conversations.get(conversationId)) {
      case null {
        #err("Conversation not found or guest chat expired. Refresh Messages.")
      };
      case (?conv) {
        if (not canAccessConversation(conv, conversationId, msg.caller)) {
          return #err("Not allowed to message this conversation.");
        };

        // Trusted masters (founder) skip the per-day DM cap for guest replies / support.
        if (not isTrustedMaster(msg.caller)) {
          if (not checkAndIncrementDailyLimit(msg.caller)) {
            return #err("Daily message limit reached (50/day). Try again tomorrow.");
          };
        };

        let now = Time.now();
        let messageId = nextMessageId;
        nextMessageId += 1;

        let message : Message = {
          id = messageId;
          conversationId = conversationId;
          from = msg.caller;
          content = body;
          timestamp = now;
        };

        messages.put(messageId, message);

        switch (conversationMessages.get(conversationId)) {
          case (?ids) {
            conversationMessages.put(conversationId, Array.append(ids, [messageId]));
          };
          case null {
            conversationMessages.put(conversationId, [messageId]);
          };
        };

        conversations.put(conversationId, {
          id = conv.id;
          participants = conv.participants;
          lastMessageAt = now;
          messageCount = conv.messageCount + 1;
        });

        trimConversation(conversationId);

        // Guest thread: founder reply starts/resets 2h idle delete; guests only bump activity.
        if (isGuestConversation(conversationId)) {
          if (isTrustedMaster(msg.caller)) {
            scheduleGuestIdleExpiry(conversationId);
          } else {
            bumpGuestActivity(conversationId);
          };
        };

        #ok(messageId)
      };
    }
  };

  public query(msg) func getMessages(conversationId : Nat) : async [Message] {
    let now = Time.now();
    switch (conversations.get(conversationId)) {
      case null { return [] };
      case (?conv) {
        if (not canAccessConversation(conv, conversationId, msg.caller)) {
          return [];
        };
        messagesForConversation(conversationId, now)
      };
    }
  };

  public query(msg) func getMyConversations() : async [Conversation] {
    let buf = Buffer.Buffer<Conversation>(0);
    for ((id, conv) in conversations.entries()) {
      if (canAccessConversation(conv, id, msg.caller)) {
        buf.add(conv);
      };
    };
    let arr = Buffer.toArray(buf);
    Array.sort<Conversation>(arr, func(a, b) {
      if (a.lastMessageAt > b.lastMessageAt) { #less }
      else if (a.lastMessageAt < b.lastMessageAt) { #greater }
      else { #equal }
    })
  };

  public query(msg) func getConversation(conversationId : Nat) : async ?Conversation {
    switch (conversations.get(conversationId)) {
      case null { null };
      case (?conv) {
        if (canAccessConversation(conv, conversationId, msg.caller)) { ?conv } else { null }
      };
    }
  };

  public shared func pruneOldMessages(conversationId : Nat) : async Nat {
    let cutoff = Time.now() - MESSAGE_TTL_NANOS;
    var removed : Nat = 0;
    switch (conversationMessages.get(conversationId)) {
      case (?ids) {
        let kept = Buffer.Buffer<Nat>(0);
        for (id in ids.vals()) {
          switch (messages.get(id)) {
            case (?m) {
              if (m.timestamp >= cutoff) {
                kept.add(id);
              } else {
                messages.delete(id);
                guestExpiry.delete(id);
                removed += 1;
              };
            };
            case null {};
          };
        };
        conversationMessages.put(conversationId, Buffer.toArray(kept));
      };
      case null {};
    };
    removed
  };

  public query(msg) func getMyDailyMessageCount() : async Nat {
    let now = Time.now();
    switch (dailyCounts.get(msg.caller)) {
      case (?entry) {
        if (now - entry.lastReset > DAY_NANOS) { 0 } else { entry.count }
      };
      case null { 0 };
    }
  };

  // ==================== PUBLIC API — Guest secret chats ====================

  public query func isGuestInbox(conversationId : Nat) : async Bool {
    isGuestConversation(conversationId)
  };

  public query func getDefaultMasterPrincipal() : async Principal {
    DEFAULT_MASTER
  };

  /// Debug/UI: whether the caller can administer guest public chats.
  public query(msg) func amITrustedMaster() : async Bool {
    isTrustedMaster(msg.caller)
  };

  public query func getGuestInboxExpiry(conversationId : Nat) : async ?Int {
    if (not isGuestConversation(conversationId)) { return null };
    conversationExpiresAt(conversationId)
  };

  public shared func pruneExpiredGuestMessages() : async Nat {
    purgeExpiredGuestMessages()
  };

  /// Founder: permanently delete one public guest chat (messages, token, indexes).
  public shared(msg) func deleteGuestChat(conversationId : Nat) : async Text {
    if (not isTrustedMaster(msg.caller)) {
      return "Only the founder can delete public guest chats.";
    };
    if (not isGuestConversation(conversationId)) {
      return "Not a public guest chat.";
    };
    let n = wipeGuestConversation(conversationId);
    "Deleted guest chat #" # Nat.toText(conversationId) # " (" # Nat.toText(n) # " messages removed)."
  };

  /// Founder: wipe every public guest chat (pre-fix cleanup / cycle recovery).
  public shared(msg) func wipeAllGuestChats() : async Text {
    if (not isTrustedMaster(msg.caller)) {
      return "Only the founder can wipe public guest chats.";
    };
    let ids = Buffer.Buffer<Nat>(guestMeta.size());
    for ((cid, _) in guestMeta.entries()) {
      ids.add(cid);
    };
    // Also wipe any legacy shared inbox conversation ids.
    for ((_, cid) in guestInboxIndex.entries()) {
      ids.add(cid);
    };
    var removedMsgs : Nat = 0;
    var wipedChats : Nat = 0;
    // Deduplicate by wiping each id once
    let seen = HashMap.HashMap<Nat, Bool>(ids.size(), Nat.equal, func (n : Nat) : Nat32 { Nat32.fromNat(n) });
    for (cid in ids.vals()) {
      switch (seen.get(cid)) {
        case (?_) {};
        case null {
          seen.put(cid, true);
          removedMsgs += wipeGuestConversation(cid);
          wipedChats += 1;
        };
      };
    };
    // Clear any leftover legacy index / cooldowns
    guestInboxIndex := HashMap.HashMap<Principal, Nat>(0, Principal.equal, Principal.hash);
    guestTokenCooldown := HashMap.HashMap<Text, Int>(0, Text.equal, Text.hash);
    "Wiped " # Nat.toText(wipedChats) # " guest chats (" # Nat.toText(removedMsgs) # " messages). Storage freed."
  };

  /// Master: list open token guest threads (newest activity first).
  public query(msg) func listOpenGuestThreads() : async [GuestThreadInfo] {
    if (not isTrustedMaster(msg.caller)) {
      return [];
    };
    let buf = Buffer.Buffer<GuestThreadInfo>(guestMeta.size());
    for ((cid, meta) in guestMeta.entries()) {
      let count = switch (conversations.get(cid)) {
        case (?c) { c.messageCount };
        case null { 0 };
      };
      buf.add({
        id = cid;
        tokenPreview = tokenPreview(meta.token);
        lastActive = meta.lastActive;
        messageCount = count;
        expiresAt = conversationExpiresAt(cid);
      });
    };
    let arr = Buffer.toArray(buf);
    Array.sort<GuestThreadInfo>(arr, func(a, b) {
      if (a.lastActive > b.lastActive) { #less }
      else if (a.lastActive < b.lastActive) { #greater }
      else { #equal }
    })
  };

  public query func getGuestMessagesByToken(token : Text) : async [Message] {
    let t = Text.trim(token, #char ' ');
    if (Text.size(t) == 0) { return [] };
    switch (guestTokenIndex.get(t)) {
      case null { [] };
      case (?cid) {
        let now = Time.now();
        switch (guestMeta.get(cid)) {
          case null { [] };
          case (?meta) {
            if (now - meta.createdAt >= GUEST_MAX_LIFETIME_NS) { return [] };
            messagesForConversation(cid, now)
          };
        }
      };
    }
  };

  public query func getGuestInboxExpiryByToken(token : Text) : async ?Int {
    let t = Text.trim(token, #char ' ');
    switch (guestTokenIndex.get(t)) {
      case null { null };
      case (?cid) { conversationExpiresAt(cid) };
    }
  };

  /// Full guest token for decrypt/encrypt — participant or trusted master.
  public query(msg) func getGuestThreadToken(conversationId : Nat) : async ?Text {
    if (not isTrustedMaster(msg.caller)) {
      switch (conversations.get(conversationId)) {
        case null { return null };
        case (?conv) {
          if (not isParticipant(conv, msg.caller)) { return null };
        };
      };
    };
    switch (guestMeta.get(conversationId)) {
      case (?meta) { ?meta.token };
      case null { null };
    }
  };

  private func createGuestThreadWithToken(token : Text, from : Principal, stored : Text, now : Int) : GuestChatOk {
    dropOldestGuestThreadIfNeeded();
    let cid = nextConversationId;
    nextConversationId += 1;
    let conv : Conversation = {
      id = cid;
      participants = [DEFAULT_MASTER];
      lastMessageAt = now;
      messageCount = 0;
    };
    conversations.put(cid, conv);
    conversationMessages.put(cid, []);
    guestTokenIndex.put(token, cid);
    guestMeta.put(cid, {
      token = token;
      createdAt = now;
      lastActive = now;
    });
    ignore appendGuestMessage(cid, from, stored, now);
    guestTokenCooldown.put(token, now);
    { token = token; conversationId = cid }
  };

  /// Start a new guest chat or continue an existing one by secret token.
  /// Client may propose a high-entropy token (used as auth + encryption key material).
  public shared(msg) func startOrContinueGuestChat(
    tokenOpt : Text,
    fromLabel : Text,
    content : Text,
  ) : async GuestChatResult {
    ignore purgeExpiredGuestMessages();
    let body = Text.trim(content, #char ' ');
    if (Text.size(body) == 0) { return #err("Write a short message first.") };
    if (Text.size(body) > MAX_GUEST_CONTENT_LENGTH) {
      return #err("Message too long (max " # Nat.toText(MAX_GUEST_CONTENT_LENGTH) # " characters).");
    };

    let nameTag = clipGuestLabel(fromLabel);
    let now = Time.now();
    let existingToken = Text.trim(tokenOpt, #char ' ');

    // Cooldown: per-token if continuing/creating with token, else global anon start
    if (Text.size(existingToken) > 0) {
      switch (guestTokenCooldown.get(existingToken)) {
        case (?last) {
          if (now - last < ANON_GUEST_COOLDOWN_NS) {
            return #err("Please wait a moment before sending another message.");
          };
        };
        case null {};
      };
    } else if (Principal.isAnonymous(msg.caller)) {
      if (now - lastAnonGuestAt < ANON_GUEST_COOLDOWN_NS) {
        return #err("Please wait a moment before starting another chat.");
      };
      lastAnonGuestAt := now;
    };

    // Ciphertext payloads stay opaque; do not prepend plaintext labels.
    let stored =
      if (isIceCipher(body)) { body }
      else if (Text.size(nameTag) > 0) { nameTag # ": " # body }
      else { body };

    if (Text.size(existingToken) > 0) {
      switch (guestTokenIndex.get(existingToken)) {
        case (?cid) {
          switch (guestMeta.get(cid)) {
            case null {
              return #err("This chat link expired. Start a new message.");
            };
            case (?meta) {
              if (now - meta.createdAt >= GUEST_MAX_LIFETIME_NS) {
                ignore wipeGuestConversation(cid);
                return #err("This chat link expired. Start a new message.");
              };
              // Guest: max 3 messages until master replies (then another 3, etc.)
              if (not isTrustedMaster(msg.caller)) {
                if (guestMessagesSinceMasterReply(cid) >= MAX_GUEST_UNANSWERED) {
                  return #err(
                    "You've sent 3 messages — please wait for a reply before sending more."
                  );
                };
              };
              ignore appendGuestMessage(cid, msg.caller, stored, now);
              guestTokenCooldown.put(existingToken, now);
              return #ok({ token = existingToken; conversationId = cid });
            };
          };
        };
        case null {
          // Client-proposed token for a brand-new encrypted chat
          if (not validClientToken(existingToken)) {
            return #err("Invalid chat link. Start a new message.");
          };
          if (Principal.isAnonymous(msg.caller)) {
            lastAnonGuestAt := now;
          };
          return #ok(createGuestThreadWithToken(existingToken, msg.caller, stored, now));
        };
      };
    };

    // Legacy: server-generated token
    let token = makeGuestToken();
    #ok(createGuestThreadWithToken(token, msg.caller, stored, now))
  };

  /// Guest reply using secret token (no II).
  public shared(_msg) func sendGuestReplyByToken(token : Text, content : Text) : async Text {
    switch (await startOrContinueGuestChat(token, "", content)) {
      case (#ok(_)) { "Sent." };
      case (#err(e)) { e };
    }
  };

  /// Legacy one-shot guest send → starts a token chat (token discarded for old clients).
  public shared(_msg) func sendGuestMessageToMaster(fromLabel : Text, content : Text) : async Text {
    switch (await startOrContinueGuestChat("", fromLabel, content)) {
      case (#ok(_)) { "Message sent. Thank you." };
      case (#err(e)) { e };
    }
  };
}
