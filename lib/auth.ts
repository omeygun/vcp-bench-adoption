import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getConfig, setConfig } from "./config";
import { HttpError } from "./http";

/** Production must set AUTH_SECRET: with the dev fallback anyone could forge an admin cookie. */
function secret() {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (16+ random characters)");
  return "dev-secret-change-me";
}
export const COOKIE = "vcp_admin";
export const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 };
const sign = (s: string) => createHmac("sha256", secret()).update(s).digest("base64url");
export const signToken = (s: string) => sign(s);
export const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Sessions carry a fingerprint of the password hash, so removing a staff member or changing/resetting a password logs out old sessions. */
const fingerprint = (hash?: string) => sign("pw:" + (hash || "")).slice(0, 16);
export function makeSession(email: string, hash?: string, days = 30) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + days * 864e5, v: fingerprint(hash) })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
async function readSession(value?: string | null): Promise<{ email: string } | null> {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig || !safeEq(sig, sign(payload))) return null;
  let p: { email?: string; exp?: number; v?: string };
  try { p = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return null; }
  if (!p.email || !p.exp || p.exp <= Date.now() || !p.v) return null;
  const rec = (await staffList()).find((s) => s.email === p.email);
  return rec?.hash && safeEq(p.v, fingerprint(rec.hash)) ? { email: p.email } : null;
}
export async function getSession() { return readSession((await cookies()).get(COOKIE)?.value); }

export type Staff = { email: string; hash?: string; createdAt?: string; mustChange?: boolean };
export async function staffList(): Promise<Staff[]> {
  const v = (await getConfig("STAFF")) as { staff?: Staff[]; emails?: string[] };
  return v.staff?.length ? v.staff : (v.emails || []).map((email) => ({ email }));   // tolerate the old allowlist shape
}
export async function isStaff(email: string) { return (await staffList()).some((s) => s.email === email.toLowerCase()); }

/** scrypt, Node built-in. Stored as salt:hash (hex). */
export function hashPassword(pw: string) { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`; }
export function checkPassword(pw: string, stored?: string) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":"); if (!salt || !hash) return false;
  const got = scryptSync(pw, salt, 64); const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}
export const passwordOk = (pw: unknown): pw is string => typeof pw === "string" && pw.length >= 10 && pw.length <= 200;

export async function setStaffPassword(email: string, password: string, opts: { mustChange?: boolean } = {}) {
  email = email.toLowerCase();
  const list = await staffList();
  const cur = list.find((s) => s.email === email);
  const rec: Staff = { email, hash: hashPassword(password), createdAt: cur?.createdAt || new Date().toISOString(), mustChange: opts.mustChange ?? false };
  await setConfig("STAFF", { staff: [...list.filter((s) => s.email !== email), rec] });
  return rec;
}
export async function removeStaff(email: string) { await setConfig("STAFF", { staff: (await staffList()).filter((s) => s.email !== email.toLowerCase()) }); }

/** Email + password -> session cookie value, or null. First-ever login can bootstrap from ADMIN_EMAIL/ADMIN_PASSWORD. */
export async function login(email: string, password: string) {
  email = email.toLowerCase();
  let list = await staffList();
  if (!list.some((s) => s.hash) && process.env.ADMIN_EMAIL?.toLowerCase() === email && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
    await setStaffPassword(email, password); list = await staffList();
  }
  const rec = list.find((s) => s.email === email);
  return rec && checkPassword(password, rec.hash) ? { session: makeSession(email, rec.hash), mustChange: !!rec.mustChange } : null;
}

/** Route guard: session cookie, or x-admin-key for scripts. */
export async function requireAdmin(req: Request): Promise<{ email: string }> {
  const key = req.headers.get("x-admin-key");
  if (key && process.env.ADMIN_KEY && safeEq(key, process.env.ADMIN_KEY)) return { email: "admin-key" };
  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  const s = await readSession(cookie);
  if (!s) throw new HttpError(401, "Sign in required");
  return s;
}
