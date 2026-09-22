import { NextResponse } from "next/server";
import { body, handle, ip, rateLimit, isEmail, bad } from "@/lib/http";
import { COOKIE, login } from "@/lib/auth";
export const POST = handle(async (req) => {
  rateLimit("login:" + ip(req), 10, 900_000);
  const { email, password } = await body(req);
  if (!isEmail(email) || typeof password !== "string") return bad("Email and password required", 422);
  const r = await login(email, password);
  if (!r) return bad("Wrong email or password", 401);
  const res = NextResponse.json({ ok: true, mustChange: r.mustChange });
  res.cookies.set(COOKIE, r.session, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  return res;
});
