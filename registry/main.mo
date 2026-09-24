import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Time "mo:base/Time";
import Text "mo:base/Text";
import Nat "mo:base/Nat";
import Buffer "mo:base/Buffer";
import Array "mo:base/Array";
import ExperimentalCycles "mo:base/ExperimentalCycles";

/// ICE Network Registry — permanent record of every user_site canister the Factory mints.
/// Only the authorized Factory principal may write. User sites and random callers cannot.
/// Used to gate reattach/relink: only factory-minted canister IDs may rejoin the network.
persistent actor Registry {

  public type MintRecord = {
    canisterId : Principal;
    originalOwner : Principal;
    /// Current or last known owner (updated on reattach)
    owner : Principal;
    mintedAt : Int;
    detached : Bool;
    lastDetachedAt : ?Int;
    lastRelinkedAt : ?Int;
  };

  private stable var owner : Principal = Principal.fromText("aaaaa-aa");
  /// Sole writer for mint/detach/relink state updates
  private stable var authorizedFactory : Principal = Principal.fromText("aaaaa-aa");

  private stable var mintEntries : [(Principal, MintRecord)] = [];
  private transient var mints = HashMap.HashMap<Principal, MintRecord>(0, Principal.equal, Principal.hash);

  public type EmergencyResetLog = {
    canisterId : Principal;
    by : Principal;
    at : Int;
  };
  private stable var emergencyResetLog : [EmergencyResetLog] = [];

  system func preupgrade() {
    mintEntries := Iter.toArray(mints.entries());
  };

  system func postupgrade() {
    mints := HashMap.fromIter<Principal, MintRecord>(
      mintEntries.vals(), mintEntries.size(), Principal.equal, Principal.hash
    );
    mintEntries := [];
  };

  private func isOwner(p : Principal) : Bool {
    Principal.equal(p, owner) and not Principal.equal(owner, Principal.fromText("aaaaa-aa"))
  };

  private func isFactory(p : Principal) : Bool {
    Principal.equal(p, authorizedFactory)
      and not Principal.equal(authorizedFactory, Principal.fromText("aaaaa-aa"))
  };

  // ---------- bootstrap ----------

  /// First deployer claims admin rights (set factory principal).
  public shared(msg) func claimOwner() : async Text {
    if (not Principal.equal(owner, Principal.fromText("aaaaa-aa"))) {
      return "Already claimed";
    };
    owner := msg.caller;
    "Owner claimed"
  };

  public query func getOwner() : async Principal { owner };

  public query func getAuthorizedFactory() : async Principal { authorizedFactory };

  /// Owner-only: which Factory may write mint records. Call after factory deploy.
  public shared(msg) func setAuthorizedFactory(factory : Principal) : async Text {
    if (not isOwner(msg.caller)) { return "Not authorized" };
    if (Principal.isAnonymous(factory)) { return "Invalid factory" };
    authorizedFactory := factory;
    "Factory authorized: " # Principal.toText(factory)
  };

  // ---------- factory writes only ----------

  /// Factory: record a newly minted user_site canister ID (idempotent).
  public shared(msg) func registerMint(canisterId : Principal, siteOwner : Principal) : async Text {
    if (not isFactory(msg.caller)) {
      return "Not authorized — only the ICE Factory may write to the Registry";
    };
    if (Principal.isAnonymous(canisterId) or Principal.isAnonymous(siteOwner)) {
      return "Invalid principals";
    };
    switch (mints.get(canisterId)) {
      case (?existing) {
        // Already registered — keep original mint time; refresh owner if still linked
        mints.put(
          canisterId,
          {
            canisterId = existing.canisterId;
            originalOwner = existing.originalOwner;
            owner = siteOwner;
            mintedAt = existing.mintedAt;
            detached = false;
            lastDetachedAt = existing.lastDetachedAt;
            lastRelinkedAt = existing.lastRelinkedAt;
          },
        );
        "Already registered (owner refreshed)"
      };
      case null {
        let now = Time.now();
        mints.put(
          canisterId,
          {
            canisterId;
            originalOwner = siteOwner;
            owner = siteOwner;
            mintedAt = now;
            detached = false;
            lastDetachedAt = null;
            lastRelinkedAt = null;
          },
        );
        "Registered " # Principal.toText(canisterId)
      };
    }
  };

  /// Factory: mark site detached from network (canister remains factory-minted).
  public shared(msg) func markDetached(canisterId : Principal) : async Text {
    if (not isFactory(msg.caller)) {
      return "Not authorized — only the ICE Factory may write to the Registry";
    };
    switch (mints.get(canisterId)) {
      case null { "Unknown canister — not factory-minted" };
      case (?rec) {
        mints.put(
          canisterId,
          {
            canisterId = rec.canisterId;
            originalOwner = rec.originalOwner;
            owner = rec.owner;
            mintedAt = rec.mintedAt;
            detached = true;
            lastDetachedAt = ?Time.now();
            lastRelinkedAt = rec.lastRelinkedAt;
          },
        );
        "Marked detached"
      };
    }
  };

  /// Factory: mark site reattached / relinked.
  public shared(msg) func markRelinked(canisterId : Principal, siteOwner : Principal) : async Text {
    if (not isFactory(msg.caller)) {
      return "Not authorized — only the ICE Factory may write to the Registry";
    };
    switch (mints.get(canisterId)) {
      case null { "Unknown canister — reattach not allowed" };
      case (?rec) {
        mints.put(
          canisterId,
          {
            canisterId = rec.canisterId;
            originalOwner = rec.originalOwner;
            owner = siteOwner;
            mintedAt = rec.mintedAt;
            detached = false;
            lastDetachedAt = rec.lastDetachedAt;
            lastRelinkedAt = ?Time.now();
          },
        );
        "Marked relinked"
      };
    }
  };

  // ---------- public reads (anyone, including Factory) ----------

  /// True if this canister ID was minted by the authorized Factory.
  public query func isFactoryMinted(canisterId : Principal) : async Bool {
    switch (mints.get(canisterId)) {
      case (?_) { true };
      case null { false };
    }
  };

  /// Eligible for reattach: was factory-minted (detached or not — still valid origin).
  public query func isEligibleForReattach(canisterId : Principal) : async Bool {
    switch (mints.get(canisterId)) {
      case (?_) { true };
      case null { false };
    }
  };

  public query func getRecord(canisterId : Principal) : async ?MintRecord {
    mints.get(canisterId)
  };

  public query func getMintCount() : async Nat {
    mints.size()
  };

  /// Owner / factory ops: list all registered canister IDs (capped).
  public query(msg) func listMintedCanisters(limit : Nat) : async [Principal] {
    if (not isOwner(msg.caller) and not isFactory(msg.caller)) { return [] };
    let maxN = if (limit == 0 or limit > 500) { 100 } else { limit };
    let buf = Buffer.Buffer<Principal>(maxN);
    label scan for ((cid, _) in mints.entries()) {
      if (buf.size() >= maxN) { break scan };
      buf.add(cid);
    };
    Buffer.toArray(buf)
  };

  /// Factory: audit emergency force-resets (user canisters cannot call this).
  public shared(msg) func logEmergencyReset(canisterId : Principal, by : Principal) : async Text {
    if (not isFactory(msg.caller)) {
      return "Not authorized — only the ICE Factory may write to the Registry";
    };
    let entry : EmergencyResetLog = {
      canisterId;
      by;
      at = Time.now();
    };
    let prev = emergencyResetLog;
    let n = prev.size();
    let maxKeep : Nat = 200;
    if (n + 1 <= maxKeep) {
      emergencyResetLog := Array.tabulate<EmergencyResetLog>(n + 1, func(i) {
        if (i < n) { prev[i] } else { entry }
      });
    } else {
      emergencyResetLog := Array.tabulate<EmergencyResetLog>(maxKeep, func(i) {
        if (i < maxKeep - 1) { prev[i + 1] } else { entry }
      });
    };
    "Logged emergency reset"
  };

  public query(msg) func getEmergencyResetLog(limit : Nat) : async [EmergencyResetLog] {
    if (not isOwner(msg.caller) and not isFactory(msg.caller)) { return [] };
    let maxN = if (limit == 0 or limit > 100) { 50 } else { limit };
    let n = emergencyResetLog.size();
    if (n == 0) { return [] };
    let start : Nat = if (n > maxN) { n - maxN } else { 0 };
    Array.tabulate<EmergencyResetLog>(n - start, func(i) { emergencyResetLog[start + i] })
  };

  public query func getCyclesBalance() : async Nat {
    ExperimentalCycles.balance()
  };

  /// Ops alert: under 0.2 T is critically low for a long-lived registry.
  public query func isLowCycles() : async Bool {
    ExperimentalCycles.balance() < 200_000_000_000
  };

  public query func health() : async Text {
    let bal = ExperimentalCycles.balance();
    "ICE Registry · mints="
      # Nat.toText(mints.size())
      # " · factory="
      # Principal.toText(authorizedFactory)
      # " · emergencyResets="
      # Nat.toText(emergencyResetLog.size())
      # " · cycles="
      # Nat.toText(bal)
  };
};
