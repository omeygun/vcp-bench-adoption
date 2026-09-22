import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { computeStats } from "@/lib/stats";
export const GET = handle(async (req) => { await requireAdmin(req); return json(await computeStats()); });
