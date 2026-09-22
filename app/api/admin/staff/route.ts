import { body, handle, json, isEmail, bad } from "@/lib/http";
import { passwordOk, removeStaff, requireAdmin, setStaffPassword, staffList } from "@/lib/auth";
const publicList = async () => (await staffList()).map((s) => ({ email: s.email, hasPassword: !!s.hash, createdAt: s.createdAt, mustChange: s.mustChange }));
export const GET = handle(async (req) => { await requireAdmin(req); return json(await publicList()); });
/** Add a staff member or reset their password (temporary password, they should change it). */
export const POST = handle(async (req) => {
  await requireAdmin(req); const { email, password } = await body(req);
  if (!isEmail(email)) return bad("Email required", 422);
  if (!passwordOk(password)) return bad("Password must be 10–200 characters", 422);
  await setStaffPassword(String(email), password, { mustChange: true });
  return json(await publicList());
});
export const DELETE = handle(async (req) => {
  const me = await requireAdmin(req); const { email } = await body(req);
  const list = await staffList();
  if (list.length <= 1) return bad("Cannot remove the last staff member", 422);
  if (String(email).toLowerCase() === me.email) return bad("Cannot remove yourself", 422);
  await removeStaff(String(email)); return json(await publicList());
});
