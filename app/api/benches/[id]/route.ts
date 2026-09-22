import { bad, handle, json } from "@/lib/http";
import { benchById } from "@/lib/benches";
import { benchState, isLive, listForBench, sideState, toPublic } from "@/lib/adoptions";
import { openReportsForBench } from "@/lib/reports";

export const GET = handle(async (_req, { params }) => {
  const { id } = await params;
  const bench = benchById(id);
  if (!bench) return bad("Unknown bench", 404);
  const all = await listForBench(id);
  const live = all.filter((a) => isLive(a));
  const open = await openReportsForBench(id);
  const sides = Array.from({ length: bench.sides }, (_, i) => {
    const n = i + 1, mine = live.filter((a) => a.side === n);
    return { side: n, state: sideState(mine), current: mine.map(toPublic), history: all.filter((a) => a.side === n && !isLive(a) && a.status !== "cancelled").map(toPublic) };
  });
  return json({ bench, state: benchState(bench, live), sides, openReports: open.map((r) => ({ id: r.id, category: r.category, status: r.status, createdAt: r.createdAt })) },
    200, { "Cache-Control": "no-store" });
});
