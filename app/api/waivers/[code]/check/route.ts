import { handle, ip, json, rateLimit } from "@/lib/http";
import { validateWaiver } from "@/lib/waivers";
import { benchById } from "@/lib/benches";
export const GET = handle(async (req, { params }) => {
  rateLimit("waiver:" + ip(req), 20, 3600_000);
  const { code } = await params;
  const benchId = new URL(req.url).searchParams.get("benchId") || "";
  const bench = benchById(benchId);
  const w = await validateWaiver(code, bench || { id: benchId, region: "" });
  return json({ valid: true, label: w.label, restrictTo: w.restrictTo });
});
