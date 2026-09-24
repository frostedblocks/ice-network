import { Actor, HttpAgent } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";

/** Mainnet ICP ledger */
export const ICP_LEDGER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";
/** 1 ICP in e8s */
export const ONE_ICP_E8S = 100_000_000n;
/** Standard ICP transfer / approve fee (0.0001 ICP) */
export const ICP_FEE_E8S = 10_000n;

const ledgerIdlFactory = ({ IDL: I }) => {
  const AccountT = I.Record({
    owner: I.Principal,
    subaccount: I.Opt(I.Vec(I.Nat8)),
  });
  const ApproveArgs = I.Record({
    fee: I.Opt(I.Nat),
    memo: I.Opt(I.Vec(I.Nat8)),
    from_subaccount: I.Opt(I.Vec(I.Nat8)),
    created_at_time: I.Opt(I.Nat64),
    amount: I.Nat,
    expected_allowance: I.Opt(I.Nat),
    expires_at: I.Opt(I.Nat64),
    spender: AccountT,
  });
  const ApproveError = I.Variant({
    GenericError: I.Record({ message: I.Text, error_code: I.Nat }),
    TemporarilyUnavailable: I.Null,
    Duplicate: I.Record({ duplicate_of: I.Nat }),
    BadFee: I.Record({ expected_fee: I.Nat }),
    AllowanceChanged: I.Record({ current_allowance: I.Nat }),
    CreatedInFuture: I.Record({ ledger_time: I.Nat64 }),
    TooOld: I.Null,
    Expired: I.Record({ ledger_time: I.Nat64 }),
    InsufficientFunds: I.Record({ balance: I.Nat }),
  });
  const ApproveResult = I.Variant({ Ok: I.Nat, Err: ApproveError });
  const TransferArgs = I.Record({
    to: AccountT,
    fee: I.Opt(I.Nat),
    memo: I.Opt(I.Vec(I.Nat8)),
    from_subaccount: I.Opt(I.Vec(I.Nat8)),
    created_at_time: I.Opt(I.Nat64),
    amount: I.Nat,
  });
  const TransferError = I.Variant({
    GenericError: I.Record({ message: I.Text, error_code: I.Nat }),
    TemporarilyUnavailable: I.Null,
    BadBurn: I.Record({ min_burn_amount: I.Nat }),
    Duplicate: I.Record({ duplicate_of: I.Nat }),
    BadFee: I.Record({ expected_fee: I.Nat }),
    CreatedInFuture: I.Record({ ledger_time: I.Nat64 }),
    TooOld: I.Null,
    InsufficientFunds: I.Record({ balance: I.Nat }),
  });
  const TransferResult = I.Variant({ Ok: I.Nat, Err: TransferError });
  return I.Service({
    icrc2_approve: I.Func([ApproveArgs], [ApproveResult], []),
    icrc1_balance_of: I.Func([AccountT], [I.Nat], ["query"]),
    icrc1_transfer: I.Func([TransferArgs], [TransferResult], []),
  });
};

/** Cycles Minting Canister (mainnet) — ICP → cycles for a target canister */
export const CMC_CANISTER_ID = "rkp4c-7iaaa-aaaaa-aaaca-cai";

/**
 * Required ICRC-1 memo for CMC canister top-up.
 * Legacy ICP memo = 0x50555054 ('TPUP'); CMC reads it as little-endian u64 blob:
 * [0x54, 0x50, 0x55, 0x50, 0, 0, 0, 0]  // "TPUP" + pad
 * Without this memo, notify_top_up fails with InvalidTransaction.
 */
export const CMC_TOP_UP_MEMO = [0x54, 0x50, 0x55, 0x50, 0, 0, 0, 0];

/**
 * CMC top-up subaccount for a canister: 32-byte blob
 * [principal_len | principal_bytes | zero padding]
 */
export function principalToCmcSubaccount(canisterPrincipal) {
  const p =
    typeof canisterPrincipal === "string"
      ? Principal.fromText(canisterPrincipal)
      : canisterPrincipal?.toText
      ? Principal.fromText(canisterPrincipal.toText())
      : canisterPrincipal;
  const bytes = p.toUint8Array();
  const sub = new Uint8Array(32);
  sub[0] = bytes.length;
  sub.set(bytes, 1);
  return sub;
}

function describeTransferErr(err) {
  if (!err || typeof err !== "object") return "Unknown transfer error";
  if ("InsufficientFunds" in err) {
    const bal = err.InsufficientFunds?.balance ?? err.InsufficientFunds;
    return `InsufficientFunds (balance: ${formatIcp(bal)} ICP)`;
  }
  if ("BadFee" in err) {
    const f = err.BadFee?.expected_fee ?? err.BadFee;
    return `BadFee (expected ${f} e8s)`;
  }
  if ("GenericError" in err) return err.GenericError?.message || "GenericError";
  if ("TemporarilyUnavailable" in err) return "TemporarilyUnavailable";
  if ("Duplicate" in err) return "Duplicate";
  if ("TooOld" in err) return "TooOld";
  if ("CreatedInFuture" in err) return "CreatedInFuture";
  if ("BadBurn" in err) return "BadBurn";
  return JSON.stringify(err);
}

const cmcIdlFactory = ({ IDL: I }) => {
  const NotifyError = I.Variant({
    Refunded: I.Record({ reason: I.Text, block_index: I.Opt(I.Nat64) }),
    InvalidTransaction: I.Text,
    Other: I.Record({ error_message: I.Text, error_code: I.Nat64 }),
    Processing: I.Null,
    TransactionTooOld: I.Nat64,
  });
  const NotifyTopUpResult = I.Variant({
    Ok: I.Nat,
    Err: NotifyError,
  });
  return I.Service({
    notify_top_up: I.Func(
      [
        I.Record({
          block_index: I.Nat64,
          canister_id: I.Principal,
        }),
      ],
      [NotifyTopUpResult],
      []
    ),
  });
};

export async function createCmcActor(identity) {
  const network = import.meta.env.DFX_NETWORK || import.meta.env.VITE_DFX_NETWORK || "local";
  const host = network === "ic" ? "https://icp-api.io" : "http://127.0.0.1:4943";
  const agent = await HttpAgent.create({ host, identity });
  if (network !== "ic") {
    await agent.fetchRootKey();
  }
  return Actor.createActor(cmcIdlFactory, {
    agent,
    canisterId: CMC_CANISTER_ID,
  });
}

/**
 * Top up a personal canister using the logged-in user's Internet Identity.
 *
 * Does NOT use the factory. Flow:
 *  1) User II pays liquid ICP via icrc1_transfer
 *  2) Destination = Cycles Minting Canister + subaccount(site canister)
 *  3) CMC notify_top_up mints cycles into that personal site canister
 *
 * @returns {{ blockIndex: bigint, cyclesMinted: bigint, siteCanisterId: string }}
 */
export async function topUpCanisterFromUserIcp(identity, siteCanisterId, amountE8s) {
  if (!identity) throw new Error("Not logged in with Internet Identity.");
  if (!siteCanisterId) throw new Error("Missing personal site canister id.");

  const amount = typeof amountE8s === "bigint" ? amountE8s : BigInt(amountE8s);
  if (amount <= 0n) throw new Error("Top-up amount must be > 0.");

  const userPrincipal = identity.getPrincipal();
  const sitePrincipal =
    typeof siteCanisterId === "string"
      ? Principal.fromText(siteCanisterId)
      : siteCanisterId?.toText
      ? Principal.fromText(siteCanisterId.toText())
      : siteCanisterId;
  const siteText = sitePrincipal.toText ? sitePrincipal.toText() : String(sitePrincipal);

  const ledger = await createIcpLedgerActor(identity);
  const minBalance = amount + ICP_FEE_E8S;

  let balance;
  try {
    balance = await ledger.icrc1_balance_of({
      owner: userPrincipal,
      subaccount: [],
    });
    balance = typeof balance === "bigint" ? balance : BigInt(balance);
  } catch (e) {
    console.error(e);
    throw new Error("Could not read liquid ICP on your Internet Identity.");
  }

  if (balance < minBalance) {
    throw new Error(
      `Not enough liquid ICP on your Internet Identity. ` +
        `Need ~${formatIcp(minBalance)} ICP (top-up + ledger fee). ` +
        `This II has ${formatIcp(balance)} ICP. ` +
        `Principal: ${userPrincipal.toText()}. ` +
        `Send liquid ICP to this principal (not a neuron).`
    );
  }

  // CMC payment account for this personal canister
  const subBytes = principalToCmcSubaccount(sitePrincipal);
  const subaccount = Array.from(subBytes);

  let transferResult;
  try {
    transferResult = await ledger.icrc1_transfer({
      to: {
        owner: Principal.fromText(CMC_CANISTER_ID),
        subaccount: [subaccount],
      },
      fee: [ICP_FEE_E8S],
      // Critical: CMC requires TPUP memo for notify_top_up
      memo: [CMC_TOP_UP_MEMO],
      from_subaccount: [],
      created_at_time: [],
      amount,
    });
  } catch (e) {
    console.error(e);
    throw new Error(
      `ICP transfer from your II failed to start: ${e?.message || e}. ` +
        `Approve the wallet/II prompt if one appeared.`
    );
  }

  if (transferResult && "Err" in transferResult) {
    throw new Error(
      `ICP transfer from your II failed: ${describeTransferErr(transferResult.Err)}`
    );
  }
  if (transferResult && "err" in transferResult) {
    throw new Error(
      `ICP transfer from your II failed: ${describeTransferErr(transferResult.err)}`
    );
  }

  const rawBlock =
    transferResult?.Ok != null
      ? transferResult.Ok
      : transferResult?.ok != null
      ? transferResult.ok
      : transferResult;
  const blockIndex = typeof rawBlock === "bigint" ? rawBlock : BigInt(rawBlock);

  // Convert that ICP payment into cycles on the personal site
  const cmc = await createCmcActor(identity);

  const tryNotify = async () =>
    cmc.notify_top_up({
      // candid nat64 — BigInt required for large block indexes
      block_index: blockIndex,
      canister_id: sitePrincipal,
    });

  let notifyResult;
  try {
    notifyResult = await tryNotify();
    // Retry a few times if CMC is still indexing the block
    for (let i = 0; i < 4; i++) {
      const err = notifyResult?.Err ?? notifyResult?.err;
      if (!err) break;
      if ("Processing" in err || "InvalidTransaction" in err) {
        // InvalidTransaction right after transfer can mean block not yet visible
        await new Promise((r) => setTimeout(r, 2000));
        notifyResult = await tryNotify();
        continue;
      }
      break;
    }
  } catch (e) {
    console.error(e);
    throw new Error(
      `Your II sent ${formatIcp(amount)} ICP (block ${blockIndex}) but CMC notify failed: ${
        e?.message || e
      }. Site: ${siteText}. Keep this block index.`
    );
  }

  const err = notifyResult?.Err ?? notifyResult?.err;
  if (err) {
    let detail = JSON.stringify(err);
    if ("InvalidTransaction" in err) detail = String(err.InvalidTransaction);
    if ("Other" in err) detail = err.Other?.error_message || detail;
    if ("Refunded" in err) detail = `Refunded: ${err.Refunded?.reason || ""}`;
    if ("Processing" in err) {
      detail =
        "CMC still processing — wait 30s and press Check cycles (ICP was sent).";
    }
    if ("TransactionTooOld" in err) detail = "Transaction too old for CMC";
    throw new Error(`Could not complete top-up for ${siteText}: ${detail}`);
  }

  const rawCycles =
    notifyResult?.Ok != null
      ? notifyResult.Ok
      : notifyResult?.ok != null
      ? notifyResult.ok
      : 0n;
  const cyclesMinted = typeof rawCycles === "bigint" ? rawCycles : BigInt(rawCycles);

  if (cyclesMinted === 0n) {
    throw new Error(
      `CMC returned 0 cycles for block ${blockIndex}. Check cycles on ${siteText} — deposit may still appear shortly.`
    );
  }

  return {
    blockIndex,
    cyclesMinted,
    siteCanisterId: siteText,
    userPrincipal: userPrincipal.toText(),
    amountE8s: amount,
  };
}

function formatIcp(e8s) {
  const n = typeof e8s === "bigint" ? e8s : BigInt(e8s);
  const whole = n / ONE_ICP_E8S;
  const frac = n % ONE_ICP_E8S;
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

function describeApproveErr(err) {
  if (!err || typeof err !== "object") return "Unknown ledger error";
  if ("InsufficientFunds" in err) {
    const bal = err.InsufficientFunds?.balance ?? err.InsufficientFunds;
    return `InsufficientFunds (ledger balance: ${formatIcp(bal)} ICP)`;
  }
  if ("BadFee" in err) {
    const f = err.BadFee?.expected_fee ?? err.BadFee;
    return `BadFee (expected fee ${f} e8s)`;
  }
  if ("GenericError" in err) {
    return err.GenericError?.message || "GenericError";
  }
  if ("TemporarilyUnavailable" in err) return "TemporarilyUnavailable";
  if ("Duplicate" in err) return "Duplicate";
  if ("AllowanceChanged" in err) return "AllowanceChanged";
  if ("CreatedInFuture" in err) return "CreatedInFuture";
  if ("TooOld" in err) return "TooOld";
  if ("Expired" in err) return "Expired";
  return JSON.stringify(err);
}

export async function createIcpLedgerActor(identity) {
  const network = import.meta.env.DFX_NETWORK || import.meta.env.VITE_DFX_NETWORK || "local";
  const host = network === "ic" ? "https://icp-api.io" : "http://127.0.0.1:4943";
  const agent = await HttpAgent.create({ host, identity });
  if (network !== "ic") {
    await agent.fetchRootKey();
  }
  return Actor.createActor(ledgerIdlFactory, {
    agent,
    canisterId: ICP_LEDGER_ID,
  });
}

/** Liquid ICP on the II principal's default ledger account (not neurons). */
export async function getIcpBalanceE8s(identity) {
  const ledger = await createIcpLedgerActor(identity);
  const principal = identity.getPrincipal();
  const bal = await ledger.icrc1_balance_of({
    owner: principal,
    subaccount: [],
  });
  return typeof bal === "bigint" ? bal : BigInt(bal);
}

/**
 * Approve the I.C.E. canister to pull `amountE8s` via icrc2_transfer_from.
 *
 * User needs liquid ICP on this II's main ledger account:
 *   amount + approve_fee + transfer_from_fee  ≈ amount + 0.0002 ICP
 *
 * Allowance set to amount + transfer_fee so transfer_from can succeed.
 */
export async function approveIcpSpend(
  identity,
  iceCanisterId,
  amountE8s,
  purpose = "payment"
) {
  if (!iceCanisterId) {
    throw new Error("Missing ICE canister id for payment approval.");
  }

  const amountOnly = typeof amountE8s === "bigint" ? amountE8s : BigInt(amountE8s);
  // approve fee + transfer amount + transfer fee (all come from the same II account)
  const minBalance = amountOnly + ICP_FEE_E8S + ICP_FEE_E8S;
  const principal = identity.getPrincipal();
  const ledger = await createIcpLedgerActor(identity);

  let balance;
  try {
    balance = await ledger.icrc1_balance_of({
      owner: principal,
      subaccount: [],
    });
    balance = typeof balance === "bigint" ? balance : BigInt(balance);
  } catch (e) {
    console.error(e);
    throw new Error("Could not read your ICP ledger balance. Try again.");
  }

  if (balance < minBalance) {
    throw new Error(
      `Not enough liquid ICP on this Internet Identity for ${purpose}. ` +
        `Need ~${formatIcp(minBalance)} ICP free (includes ledger fees). ` +
        `This II has ${formatIcp(balance)} ICP. ` +
        `In NNS, send liquid ICP to: ${principal.toText()} (main account, not a neuron). ` +
        `Then Refresh balance and Approve again with II.`
    );
  }

  const spender = {
    owner: Principal.fromText(iceCanisterId),
    subaccount: [],
  };
  // Allowance must cover the transfer amount (and transfer fee on some ledger configs)
  const allowance = amountOnly + ICP_FEE_E8S;

  const result = await ledger.icrc2_approve({
    fee: [ICP_FEE_E8S],
    memo: [],
    from_subaccount: [],
    created_at_time: [],
    amount: allowance,
    expected_allowance: [],
    expires_at: [],
    spender,
  });

  if (result && "Err" in result) {
    const err = result.Err;
    const detail = describeApproveErr(err);
    if (err && "InsufficientFunds" in err) {
      const bal = err.InsufficientFunds?.balance ?? balance;
      throw new Error(
        `Not enough liquid ICP for ${purpose}. ` +
          `Ledger reports ${formatIcp(bal)} ICP on this II. ` +
          `Need ~${formatIcp(minBalance)} ICP free (not in a neuron). ` +
          `Principal: ${principal.toText()}.`
      );
    }
    throw new Error(`ICP approve failed for ${purpose}: ${detail}`);
  }
  return result;
}

/**
 * Approve registration fee (wrapper).
 */
export async function approveRegistrationPayment(
  identity,
  iceCanisterId,
  feeE8s = ONE_ICP_E8S
) {
  return approveIcpSpend(identity, iceCanisterId, feeE8s, "registration");
}

/**
 * Approve token pack purchase amount.
 */
export async function approveTokenPackPayment(identity, iceCanisterId, priceE8s) {
  return approveIcpSpend(identity, iceCanisterId, priceE8s, "token pack");
}

/**
 * Approve factory for detach / relink / cycles top-up (ICRC-2).
 */
export async function approveFactoryPayment(identity, factoryCanisterId, feeE8s, purpose = "factory fee") {
  return approveIcpSpend(identity, factoryCanisterId, feeE8s, purpose);
}

export function getIceCanisterId() {
  return (
    import.meta.env.VITE_CANISTER_ID_ICE ||
    import.meta.env.CANISTER_ID_ICE ||
    "6jf55-2qaaa-aaaan-q6mwq-cai"
  );
}

export { formatIcp };
