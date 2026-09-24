import React, { useState, useEffect } from "react";
import { AuthClient } from "@dfinity/auth-client";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import {
  createIceActor,
  createMessagingActor,
  createFactoryActor,
  parsePublicSiteRoute,
  isPlatformHost,
  resolveSiteByHostname,
  ASSETS_CANISTER_ID,
} from "./actors";
import PostForm from "./PostForm";
import Feed from "./Feed";
import Subscribe from "./Subscribe";
import Profile from "./Profile";
import TokenBalance from "./TokenBalance";
import UserProfileView from "./UserProfileView";
import Messaging from "./Messaging";
import Register from "./Register";
import PublicLanding from "./PublicLanding";
import PublicSite from "./PublicSite";
import ReferralPage from "./ReferralPage";
import Associates from "./Associates";
import MySite from "./MySite";
import NotificationBell from "./NotificationBell";
import FirstLoginChecklist, {
  enrollFirstLogin,
  isFirstLoginIncomplete,
} from "./FirstLoginChecklist";
import AdminLite from "./AdminLite";
import SitePicker, { readPreferredSite, writePreferredSite } from "./SitePicker";
import PrincipalMigrationClaim from "./PrincipalMigrationClaim";
import InviteCard, { captureInviteRefFromUrl } from "./InviteCard";

function isAdminLiteHash() {
  try {
    const h = (window.location.hash || "").replace(/^#/, "");
    return h === "/admin/lite" || h === "admin/lite";
  } catch {
    return false;
  }
}

/** Dedicated referral dashboard — /referral or #/referral */
function isReferralRoute() {
  try {
    const path = (window.location.pathname || "").replace(/\/+$/, "") || "/";
    if (path === "/referral") return true;
    const h = (window.location.hash || "").replace(/^#/, "");
    return h === "/referral" || h === "referral";
  } catch {
    return false;
  }
}

function goReferralRoute() {
  try {
    if ((window.location.pathname || "").replace(/\/+$/, "") !== "/referral") {
      window.history.replaceState(null, "", "/referral");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Brand URL for humans; canister URL for II principal derivation.
 * Traffic redirects to https://frostedblocks.com — login uses derivationOrigin
 * = canister so principals match accounts created on icp0.io.
 */
const II_DERIVATION_ORIGIN = `https://${ASSETS_CANISTER_ID}.icp0.io`;
const MASTER_APP_URL = "https://frostedblocks.com/";
/** Standard II (what most ICP dapps use). */
const II_IDENTITY_PROVIDER = "https://identity.ic0.app";

function currentOrigin() {
  try {
    return window.location.origin;
  } catch {
    return "";
  }
}

/** Brand hosts pin II principals to the canister derivation origin. */
function loginDerivationOrigin() {
  const here = currentOrigin();
  if (!here || here === II_DERIVATION_ORIGIN) return undefined;
  if (
    here === "https://www.frostedblocks.com" ||
    here === "https://frostedblocks.com"
  ) {
    return II_DERIVATION_ORIGIN;
  }
  return undefined;
}

/**
 * Founder II principals (must match backend TRUSTED_MASTER_PRINCIPALS).
 * Used client-side so master never hits the Join wall even if a query glitches.
 */
const TRUSTED_MASTER_PRINCIPALS = new Set([
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe",
  /** Confirmed primary master II (assets / icp0.io derivation) */
  "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae",
  /** Same founder II on frostedblocks.com when derivationOrigin is not applied */
  "ogsk6-lwnep-oa422-nqvac-puciz-6fbaw-emuqb-xi6ay-ga75u-3e5rh-jae",
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae",
  "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae",
  /** Ops / dfx mynewdeploy recovery identity */
  "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe",
]);

const LOCAL_ID_KEY = "ice-local-ed25519-identity";
const isLocalNetwork = () => (import.meta.env.DFX_NETWORK || "local") !== "ic";

function principalText(principal) {
  try {
    return (principal?.toText?.() || String(principal || "")).trim();
  } catch {
    return "";
  }
}

function isTrustedMasterPrincipal(principal) {
  const t = principalText(principal);
  if (!t) return false;
  return TRUSTED_MASTER_PRINCIPALS.has(t);
}

function loadOrCreateLocalIdentity() {
  const stored = localStorage.getItem(LOCAL_ID_KEY);
  if (stored) {
    try {
      return Ed25519KeyIdentity.fromJSON(stored);
    } catch {
      localStorage.removeItem(LOCAL_ID_KEY);
    }
  }
  const identity = Ed25519KeyIdentity.generate();
  localStorage.setItem(LOCAL_ID_KEY, JSON.stringify(identity.toJSON()));
  return identity;
}

const NAV = [
  { id: "feed", label: "Feed" },
  { id: "messages", label: "Messages" },
  { id: "associates", label: "Network" },
  { id: "mysite", label: "My Site" },
  { id: "profile", label: "Profile" },
  { id: "subscribe", label: "ICP" },
];

export default function App() {
  const [authClient, setAuthClient] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [actor, setActor] = useState(null);
  const [messagingActor, setMessagingActor] = useState(null);
  const [view, setView] = useState(() => (isAdminLiteHash() ? "admin-lite" : "feed"));
  const [viewingPrincipal, setViewingPrincipal] = useState(null);
  const [bootError, setBootError] = useState("");
  const [booting, setBooting] = useState(true);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [registered, setRegistered] = useState(null);
  /** True when canister reports isOwner/isMaster for this II (covers owner claim beyond hardcoded list). */
  const [canisterMaster, setCanisterMaster] = useState(false);
  /** Unregistered users may browse after II login; paid join/register required to use the network */
  const [showJoin, setShowJoin] = useState(false);
  /** II-only referral: stay on landing with invite link — do not enter ICE Join/app. */
  const [referralOnly, setReferralOnly] = useState(false);
  const [referralActor, setReferralActor] = useState(null);
  const [publicSiteRoute, setPublicSiteRoute] = useState(() => parsePublicSiteRoute());
  const [hostSiteId, setHostSiteId] = useState(null);
  const [hostResolving, setHostResolving] = useState(() => !isPlatformHost());
  /** Multi-site: owned factory sites + active selection for My Site */
  const [ownedSites, setOwnedSites] = useState([]);
  const [activeSiteId, setActiveSiteId] = useState(null);
  const [showSitePicker, setShowSitePicker] = useState(false);

  useEffect(() => {
    captureInviteRefFromUrl();
  }, []);

  useEffect(() => {
    const sync = () => {
      setPublicSiteRoute(parsePublicSiteRoute());
      if (isAdminLiteHash()) setView("admin-lite");
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  // After II login / reload, restore hidden Lite admin if the hash is present.
  useEffect(() => {
    if (identity && isAdminLiteHash()) setView("admin-lite");
  }, [identity]);

  // Canister / www → brand apex (backup if index.html redirect missed).
  useEffect(() => {
    try {
      const h = (window.location.hostname || "").toLowerCase();
      const path =
        window.location.pathname + window.location.search + window.location.hash;
      if (h === "www.frostedblocks.com") {
        window.location.replace("https://frostedblocks.com" + path);
        return;
      }
      if (
        h === `${ASSETS_CANISTER_ID}.icp0.io` ||
        h === `${ASSETS_CANISTER_ID}.ic0.app` ||
        h === `${ASSETS_CANISTER_ID}.raw.icp0.io`
      ) {
        window.location.replace("https://frostedblocks.com" + path);
      }
    } catch (_) {
      /* ignore */
    }
  }, []);

  // Custom domain → factory lookup → public personal site
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isPlatformHost()) {
        setHostSiteId(null);
        setHostResolving(false);
        return;
      }
      setHostResolving(true);
      const siteId = await resolveSiteByHostname();
      if (!cancelled) {
        setHostSiteId(siteId);
        setHostResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Race a promise against a timeout; on timeout return `fallback`. */
  /**
   * Join ICE only for brand-new IIs.
   * Anyone already known on-chain (or trusted master) skips Join forever.
   * @returns {{ registered: boolean, isMaster: boolean }}
   */
  const checkRegistered = async (mainActor, id) => {
    if (!mainActor || !id) {
      setRegistered(false);
      setCanisterMaster(false);
      return { registered: false, isMaster: false };
    }
    const p = id.getPrincipal();
    const pt = p.toText();
    console.info("[ICE] login principal:", pt);

    // Hardcoded founder principals: always in
    if (isTrustedMasterPrincipal(p)) {
      setCanisterMaster(true);
      setRegistered(true);
      setShowJoin(false);
      return { registered: true, isMaster: true };
    }

    try {
      // On-chain master/owner (claimMaster or trusted list on canister)
      if (mainActor.isOwner) {
        const ownerFlag = !!(await mainActor.isOwner(p));
        setCanisterMaster(ownerFlag);
        if (ownerFlag) {
          setRegistered(true);
          setShowJoin(false);
          return { registered: true, isMaster: true };
        }
      } else {
        setCanisterMaster(false);
      }

      // Single source of truth after backend migration
      if (mainActor.isRegistered) {
        const ok = await mainActor.isRegistered(p);
        if (ok) {
          setRegistered(true);
          setShowJoin(false);
          return { registered: true, isMaster: false };
        }
      }
      // Fallback: profile exists
      if (mainActor.getProfile) {
        const profRaw = await mainActor.getProfile(p);
        const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw;
        if (prof) {
          setRegistered(true);
          setShowJoin(false);
          return { registered: true, isMaster: false };
        }
      }
      // Truly new II — show Join once
      setRegistered(false);
      return { registered: false, isMaster: false };
    } catch (err) {
      console.error(err);
      // Do not force Join on network errors
      setRegistered(true);
      setShowJoin(false);
      return { registered: true, isMaster: false };
    }
  };

  /** @returns {{ registered: boolean, isMaster: boolean }} */
  const connectActors = async (id) => {
    setBootError("");
    // Never flash "Join" for known master while loading
    if (id && isTrustedMasterPrincipal(id.getPrincipal())) {
      setCanisterMaster(true);
      setRegistered(true);
      setShowJoin(false);
    } else {
      setCanisterMaster(false);
      setRegistered(null);
    }
    try {
      const [main, msg] = await Promise.all([
        createIceActor(id),
        createMessagingActor(id),
      ]);
      setActor(main);
      setMessagingActor(msg);
      return await checkRegistered(main, id);
    } catch (err) {
      console.error(err);
      setBootError(err.message || "Could not connect to canisters.");
      setActor(null);
      setMessagingActor(null);
      // Master still gets full app if canister call fails
      if (id && isTrustedMasterPrincipal(id.getPrincipal())) {
        setCanisterMaster(true);
        setRegistered(true);
        setShowJoin(false);
        return { registered: true, isMaster: true };
      }
      setRegistered(false);
      return { registered: false, isMaster: false };
    }
  };

  useEffect(() => {
    (async () => {
      if (isLocalNetwork()) {
        const stored = localStorage.getItem(LOCAL_ID_KEY);
        if (stored) {
          try {
            const id = Ed25519KeyIdentity.fromJSON(stored);
            setIdentity(id);
            if (isTrustedMasterPrincipal(id.getPrincipal())) {
              setRegistered(true);
              setShowJoin(false);
            }
            await connectActors(id);
            await resolveOwnedSites(id);
          } catch {
            localStorage.removeItem(LOCAL_ID_KEY);
          }
        }
        setBooting(false);
        return;
      }

      const client = await AuthClient.create();
      setAuthClient(client);
      if (await client.isAuthenticated()) {
        const id = client.getIdentity();
        let referralIntent = false;
        try {
          referralIntent = sessionStorage.getItem("ice-referral-signup") === "1";
        } catch {
          referralIntent = false;
        }
        if (referralIntent || isReferralRoute()) {
          // Referral dashboard — do not enter ICE app
          setIdentity(id);
          setReferralOnly(true);
          setShowJoin(false);
          try {
            sessionStorage.setItem("ice-referral-signup", "1");
          } catch {
            /* ignore */
          }
          goReferralRoute();
          try {
            setReferralActor(await createIceActor(id));
          } catch {
            setReferralActor(null);
          }
        } else {
          setIdentity(id);
          // Instant bypass for founder principals (before async checks finish)
          if (isTrustedMasterPrincipal(id.getPrincipal())) {
            setRegistered(true);
            setShowJoin(false);
          }
          await connectActors(id);
          await resolveOwnedSites(id);
        }
      }
      setBooting(false);
    })();
  }, []);

  /**
   * After login: load owned sites; auto-pick one, or show picker if 2+.
   */
  const resolveOwnedSites = async (id) => {
    if (!id) {
      setOwnedSites([]);
      setActiveSiteId(null);
      setShowSitePicker(false);
      return;
    }
    const pt = principalText(id.getPrincipal());
    try {
      const factory = await createFactoryActor(id);
      let sites = [];
      if (factory.listMySites) {
        const raw = await factory.listMySites();
        sites = (raw || []).map((p) => (p?.toText ? p.toText() : String(p)));
      } else if (factory.getUserCanister) {
        const opt = await factory.getUserCanister(id.getPrincipal());
        const one = Array.isArray(opt) ? opt[0] : opt;
        if (one) sites = [one.toText ? one.toText() : String(one)];
      }
      setOwnedSites(sites);
      if (sites.length === 0) {
        setActiveSiteId(null);
        setShowSitePicker(false);
        return;
      }
      if (sites.length === 1) {
        setActiveSiteId(sites[0]);
        writePreferredSite(pt, sites[0]);
        setShowSitePicker(false);
        if (factory.setPreferredSite) {
          try {
            const { Principal } = await import("@dfinity/principal");
            await factory.setPreferredSite(Principal.fromText(sites[0]));
          } catch (_) {
            /* optional */
          }
        }
        return;
      }
      // 2+: show picker every login (pre-select last used)
      const pref = readPreferredSite(pt);
      setActiveSiteId(pref && sites.includes(pref) ? pref : sites[0]);
      setShowSitePicker(true);
    } catch (e) {
      console.error("[ICE] resolveOwnedSites", e);
      setOwnedSites([]);
      setShowSitePicker(false);
    }
  };

  const applySiteSelection = async (siteIdText) => {
    if (!identity || !siteIdText) return;
    const pt = principalText(identity.getPrincipal());
    setActiveSiteId(siteIdText);
    writePreferredSite(pt, siteIdText);
    setShowSitePicker(false);
    try {
      const factory = await createFactoryActor(identity);
      if (factory.setPreferredSite) {
        const { Principal } = await import("@dfinity/principal");
        await factory.setPreferredSite(Principal.fromText(siteIdText));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loginLocal = async () => {
    const id = loadOrCreateLocalIdentity();
    setIdentity(id);
    await connectActors(id);
    await resolveOwnedSites(id);
  };

  /**
   * Internet Identity login — same pattern as typical ICP dapps:
   * AuthClient + identity.ic0.app → keep session → connect actors.
   * derivationOrigin only on custom domains (www/apex), never on *.icp0.io itself.
   */
  const login = async () => {
    if (isLocalNetwork()) {
      await loginLocal();
      return;
    }
    if (!authClient) {
      setBootError("Login not ready yet — wait a second and try again.");
      return;
    }

    setBootError("");

    const derivationOrigin = loginDerivationOrigin();
    const loginOpts = {
      identityProvider: II_IDENTITY_PROVIDER,
      maxTimeToLive: BigInt(7) * BigInt(24) * BigInt(60) * BigInt(60) * BigInt(1_000_000_000),
      windowOpenerFeatures:
        "toolbar=0,location=0,menubar=0,width=525,height=705,left=200,top=100",
      onSuccess: async () => {
        try {
          const id = authClient.getIdentity();
          if (!id || id.getPrincipal().isAnonymous()) {
            setBootError("Login produced an anonymous identity. Try again.");
            return;
          }
          const pt = id.getPrincipal().toText();
          console.info("[ICE] II principal after login:", pt);
          console.info("[ICE] page origin:", currentOrigin());
          console.info("[ICE] derivationOrigin used:", derivationOrigin || "(none — native origin)");

          let referralIntent = false;
          try {
            referralIntent = sessionStorage.getItem("ice-referral-signup") === "1";
          } catch {
            referralIntent = false;
          }

          // Referral program: II only — open /referral dashboard (not ICE Join/app).
          if (referralIntent || isReferralRoute()) {
            setIdentity(id);
            setReferralOnly(true);
            setShowJoin(false);
            setRegistered(null);
            setCanisterMaster(false);
            try {
              sessionStorage.setItem("ice-referral-signup", "1");
            } catch {
              /* ignore */
            }
            goReferralRoute();
            try {
              const refActor = await createIceActor(id);
              setReferralActor(refActor);
            } catch (e) {
              console.warn("[ICE] referral actor optional", e);
              setReferralActor(null);
            }
            setBootError("");
            return;
          }

          setIdentity(id);
          setReferralOnly(false);
          setReferralActor(null);
          setShowJoin(false);
          if (isTrustedMasterPrincipal(id.getPrincipal())) {
            setCanisterMaster(true);
            setRegistered(true);
          }

          const status = await connectActors(id);
          // Existing member → app. Brand-new II → Join screen (session kept).
          if (!status.registered && !status.isMaster) {
            setShowJoin(true);
          } else {
            setShowJoin(false);
          }
          await resolveOwnedSites(id);
          setBootError("");
        } catch (e) {
          console.error(e);
          setBootError(e?.message || "Logged in, but failed to connect to ICE.");
        }
      },
      onError: (err) => {
        console.error(err);
        const msg =
          typeof err === "string"
            ? err
            : err?.message || String(err || "Login cancelled or failed");
        if (/popup|blocked|closed/i.test(msg)) {
          setBootError(
            "Login popup was blocked or closed. Allow popups for this site, then try again."
          );
        } else if (/derivation|alternative.origin/i.test(msg)) {
          setBootError(
            `Shared-login setup failed (${msg}). Use ${MASTER_APP_URL} (canister URL) instead.`
          );
        } else {
          setBootError(`Sign in failed (${msg}).`);
        }
      },
    };
    if (derivationOrigin) {
      loginOpts.derivationOrigin = derivationOrigin;
    }

    try {
      await authClient.login(loginOpts);
    } catch (e) {
      console.error(e);
      setBootError(e?.message || "Could not open sign-in. Allow popups and try again.");
    }
  };

  const loginSignIn = () => {
    try {
      sessionStorage.removeItem("ice-referral-signup");
    } catch {
      /* ignore */
    }
    setReferralOnly(false);
    setReferralActor(null);
    login();
  };
  const loginJoin = () => {
    try {
      sessionStorage.removeItem("ice-referral-signup");
    } catch {
      /* ignore */
    }
    setReferralOnly(false);
    setReferralActor(null);
    login();
  };
  /** Landing / /referral: II only — open referral dashboard, no ICE Join/app. */
  const loginReferral = () => {
    try {
      sessionStorage.setItem("ice-referral-signup", "1");
    } catch {
      /* ignore */
    }
    setShowJoin(false);
    goReferralRoute();
    login();
  };

  /** Leave referral-only mode; drop II session so they are not signed into ICE. */
  const finishReferralOnly = async () => {
    try {
      sessionStorage.removeItem("ice-referral-signup");
    } catch {
      /* ignore */
    }
    setReferralOnly(false);
    setReferralActor(null);
    await logout();
  };

  /** From referral page: leave /referral and open ICE Join (optional paid path). */
  const referralToJoin = async () => {
    try {
      sessionStorage.removeItem("ice-referral-signup");
    } catch {
      /* ignore */
    }
    setReferralOnly(false);
    setReferralActor(null);
    try {
      window.history.replaceState(null, "", "/");
    } catch {
      /* ignore */
    }
    if (!identity) {
      login();
      return;
    }
    try {
      const status = await connectActors(identity);
      if (!status.registered && !status.isMaster) {
        setShowJoin(true);
      } else {
        setShowJoin(false);
      }
      await resolveOwnedSites(identity);
    } catch (e) {
      console.error(e);
      setShowJoin(true);
    }
  };

  const logout = async () => {
    if (!isLocalNetwork() && authClient) {
      try {
        await authClient.logout();
      } catch (_) {
        /* ignore */
      }
    }
    setIdentity(null);
    setActor(null);
    setMessagingActor(null);
    setRegistered(null);
    setCanisterMaster(false);
    setReferralOnly(false);
    setReferralActor(null);
    try {
      sessionStorage.removeItem("ice-referral-signup");
    } catch {
      /* ignore */
    }
    setView("feed");
    setViewingPrincipal(null);
  };

  const resetLocalIdentity = async () => {
    localStorage.removeItem(LOCAL_ID_KEY);
    setIdentity(null);
    setActor(null);
    setMessagingActor(null);
    setRegistered(null);
    setCanisterMaster(false);
    setView("feed");
  };

  const openUserProfile = (principal) => {
    setViewingPrincipal(principal);
    setView("user");
  };

  const goFeed = () => {
    setView("feed");
    setViewingPrincipal(null);
  };

  const navigate = (id) => {
    setViewingPrincipal(null);
    setView(id);
  };

  // CRITICAL: master never sees Join — hardcoded list OR on-chain isOwner
  const loginPrincipal = identity?.getPrincipal?.() || null;
  const isMasterSession = !!(
    loginPrincipal &&
    (isTrustedMasterPrincipal(loginPrincipal) || canisterMaster)
  );
  const accountReady = registered === true || isMasterSession;

  // Personal custom domains only (frostedblocks + icp0.io are main app — see isPlatformHost)
  if (hostResolving && !isPlatformHost()) {
    return (
      <div className="ice-app">
        <div className="ice-loading">Loading site for this domain…</div>
      </div>
    );
  }

  if (hostSiteId && !isPlatformHost()) {
    const pageFromHash = publicSiteRoute?.pageId || null;
    return (
      <PublicSite
        siteId={hostSiteId}
        initialPage={pageFromHash}
        customDomainMode
        onLeave={() => {
          window.location.href = "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/";
        }}
      />
    );
  }

  // Hash / query personal websites — no login required
  if (publicSiteRoute?.siteId) {
    return (
      <PublicSite
        siteId={publicSiteRoute.siteId}
        initialPage={publicSiteRoute.pageId}
        onLeave={() => {
          try {
            window.history.replaceState(null, "", window.location.pathname);
          } catch (_) {
            window.location.hash = "";
          }
          setPublicSiteRoute(null);
        }}
      />
    );
  }

  // Unknown personal domain (not brand / not icp0) — only block if not main app host
  if (!isPlatformHost() && !hostSiteId && !hostResolving) {
    return (
      <div className="ice-app">
        <div className="ice-app-inner" style={{ paddingTop: "2.5rem" }}>
          <div className="ice-glass" style={{ padding: "1.5rem" }}>
            <h1 className="ice-title" style={{ marginTop: 0, fontSize: "1.25rem" }}>
              Domain not linked
            </h1>
            <p style={{ color: "#94a3b8", lineHeight: 1.55 }}>
              <strong style={{ color: "#e2e8f0" }}>{window.location.hostname}</strong> is not
              registered to an ICE personal site yet.
            </p>
            <a
              href="https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/"
              className="ice-btn-primary"
              style={{ display: "inline-block", textDecoration: "none", marginTop: "0.5rem" }}
            >
              Open ICE
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (booting) {
    return (
      <div className="ice-app">
        <div className="ice-loading">Starting ICE…</div>
      </div>
    );
  }

  // Dedicated referral dashboard (bookmark https://frostedblocks.com/referral)
  if (referralOnly || isReferralRoute()) {
    return (
      <ReferralPage
        identity={identity}
        actor={referralActor}
        onSignIn={loginReferral}
        onDone={finishReferralOnly}
        onJoinIce={referralToJoin}
        bootError={bootError}
        isLocal={isLocalNetwork()}
      />
    );
  }

  if (!identity) {
    return (
      <>
        {bootError && (
          <div
            className="ice-alert-error"
            style={{
              position: "fixed",
              top: "1rem",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 50,
              maxWidth: "32rem",
              width: "calc(100% - 2rem)",
              marginBottom: 0,
            }}
          >
            <strong>Sign in</strong>
            <div style={{ marginTop: "0.35rem" }}>{bootError}</div>
            <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#fca5a5" }}>
              Correct app URL: https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/ (must include the{" "}
              <strong>h</strong> in https)
            </div>
          </div>
        )}
        <PublicLanding
          onJoin={loginJoin}
          onLogin={loginSignIn}
          onReferralSignup={loginReferral}
          isLocal={isLocalNetwork()}
        />
      </>
    );
  }

  const activeNav = view === "user" ? "feed" : view;
  const wide =
    view === "mysite" || view === "messages" || view === "associates" || view === "profile";

  return (
    <div className="ice-app">
      <div className="ice-app-orbs" aria-hidden="true">
        <span className="o1" />
        <span className="o2" />
        <span className="o3" />
      </div>
      <div className={`ice-app-inner${wide ? " ice-wide" : ""}`}>
        <header className="ice-shell-header">
          <div className="ice-shell-row">
            <div className="ice-brand-wrap">
              <button
                type="button"
                className="ice-brand-mark"
                onClick={goFeed}
                aria-label="ICE home"
                style={{ border: "none", cursor: "pointer", padding: 0 }}
              >
                ICE
              </button>
              <div className="ice-brand-meta">
                <h1 className="ice-brand" onClick={goFeed} style={{ fontSize: "1.2rem" }}>
                  ICE
                </h1>
                <span className="ice-brand-sub">Network</span>
              </div>
            </div>

            {accountReady && (
              <nav className="ice-nav" aria-label="Main">
                {NAV.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ice-nav-btn${activeNav === item.id ? " is-active" : ""}`}
                    onClick={() => navigate(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            )}

            <div className="ice-header-actions">
              {!accountReady && !showJoin && !isMasterSession && !identity && (
                <button
                  type="button"
                  className="ice-btn-primary"
                  onClick={() => setShowJoin(true)}
                  style={{ fontSize: "0.85rem", padding: "0.4rem 0.9rem" }}
                >
                  Create your account
                </button>
              )}
              {!accountReady && !showJoin && !isMasterSession && identity && (
                <button
                  type="button"
                  className="ice-btn-primary"
                  onClick={() => setShowJoin(true)}
                  style={{ fontSize: "0.85rem", padding: "0.4rem 0.9rem" }}
                >
                  Create your account
                </button>
              )}
              {accountReady && (
                <NotificationBell actor={actor} enabled={!!accountReady && !!actor} />
              )}
              {accountReady && (
                <TokenBalance
                  actor={actor}
                  principal={identity.getPrincipal()}
                  refreshKey={balanceRefreshKey}
                />
              )}
              <button type="button" onClick={logout} className="ice-btn">
                Log out
              </button>
              {isLocalNetwork() && (
                <button
                  type="button"
                  onClick={resetLocalIdentity}
                  className="ice-btn"
                  title="New local identity"
                >
                  New ID
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="ice-main">
          {bootError && (
            <div className="ice-alert-error">
              <strong>Connection issue</strong>
              <div style={{ marginTop: "0.35rem" }}>{bootError}</div>
            </div>
          )}

          {registered === null && !isMasterSession ? (
            <div className="ice-loading">Checking account…</div>
          ) : !accountReady && showJoin ? (
            <Register
              actor={actor}
              identity={identity}
              onRegistered={(info) => {
                setRegistered(true);
                setBalanceRefreshKey((k) => k + 1);
                // Only leave Join screen when site is ready (or free browse later)
                if (info?.siteError) {
                  // Stay on Join UI so user can "Retry website only" without re-paying
                  setShowJoin(true);
                  return;
                }
                setShowJoin(false);
                const p = identity?.getPrincipal?.();
                if (p) enrollFirstLogin(p, { usernameDone: true });
                // Checklist needs Home; My Site stays in nav
                if (p && isFirstLoginIncomplete(p)) {
                  setView("feed");
                } else {
                  setView(info?.siteId ? "mysite" : "feed");
                }
              }}
              onCancel={() => setShowJoin(false)}
            />
          ) : !accountReady ? (
            <>
              <div
                className="ice-glass"
                style={{
                  padding: "1rem 1.1rem",
                  marginBottom: "1rem",
                  border: "1px solid rgba(251, 191, 36, 0.35)",
                }}
              >
                <p style={{ margin: "0 0 0.5rem", fontWeight: 700, color: "#fde68a" }}>
                  Signed in, but this II is not linked to an ICE account yet
                </p>
                <p style={{ margin: "0 0 0.45rem", fontSize: "0.82rem", color: "#94a3b8" }}>
                  Principal:{" "}
                  <code style={{ color: "#e2e8f0", wordBreak: "break-all" }}>
                    {principalText(identity.getPrincipal())}
                  </code>
                </p>
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.45 }}>
                  If you <strong style={{ color: "#e2e8f0" }}>already Joined ICE</strong>, do{" "}
                  <em>not</em> Create account again. Prefer the canonical app URL, or recover your
                  website with an <code>ICE-RCV-</code> recovery code (My Site → Transfer, or paste
                  below).
                </p>
                <div style={{ marginBottom: "0.75rem" }}>
                  <input
                    id="ice-recovery-inline"
                    placeholder="ICE-RCV-… recovery code"
                    style={{
                      width: "100%",
                      marginBottom: "0.45rem",
                      padding: "0.5rem 0.65rem",
                      borderRadius: 8,
                      border: "1px solid rgba(148,163,184,0.25)",
                      background: "rgba(9,9,11,0.7)",
                      color: "#e2e8f0",
                    }}
                  />
                  <button
                    type="button"
                    className="ice-btn"
                    onClick={async () => {
                      const el = document.getElementById("ice-recovery-inline");
                      const code = (el && el.value ? el.value : "").trim();
                      if (!code.startsWith("ICE-RCV")) {
                        setBootError("Enter a recovery code starting with ICE-RCV-");
                        return;
                      }
                      try {
                        const factory = await createFactoryActor(identity);
                        const result = await factory.claimSiteWithRecoveryCode(code);
                        if (result?.err) {
                          setBootError(result.err);
                          return;
                        }
                        setBootError("");
                        setRegistered(true);
                        setShowJoin(false);
                        await connectActors(identity);
                        await resolveOwnedSites(identity);
                        setView("mysite");
                      } catch (e) {
                        setBootError(e?.message || "Recovery failed");
                      }
                    }}
                  >
                    Recover website with code
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <a
                    href={MASTER_APP_URL}
                    className="ice-btn-primary"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Open canonical app
                  </a>
                  <button type="button" className="ice-btn" onClick={() => setShowJoin(true)}>
                    Create your account
                  </button>
                  <button type="button" className="ice-btn" onClick={logout}>
                    Log out
                  </button>
                </div>
              </div>
              <Feed
                actor={actor}
                currentUserPrincipal={identity.getPrincipal()}
                onUserClick={openUserProfile}
                refreshKey={feedRefreshKey}
              />
            </>
          ) : view === "admin-lite" ? (
            <AdminLite
              actor={actor}
              identity={identity}
              onBack={() => {
                try {
                  window.location.hash = "";
                } catch (_) {
                  /* ignore */
                }
                goFeed();
              }}
            />
          ) : view === "subscribe" ? (
            <Subscribe
              actor={actor}
              identity={identity}
              principal={identity.getPrincipal()}
              onSuccess={() => setBalanceRefreshKey((k) => k + 1)}
            />
          ) : view === "profile" ? (
            <>
              <InviteCard actor={actor} identity={identity} />
              <Profile actor={actor} identity={identity} />
            </>
          ) : view === "associates" ? (
            <Associates
              actor={actor}
              identity={identity}
              onUserClick={openUserProfile}
              onBack={goFeed}
            />
          ) : view === "mysite" ? (
            <MySite
              identity={identity}
              activeSiteId={activeSiteId}
              ownedSites={ownedSites}
              onActiveSiteChange={applySiteSelection}
              onSitesChanged={async () => {
                if (identity) await resolveOwnedSites(identity);
              }}
              onBack={goFeed}
            />
          ) : view === "messages" ? (
            <Messaging
              mainActor={actor}
              messagingActor={messagingActor}
              identity={identity}
              onBack={goFeed}
              onTokensChanged={() => setBalanceRefreshKey((k) => k + 1)}
            />
          ) : view === "user" && viewingPrincipal ? (
            <UserProfileView
              actor={actor}
              identity={identity}
              principal={viewingPrincipal}
              currentUserPrincipal={identity.getPrincipal()}
              onBack={goFeed}
              onUserClick={openUserProfile}
              onIcpChanged={() => setBalanceRefreshKey((k) => k + 1)}
            />
          ) : (
            <div className="ice-feed-layout">
              <div className="ice-page-header">
                <div>
                  <h2>Home</h2>
                  <p className="ice-page-desc">
                    Share posts, explore the feed, and connect.
                  </p>
                </div>
              </div>
              <div className="ice-composer-wrap">
                <PostForm
                  actor={actor}
                  principal={identity.getPrincipal()}
                  siteCanisterId={activeSiteId}
                  onPostCreated={() => {
                    setFeedRefreshKey((k) => k + 1);
                    setBalanceRefreshKey((k) => k + 1);
                  }}
                />
              </div>
              <hr className="ice-hr" />
              <Feed
                actor={actor}
                currentUserPrincipal={identity.getPrincipal()}
                onUserClick={openUserProfile}
                refreshKey={feedRefreshKey}
              />
            </div>
          )}
        </main>
      </div>

      {accountReady && actor && identity && !isMasterSession && (
        <FirstLoginChecklist
          actor={actor}
          identity={identity}
          enabled={!!accountReady && !showJoin}
          onGoHome={goFeed}
          onFeedRefresh={() => {
            setFeedRefreshKey((k) => k + 1);
            setBalanceRefreshKey((k) => k + 1);
          }}
        />
      )}

      {showSitePicker && ownedSites.length > 1 && identity && (
        <SitePicker
          sites={ownedSites}
          principalText={principalText(identity.getPrincipal())}
          onSelect={(siteId) => applySiteSelection(siteId)}
          onSkip={() => setShowSitePicker(false)}
        />
      )}

      {identity && !isMasterSession && (
        <PrincipalMigrationClaim
          identity={identity}
          actor={actor}
          isMaster={isMasterSession}
          ownedSites={ownedSites}
          onDone={async () => {
            setRegistered(true);
            setShowJoin(false);
            setBootError("");
            await connectActors(identity);
            await resolveOwnedSites(identity);
            setView("mysite");
          }}
        />
      )}
    </div>
  );
}
