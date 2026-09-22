import { BENCHES } from "./benches";
import { benchState, isLive, listAll } from "./adoptions";
import { getStore } from "./store";
import { asReport } from "./reports";
import { addDays, today } from "./ids";

export async function computeStats() {
  const all = await listAll(), day = today();
  const live = all.filter((a) => isLive(a, day));
  const count = <T extends string>(xs: T[]) => xs.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {} as Record<string, number>);
  const perRegion: Record<string, Record<string, number>> = {};
  for (const b of BENCHES) { const st = benchState(b, live.filter((a) => a.benchId === b.id)); (perRegion[b.region] ??= {})[st] = ((perRegion[b.region] ??= {})[st] || 0) + 1; }
  const benches = count(BENCHES.map((b) => benchState(b, live.filter((a) => a.benchId === b.id))));
  const monthStart = day.slice(0, 7) + "-01";
  const installed = all.filter((a) => a.status === "installed" && a.termStart);
  const daysTo = installed.map((a) => (new Date(a.termStart!).getTime() - new Date(a.createdAt).getTime()) / 864e5).filter((d) => d >= 0).sort((x, y) => x - y);   // back-dated seed installs excluded
  const reports = await Promise.all(["open", "acknowledged", "fixed", "closed"].map(async (s) => [s, (await getStore().queryIndex("GSI4", `REPORT#${s}`)).map(asReport)] as const));
  const fixed = reports.filter(([s]) => s === "fixed" || s === "closed").flatMap(([, r]) => r).filter((r) => r.resolvedAt);
  const fixDays = fixed.map((r) => (new Date(r.resolvedAt!).getTime() - new Date(r.createdAt).getTime()) / 864e5).sort((x, y) => x - y);
  const median = (xs: number[]) => (xs.length ? Math.round(xs[Math.floor(xs.length / 2)]) : null);
  return {
    asOf: day,
    benches: { total: BENCHES.length, adopted: benches.adopted || 0, partial: benches.partial || 0, pending: benches.pending || 0, available: benches.available || 0, perRegion },
    requests: { byStatus: count(all.map((a) => a.status)), newThisMonth: all.filter((a) => a.createdAt >= monthStart).length, awaitingPayment: all.filter((a) => a.status === "awaiting_payment").length,
      paidNotInstalled: all.filter((a) => a.status === "paid").length, medianDaysToInstall: median(daysTo) },
    money: { pledgedCents: all.filter((a) => a.status !== "cancelled").reduce((s, a) => s + a.amountCents, 0), receivedCents: all.filter((a) => a.payment.status === "paid").reduce((s, a) => s + a.amountCents, 0),
      waived: all.filter((a) => a.payment.status === "waived").length, placeholder: true },
    renewals: { endingWithin12Months: live.filter((a) => a.termEnd && a.termEnd <= addDays(day, 365)).length, remindersSentThisMonth: all.reduce((s, a) => s + (a.reminders?.sent || []).filter((x) => x.at >= monthStart).length, 0),
      unsubscribed: all.filter((a) => a.reminders && a.reminders.channels.length === 0).length },
    reports: { byStatus: Object.fromEntries(reports.map(([s, r]) => [s, r.length])), byCategory: count(reports.flatMap(([, r]) => r).map((r) => r.category)), medianDaysToFix: median(fixDays) },
  };
}
