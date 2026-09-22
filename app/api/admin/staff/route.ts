import { body, handle, json, isEmail, bad } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { getConfig, setConfig } from "@/lib/config";
export const GET = handle(async (req) => { await requireAdmin(req); return json(await getConfig("STAFF")); });
export const POST = handle(async (req) => { await requireAdmin(req); const { email } = await body(req); if (!isEmail(email)) return bad("Email required", 422); const cur = await getConfig("STAFF"); const emails = Array.from(new Set([...cur.emails, String(email).toLowerCase()])); await setConfig("STAFF", { emails }); return json({ emails }); });
export const DELETE = handle(async (req) => { const me = await requireAdmin(req); const { email } = await body(req); const cur = await getConfig("STAFF"); const emails = cur.emails.filter((e) => e !== String(email).toLowerCase()); if (emails.length === 0) return bad("Cannot remove the last staff member", 422); if (email === me.email) return bad("Cannot remove yourself", 422); await setConfig("STAFF", { emails }); return json({ emails }); });
