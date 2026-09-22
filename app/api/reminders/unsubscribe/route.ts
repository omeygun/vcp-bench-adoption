import { handle } from "@/lib/http";
import { safeEq, signToken } from "@/lib/auth";
import { getAdoption } from "@/lib/adoptions";
import { getStore } from "@/lib/store";
export const GET = handle(async (req) => {
  const u = new URL(req.url), id = u.searchParams.get("id") || "", c = u.searchParams.get("c") || "email", t = u.searchParams.get("t") || "";
  const a = await getAdoption(id);
  if (!a || !safeEq(t, signToken(`${id}:${c}`))) return new Response("Invalid link", { status: 400 });
  const channels = (a.reminders?.channels || []).filter((x) => x !== c);
  await getStore().update(`BENCH#${a.benchId}`, `SIDE#${a.side}#${a.id}`, { reminders: { ...a.reminders, channels, sent: a.reminders?.sent || [] } });
  return new Response(`<p style="font-family:sans-serif">You will no longer receive ${c} reminders for bench ${a.benchId}. VCPA can still reach you about your plaque directly.</p>`, { headers: { "Content-Type": "text/html" } });
});
