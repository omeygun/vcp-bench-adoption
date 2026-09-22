import { body, handle, json, str, bad } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { createWaiver, listWaivers } from "@/lib/waivers";
export const GET = handle(async (req) => { await requireAdmin(req); return json(await listWaivers()); });
export const POST = handle(async (req) => {
  const me = await requireAdmin(req); const b = await body(req);
  const label = str(b.label, 120, 1); if (!label) return bad("Label required", 422);
  const expiresAt = str(b.expiresAt, 10); if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return bad("expiresAt must be YYYY-MM-DD", 422);
  const restrictTo = { benchId: str(b.benchId, 8), region: str(b.region, 1) };
  return json(await createWaiver({ label, createdBy: me.email, expiresAt, restrictTo: restrictTo.benchId || restrictTo.region ? restrictTo : undefined }), 201);
});
