import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { revokeWaiver } from "@/lib/waivers";
export const DELETE = handle(async (req, { params }) => { await requireAdmin(req); const { code } = await params; await revokeWaiver(code); return json({ revoked: true }); });
