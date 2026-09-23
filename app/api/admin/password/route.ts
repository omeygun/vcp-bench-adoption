import { NextResponse } from "next/server";
import { body, handle, bad } from "@/lib/http";
import { checkPassword, COOKIE, cookieOpts, makeSession, passwordOk, requireAdmin, setStaffPassword, staffList } from "@/lib/auth";
/** Change your own password. */
export const POST = handle(async (req) => {
  const me = await requireAdmin(req);
  if (me.email === "admin-key") return bad("Use a staff session", 403);
  const { current, next } = await body(req);
  const rec = (await staffList()).find((s) => s.email === me.email);
  if (!rec || !checkPassword(String(current), rec.hash)) return bad("Current password is wrong", 401);
  if (!passwordOk(next)) return bad("New password must be 10–200 characters", 422);
  const updated = await setStaffPassword(me.email, next);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeSession(me.email, updated.hash), cookieOpts);   // other devices' sessions end; this one continues
  return res;
});
