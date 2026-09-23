/** Minimal key/value store, single-collection design (PK/SK + index fields GSI1PK..GSI4SK on each item).
 *  MONGODB_URI set -> MongoDB (Atlas); otherwise a JSON file in .data/ (local dev, tests). */
import { MongoClient, type Collection, type Document, type Filter } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";
// Some home routers return malformed SRV answers to Node (querySrv EBADRESP) for mongodb+srv URIs; use public DNS in dev.
if (process.env.NODE_ENV !== "production") dns.setServers(["1.1.1.1", "8.8.8.8"]);

export type Item = Record<string, unknown> & { PK: string; SK: string };
export type SkRange = { beginsWith?: string; lte?: string; gte?: string };
export type Condition = { attrNotExists?: string; equals?: { attr: string; value: unknown } };
export type Op =
  | { type: "put"; item: Item; ifNotExists?: boolean }
  | { type: "update"; pk: string; sk: string; set: Record<string, unknown>; condition?: Condition };

export interface Store {
  get(pk: string, sk: string): Promise<Item | undefined>;
  put(item: Item, ifNotExists?: boolean): Promise<void>;
  update(pk: string, sk: string, set: Record<string, unknown>, condition?: Condition): Promise<void>;
  query(pk: string, sk?: SkRange): Promise<Item[]>;
  queryIndex(index: "GSI1" | "GSI2" | "GSI3" | "GSI4", pk: string, sk?: SkRange): Promise<Item[]>;
  transact(ops: Op[]): Promise<void>;
}
export class ConditionFailed extends Error { constructor(msg = "condition failed") { super(msg); this.name = "ConditionFailed"; } }

const inRange = (sk: string, r?: SkRange) =>
  !r || ((!r.beginsWith || sk.startsWith(r.beginsWith)) && (!r.lte || sk <= r.lte) && (!r.gte || sk >= r.gte));

// ---------- file store ----------
class FileStore implements Store {
  private file: string;
  constructor(dir = process.env.DATA_DIR || ".data") { fs.mkdirSync(dir, { recursive: true }); this.file = path.join(dir, "db.json"); }
  private load(): Item[] { try { return JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { return []; } }
  private save(items: Item[]) { fs.writeFileSync(this.file, JSON.stringify(items)); }
  private check(items: Item[], op: Op) {
    if (op.type === "put") { if (op.ifNotExists && items.some((i) => i.PK === op.item.PK && i.SK === op.item.SK)) throw new ConditionFailed(`exists ${op.item.PK}/${op.item.SK}`); return; }
    const cur = items.find((i) => i.PK === op.pk && i.SK === op.sk);
    const c = op.condition;
    if (c?.attrNotExists && cur && cur[c.attrNotExists] !== undefined) throw new ConditionFailed(`${c.attrNotExists} exists`);
    if (c?.equals && (cur?.[c.equals.attr] ?? undefined) !== c.equals.value) throw new ConditionFailed(`${c.equals.attr} mismatch`);
  }
  private apply(items: Item[], op: Op) {
    if (op.type === "put") { const i = items.findIndex((x) => x.PK === op.item.PK && x.SK === op.item.SK); i >= 0 ? (items[i] = op.item) : items.push(op.item); return; }
    const i = items.findIndex((x) => x.PK === op.pk && x.SK === op.sk);
    const base = i >= 0 ? items[i] : ({ PK: op.pk, SK: op.sk } as Item);
    const next = { ...base, ...op.set } as Item;
    i >= 0 ? (items[i] = next) : items.push(next);
  }
  async get(pk: string, sk: string) { return this.load().find((i) => i.PK === pk && i.SK === sk); }
  async put(item: Item, ifNotExists = false) { await this.transact([{ type: "put", item, ifNotExists }]); }
  async update(pk: string, sk: string, set: Record<string, unknown>, condition?: Condition) { await this.transact([{ type: "update", pk, sk, set, condition }]); }
  async query(pk: string, sk?: SkRange) { return this.load().filter((i) => i.PK === pk && inRange(i.SK, sk)).sort((a, b) => (a.SK < b.SK ? -1 : 1)); }
  async queryIndex(index: string, pk: string, sk?: SkRange) {
    const pkA = index + "PK", skA = index + "SK";
    return this.load().filter((i) => i[pkA] === pk && inRange(String(i[skA] ?? ""), sk)).sort((a, b) => (String(a[skA]) < String(b[skA]) ? -1 : 1));
  }
  async transact(ops: Op[]) {
    const items = this.load();
    for (const op of ops) this.check(items, op);   // all-or-nothing: check everything first
    for (const op of ops) this.apply(items, op);
    this.save(items);
  }
}

// ---------- MongoDB store ----------
type Doc = Item & { expiresAt?: Date };
const g = globalThis as unknown as { __vcpMongo?: MongoClient };
function client() { return (g.__vcpMongo ??= new MongoClient(process.env.MONGODB_URI!, { maxPoolSize: 10 })); }   // reused across serverless invocations
const skFilter = (attr: string, r?: SkRange): Filter<Doc> => {
  const f: Record<string, unknown> = {};
  if (r?.beginsWith) f.$regex = "^" + r.beginsWith.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (r?.gte) f.$gte = r.gte;
  if (r?.lte) f.$lte = r.lte;
  return Object.keys(f).length ? ({ [attr]: f } as Filter<Doc>) : {};
};
const condFilter = (c?: Condition): Filter<Doc> => ({
  ...(c?.attrNotExists ? { [c.attrNotExists]: { $exists: false } } : {}),
  ...(c?.equals ? { [c.equals.attr]: c.equals.value } : {}),
} as Filter<Doc>);
/** Our items carry `ttl` in epoch seconds; Mongo's TTL index needs a Date, so mirror it into `expiresAt`. */
const withTtl = (doc: Record<string, unknown>) => ("ttl" in doc ? { ...doc, expiresAt: typeof doc.ttl === "number" ? new Date(doc.ttl * 1000) : undefined } : doc);
const strip = (d: Doc | null): Item | undefined => { if (!d) return undefined; const { _id, expiresAt, ...rest } = d as Doc & { _id?: unknown }; void _id; void expiresAt; return rest as Item; };

class MongoStore implements Store {
  private get col(): Collection<Doc> { return client().db(process.env.MONGODB_DB || "vcp-benches").collection<Doc>("items"); }
  /** A failed/closed connection must not poison later invocations: drop the cached client so the next call reconnects. */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); }
    catch (e) { if (/Topology|ServerSelection|Network|MongoNotConnected/.test((e as Error)?.name || "")) { const c = g.__vcpMongo; g.__vcpMongo = undefined; store = undefined; c?.close().catch(() => {}); } throw e; }
  }
  private setDoc(set: Record<string, unknown>) {
    const s = withTtl(set), $set: Record<string, unknown> = {}, $unset: Record<string, ""> = {};
    for (const [k, v] of Object.entries(s)) v === undefined ? ($unset[k] = "") : ($set[k] = v);
    return { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) };
  }
  async get(pk: string, sk: string) { return this.run(async () => strip(await this.col.findOne({ PK: pk, SK: sk }))); }
  async put(item: Item, ifNotExists = false) { return this.run(async () => {
    const doc = withTtl(item) as Doc;
    if (ifNotExists) { try { await this.col.insertOne(doc); } catch (e) { if ((e as { code?: number }).code === 11000) throw new ConditionFailed(`exists ${item.PK}/${item.SK}`); throw e; } }
    else await this.col.replaceOne({ PK: item.PK, SK: item.SK }, doc, { upsert: true });
  }); }
  async update(pk: string, sk: string, set: Record<string, unknown>, condition?: Condition) { return this.run(async () => {
    const r = await this.col.updateOne({ PK: pk, SK: sk, ...condFilter(condition) }, this.setDoc(set), { upsert: !condition?.equals && !(await this.col.countDocuments({ PK: pk, SK: sk }, { limit: 1 })) });
    if (r.matchedCount === 0 && r.upsertedCount === 0) throw new ConditionFailed(`${pk}/${sk} condition`);
  }); }
  async query(pk: string, sk?: SkRange) { return this.run(async () => (await this.col.find({ PK: pk, ...skFilter("SK", sk) }).sort({ SK: 1 }).toArray()).map((d) => strip(d)!)); }
  async queryIndex(index: string, pk: string, sk?: SkRange) {
    const pkA = index + "PK", skA = index + "SK";
    return this.run(async () => (await this.col.find({ [pkA]: pk, ...skFilter(skA, sk) } as Filter<Doc>).sort({ [skA]: 1 }).toArray()).map((d) => strip(d)!));
  }
  /** Multi-document transaction (needs a replica set: Atlas, or `mongod --replSet`). */
  async transact(ops: Op[]) { return this.run(async () => {
    const session = client().startSession();
    try {
      await session.withTransaction(async () => {
        for (const op of ops) {
          if (op.type === "put") {
            const doc = withTtl(op.item) as Doc;
            if (op.ifNotExists) { try { await this.col.insertOne(doc, { session }); } catch (e) { if ((e as { code?: number }).code === 11000) throw new ConditionFailed(`exists ${op.item.PK}/${op.item.SK}`); throw e; } }
            else await this.col.replaceOne({ PK: op.item.PK, SK: op.item.SK }, doc, { upsert: true, session });
          } else {
            const exists = await this.col.countDocuments({ PK: op.pk, SK: op.sk }, { limit: 1, session });
            if (!exists && op.condition?.equals) throw new ConditionFailed(`${op.pk}/${op.sk} missing`);
            const r = await this.col.updateOne({ PK: op.pk, SK: op.sk, ...condFilter(op.condition) }, this.setDoc(op.set), { upsert: !exists, session });
            if (r.matchedCount === 0 && r.upsertedCount === 0) throw new ConditionFailed(`${op.pk}/${op.sk} condition`);
          }
        }
      });
    } finally { await session.endSession(); }
  }); }
}
export async function ensureIndexes() {
  const col = client().db(process.env.MONGODB_DB || "vcp-benches").collection<Document>("items");
  await col.createIndex({ PK: 1, SK: 1 }, { unique: true });
  for (const i of ["GSI1", "GSI2", "GSI3", "GSI4"]) await col.createIndex({ [i + "PK"]: 1, [i + "SK"]: 1 }, { sparse: true });
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

let store: Store | undefined;
export function getStore(): Store { return (store ??= process.env.MONGODB_URI ? new MongoStore() : new FileStore()); }
export const _FileStore = FileStore;   // tests
/** Scripts and tests: release the Mongo connection so the process can exit. */
export async function closeStore() { if (g.__vcpMongo) { await g.__vcpMongo.close(); g.__vcpMongo = undefined; } store = undefined; }
