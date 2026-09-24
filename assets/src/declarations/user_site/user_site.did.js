export const idlFactory = ({ IDL }) => {
  const Post = IDL.Record({
    id: IDL.Nat,
    content: IDL.Text,
    timestamp: IDL.Int,
    imageURL: IDL.Opt(IDL.Text),
  });
  const Page = IDL.Record({
    id: IDL.Text,
    title: IDL.Text,
    body: IDL.Text,
    updatedAt: IDL.Int,
  });
  const SiteProfile = IDL.Record({
    username: IDL.Text,
    bio: IDL.Text,
    avatarURL: IDL.Text,
  });
  const PhotoMeta = IDL.Record({
    id: IDL.Nat,
    contentType: IDL.Text,
    size: IDL.Nat,
    uploadedAt: IDL.Int,
    path: IDL.Text,
    url: IDL.Text,
  });
  const PhotoQuota = IDL.Record({
    used: IDL.Nat,
    maxPhotos: IDL.Nat,
    maxBytesPerPhoto: IDL.Nat,
    remaining: IDL.Nat,
  });
  const UploadPhotoResult = IDL.Variant({
    ok: PhotoMeta,
    err: IDL.Text,
  });
  const CyclesGauge = IDL.Record({
    balance: IDL.Nat,
    lastCheck: IDL.Int,
    estimatedDaysLeft: IDL.Nat,
    lowCycles: IDL.Bool,
    warning: IDL.Opt(IDL.Text),
  });
  const SiteStatus = IDL.Record({
    owner: IDL.Principal,
    linkedToNetwork: IDL.Bool,
    factoryId: IDL.Opt(IDL.Principal),
    profile: SiteProfile,
    pageCount: IDL.Nat,
    cycles: CyclesGauge,
  });
  const DomainStatus = IDL.Record({
    customDomain: IDL.Text,
    publicUrl: IDL.Text,
    dnsConfigured: IDL.Bool,
    readyForDetach: IDL.Bool,
    canisterId: IDL.Principal,
    domainConnectedAt: IDL.Int,
  });
  const HeaderField = IDL.Tuple(IDL.Text, IDL.Text);
  const HttpRequest = IDL.Record({
    method: IDL.Text,
    url: IDL.Text,
    headers: IDL.Vec(HeaderField),
    body: IDL.Vec(IDL.Nat8),
    certificate_version: IDL.Opt(IDL.Nat16),
  });
  const StreamingToken = IDL.Record({
    key: IDL.Text,
    index: IDL.Nat,
    content_encoding: IDL.Text,
  });
  const StreamingCallbackHttpResponse = IDL.Record({
    body: IDL.Vec(IDL.Nat8),
    token: IDL.Opt(StreamingToken),
  });
  const StreamingStrategy = IDL.Variant({
    Callback: IDL.Record({
      callback: IDL.Func(
        [StreamingToken],
        [StreamingCallbackHttpResponse],
        ["query"]
      ),
      token: StreamingToken,
    }),
  });
  const HttpResponse = IDL.Record({
    status_code: IDL.Nat16,
    headers: IDL.Vec(HeaderField),
    body: IDL.Vec(IDL.Nat8),
    streaming_strategy: IDL.Opt(StreamingStrategy),
    upgrade: IDL.Opt(IDL.Bool),
  });
  return IDL.Service({
    bootstrap: IDL.Func(
      [IDL.Principal, IDL.Principal, IDL.Text, IDL.Text, IDL.Text],
      [IDL.Text],
      []
    ),
    onDetach: IDL.Func([], [IDL.Text], []),
    onRelink: IDL.Func([IDL.Principal], [IDL.Text], []),
    init: IDL.Func([IDL.Principal], [], []),
    getOwner: IDL.Func([], [IDL.Principal], ["query"]),
    getCanisterId: IDL.Func([], [IDL.Principal], ["query"]),
    isLinkedToNetwork: IDL.Func([], [IDL.Bool], ["query"]),
    getProfile: IDL.Func([], [SiteProfile], ["query"]),
    getSiteStatus: IDL.Func([], [SiteStatus], ["query"]),
    getDomainStatus: IDL.Func([], [DomainStatus], ["query"]),
    isReadyToDetach: IDL.Func([], [IDL.Bool], ["query"]),
    setDomainConnection: IDL.Func([IDL.Text, IDL.Text], [IDL.Text], []),
    confirmDnsConfigured: IDL.Func([], [IDL.Text], []),
    clearDomainConnection: IDL.Func([], [IDL.Text], []),
    setProfile: IDL.Func([IDL.Text, IDL.Text, IDL.Text], [IDL.Text], []),
    upsertPage: IDL.Func([IDL.Text, IDL.Text, IDL.Text], [IDL.Text], []),
    deletePage: IDL.Func([IDL.Text], [IDL.Text], []),
    getPage: IDL.Func([IDL.Text], [IDL.Opt(Page)], ["query"]),
    listPages: IDL.Func([], [IDL.Vec(Page)], ["query"]),
    setSetting: IDL.Func([IDL.Text, IDL.Text], [IDL.Text], []),
    getSetting: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
    listSettings: IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))], ["query"]),
    setFeature: IDL.Func([IDL.Text, IDL.Bool], [IDL.Text], []),
    getFeature: IDL.Func([IDL.Text], [IDL.Opt(IDL.Bool)], ["query"]),
    listFeatures: IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Bool))], ["query"]),
    makeLocalPost: IDL.Func([IDL.Text, IDL.Opt(IDL.Text)], [IDL.Opt(IDL.Nat)], []),
    getLocalFeed: IDL.Func([IDL.Nat], [IDL.Vec(Post)], ["query"]),
    followPeer: IDL.Func([IDL.Principal], [IDL.Text], []),
    unfollowPeer: IDL.Func([IDL.Principal], [IDL.Text], []),
    getFollowing: IDL.Func([], [IDL.Vec(IDL.Principal)], ["query"]),
    syncFromPeer: IDL.Func([IDL.Principal, IDL.Nat], [IDL.Vec(Post)], []),
    getPhotoQuota: IDL.Func([], [PhotoQuota], ["query"]),
    listPhotos: IDL.Func([], [IDL.Vec(PhotoMeta)], ["query"]),
    getPhotoMeta: IDL.Func([IDL.Nat], [IDL.Opt(PhotoMeta)], ["query"]),
    uploadPhoto: IDL.Func([IDL.Text, IDL.Vec(IDL.Nat8)], [UploadPhotoResult], []),
    beginChunkedUpload: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Nat],
      [
        IDL.Variant({
          ok: IDL.Record({
            uploadId: IDL.Nat,
            maxChunkBytes: IDL.Nat,
            maxPhotoBytes: IDL.Nat,
          }),
          err: IDL.Text,
        }),
      ],
      []
    ),
    uploadPhotoChunk: IDL.Func([IDL.Nat, IDL.Nat, IDL.Vec(IDL.Nat8)], [IDL.Text], []),
    getChunkedUploadStatus: IDL.Func(
      [],
      [
        IDL.Opt(
          IDL.Record({
            uploadId: IDL.Nat,
            contentType: IDL.Text,
            totalSize: IDL.Nat,
            chunkCount: IDL.Nat,
            receivedChunks: IDL.Nat,
            receivedBytes: IDL.Nat,
            missingIndices: IDL.Vec(IDL.Nat),
          })
        ),
      ],
      ["query"]
    ),
    finalizeChunkedUpload: IDL.Func([IDL.Nat], [UploadPhotoResult], []),
    abortChunkedUpload: IDL.Func([], [IDL.Text], []),
    deletePhoto: IDL.Func([IDL.Nat], [IDL.Text], []),
    usePhotoAsAvatar: IDL.Func([IDL.Nat], [IDL.Text], []),
    usePhotoAsBanner: IDL.Func([IDL.Nat], [IDL.Text], []),
    getBannerURL: IDL.Func([], [IDL.Text], ["query"]),
    syncOwner: IDL.Func([IDL.Principal], [IDL.Text], []),
    http_request: IDL.Func([HttpRequest], [HttpResponse], ["query"]),
    getCyclesGauge: IDL.Func([], [CyclesGauge], ["query"]),
    isLowCycles: IDL.Func([], [IDL.Bool], ["query"]),
    recordCyclesSnapshot: IDL.Func([], [], []),
    acceptOwnership: IDL.Func([], [IDL.Text], []),
  });
};
export const init = ({ IDL }) => [IDL.Principal];
