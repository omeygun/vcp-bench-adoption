import { bad, handle, json } from "@/lib/http";
import { runReminders } from "@/lib/reminders";
import { safeEq } from "@/lib/auth";
export const GET = handle(async (req) => {
  const auth = req.headers.get("authorization") || "", secret = process.env.CRON_SECRET;
  if (secret && !safeEq(auth, `Bearer ${secret}`)) return bad("Unauthorized", 401);
  if (!secret && process.env.NODE_ENV === "production") return bad("CRON_SECRET not set", 500);
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  return json({ dryRun, results: await runReminders(dryRun) });
});
