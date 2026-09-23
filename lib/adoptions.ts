import { getStore, type Item, type Op } from "./store";
import { addYears, today, ulid } from "./ids";
import { benchById, type Bench } from "./benches";
import { getConfig } from "./config";
import { HttpError, isEmail, str } from "./http";
import { redeemOp, validateWaiver } from "./waivers";
import { nextReminderDate } from "./reminders";

export const STATUSES = ["inquiry", "awaiting_payment", "paid", "installed", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];
export const TERM_YEARS = 10;
export const HOLD_DAYS = 30;
export type Adoption = {
  id: string; benchId: string; side: number; status: Status;
  requestedStart?: string; termStart?: string; termEnd?: string;
  donor: { name: string; email: string; phone?: string }; honoree?: string; plaque: { text: string };
  amountCents: number; payment: { status: "pending" | "paid" | "waived"; method?: string; ref?: string };
  fundraising: boolean; acknowledgedTimelineAt: string; questions?: string; notes?: string; relocatedFrom?: string; waiverCode?: string;
  reminders?: { channels: string[]; nextReminderAt?: string; sent: { at: string; channel: string; kind: string }[] };
  log?: { at: string; by: string; change: string }[];
  holdExpiresAt?: number; createdAt: string; updatedAt: string;
};
const sidePrefix = (side: number) => `SIDE#${side}#`;
const pk = (benchId: string) => `BENCH#${benchId}`;

/** Live = still occupies the side. */
export function isLive(a: Adoption, day = today()) {
  if (a.status === "cancelled") return false;
  if (a.termEnd && a.termEnd < day) return false;
  if (a.status === "inquiry" && a.holdExpiresAt && a.holdExpiresAt * 1000 < Date.now()) return false;
  return true;
}
export type SideState = "available" | "pending" | "adopted";
export const sideState = (live: Adoption[]): SideState => (live.some((a) => a.status === "installed") ? "adopted" : live.length ? "pending" : "available");
export type BenchState = "available" | "partial" | "pending" | "adopted";
export function benchState(bench: Bench, live: Adoption[]): BenchState {
  const states = Array.from({ length: bench.sides }, (_, i) => sideState(live.filter((a) => a.side === i + 1)));
  if (states.every((s) => s === "available")) return "available";
  if (states.some((s) => s === "available")) return "partial";
  return states.some((s) => s === "adopted") ? "adopted" : "pending";
}
export const toPublic = (a: Adoption) => ({ id: a.id, benchId: a.benchId, side: a.side, status: a.status, honoree: a.honoree,
  plaque: a.status === "installed" ? a.plaque.text : undefined, termStart: a.termStart, termEnd: a.termEnd, createdAt: a.createdAt });

export const asAdoption = (i: Item) => i as unknown as Adoption;
export async function listLive() {
  const day = today();
  return (await getStore().queryIndex("GSI2", "ADOPTION", { gte: day })).map(asAdoption).filter((a) => isLive(a, day));
}
export async function listAll() { return (await getStore().queryIndex("GSI2", "ADOPTION")).map(asAdoption); }
export async function listForBench(benchId: string) { return (await getStore().query(pk(benchId), { beginsWith: "SIDE#" })).filter((i) => i.SK.split("#").length === 3).map(asAdoption); }
export async function getAdoption(id: string) {
  const ptr = await getStore().get(`ADOPTION#${id}`, "PTR");
  if (!ptr) return undefined;
  const ref = ptr.ref as { PK: string; SK: string };
  const item = await getStore().get(ref.PK, ref.SK);
  return item ? asAdoption(item) : undefined;
}

export type RequestInput = { benchId: string; side: number; donor: Adoption["donor"]; honoree?: string; plaqueText: string; requestedStart?: string; fundraising: boolean; acknowledged: boolean; questions?: string; waiverCode?: string; channels?: string[] };
export function validateRequest(b: Record<string, unknown>): RequestInput {
  const bench = benchById(String(b.benchId || ""));
  if (!bench) throw new HttpError(404, "Unknown bench");
  const side = Number(b.side);
  if (!(side >= 1 && side <= bench.sides)) throw new HttpError(422, `Bench ${bench.id} has ${bench.sides} plaque side${bench.sides > 1 ? "s" : ""}`);
  const donor = (b.donor || {}) as Record<string, unknown>;
  const name = str(donor.name, 80, 1); if (!name) throw new HttpError(422, "Name is required (max 80 characters)");
  if (!isEmail(donor.email)) throw new HttpError(422, "A valid email is required");
  const plaqueText = str(b.plaqueText ?? (b.plaque as Record<string, unknown> | undefined)?.text, 300, 1);
  if (!plaqueText) throw new HttpError(422, "Plaque text is required (max 300 characters)");
  if (plaqueText.split("\n").length > 7) throw new HttpError(422, "Plaque text may have at most 7 lines");
  if (b.acknowledged !== true && b.acknowledgedTimeline !== true) throw new HttpError(422, "Please acknowledge the 6–8 week timeline");
  const requestedStart = str(b.requestedStart, 10);
  if (requestedStart && !/^\d{4}-\d{2}(-\d{2})?$/.test(requestedStart)) throw new HttpError(422, "requestedStart must be YYYY-MM or YYYY-MM-DD");
  const channels = Array.isArray(b.channels) ? (b.channels as unknown[]).filter((c): c is string => c === "email" || c === "sms") : ["email"];
  return { benchId: bench.id, side, donor: { name, email: String(donor.email).toLowerCase(), phone: str(donor.phone, 30) }, honoree: str(b.honoree, 120), plaqueText, requestedStart,
    fundraising: b.fundraising === true, acknowledged: true, questions: str(b.questions, 1000), waiverCode: str(b.waiverCode, 12), channels: channels.length ? channels : ["email"] };
}

/** Request a side: free-side check, optional waiver, then one transaction (adoption + pointer + side lock [+ waiver]). */
export async function createAdoption(input: RequestInput) {
  const store = getStore();
  const bench = benchById(input.benchId)!;
  const existing = (await listForBench(bench.id)).filter((a) => a.side === input.side);
  if (existing.some((a) => isLive(a))) throw new HttpError(409, `Side ${input.side} of bench ${bench.id} is already taken`);
  const lock = await store.get(pk(bench.id), `SIDE#${input.side}`);
  const version = Number(lock?.version ?? 0);
  const waiver = input.waiverCode ? await validateWaiver(input.waiverCode, bench) : undefined;
  const pricing = await getConfig("PRICING");
  const now = new Date().toISOString(), id = ulid();
  const a: Adoption = {
    id, benchId: bench.id, side: input.side, status: waiver ? "paid" : "inquiry", requestedStart: input.requestedStart,
    donor: input.donor, honoree: input.honoree, plaque: { text: input.plaqueText },
    amountCents: waiver ? 0 : pricing.adoptCents, payment: waiver ? { status: "waived", method: "waiver", ref: waiver.code } : { status: "pending" },
    fundraising: input.fundraising, acknowledgedTimelineAt: now, questions: input.questions, waiverCode: waiver?.code,
    reminders: { channels: input.channels || ["email"], sent: [] },
    holdExpiresAt: waiver ? undefined : Math.floor(Date.now() / 1000) + HOLD_DAYS * 86400, createdAt: now, updatedAt: now,
  };
  const item: Item = { PK: pk(bench.id), SK: sidePrefix(input.side) + id, ...a, GSI1PK: `ADOPTER#${a.donor.email}`, GSI1SK: now, GSI2PK: "ADOPTION", GSI2SK: "9999-12-31", ttl: a.holdExpiresAt };
  const ops: Op[] = [
    { type: "put", item, ifNotExists: true },
    { type: "put", item: { PK: `ADOPTION#${id}`, SK: "PTR", ref: { PK: item.PK, SK: item.SK } }, ifNotExists: true },
    { type: "update", pk: pk(bench.id), sk: `SIDE#${input.side}`, set: { version: version + 1, updatedAt: now }, condition: lock ? { equals: { attr: "version", value: version } } : { attrNotExists: "version" } },
  ];
  if (waiver) ops.push(redeemOp(waiver.code, id, a.donor.email));
  await store.transact(ops);
  return a;
}

export type Patch = { status?: Status; payment?: Partial<Adoption["payment"]>; termStart?: string; notes?: string; relocatedFrom?: string; plaqueText?: string };
export async function patchAdoption(id: string, p: Patch, by = "system") {
  const a = await getAdoption(id);
  if (!a) throw new HttpError(404, "Adoption not found");
  // the combination after this patch must make sense
  const status = p.status || a.status, pay = p.payment?.status || a.payment.status, start = p.termStart || a.termStart;
  if ((status === "paid" || status === "installed") && pay === "pending") throw new HttpError(422, `Can't mark ${status} while payment is pending — record the payment first`);
  if (status === "installed" && !start) throw new HttpError(422, "Set the installed-on date before marking installed");
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (p.status) { if (!STATUSES.includes(p.status)) throw new HttpError(422, "Bad status"); set.status = p.status; if (p.status !== "inquiry") { set.holdExpiresAt = undefined; set.ttl = undefined; } }
  if (p.payment) set.payment = { ...a.payment, ...p.payment };
  if (p.notes !== undefined) set.notes = str(p.notes, 2000) ?? "";
  if (p.relocatedFrom) set.relocatedFrom = p.relocatedFrom;
  if (p.plaqueText) { const t = str(p.plaqueText, 300, 1); if (!t || t.split("\n").length > 7) throw new HttpError(422, "Plaque text: max 300 characters, 7 lines"); set.plaque = { text: t }; }
  if (p.termStart) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.termStart)) throw new HttpError(422, "termStart must be YYYY-MM-DD");
    const termEnd = addYears(p.termStart, TERM_YEARS);
    const next = nextReminderDate(termEnd, (await getConfig("REMINDERS")).offsetsDays);
    Object.assign(set, { termStart: p.termStart, termEnd, GSI2SK: termEnd, GSI3PK: next ? "REMINDER" : undefined, GSI3SK: next,
      reminders: { ...(a.reminders || { channels: ["email"], sent: [] }), nextReminderAt: next } });
  }
  if (p.status === "cancelled" || (p.status && p.status !== "installed" && a.status === "installed")) {   // cancelling or leaving installed: stop reminders
    Object.assign(set, { GSI3PK: undefined, GSI3SK: undefined, reminders: { ...(a.reminders || { channels: ["email"], sent: [] }), nextReminderAt: undefined } });
  }
  const change = [p.status && p.status !== a.status && `status ${a.status} → ${p.status}`, p.payment?.status && p.payment.status !== a.payment.status && `payment ${a.payment.status} → ${p.payment.status}`,
    p.termStart && p.termStart !== a.termStart && `installed on ${p.termStart}`, set.plaque && `plaque text edited`, p.notes !== undefined && (set.notes || "") !== (a.notes || "") && "notes edited"].filter(Boolean).join(", ");
  if (change) set.log = [...(a.log || []), { at: set.updatedAt as string, by, change }].slice(-50);
  await getStore().update(pk(a.benchId), sidePrefix(a.side) + a.id, set);
  return { ...a, ...set } as Adoption;
}
/** Admin search: case-insensitive substring over the fields staff look people up by. */
export const matchesQuery = (a: Adoption, q: string) => [a.benchId, a.id, a.donor.name, a.donor.email, a.donor.phone, a.honoree, a.plaque.text].some((v) => v?.toLowerCase().includes(q));
