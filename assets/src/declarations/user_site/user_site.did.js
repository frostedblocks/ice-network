export const idlFactory = ({ IDL }) => {
  const ChunkedBeginResult = IDL.Variant({
    'ok' : IDL.Record({
      'maxPhotoBytes' : IDL.Nat,
      'maxChunkBytes' : IDL.Nat,
      'uploadId' : IDL.Nat,
    }),
    'err' : IDL.Text,
  });
  const Product = IDL.Record({
    'id' : IDL.Nat,
    'title' : IDL.Text,
    'active' : IDL.Bool,
    'createdAt' : IDL.Int,
    'description' : IDL.Text,
    'updatedAt' : IDL.Int,
    'imageURL' : IDL.Opt(IDL.Text),
    'photoIds' : IDL.Vec(IDL.Nat),
    'currency' : IDL.Text,
    'priceCents' : IDL.Nat,
    'shippingCents' : IDL.Nat,
  });
  const ProductResult = IDL.Variant({ 'ok' : Product, 'err' : IDL.Text });
  const PhotoMeta = IDL.Record({
    'id' : IDL.Nat,
    'url' : IDL.Text,
    'contentType' : IDL.Text,
    'path' : IDL.Text,
    'size' : IDL.Nat,
    'uploadedAt' : IDL.Int,
  });
  const UploadPhotoResult = IDL.Variant({ 'ok' : PhotoMeta, 'err' : IDL.Text });
  const ChunkedStatus = IDL.Record({
    'missingIndices' : IDL.Vec(IDL.Nat),
    'contentType' : IDL.Text,
    'receivedBytes' : IDL.Nat,
    'receivedChunks' : IDL.Nat,
    'totalSize' : IDL.Nat,
    'uploadId' : IDL.Nat,
    'chunkCount' : IDL.Nat,
  });
  const CyclesGauge = IDL.Record({
    'warning' : IDL.Opt(IDL.Text),
    'balance' : IDL.Nat,
    'estimatedDaysLeft' : IDL.Nat,
    'lastCheck' : IDL.Int,
    'lowCycles' : IDL.Bool,
  });
  const DomainStatus = IDL.Record({
    'customDomain' : IDL.Text,
    'publicUrl' : IDL.Text,
    'dnsConfigured' : IDL.Bool,
    'domainConnectedAt' : IDL.Int,
    'canisterId' : IDL.Principal,
    'readyForDetach' : IDL.Bool,
  });
  const SiteFormat = IDL.Variant({ 'social' : IDL.Null, 'store' : IDL.Null });
  const Time = IDL.Int;
  const Post = IDL.Record({
    'id' : IDL.Nat,
    'content' : IDL.Text,
    'imageURL' : IDL.Opt(IDL.Text),
    'timestamp' : Time,
  });
  const Page = IDL.Record({
    'id' : IDL.Text,
    'title' : IDL.Text,
    'body' : IDL.Text,
    'updatedAt' : Time,
  });
  const PhotoQuota = IDL.Record({
    'maxPhotos' : IDL.Nat,
    'used' : IDL.Nat,
    'remaining' : IDL.Nat,
    'maxBytesPerPhoto' : IDL.Nat,
  });
  const SiteProfile = IDL.Record({
    'bio' : IDL.Text,
    'username' : IDL.Text,
    'avatarURL' : IDL.Text,
  });
  const Receipt = IDL.Record({
    'id' : IDL.Nat,
    'productId' : IDL.Nat,
    'amountCents' : IDL.Nat,
    'recordedAt' : IDL.Int,
    'currency' : IDL.Text,
    'recorder' : IDL.Principal,
    'buyerRef' : IDL.Text,
  });
  const SiteStatus = IDL.Record({
    'owner' : IDL.Principal,
    'linkedToNetwork' : IDL.Bool,
    'factoryId' : IDL.Opt(IDL.Principal),
    'cycles' : CyclesGauge,
    'pageCount' : IDL.Nat,
    'profile' : SiteProfile,
  });
  const StripePublicConfig = IDL.Record({
    'accountId' : IDL.Text,
    'publishableKey' : IDL.Text,
  });
  const HeaderField = IDL.Tuple(IDL.Text, IDL.Text);
  const HttpRequest = IDL.Record({
    'url' : IDL.Text,
    'method' : IDL.Text,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(HeaderField),
    'certificate_version' : IDL.Opt(IDL.Nat16),
  });
  const StreamingToken = IDL.Record({
    'key' : IDL.Text,
    'index' : IDL.Nat,
    'content_encoding' : IDL.Text,
  });
  const StreamingCallbackHttpResponse = IDL.Record({
    'token' : IDL.Opt(StreamingToken),
    'body' : IDL.Vec(IDL.Nat8),
  });
  const StreamingStrategy = IDL.Variant({
    'Callback' : IDL.Record({
      'token' : StreamingToken,
      'callback' : IDL.Func(
          [StreamingToken],
          [StreamingCallbackHttpResponse],
          ['query'],
        ),
    }),
  });
  const HttpResponse = IDL.Record({
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(HeaderField),
    'upgrade' : IDL.Opt(IDL.Bool),
    'streaming_strategy' : IDL.Opt(StreamingStrategy),
    'status_code' : IDL.Nat16,
  });
  const ReceiptResult = IDL.Variant({ 'ok' : Receipt, 'err' : IDL.Text });
  const UserSite = IDL.Service({
    'abortChunkedUpload' : IDL.Func([], [IDL.Text], []),
    'acceptOwnership' : IDL.Func([], [IDL.Text], []),
    'addTrustedRecorder' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'beginChunkedUpload' : IDL.Func(
        [IDL.Text, IDL.Nat, IDL.Nat],
        [ChunkedBeginResult],
        [],
      ),
    'bindStripePublic' : IDL.Func([IDL.Text, IDL.Text], [IDL.Text], []),
    'bootstrap' : IDL.Func(
        [IDL.Principal, IDL.Principal, IDL.Text, IDL.Text, IDL.Text],
        [IDL.Text],
        [],
      ),
    'clearDomainConnection' : IDL.Func([], [IDL.Text], []),
    'clearStripePublic' : IDL.Func([], [IDL.Text], []),
    'confirmDnsConfigured' : IDL.Func([], [IDL.Text], []),
    'createProduct' : IDL.Func(
        [IDL.Text, IDL.Text, IDL.Nat, IDL.Nat, IDL.Text, IDL.Opt(IDL.Text), IDL.Vec(IDL.Nat)],
        [ProductResult],
        [],
      ),
    'deletePage' : IDL.Func([IDL.Text], [IDL.Text], []),
    'deletePhoto' : IDL.Func([IDL.Nat], [IDL.Text], []),
    'deleteProduct' : IDL.Func([IDL.Nat], [IDL.Text], []),
    'finalizeChunkedUpload' : IDL.Func([IDL.Nat], [UploadPhotoResult], []),
    'followPeer' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'getBannerURL' : IDL.Func([], [IDL.Text], ['query']),
    'getCanisterId' : IDL.Func([], [IDL.Principal], ['query']),
    'getChunkedUploadStatus' : IDL.Func(
        [],
        [IDL.Opt(ChunkedStatus)],
        ['query'],
      ),
    'getCyclesGauge' : IDL.Func([], [CyclesGauge], ['query']),
    'getDomainStatus' : IDL.Func([], [DomainStatus], ['query']),
    'getFeature' : IDL.Func([IDL.Text], [IDL.Opt(IDL.Bool)], ['query']),
    'getFollowing' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'getFormat' : IDL.Func([], [SiteFormat], ['query']),
    'getLocalFeed' : IDL.Func([IDL.Nat], [IDL.Vec(Post)], ['query']),
    'getOwner' : IDL.Func([], [IDL.Principal], ['query']),
    'getPage' : IDL.Func([IDL.Text], [IDL.Opt(Page)], ['query']),
    'getPhotoMeta' : IDL.Func([IDL.Nat], [IDL.Opt(PhotoMeta)], ['query']),
    'getPhotoQuota' : IDL.Func([], [PhotoQuota], ['query']),
    'getProduct' : IDL.Func([IDL.Nat], [IDL.Opt(Product)], ['query']),
    'getProfile' : IDL.Func([], [SiteProfile], ['query']),
    'getReceipt' : IDL.Func([IDL.Nat], [IDL.Opt(Receipt)], ['query']),
    'getSetting' : IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ['query']),
    'getSiteStatus' : IDL.Func([], [SiteStatus], ['query']),
    'getStripePublic' : IDL.Func([], [IDL.Opt(StripePublicConfig)], ['query']),
    'http_request' : IDL.Func([HttpRequest], [HttpResponse], ['query']),
    'init' : IDL.Func([IDL.Principal], [], []),
    'isLinkedToNetwork' : IDL.Func([], [IDL.Bool], ['query']),
    'isLowCycles' : IDL.Func([], [IDL.Bool], ['query']),
    'isReadyToDetach' : IDL.Func([], [IDL.Bool], ['query']),
    'listAllProducts' : IDL.Func([], [IDL.Vec(Product)], ['query']),
    'listFeatures' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Bool))],
        ['query'],
      ),
    'listPages' : IDL.Func([], [IDL.Vec(Page)], ['query']),
    'listPhotos' : IDL.Func([], [IDL.Vec(PhotoMeta)], ['query']),
    'listProducts' : IDL.Func([], [IDL.Vec(Product)], ['query']),
    'listReceipts' : IDL.Func([], [IDL.Vec(Receipt)], ['query']),
    'listSettings' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))],
        ['query'],
      ),
    'listTrustedRecorders' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'makeLocalPost' : IDL.Func(
        [IDL.Text, IDL.Opt(IDL.Text)],
        [IDL.Opt(IDL.Nat)],
        [],
      ),
    'onDetach' : IDL.Func([], [IDL.Text], []),
    'onRelink' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'recordCyclesSnapshot' : IDL.Func([], [], []),
    'recordReceipt' : IDL.Func(
        [IDL.Nat, IDL.Text, IDL.Nat, IDL.Text],
        [ReceiptResult],
        [],
      ),
    'removeTrustedRecorder' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'seedTrustedRecorder' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'setDomainConnection' : IDL.Func([IDL.Text, IDL.Text], [IDL.Text], []),
    'setFeature' : IDL.Func([IDL.Text, IDL.Bool], [IDL.Text], []),
    'setFormat' : IDL.Func([SiteFormat], [IDL.Text], []),
    'setProfile' : IDL.Func([IDL.Text, IDL.Text, IDL.Text], [IDL.Text], []),
    'setSetting' : IDL.Func([IDL.Text, IDL.Text], [IDL.Text], []),
    'setStripePublic' : IDL.Func([IDL.Text, IDL.Text], [IDL.Text], []),
    'syncFromPeer' : IDL.Func([IDL.Principal, IDL.Nat], [IDL.Vec(Post)], []),
    'syncOwner' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'unfollowPeer' : IDL.Func([IDL.Principal], [IDL.Text], []),
    'updateProduct' : IDL.Func(
        [
          IDL.Nat,
          IDL.Text,
          IDL.Text,
          IDL.Nat,
          IDL.Nat,
          IDL.Text,
          IDL.Opt(IDL.Text),
          IDL.Vec(IDL.Nat),
          IDL.Bool,
        ],
        [IDL.Text],
        [],
      ),
    'uploadPhoto' : IDL.Func(
        [IDL.Text, IDL.Vec(IDL.Nat8)],
        [UploadPhotoResult],
        [],
      ),
    'uploadPhotoChunk' : IDL.Func(
        [IDL.Nat, IDL.Nat, IDL.Vec(IDL.Nat8)],
        [IDL.Text],
        [],
      ),
    'upsertPage' : IDL.Func([IDL.Text, IDL.Text, IDL.Text], [IDL.Text], []),
    'usePhotoAsAvatar' : IDL.Func([IDL.Nat], [IDL.Text], []),
    'usePhotoAsBanner' : IDL.Func([IDL.Nat], [IDL.Text], []),
  });
  return UserSite;
};
export const init = ({ IDL }) => { return [IDL.Principal]; };
