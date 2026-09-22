/** Seed staff, pricing and sample adoptions/reports through the store. Works for the file store and MongoDB.
 *  npx tsx tools/seed.ts   (set MONGODB_URI to seed a real database) */
import { closeStore, getStore } from "../lib/store";
import { setConfig } from "../lib/config";
import { createAdoption, patchAdoption } from "../lib/adoptions";
import { createReport } from "../lib/reports";
import { createWaiver } from "../lib/waivers";
import { BENCHES } from "../lib/benches";
import { setStaffPassword } from "../lib/auth";
import { addYears } from "../lib/ids";

process.env.RESEND_API_KEY = "";   // never email from a seed
const origLog = console.log; console.log = (...a: unknown[]) => { if (!String(a[0]).startsWith("\n[email")) origLog(...a); };
const rnd = (() => { let s = 42; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const FIRST = ["Maria", "James", "Aisha", "Daniel", "Rosa", "Kevin", "Priya", "Tom", "Grace", "Luis", "Hannah", "Omar"], LAST = ["Rivera", "Cohen", "Okafor", "Nguyen", "Murphy", "Patel", "Santos", "Kim", "Brown", "Ali"];
const PLAQUES = ["In loving memory of\n{n}\nwho walked these trails every morning", "For {n}\nwith love from the whole family", "{n}\n1948 – 2024\n\"Sit a while, and listen to the birds\"", "In honor of {n}\n40 years of coaching on the Parade Ground", "Dedicated to {n}\nand every Sunday at the lake"];

async function main() {
  const store = getStore();
  const staffEmail = process.env.ADMIN_EMAIL || "matinkositchutima@gmail.com", staffPw = process.env.ADMIN_PASSWORD || "changeme-please-1";
  await setStaffPassword(staffEmail, staffPw, { mustChange: true }); const staff = [`${staffEmail} (password: ${staffPw})`];
  await setConfig("PRICING", { adoptCents: 350000 });
  const benches = [...BENCHES].sort(() => rnd() - 0.5).slice(0, 55);
  let n = 0;
  for (const b of benches) {
    const name = `${pick(FIRST)} ${pick(LAST)}`, honoree = `${pick(FIRST)} ${pick(LAST)}`;
    const a = await createAdoption({ benchId: b.id, side: 1, donor: { name, email: `${name.toLowerCase().replace(" ", ".")}@example.com` }, honoree, plaqueText: pick(PLAQUES).replace("{n}", honoree), fundraising: rnd() < 0.2, acknowledged: true, channels: ["email"] }).catch(() => undefined);
    if (!a) continue; n++;
    const r = rnd();
    if (r < 0.55) { const start = addYears(new Date(Date.now() - rnd() * 9 * 365 * 864e5).toISOString().slice(0, 10), 0); await patchAdoption(a.id, { status: "installed", termStart: start, payment: { status: "paid", method: pick(["online", "check", "zelle"]) } }); }
    else if (r < 0.7) await patchAdoption(a.id, { status: "paid", payment: { status: "paid", method: "check" } });
    else if (r < 0.85) await patchAdoption(a.id, { status: "awaiting_payment" });
    if (b.sides === 2 && rnd() < 0.3) { const a2 = await createAdoption({ benchId: b.id, side: 2, donor: { name: "Second Side", email: "second.side@example.com" }, plaqueText: "Side two plaque", fundraising: false, acknowledged: true }).catch(() => undefined); if (a2 && rnd() < 0.6) await patchAdoption(a2.id, { status: "installed", termStart: "2023-06-01", payment: { status: "paid", method: "online" } }); }
  }
  for (const b of benches.slice(0, 5)) await createReport({ benchId: b.id, category: pick(["damaged_bench", "damaged_plaque", "graffiti"]), description: "Seeded sample report: slat cracked near the left armrest.", reporter: { name: "Sample Reporter", email: "reporter@example.com" } });
  const w = await createWaiver({ label: "Seed waiver (dev)", createdBy: "seed" });
  origLog(`seeded ${n} adoptions, 5 reports, staff ${staff.join(", ")}, waiver code ${w.code}`);
  void store;
  await closeStore();
}
main().catch((e) => { console.error(e); process.exit(1); });
