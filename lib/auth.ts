import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getConfig, setConfig } from "./config";
import { HttpError } from "./http";

const SECRET = process.env.AUTH_SECRET || "dev-secret-change-me";
export const COOKIE = "vcp_admin";
const sign = (s: string) => createHmac("sha256", SECRET).update(s).digest("base64url");
export const signToken = (s: string) => sign(s);
export const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function makeSession(email: string, days = 30) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + days * 864e5 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function readSession(value?: string | null): { email: string } | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig || !safeEq(sig, sign(payload))) return null;
  try { const p = JSON.parse(Buffer.from(payload, "base64url").toString()); return p.exp > Date.now() ? { email: p.email } : null; } catch { return null; }
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
  return rec && checkPassword(password, rec.hash) ? { session: makeSession(email), mustChange: !!rec.mustChange } : null;
}

/** Route guard: session cookie, or x-admin-key for scripts. */
export async function requireAdmin(req: Request): Promise<{ email: string }> {
  const key = req.headers.get("x-admin-key");
  if (key && process.env.ADMIN_KEY && safeEq(key, process.env.ADMIN_KEY)) return { email: "admin-key" };
  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  const s = readSession(cookie);
  if (!s) throw new HttpError(401, "Sign in required");
  return s;
}
