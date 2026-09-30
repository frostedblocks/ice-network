import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface AdminUserInfo {
  'bio' : string,
  'username' : string,
  'user' : Principal,
  'isFreeTier' : boolean,
  'tokens' : bigint,
  'isBanned' : boolean,
  'postsToday' : bigint,
  'isRegistered' : boolean,
  'postsThisMonth' : bigint,
}
export interface Comment {
  'id' : bigint,
  'content' : string,
  'author' : Principal,
  'timestamp' : Time,
  'postId' : bigint,
}
export interface Limits {
  'tokensPerMessage' : bigint,
  'freeMaxLength' : bigint,
  'tokensPerLove' : bigint,
  'tokensPerPost' : bigint,
  'dailyLimit' : bigint,
  'freeTierLimit' : bigint,
  'maxCommentLength' : bigint,
  'paidMaxLength' : bigint,
  'reportsToHide' : bigint,
}
export interface LiteAdmin {
  'hiddenLitePostIds' : Array<string>,
  'feedBridgeOpen' : boolean,
  'signupsOpen' : boolean,
  'updatedAt' : bigint,
  'bannedLiteHandles' : Array<string>,
}
export type LiteAdminWrite = { 'ok' : LiteAdmin } |
  { 'unauthorized' : null };
export interface MasterContact {
  'id' : bigint,
  'content' : string,
  'fromLabel' : string,
  'from' : Principal,
  'createdAt' : Time,
  'read' : boolean,
}
export interface Notification {
  'id' : bigint,
  'from' : Principal,
  'kind' : string,
  'createdAt' : Time,
  'read' : boolean,
  'message' : string,
  'refId' : bigint,
}
export interface Post {
  'id' : bigint,
  'content' : string,
  'reportCount' : bigint,
  'author' : Principal,
  'likes' : bigint,
  'loves' : bigint,
  'imageURL' : [] | [string],
  'isHidden' : boolean,
  'timestamp' : Time,
}
export interface SiteStats {
  'bannedUsers' : bigint,
  'totalProfiles' : bigint,
  'registeredAccounts' : bigint,
  'totalBalances' : bigint,
  'tokensInCirculation' : bigint,
  'visiblePosts' : bigint,
  'reportedPosts' : bigint,
  'hiddenPosts' : bigint,
  'totalPosts' : bigint,
  'totalReportFlags' : bigint,
  'totalComments' : bigint,
}
export type Time = bigint;
export interface TreasuryStats {
  'pendingCount' : bigint,
  'totalIcpReceivedE8s' : bigint,
  'paymentsEnabled' : boolean,
}
export interface UserProfile {
  'bio' : string,
  'username' : string,
  'avatarURL' : string,
}
export interface _SERVICE {
  'addComment' : ActorMethod<[bigint, string], [] | [bigint]>,
  'adminBanUser' : ActorMethod<[Principal], string>,
  /**
   * / Master: clear prepaid ICP balance to 0.
   */
  'adminClearIcpE8s' : ActorMethod<[Principal], string>,
  /**
   * / Master/ops: convert ICE treasury ICP into cycles on the master factory via CMC.
   * / amountE8s = 0 converts all liquid ICP (minus one ledger fee).
   */
  'adminConvertTreasuryIcpToFactoryCycles' : ActorMethod<[bigint], string>,
  /**
   * / Master: credit prepaid ICP e8s without ledger pull (ops / recovery).
   */
  'adminCreditIcpE8s' : ActorMethod<[Principal, bigint], string>,
  /**
   * / Master: debit prepaid ICP e8s (capped at balance; no ledger transfer).
   */
  'adminDebitIcpE8s' : ActorMethod<[Principal, bigint], string>,
  /**
   * / Master: delete a user profile + free its username. Does not delete posts.
   * / Use for duplicate/legacy II principals (e.g. old founder after owner transfer).
   * / Cannot delete the current owner principal's profile.
   */
  'adminDeleteProfile' : ActorMethod<[Principal], string>,
  'adminHidePost' : ActorMethod<[bigint], boolean>,
  /**
   * / Master: list all profiles (principal + username + bio). For cleanup / audits.
   */
  'adminListProfiles' : ActorMethod<[], Array<[Principal, string, string]>>,
  /**
   * / Master: look up one user by II principal text or exact username.
   */
  'adminLookupUser' : ActorMethod<[string], [] | [AdminUserInfo]>,
  /**
   * / Master: mark a principal registered without charging ICP (payment recovery / II principal mismatch).
   * / If username is empty, only flips the registered flag (keeps existing profile if any).
   */
  'adminMarkRegistered' : ActorMethod<[Principal, string, string], string>,
  /**
   * / Master: II principal mismatch recovery — copy membership to a new II without Join fee.
   * / Marks `to` registered; optionally reassigns username from `from` if `to` has none.
   * / Does not move posts (profile save is separate).
   */
  'adminMigrateMembership' : ActorMethod<[Principal, Principal], string>,
  /**
   * / Master: re-run migration — mark all known IIs registered (no fees).
   */
  'adminRegisterAllExistingUsers' : ActorMethod<[], string>,
  /**
   * / Master: search users by username substring (case-insensitive). Also accepts a full principal.
   */
  'adminSearchUsers' : ActorMethod<[string, bigint], Array<AdminUserInfo>>,
  /**
   * / Master: set ICP action fees (e8s) and on/off for post, love, message.
   */
  'adminSetActionFees' : ActorMethod<
    [boolean, bigint, boolean, bigint, boolean, bigint],
    string
  >,
  'adminSetLimits' : ActorMethod<
    [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
    string
  >,
  'adminSetPaymentsEnabled' : ActorMethod<[boolean], string>,
  /**
   * / Join fee is permanently off (fee-at-mint). Cannot re-enable.
   */
  'adminSetRegistrationFee' : ActorMethod<[boolean, bigint, bigint], string>,
  'adminSetTippingEnabled' : ActorMethod<[boolean], string>,
  'adminUnbanUser' : ActorMethod<[Principal], string>,
  'adminUnhidePost' : ActorMethod<[bigint], boolean>,
  /**
   * / Master: clear registered flag for a principal that was auto-marked but is not a real member
   * / (e.g. ops deploy identity / unused founder IIs). Does not remove profile if one exists.
   */
  'adminUnmarkRegistered' : ActorMethod<[Principal], string>,
  'banLiteHandle' : ActorMethod<[string], LiteAdminWrite>,
  /**
   * / Block target: store block and remove any follow edge both directions.
   */
  'block' : ActorMethod<[Principal], string>,
  /**
   * / True only for the current Lite admin owner II (does not reveal the principal).
   */
  'canManageLiteAdmin' : ActorMethod<[], boolean>,
  /**
   * / One-time: ICE master (Master Profile) assigns Lite admin writes to msg.caller.
   * / After this, only that II can call setSignupsOpen / ban / hide / etc.
   */
  'claimLiteAdmin' : ActorMethod<[], string>,
  'claimMasterProfile' : ActorMethod<[], string>,
  /**
   * / After factory claimSiteByCanisterId: mark this II registered on ICE without Join fee.
   * / Requires owning at least one factory-registered personal site.
   */
  'completePrincipalMigration' : ActorMethod<[], string>,
  /**
   * / Anyone (including guests before sign-in) can message the master profile.
   * / Anonymous callers: 60s global cooldown. Max 500 chars. Stored for master inbox.
   */
  'contactMaster' : ActorMethod<[string, string], string>,
  /**
   * / Author or master can delete a comment.
   */
  'deleteComment' : ActorMethod<[bigint], string>,
  /**
   * / Author can permanently remove their post. Master can also delete any post.
   */
  'deletePost' : ActorMethod<[bigint], string>,
  /**
   * / Deposit ICP into prepaid balance: II must icrc2_approve this canister first.
   */
  'depositIcp' : ActorMethod<[bigint], string>,
  /**
   * / Author can edit their comment text.
   */
  'editComment' : ActorMethod<[bigint, string], string>,
  /**
   * / Author can update post text (and optional image URL). Respects length limits.
   */
  'editPost' : ActorMethod<[bigint, string, [] | [string]], string>,
  /**
   * / One-shot / status: ensures launch migration ran, returns whether pack payments are live.
   */
  'ensurePaymentsLive' : ActorMethod<[], boolean>,
  'ensureRegistrationFee2Icp' : ActorMethod<[], string>,
  /**
   * / Apply current first-login fee migration (2 ICP). Master can still change via adminSetRegistrationFee.
   */
  'ensureRegistrationFee5Icp' : ActorMethod<[], string>,
  'fetchNnsDepositBalance' : ActorMethod<[Principal], bigint>,
  /**
   * / Batch: which of `authors` are blocked either way vs `viewer` (for feed filtering)
   */
  'filterBlockedAuthors' : ActorMethod<
    [Principal, Array<Principal>],
    Array<Principal>
  >,
  'getBannedUsers' : ActorMethod<[], Array<Principal>>,
  /**
   * / Principals that `user` has blocked
   */
  'getBlocked' : ActorMethod<[Principal], Array<Principal>>,
  /**
   * / Master-only: cycle balances for ice, messaging, and assets (separately).
   * / Update call (uses management canister for messaging + assets).
   */
  'getCanisterCycles' : ActorMethod<
    [],
    { 'ice' : bigint, 'messaging' : bigint, 'assets' : bigint }
  >,
  /**
   * / Fixed list of valid post categories
   */
  'getCategories' : ActorMethod<[], Array<string>>,
  /**
   * / Batch lookup: (postId, category) for each id
   */
  'getCategoriesForPosts' : ActorMethod<
    [Array<bigint>],
    Array<[bigint, string]>
  >,
  'getComments' : ActorMethod<[bigint], Array<Comment>>,
  'getEconomyConfig' : ActorMethod<
    [],
    {
      'postFeeEnabled' : boolean,
      'tier3Tokens' : bigint,
      'registrationBonusTokens' : bigint,
      'messageFeeEnabled' : boolean,
      'loveFeeEnabled' : boolean,
      'registrationFeeEnabled' : boolean,
      'postFeeE8s' : bigint,
      'messageFeeE8s' : bigint,
      'price1E8s' : bigint,
      'price2E8s' : bigint,
      'price3E8s' : bigint,
      'tipUnlockMinE8s' : bigint,
      'tier1Tokens' : bigint,
      'loveFeeE8s' : bigint,
      'tippingEnabled' : boolean,
      'tier2Tokens' : bigint,
      'paymentsEnabled' : boolean,
      'registrationFeeE8s' : bigint,
    }
  >,
  /**
   * / Categories the user follows (empty = none selected yet)
   */
  'getFollowedCategories' : ActorMethod<[Principal], Array<string>>,
  /**
   * / Main ICE feed (logged-in or same as public): never includes detached (network-private) authors.
   */
  'getHomeFeed' : ActorMethod<[bigint], Array<Post>>,
  /**
   * / Liquid ICP on ICE default account (treasury).
   */
  'getIceTreasuryIcpBalanceE8s' : ActorMethod<[], bigint>,
  'getLimits' : ActorMethod<[], Limits>,
  /**
   * / Public read — Lite servers and anyone may query current lock state.
   */
  'getLiteAdmin' : ActorMethod<[], LiteAdmin>,
  'getMasterContacts' : ActorMethod<[bigint], Array<MasterContact>>,
  'getMyIcpE8s' : ActorMethod<[], bigint>,
  /**
   * / Legacy name — returns prepaid ICP e8s (not soft tokens).
   */
  'getMyTokens' : ActorMethod<[], bigint>,
  /**
   * / Public: deposit destination for NNS-paid fees (registration / token packs).
   */
  'getNnsDepositInfo' : ActorMethod<
    [Principal],
    { 'owner' : Principal, 'note' : string, 'subaccountHex' : string }
  >,
  /**
   * / Latest notifications for the caller (newest first).
   */
  'getNotifications' : ActorMethod<[bigint], Array<Notification>>,
  'getOwner' : ActorMethod<[], Principal>,
  'getPost' : ActorMethod<[bigint], [] | [Post]>,
  /**
   * / Category for a single post (defaults to General for older posts)
   */
  'getPostCategory' : ActorMethod<[bigint], string>,
  /**
   * / Public author page: empty if author is detached (use getPostsByAuthorForViewer when logged in).
   */
  'getPostsByAuthor' : ActorMethod<[Principal, bigint], Array<Post>>,
  /**
   * / Author posts visible to caller: self or master if detached, or anyone if not detached.
   */
  'getPostsByAuthorForViewer' : ActorMethod<[Principal, bigint], Array<Post>>,
  /**
   * / Optional: who owns a username (for debugging / lookups).
   */
  'getPrincipalByUsername' : ActorMethod<[string], [] | [Principal]>,
  'getProfile' : ActorMethod<[Principal], [] | [UserProfile]>,
  /**
   * / Public / anonymous discovery: never includes posts from detached (network-private) authors.
   */
  'getRecentPosts' : ActorMethod<[bigint], Array<Post>>,
  'getRegistrationFeeE8s' : ActorMethod<[], bigint>,
  'getReportedPosts' : ActorMethod<[], Array<Post>>,
  'getSiteStats' : ActorMethod<[], SiteStats>,
  /**
   * / Legacy — returns message fee in e8s when enabled, else 0.
   */
  'getTokensPerMessage' : ActorMethod<[], bigint>,
  'getTreasuryStats' : ActorMethod<[], TreasuryStats>,
  'getUnreadMasterContactCount' : ActorMethod<[], bigint>,
  'getUnreadNotificationCount' : ActorMethod<[], bigint>,
  'getUserStats' : ActorMethod<
    [Principal],
    [] | [
      {
        'icpE8s' : bigint,
        'isFreeTier' : boolean,
        'tokens' : bigint,
        'postsToday' : bigint,
        'postsThisMonth' : bigint,
      }
    ]
  >,
  'hasLiked' : ActorMethod<[bigint, Principal], boolean>,
  'hasLoved' : ActorMethod<[bigint, Principal], boolean>,
  'hideLitePost' : ActorMethod<[string], LiteAdminWrite>,
  'isBanned' : ActorMethod<[Principal], boolean>,
  /**
   * / True if `me` has blocked `other` (caller-centric block list)
   */
  'isBlocked' : ActorMethod<[Principal, Principal], boolean>,
  'isCloaked' : ActorMethod<[], boolean>,
  /**
   * / True if either side has blocked the other (content isolation)
   */
  'isEitherBlocked' : ActorMethod<[Principal, Principal], boolean>,
  /**
   * / Whether the one-time Master Profile activation has already been used.
   */
  'isLiteAdminClaimed' : ActorMethod<[], boolean>,
  'isMessagingFree' : ActorMethod<[], boolean>,
  /**
   * / Factory mint: waive 10 ICP site fee for master only.
   */
  'isMintFeeWaived' : ActorMethod<[Principal], boolean>,
  'isOwner' : ActorMethod<[Principal], boolean>,
  'isOwnerVisible' : ActorMethod<[Principal], boolean>,
  'isPaymentsEnabled' : ActorMethod<[], boolean>,
  'isRegistered' : ActorMethod<[Principal], boolean>,
  'isRegistrationFeeEnabled' : ActorMethod<[], boolean>,
  'isTippingEnabled' : ActorMethod<[], boolean>,
  'isUserNetworkPrivate' : ActorMethod<[Principal], boolean>,
  /**
   * / true if no one holds this username, or the caller already owns it.
   */
  'isUsernameAvailable' : ActorMethod<[string], boolean>,
  'likePost' : ActorMethod<[bigint], boolean>,
  'lovePost' : ActorMethod<[bigint], boolean>,
  'makePost' : ActorMethod<[string, [] | [string], string], [] | [bigint]>,
  'markAllMasterContactsRead' : ActorMethod<[], string>,
  'markAllNotificationsRead' : ActorMethod<[], string>,
  'markMasterContactRead' : ActorMethod<[bigint], string>,
  'markNotificationRead' : ActorMethod<[bigint], string>,
  /**
   * / Register with unique username. Master never pays.
   */
  'register' : ActorMethod<[string, string, string], string>,
  'reportPost' : ActorMethod<[bigint], string>,
  'searchPosts' : ActorMethod<[string], Array<Post>>,
  'setCloak' : ActorMethod<[boolean], boolean>,
  'setFeedBridgeOpen' : ActorMethod<[boolean], LiteAdminWrite>,
  /**
   * / Save which categories the caller wants to follow for the feed filter
   */
  'setFollowedCategories' : ActorMethod<[Array<string>], string>,
  /**
   * / Save profile (registered users or master). Usernames are unique (case-insensitive).
   */
  'setProfile' : ActorMethod<[string, string, string], string>,
  'setSignupsOpen' : ActorMethod<[boolean], LiteAdminWrite>,
  /**
   * / Factory (or master): mark user posts as network-private after site detach; clear on reattach.
   */
  'setUserNetworkPrivate' : ActorMethod<[Principal, boolean], string>,
  /**
   * / Tip ICP when tipping is enabled. No unlock gate.
   */
  'tipIcp' : ActorMethod<[Principal, bigint], string>,
  /**
   * / Legacy name — same as tipIcp (amount in e8s).
   */
  'tipTokens' : ActorMethod<[Principal, bigint], string>,
  /**
   * / Master: move primary owner record (optional; trusted masters keep admin rights either way).
   */
  'transferMasterProfile' : ActorMethod<[Principal], string>,
  'unbanLiteHandle' : ActorMethod<[string], LiteAdminWrite>,
  'unblock' : ActorMethod<[Principal], string>,
  'unhideLitePost' : ActorMethod<[string], LiteAdminWrite>,
  /**
   * / Founder: permanently delete every legacy master-contact note (cycle / inbox cleanup).
   */
  'wipeAllMasterContacts' : ActorMethod<[], string>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
