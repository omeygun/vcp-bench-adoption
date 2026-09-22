import { body, handle, ip, json, rateLimit } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { createReport, listReports } from "@/lib/reports";

export const POST = handle(async (req) => { rateLimit("report:" + ip(req), 5, 3600_000); const r = await createReport(await body(req)); return json({ id: r.id, benchId: r.benchId, status: r.status }, 201); });
export const GET = handle(async (req) => { await requireAdmin(req); return json(await listReports(new URL(req.url).searchParams.get("status") || "open")); });
