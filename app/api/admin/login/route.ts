import { NextResponse } from "next/server";
import { body, handle, ip, rateLimitShared, isEmail, bad } from "@/lib/http";
import { COOKIE, cookieOpts, login } from "@/lib/auth";
export const POST = handle(async (req) => {
  const { email, password } = await body(req);
  if (!isEmail(email) || typeof password !== "string") return bad("Email and password required", 422);
  await rateLimitShared("login-ip:" + ip(req), 10, 900_000);                 // one attacker, many accounts
  await rateLimitShared("login-email:" + email.toLowerCase(), 10, 900_000);  // many IPs, one account
  const r = await login(email, password);
  if (!r) return bad("Wrong email or password", 401);
  const res = NextResponse.json({ ok: true, mustChange: r.mustChange });
  res.cookies.set(COOKIE, r.session, cookieOpts);
  return res;
});
