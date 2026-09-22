import { getStore } from "./store";
import { addDays, today } from "./ids";
import { getConfig } from "./config";
import { sendEmail, SITE } from "./email";
import { createRenewalCheckout } from "./stripe";
import { signToken } from "./auth";
import type { Adoption } from "./adoptions";

/** First reminder date strictly after `from`, or undefined when the schedule is exhausted. */
export function nextReminderDate(termEnd: string, offsetsDays: number[], from = today()) {
  return offsetsDays.map((d) => addDays(termEnd, d)).sort().find((d) => d > from);
}
export const unsubscribeUrl = (id: string, channel: string) => `${SITE}/api/reminders/unsubscribe?id=${id}&c=${channel}&t=${signToken(`${id}:${channel}`)}`;

/** Daily job. Each due adoption is advanced with a conditional update first, so a retried run never double-sends. */
export async function runReminders(dryRun = false) {
  const store = getStore();
  const cfg = await getConfig("REMINDERS");
  const pricing = await getConfig("PRICING");
  const due = await store.queryIndex("GSI3", "REMINDER", { lte: today() });
  const results: { id: string; benchId: string; sent: string[]; next?: string; skipped?: string }[] = [];
  for (const item of due) {
    const a = item as unknown as Adoption & { PK: string; SK: string };
    const at = a.reminders?.nextReminderAt;
    if (!at || !a.termEnd || a.status !== "installed") { if (!dryRun) await store.update(a.PK, a.SK, { GSI3PK: undefined, GSI3SK: undefined }); results.push({ id: a.id, benchId: a.benchId, sent: [], skipped: "not installed" }); continue; }
    const next = nextReminderDate(a.termEnd, cfg.offsetsDays, at);
    const sent: string[] = [];
    if (!dryRun) {
      try { await store.update(a.PK, a.SK, { GSI3PK: next ? "REMINDER" : undefined, GSI3SK: next, "reminders": { ...a.reminders, nextReminderAt: next } }, { equals: { attr: "GSI3SK", value: at } }); }
      catch { results.push({ id: a.id, benchId: a.benchId, sent, skipped: "already handled" }); continue; }
      const kind = at <= a.termEnd ? "renewal_notice" : "expired_notice";
      if (a.reminders?.channels.includes("email")) {
        const pay = await createRenewalCheckout(a, pricing.adoptCents, a.donor.email).catch(() => null);
        const daysLeft = Math.round((new Date(a.termEnd).getTime() - Date.now()) / 864e5);
        const when = daysLeft >= 0 ? `ends in ${daysLeft} days, on ${a.termEnd}` : `ended on ${a.termEnd}`;
        await sendEmail({ to: a.donor.email, subject: `Your plaque on bench ${a.benchId} ${daysLeft >= 0 ? "is coming up for renewal" : "has expired"}`,
          text: `Hi ${a.donor.name},\n\nYour 10-year adoption of bench ${a.benchId} (side ${a.side}) ${when}.\nRenew for another 10 years: ${pay || SITE + "/?bench=" + a.benchId}\nOr reply to this email to arrange payment by check or Zelle.\n\nUnsubscribe from these reminders: ${unsubscribeUrl(a.id, "email")}\n\nVan Cortlandt Park Alliance`,
          html: `<p>Hi ${a.donor.name},</p><p>Your 10-year adoption of bench <b>${a.benchId}</b> (side ${a.side}) ${when}.</p><p><a href="${pay || SITE + "/?bench=" + a.benchId}">Renew for another 10 years</a>, or reply to this email to arrange payment by check or Zelle.</p><p style="color:#777;font-size:12px"><a href="${unsubscribeUrl(a.id, "email")}">Unsubscribe</a> from these reminders.</p>` });
        sent.push("email");
      }
      // sms: Twilio branch goes here when VCPA wants it (needs consent stored on the adoption)
      await store.update(a.PK, a.SK, { reminders: { ...a.reminders, nextReminderAt: next, sent: [...(a.reminders?.sent || []), ...sent.map((channel) => ({ at: new Date().toISOString(), channel, kind }))] } });
    }
    results.push({ id: a.id, benchId: a.benchId, sent, next });
  }
  return results;
}
