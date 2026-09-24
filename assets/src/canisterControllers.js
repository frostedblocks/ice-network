import { HttpAgent } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";

/** Well-known principals */
export const NNS_CONTROLLER = "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae";
/** Ops dfx identity — included in default controller set. */
export const DFX_CONTROLLER = "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe";
export const FACTORY_CONTROLLER = "xfwx3-7yaaa-aaaas-qgxpq-cai";

async function makeAgent(identity) {
  const network = import.meta.env.DFX_NETWORK || import.meta.env.VITE_DFX_NETWORK || "local";
  const host = network === "ic" ? "https://icp-api.io" : "http://127.0.0.1:4943";
  const agent = await HttpAgent.create({ host, identity });
  if (network !== "ic") await agent.fetchRootKey();
  return agent;
}

/**
 * Set controllers. Caller identity MUST already be a controller.
 * Always keeps the caller + factory in the list so recovery is not locked out.
 */
export async function setSiteControllers(identity, siteCanisterId, controllerTexts) {
  if (!identity) throw new Error("Not logged in");
  if (!siteCanisterId) throw new Error("Missing site canister id");

  const me = identity.getPrincipal();
  const site =
    typeof siteCanisterId === "string"
      ? Principal.fromText(siteCanisterId)
      : siteCanisterId;

  const list = [];
  const seen = new Set();
  const add = (text) => {
    const t = String(text || "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    list.push(Principal.fromText(t));
  };

  add(me.toText());
  add(FACTORY_CONTROLLER); // invariant: factory always retained
  for (const c of controllerTexts || []) add(c);

  if (list.length === 0) throw new Error("No controllers");

  const agent = await makeAgent(identity);

  const settingsType = IDL.Record({
    controllers: IDL.Opt(IDL.Vec(IDL.Principal)),
    compute_allocation: IDL.Opt(IDL.Nat),
    memory_allocation: IDL.Opt(IDL.Nat),
    freezing_threshold: IDL.Opt(IDL.Nat),
    reserved_cycles_limit: IDL.Opt(IDL.Nat),
    log_visibility: IDL.Opt(
      IDL.Variant({ controllers: IDL.Null, public: IDL.Null })
    ),
    wasm_memory_limit: IDL.Opt(IDL.Nat),
  });
  const argsType = IDL.Record({
    canister_id: IDL.Principal,
    settings: settingsType,
    sender_canister_version: IDL.Opt(IDL.Nat64),
  });

  const arg = IDL.encode(
    [argsType],
    [
      {
        canister_id: site,
        settings: {
          controllers: [list],
          compute_allocation: [],
          memory_allocation: [],
          freezing_threshold: [],
          reserved_cycles_limit: [],
          log_visibility: [],
          wasm_memory_limit: [],
        },
        sender_canister_version: [],
      },
    ]
  );

  const result = await agent.call("aaaaa-aa", {
    methodName: "update_settings",
    arg,
    effectiveCanisterId: site,
  });

  if (result?.requestId && agent.waitForResponse) {
    await agent.waitForResponse(result.requestId);
  } else if (result?.requestId) {
    const { pollForResponse, strategy } = await import("@dfinity/agent");
    try {
      await pollForResponse(agent, site, result.requestId, strategy.defaultStrategy());
    } catch (_) {
      /* ok */
    }
  }

  return list.map((p) => p.toText());
}

/**
 * Production default controller set: owner + NNS founder + dfx + factory.
 */
export function standardControllerList(userPrincipalText, nnsPrincipalText, includeOpsDfx = true) {
  const out = [userPrincipalText, NNS_CONTROLLER, FACTORY_CONTROLLER];
  if (includeOpsDfx) out.push(DFX_CONTROLLER);
  if (nnsPrincipalText && nnsPrincipalText.trim() && nnsPrincipalText.trim() !== NNS_CONTROLLER) {
    out.push(nnsPrincipalText.trim());
  }
  return [...new Set(out.filter(Boolean))];
}

export const CONTROLLER_ROLE_HELP = [
  { id: "owner", label: "You (ICE login)", hint: "Site owner — full control" },
  { id: "nns", label: "NNS founder", hint: "Visibility under NNS + founder recovery" },
  { id: "dfx", label: "dfx ops", hint: "Deploy identity — included by default" },
  { id: "factory", label: "Factory", hint: "Required for reset / upgrade / relink — always kept" },
];

/**
 * Read controllers via management canister_status.
 * Succeeds only if `identity` is already a controller of the site.
 * @returns {Promise<string[]|null>} principal texts, or null if unreadable / not a controller
 */
export async function fetchSiteControllers(identity, siteCanisterId) {
  if (!identity || !siteCanisterId) return null;
  try {
    const site =
      typeof siteCanisterId === "string"
        ? Principal.fromText(siteCanisterId)
        : siteCanisterId;
    const agent = await makeAgent(identity);
    const arg = IDL.encode(
      [IDL.Record({ canister_id: IDL.Principal })],
      [{ canister_id: site }]
    );
    const raw = await agent.call("aaaaa-aa", {
      methodName: "canister_status",
      arg,
      effectiveCanisterId: site,
    });

    let bytes = raw;
    if (raw?.requestId) {
      const { pollForResponse, strategy } = await import("@dfinity/agent");
      bytes = await pollForResponse(
        agent,
        Principal.fromText("aaaaa-aa"),
        raw.requestId,
        strategy.defaultStrategy()
      );
    }

    const statusType = IDL.Record({
      status: IDL.Variant({
        running: IDL.Null,
        stopping: IDL.Null,
        stopped: IDL.Null,
      }),
      settings: IDL.Record({
        controllers: IDL.Vec(IDL.Principal),
        compute_allocation: IDL.Nat,
        memory_allocation: IDL.Nat,
        freezing_threshold: IDL.Nat,
        reserved_cycles_limit: IDL.Opt(IDL.Nat),
        log_visibility: IDL.Opt(
          IDL.Variant({ controllers: IDL.Null, public: IDL.Null })
        ),
        wasm_memory_limit: IDL.Opt(IDL.Nat),
      }),
      module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
      memory_size: IDL.Nat,
      cycles: IDL.Nat,
      idle_cycles_burned_per_day: IDL.Opt(IDL.Nat),
      query_stats: IDL.Opt(IDL.Record({})),
    });

    // Response may be wrapped; try decode flexibly
    let decoded;
    try {
      decoded = IDL.decode([statusType], bytes)[0];
    } catch (_) {
      // Older/newer candid shapes — best-effort extract controllers via loose decode
      try {
        const loose = IDL.Record({
          settings: IDL.Record({ controllers: IDL.Vec(IDL.Principal) }),
        });
        decoded = IDL.decode([loose], bytes)[0];
      } catch (e2) {
        console.error("canister_status decode failed", e2);
        return null;
      }
    }
    const ctrls = decoded?.settings?.controllers || [];
    return ctrls.map((p) => p.toText());
  } catch (e) {
    console.error("fetchSiteControllers", e);
    return null;
  }
}

/**
 * Read cycles (+ controllers) via management canister_status.
 * Works when the caller is a controller — even if site WASM has no getCyclesGauge.
 * @returns {Promise<{ cycles: bigint, controllers: string[] }|null>}
 */
export async function fetchSiteCycleStatus(identity, siteCanisterId) {
  if (!identity || !siteCanisterId) return null;
  try {
    const site =
      typeof siteCanisterId === "string"
        ? Principal.fromText(siteCanisterId)
        : siteCanisterId;
    const agent = await makeAgent(identity);
    const arg = IDL.encode(
      [IDL.Record({ canister_id: IDL.Principal })],
      [{ canister_id: site }]
    );
    const raw = await agent.call("aaaaa-aa", {
      methodName: "canister_status",
      arg,
      effectiveCanisterId: site,
    });

    let bytes = raw;
    if (raw?.requestId) {
      const { pollForResponse, strategy } = await import("@dfinity/agent");
      bytes = await pollForResponse(
        agent,
        Principal.fromText("aaaaa-aa"),
        raw.requestId,
        strategy.defaultStrategy()
      );
    }

    const statusType = IDL.Record({
      status: IDL.Variant({
        running: IDL.Null,
        stopping: IDL.Null,
        stopped: IDL.Null,
      }),
      settings: IDL.Record({
        controllers: IDL.Vec(IDL.Principal),
        compute_allocation: IDL.Nat,
        memory_allocation: IDL.Nat,
        freezing_threshold: IDL.Nat,
        reserved_cycles_limit: IDL.Opt(IDL.Nat),
        log_visibility: IDL.Opt(
          IDL.Variant({ controllers: IDL.Null, public: IDL.Null })
        ),
        wasm_memory_limit: IDL.Opt(IDL.Nat),
      }),
      module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
      memory_size: IDL.Nat,
      cycles: IDL.Nat,
      idle_cycles_burned_per_day: IDL.Opt(IDL.Nat),
      query_stats: IDL.Opt(IDL.Record({})),
    });

    let decoded;
    try {
      decoded = IDL.decode([statusType], bytes)[0];
    } catch (_) {
      try {
        const loose = IDL.Record({
          settings: IDL.Record({ controllers: IDL.Vec(IDL.Principal) }),
          cycles: IDL.Nat,
        });
        decoded = IDL.decode([loose], bytes)[0];
      } catch (e2) {
        console.error("canister_status decode failed", e2);
        return null;
      }
    }
    const cyclesRaw = decoded?.cycles ?? 0;
    const cycles =
      typeof cyclesRaw === "bigint" ? cyclesRaw : BigInt(cyclesRaw ?? 0);
    const controllers = (decoded?.settings?.controllers || []).map((p) =>
      p.toText()
    );
    return { cycles, controllers };
  } catch (e) {
    console.error("fetchSiteCycleStatus", e);
    return null;
  }
}

/** True if this II is listed as a controller on the site canister. */
export async function principalIsSiteController(identity, siteCanisterId) {
  if (!identity || !siteCanisterId) return false;
  const me = identity.getPrincipal().toText();
  const ctrls = await fetchSiteControllers(identity, siteCanisterId);
  if (!ctrls) return false;
  return ctrls.includes(me);
}
