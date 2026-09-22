import { getStore, type Item, type Op } from "./store";
import { ulid, waiverCode } from "./ids";
import { HttpError } from "./http";

export type Waiver = { code: string; label: string; createdBy: string; createdAt: string; expiresAt?: string; restrictTo?: { benchId?: string; region?: string }; usedAt?: string; usedBy?: string; usedByEmail?: string; revokedAt?: string };
const key = (code: string) => ({ pk: `WAIVER#${code.toUpperCase()}`, sk: "META" });

export async function createWaiver(input: { label: string; createdBy: string; expiresAt?: string; restrictTo?: Waiver["restrictTo"] }) {
  const code = waiverCode();
  const w: Waiver = { code, label: input.label, createdBy: input.createdBy, createdAt: new Date().toISOString(), expiresAt: input.expiresAt, restrictTo: input.restrictTo };
  await getStore().put({ PK: key(code).pk, SK: "META", ...w, id: ulid(), GSI1PK: "WAIVER", GSI1SK: w.createdAt, ttl: input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) + 30 * 86400 : undefined }, true);
  return w;   // the only time the full code is returned
}
export const getWaiver = async (code: string) => (await getStore().get(key(code).pk, key(code).sk)) as (Item & Waiver) | undefined;
export async function listWaivers() {
  return (await getStore().queryIndex("GSI1", "WAIVER")).map((w) => ({ ...publicWaiver(w as Item & Waiver) })).reverse();
}
export const publicWaiver = (w: Waiver) => ({ label: w.label, codeHint: "••••••••" + w.code.slice(-4), createdBy: w.createdBy, createdAt: w.createdAt, expiresAt: w.expiresAt, restrictTo: w.restrictTo,
  status: w.revokedAt ? "revoked" : w.usedAt ? "used" : w.expiresAt && w.expiresAt < new Date().toISOString().slice(0, 10) ? "expired" : "active", usedAt: w.usedAt, usedBy: w.usedBy, code: w.code.slice(-4) });
export const revokeWaiver = (code: string) => getStore().update(key(code).pk, key(code).sk, { revokedAt: new Date().toISOString() }, { attrNotExists: "usedAt" });

/** Throws a 4xx HttpError with the reason, or returns the waiver. */
export async function validateWaiver(code: string, bench: { id: string; region: string }) {
  const w = await getWaiver(code);
  if (!w) throw new HttpError(404, "Waiver code not found");
  if (w.revokedAt) throw new HttpError(410, "Waiver code was revoked");
  if (w.usedAt) throw new HttpError(409, "Waiver code already used");
  if (w.expiresAt && w.expiresAt < new Date().toISOString().slice(0, 10)) throw new HttpError(410, "Waiver code expired");
  if (w.restrictTo?.benchId && w.restrictTo.benchId !== bench.id) throw new HttpError(422, `Waiver is only valid for bench ${w.restrictTo.benchId}`);
  if (w.restrictTo?.region && w.restrictTo.region !== bench.region) throw new HttpError(422, `Waiver is only valid in region ${w.restrictTo.region}`);
  return w;
}
export const redeemOp = (code: string, adoptionId: string, email: string): Op =>
  ({ type: "update", pk: key(code).pk, sk: key(code).sk, set: { usedAt: new Date().toISOString(), usedBy: adoptionId, usedByEmail: email }, condition: { attrNotExists: "usedAt" } });
