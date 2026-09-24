export const idlFactory = ({ IDL }) => {
  const OpResult = IDL.Variant({ 'ok' : IDL.Text, 'err' : IDL.Text });
  const CreateUserSiteResult = IDL.Variant({
    'ok' : IDL.Principal,
    'err' : IDL.Text,
  });
  const WasmPushResult = IDL.Record({
    'skipped' : IDL.Nat,
    'upgraded' : IDL.Nat,
    'failed' : IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Text)),
  });
  const AutoTopUpPref = IDL.Record({
    'maxIcpE8sPerTopUp' : IDL.Nat,
    'enabled' : IDL.Bool,
    'lastTopUpAt' : IDL.Int,
    'maxTopUpsPerDay' : IDL.Nat,
    'dayBucket' : IDL.Int,
    'topUpsToday' : IDL.Nat,
  });
  const CycleAlert = IDL.Record({
    'at' : IDL.Int,
    'balance' : IDL.Nat,
    'owner' : IDL.Principal,
    'kind' : IDL.Text,
    'site' : IDL.Principal,
    'message' : IDL.Text,
  });
  const RecoveryRequest = IDL.Record({
    'at' : IDL.Int,
    'registeredOwner' : IDL.Opt(IDL.Principal),
    'requester' : IDL.Principal,
    'note' : IDL.Text,
    'site' : IDL.Principal,
  });
  const ResetLogEntry = IDL.Record({
    'at' : IDL.Int,
    'siteOwner' : IDL.Principal,
    'kind' : IDL.Text,
    'site' : IDL.Principal,
    'triggeredBy' : IDL.Principal,
  });
  const DomainRecord = IDL.Record({
    'domain' : IDL.Text,
    'publicUrl' : IDL.Text,
    'connectedAt' : IDL.Int,
    'dnsConfigured' : IDL.Bool,
  });
  const TransferLogEntry = IDL.Record({
    'at' : IDL.Int,
    'toOwner' : IDL.Principal,
    'kind' : IDL.Text,
    'site' : IDL.Principal,
    'fromOwner' : IDL.Principal,
  });
  const HostingDomainRow = IDL.Record({
    'domain' : IDL.Text,
    'publicUrl' : IDL.Text,
    'site' : IDL.Principal,
    'dnsConfigured' : IDL.Bool,
  });
  const PendingMint = IDL.Record({
    'intendedOwner' : IDL.Principal,
    'createdAt' : IDL.Int,
    'site' : IDL.Principal,
    'updatedAt' : IDL.Int,
    'stage' : IDL.Text,
    'lastError' : IDL.Text,
  });
  const HttpHeader = IDL.Record({ 'value' : IDL.Text, 'name' : IDL.Text });
  const HttpResponsePayload = IDL.Record({
    'status' : IDL.Nat,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(HttpHeader),
  });
  const TransformArgs = IDL.Record({
    'context' : IDL.Vec(IDL.Nat8),
    'response' : HttpResponsePayload,
  });
  const Factory = IDL.Service({
    'adminAbandonPendingMint' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'adminApproveRecoveryRequest' : IDL.Func(
        [IDL.Principal, IDL.Principal, IDL.Bool],
        [OpResult],
        [],
      ),
    'adminBackfillRegistry' : IDL.Func([], [IDL.Text], []),
    'adminCancelSiteTransfer' : IDL.Func([IDL.Principal], [OpResult], []),
    'adminConvertIcpToCycles' : IDL.Func([IDL.Nat], [IDL.Text], []),
    'adminCreateUserSite' : IDL.Func(
        [IDL.Principal],
        [CreateUserSiteResult],
        [],
      ),
    'adminForceResetSite' : IDL.Func([IDL.Principal], [OpResult], []),
    'adminForceSiteTransfer' : IDL.Func(
        [IDL.Principal, IDL.Principal],
        [OpResult],
        [],
      ),
    'adminGenerateSiteRecoveryCode' : IDL.Func([IDL.Principal], [OpResult], []),
    'adminLinkUserCanister' : IDL.Func(
        [IDL.Principal, IDL.Principal],
        [IDL.Text],
        [],
      ),
    'adminProvisionSite' : IDL.Func(
        [IDL.Principal],
        [CreateUserSiteResult],
        [],
      ),
    'adminPushLatestWasmToAll' : IDL.Func([IDL.Nat], [WasmPushResult], []),
    'adminReassignSite' : IDL.Func(
        [IDL.Principal, IDL.Principal],
        [IDL.Text],
        [],
      ),
    'adminReconcileRegistry' : IDL.Func([], [IDL.Text], []),
    'adminRecreateUserSite' : IDL.Func(
        [IDL.Principal],
        [CreateUserSiteResult],
        [],
      ),
    'adminRejectRecoveryRequest' : IDL.Func(
        [IDL.Principal, IDL.Principal],
        [OpResult],
        [],
      ),
    'adminResumePendingMint' : IDL.Func(
        [IDL.Principal],
        [CreateUserSiteResult],
        [],
      ),
    'adminSetControllers' : IDL.Func(
        [IDL.Principal, IDL.Vec(IDL.Principal)],
        [IDL.Text],
        [],
      ),
    'adminSetDomainConnectFee' : IDL.Func([IDL.Nat], [IDL.Text], []),
    'adminSetFees' : IDL.Func([IDL.Nat, IDL.Nat, IDL.Nat], [IDL.Text], []),
    'adminSetPrincipalMigration' : IDL.Func([IDL.Bool], [IDL.Text], []),
    'adminSetRegistry' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'adminSetTransferFee' : IDL.Func([IDL.Nat], [IDL.Text], []),
    'adminSyncSiteOwner' : IDL.Func([IDL.Principal], [OpResult], []),
    'adminUnlinkUserCanister' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'adminUpgradeUserSite' : IDL.Func([IDL.Principal], [OpResult], []),
    'appendUserSiteWasm' : IDL.Func([IDL.Vec(IDL.Nat8)], [IDL.Text], []),
    'appendUserSiteWasmHex' : IDL.Func([IDL.Text], [IDL.Text], []),
    'applyStandardControllers' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'applyStandardControllersWithOps' : IDL.Func(
        [IDL.Principal],
        [IDL.Text],
        [],
      ),
    'cancelSiteTransferOffer' : IDL.Func([], [OpResult], []),
    'cancelSubscription' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'checkAndTopUp' : IDL.Func([IDL.Principal], [], []),
    'checkDns' : IDL.Func([], [OpResult], []),
    'claimOwner' : IDL.Func([], [IDL.Text], []),
    'claimSiteByCanisterId' : IDL.Func([IDL.Principal], [OpResult], []),
    'claimSiteTransfer' : IDL.Func([IDL.Text], [OpResult], []),
    'claimSiteWithRecoveryCode' : IDL.Func([IDL.Text], [OpResult], []),
    'clearUserSiteWasm' : IDL.Func([], [IDL.Text], []),
    'confirmSiteDns' : IDL.Func([], [OpResult], []),
    'connectDomain' : IDL.Func([IDL.Text], [OpResult], []),
    'createSiteTransferOffer' : IDL.Func([], [OpResult], []),
    'createSiteTransferOfferFor' : IDL.Func([IDL.Principal], [OpResult], []),
    'createUserSite' : IDL.Func([], [CreateUserSiteResult], []),
    'detach' : IDL.Func([], [OpResult], []),
    'ensureUserSite' : IDL.Func([], [CreateUserSiteResult], []),
    'fetchNnsDepositBalance' : IDL.Func([IDL.Principal], [IDL.Nat], []),
    'finalizeUserSiteWasm' : IDL.Func([], [IDL.Text], []),
    'getAutoTopUpStatus' : IDL.Func(
        [IDL.Principal],
        [IDL.Opt(AutoTopUpPref)],
        ['query'],
      ),
    'getControllerPolicy' : IDL.Func(
        [],
        [
          IDL.Record({
            'note' : IDL.Text,
            'dfxInDefault' : IDL.Bool,
            'factoryMustRemain' : IDL.Bool,
            'roles' : IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
          }),
        ],
        ['query'],
      ),
    'getFactoryCycles' : IDL.Func([], [IDL.Nat], ['query']),
    'getFactoryIcpBalanceE8s' : IDL.Func([], [IDL.Nat], []),
    'getFees' : IDL.Func(
        [],
        [
          IDL.Record({
            'detachFeeE8s' : IDL.Nat,
            'totalIcpReceivedE8s' : IDL.Nat,
            'relinkFeeE8s' : IDL.Nat,
            'domainConnectFeeE8s' : IDL.Nat,
            'topupIcpE8sPerT' : IDL.Nat,
            'transferFeeE8s' : IDL.Nat,
          }),
        ],
        ['query'],
      ),
    'getHostingAssetsCanisterId' : IDL.Func([], [IDL.Text], ['query']),
    'getIcDomainsFileBody' : IDL.Func([], [IDL.Text], ['query']),
    'getLastSite' : IDL.Func(
        [IDL.Principal],
        [IDL.Opt(IDL.Principal)],
        ['query'],
      ),
    'getMyCycleAlerts' : IDL.Func([IDL.Nat], [IDL.Vec(CycleAlert)], ['query']),
    'getMyRecoveryRequests' : IDL.Func(
        [],
        [IDL.Vec(RecoveryRequest)],
        ['query'],
      ),
    'getMyTransferOfferStatus' : IDL.Func(
        [],
        [
          IDL.Record({
            'expiresAt' : IDL.Int,
            'site' : IDL.Opt(IDL.Principal),
            'claimed' : IDL.Bool,
            'transferFeeE8s' : IDL.Nat,
            'hasOffer' : IDL.Bool,
          }),
        ],
        ['query'],
      ),
    'getNetworkCyclesHealth' : IDL.Func(
        [],
        [
          IDL.Record({
            'factoryMinMint' : IDL.Nat,
            'registryCycles' : IDL.Opt(IDL.Nat),
            'factoryCanMint' : IDL.Bool,
            'registryLow' : IDL.Bool,
            'message' : IDL.Text,
            'factoryCycles' : IDL.Nat,
          }),
        ],
        [],
      ),
    'getNnsDepositInfo' : IDL.Func(
        [IDL.Principal],
        [
          IDL.Record({
            'owner' : IDL.Principal,
            'note' : IDL.Text,
            'subaccountHex' : IDL.Text,
          }),
        ],
        ['query'],
      ),
    'getOwner' : IDL.Func([], [IDL.Principal], ['query']),
    'getOwnerCycleAlerts' : IDL.Func(
        [IDL.Nat],
        [IDL.Vec(CycleAlert)],
        ['query'],
      ),
    'getPrincipalMigrationStatus' : IDL.Func(
        [],
        [IDL.Record({ 'open' : IDL.Bool, 'claimedCount' : IDL.Nat })],
        ['query'],
      ),
    'getProvisionCapacity' : IDL.Func(
        [],
        [
          IDL.Record({
            'canMint' : IDL.Bool,
            'wasmReady' : IDL.Bool,
            'message' : IDL.Text,
            'minRequired' : IDL.Nat,
            'factoryCycles' : IDL.Nat,
          }),
        ],
        ['query'],
      ),
    'getRegistryId' : IDL.Func([], [IDL.Principal], ['query']),
    'getResetLog' : IDL.Func([IDL.Nat], [IDL.Vec(ResetLogEntry)], ['query']),
    'getSiteByDomain' : IDL.Func(
        [IDL.Text],
        [IDL.Opt(IDL.Principal)],
        ['query'],
      ),
    'getSiteDomainConnection' : IDL.Func(
        [IDL.Principal],
        [IDL.Opt(DomainRecord)],
        ['query'],
      ),
    'getSiteOwner' : IDL.Func(
        [IDL.Principal],
        [IDL.Opt(IDL.Principal)],
        ['query'],
      ),
    'getTransferLog' : IDL.Func(
        [IDL.Nat],
        [IDL.Vec(TransferLogEntry)],
        ['query'],
      ),
    'getUserCanister' : IDL.Func(
        [IDL.Principal],
        [IDL.Opt(IDL.Principal)],
        ['query'],
      ),
    'getUserResetStatus' : IDL.Func(
        [],
        [
          IDL.Record({
            'isLinkedOwner' : IDL.Bool,
            'attached' : IDL.Bool,
            'allowed' : IDL.Bool,
            'cooldownRemainingNs' : IDL.Int,
            'message' : IDL.Text,
            'cooldownHours' : IDL.Nat,
          }),
        ],
        ['query'],
      ),
    'getUserSites' : IDL.Func(
        [IDL.Principal],
        [IDL.Vec(IDL.Principal)],
        ['query'],
      ),
    'getWasmMagicHex' : IDL.Func([], [IDL.Text], ['query']),
    'getWasmSize' : IDL.Func([], [IDL.Nat], ['query']),
    'handoverControllers' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'hasSiteRecoveryCode' : IDL.Func([], [IDL.Bool], ['query']),
    'health' : IDL.Func([], [IDL.Text], ['query']),
    'isEligibleForReattach' : IDL.Func([IDL.Principal], [IDL.Bool], []),
    'isFactoryControllerOf' : IDL.Func([IDL.Principal], [IDL.Bool], []),
    'isLinked' : IDL.Func([IDL.Principal], [IDL.Bool], ['query']),
    'isSiteReadyToDetach' : IDL.Func([IDL.Principal], [IDL.Bool], ['query']),
    'listActiveCanisters' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Principal))],
        ['query'],
      ),
    'listHostingDomains' : IDL.Func([], [IDL.Vec(HostingDomainRow)], ['query']),
    'listMySites' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'listPendingMints' : IDL.Func([], [IDL.Vec(PendingMint)], ['query']),
    'listPendingRecoveryRequests' : IDL.Func(
        [],
        [IDL.Vec(RecoveryRequest)],
        ['query'],
      ),
    'listRegisteredSites' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Principal, IDL.Bool))],
        ['query'],
      ),
    'probeDomainValidate' : IDL.Func([IDL.Text], [OpResult], []),
    'quoteTopUpIcpE8s' : IDL.Func([IDL.Nat], [IDL.Nat], ['query']),
    'regenerateSiteRecoveryCode' : IDL.Func([], [OpResult], []),
    'regenerateSiteRecoveryCodeFor' : IDL.Func([IDL.Principal], [OpResult], []),
    'relink' : IDL.Func([IDL.Opt(IDL.Principal)], [OpResult], []),
    'requestFactoryReset' : IDL.Func([], [OpResult], []),
    'requestSiteRecovery' : IDL.Func([IDL.Principal, IDL.Text], [OpResult], []),
    'revealPendingRecoveryCode' : IDL.Func([], [OpResult], []),
    'scanAutoTopUpLinked' : IDL.Func([IDL.Nat], [IDL.Text], []),
    'setAutoTopUp' : IDL.Func([IDL.Bool, IDL.Nat, IDL.Nat], [OpResult], []),
    'setPreferredSite' : IDL.Func([IDL.Principal], [OpResult], []),
    'setSiteDomainConnection' : IDL.Func([IDL.Text, IDL.Text], [OpResult], []),
    'setUserSiteWasm' : IDL.Func([IDL.Vec(IDL.Nat8)], [IDL.Text], []),
    'topUpCycles' : IDL.Func([IDL.Principal, IDL.Nat], [OpResult], []),
    'transformHttpResponse' : IDL.Func(
        [TransformArgs],
        [HttpResponsePayload],
        ['query'],
      ),
    'tryAutoTopUpMySite' : IDL.Func([], [OpResult], []),
    'tryAutoTopUpSite' : IDL.Func([IDL.Principal], [OpResult], []),
    'upgradeMySite' : IDL.Func([], [OpResult], []),
  });
  return Factory;
};
export const init = ({ IDL }) => { return []; };
