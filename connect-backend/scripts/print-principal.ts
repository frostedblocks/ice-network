/**
 * Print the IC principal for the configured backend identity.
 * Usage (from connect-backend/):
 *   npx tsx scripts/print-principal.ts
 * Call Factory adminSetConnectBackend with this principal after deploy,
 * and ensure sites seed/add it as trustedRecorder.
 */
import { getBackendIdentity, getBackendPrincipalText } from "../lib/ic-identity";

getBackendIdentity();
console.log(getBackendPrincipalText());
