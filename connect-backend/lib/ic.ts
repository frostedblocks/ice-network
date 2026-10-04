import { Actor, HttpAgent, type ActorSubclass, type Identity } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { getEnv } from "./env";
import { getBackendIdentity } from "./ic-identity";

/** Minimal user_site IDL for Connect / checkout / receipts. */
const userSiteIdl = ({ IDL: e }: { IDL: typeof IDL }) => {
  const Product = e.Record({
    id: e.Nat,
    title: e.Text,
    description: e.Text,
    priceCents: e.Nat,
    shippingCents: e.Nat,
    currency: e.Text,
    imageURL: e.Opt(e.Text),
    photoIds: e.Vec(e.Nat),
    active: e.Bool,
    createdAt: e.Int,
    updatedAt: e.Int,
  });
  const StripePublicConfig = e.Record({
    accountId: e.Text,
    publishableKey: e.Text,
  });
  const DomainStatus = e.Record({
    customDomain: e.Text,
    publicUrl: e.Text,
    dnsConfigured: e.Bool,
    readyForDetach: e.Bool,
    canisterId: e.Principal,
    domainConnectedAt: e.Int,
  });
  const Receipt = e.Record({
    id: e.Nat,
    productId: e.Nat,
    buyerRef: e.Text,
    amountCents: e.Nat,
    currency: e.Text,
    recordedAt: e.Int,
    recorder: e.Principal,
  });
  const ReceiptResult = e.Variant({
    ok: Receipt,
    err: e.Text,
  });

  return e.Service({
    getOwner: e.Func([], [e.Principal], ["query"]),
    getProduct: e.Func([e.Nat], [e.Opt(Product)], ["query"]),
    getStripePublic: e.Func([], [e.Opt(StripePublicConfig)], ["query"]),
    getDomainStatus: e.Func([], [DomainStatus], ["query"]),
    recordReceipt: e.Func(
      [e.Nat, e.Text, e.Nat, e.Text],
      [ReceiptResult],
      [],
    ),
    bindStripePublic: e.Func([e.Text, e.Text], [e.Text], []),
  });
};

export type Product = {
  id: bigint;
  title: string;
  description: string;
  priceCents: bigint;
  shippingCents: bigint;
  currency: string;
  imageURL: [] | [string];
  photoIds: bigint[];
  active: boolean;
  createdAt: bigint;
  updatedAt: bigint;
};

export type StripePublicConfig = {
  accountId: string;
  publishableKey: string;
};

export type DomainStatus = {
  customDomain: string;
  publicUrl: string;
  dnsConfigured: boolean;
  readyForDetach: boolean;
  canisterId: Principal;
  domainConnectedAt: bigint;
};

export type UserSiteActor = ActorSubclass<{
  getOwner: () => Promise<Principal>;
  getProduct: (id: bigint) => Promise<[] | [Product]>;
  getStripePublic: () => Promise<[] | [StripePublicConfig]>;
  getDomainStatus: () => Promise<DomainStatus>;
  recordReceipt: (
    productId: bigint,
    buyerRef: string,
    amountCents: bigint,
    currency: string,
  ) => Promise<{ ok: unknown } | { err: string }>;
  bindStripePublic: (
    accountId: string,
    publishableKey: string,
  ) => Promise<string>;
}>;

function assertCanisterId(siteId: string): Principal {
  try {
    return Principal.fromText(siteId.trim());
  } catch {
    throw new Error("Invalid siteId (expected canister principal)");
  }
}

async function makeAgent(
  identity?: Identity | null,
): Promise<HttpAgent> {
  const { icHost } = getEnv();
  const agent = new HttpAgent({
    host: icHost,
    identity: identity ?? undefined,
  });
  return agent;
}

export async function getAnonymousSiteActor(
  siteId: string,
): Promise<UserSiteActor> {
  const canisterId = assertCanisterId(siteId);
  const agent = await makeAgent(null);
  return Actor.createActor(userSiteIdl as unknown as IDL.InterfaceFactory, {
    agent,
    canisterId,
  }) as UserSiteActor;
}

export async function getRecorderSiteActor(
  siteId: string,
): Promise<UserSiteActor> {
  const canisterId = assertCanisterId(siteId);
  const agent = await makeAgent(getBackendIdentity());
  return Actor.createActor(userSiteIdl as unknown as IDL.InterfaceFactory, {
    agent,
    canisterId,
  }) as UserSiteActor;
}

/** Actor authenticated as an arbitrary Identity (owner II proof). */
export async function getSiteActorWithIdentity(
  siteId: string,
  identity: Identity,
): Promise<UserSiteActor> {
  const canisterId = assertCanisterId(siteId);
  const agent = await makeAgent(identity);
  return Actor.createActor(userSiteIdl as unknown as IDL.InterfaceFactory, {
    agent,
    canisterId,
  }) as UserSiteActor;
}

/**
 * @deprecated Insecure if used alone — client can supply any principal string
 * that matches public getOwner. Prefer assertOwnerProof in lib/owner-proof.ts.
 * Kept for secondary checks against a principal already verified via proof.
 */
export async function assertSiteOwner(
  siteId: string,
  ownerPrincipal: string,
): Promise<void> {
  let expected: Principal;
  try {
    expected = Principal.fromText(ownerPrincipal.trim());
  } catch {
    throw new Error("Invalid ownerPrincipal");
  }
  const actor = await getAnonymousSiteActor(siteId);
  const owner = await actor.getOwner();
  if (owner.toText() !== expected.toText()) {
    throw new Error("ownerPrincipal does not match site getOwner");
  }
}

export function optFirst<T>(v: [] | [T] | T | null | undefined): T | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? (v[0] as T) : null;
  return v as T;
}
