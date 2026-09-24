import { Principal } from "@dfinity/principal";

/** Same layout as Motoko userDepositSubaccount / CMC principal subaccount */
export function principalToDepositSubaccount(principal) {
  const p =
    typeof principal === "string"
      ? Principal.fromText(principal)
      : principal?.toText
      ? Principal.fromText(principal.toText())
      : principal;
  const bytes = p.toUint8Array();
  const sub = new Uint8Array(32);
  const len = Math.min(bytes.length, 31);
  sub[0] = len;
  sub.set(bytes.subarray(0, len), 1);
  return sub;
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function formatIcpFromE8s(e8s) {
  const n = typeof e8s === "bigint" ? e8s : BigInt(e8s);
  const whole = n / 100_000_000n;
  const frac = n % 100_000_000n;
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

export const LEDGER_FEE_E8S = 10_000n;

/** Amount user must send so claim (amount + ledger fee from deposit) succeeds */
export function depositAmountNeeded(feeE8s) {
  const fee = typeof feeE8s === "bigint" ? feeE8s : BigInt(feeE8s);
  return fee + LEDGER_FEE_E8S;
}
