import { getStore, type Item } from "./store";
import { ulid } from "./ids";
import { benchById } from "./benches";
import { HttpError, isEmail, str } from "./http";
import { sendEmail, SITE, VCPA_EMAIL } from "./email";
import { listForBench, isLive } from "./adoptions";

export const CATEGORIES = ["damaged_bench", "damaged_plaque", "missing_plaque", "graffiti", "bench_missing", "other"] as const;
export const REPORT_STATUSES = ["open", "acknowledged", "fixed", "closed", "duplicate"] as const;
export type Report = { id: string; benchId: string; side?: number; adoptionId?: string; category: (typeof CATEGORIES)[number]; description: string; photos: { url: string }[];
  reporter?: { name?: string; email?: string; phone?: string }; status: (typeof REPORT_STATUSES)[number]; duplicateOf?: string; staffNotes?: string; resolvedAt?: string; createdAt: string; updatedAt: string; log?: { at: string; by: string; change: string }[] };
const pk = (benchId: string) => `BENCH#${benchId}`;
export const asReport = (i: Item) => i as unknown as Report;

export async function createReport(b: Record<string, unknown>) {
  const bench = benchById(String(b.benchId || ""));
  if (!bench) throw new HttpError(404, "Unknown bench");
  const category = CATEGORIES.find((c) => c === b.category); if (!category) throw new HttpError(422, "Bad category");
  const description = str(b.description, 1000, 3); if (!description) throw new HttpError(422, "Description is required (3–1000 characters)");
  const rep = (b.reporter || {}) as Record<string, unknown>;
  const email = rep.email ? (isEmail(rep.email) ? String(rep.email).toLowerCase() : undefined) : undefined;
  if (rep.email && !email) throw new HttpError(422, "Bad email");
  const photos = Array.isArray(b.photos) ? (b.photos as { url?: string }[]).filter((p) => typeof p.url === "string" && /^https:\/\//.test(p.url)).slice(0, 3).map((p) => ({ url: p.url as string })) : [];
  const side = b.side ? Number(b.side) : undefined;
  const now = new Date().toISOString(), id = ulid();
  const live = email ? (await listForBench(bench.id)).filter((a) => isLive(a) && a.donor.email === email) : [];
  const r: Report = { id, benchId: bench.id, side, adoptionId: live[0]?.id, category, description, photos, reporter: { name: str(rep.name, 80), email, phone: str(rep.phone, 30) },
    status: "open", duplicateOf: str(b.duplicateOf, 40), createdAt: now, updatedAt: now };
  await getStore().transact([
    { type: "put", item: { PK: pk(bench.id), SK: `REPORT#${id}`, ...r, GSI4PK: "REPORT#open", GSI4SK: now }, ifNotExists: true },
    { type: "put", item: { PK: `REPORT#${id}`, SK: "PTR", ref: { PK: pk(bench.id), SK: `REPORT#${id}` } }, ifNotExists: true },
  ]);
  const link = `${SITE}/?bench=${bench.id}`;
  await sendEmail({ to: VCPA_EMAIL, subject: `Bench ${bench.id}: ${category.replace("_", " ")} reported`, text: `${description}\n\nBench ${bench.id}${side ? ` side ${side}` : ""} — ${link}\nReporter: ${r.reporter?.name || "anonymous"} ${email || ""}\nPhotos: ${photos.map((p) => p.url).join(" ") || "none"}\nReport id ${id}`,
    html: `<p>${description}</p><p>Bench <a href="${link}">${bench.id}</a>${side ? ` side ${side}` : ""}<br>Reporter: ${r.reporter?.name || "anonymous"} ${email || ""}<br>Photos: ${photos.map((p) => `<a href="${p.url}">photo</a>`).join(" ") || "none"}<br>Report id ${id}</p>` }).catch(console.error);
  if (email) await sendEmail({ to: email, subject: `We received your report about bench ${bench.id}`, text: `Thanks. Your report (${id}) about bench ${bench.id} is with the Van Cortlandt Park Alliance. We'll email you when it's fixed.`, html: `<p>Thanks. Your report (${id}) about bench ${bench.id} is with the Van Cortlandt Park Alliance. We'll email you when it's fixed.</p>` }).catch(console.error);
  return r;
}
export async function listReports(status = "open") {
  if (!REPORT_STATUSES.includes(status as Report["status"])) throw new HttpError(422, "Bad status");
  return (await getStore().queryIndex("GSI4", `REPORT#${status}`)).map(asReport);
}
export async function openReportsForBench(benchId: string) {
  return (await getStore().query(pk(benchId), { beginsWith: "REPORT#" })).map(asReport).filter((r) => r.status === "open" || r.status === "acknowledged");
}
export async function getReport(id: string) {
  const ptr = await getStore().get(`REPORT#${id}`, "PTR"); if (!ptr) return undefined;
  const ref = ptr.ref as { PK: string; SK: string }; const i = await getStore().get(ref.PK, ref.SK); return i ? asReport(i) : undefined;
}
export async function patchReport(id: string, p: { status?: string; staffNotes?: string }, by = "system") {
  const r = await getReport(id); if (!r) throw new HttpError(404, "Report not found");
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (p.status) { if (!REPORT_STATUSES.includes(p.status as Report["status"])) throw new HttpError(422, "Bad status"); set.status = p.status; set.GSI4PK = `REPORT#${p.status}`; if (p.status === "fixed" || p.status === "closed") set.resolvedAt = set.updatedAt; }
  if (p.staffNotes !== undefined) set.staffNotes = str(p.staffNotes, 2000) ?? "";
  const change = [p.status && p.status !== r.status && `status ${r.status} → ${p.status}`, p.staffNotes !== undefined && (set.staffNotes || "") !== (r.staffNotes || "") && "notes edited"].filter(Boolean).join(", ");
  if (change) set.log = [...(r.log || []), { at: set.updatedAt as string, by, change }].slice(-50);
  await getStore().update(pk(r.benchId), `REPORT#${r.id}`, set);
  if (p.status === "fixed" && r.status !== "fixed" && r.reporter?.email) await sendEmail({ to: r.reporter.email, subject: `Bench ${r.benchId}: fixed`, text: `Good news: the issue you reported on bench ${r.benchId} has been fixed. Thank you for looking out for the park.`, html: `<p>Good news: the issue you reported on bench ${r.benchId} has been fixed. Thank you for looking out for the park.</p>` }).catch(console.error);
  return { ...r, ...set } as Report;
}
