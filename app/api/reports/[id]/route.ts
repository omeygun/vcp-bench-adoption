import { body, handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { patchReport } from "@/lib/reports";
export const PATCH = handle(async (req, { params }) => { const me = await requireAdmin(req); const { id } = await params; const b = await body(req); return json(await patchReport(id, { status: b.status as string | undefined, staffNotes: b.staffNotes as string | undefined }, me.email)); });
