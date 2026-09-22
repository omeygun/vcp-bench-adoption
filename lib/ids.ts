import { randomBytes, randomInt } from "node:crypto";
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** ULID: 10 chars of time + 16 random, lexically sortable by creation time. */
export function ulid(now = Date.now()) {
  let t = "", n = now;
  for (let i = 0; i < 10; i++) { t = B32[n % 32] + t; n = Math.floor(n / 32); }
  return t + Array.from(randomBytes(16), (b) => B32[b % 32]).join("");
}
const CODE = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";   // no 0/O/1/I
export const waiverCode = () => Array.from({ length: 12 }, () => CODE[randomInt(CODE.length)]).join("");
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, d: number) => { const x = new Date(iso + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
export const addYears = (iso: string, y: number) => { const x = new Date(iso + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() + y); return x.toISOString().slice(0, 10); };
