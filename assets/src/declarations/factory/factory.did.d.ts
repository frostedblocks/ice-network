import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface AutoTopUpPref {
  'maxIcpE8sPerTopUp' : bigint,
  'enabled' : boolean,
  'lastTopUpAt' : bigint,
  'maxTopUpsPerDay' : bigint,
  'dayBucket' : bigint,
  'topUpsToday' : bigint,
}
export type CreateUserSiteResult = { 'ok' : Principal } |
  { 'err' : string };
export interface CycleAlert {
  'at' : bigint,
  'balance' : bigint,
  'owner' : Principal,
  'kind' : string,
  'site' : Principal,
  'message' : string,
}
export interface DomainRecord {
  'domain' : string,
  'publicUrl' : string,
  'connectedAt' : bigint,
  'dnsConfigured' : boolean,
}
export interface Factory {
  /**
   * / Owner: drop pending tracking (does not delete the canister — may still burn cycles).
   */
  'adminAbandonPendingMint' : ActorMethod<[Principal], string>,
  /**
   * / Master: after verifying the requester’s identity offline, approve and issue code.
   * / Code is returned once to master AND queued for the requester via revealPendingRecoveryCode.
   */
  'adminApproveRecoveryRequest' : ActorMethod<
    [Principal, Principal, boolean],
    OpResult
  >,
  /**
   * / Owner: push all known factory sites into the Registry (one-time after wiring).
   */
  'adminBackfillRegistry' : ActorMethod<[], string>,
  'adminClearConnectBackend' : ActorMethod<[], string>,
  /**
   * / Ops: convert N e8s ICP on factory into factory cycles (default 2.7 ICP).
   */
  'adminConvertIcpToCycles' : ActorMethod<[bigint], string>,
  'adminCreateUserSite' : ActorMethod<[Principal], CreateUserSiteResult>,
  /**
   * / Master/ops: force-reset any registered (minted) site even if user offline / site broken.
   * / No user rate limit. Factory owner only. Always logged.
   */
  'adminForceResetSite' : ActorMethod<[Principal], OpResult>,
  /**
   * / Master: issue recovery code for a site (queued for site owner reveal).
   * / Prefer adminApproveRecoveryRequest after the user proves an II session.
   */
  'adminGenerateSiteRecoveryCode' : ActorMethod<[Principal], OpResult>,
  'adminLinkUserCanister' : ActorMethod<[Principal, Principal], string>,
  /**
   * / Master: create/link a site for a principal who already joined ICE but has no canister.
   * / Never charges Join fee. Idempotent if they already have a linked site.
   */
  'adminProvisionSite' : ActorMethod<[Principal], CreateUserSiteResult>,
  /**
   * / Factory owner: push latest user_site WASM to linked sites where factory is controller.
   * / Skips detached, non-controlled, and critically low-cycle sites. Logs failures; never force.
   */
  'adminPushLatestWasmToAll' : ActorMethod<[bigint], WasmPushResult>,
  /**
   * / Owner: ensure every factory-known site is in Registry; report missing.
   */
  'adminReconcileRegistry' : ActorMethod<[], string>,
  'adminRecreateUserSite' : ActorMethod<[Principal], CreateUserSiteResult>,
  'adminRejectRecoveryRequest' : ActorMethod<[Principal, Principal], OpResult>,
  /**
   * / Owner: finish a half-created site from its last recorded stage.
   */
  'adminResumePendingMint' : ActorMethod<[Principal], CreateUserSiteResult>,
  /**
   * / Best-effort seed on an existing site.
   */
  'adminSeedTrustedRecorderOnSite' : ActorMethod<[Principal], string>,
  /**
   * / Public docs for UI: who is on the standard controller set.
   */
  'adminSetConnectBackend' : ActorMethod<[Principal], string>,
  /**
   * / Owner/ops: set explicit controller list. Factory principal is always forced into the list
   * / so reset/upgrade recovery never permanently loses Factory control.
   */
  'adminSetControllers' : ActorMethod<[Principal, Array<Principal>], string>,
  'adminSetDomainConnectFee' : ActorMethod<[bigint], string>,
  'adminSetFees' : ActorMethod<[bigint, bigint, bigint], string>,
  'adminSetMintFee' : ActorMethod<[bigint, bigint], string>,
  'adminSetPrincipalMigration' : ActorMethod<[boolean], string>,
  /**
   * / Owner: wire the central mint Registry (must authorize this Factory on the Registry first).
   */
  'adminSetRegistry' : ActorMethod<[Principal], string>,
  'adminSetTransferFee' : ActorMethod<[bigint], string>,
  /**
   * / Factory owner: re-sync site canister owner from factory mapping (fixes photo upload auth).
   */
  'adminSyncSiteOwner' : ActorMethod<[Principal], OpResult>,
  'adminUnlinkUserCanister' : ActorMethod<[Principal], string>,
  /**
   * / Factory owner: upgrade any known site to latest user_site WASM (preserves stable data).
   */
  'adminUpgradeUserSite' : ActorMethod<[Principal], OpResult>,
  'appendUserSiteWasm' : ActorMethod<[Uint8Array | number[]], string>,
  'appendUserSiteWasmHex' : ActorMethod<[string], string>,
  /**
   * / Apply standard controllers (owner + factory) to one linked site. Not a mass migration.
   */
  'applyStandardControllers' : ActorMethod<[Principal], string>,
  /**
   * / Alias of applyStandardControllers (owner + factory).
   */
  'applyStandardControllersWithOps' : ActorMethod<[Principal], string>,
  'cancelSiteTransferOffer' : ActorMethod<[], OpResult>,
  'cancelSubscription' : ActorMethod<[Principal], string>,
  /**
   * / Auto top-up when site cycles < ~1T: 0.5 ICP from caller (ICRC-2) → CMC → userSite cycles.
   * / Site canisters may call with userSite = self; payer is resolved to the site owner.
   * / Does not trap. Not used on detach.
   */
  'checkAndTopUp' : ActorMethod<[Principal], undefined>,
  /**
   * / Verify DNS via on-chain ICP validate and mark ready (enables HTTPS hosting / detach).
   */
  'checkDns' : ActorMethod<[], OpResult>,
  'claimOwner' : ActorMethod<[], string>,
  /**
   * / Existing accounts only: while migration is open, claim a factory-registered site by id.
   * / Remaps ownership + controllers to the caller's current II. Each site once.
   */
  'claimSiteByCanisterId' : ActorMethod<[Principal], OpResult>,
  /**
   * / Recipient: claim a site with the one-time offer code (full handoff).
   */
  'claimSiteTransfer' : ActorMethod<[string], OpResult>,
  /**
   * / Log in with any II, paste recovery code → site remaps to this II (full handoff).
   */
  'claimSiteWithRecoveryCode' : ActorMethod<[string], OpResult>,
  'clearUserSiteWasm' : ActorMethod<[], string>,
  'confirmSiteDns' : ActorMethod<[], OpResult>,
  /**
   * / One-step connect: charge 1 ICP (ICRC-2) if needed, then set domain + https://domain (set_domain).
   * / DNS records are shown client-side; call checkDns after DNS is live to enable HTTPS/detach.
   */
  'connectDomain' : ActorMethod<[string], OpResult>,
  /**
   * / Owner: create a one-time transfer offer. Returns plaintext code once.
   */
  'createSiteTransferOffer' : ActorMethod<[], OpResult>,
  /**
   * / Create transfer offer for a specific owned site (multi-site safe).
   */
  'createSiteTransferOfferFor' : ActorMethod<[Principal], OpResult>,
  /**
   * / Caller must already be registered on ICE (free Join).
   * / Fresh mint charges MINT_FEE_E8S (10 ICP) unless waived; retries/resume do not re-charge.
   * / Idempotent: returns existing linked site if present.
   */
  'createUserSite' : ActorMethod<[], CreateUserSiteResult>,
  /**
   * / Detach: unlink site from the main ICE network index. User canister stays intact
   * / (controllers, data, domain). Mint record remains in the central Registry for reattach.
   * / Requires domain + public URL + DNS confirmed + healthy site cycles. Fee via II approve + chargeIcp.
   */
  'detach' : ActorMethod<[], OpResult>,
  /**
   * / Same as createUserSite — preferred name for post-Join retries (no second mint fee if pending/linked).
   */
  'ensureUserSite' : ActorMethod<[], CreateUserSiteResult>,
  'fetchNnsDepositBalance' : ActorMethod<[Principal], bigint>,
  'finalizeUserSiteWasm' : ActorMethod<[], string>,
  'getAutoTopUpStatus' : ActorMethod<[Principal], [] | [AutoTopUpPref]>,
  'getConnectBackend' : ActorMethod<[], [] | [Principal]>,
  'getControllerPolicy' : ActorMethod<
    [],
    {
      'note' : string,
      'dfxInDefault' : boolean,
      'factoryMustRemain' : boolean,
      'roles' : Array<[string, string]>,
    }
  >,
  'getFactoryCycles' : ActorMethod<[], bigint>,
  'getFactoryIcpBalanceE8s' : ActorMethod<[], bigint>,
  'getFees' : ActorMethod<
    [],
    {
      'detachFeeE8s' : bigint,
      'mintCyclesShareE8s' : bigint,
      'totalIcpReceivedE8s' : bigint,
      'relinkFeeE8s' : bigint,
      'mintFeeE8s' : bigint,
      'domainConnectFeeE8s' : bigint,
      'topupIcpE8sPerT' : bigint,
      'mintNetworkOpsE8s' : bigint,
      'transferFeeE8s' : bigint,
    }
  >,
  /**
   * / Assets canister that serves the public ICE app / personal site viewer.
   */
  'getHostingAssetsCanisterId' : ActorMethod<[], string>,
  /**
   * / Text file body for assets `/.well-known/ic-domains` (one host per line) + static ICE domains.
   */
  'getIcDomainsFileBody' : ActorMethod<[], string>,
  /**
   * / Last known site for user (even if detached).
   */
  'getLastSite' : ActorMethod<[Principal], [] | [Principal]>,
  'getMyCycleAlerts' : ActorMethod<[bigint], Array<CycleAlert>>,
  'getMyRecoveryRequests' : ActorMethod<[], Array<RecoveryRequest>>,
  'getMyTransferOfferStatus' : ActorMethod<
    [],
    {
      'expiresAt' : bigint,
      'site' : [] | [Principal],
      'claimed' : boolean,
      'transferFeeE8s' : bigint,
      'hasOffer' : boolean,
    }
  >,
  /**
   * / Ops health: factory mint capacity + optional registry balance (if configured).
   */
  'getNetworkCyclesHealth' : ActorMethod<
    [],
    {
      'factoryMinMint' : bigint,
      'registryCycles' : [] | [bigint],
      'factoryCanMint' : boolean,
      'registryLow' : boolean,
      'message' : string,
      'factoryCycles' : bigint,
    }
  >,
  'getNnsDepositInfo' : ActorMethod<
    [Principal],
    { 'owner' : Principal, 'note' : string, 'subaccountHex' : string }
  >,
  'getOwner' : ActorMethod<[], Principal>,
  'getOwnerCycleAlerts' : ActorMethod<[bigint], Array<CycleAlert>>,
  'getPrincipalMigrationStatus' : ActorMethod<
    [],
    { 'open' : boolean, 'claimedCount' : bigint }
  >,
  /**
   * / Whether the factory can mint a new user_site right now (cycles + WASM).
   * / UI should block paid Join when canMint is false so users do not pay without a site.
   */
  'getProvisionCapacity' : ActorMethod<
    [],
    {
      'canMint' : boolean,
      'wasmReady' : boolean,
      'message' : string,
      'minRequired' : bigint,
      'factoryCycles' : bigint,
    }
  >,
  'getRegistryId' : ActorMethod<[], Principal>,
  'getResetLog' : ActorMethod<[bigint], Array<ResetLogEntry>>,
  /**
   * / Public: resolve hostname → personal site canister (for custom-domain hosting on assets SPA).
   */
  'getSiteByDomain' : ActorMethod<[string], [] | [Principal]>,
  'getSiteDomainConnection' : ActorMethod<[Principal], [] | [DomainRecord]>,
  'getSiteOwner' : ActorMethod<[Principal], [] | [Principal]>,
  'getTransferLog' : ActorMethod<[bigint], Array<TransferLogEntry>>,
  'getUserCanister' : ActorMethod<[Principal], [] | [Principal]>,
  /**
   * / UI: can the caller request a user factory-reset now?
   */
  'getUserResetStatus' : ActorMethod<
    [],
    {
      'isLinkedOwner' : boolean,
      'attached' : boolean,
      'allowed' : boolean,
      'cooldownRemainingNs' : bigint,
      'message' : string,
      'cooldownHours' : bigint,
    }
  >,
  /**
   * / Admin/ops: sites owned by a given user.
   */
  'getUserSites' : ActorMethod<[Principal], Array<Principal>>,
  'getWasmMagicHex' : ActorMethod<[], string>,
  'getWasmSize' : ActorMethod<[], bigint>,
  /**
   * / Legacy alias
   */
  'handoverControllers' : ActorMethod<[Principal], string>,
  'hasSiteRecoveryCode' : ActorMethod<[], boolean>,
  'health' : ActorMethod<[], string>,
  /**
   * / Public helper: can this canister reattach? (Registry / local mint record)
   */
  'isEligibleForReattach' : ActorMethod<[Principal], boolean>,
  /**
   * / Public: is the Factory still a controller of this site? (ops / UI health)
   */
  'isFactoryControllerOf' : ActorMethod<[Principal], boolean>,
  'isLinked' : ActorMethod<[Principal], boolean>,
  'isSiteReadyToDetach' : ActorMethod<[Principal], boolean>,
  'listActiveCanisters' : ActorMethod<[], Array<[Principal, Principal]>>,
  /**
   * / Public list of registered personal domains (for ic-domains sync / ops).
   */
  'listHostingDomains' : ActorMethod<[], Array<HostingDomainRow>>,
  /**
   * / All sites owned by caller (multi-site). Derived from siteOwners map.
   */
  'listMySites' : ActorMethod<[], Array<Principal>>,
  'listPendingMints' : ActorMethod<[], Array<PendingMint>>,
  'listPendingRecoveryRequests' : ActorMethod<[], Array<RecoveryRequest>>,
  /**
   * / All known sites (user, site) for master emergency panel — linked and last-known.
   */
  'listRegisteredSites' : ActorMethod<
    [],
    Array<[Principal, Principal, boolean]>
  >,
  /**
   * / Soft probe for UI/ops (does not mutate state).
   */
  'probeDomainValidate' : ActorMethod<[string], OpResult>,
  /**
   * / Quote ICP e8s required to top up `cyclesAmount` cycles.
   */
  'quoteTopUpIcpE8s' : ActorMethod<[bigint], bigint>,
  /**
   * / Owner: regenerate recovery code for preferred site (old code dies).
   */
  'regenerateSiteRecoveryCode' : ActorMethod<[], OpResult>,
  'regenerateSiteRecoveryCodeFor' : ActorMethod<[Principal], OpResult>,
  /**
   * / Reattach (relink): rejoin the ICE factory network.
   * / Registry must confirm the canister was previously minted by this Factory — rejects all others.
   * / Optional siteId: if null, uses lastSite for caller.
   */
  'relink' : ActorMethod<[[] | [Principal]], OpResult>,
  /**
   * / Linked site owner only: full factory reset. Rate limited to once per 24h per site.
   * / Not available when detached. NNS/dfx controllers cannot use this path (owner II only).
   */
  'requestFactoryReset' : ActorMethod<[], OpResult>,
  /**
   * / User: prove an II session and request master help for a site recovery code.
   */
  'requestSiteRecovery' : ActorMethod<[Principal, string], OpResult>,
  /**
   * / One-shot: return mint/regen code for caller, then clear pending reveal.
   */
  'revealPendingRecoveryCode' : ActorMethod<[], OpResult>,
  /**
   * / Scan linked sites (limit) and attempt auto top-up where enabled. Skips detached.
   */
  'scanAutoTopUpLinked' : ActorMethod<[bigint], string>,
  /**
   * / Owner enables auto top-up with explicit caps (requires ICP ICRC-2 allowance when triggered).
   */
  'setAutoTopUp' : ActorMethod<[boolean, bigint, bigint], OpResult>,
  /**
   * / Set preferred/primary site (must own it). Used by post-login picker.
   */
  'setPreferredSite' : ActorMethod<[Principal], OpResult>,
  /**
   * / Set custom domain + public URL (charges 1 ICP if this hostname not yet paid).
   */
  'setSiteDomainConnection' : ActorMethod<[string, string], OpResult>,
  'setUserSiteWasm' : ActorMethod<[Uint8Array | number[]], string>,
  /**
   * / Legacy factory-mediated top-up (ICRC-2). Prefer NNS "Add cycles" on the site canister itself —
   * / UI uses NNS-only top-up so users pay from their NNS wallet without ICE II approve.
   * / `amount` = cycles to deposit. Factory must hold enough cycles.
   */
  'topUpCycles' : ActorMethod<[Principal, bigint], OpResult>,
  /**
   * / Strip non-deterministic headers for consensus on HTTP outcall responses.
   */
  'transformHttpResponse' : ActorMethod<[TransformArgs], HttpResponsePayload>,
  /**
   * / Trigger auto top-up for caller's site if enabled, low, and factory has reserve.
   * / Charges owner's ICP (ICRC-2) — never drains factory.
   */
  'tryAutoTopUpMySite' : ActorMethod<[], OpResult>,
  /**
   * / Ops/public nudge: attempt auto top-up for a linked site if owner enabled it.
   */
  'tryAutoTopUpSite' : ActorMethod<[Principal], OpResult>,
  /**
   * / Upgrade caller's site to latest stored user_site WASM (factory must be controller).
   */
  'upgradeMySite' : ActorMethod<[], OpResult>,
}
export interface HostingDomainRow {
  'domain' : string,
  'publicUrl' : string,
  'site' : Principal,
  'dnsConfigured' : boolean,
}
export interface HttpHeader { 'value' : string, 'name' : string }
export interface HttpResponsePayload {
  'status' : bigint,
  'body' : Uint8Array | number[],
  'headers' : Array<HttpHeader>,
}
export type OpResult = { 'ok' : string } |
  { 'err' : string };
export interface PendingMint {
  'intendedOwner' : Principal,
  'createdAt' : bigint,
  'site' : Principal,
  'updatedAt' : bigint,
  'stage' : string,
  'lastError' : string,
}
export interface RecoveryRequest {
  'at' : bigint,
  'registeredOwner' : [] | [Principal],
  'requester' : Principal,
  'note' : string,
  'site' : Principal,
}
export interface ResetLogEntry {
  'at' : bigint,
  'siteOwner' : Principal,
  'kind' : string,
  'site' : Principal,
  'triggeredBy' : Principal,
}
export interface TransferLogEntry {
  'at' : bigint,
  'toOwner' : Principal,
  'kind' : string,
  'site' : Principal,
  'fromOwner' : Principal,
}
export interface TransformArgs {
  'context' : Uint8Array | number[],
  'response' : HttpResponsePayload,
}
export interface WasmPushResult {
  'skipped' : bigint,
  'upgraded' : bigint,
  'failed' : Array<[Principal, string]>,
}
/**
 * / Master Factory — provision user_site canisters, detach/relink, cycles top-up.
 * / https://github.com/frostedblocks/ice-network
 */
export interface _SERVICE extends Factory {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
