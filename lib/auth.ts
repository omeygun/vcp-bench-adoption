import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getStore } from "./store";
import { getConfig } from "./config";
import { sendEmail, SITE } from "./email";
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

export async function isStaff(email: string) { return (await getConfig("STAFF")).emails.includes(email.toLowerCase()); }

/** Magic link: LOGIN#<token> item, 15 minutes, single use. */
export async function startLogin(email: string) {
  email = email.toLowerCase();
  if (!(await isStaff(email))) return;                       // silent: don't reveal the allowlist
  const token = randomBytes(24).toString("base64url");
  await getStore().put({ PK: `LOGIN#${token}`, SK: "META", email, ttl: Math.floor(Date.now() / 1000) + 900, createdAt: new Date().toISOString() });
  const url = `${SITE}/api/admin/verify?t=${token}`;
  await sendEmail({ to: email, subject: "Your VCP Benches admin sign-in link", text: `Sign in: ${url}\nThis link works once and expires in 15 minutes.`, html: `<p><a href="${url}">Sign in to VCP Benches admin</a></p><p>This link works once and expires in 15 minutes.</p>` });
}
export async function finishLogin(token: string) {
  const store = getStore();
  const item = await store.get(`LOGIN#${token}`, "META");
  if (!item || Number(item.ttl) * 1000 < Date.now() || item.usedAt) return null;
  await store.update(item.PK, item.SK, { usedAt: new Date().toISOString() }, { attrNotExists: "usedAt" });
  return makeSession(String(item.email));
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
