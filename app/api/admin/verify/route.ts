import { NextResponse } from "next/server";
import { COOKIE, finishLogin } from "@/lib/auth";
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const session = await finishLogin(t);
  if (!session) return NextResponse.redirect(new URL("/admin/login?error=expired", req.url));
  const res = NextResponse.redirect(new URL("/admin", req.url));
  res.cookies.set(COOKIE, session, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  return res;
}
