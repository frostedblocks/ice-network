import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat8";
import Nat32 "mo:base/Nat32";
import Nat64 "mo:base/Nat64";
import Int "mo:base/Int";
import Text "mo:base/Text";
import Char "mo:base/Char";
import Array "mo:base/Array";
import Blob "mo:base/Blob";
import Iter "mo:base/Iter";
import Buffer "mo:base/Buffer";
import Error "mo:base/Error";
import ExperimentalCycles "mo:base/ExperimentalCycles";

persistent actor Ice {

  // ICP ledger (mainnet)
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

  /// Stable shape must stay compatible with previous deploy (transfer_from only).
  let IcpLedger = actor "ryjl3-tyaaa-aaaaa-aaaba-cai" : actor {
    icrc2_transfer_from : shared (TransferFromArgs) -> async TransferFromResult;
  };

  /// Extended ledger interface (not stable) for NNS deposit claim.
  private transient let IcpLedgerExt = actor "ryjl3-tyaaa-aaaaa-aaaba-cai" : actor {
    icrc1_balance_of : shared query (Account) -> async Nat;
    icrc1_transfer : shared (TransferArgs) -> async TransferResult;
  };

  // ICP transfer fee is fixed by the ledger (10_000 e8s).
  private let ICP_TRANSFER_FEE_E8S : Nat = 10_000;
  /// Mainnet factory — receives 2.7 ICP of each join fee for mint→cycles.
  private let FACTORY_PRINCIPAL : Principal = Principal.fromText("xfwx3-7yaaa-aaaas-qgxpq-cai");
  /// DFX ops identity — receives join-fee surplus.
  private let DFX_TREASURY_PRINCIPAL : Principal = Principal.fromText(
    "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe"
  );
  /// Portion of each paid join sent to factory for ICP→cycles on mint.
  private let JOIN_FEE_MINT_CYCLES_SHARE_E8S : Nat = 270_000_000; // 2.7 ICP
  /// Cycles Minting Canister — ICP → cycles top-up.
  private let CMC_PRINCIPAL : Principal = Principal.fromText("rkp4c-7iaaa-aaaaa-aaaca-cai");

  /// Match live CMC candid (Refunded.block_index is optional).
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

  /// Per-user deposit subaccount on this canister (for NNS-paid fees).
  /// Layout: [len | principal bytes | zero pad] — 32 bytes (same as CMC style).
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

  /// Convert ICP held on ICE into cycles on the master factory via CMC.
  /// Returns a status note (best-effort; does not trap).
  private func convertIceIcpToFactoryCycles(amountE8s : Nat) : async Text {
    if (amountE8s == 0) { return "Skip: zero amount" };
    let iceId = Principal.fromActor(Ice);
    let bal = await IcpLedgerExt.icrc1_balance_of({
      owner = iceId;
      subaccount = null;
    });
    let need = amountE8s + ICP_TRANSFER_FEE_E8S;
    if (bal < need) {
      return (
        "Skip ICP→factory cycles: ICE has "
          # Nat.toText(bal)
          # " e8s, need "
          # Nat.toText(need)
      );
    };
    let tr = await IcpLedgerExt.icrc1_transfer({
      from_subaccount = null;
      to = {
        owner = CMC_PRINCIPAL;
        subaccount = ?userDepositSubaccount(FACTORY_PRINCIPAL);
      };
      amount = amountE8s;
      fee = ?ICP_TRANSFER_FEE_E8S;
      memo = ?CMC_TOP_UP_MEMO;
      created_at_time = null;
    });
    switch (tr) {
      case (#Err err) {
        switch (err) {
          case (#InsufficientFunds f) {
            "ICP transfer to CMC failed: insufficient funds (balance "
              # Nat.toText(f.balance)
              # ")"
          };
          case (#GenericError g) { "ICP transfer to CMC failed: " # g.message };
          case (#BadFee b) {
            "ICP transfer to CMC failed: bad fee, expected "
              # Nat.toText(b.expected_fee)
          };
          case (_) { "ICP transfer to CMC failed (ICP remains on ICE)" };
        }
      };
      case (#Ok blockIndex) {
        try {
          let res = await CMC.notify_top_up({
            block_index = Nat64.fromNat(blockIndex);
            canister_id = FACTORY_PRINCIPAL;
          });
          switch (res) {
            case (#Ok cyclesGot) {
              if (totalIcpReceivedE8s >= amountE8s) {
                totalIcpReceivedE8s -= amountE8s;
              } else {
                totalIcpReceivedE8s := 0;
              };
              "Converted "
                # Nat.toText(amountE8s)
                # " e8s ICP → "
                # Nat.toText(cyclesGot)
                # " cycles on factory (block "
                # Nat.toText(blockIndex)
                # ")"
            };
            case (#Err e) {
              switch (e) {
                case (#InvalidTransaction t) {
                  "CMC reject (block "
                    # Nat.toText(blockIndex)
                    # "): "
                    # t
                };
                case (#Refunded r) { "CMC refunded: " # r.reason };
                case (#Processing) {
                  "CMC processing block "
                    # Nat.toText(blockIndex)
                    # " — factory cycles may appear shortly"
                };
                case (#TransactionTooOld _) { "CMC: transaction too old" };
                case (#Other o) { "CMC: " # o.error_message };
              }
            };
          }
        } catch (err) {
          "CMC notify_top_up trap: "
            # Error.message(err)
            # " (block "
            # Nat.toText(blockIndex)
            # ")"
        }
      };
    }
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

  /// Charge ICP from the caller's II ledger account after they icrc2_approve this canister.
  /// Flow: fund II principal from NNS (if needed) → II signs approve → transfer_from.
  private func chargeIcp(from : Principal, amountE8s : Nat) : async ?Text {
    if (amountE8s == 0) { return null };
    let transferResult = await IcpLedger.icrc2_transfer_from({
      spender_subaccount = null;
      from = { owner = from; subaccount = null };
      to = { owner = Principal.fromActor(Ice); subaccount = null };
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
            ?"Payment failed: approve the fee with your Internet Identity first (NNS funds that same II principal)."
          };
          case (#InsufficientFunds _) {
            ?"Payment failed: not enough liquid ICP on this Internet Identity. Send ICP from NNS to this II principal (not a neuron)."
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

  /// After join fee lands on ICE: convert 2.7 ICP → factory cycles via CMC, surplus to DFX ops.
  /// Best-effort; join still succeeds if split/CMC fails (ICP remains on ICE).
  private func distributeJoinFeeProceeds(feeE8s : Nat) : async Text {
    if (feeE8s == 0) { return "No fee to distribute" };
    let mintShare =
      if (feeE8s >= JOIN_FEE_MINT_CYCLES_SHARE_E8S) { JOIN_FEE_MINT_CYCLES_SHARE_E8S }
      else { feeE8s };
    let rest = if (feeE8s > mintShare) { feeE8s - mintShare } else { 0 };

    var note = "";
    if (mintShare > ICP_TRANSFER_FEE_E8S) {
      // Leave room for the CMC transfer fee inside the share when balance is tight.
      let convertAmt =
        if (mintShare > ICP_TRANSFER_FEE_E8S) { mintShare } else { 0 };
      if (convertAmt > 0) {
        note #= (await convertIceIcpToFactoryCycles(convertAmt)) # " ";
      };
    };
    // Surplus → DFX (account for ledger fee on this transfer)
    if (rest > ICP_TRANSFER_FEE_E8S) {
      let toDfx = rest - ICP_TRANSFER_FEE_E8S;
      let tr2 = await IcpLedgerExt.icrc1_transfer({
        from_subaccount = null;
        to = { owner = DFX_TREASURY_PRINCIPAL; subaccount = null };
        amount = toDfx;
        fee = ?ICP_TRANSFER_FEE_E8S;
        memo = null;
        created_at_time = null;
      });
      switch (tr2) {
        case (#Ok _) {
          note #= "Sent " # Nat.toText(toDfx) # " e8s surplus to DFX ops. ";
        };
        case (#Err _) {
          note #= "DFX surplus transfer failed (ICP remains on ICE). ";
        };
      };
    };
    if (Text.size(note) == 0) { "Join fee held on ICE" } else { note }
  };

  /// Refund ICP after a post-pay failure (canister pays ledger fee).
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
            ?"Refund failed: ICE treasury low on ICP — contact support"
          };
          case (#GenericError g) { ?("Refund failed: " # g.message) };
          case (_) { ?"Refund failed: ledger error — contact support" };
        }
      };
    }
  };

  /// Optional: claim from NNS deposit subaccount (legacy). Prefer II approve + chargeIcp.
  private func claimNnsDeposit(user : Principal, amountE8s : Nat) : async ?Text {
    if (amountE8s == 0) { return null };
    let sub = userDepositSubaccount(user);
    let need = amountE8s + ICP_TRANSFER_FEE_E8S;
    let bal = await IcpLedgerExt.icrc1_balance_of({
      owner = Principal.fromActor(Ice);
      subaccount = ?sub;
    });
    if (bal < need) {
      return ?(
        "NNS fee not received yet. Send "
          # Nat.toText(need)
          # " e8s ICP (fee + 0.0001 ledger) to this app's deposit account for your principal, then retry."
      );
    };
    let tr = await IcpLedgerExt.icrc1_transfer({
      from_subaccount = ?sub;
      to = { owner = Principal.fromActor(Ice); subaccount = null };
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
      case (#Err err) {
        switch (err) {
          case (#InsufficientFunds _) {
            ?"Deposit found but claim failed (insufficient after fees). Send a bit more ICP."
          };
          case (#GenericError g) { ?("Payment claim failed: " # g.message) };
          case (_) { ?"Payment claim failed. Wait a minute and retry." };
        }
      };
    }
  };

  /// Public: deposit destination for NNS-paid fees (registration / token packs).
  public query func getNnsDepositInfo(user : Principal) : async {
    owner : Principal;
    subaccountHex : Text;
    note : Text;
  } {
    let sub = userDepositSubaccount(user);
    {
      owner = Principal.fromActor(Ice);
      subaccountHex = blobToHex(sub);
      note = "Send ICP from NNS to this owner principal with this 32-byte subaccount (ICRC account). Include +0.0001 ICP for the claim fee.";
    }
  };

  public shared func fetchNnsDepositBalance(user : Principal) : async Nat {
    let sub = userDepositSubaccount(user);
    await IcpLedgerExt.icrc1_balance_of({
      owner = Principal.fromActor(Ice);
      subaccount = ?sub;
    })
  };

  type UserProfile = {
    username : Text;
    bio : Text;
    avatarURL : Text;
  };

  type UserBalance = {
    tokens : Nat;
    postsThisMonth : Nat;
    postsToday : Nat;
    lastReset : Time.Time;
    lastDailyReset : Time.Time;
  };

  type Post = {
    id : Nat;
    author : Principal;
    content : Text;
    imageURL : ?Text;
    timestamp : Time.Time;
    likes : Nat;
    loves : Nat;
    reportCount : Nat;
    isHidden : Bool;
  };

  type Comment = {
    id : Nat;
    postId : Nat;
    author : Principal;
    content : Text;
    timestamp : Time.Time;
  };

  type SiteStats = {
    totalPosts : Nat;
    visiblePosts : Nat;
    hiddenPosts : Nat;
    totalComments : Nat;
    totalProfiles : Nat;
    totalBalances : Nat;
    reportedPosts : Nat;
    totalReportFlags : Nat;
    bannedUsers : Nat;
    tokensInCirculation : Nat;
    /// Principals that completed registration (Internet Identity accounts on ICE)
    registeredAccounts : Nat;
  };

  type Limits = {
    freeTierLimit : Nat;
    dailyLimit : Nat;
    tokensPerPost : Nat;
    tokensPerLove : Nat;
    tokensPerMessage : Nat;
    freeMaxLength : Nat;
    paidMaxLength : Nat;
    maxCommentLength : Nat;
    reportsToHide : Nat;
  };

  type Associates = {
    following : [Principal];
    followers : [Principal];
  };

  /// In-app notification (follow / post / tip / payment).
  type Notification = {
    id : Nat;
    kind : Text; // "follow" | "post" | "tip" | "payment" | "contact"
    from : Principal;
    message : Text;
    refId : Nat; // post id, tip amount, pack tokens, etc.
    createdAt : Time.Time;
    read : Bool;
  };

  /// Public pre-login messages to the master/founder profile.
  type MasterContact = {
    id : Nat;
    from : Principal;
    fromLabel : Text;
    content : Text;
    createdAt : Time.Time;
    read : Bool;
  };

  type SubOffer = {
    tokens : Nat;
    priceE8s : Nat;
    // "label" is reserved in older Motoko (dfx 0.29.x); use tierLabel
    tierLabel : Text;
  };

  type PendingPayment = {
    user : Principal;
    tokens : Nat;
    priceE8s : Nat;
    requestedAt : Time.Time;
  };

  type TreasuryStats = {
    paymentsEnabled : Bool;
    totalIcpReceivedE8s : Nat;
    pendingCount : Nat;
  };

  private stable var nextPostId : Nat = 0;
  private stable var nextCommentId : Nat = 0;
  private stable var nextPendingId : Nat = 0;

  private stable var owner : Principal = Principal.fromText("aaaaa-aa");
  private stable var ownerCloaked : Bool = false;

  // Live-adjustable usage limits
  private stable var freeTierLimit : Nat = 20;
  private stable var dailyLimit : Nat = 5;
  private stable var tokensPerPost : Nat = 5;
  private stable var tokensPerLove : Nat = 2;
  private stable var tokensPerMessage : Nat = 1;
  private stable var freeMaxLength : Nat = 115;
  private stable var paidMaxLength : Nat = 512;
  private stable var maxCommentLength : Nat = 2000;
  private stable var reportsToHide : Nat = 5;
  // Keep stable names compatible with previous mainnet wasm
  private stable var tiers : [Nat] = [200, 400, 600];
  private stable var price200E8s : Nat = 10_000_000; // pack 1 price (e8s)
  private stable var price400E8s : Nat = 18_000_000; // pack 2
  private stable var price600E8s : Nat = 25_000_000; // pack 3
  private stable var paymentsEnabled : Bool = true;
  private stable var totalIcpReceivedE8s : Nat = 0;
  // One-time: enable token-pack payments if they were left off from pre-launch
  private stable var paymentsEnabledFixV1 : Bool = false;

  // Registration fee (stable names from prior deploy + toggle)
  /// First-time account fee: 5 ICP (e8s)
  private stable var REGISTRATION_FEE_E8S : Nat = 500_000_000;
  private stable var REGISTRATION_BONUS_TOKENS : Nat = 0; // token packs removed — no soft-token bonus
  private stable var registrationFeeEnabled : Bool = true;
  /// One-shot migrations for fee amount
  private stable var registrationFee5IcpV1 : Bool = false;
  private stable var registrationFee2IcpV1 : Bool = false;
  /// Force live fee to 5 ICP once (does not re-run after master changes fee later if they re-save)
  private stable var registrationFeeTo5IcpOpsV1 : Bool = false;

  // ─── Prepaid ICP balances + per-action ICP fees (replaces soft tokens / packs) ───
  /// Default OFF / 0 so network stays usable until master configures fees.
  private stable var postFeeEnabled : Bool = false;
  private stable var loveFeeEnabled : Bool = false;
  private stable var messageFeeEnabled : Bool = false;
  private stable var postFeeE8s : Nat = 0;
  private stable var loveFeeE8s : Nat = 0;
  private stable var messageFeeE8s : Nat = 0;
  private stable var userIcpE8sEntries : [(Principal, Nat)] = [];
  /// Cumulative ICP (e8s) tipped to any master; unlock network tipping at tipUnlockMinE8s (default 0.01 ICP).
  private stable var tipUnlockMinE8s : Nat = 1_000_000;
  /// When false, tip APIs reject and the app should hide all tip UI for members.
  private stable var tippingEnabled : Bool = true;
  private stable var tipMasterPaidEntries : [(Principal, Nat)] = [];

  // ─── Creator invites (identity-linked) ─────────────────────────────────
  /// Paid Joins needed before inviter gets free Join + site.
  private stable var REFERRAL_REWARD_THRESHOLD : Nat = 15;
  private stable var referralCountEntries : [(Principal, Nat)] = [];
  private stable var referredByEntries : [(Principal, Principal)] = []; // newUser -> inviter
  private stable var referralFreeEligibleEntries : [(Principal, Bool)] = [];
  private stable var referralFreeClaimedEntries : [(Principal, Bool)] = [];

  // ─── ICE Lite admin lock (Web2 lite.frostedblocks.com) ─────────────────
  // Default owner is founder II (gmtr2). A one-time claimLiteAdmin() by an ICE
  // master can assign the lock to the II currently using Master Profile (e.g. ogsk6
  // on apex). After claim, ONLY that principal may write — not isMaster broadly.
  // Name LITE_ADMIN_OWNER kept for Motoko stable upgrade compatibility.
  private stable var LITE_ADMIN_OWNER : Principal = Principal.fromText(
    "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"
  );

  type LiteAdmin = {
    signupsOpen : Bool;
    feedBridgeOpen : Bool;
    bannedLiteHandles : [Text];
    hiddenLitePostIds : [Text];
    updatedAt : Int;
  };

  type LiteAdminWrite = {
    #ok : LiteAdmin;
    #unauthorized;
  };

  /// One-time: master Profile "Activate" assigns LITE_ADMIN_OWNER to msg.caller.
  private stable var liteAdminClaimed : Bool = false;
  private stable var liteSignupsOpen : Bool = true;
  private stable var liteFeedBridgeOpen : Bool = true;
  private stable var liteBannedHandles : [Text] = [];
  private stable var liteHiddenPostIds : [Text] = [];
  private stable var liteAdminUpdatedAt : Int = 0;

  // Stable snapshots (HashMaps are rebuilt on upgrade — without this, usernames/posts wipe on deploy)
  private stable var userBalancesEntries : [(Principal, UserBalance)] = [];
  private stable var userProfilesEntries : [(Principal, UserProfile)] = [];
  private stable var registeredUsersEntries : [(Principal, Bool)] = [];
  private stable var postsEntries : [(Nat, Post)] = [];
  private stable var commentsEntries : [(Nat, Comment)] = [];
  private stable var postCommentsEntries : [(Nat, [Nat])] = [];
  private stable var followingEntries : [(Principal, [Principal])] = [];
  private stable var followersEntries : [(Principal, [Principal])] = [];
  private stable var blocksEntries : [(Principal, [Principal])] = [];
  private stable var keywordIndexEntries : [(Text, [Nat])] = [];
  private stable var reportsEntries : [(Nat, [Principal])] = [];
  private stable var bannedEntries : [(Principal, Bool)] = [];
  private stable var pendingPaymentsEntries : [(Nat, PendingPayment)] = [];
  private stable var postLikersEntries : [(Nat, [Principal])] = [];
  private stable var postLoversEntries : [(Nat, [Principal])] = [];
  private stable var usernameIndexEntries : [(Text, Principal)] = [];
  // Categories kept separate so Post type stays upgrade-compatible
  private stable var postCategoryEntries : [(Nat, Text)] = [];
  private stable var followedCategoriesEntries : [(Principal, [Text])] = [];
  /// Users whose site is detached from factory: posts only for self + social followers (not global/public feed).
  private stable var networkPrivateEntries : [(Principal, Bool)] = [];
  /// In-app notifications: recipient -> list (newest first, capped).
  private stable var notificationEntries : [(Principal, [Notification])] = [];
  private stable var nextNotificationId : Nat = 1;
  private let MAX_NOTIFS_PER_USER : Nat = 50;
  private let MAX_POST_FANOUT : Nat = 50;
  /// Guest / public contact inbox for master (newest first).
  private stable var masterContactEntries : [MasterContact] = [];
  private stable var nextMasterContactId : Nat = 1;
  private stable var lastAnonContactAt : Int = 0;
  private let MAX_MASTER_CONTACTS : Nat = 100;
  private let MAX_CONTACT_CONTENT : Nat = 500;
  private let MAX_CONTACT_LABEL : Nat = 80;
  private let ANON_CONTACT_COOLDOWN_NS : Int = 60_000_000_000; // 60s between anonymous sends

  private transient var userBalances = HashMap.HashMap<Principal, UserBalance>(0, Principal.equal, Principal.hash);
  private transient var userIcpE8s = HashMap.HashMap<Principal, Nat>(0, Principal.equal, Principal.hash);
  private transient var tipMasterPaid = HashMap.HashMap<Principal, Nat>(0, Principal.equal, Principal.hash);
  private transient var referralCount = HashMap.HashMap<Principal, Nat>(0, Principal.equal, Principal.hash);
  private transient var referredBy = HashMap.HashMap<Principal, Principal>(0, Principal.equal, Principal.hash);
  private transient var referralFreeEligible = HashMap.HashMap<Principal, Bool>(0, Principal.equal, Principal.hash);
  private transient var referralFreeClaimed = HashMap.HashMap<Principal, Bool>(0, Principal.equal, Principal.hash);
  private transient var userProfiles = HashMap.HashMap<Principal, UserProfile>(0, Principal.equal, Principal.hash);
  private transient var registeredUsers = HashMap.HashMap<Principal, Bool>(0, Principal.equal, Principal.hash);
  private transient var posts = HashMap.HashMap<Nat, Post>(0, Nat.equal, func (n: Nat) : Nat32 { Nat32.fromNat(n) });
  private transient var comments = HashMap.HashMap<Nat, Comment>(0, Nat.equal, func (n: Nat) : Nat32 { Nat32.fromNat(n) });
  private transient var postComments = HashMap.HashMap<Nat, [Nat]>(0, Nat.equal, func (n: Nat) : Nat32 { Nat32.fromNat(n) });
  // caller -> principals they follow
  private transient var following = HashMap.HashMap<Principal, [Principal]>(0, Principal.equal, Principal.hash);
  // principal -> who follows them (reverse index)
  private transient var followers = HashMap.HashMap<Principal, [Principal]>(0, Principal.equal, Principal.hash);
  // blocker -> principals they blocked
  private transient var blocks = HashMap.HashMap<Principal, [Principal]>(0, Principal.equal, Principal.hash);
  private transient var keywordIndex = HashMap.HashMap<Text, [Nat]>(0, Text.equal, Text.hash);
  private transient var reports = HashMap.HashMap<Nat, [Principal]>(0, Nat.equal, func (n: Nat) : Nat32 { Nat32.fromNat(n) });
  private transient var banned = HashMap.HashMap<Principal, Bool>(0, Principal.equal, Principal.hash);
  private transient var pendingPayments = HashMap.HashMap<Nat, PendingPayment>(0, Nat.equal, func (n: Nat) : Nat32 { Nat32.fromNat(n) });
  // One reaction per user per post
  private transient var postLikers = HashMap.HashMap<Nat, [Principal]>(0, Nat.equal, func (n: Nat) : Nat32 { Nat32.fromNat(n) });
  private transient var postLovers = HashMap.HashMap<Nat, [Principal]>(0, Nat.equal, func (n: Nat) : Nat32 { Nat32.fromNat(n) });
  // Lowercase username -> owner principal (unique names)
  private transient var usernameIndex = HashMap.HashMap<Text, Principal>(0, Text.equal, Text.hash);
  // postId -> category label
  private transient var postCategories = HashMap.HashMap<Nat, Text>(0, Nat.equal, func (n: Nat) : Nat32 { Nat32.fromNat(n) });
  // user -> categories they follow (for feed filter)
  private transient var followedCategories = HashMap.HashMap<Principal, [Text]>(0, Principal.equal, Principal.hash);
  // true = site detached → not in public/global discovery feeds
  private transient var networkPrivate = HashMap.HashMap<Principal, Bool>(0, Principal.equal, Principal.hash);
  private transient var notifications = HashMap.HashMap<Principal, [Notification]>(0, Principal.equal, Principal.hash);
  private transient var masterContacts : [MasterContact] = [];

  // Valid post categories (fixed list)
  private let VALID_CATEGORIES : [Text] = [
    "General", "Tech", "Crypto", "Life", "Ideas", "News", "Art", "Sports", "Questions", "Random"
  ];
  private let DEFAULT_CATEGORY : Text = "General";

  private func natHash(n : Nat) : Nat32 { Nat32.fromNat(n) };

  system func preupgrade() {
    userBalancesEntries := Iter.toArray(userBalances.entries());
    userIcpE8sEntries := Iter.toArray(userIcpE8s.entries());
    tipMasterPaidEntries := Iter.toArray(tipMasterPaid.entries());
    referralCountEntries := Iter.toArray(referralCount.entries());
    referredByEntries := Iter.toArray(referredBy.entries());
    referralFreeEligibleEntries := Iter.toArray(referralFreeEligible.entries());
    referralFreeClaimedEntries := Iter.toArray(referralFreeClaimed.entries());
    userProfilesEntries := Iter.toArray(userProfiles.entries());
    registeredUsersEntries := Iter.toArray(registeredUsers.entries());
    postsEntries := Iter.toArray(posts.entries());
    commentsEntries := Iter.toArray(comments.entries());
    postCommentsEntries := Iter.toArray(postComments.entries());
    followingEntries := Iter.toArray(following.entries());
    followersEntries := Iter.toArray(followers.entries());
    blocksEntries := Iter.toArray(blocks.entries());
    keywordIndexEntries := Iter.toArray(keywordIndex.entries());
    reportsEntries := Iter.toArray(reports.entries());
    bannedEntries := Iter.toArray(banned.entries());
    pendingPaymentsEntries := Iter.toArray(pendingPayments.entries());
    postLikersEntries := Iter.toArray(postLikers.entries());
    postLoversEntries := Iter.toArray(postLovers.entries());
    usernameIndexEntries := Iter.toArray(usernameIndex.entries());
    postCategoryEntries := Iter.toArray(postCategories.entries());
    followedCategoriesEntries := Iter.toArray(followedCategories.entries());
    networkPrivateEntries := Iter.toArray(networkPrivate.entries());
    notificationEntries := Iter.toArray(notifications.entries());
    masterContactEntries := masterContacts;
  };

  system func postupgrade() {
    userBalances := HashMap.fromIter<Principal, UserBalance>(
      userBalancesEntries.vals(), userBalancesEntries.size(), Principal.equal, Principal.hash
    );
    userIcpE8s := HashMap.fromIter<Principal, Nat>(
      userIcpE8sEntries.vals(), userIcpE8sEntries.size(), Principal.equal, Principal.hash
    );
    tipMasterPaid := HashMap.fromIter<Principal, Nat>(
      tipMasterPaidEntries.vals(), tipMasterPaidEntries.size(), Principal.equal, Principal.hash
    );
    referralCount := HashMap.fromIter<Principal, Nat>(
      referralCountEntries.vals(), referralCountEntries.size(), Principal.equal, Principal.hash
    );
    referredBy := HashMap.fromIter<Principal, Principal>(
      referredByEntries.vals(), referredByEntries.size(), Principal.equal, Principal.hash
    );
    referralFreeEligible := HashMap.fromIter<Principal, Bool>(
      referralFreeEligibleEntries.vals(), referralFreeEligibleEntries.size(), Principal.equal, Principal.hash
    );
    referralFreeClaimed := HashMap.fromIter<Principal, Bool>(
      referralFreeClaimedEntries.vals(), referralFreeClaimedEntries.size(), Principal.equal, Principal.hash
    );
    referralCountEntries := [];
    referredByEntries := [];
    referralFreeEligibleEntries := [];
    referralFreeClaimedEntries := [];
    userProfiles := HashMap.fromIter<Principal, UserProfile>(
      userProfilesEntries.vals(), userProfilesEntries.size(), Principal.equal, Principal.hash
    );
    registeredUsers := HashMap.fromIter<Principal, Bool>(
      registeredUsersEntries.vals(), registeredUsersEntries.size(), Principal.equal, Principal.hash
    );
    posts := HashMap.fromIter<Nat, Post>(
      postsEntries.vals(), postsEntries.size(), Nat.equal, natHash
    );
    comments := HashMap.fromIter<Nat, Comment>(
      commentsEntries.vals(), commentsEntries.size(), Nat.equal, natHash
    );
    postComments := HashMap.fromIter<Nat, [Nat]>(
      postCommentsEntries.vals(), postCommentsEntries.size(), Nat.equal, natHash
    );
    following := HashMap.fromIter<Principal, [Principal]>(
      followingEntries.vals(), followingEntries.size(), Principal.equal, Principal.hash
    );
    followers := HashMap.fromIter<Principal, [Principal]>(
      followersEntries.vals(), followersEntries.size(), Principal.equal, Principal.hash
    );
    blocks := HashMap.fromIter<Principal, [Principal]>(
      blocksEntries.vals(), blocksEntries.size(), Principal.equal, Principal.hash
    );
    // One-time migration: rebuild reverse followers index if missing
    if (followersEntries.size() == 0 and followingEntries.size() > 0) {
      for ((user, targets) in following.entries()) {
        for (t in targets.vals()) {
          switch (followers.get(t)) {
            case (?list) {
              var found = false;
              for (p in list.vals()) {
                if (Principal.equal(p, user)) { found := true };
              };
              if (not found) {
                followers.put(t, Array.append(list, [user]));
              };
            };
            case null { followers.put(t, [user]) };
          };
        };
      };
    };
    keywordIndex := HashMap.fromIter<Text, [Nat]>(
      keywordIndexEntries.vals(), keywordIndexEntries.size(), Text.equal, Text.hash
    );
    reports := HashMap.fromIter<Nat, [Principal]>(
      reportsEntries.vals(), reportsEntries.size(), Nat.equal, natHash
    );
    banned := HashMap.fromIter<Principal, Bool>(
      bannedEntries.vals(), bannedEntries.size(), Principal.equal, Principal.hash
    );
    pendingPayments := HashMap.fromIter<Nat, PendingPayment>(
      pendingPaymentsEntries.vals(), pendingPaymentsEntries.size(), Nat.equal, natHash
    );
    postLikers := HashMap.fromIter<Nat, [Principal]>(
      postLikersEntries.vals(), postLikersEntries.size(), Nat.equal, natHash
    );
    postLovers := HashMap.fromIter<Nat, [Principal]>(
      postLoversEntries.vals(), postLoversEntries.size(), Nat.equal, natHash
    );
    usernameIndex := HashMap.fromIter<Text, Principal>(
      usernameIndexEntries.vals(), usernameIndexEntries.size(), Text.equal, Text.hash
    );
    postCategories := HashMap.fromIter<Nat, Text>(
      postCategoryEntries.vals(), postCategoryEntries.size(), Nat.equal, natHash
    );
    followedCategories := HashMap.fromIter<Principal, [Text]>(
      followedCategoriesEntries.vals(), followedCategoriesEntries.size(), Principal.equal, Principal.hash
    );
    networkPrivate := HashMap.fromIter<Principal, Bool>(
      networkPrivateEntries.vals(), networkPrivateEntries.size(), Principal.equal, Principal.hash
    );
    notifications := HashMap.fromIter<Principal, [Notification]>(
      notificationEntries.vals(), notificationEntries.size(), Principal.equal, Principal.hash
    );
    masterContacts := masterContactEntries;
    // One-time: every existing II with any account footprint is registered
    // so Join ICE only shows for brand-new principals.
    ignore registerAllExistingUsersInternal();
    // Free stable memory until next preupgrade
    userBalancesEntries := [];
    userProfilesEntries := [];
    registeredUsersEntries := [];
    postsEntries := [];
    commentsEntries := [];
    postCommentsEntries := [];
    followingEntries := [];
    followersEntries := [];
    blocksEntries := [];
    keywordIndexEntries := [];
    reportsEntries := [];
    bannedEntries := [];
    pendingPaymentsEntries := [];
    postLikersEntries := [];
    postLoversEntries := [];
    notificationEntries := [];
    masterContactEntries := [];
    usernameIndexEntries := [];
    postCategoryEntries := [];
    followedCategoriesEntries := [];
    networkPrivateEntries := [];
  };

  private func isNetworkPrivate(p : Principal) : Bool {
    switch (networkPrivate.get(p)) {
      case (?true) { true };
      case _ { false };
    }
  };

  private func viewerFollowsAuthor(viewer : Principal, author : Principal) : Bool {
    if (Principal.equal(viewer, author)) { return true };
    switch (following.get(viewer)) {
      case (?list) {
        for (t in list.vals()) {
          if (Principal.equal(t, author)) { return true };
        };
        false
      };
      case null { false };
    }
  };

  /// Detached authors: only self, their social followers, or master may see posts.
  private func canViewNetworkPrivateAuthor(viewer : ?Principal, author : Principal) : Bool {
    if (not isNetworkPrivate(author)) { return true };
    switch (viewer) {
      case null { false };
      case (?v) {
        Principal.equal(v, author) or viewerFollowsAuthor(v, author) or isMaster(v)
      };
    }
  };

  /// Mark every principal already in the system as registered (no fee, no re-join).
  private func registerAllExistingUsersInternal() : Nat {
    var n : Nat = 0;
    let mark = func(p : Principal) {
      if (Principal.isAnonymous(p)) { return };
      switch (registeredUsers.get(p)) {
        case (?true) {};
        case _ {
          registeredUsers.put(p, true);
          n += 1;
        };
      };
    };
    for ((p, _) in userProfiles.entries()) { mark(p) };
    for ((p, _) in userBalances.entries()) { mark(p) };
    for ((_, p) in usernameIndex.entries()) { mark(p) };
    for ((p, list) in following.entries()) {
      mark(p);
      for (t in list.vals()) { mark(t) };
    };
    for ((p, list) in followers.entries()) {
      mark(p);
      for (t in list.vals()) { mark(t) };
    };
    for ((p, list) in blocks.entries()) {
      mark(p);
      for (t in list.vals()) { mark(t) };
    };
    for ((_, post) in posts.entries()) { mark(post.author) };
    for ((_, c) in comments.entries()) { mark(c.author) };
    for ((_, pay) in pendingPayments.entries()) { mark(pay.user) };
    // Only mark the real canister owner — not every trusted recovery principal
    // (those were inflating registeredAccounts / profile-adjacent counts).
    if (not isOwnerUnclaimed()) { mark(owner) };
    n
  };

  private func principalListContains(list : [Principal], p : Principal) : Bool {
    for (x in list.vals()) {
      if (Principal.equal(x, p)) { return true };
    };
    false
  };

  private func principalListRemove(list : [Principal], p : Principal) : [Principal] {
    Array.filter<Principal>(list, func (x) { not Principal.equal(x, p) })
  };

  private func principalListAdd(list : [Principal], p : Principal) : [Principal] {
    if (principalListContains(list, p)) { list } else { Array.append(list, [p]) }
  };

  /// True if `blocker` has blocked `blockedUser`
  private func hasBlocked(blocker : Principal, blockedUser : Principal) : Bool {
    switch (blocks.get(blocker)) {
      case (?list) { principalListContains(list, blockedUser) };
      case null { false };
    }
  };

  /// Either party blocked the other (used to hide content / reject social actions)
  private func eitherBlocked(a : Principal, b : Principal) : Bool {
    hasBlocked(a, b) or hasBlocked(b, a)
  };

  /// Remove directed follow edge: fromUser follows toUser
  private func removeFollowEdge(fromUser : Principal, toUser : Principal) {
    switch (following.get(fromUser)) {
      case (?list) {
        let next = principalListRemove(list, toUser);
        if (next.size() == 0) { following.delete(fromUser) } else { following.put(fromUser, next) };
      };
      case null {};
    };
    switch (followers.get(toUser)) {
      case (?list) {
        let next = principalListRemove(list, fromUser);
        if (next.size() == 0) { followers.delete(toUser) } else { followers.put(toUser, next) };
      };
      case null {};
    };
  };

  private func addFollowEdge(fromUser : Principal, toUser : Principal) {
    switch (following.get(fromUser)) {
      case (?list) { following.put(fromUser, principalListAdd(list, toUser)) };
      case null { following.put(fromUser, [toUser]) };
    };
    switch (followers.get(toUser)) {
      case (?list) { followers.put(toUser, principalListAdd(list, fromUser)) };
      case null { followers.put(toUser, [fromUser]) };
    };
  };

  private func displayNameOf(p : Principal) : Text {
    switch (userProfiles.get(p)) {
      case (?pr) {
        if (Text.size(pr.username) > 0) { pr.username } else { Principal.toText(p) }
      };
      case null { Principal.toText(p) };
    }
  };

  /// Push in-app notification to `to` (no-op if self or anonymous). Newest first, capped.
  private func pushNotification(
    to : Principal,
    kind : Text,
    from : Principal,
    message : Text,
    refId : Nat
  ) {
    if (Principal.isAnonymous(to) or Principal.equal(to, from)) { return };
    let id = nextNotificationId;
    nextNotificationId += 1;
    let n : Notification = {
      id;
      kind;
      from;
      message;
      refId;
      createdAt = Time.now();
      read = false;
    };
    switch (notifications.get(to)) {
      case (?list) {
        let withNew = Array.append<Notification>([n], list);
        if (withNew.size() <= MAX_NOTIFS_PER_USER) {
          notifications.put(to, withNew);
        } else {
          notifications.put(
            to,
            Array.tabulate<Notification>(MAX_NOTIFS_PER_USER, func(i) { withNew[i] }),
          );
        };
      };
      case null { notifications.put(to, [n]) };
    };
  };

  private func requireAuth(caller : Principal) : Bool {
    not Principal.isAnonymous(caller)
  };

  private func isValidCategory(cat : Text) : Bool {
    for (c in VALID_CATEGORIES.vals()) {
      if (c == cat) { return true };
    };
    false
  };

  private func normalizeCategory(cat : Text) : Text {
    if (isValidCategory(cat)) { cat } else { DEFAULT_CATEGORY }
  };

  private func lookupPostCategory(postId : Nat) : Text {
    switch (postCategories.get(postId)) {
      case (?c) { c };
      case null { DEFAULT_CATEGORY };
    }
  };

  // Sentinel "aaaaa-aa" means unclaimed (not the anonymous principal 2vxsx-fae)
  private func isOwnerUnclaimed() : Bool {
    Principal.isAnonymous(owner) or Principal.equal(owner, Principal.fromText("aaaaa-aa"))
  };

  /// Extra II principals allowed to manage economy / admin (same rights as owner).
  /// Covers NNS + app-specific Internet Identity principals for the founder.
  // Founder II principals (NNS + app) + ops deploy identity for recovery.
  // gmtr2 = primary master (user-confirmed).
  private let TRUSTED_MASTER_PRINCIPALS : [Principal] = [
    Principal.fromText("gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"),
    // Same founder II on frostedblocks.com when derivationOrigin is not applied
    Principal.fromText("ogsk6-lwnep-oa422-nqvac-puciz-6fbaw-emuqb-xi6ay-ga75u-3e5rh-jae"),
    Principal.fromText("4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"),
    Principal.fromText("d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae"),
    Principal.fromText("zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae"),
    Principal.fromText("vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe"),
  ];

  private func isTrustedMaster(p : Principal) : Bool {
    let t = Principal.toText(p);
    if (t == "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae") { return true };
    if (t == "ogsk6-lwnep-oa422-nqvac-puciz-6fbaw-emuqb-xi6ay-ga75u-3e5rh-jae") { return true };
    if (t == "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe") { return true };
    if (t == "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae") { return true };
    if (t == "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae") { return true };
    if (t == "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe") { return true };
    for (m in TRUSTED_MASTER_PRINCIPALS.vals()) {
      if (Principal.equal(m, p)) { return true };
    };
    false
  };

  private func isMaster(p : Principal) : Bool {
    if (Principal.isAnonymous(p)) { return false };
    // Primary owner always master (once claimed)
    if (not isOwnerUnclaimed() and Principal.equal(owner, p)) { return true };
    // Founder II principals (NNS / app) can always manage even if owner record drifted
    isTrustedMaster(p)
  };

  private func isBannedUser(p : Principal) : Bool {
    switch (banned.get(p)) {
      case (?true) { true };
      case _ { false };
    }
  };

  private func principalInList(list : [Principal], p : Principal) : Bool {
    for (x in list.vals()) {
      if (Principal.equal(x, p)) { return true };
    };
    false
  };

  private func usernameKey(name : Text) : Text {
    Text.toLowercase(name)
  };

  /// Reserve username for user; release previous name if they are renaming.
  /// Returns null on success, or an error message.
  private func claimUsername(user : Principal, newName : Text) : ?Text {
    if (Text.size(newName) == 0) {
      return ?"Username cannot be empty";
    };
    if (Text.size(newName) > 50) {
      return ?"Username must be 50 characters or less";
    };
    let key = usernameKey(newName);

    // Who currently owns this username?
    switch (usernameIndex.get(key)) {
      case (?owner) {
        if (not Principal.equal(owner, user)) {
          return ?"Username already taken";
        };
        // Same user keeping same name (or same key)
      };
      case null {};
    };

    // Free previous username if renaming
    switch (userProfiles.get(user)) {
      case (?old) {
        if (Text.size(old.username) > 0) {
          let oldKey = usernameKey(old.username);
          if (oldKey != key) {
            switch (usernameIndex.get(oldKey)) {
              case (?owner) {
                if (Principal.equal(owner, user)) {
                  usernameIndex.delete(oldKey);
                };
              };
              case null {};
            };
          };
        };
      };
      case null {};
    };

    usernameIndex.put(key, user);
    null
  };

  private func priceForTokens(tokenAmount : Nat) : ?Nat {
    if (tiers.size() >= 3) {
      if (tokenAmount == tiers[0]) { ?price200E8s }
      else if (tokenAmount == tiers[1]) { ?price400E8s }
      else if (tokenAmount == tiers[2]) { ?price600E8s }
      else { null }
    } else { null }
  };

  private func creditTokens(user : Principal, amount : Nat) {
    // Soft tokens deprecated — no-op (kept so old call sites compile)
    ignore user;
    ignore amount;
  };

  private func getIcpE8s(user : Principal) : Nat {
    switch (userIcpE8s.get(user)) {
      case (?n) { n };
      case null { 0 };
    }
  };

  private func setIcpE8s(user : Principal, amount : Nat) {
    if (amount == 0) { userIcpE8s.delete(user) } else { userIcpE8s.put(user, amount) };
  };

  private func creditIcpE8s(user : Principal, amount : Nat) {
    if (amount == 0) { return };
    setIcpE8s(user, getIcpE8s(user) + amount);
  };

  private func spendIcpE8sInternal(user : Principal, amount : Nat) : Bool {
    if (amount == 0) { return true };
    let bal = getIcpE8s(user);
    if (bal < amount) { return false };
    setIcpE8s(user, bal - amount);
    true
  };

  private func getUserBalance(user : Principal) : UserBalance {
    switch (userBalances.get(user)) {
      case (?b) { b };
      case null {
        let newB : UserBalance = {
          tokens = 0;
          postsThisMonth = 0;
          postsToday = 0;
          lastReset = Time.now();
          lastDailyReset = Time.now();
        };
        userBalances.put(user, newB);
        newB
      };
    }
  };

  private func maybeReset(user : Principal, balance : UserBalance) : UserBalance {
    let now = Time.now();
    let dayInNanos : Int = 24 * 60 * 60 * 1_000_000_000;
    let monthInNanos : Int = 30 * dayInNanos;

    var postsThisMonth = balance.postsThisMonth;
    var postsToday = balance.postsToday;
    var lastReset = balance.lastReset;
    var lastDailyReset = balance.lastDailyReset;

    if (now - balance.lastReset > monthInNanos) {
      postsThisMonth := 0;
      lastReset := now;
    };

    if (now - balance.lastDailyReset > dayInNanos) {
      postsToday := 0;
      lastDailyReset := now;
    };

    let updated : UserBalance = {
      tokens = balance.tokens;
      postsThisMonth = postsThisMonth;
      postsToday = postsToday;
      lastReset = lastReset;
      lastDailyReset = lastDailyReset;
    };
    userBalances.put(user, updated);
    updated
  };

  private func indexPost(postId : Nat, content : Text) {
    let words = Text.split(content, #char ' ');
    for (word in words) {
      let lower = Text.toLowercase(word);
      if (Text.size(lower) > 2) {
        switch (keywordIndex.get(lower)) {
          case (?ids) { keywordIndex.put(lower, Array.append(ids, [postId])); };
          case null { keywordIndex.put(lower, [postId]); };
        };
      };
    };
  };

  public shared(msg) func claimMasterProfile() : async Text {
    if (Principal.isAnonymous(msg.caller)) {
      return "You must be logged in";
    };
    if (not isOwnerUnclaimed()) {
      if (Principal.equal(owner, msg.caller)) {
        return "You already own the master profile";
      };
      return "Master profile already claimed";
    };

    owner := msg.caller;
    ownerCloaked := false;

    ignore claimUsername(msg.caller, "I.C.E.");
    userProfiles.put(msg.caller, {
      username = "I.C.E.";
      bio = "Founder of I.C.E. — a quieter place for real conversation.";
      avatarURL = "";
    });
    registeredUsers.put(msg.caller, true);

    creditTokens(msg.caller, 1000);
    "Master profile claimed successfully"
  };

  public query func getOwner() : async Principal { owner };
  public query func isOwner(user : Principal) : async Bool { isMaster(user) };
  public query func isOwnerVisible(user : Principal) : async Bool {
    isMaster(user) and not ownerCloaked
  };
  public query func isCloaked() : async Bool { ownerCloaked };

  public shared(msg) func setCloak(cloaked : Bool) : async Bool {
    if (not isMaster(msg.caller)) { return false };
    ownerCloaked := cloaked;
    true
  };

  // ─── Tokenomics / ICP pricing ───────────────────────────────────────────

  /// Token packs removed — always empty.
  public query func getSubscriptionOffers() : async [SubOffer] {
    []
  };

  private func migrateEnablePaymentsIfNeeded() {
    if (not paymentsEnabledFixV1) {
      paymentsEnabled := true;
      paymentsEnabledFixV1 := true;
    };
  };

  private func migrateRegistrationFeeIfNeeded() {
    // One-shot only. After master saves via adminSetRegistrationFee, flags stay true
    // so this never overwrites their chosen fee amount (except ops force-to-5 below once).
    if (not registrationFee2IcpV1) {
      REGISTRATION_FEE_E8S := 500_000_000; // 5 ICP
      registrationFeeEnabled := true;
      registrationFee2IcpV1 := true;
      registrationFee5IcpV1 := true;
    } else if (not registrationFee5IcpV1) {
      REGISTRATION_FEE_E8S := 500_000_000;
      registrationFeeEnabled := true;
      registrationFee5IcpV1 := true;
    };
    // Ops: set join fee to 5 ICP once on upgrade (user request)
    if (not registrationFeeTo5IcpOpsV1) {
      REGISTRATION_FEE_E8S := 500_000_000;
      registrationFeeEnabled := true;
      registrationFeeTo5IcpOpsV1 := true;
      registrationFee2IcpV1 := true;
      registrationFee5IcpV1 := true;
    };
  };

  /// One-shot / status: ensures launch migration ran, returns whether pack payments are live.
  public shared(_msg) func ensurePaymentsLive() : async Bool {
    migrateEnablePaymentsIfNeeded();
    migrateRegistrationFeeIfNeeded();
    paymentsEnabled
  };

  public query func isPaymentsEnabled() : async Bool { paymentsEnabled };

  public query func getEconomyConfig() : async {
    registrationFeeEnabled : Bool;
    registrationFeeE8s : Nat;
    registrationBonusTokens : Nat;
    tier1Tokens : Nat;
    price1E8s : Nat;
    tier2Tokens : Nat;
    price2E8s : Nat;
    tier3Tokens : Nat;
    price3E8s : Nat;
    paymentsEnabled : Bool;
    postFeeEnabled : Bool;
    loveFeeEnabled : Bool;
    messageFeeEnabled : Bool;
    postFeeE8s : Nat;
    loveFeeE8s : Nat;
    messageFeeE8s : Nat;
    tippingEnabled : Bool;
    tipUnlockMinE8s : Nat;
  } {
    {
      registrationFeeEnabled = registrationFeeEnabled;
      registrationFeeE8s = REGISTRATION_FEE_E8S;
      registrationBonusTokens = 0;
      // Packs removed — zeros for legacy UI fields
      tier1Tokens = 0;
      price1E8s = 0;
      tier2Tokens = 0;
      price2E8s = 0;
      tier3Tokens = 0;
      price3E8s = 0;
      paymentsEnabled = false;
      postFeeEnabled = postFeeEnabled;
      loveFeeEnabled = loveFeeEnabled;
      messageFeeEnabled = messageFeeEnabled;
      postFeeE8s = postFeeE8s;
      loveFeeE8s = loveFeeE8s;
      messageFeeE8s = messageFeeE8s;
      tippingEnabled = tippingEnabled;
      tipUnlockMinE8s = tipUnlockMinE8s;
    }
  };

  public query func isTippingEnabled() : async Bool { tippingEnabled };

  public shared(msg) func adminSetTippingEnabled(enabled : Bool) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    tippingEnabled := enabled;
    if (enabled) { "Tipping enabled" } else { "Tipping disabled — hidden from members" }
  };

  /// Master: set ICP action fees (e8s) and on/off for post, love, message.
  public shared(msg) func adminSetActionFees(
    postEnabled : Bool,
    postE8s : Nat,
    loveEnabled : Bool,
    loveE8s : Nat,
    messageEnabled : Bool,
    messageE8s : Nat
  ) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    postFeeEnabled := postEnabled;
    postFeeE8s := postE8s;
    loveFeeEnabled := loveEnabled;
    loveFeeE8s := loveE8s;
    messageFeeEnabled := messageEnabled;
    messageFeeE8s := messageE8s;
    "Action fees updated"
  };

  /// Deposit ICP into prepaid balance: II must icrc2_approve this canister first.
  public shared(msg) func depositIcp(amountE8s : Nat) : async Text {
    if (Principal.isAnonymous(msg.caller)) { return "You must be logged in" };
    if (isBannedUser(msg.caller)) { return "You are banned" };
    if (not isUserRegistered(msg.caller) and not isMaster(msg.caller)) {
      return "Register before depositing ICP";
    };
    if (amountE8s == 0) { return "Amount must be greater than 0" };
    switch (await chargeIcp(msg.caller, amountE8s)) {
      case (?err) { return err };
      case null {};
    };
    creditIcpE8s(msg.caller, amountE8s);
    pushNotification(
      msg.caller,
      "payment",
      Principal.fromActor(Ice),
      "ICP deposited to your prepaid balance",
      amountE8s,
    );
    "Deposited " # Nat.toText(amountE8s) # " e8s ICP. Prepaid balance updated."
  };

  public query(msg) func getMyIcpE8s() : async Nat {
    getIcpE8s(msg.caller)
  };

  /// Master: credit prepaid ICP e8s without ledger pull (ops / recovery).
  public shared(msg) func adminCreditIcpE8s(to : Principal, amountE8s : Nat) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (amountE8s == 0) { return "Amount must be greater than 0" };
    creditIcpE8s(to, amountE8s);
    "Credited " # Nat.toText(amountE8s) # " e8s prepaid ICP"
  };

  /// Master: debit prepaid ICP e8s (capped at balance; no ledger transfer).
  public shared(msg) func adminDebitIcpE8s(from : Principal, amountE8s : Nat) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (amountE8s == 0) { return "Amount must be greater than 0" };
    let bal = getIcpE8s(from);
    if (bal == 0) { return "User already has 0 prepaid ICP" };
    let removed = if (amountE8s > bal) { bal } else { amountE8s };
    setIcpE8s(from, bal - removed);
    "Removed " # Nat.toText(removed) # " e8s prepaid ICP. Remaining: " # Nat.toText(getIcpE8s(from))
  };

  /// Master: clear prepaid ICP balance to 0.
  public shared(msg) func adminClearIcpE8s(from : Principal) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    let had = getIcpE8s(from);
    setIcpE8s(from, 0);
    "Cleared " # Nat.toText(had) # " e8s prepaid ICP. Balance is now 0"
  };

  /// Apply current first-login fee migration (2 ICP). Master can still change via adminSetRegistrationFee.
  public shared(_msg) func ensureRegistrationFee5Icp() : async Text {
    migrateRegistrationFeeIfNeeded();
    "Registration fee: " # (if (registrationFeeEnabled) { "ON" } else { "OFF" })
      # " · " # Nat.toText(REGISTRATION_FEE_E8S) # " e8s"
  };

  public shared(_msg) func ensureRegistrationFee2Icp() : async Text {
    migrateRegistrationFeeIfNeeded();
    "Registration fee: " # (if (registrationFeeEnabled) { "ON" } else { "OFF" })
      # " · " # Nat.toText(REGISTRATION_FEE_E8S) # " e8s"
  };

  public shared(msg) func adminSetPaymentsEnabled(enabled : Bool) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    paymentsEnabledFixV1 := true; // don't auto-override master choice later
    paymentsEnabled := enabled;
    if (enabled) { "Token pack payments enabled" }
    else { "Token pack payments disabled" }
  };

  /// Master: turn registration fee on/off and set fee (e8s) + bonus tokens.
  public shared(msg) func adminSetRegistrationFee(
    enabled : Bool,
    feeE8s : Nat,
    bonusTokens : Nat
  ) : async Text {
    if (not isMaster(msg.caller)) {
      return "Not authorized — log in with a master Internet Identity (founder II).";
    };
    if (enabled and feeE8s == 0) {
      return "Fee must be > 0 e8s when registration cost is on (or turn it off)";
    };
    // Pin migrations so one-shot fee migrations never overwrite master choice again
    registrationFee2IcpV1 := true;
    registrationFee5IcpV1 := true;
    registrationFeeEnabled := enabled;
    // When disabling, keep previous fee so turning back on restores the last amount
    if (feeE8s > 0) {
      REGISTRATION_FEE_E8S := feeE8s;
    };
    REGISTRATION_BONUS_TOKENS := bonusTokens;
    if (enabled) {
      "Registration fee ON: " # Nat.toText(REGISTRATION_FEE_E8S) # " e8s ("
        # Nat.toText(REGISTRATION_FEE_E8S / 100_000_000) # " ICP), bonus "
        # Nat.toText(bonusTokens) # " tokens"
    } else {
      "Registration fee OFF (free signup). Bonus tokens: " # Nat.toText(bonusTokens)
    }
  };

  /// Master: move primary owner record (optional; trusted masters keep admin rights either way).
  public shared(msg) func transferMasterProfile(newOwner : Principal) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (Principal.isAnonymous(newOwner)) { return "Invalid principal" };
    owner := newOwner;
    registeredUsers.put(newOwner, true);
    // Ensure profile exists so UI never treats master as "new join"
    switch (userProfiles.get(newOwner)) {
      case (?_) {};
      case null {
        // Prefer existing FrostedBlocks profile text if owned by previous master
        var uname = "Master";
        var ubio = "Founder of ICE.";
        var uav = "";
        switch (userProfiles.get(msg.caller)) {
          case (?p) {
            if (Text.size(p.username) > 0) { uname := p.username };
            ubio := p.bio;
            uav := p.avatarURL;
          };
          case null {};
        };
        // claimUsername may fail if name taken — still save profile under Master
        switch (claimUsername(newOwner, uname)) {
          case (?_) {
            ignore claimUsername(newOwner, "Master");
            uname := "Master";
          };
          case null {};
        };
        userProfiles.put(newOwner, {
          username = uname;
          bio = ubio;
          avatarURL = uav;
        });
      };
    };
    "Master owner set to " # Principal.toText(newOwner)
  };

  /// Deprecated — token packs removed. Use adminSetActionFees + depositIcp.
  public shared(msg) func adminSetTokenPacks(
    t1 : Nat, p1 : Nat,
    t2 : Nat, p2 : Nat,
    t3 : Nat, p3 : Nat
  ) : async Text {
    ignore t1; ignore p1; ignore t2; ignore p2; ignore t3; ignore p3;
    if (not isMaster(msg.caller)) { return "Not authorized" };
    "Token packs removed. Set per-action ICP fees instead."
  };

  public shared(msg) func adminSetPrices(p1 : Nat, p2 : Nat, p3 : Nat) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (p1 == 0 or p2 == 0 or p3 == 0) { return "Prices must be > 0 e8s" };
    price200E8s := p1;
    price400E8s := p2;
    price600E8s := p3;
    "Prices updated"
  };

  public query(msg) func getTreasuryStats() : async TreasuryStats {
    if (not isMaster(msg.caller)) {
      return { paymentsEnabled = false; totalIcpReceivedE8s = 0; pendingCount = 0 };
    };
    {
      paymentsEnabled = paymentsEnabled;
      totalIcpReceivedE8s = totalIcpReceivedE8s;
      pendingCount = pendingPayments.size();
    }
  };

  /// Liquid ICP on ICE default account (treasury).
  public shared func getIceTreasuryIcpBalanceE8s() : async Nat {
    await IcpLedgerExt.icrc1_balance_of({
      owner = Principal.fromActor(Ice);
      subaccount = null;
    })
  };

  /// Master/ops: convert ICE treasury ICP into cycles on the master factory via CMC.
  /// amountE8s = 0 converts all liquid ICP (minus one ledger fee).
  public shared(msg) func adminConvertTreasuryIcpToFactoryCycles(amountE8s : Nat) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    let bal = await IcpLedgerExt.icrc1_balance_of({
      owner = Principal.fromActor(Ice);
      subaccount = null;
    });
    if (bal <= ICP_TRANSFER_FEE_E8S) {
      return "No convertible ICP on ICE (balance " # Nat.toText(bal) # " e8s)";
    };
    let maxConvertible = bal - ICP_TRANSFER_FEE_E8S;
    let amt =
      if (amountE8s == 0) { maxConvertible }
      else if (amountE8s > maxConvertible) { maxConvertible }
      else { amountE8s };
    await convertIceIcpToFactoryCycles(amt)
  };

  public query(msg) func getPendingPayments() : async [(Nat, PendingPayment)] {
    if (not isMaster(msg.caller)) { return [] };
    let buf = Buffer.Buffer<(Nat, PendingPayment)>(0);
    for ((id, p) in pendingPayments.entries()) {
      buf.add((id, p));
    };
    Buffer.toArray(buf)
  };

  /// Token packs removed — use depositIcp instead.
  public shared(msg) func buyTokenPack(_tokenAmount : Nat) : async Text {
    ignore msg;
    "Token packs are removed. Deposit ICP to your prepaid balance instead."
  };

  /// Legacy: record a manual purchase request (no ICP pulled). Prefer buyTokenPack.
  public shared(msg) func requestPaidSubscription(tokenAmount : Nat) : async Text {
    if (isBannedUser(msg.caller)) { return "You are banned" };
    migrateEnablePaymentsIfNeeded();
    if (not paymentsEnabled) {
      return "Payments are not live yet. Master can enable Token pack payments in Master controls.";
    };

    switch (priceForTokens(tokenAmount)) {
      case null { return "Invalid tier. Choose a current pack size." };
      case (?price) {
        let id = nextPendingId;
        nextPendingId += 1;
        pendingPayments.put(id, {
          user = msg.caller;
          tokens = tokenAmount;
          priceE8s = price;
          requestedAt = Time.now();
        });
        "Manual request #" # Nat.toText(id) # " recorded for " #
          Nat.toText(tokenAmount) # " tokens (" # Nat.toText(price) # " e8s). " #
          "Prefer automatic Buy with ICP. Confirm only after you verify ICP arrived."
      };
    }
  };

  /// Master confirms a *manual* request after verifying ICP off-chain. Prefer buyTokenPack (auto).
  public shared(msg) func adminConfirmPayment(pendingId : Nat) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };

    switch (pendingPayments.get(pendingId)) {
      case null { return "Pending payment not found" };
      case (?p) {
        creditTokens(p.user, p.tokens);
        // Do NOT inflate treasury here unless ICP was real — still track for bookkeeping
        totalIcpReceivedE8s += p.priceE8s;
        pendingPayments.delete(pendingId);
        pushNotification(
          p.user,
          "payment",
          msg.caller,
          "Payment confirmed — " # Nat.toText(p.tokens) # " tokens credited",
          p.tokens,
        );
        "Confirmed (manual). Credited " # Nat.toText(p.tokens) # " tokens. " #
          "Only use this after verifying ICP was received."
      };
    }
  };

  public shared(msg) func adminRejectPayment(pendingId : Nat) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    switch (pendingPayments.get(pendingId)) {
      case null { return "Pending payment not found" };
      case (?_) {
        pendingPayments.delete(pendingId);
        "Pending payment rejected and removed"
      };
    }
  };

  public query func getLimits() : async Limits {
    {
      freeTierLimit = freeTierLimit;
      dailyLimit = dailyLimit;
      tokensPerPost = tokensPerPost;
      tokensPerLove = tokensPerLove;
      tokensPerMessage = tokensPerMessage;
      freeMaxLength = freeMaxLength;
      paidMaxLength = paidMaxLength;
      maxCommentLength = maxCommentLength;
      reportsToHide = reportsToHide;
    }
  };

  public shared(msg) func adminSetLimits(
    freeTierLimit_ : Nat,
    dailyLimit_ : Nat,
    tokensPerPost_ : Nat,
    tokensPerLove_ : Nat,
    tokensPerMessage_ : Nat,
    freeMaxLength_ : Nat,
    paidMaxLength_ : Nat,
    maxCommentLength_ : Nat,
    reportsToHide_ : Nat
  ) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (freeMaxLength_ == 0 or paidMaxLength_ == 0 or maxCommentLength_ == 0) {
      return "Character limits must be at least 1";
    };
    if (reportsToHide_ == 0) { return "Reports to hide must be at least 1" };

    freeTierLimit := freeTierLimit_;
    dailyLimit := dailyLimit_;
    tokensPerPost := tokensPerPost_;
    tokensPerLove := tokensPerLove_;
    tokensPerMessage := tokensPerMessage_;
    freeMaxLength := freeMaxLength_;
    paidMaxLength := paidMaxLength_;
    maxCommentLength := maxCommentLength_;
    reportsToHide := reportsToHide_;
    "Limits updated"
  };

  public shared(msg) func adminGrantTokens(to : Principal, amount : Nat) : async Bool {
    if (not isMaster(msg.caller)) { return false };
    if (amount == 0) { return true };
    creditTokens(to, amount);
    pushNotification(
      to,
      "payment",
      msg.caller,
      "You received " # Nat.toText(amount) # " tokens",
      amount,
    );
    true
  };

  /// Master: mark a principal registered without charging ICP (payment recovery / II principal mismatch).
  /// If username is empty, only flips the registered flag (keeps existing profile if any).
  public shared(msg) func adminMarkRegistered(
    user : Principal,
    username : Text,
    bio : Text
  ) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (Principal.isAnonymous(user)) { return "Invalid user" };
    if (isBannedUser(user)) { return "User is banned" };

    let uname = Text.trim(username, #char ' ');
    if (Text.size(uname) > 0) {
      switch (claimUsername(user, uname)) {
        case (?err) { return err };
        case null {};
      };
      let existingBio = switch (userProfiles.get(user)) {
        case (?p) { if (Text.size(bio) > 0) { bio } else { p.bio } };
        case null { bio };
      };
      let av = switch (userProfiles.get(user)) {
        case (?p) { p.avatarURL };
        case null { "" };
      };
      userProfiles.put(user, { username = uname; bio = existingBio; avatarURL = av });
    };

    registeredUsers.put(user, true);
    // Do not auto-credit bonus (they may have already received it when they paid)
    "Marked registered (no fee): " # Principal.toText(user)
      # (if (Text.size(uname) > 0) { " · username " # uname } else { "" })
  };

  /// Master: II principal mismatch recovery — copy membership to a new II without Join fee.
  /// Marks `to` registered; optionally reassigns username from `from` if `to` has none.
  /// Does not move posts/tokens (use adminGrantTokens / profile save separately).
  public shared(msg) func adminMigrateMembership(from : Principal, to : Principal) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (Principal.isAnonymous(from) or Principal.isAnonymous(to)) {
      return "Invalid principal";
    };
    if (Principal.equal(from, to)) { return "from and to are the same principal" };
    if (isBannedUser(to)) { return "Target principal is banned" };

    // Source should already be a member (or we still allow mark for recovery)
    let fromReg = isUserRegistered(from);
    if (not fromReg) {
      return "Source principal is not registered on ICE — mark them registered first or use adminMarkRegistered on target";
    };

    registeredUsers.put(to, true);

    var note = "Membership marked on " # Principal.toText(to);
    switch (userProfiles.get(from)) {
      case (?src) {
        switch (userProfiles.get(to)) {
          case (?dst) {
            // Keep existing target profile; only fill empty username
            if (Text.size(dst.username) == 0 and Text.size(src.username) > 0) {
              switch (claimUsername(to, src.username)) {
                case (?err) {
                  note #= " · username not moved (" # err # ")";
                };
                case null {
                  userProfiles.put(to, {
                    username = src.username;
                    bio = if (Text.size(dst.bio) > 0) { dst.bio } else { src.bio };
                    avatarURL = if (Text.size(dst.avatarURL) > 0) { dst.avatarURL } else { src.avatarURL };
                  });
                  note #= " · username " # src.username # " assigned";
                };
              };
            } else {
              note #= " · target already has profile";
            };
          };
          case null {
            switch (claimUsername(to, src.username)) {
              case (?err) {
                // Username taken — still create profile under empty then Master-style
                userProfiles.put(to, {
                  username = "";
                  bio = src.bio;
                  avatarURL = src.avatarURL;
                });
                note #= " · profile copied without username (" # err # ")";
              };
              case null {
                userProfiles.put(to, {
                  username = src.username;
                  bio = src.bio;
                  avatarURL = src.avatarURL;
                });
                note #= " · profile + username " # src.username # " copied";
              };
            };
          };
        };
      };
      case null {
        note #= " · source had no profile";
      };
    };

    // Optional: give target a zero balance entry so isUserRegistered stays true via footprint
    switch (userBalances.get(to)) {
      case (?_) {};
      case null {
        switch (userBalances.get(from)) {
          case (?b) {
            // Do not steal tokens — only seed empty balance if target has none
            ignore b;
            userBalances.put(to, {
              tokens = 0;
              postsThisMonth = 0;
              postsToday = 0;
              lastReset = Time.now();
              lastDailyReset = Time.now();
            });
          };
          case null {};
        };
      };
    };

    note # ". Also reassign personal site via Factory adminReassignSite if needed."
  };

  /// Master: list all profiles (principal + username + bio). For cleanup / audits.
  public query(msg) func adminListProfiles() : async [(Principal, Text, Text)] {
    if (not isMaster(msg.caller)) { return [] };
    let buf = Buffer.Buffer<(Principal, Text, Text)>(userProfiles.size());
    for ((p, pr) in userProfiles.entries()) {
      buf.add((p, pr.username, pr.bio));
    };
    Buffer.toArray(buf)
  };

  /// Master: delete a user profile + free its username. Does not delete posts.
  /// Use for duplicate/legacy II principals (e.g. old founder after owner transfer).
  /// Cannot delete the current owner principal's profile.
  public shared(msg) func adminDeleteProfile(user : Principal) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (Principal.isAnonymous(user)) { return "Invalid user" };
    if (not isOwnerUnclaimed() and Principal.equal(user, owner)) {
      return "Cannot delete the owner profile";
    };
    switch (userProfiles.get(user)) {
      case null { return "No profile for this principal" };
      case (?pr) {
        if (Text.size(pr.username) > 0) {
          let key = usernameKey(pr.username);
          switch (usernameIndex.get(key)) {
            case (?holder) {
              if (Principal.equal(holder, user)) { usernameIndex.delete(key) };
            };
            case null {};
          };
        };
        userProfiles.delete(user);
        // Drop registration flag so they don't count as an account (Join again if they return)
        registeredUsers.delete(user);
        "Deleted profile for " # Principal.toText(user)
          # (if (Text.size(pr.username) > 0) { " (username freed: " # pr.username # ")" } else { "" })
      };
    }
  };

  /// Master: clear registered flag for a principal that was auto-marked but is not a real member
  /// (e.g. ops deploy identity / unused founder IIs). Does not remove profile if one exists.
  public shared(msg) func adminUnmarkRegistered(user : Principal) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (Principal.isAnonymous(user)) { return "Invalid user" };
    if (not isOwnerUnclaimed() and Principal.equal(user, owner)) {
      return "Cannot unmark the owner";
    };
    switch (registeredUsers.get(user)) {
      case null { "Not registered" };
      case (?_) {
        registeredUsers.delete(user);
        "Unmarked registered: " # Principal.toText(user)
      };
    }
  };

  /// Master: remove tokens from a user (capped at their current balance).
  public shared(msg) func adminRemoveTokens(from : Principal, amount : Nat) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (amount == 0) { return "Amount must be greater than 0" };
    var bal = getUserBalance(from);
    bal := maybeReset(from, bal);
    if (bal.tokens == 0) {
      return "User already has 0 tokens";
    };
    let removed = if (amount > bal.tokens) { bal.tokens } else { amount };
    let remaining = bal.tokens - removed;
    userBalances.put(from, {
      tokens = remaining;
      postsThisMonth = bal.postsThisMonth;
      postsToday = bal.postsToday;
      lastReset = bal.lastReset;
      lastDailyReset = bal.lastDailyReset;
    });
    "Removed " # Nat.toText(removed) # " tokens. Remaining: " # Nat.toText(remaining)
  };

  /// Master: set user balance to zero.
  public shared(msg) func adminClearTokens(from : Principal) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    var bal = getUserBalance(from);
    bal := maybeReset(from, bal);
    let had = bal.tokens;
    userBalances.put(from, {
      tokens = 0;
      postsThisMonth = bal.postsThisMonth;
      postsToday = bal.postsToday;
      lastReset = bal.lastReset;
      lastDailyReset = bal.lastDailyReset;
    });
    "Cleared " # Nat.toText(had) # " tokens. Balance is now 0"
  };

  public shared(msg) func adminHidePost(postId : Nat) : async Bool {
    if (not isMaster(msg.caller)) { return false };
    switch (posts.get(postId)) {
      case null { false };
      case (?post) {
        posts.put(postId, {
          id = post.id; author = post.author; content = post.content; imageURL = post.imageURL;
          timestamp = post.timestamp; likes = post.likes; loves = post.loves;
          reportCount = post.reportCount; isHidden = true;
        });
        true
      };
    }
  };

  public shared(msg) func adminUnhidePost(postId : Nat) : async Bool {
    if (not isMaster(msg.caller)) { return false };
    switch (posts.get(postId)) {
      case null { false };
      case (?post) {
        reports.delete(postId);
        posts.put(postId, {
          id = post.id; author = post.author; content = post.content; imageURL = post.imageURL;
          timestamp = post.timestamp; likes = post.likes; loves = post.loves;
          reportCount = 0; isHidden = false;
        });
        true
      };
    }
  };

  public shared(msg) func adminBanUser(user : Principal) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (Principal.equal(user, msg.caller)) { return "You cannot ban yourself" };
    if (isMaster(user)) { return "Cannot ban the master profile" };
    banned.put(user, true);
    "User banned"
  };

  public shared(msg) func adminUnbanUser(user : Principal) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    banned.delete(user);
    "User unbanned"
  };

  public query func isBanned(user : Principal) : async Bool { isBannedUser(user) };

  public query(msg) func getBannedUsers() : async [Principal] {
    if (not isMaster(msg.caller)) { return [] };
    let buf = Buffer.Buffer<Principal>(0);
    for ((p, flag) in banned.entries()) {
      if (flag) { buf.add(p) };
    };
    Buffer.toArray(buf)
  };

  // IC management canister — ice must be a controller of messaging/assets to read their cycles
  type MgmtStatus = {
    status : { #running; #stopping; #stopped };
    memory_size : Nat;
    cycles : Nat;
    settings : {
      controllers : [Principal];
      compute_allocation : Nat;
      memory_allocation : Nat;
      freezing_threshold : Nat;
    };
    module_hash : ?Blob;
    idle_cycles_burned_per_day : Nat;
    reserved_cycles : Nat;
  };
  let IC = actor "aaaaa-aa" : actor {
    canister_status : shared { canister_id : Principal } -> async MgmtStatus;
  };

  // Mainnet canister ids (ScaleSpace / ICE)
  private let MESSAGING_CANISTER : Principal = Principal.fromText("6agwb-myaaa-aaaan-q6mxa-cai");
  private let ASSETS_CANISTER : Principal = Principal.fromText("6hhqv-baaaa-aaaan-q6mxq-cai");

  /// Master-only: cycle balances for ice, messaging, and assets (separately).
  /// Update call (uses management canister for messaging + assets).
  public shared(msg) func getCanisterCycles() : async {
    ice : Nat;
    messaging : Nat;
    assets : Nat;
  } {
    if (not isMaster(msg.caller)) {
      return { ice = 0; messaging = 0; assets = 0 };
    };

    let iceBal = ExperimentalCycles.balance();

    var msgBal : Nat = 0;
    var assetsBal : Nat = 0;

    // messaging
    try {
      let st = await IC.canister_status({ canister_id = MESSAGING_CANISTER });
      msgBal := st.cycles;
    } catch (_) {
      msgBal := 0;
    };

    // assets (frontend)
    try {
      let st2 = await IC.canister_status({ canister_id = ASSETS_CANISTER });
      assetsBal := st2.cycles;
    } catch (_) {
      assetsBal := 0;
    };

    {
      ice = iceBal;
      messaging = msgBal;
      assets = assetsBal;
    }
  };

  public query(msg) func getSiteStats() : async SiteStats {
    if (not isMaster(msg.caller)) {
      return {
        totalPosts = 0; visiblePosts = 0; hiddenPosts = 0; totalComments = 0;
        totalProfiles = 0; totalBalances = 0; reportedPosts = 0; totalReportFlags = 0;
        bannedUsers = 0; tokensInCirculation = 0; registeredAccounts = 0;
      };
    };

    var visible : Nat = 0;
    var hidden : Nat = 0;
    var reported : Nat = 0;
    var reportFlags : Nat = 0;
    for ((id, post) in posts.entries()) {
      if (post.isHidden) { hidden += 1 } else { visible += 1 };
      if (post.reportCount > 0) {
        reported += 1;
        reportFlags += post.reportCount;
      };
    };

    var bannedCount : Nat = 0;
    for ((p, flag) in banned.entries()) {
      if (flag) { bannedCount += 1 };
    };

    var tokenSum : Nat = 0;
    for ((p, bal) in userBalances.entries()) {
      tokenSum += bal.tokens;
    };

    // Registered Internet Identity accounts (paid/free register + master claim + legacy profiles)
    var regCount : Nat = 0;
    for ((p, flag) in registeredUsers.entries()) {
      if (flag) { regCount += 1 };
    };
    for ((p, prof) in userProfiles.entries()) {
      if (Text.size(prof.username) > 0) {
        switch (registeredUsers.get(p)) {
          case (?true) {};
          case _ { regCount += 1 };
        };
      };
    };

    {
      totalPosts = nextPostId;
      visiblePosts = visible;
      hiddenPosts = hidden;
      totalComments = nextCommentId;
      totalProfiles = userProfiles.size();
      totalBalances = userBalances.size();
      reportedPosts = reported;
      totalReportFlags = reportFlags;
      bannedUsers = bannedCount;
      tokensInCirculation = tokenSum;
      registeredAccounts = regCount;
    }
  };

  public query(msg) func getReportedPosts() : async [Post] {
    if (not isMaster(msg.caller)) { return [] };
    let buf = Buffer.Buffer<Post>(0);
    for ((id, post) in posts.entries()) {
      if (post.reportCount > 0 or post.isHidden) { buf.add(post) };
    };
    let arr = Buffer.toArray(buf);
    Array.sort<Post>(arr, func (a, b) {
      if (a.reportCount > b.reportCount) { #less }
      else if (a.reportCount < b.reportCount) { #greater }
      else { #equal }
    })
  };

  private func isUserRegistered(p : Principal) : Bool {
    if (Principal.isAnonymous(p)) { return false };
    // Master always registered
    if (isMaster(p)) { return true };
    switch (registeredUsers.get(p)) {
      case (?true) { true };
      case _ {
        // Any existing footprint = already a member (Join only for brand-new IIs)
        switch (userProfiles.get(p)) {
          case (?_) { true };
          case null {
            switch (userBalances.get(p)) {
              case (?_) { true };
              case null { false };
            }
          };
        }
      };
    }
  };

  public query func isRegistered(user : Principal) : async Bool {
    isUserRegistered(user)
  };

  /// After factory claimSiteByCanisterId: mark this II registered on ICE without Join fee.
  /// Requires owning at least one factory-registered personal site.
  public shared(msg) func completePrincipalMigration() : async Text {
    if (Principal.isAnonymous(msg.caller)) { return "You must be logged in" };
    if (isBannedUser(msg.caller)) { return "You are banned" };
    if (isUserRegistered(msg.caller) or isMaster(msg.caller)) {
      return "Already registered";
    };
    type FactorySites = actor {
      getUserSites : shared query (Principal) -> async [Principal];
    };
    let factory = actor (Principal.toText(FACTORY_PRINCIPAL)) : FactorySites;
    try {
      let sites = await factory.getUserSites(msg.caller);
      if (sites.size() == 0) {
        return "No personal site on factory — claim your canister id first while migration is open";
      };
    } catch (e) {
      return "Could not verify factory site ownership: " # Error.message(e);
    };
    registeredUsers.put(msg.caller, true);
    "ICE membership restored via principal migration (no Join fee). Set your username in Profile if needed."
  };

  /// Master: re-run migration — mark all known IIs registered (no fees).
  public shared(msg) func adminRegisterAllExistingUsers() : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    let n = registerAllExistingUsersInternal();
    "Marked " # Nat.toText(n) # " additional existing users as registered (no fee). Join only for new IIs."
  };

  public query func getRegistrationFeeE8s() : async Nat {
    REGISTRATION_FEE_E8S
  };

  public query func isRegistrationFeeEnabled() : async Bool {
    registrationFeeEnabled
  };

  private func isReferralFreeEligible(p : Principal) : Bool {
    switch (referralFreeEligible.get(p)) {
      case (?true) {
        switch (referralFreeClaimed.get(p)) {
          case (?true) { false };
          case _ { true };
        }
      };
      case _ { false };
    }
  };

  private func creditPaidReferral(newUser : Principal, referralCode : Text) {
    if (Text.size(referralCode) == 0) { return };
    switch (referredBy.get(newUser)) {
      case (?_) { return };
      case null {};
    };
    let code = Text.trim(referralCode, #char ' ');
    // Cheap validation — Principal.fromText still traps on garbage; keep codes II-shaped
    if (Text.size(code) < 20 or Text.size(code) > 80) { return };
    if (not Text.contains(code, #text "-")) { return };
    // Only accept characters typical of principal text
    for (c in code.chars()) {
      let ok =
        (c >= 'a' and c <= 'z') or
        (c >= '0' and c <= '9') or
        c == '-';
      if (not ok) { return };
    };
    let inviter = Principal.fromText(code);
    if (Principal.isAnonymous(inviter) or Principal.equal(inviter, newUser)) {
      return
    };
    referredBy.put(newUser, inviter);
    let prev = switch (referralCount.get(inviter)) {
      case (?n) { n };
      case null { 0 };
    };
    let next = prev + 1;
    referralCount.put(inviter, next);
    if (next >= REFERRAL_REWARD_THRESHOLD) {
      referralFreeEligible.put(inviter, true);
    };
  };

  private func registerInternal(
    caller : Principal,
    username : Text,
    bio : Text,
    avatarURL : Text,
    referralCode : Text
  ) : async Text {
    migrateRegistrationFeeIfNeeded();
    if (Principal.isAnonymous(caller)) {
      return "You must be logged in";
    };
    if (isBannedUser(caller)) { return "You are banned" };
    if (isUserRegistered(caller)) {
      return "Already registered. Use profile save to update.";
    };

    switch (claimUsername(caller, username)) {
      case (?err) { return err };
      case null {};
    };

    let rewardFree = isReferralFreeEligible(caller);
    let chargeFee = registrationFeeEnabled and not isMaster(caller) and not rewardFree;

    if (chargeFee) {
      let fee = REGISTRATION_FEE_E8S;
      switch (await chargeIcp(caller, fee)) {
        case (?err) {
          usernameIndex.delete(usernameKey(username));
          return err;
        };
        case null {};
      };
      ignore await distributeJoinFeeProceeds(fee);

      userProfiles.put(caller, { username; bio; avatarURL });
      registeredUsers.put(caller, true);
      creditTokens(caller, REGISTRATION_BONUS_TOKENS);
      creditPaidReferral(caller, referralCode);
      "Registered. Fee paid with Internet Identity. " # Nat.toText(REGISTRATION_BONUS_TOKENS) # " tokens credited. 2.7 ICP reserved for mint cycles; surplus to ops."
    } else {
      userProfiles.put(caller, { username; bio; avatarURL });
      registeredUsers.put(caller, true);
      if (REGISTRATION_BONUS_TOKENS > 0) {
        creditTokens(caller, REGISTRATION_BONUS_TOKENS);
      };
      if (rewardFree) {
        referralFreeClaimed.put(caller, true);
        "Registered (referral reward — free Join + site). Invite more creators!"
      } else if (isMaster(caller)) {
        "Registered (master — no fee). " # Nat.toText(REGISTRATION_BONUS_TOKENS) # " tokens credited."
      } else {
        "Registered (no fee). " # Nat.toText(REGISTRATION_BONUS_TOKENS) # " tokens credited."
      }
    }
  };

  /// Register with unique username. Master never pays.
  public shared(msg) func register(username : Text, bio : Text, avatarURL : Text) : async Text {
    await registerInternal(msg.caller, username, bio, avatarURL, "")
  };

  /// Identity-linked invite: referralCode = inviter's II principal text (`?ref=`).
  public shared(msg) func registerWithReferral(
    username : Text,
    bio : Text,
    avatarURL : Text,
    referralCode : Text
  ) : async Text {
    await registerInternal(msg.caller, username, bio, avatarURL, referralCode)
  };

  public shared query(msg) func getMyReferralStatus() : async {
    invitePrincipal : Text;
    count : Nat;
    threshold : Nat;
    eligible : Bool;
    claimed : Bool;
  } {
    let p = msg.caller;
    let count = switch (referralCount.get(p)) { case (?n) { n }; case null { 0 } };
    let claimed = switch (referralFreeClaimed.get(p)) { case (?true) { true }; case _ { false } };
    let eligible = isReferralFreeEligible(p);
    {
      invitePrincipal = Principal.toText(p);
      count;
      threshold = REFERRAL_REWARD_THRESHOLD;
      eligible;
      claimed;
    }
  };

  public shared(msg) func adminSetReferralThreshold(n : Nat) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (n == 0) { return "Threshold must be at least 1" };
    REFERRAL_REWARD_THRESHOLD := n;
    "Referral threshold set to " # Nat.toText(n) # " paid Joins"
  };

  public query func getReferralThreshold() : async Nat {
    REFERRAL_REWARD_THRESHOLD
  };

  /// Master campaign tracker: every inviter count + who referred whom (paid Joins only).
  public shared query(msg) func adminGetReferralTracker() : async {
    authorized : Bool;
    threshold : Nat;
    totalPaidReferrals : Nat;
    uniqueInviters : Nat;
    unlockedCount : Nat;
    claimedCount : Nat;
    inviters : [{
      principal : Text;
      username : Text;
      count : Nat;
      eligible : Bool;
      claimed : Bool;
    }];
    links : [{
      newUser : Text;
      newUsername : Text;
      inviter : Text;
      inviterUsername : Text;
    }];
  } {
    if (not isMaster(msg.caller)) {
      return {
        authorized = false;
        threshold = REFERRAL_REWARD_THRESHOLD;
        totalPaidReferrals = 0;
        uniqueInviters = 0;
        unlockedCount = 0;
        claimedCount = 0;
        inviters = [];
        links = [];
      };
    };

    type InviterRow = {
      principal : Text;
      username : Text;
      count : Nat;
      eligible : Bool;
      claimed : Bool;
    };
    type LinkRow = {
      newUser : Text;
      newUsername : Text;
      inviter : Text;
      inviterUsername : Text;
    };

    let invBuf = Buffer.Buffer<InviterRow>(referralCount.size());
    var unlocked : Nat = 0;
    var claimedN : Nat = 0;
    for ((p, count) in referralCount.entries()) {
      let claimed = switch (referralFreeClaimed.get(p)) {
        case (?true) { true };
        case _ { false };
      };
      let flaggedEligible = switch (referralFreeEligible.get(p)) {
        case (?true) { true };
        case _ { false };
      };
      let eligible = isReferralFreeEligible(p);
      if (flaggedEligible or claimed) { unlocked += 1 };
      if (claimed) { claimedN += 1 };
      invBuf.add({
        principal = Principal.toText(p);
        username = displayNameOf(p);
        count;
        eligible;
        claimed;
      });
    };
    let invSorted = Array.sort<InviterRow>(
      Buffer.toArray(invBuf),
      func(a : InviterRow, b : InviterRow) : { #less; #equal; #greater } {
        // Higher paid-invite count first
        if (a.count > b.count) { #less } else if (a.count < b.count) { #greater } else { #equal }
      },
    );

    let linkBuf = Buffer.Buffer<LinkRow>(referredBy.size());
    for ((newU, inv) in referredBy.entries()) {
      linkBuf.add({
        newUser = Principal.toText(newU);
        newUsername = displayNameOf(newU);
        inviter = Principal.toText(inv);
        inviterUsername = displayNameOf(inv);
      });
    };

    {
      authorized = true;
      threshold = REFERRAL_REWARD_THRESHOLD;
      totalPaidReferrals = referredBy.size();
      uniqueInviters = referralCount.size();
      unlockedCount = unlocked;
      claimedCount = claimedN;
      inviters = invSorted;
      links = Buffer.toArray(linkBuf);
    }
  };

  /// Inviter view: principals/usernames who paid Join through this II's `?ref=`.
  public shared query(msg) func getMyReferralInvites() : async {
    count : Nat;
    threshold : Nat;
    invites : [{ principal : Text; username : Text }];
  } {
    let me = msg.caller;
    let count = switch (referralCount.get(me)) { case (?n) { n }; case null { 0 } };
    let buf = Buffer.Buffer<{ principal : Text; username : Text }>(count);
    for ((newU, inv) in referredBy.entries()) {
      if (Principal.equal(inv, me)) {
        buf.add({
          principal = Principal.toText(newU);
          username = displayNameOf(newU);
        });
      };
    };
    {
      count;
      threshold = REFERRAL_REWARD_THRESHOLD;
      invites = Buffer.toArray(buf);
    }
  };

  /// Save profile (registered users or master). Usernames are unique (case-insensitive).
  public shared(msg) func setProfile(username : Text, bio : Text, avatarURL : Text) : async Text {
    if (isBannedUser(msg.caller)) { return "You are banned" };
    if (not isUserRegistered(msg.caller) and not isMaster(msg.caller)) {
      return "Register first before saving a profile";
    };
    switch (claimUsername(msg.caller, username)) {
      case (?err) { return err };
      case null {};
    };
    userProfiles.put(msg.caller, { username; bio; avatarURL });
    registeredUsers.put(msg.caller, true);
    "Profile saved"
  };

  public query func getProfile(user : Principal) : async ?UserProfile {
    userProfiles.get(user)
  };

  /// true if no one holds this username, or the caller already owns it.
  public query func isUsernameAvailable(name : Text) : async Bool {
    if (Text.size(name) == 0) { return false };
    switch (usernameIndex.get(usernameKey(name))) {
      case null { true };
      case (?_) { false };
    }
  };

  /// Optional: who owns a username (for debugging / lookups).
  public query func getPrincipalByUsername(name : Text) : async ?Principal {
    usernameIndex.get(usernameKey(name))
  };

  /// Master lookup result for II user search
  type AdminUserInfo = {
    user : Principal;
    username : Text;
    bio : Text;
    isRegistered : Bool;
    isBanned : Bool;
    tokens : Nat;
    postsThisMonth : Nat;
    postsToday : Nat;
    isFreeTier : Bool;
  };

  private func buildAdminUserInfo(p : Principal) : AdminUserInfo {
    let profile = userProfiles.get(p);
    let bal = getUserBalance(p);
    let isFree = bal.postsThisMonth < freeTierLimit;
    let reg = switch (registeredUsers.get(p)) {
      case (?true) { true };
      case _ { isMaster(p) };
    };
    {
      user = p;
      username = switch (profile) { case (?pr) { pr.username }; case null { "" } };
      bio = switch (profile) { case (?pr) { pr.bio }; case null { "" } };
      isRegistered = reg;
      isBanned = isBannedUser(p);
      // Legacy field name — now prepaid ICP e8s for admin UI (soft tokens unused).
      tokens = getIcpE8s(p);
      postsThisMonth = bal.postsThisMonth;
      postsToday = bal.postsToday;
      isFreeTier = if (isMaster(p)) { false } else { isFree };
    }
  };

  private func looksLikePrincipal(t : Text) : Bool {
    if (Text.size(t) < 20) { return false };
    var hyphens : Nat = 0;
    for (c in t.chars()) {
      let n = Char.toNat32(c);
      let isLower = n >= 97 and n <= 122;
      let isDigit = n >= 48 and n <= 57;
      let isHyphen = c == '-';
      if (isHyphen) { hyphens += 1 }
      else if (not isLower and not isDigit) { return false };
    };
    hyphens >= 3
  };

  private func parsePrincipalSafe(t : Text) : ?Principal {
    if (not looksLikePrincipal(t)) { return null };
    // fromText traps on invalid; looksLikePrincipal filters most junk
    ?Principal.fromText(t)
  };

  /// Master: look up one user by II principal text or exact username.
  public query(msg) func adminLookupUser(queryText : Text) : async ?AdminUserInfo {
    if (not isMaster(msg.caller)) { return null };
    let q = Text.trim(queryText, #char ' ');
    if (Text.size(q) == 0) { return null };

    switch (parsePrincipalSafe(q)) {
      case (?p) {
        if (not Principal.isAnonymous(p)) { return ?buildAdminUserInfo(p) };
      };
      case null {};
    };

    switch (usernameIndex.get(usernameKey(q))) {
      case (?p) { ?buildAdminUserInfo(p) };
      case null { null };
    }
  };

  /// Master: search users by username substring (case-insensitive). Also accepts a full principal.
  public query(msg) func adminSearchUsers(queryText : Text, limit : Nat) : async [AdminUserInfo] {
    if (not isMaster(msg.caller)) { return [] };
    let qRaw = Text.trim(queryText, #char ' ');
    if (Text.size(qRaw) == 0) { return [] };
    let maxN = if (limit == 0 or limit > 50) { 20 } else { limit };

    switch (parsePrincipalSafe(qRaw)) {
      case (?p) {
        if (not Principal.isAnonymous(p)) { return [buildAdminUserInfo(p)] };
      };
      case null {};
    };

    let q = usernameKey(qRaw);
    let buf = Buffer.Buffer<AdminUserInfo>(0);

    switch (usernameIndex.get(q)) {
      case (?p) { buf.add(buildAdminUserInfo(p)) };
      case null {};
    };

    label scan for ((key, p) in usernameIndex.entries()) {
      if (buf.size() >= maxN) { break scan };
      if (key == q) { continue scan };
      if (Text.contains(key, #text q)) {
        buf.add(buildAdminUserInfo(p));
      };
    };

    if (buf.size() == 0 and Text.size(qRaw) >= 5) {
      label scan2 for ((p, flag) in registeredUsers.entries()) {
        if (buf.size() >= maxN) { break scan2 };
        if (not flag) { continue scan2 };
        let pt = Principal.toText(p);
        if (Text.contains(pt, #text qRaw) or Text.contains(Text.toLowercase(pt), #text q)) {
          buf.add(buildAdminUserInfo(p));
        };
      };
    };

    Buffer.toArray(buf)
  };

  /// Follow target. Fails if anonymous, self, banned, or either side blocked.
  public shared(msg) func follow(target : Principal) : async Text {
    if (not requireAuth(msg.caller)) { return "Not authenticated" };
    if (isBannedUser(msg.caller)) { return "You are banned" };
    if (Principal.equal(msg.caller, target)) { return "Cannot follow yourself" };
    if (Principal.isAnonymous(target)) { return "Invalid target" };
    if (hasBlocked(target, msg.caller)) { return "You are blocked by this user" };
    if (hasBlocked(msg.caller, target)) { return "Unblock this user first" };
    addFollowEdge(msg.caller, target);
    pushNotification(
      target,
      "follow",
      msg.caller,
      displayNameOf(msg.caller) # " started following you",
      0,
    );
    "Following"
  };

  public shared(msg) func unfollow(target : Principal) : async Text {
    if (not requireAuth(msg.caller)) { return "Not authenticated" };
    if (Principal.equal(msg.caller, target)) { return "Cannot unfollow yourself" };
    removeFollowEdge(msg.caller, target);
    "Unfollowed"
  };

  /// Block target: store block and remove any follow edge both directions.
  public shared(msg) func block(target : Principal) : async Text {
    if (not requireAuth(msg.caller)) { return "Not authenticated" };
    if (isBannedUser(msg.caller)) { return "You are banned" };
    if (Principal.equal(msg.caller, target)) { return "Cannot block yourself" };
    if (Principal.isAnonymous(target)) { return "Invalid target" };
    switch (blocks.get(msg.caller)) {
      case (?list) { blocks.put(msg.caller, principalListAdd(list, target)) };
      case null { blocks.put(msg.caller, [target]) };
    };
    removeFollowEdge(msg.caller, target);
    removeFollowEdge(target, msg.caller);
    "Blocked"
  };

  public shared(msg) func unblock(target : Principal) : async Text {
    if (not requireAuth(msg.caller)) { return "Not authenticated" };
    switch (blocks.get(msg.caller)) {
      case (?list) {
        let next = principalListRemove(list, target);
        if (next.size() == 0) { blocks.delete(msg.caller) } else { blocks.put(msg.caller, next) };
      };
      case null {};
    };
    "Unblocked"
  };

  public query func getFollowing(user : Principal) : async [Principal] {
    switch (following.get(user)) {
      case (?list) { list };
      case null { [] };
    }
  };

  public query func getFollowers(user : Principal) : async [Principal] {
    switch (followers.get(user)) {
      case (?list) { list };
      case null { [] };
    }
  };

  /// following + followers for Associates UI
  public query func getAssociates(me : Principal) : async Associates {
    {
      following = switch (following.get(me)) { case (?l) { l }; case null { [] } };
      followers = switch (followers.get(me)) { case (?l) { l }; case null { [] } };
    }
  };

  /// True if `me` has blocked `other` (caller-centric block list)
  public query func isBlocked(me : Principal, other : Principal) : async Bool {
    hasBlocked(me, other)
  };

  /// True if either side has blocked the other (content isolation)
  public query func isEitherBlocked(a : Principal, b : Principal) : async Bool {
    eitherBlocked(a, b)
  };

  /// Principals that `user` has blocked
  public query func getBlocked(user : Principal) : async [Principal] {
    switch (blocks.get(user)) {
      case (?list) { list };
      case null { [] };
    }
  };

  /// Batch: which of `authors` are blocked either way vs `viewer` (for feed filtering)
  public query func filterBlockedAuthors(viewer : Principal, authors : [Principal]) : async [Principal] {
    Array.filter<Principal>(authors, func (a) { eitherBlocked(viewer, a) })
  };

  /// Deprecated — packs removed.
  public shared(msg) func subscribe(_tokenAmount : Nat) : async Text {
    ignore msg;
    "Token packs are removed. Deposit ICP to your prepaid balance."
  };

  private func spendTokensInternal(_user : Principal, _amount : Nat) : Bool {
    // Soft tokens deprecated
    true
  };

  public shared(msg) func spendTokens(_amount : Nat) : async Bool {
    if (isBannedUser(msg.caller)) { return false };
    true
  };

  /// Charge prepaid ICP for a DM when message fees are on. Master is free.
  public shared(msg) func chargeForMessage() : async Bool {
    if (isBannedUser(msg.caller)) { return false };
    if (not isUserRegistered(msg.caller) and not isMaster(msg.caller)) {
      return false;
    };
    if (isMaster(msg.caller)) { return true };
    if (not messageFeeEnabled or messageFeeE8s == 0) { return true };
    spendIcpE8sInternal(msg.caller, messageFeeE8s)
  };

  /// Refund a message ICP charge if messaging canister rejected the send.
  public shared(msg) func refundMessageCharge() : async Bool {
    if (isBannedUser(msg.caller)) { return false };
    if (isMaster(msg.caller)) { return true };
    if (not messageFeeEnabled or messageFeeE8s == 0) { return true };
    creditIcpE8s(msg.caller, messageFeeE8s);
    true
  };

  /// Legacy name — returns prepaid ICP e8s (not soft tokens).
  public query(msg) func getMyTokens() : async Nat {
    getIcpE8s(msg.caller)
  };

  /// Legacy — returns message fee in e8s when enabled, else 0.
  public query func getTokensPerMessage() : async Nat {
    if (messageFeeEnabled) { messageFeeE8s } else { 0 }
  };

  public query func isMessagingFree() : async Bool {
    false
  };

  public query func getUserStats(user : Principal) : async ?{
    tokens : Nat; // legacy field — now mirrors prepaid ICP e8s for older UI
    icpE8s : Nat;
    postsThisMonth : Nat;
    postsToday : Nat;
    isFreeTier : Bool;
  } {
    let master = isMaster(user);
    let icp = getIcpE8s(user);
    switch (userBalances.get(user)) {
      case (?balance) {
        let current = maybeReset(user, balance);
        ?{
          tokens = icp;
          icpE8s = icp;
          postsThisMonth = current.postsThisMonth;
          postsToday = current.postsToday;
          isFreeTier = (not master) and (current.postsThisMonth < freeTierLimit);
        }
      };
      case null {
        if (master or isUserRegistered(user)) {
          ?{
            tokens = icp;
            icpE8s = icp;
            postsThisMonth = 0;
            postsToday = 0;
            isFreeTier = not master;
          }
        } else { null }
      };
    }
  };

  public query func getTiers() : async [Nat] { tiers };

  public shared(msg) func makePost(content : Text, imageURL : ?Text, category : Text) : async ?Nat {
    if (isBannedUser(msg.caller)) { return null };
    if (not isUserRegistered(msg.caller) and not isMaster(msg.caller)) { return null };
    var balance = getUserBalance(msg.caller);
    balance := maybeReset(msg.caller, balance);
    let master = isMaster(msg.caller);
    let isFree = balance.postsThisMonth < freeTierLimit;
    let maxLength = if (master or not isFree) { paidMaxLength } else { freeMaxLength };
    if (Text.size(content) > maxLength) { return null };
    if (not master) {
      if (balance.postsToday >= dailyLimit) { return null };
      if (not isFree and postFeeEnabled and postFeeE8s > 0) {
        if (not spendIcpE8sInternal(msg.caller, postFeeE8s)) { return null };
      };
    };
    let postId = nextPostId;
    nextPostId += 1;
    let cat = normalizeCategory(category);
    posts.put(postId, {
      id = postId; author = msg.caller; content = content; imageURL = imageURL;
      timestamp = Time.now(); likes = 0; loves = 0; reportCount = 0; isHidden = false;
    });
    postCategories.put(postId, cat);
    indexPost(postId, content);
    userBalances.put(msg.caller, {
      tokens = balance.tokens;
      postsThisMonth = balance.postsThisMonth + 1;
      postsToday = balance.postsToday + 1;
      lastReset = balance.lastReset;
      lastDailyReset = balance.lastDailyReset;
    });
    // Notify followers (capped fan-out)
    switch (followers.get(msg.caller)) {
      case (?list) {
        let name = displayNameOf(msg.caller);
        var i : Nat = 0;
        label fan for (f in list.vals()) {
          if (i >= MAX_POST_FANOUT) { break fan };
          if (not eitherBlocked(msg.caller, f)) {
            pushNotification(
              f,
              "post",
              msg.caller,
              name # " posted something new",
              postId,
            );
            i += 1;
          };
        };
      };
      case null {};
    };
    ?postId
  };

  private func tipMasterPaidOf(user : Principal) : Nat {
    switch (tipMasterPaid.get(user)) {
      case (?n) { n };
      case null { 0 };
    }
  };

  private func hasUnlockedNetworkTipping(user : Principal) : Bool {
    if (isMaster(user)) { return true };
    tipMasterPaidOf(user) >= tipUnlockMinE8s
  };

  private func recordTipToMaster(from : Principal, amountE8s : Nat) {
    if (amountE8s == 0) { return };
    tipMasterPaid.put(from, tipMasterPaidOf(from) + amountE8s);
  };

  public query func getTipUnlockMinE8s() : async Nat { tipUnlockMinE8s };

  public query(msg) func getMyTipUnlockStatus() : async {
    unlocked : Bool;
    paidToMasterE8s : Nat;
    requiredE8s : Nat;
  } {
    let paid = tipMasterPaidOf(msg.caller);
    {
      unlocked = isMaster(msg.caller) or (paid >= tipUnlockMinE8s);
      paidToMasterE8s = paid;
      requiredE8s = tipUnlockMinE8s;
    }
  };

  public query func hasUnlockedTipping(user : Principal) : async Bool {
    hasUnlockedNetworkTipping(user)
  };

  /// Master: minimum cumulative tip to master (e8s) required before tipping others.
  public shared(msg) func adminSetTipUnlockMinE8s(minE8s : Nat) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    if (minE8s == 0) { return "Minimum must be greater than 0" };
    tipUnlockMinE8s := minE8s;
    "Tip unlock minimum set to " # Nat.toText(minE8s) # " e8s"
  };

  /// Tip ICP: sender II must approve this canister; ICP is pulled then paid to recipient's II principal on the ledger.
  /// Tipping anyone except master requires prior cumulative tips to master >= tipUnlockMinE8s.
  public shared(msg) func tipIcp(to : Principal, amountE8s : Nat) : async Text {
    if (not tippingEnabled) { return "Tipping is turned off" };
    if (Principal.isAnonymous(msg.caller)) { return "Not authenticated" };
    if (isBannedUser(msg.caller)) { return "You are banned" };
    if (Principal.isAnonymous(to) or Principal.equal(msg.caller, to)) {
      return "Invalid tip recipient";
    };
    if (amountE8s == 0) { return "Amount must be > 0" };
    if (eitherBlocked(msg.caller, to)) { return "Cannot tip this user" };
    if (not isUserRegistered(msg.caller) and not isMaster(msg.caller)) {
      return "Register before tipping";
    };
    if (not isUserRegistered(to) and not isMaster(to)) {
      return "Recipient is not registered on ICE";
    };

    let tippingMaster = isMaster(to);
    if (not tippingMaster and not hasUnlockedNetworkTipping(msg.caller)) {
      return "Tip the master profile first (at least " # Nat.toText(tipUnlockMinE8s) #
        " e8s ICP total) to unlock tipping others on the network.";
    };

    // Pull from sender's II ledger (requires prior icrc2_approve)
    switch (await chargeIcp(msg.caller, amountE8s)) {
      case (?err) { return err };
      case null {};
    };

    // Pay recipient's II principal directly on the ICP ledger
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
        if (tippingMaster) {
          recordTipToMaster(msg.caller, amountE8s);
        };
        let unlockNote =
          if (tippingMaster and hasUnlockedNetworkTipping(msg.caller)) {
            " Network tipping unlocked."
          } else if (tippingMaster) {
            let paid = tipMasterPaidOf(msg.caller);
            let left = if (paid >= tipUnlockMinE8s) { 0 } else { tipUnlockMinE8s - paid };
            " Tip " # Nat.toText(left) # " e8s more to master to unlock tipping others."
          } else { "" };
        pushNotification(
          to,
          "tip",
          msg.caller,
          displayNameOf(msg.caller) # " tipped you ICP (on your II)",
          amountE8s,
        );
        "Tipped " # Nat.toText(amountE8s) # " e8s ICP to " # displayNameOf(to) #
          " (sent to their Internet Identity ledger account)." # unlockNote
      };
      case (#Err _) {
        // Best-effort refund to sender's II
        ignore await refundIcp(msg.caller, amountE8s);
        "Tip payout to recipient failed; attempted refund to your II. Contact support if needed."
      };
    }
  };

  /// Legacy name — same as tipIcp (amount in e8s).
  public shared(msg) func tipTokens(to : Principal, amount : Nat) : async Text {
    await tipIcp(to, amount)
  };

  /// Latest notifications for the caller (newest first).
  public query(msg) func getNotifications(limit : Nat) : async [Notification] {
    if (Principal.isAnonymous(msg.caller)) { return [] };
    let maxN = if (limit == 0 or limit > MAX_NOTIFS_PER_USER) { MAX_NOTIFS_PER_USER } else { limit };
    switch (notifications.get(msg.caller)) {
      case null { [] };
      case (?list) {
        if (list.size() <= maxN) { list } else {
          Array.tabulate<Notification>(maxN, func(i) { list[i] })
        }
      };
    }
  };

  public query(msg) func getUnreadNotificationCount() : async Nat {
    if (Principal.isAnonymous(msg.caller)) { return 0 };
    switch (notifications.get(msg.caller)) {
      case null { 0 };
      case (?list) {
        var n : Nat = 0;
        for (item in list.vals()) {
          if (not item.read) { n += 1 };
        };
        n
      };
    }
  };

  public shared(msg) func markNotificationRead(id : Nat) : async Text {
    if (Principal.isAnonymous(msg.caller)) { return "Not authenticated" };
    switch (notifications.get(msg.caller)) {
      case null { "Not found" };
      case (?list) {
        var found = false;
        let next = Array.map<Notification, Notification>(
          list,
          func(item) {
            if (item.id == id) {
              found := true;
              {
                id = item.id;
                kind = item.kind;
                from = item.from;
                message = item.message;
                refId = item.refId;
                createdAt = item.createdAt;
                read = true;
              }
            } else { item }
          },
        );
        if (not found) { return "Not found" };
        notifications.put(msg.caller, next);
        "Ok"
      };
    }
  };

  public shared(msg) func markAllNotificationsRead() : async Text {
    if (Principal.isAnonymous(msg.caller)) { return "Not authenticated" };
    switch (notifications.get(msg.caller)) {
      case null { "Ok" };
      case (?list) {
        let next = Array.map<Notification, Notification>(
          list,
          func(item) {
            {
              id = item.id;
              kind = item.kind;
              from = item.from;
              message = item.message;
              refId = item.refId;
              createdAt = item.createdAt;
              read = true;
            }
          },
        );
        notifications.put(msg.caller, next);
        "Ok"
      };
    }
  };

  /// Principal that receives public contact + related notifications.
  private func primaryMasterPrincipal() : Principal {
    if (not isOwnerUnclaimed()) { owner }
    else {
      Principal.fromText("gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae")
    }
  };

  private func trimContactText(s : Text, maxLen : Nat) : Text {
    if (Text.size(s) <= maxLen) { s } else {
      let chars = Text.toArray(s);
      Text.fromArray(Array.tabulate<Char>(maxLen, func(i) { chars[i] }))
    }
  };

  /// Anyone (including guests before sign-in) can message the master profile.
  /// Anonymous callers: 60s global cooldown. Max 500 chars. Stored for master inbox.
  public shared(msg) func contactMaster(fromLabel : Text, content : Text) : async Text {
    let body = Text.trim(content, #char ' ');
    if (Text.size(body) == 0) { return "Write a short message first." };
    if (Text.size(body) > MAX_CONTACT_CONTENT) {
      return "Message too long (max " # Nat.toText(MAX_CONTACT_CONTENT) # " characters).";
    };
    let nameTag = trimContactText(Text.trim(fromLabel, #char ' '), MAX_CONTACT_LABEL);
    let now = Time.now();
    if (Principal.isAnonymous(msg.caller)) {
      if (now - lastAnonContactAt < ANON_CONTACT_COOLDOWN_NS) {
        return "Please wait about a minute before sending another guest message.";
      };
      lastAnonContactAt := now;
    };
    let id = nextMasterContactId;
    nextMasterContactId += 1;
    let entry : MasterContact = {
      id;
      from = msg.caller;
      fromLabel = nameTag;
      content = body;
      createdAt = now;
      read = false;
    };
    let withNew = Array.append<MasterContact>([entry], masterContacts);
    if (withNew.size() <= MAX_MASTER_CONTACTS) {
      masterContacts := withNew;
    } else {
      masterContacts := Array.tabulate<MasterContact>(MAX_MASTER_CONTACTS, func(i) { withNew[i] });
    };
    let who =
      if (Text.size(nameTag) > 0) { nameTag }
      else if (Principal.isAnonymous(msg.caller)) { "Guest" }
      else { displayNameOf(msg.caller) };
    let preview = trimContactText(body, 80);
    pushNotification(
      primaryMasterPrincipal(),
      "contact",
      msg.caller,
      who # " messaged you: " # preview,
      id,
    );
    "Message sent to the master profile. Thank you."
  };

  public query(msg) func getMasterContacts(limit : Nat) : async [MasterContact] {
    if (not isMaster(msg.caller)) { return [] };
    let maxN = if (limit == 0 or limit > MAX_MASTER_CONTACTS) { 50 } else { limit };
    if (masterContacts.size() <= maxN) { masterContacts } else {
      Array.tabulate<MasterContact>(maxN, func(i) { masterContacts[i] })
    }
  };

  public query(msg) func getUnreadMasterContactCount() : async Nat {
    if (not isMaster(msg.caller)) { return 0 };
    var n : Nat = 0;
    for (c in masterContacts.vals()) {
      if (not c.read) { n += 1 };
    };
    n
  };

  public shared(msg) func markMasterContactRead(id : Nat) : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    var found = false;
    masterContacts := Array.map<MasterContact, MasterContact>(
      masterContacts,
      func(c) {
        if (c.id == id) {
          found := true;
          {
            id = c.id;
            from = c.from;
            fromLabel = c.fromLabel;
            content = c.content;
            createdAt = c.createdAt;
            read = true;
          }
        } else { c }
      },
    );
    if (found) { "Ok" } else { "Not found" }
  };

  public shared(msg) func markAllMasterContactsRead() : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    masterContacts := Array.map<MasterContact, MasterContact>(
      masterContacts,
      func(c) {
        {
          id = c.id;
          from = c.from;
          fromLabel = c.fromLabel;
          content = c.content;
          createdAt = c.createdAt;
          read = true;
        }
      },
    );
    "Ok"
  };

  /// Founder: permanently delete every legacy master-contact note (cycle / inbox cleanup).
  public shared(msg) func wipeAllMasterContacts() : async Text {
    if (not isMaster(msg.caller)) { return "Not authorized" };
    let n = masterContacts.size();
    masterContacts := [];
    "Wiped " # Nat.toText(n) # " master contact notes."
  };

  /// Fixed list of valid post categories
  public query func getCategories() : async [Text] {
    VALID_CATEGORIES
  };

  /// Category for a single post (defaults to General for older posts)
  public query func getPostCategory(postId : Nat) : async Text {
    lookupPostCategory(postId)
  };

  /// Batch lookup: (postId, category) for each id
  public query func getCategoriesForPosts(postIds : [Nat]) : async [(Nat, Text)] {
    Array.map<Nat, (Nat, Text)>(postIds, func (id : Nat) : (Nat, Text) {
      (id, lookupPostCategory(id))
    })
  };

  /// Save which categories the caller wants to follow for the feed filter
  public shared(msg) func setFollowedCategories(cats : [Text]) : async Text {
    if (Principal.isAnonymous(msg.caller)) { return "Not authenticated" };
    if (isBannedUser(msg.caller)) { return "You are banned" };
    let buf = Buffer.Buffer<Text>(0);
    for (c in cats.vals()) {
      if (isValidCategory(c)) {
        var already = false;
        for (x in buf.vals()) {
          if (x == c) { already := true };
        };
        if (not already) { buf.add(c) };
      };
    };
    followedCategories.put(msg.caller, Buffer.toArray(buf));
    "Followed categories saved"
  };

  /// Categories the user follows (empty = none selected yet)
  public query func getFollowedCategories(user : Principal) : async [Text] {
    switch (followedCategories.get(user)) {
      case (?list) { list };
      case null { [] };
    }
  };

  /// Author can update post text (and optional image URL). Respects length limits.
  public shared(msg) func editPost(postId : Nat, content : Text, imageURL : ?Text) : async Text {
    if (isBannedUser(msg.caller)) { return "You are banned" };
    if (Text.size(content) == 0) { return "Content cannot be empty" };
    switch (posts.get(postId)) {
      case null { return "Post not found" };
      case (?post) {
        if (not Principal.equal(post.author, msg.caller)) {
          return "Only the author can edit this post";
        };
        if (post.isHidden) { return "Cannot edit a hidden post" };
        var balance = getUserBalance(msg.caller);
        balance := maybeReset(msg.caller, balance);
        let master = isMaster(msg.caller);
        let isFree = balance.postsThisMonth < freeTierLimit;
        let maxLength = if (master or not isFree) { paidMaxLength } else { freeMaxLength };
        if (Text.size(content) > maxLength) {
          return "Post is too long for your tier";
        };
        posts.put(postId, {
          id = post.id;
          author = post.author;
          content = content;
          imageURL = imageURL;
          timestamp = post.timestamp;
          likes = post.likes;
          loves = post.loves;
          reportCount = post.reportCount;
          isHidden = post.isHidden;
        });
        // Re-index new words (old keyword entries may remain; search skips missing posts)
        indexPost(postId, content);
        "Post updated"
      };
    }
  };

  /// Author can permanently remove their post. Master can also delete any post.
  public shared(msg) func deletePost(postId : Nat) : async Text {
    if (isBannedUser(msg.caller)) { return "You are banned" };
    switch (posts.get(postId)) {
      case null { return "Post not found" };
      case (?post) {
        let authorOk = Principal.equal(post.author, msg.caller);
        let masterOk = isMaster(msg.caller);
        if (not authorOk and not masterOk) {
          return "Only the author or master can delete this post";
        };
        posts.delete(postId);
        postLikers.delete(postId);
        postLovers.delete(postId);
        reports.delete(postId);
        postCategories.delete(postId);
        // Drop comment index for this post (comment records may remain orphaned)
        postComments.delete(postId);
        "Post deleted"
      };
    }
  };

  public query func getPost(postId : Nat) : async ?Post {
    switch (posts.get(postId)) {
      case (?p) { if (p.isHidden) { null } else { ?p } };
      case null { null };
    }
  };

  /// Public / anonymous discovery: never includes posts from detached (network-private) authors.
  public query func getRecentPosts(limit : Nat) : async [Post] {
    let buf = Buffer.Buffer<Post>(0);
    var i : Nat = 0;
    while (i < nextPostId and buf.size() < limit) {
      let id = nextPostId - 1 - i;
      switch (posts.get(id)) {
        case (?p) {
          if (not p.isHidden and not isNetworkPrivate(p.author)) { buf.add(p) };
        };
        case null {};
      };
      i += 1;
    };
    Buffer.toArray(buf)
  };

  /// Main ICE feed (logged-in or same as public): never includes detached (network-private) authors.
  /// Detached users' posts are only on their profile and on followers' people-feed.
  public shared query(msg) func getHomeFeed(limit : Nat) : async [Post] {
    ignore msg.caller;
    let buf = Buffer.Buffer<Post>(0);
    var i : Nat = 0;
    while (i < nextPostId and buf.size() < limit) {
      let id = nextPostId - 1 - i;
      switch (posts.get(id)) {
        case (?p) {
          if (not p.isHidden and not isNetworkPrivate(p.author)) { buf.add(p) };
        };
        case null {};
      };
      i += 1;
    };
    Buffer.toArray(buf)
  };

  /// Followers' feed: posts from people the caller follows (social Follow).
  /// This is the only feed that shows detached authors (to their followers).
  public shared query(msg) func getFollowingPeoplePosts(limit : Nat) : async [Post] {
    let viewer = msg.caller;
    if (Principal.isAnonymous(viewer)) { return [] };
    switch (following.get(viewer)) {
      case null { return [] };
      case (?list) {
        if (list.size() == 0) { return [] };
      };
    };
    let buf = Buffer.Buffer<Post>(0);
    var i : Nat = 0;
    while (i < nextPostId and buf.size() < limit) {
      let id = nextPostId - 1 - i;
      switch (posts.get(id)) {
        case (?p) {
          // Include followed authors only (detached allowed here if viewer follows them)
          if (not p.isHidden and viewerFollowsAuthor(viewer, p.author)) {
            buf.add(p);
          };
        };
        case null {};
      };
      i += 1;
    };
    Buffer.toArray(buf)
  };

  /// Public author page: empty if author is detached (use getPostsByAuthorForViewer when logged in).
  public query func getPostsByAuthor(author : Principal, limit : Nat) : async [Post] {
    if (isNetworkPrivate(author)) { return [] };
    let buf = Buffer.Buffer<Post>(0);
    var i : Nat = 0;
    while (i < nextPostId and buf.size() < limit) {
      let id = nextPostId - 1 - i;
      switch (posts.get(id)) {
        case (?p) {
          if (not p.isHidden and Principal.equal(p.author, author)) { buf.add(p) };
        };
        case null {};
      };
      i += 1;
    };
    Buffer.toArray(buf)
  };

  /// Author posts visible to caller: self, followers of detached authors, or anyone if not detached.
  public shared query(msg) func getPostsByAuthorForViewer(author : Principal, limit : Nat) : async [Post] {
    if (not canViewNetworkPrivateAuthor(?msg.caller, author)) { return [] };
    let buf = Buffer.Buffer<Post>(0);
    var i : Nat = 0;
    while (i < nextPostId and buf.size() < limit) {
      let id = nextPostId - 1 - i;
      switch (posts.get(id)) {
        case (?p) {
          if (not p.isHidden and Principal.equal(p.author, author)) { buf.add(p) };
        };
        case null {};
      };
      i += 1;
    };
    Buffer.toArray(buf)
  };

  public query func isUserNetworkPrivate(user : Principal) : async Bool {
    isNetworkPrivate(user)
  };

  /// Factory (or master): mark user posts as network-private after site detach; clear on reattach.
  public shared(msg) func setUserNetworkPrivate(user : Principal, isPrivate : Bool) : async Text {
    let allowed =
      Principal.equal(msg.caller, FACTORY_PRINCIPAL) or isMaster(msg.caller);
    if (not allowed) { return "Not authorized" };
    if (Principal.isAnonymous(user)) { return "Invalid user" };
    if (isPrivate) {
      networkPrivate.put(user, true);
      "User marked network-private (detached site): posts only for self + followers"
    } else {
      networkPrivate.delete(user);
      "User network-private cleared (reattached): posts public again"
    }
  };

  public shared(msg) func reportPost(postId : Nat) : async Text {
    if (isBannedUser(msg.caller)) { return "You are banned" };
    switch (posts.get(postId)) {
      case null { return "Post not found" };
      case (?post) {
        if (post.isHidden) { return "Post already hidden" };
        switch (reports.get(postId)) {
          case (?reporters) {
            for (r in reporters.vals()) {
              if (Principal.equal(r, msg.caller)) { return "You already reported this post" };
            };
            let newReporters = Array.append(reporters, [msg.caller]);
            reports.put(postId, newReporters);
            let newCount = newReporters.size();
            let shouldHide = newCount >= reportsToHide;
            posts.put(postId, {
              id = post.id; author = post.author; content = post.content; imageURL = post.imageURL;
              timestamp = post.timestamp; likes = post.likes; loves = post.loves;
              reportCount = newCount; isHidden = shouldHide;
            });
            if (shouldHide) { return "Post has been hidden due to multiple reports" }
            else { return "Report submitted. Thank you." }
          };
          case null {
            reports.put(postId, [msg.caller]);
            posts.put(postId, {
              id = post.id; author = post.author; content = post.content; imageURL = post.imageURL;
              timestamp = post.timestamp; likes = post.likes; loves = post.loves;
              reportCount = 1; isHidden = false;
            });
            return "Report submitted. Thank you.";
          };
        }
      };
    }
  };

  public query func hasLiked(postId : Nat, user : Principal) : async Bool {
    switch (postLikers.get(postId)) {
      case (?list) { principalInList(list, user) };
      case null { false };
    }
  };

  public query func hasLoved(postId : Nat, user : Principal) : async Bool {
    switch (postLovers.get(postId)) {
      case (?list) { principalInList(list, user) };
      case null { false };
    }
  };

  public shared(msg) func likePost(postId : Nat) : async Bool {
    if (isBannedUser(msg.caller)) { return false };
    switch (posts.get(postId)) {
      case (?post) {
        if (post.isHidden) { return false };
        // Already liked — do not increment again
        switch (postLikers.get(postId)) {
          case (?list) {
            if (principalInList(list, msg.caller)) { return false };
            postLikers.put(postId, Array.append(list, [msg.caller]));
          };
          case null {
            postLikers.put(postId, [msg.caller]);
          };
        };
        posts.put(postId, {
          id = post.id; author = post.author; content = post.content; imageURL = post.imageURL;
          timestamp = post.timestamp; likes = post.likes + 1; loves = post.loves;
          reportCount = post.reportCount; isHidden = post.isHidden;
        });
        true
      };
      case null { false };
    }
  };

  public shared(msg) func lovePost(postId : Nat) : async Bool {
    if (isBannedUser(msg.caller)) { return false };
    switch (posts.get(postId)) {
      case (?post) {
        if (post.isHidden) { return false };
        // Already loved — do not charge tokens or increment again
        switch (postLovers.get(postId)) {
          case (?list) {
            if (principalInList(list, msg.caller)) { return false };
          };
          case null {};
        };
        if (not isMaster(msg.caller) and loveFeeEnabled and loveFeeE8s > 0) {
          if (not spendIcpE8sInternal(msg.caller, loveFeeE8s)) { return false };
        };
        switch (postLovers.get(postId)) {
          case (?list) { postLovers.put(postId, Array.append(list, [msg.caller])); };
          case null { postLovers.put(postId, [msg.caller]); };
        };
        posts.put(postId, {
          id = post.id; author = post.author; content = post.content; imageURL = post.imageURL;
          timestamp = post.timestamp; likes = post.likes; loves = post.loves + 1;
          reportCount = post.reportCount; isHidden = post.isHidden;
        });
        true
      };
      case null { false };
    }
  };

  public shared(msg) func addComment(postId : Nat, content : Text) : async ?Nat {
    if (isBannedUser(msg.caller)) { return null };
    if (Text.size(content) > maxCommentLength) { return null };
    switch (posts.get(postId)) {
      case null { return null };
      case (?p) { if (p.isHidden) { return null } };
    };
    let commentId = nextCommentId;
    nextCommentId += 1;
    comments.put(commentId, {
      id = commentId; postId = postId; author = msg.caller; content = content; timestamp = Time.now();
    });
    switch (postComments.get(postId)) {
      case (?list) { postComments.put(postId, Array.append(list, [commentId])); };
      case null { postComments.put(postId, [commentId]); };
    };
    ?commentId
  };

  /// Author can edit their comment text.
  public shared(msg) func editComment(commentId : Nat, content : Text) : async Text {
    if (isBannedUser(msg.caller)) { return "You are banned" };
    if (Text.size(content) == 0) { return "Content cannot be empty" };
    if (Text.size(content) > maxCommentLength) { return "Comment is too long" };
    switch (comments.get(commentId)) {
      case null { return "Comment not found" };
      case (?c) {
        if (not Principal.equal(c.author, msg.caller)) {
          return "Only the author can edit this comment";
        };
        comments.put(commentId, {
          id = c.id;
          postId = c.postId;
          author = c.author;
          content = content;
          timestamp = c.timestamp;
        });
        "Comment updated"
      };
    }
  };

  /// Author or master can delete a comment.
  public shared(msg) func deleteComment(commentId : Nat) : async Text {
    if (isBannedUser(msg.caller)) { return "You are banned" };
    switch (comments.get(commentId)) {
      case null { return "Comment not found" };
      case (?c) {
        let authorOk = Principal.equal(c.author, msg.caller);
        let masterOk = isMaster(msg.caller);
        if (not authorOk and not masterOk) {
          return "Only the author or master can delete this comment";
        };
        comments.delete(commentId);
        // Remove id from post's comment list
        switch (postComments.get(c.postId)) {
          case (?ids) {
            let buf = Buffer.Buffer<Nat>(0);
            for (id in ids.vals()) {
              if (id != commentId) { buf.add(id) };
            };
            postComments.put(c.postId, Buffer.toArray(buf));
          };
          case null {};
        };
        "Comment deleted"
      };
    }
  };

  public query func getComments(postId : Nat) : async [Comment] {
    switch (postComments.get(postId)) {
      case (?ids) {
        let buf = Buffer.Buffer<Comment>(0);
        for (id in ids.vals()) {
          switch (comments.get(id)) {
            case (?c) { buf.add(c) };
            case null {};
          };
        };
        Buffer.toArray(buf)
      };
      case null { [] };
    }
  };

  public query func searchPosts(keyword : Text) : async [Post] {
    let lower = Text.toLowercase(keyword);
    switch (keywordIndex.get(lower)) {
      case (?ids) {
        let buf = Buffer.Buffer<Post>(0);
        for (id in ids.vals()) {
          switch (posts.get(id)) {
            case (?p) {
              // Public search never surfaces detached (network-private) authors
              if (not p.isHidden and not isNetworkPrivate(p.author)) { buf.add(p) };
            };
            case null {};
          };
        };
        Buffer.toArray(buf)
      };
      case null { [] };
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // ICE Lite admin lock — source of truth for lite.frostedblocks.com gates
  // Writes: msg.caller must equal LITE_ADMIN_OWNER (gmtr2…). No isMaster.
  // ═══════════════════════════════════════════════════════════════════════

  private func isLiteAdminOwner(p : Principal) : Bool {
    if (Principal.isAnonymous(p)) { return false };
    Principal.equal(p, LITE_ADMIN_OWNER)
  };

  private func snapshotLiteAdmin() : LiteAdmin {
    {
      signupsOpen = liteSignupsOpen;
      feedBridgeOpen = liteFeedBridgeOpen;
      bannedLiteHandles = liteBannedHandles;
      hiddenLitePostIds = liteHiddenPostIds;
      updatedAt = liteAdminUpdatedAt;
    }
  };

  private func touchLiteAdmin() {
    liteAdminUpdatedAt := Time.now();
  };

  private func normalizeLiteHandle(handle : Text) : Text {
    Text.toLowercase(Text.trim(handle, #char ' '))
  };

  private func textInList(list : [Text], needle : Text) : Bool {
    for (x in list.vals()) {
      if (x == needle) { return true };
    };
    false
  };

  private func removeText(list : [Text], needle : Text) : [Text] {
    let buf = Buffer.Buffer<Text>(list.size());
    for (x in list.vals()) {
      if (x != needle) { buf.add(x) };
    };
    Buffer.toArray(buf)
  };

  /// Public read — Lite servers and anyone may query current lock state.
  public query func getLiteAdmin() : async LiteAdmin {
    snapshotLiteAdmin()
  };

  /// True only for the current Lite admin owner II (does not reveal the principal).
  public query(msg) func canManageLiteAdmin() : async Bool {
    isLiteAdminOwner(msg.caller)
  };

  /// Whether the one-time Master Profile activation has already been used.
  public query func isLiteAdminClaimed() : async Bool {
    liteAdminClaimed
  };

  /// One-time: ICE master (Master Profile) assigns Lite admin writes to msg.caller.
  /// After this, only that II can call setSignupsOpen / ban / hide / etc.
  public shared(msg) func claimLiteAdmin() : async Text {
    if (Principal.isAnonymous(msg.caller)) {
      return "Not authorized"
    };
    if (not isMaster(msg.caller)) {
      return "Not authorized — Master Profile only"
    };
    if (liteAdminClaimed) {
      if (isLiteAdminOwner(msg.caller)) {
        return "Lite admin already active for this Internet Identity"
      };
      return "Lite admin already activated by another master session"
    };
    LITE_ADMIN_OWNER := msg.caller;
    liteAdminClaimed := true;
    touchLiteAdmin();
    "Lite ICE controls activated for this Internet Identity"
  };

  public shared(msg) func setSignupsOpen(open : Bool) : async LiteAdminWrite {
    if (not isLiteAdminOwner(msg.caller)) { return #unauthorized };
    liteSignupsOpen := open;
    touchLiteAdmin();
    #ok(snapshotLiteAdmin())
  };

  public shared(msg) func setFeedBridgeOpen(open : Bool) : async LiteAdminWrite {
    if (not isLiteAdminOwner(msg.caller)) { return #unauthorized };
    liteFeedBridgeOpen := open;
    touchLiteAdmin();
    #ok(snapshotLiteAdmin())
  };

  public shared(msg) func banLiteHandle(handle : Text) : async LiteAdminWrite {
    if (not isLiteAdminOwner(msg.caller)) { return #unauthorized };
    let h = normalizeLiteHandle(handle);
    if (Text.size(h) == 0) { return #ok(snapshotLiteAdmin()) };
    if (not textInList(liteBannedHandles, h)) {
      let buf = Buffer.Buffer<Text>(liteBannedHandles.size() + 1);
      for (x in liteBannedHandles.vals()) { buf.add(x) };
      buf.add(h);
      liteBannedHandles := Buffer.toArray(buf);
      touchLiteAdmin();
    };
    #ok(snapshotLiteAdmin())
  };

  public shared(msg) func unbanLiteHandle(handle : Text) : async LiteAdminWrite {
    if (not isLiteAdminOwner(msg.caller)) { return #unauthorized };
    let h = normalizeLiteHandle(handle);
    if (Text.size(h) == 0) { return #ok(snapshotLiteAdmin()) };
    liteBannedHandles := removeText(liteBannedHandles, h);
    touchLiteAdmin();
    #ok(snapshotLiteAdmin())
  };

  public shared(msg) func hideLitePost(id : Text) : async LiteAdminWrite {
    if (not isLiteAdminOwner(msg.caller)) { return #unauthorized };
    let pid = Text.trim(id, #char ' ');
    if (Text.size(pid) == 0) { return #ok(snapshotLiteAdmin()) };
    if (not textInList(liteHiddenPostIds, pid)) {
      let buf = Buffer.Buffer<Text>(liteHiddenPostIds.size() + 1);
      for (x in liteHiddenPostIds.vals()) { buf.add(x) };
      buf.add(pid);
      liteHiddenPostIds := Buffer.toArray(buf);
      touchLiteAdmin();
    };
    #ok(snapshotLiteAdmin())
  };

  public shared(msg) func unhideLitePost(id : Text) : async LiteAdminWrite {
    if (not isLiteAdminOwner(msg.caller)) { return #unauthorized };
    let pid = Text.trim(id, #char ' ');
    if (Text.size(pid) == 0) { return #ok(snapshotLiteAdmin()) };
    liteHiddenPostIds := removeText(liteHiddenPostIds, pid);
    touchLiteAdmin();
    #ok(snapshotLiteAdmin())
  };
}
