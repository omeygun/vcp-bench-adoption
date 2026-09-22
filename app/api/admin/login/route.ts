import { body, handle, ip, json, rateLimit, isEmail, bad } from "@/lib/http";
import { startLogin } from "@/lib/auth";
export const POST = handle(async (req) => { rateLimit("login:" + ip(req), 10, 3600_000); const { email } = await body(req); if (!isEmail(email)) return bad("Email required", 422); await startLogin(email); return json({ ok: true, message: "If that address is on the staff list, a sign-in link is on its way." }); });
