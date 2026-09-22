/** npx tsx tests/adoptions.check.ts — fails loudly if the adoption rules break. Uses a temp file store. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vcp-"));
process.env.RESEND_API_KEY = "";
async function main() {
  const { createAdoption, validateRequest, patchAdoption, listLive, benchState, isLive, listForBench } = await import("../lib/adoptions");
  const { createWaiver, getWaiver } = await import("../lib/waivers");
  const { nextReminderDate } = await import("../lib/reminders");
  const { benchById, BENCHES } = await import("../lib/benches");
  const { setConfig } = await import("../lib/config");
  const { closeStore } = await import("../lib/store");

  const b8 = BENCHES.find((b) => b.size === 8)!, b4 = BENCHES.find((b) => b.size === 4)!;
  const base = (benchId: string, side = 1, extra: Record<string, unknown> = {}) => ({ benchId, side, donor: { name: "Test Donor", email: "t@example.com" }, plaqueText: "Line 1\nLine 2", acknowledged: true, ...extra });

  // validation
  assert.throws(() => validateRequest(base(b4.id, 2)), /1 plaque side/);
  assert.throws(() => validateRequest(base(b8.id, 1, { plaqueText: "x".repeat(301) })), /300/);
  assert.throws(() => validateRequest(base(b8.id, 1, { plaqueText: "1\n2\n3\n4\n5\n6\n7\n8" })), /7 lines/);
  assert.throws(() => validateRequest(base(b8.id, 1, { acknowledged: false })), /acknowledge/);
  assert.throws(() => validateRequest(base("999Z")), /Unknown bench/);

  // free side, double booking, second side of an 8 ft
  await setConfig("PRICING", { adoptCents: 350000 });
  const a1 = await createAdoption(validateRequest(base(b8.id, 1)));
  assert.equal(a1.status, "inquiry"); assert.equal(a1.amountCents, 350000);
  await assert.rejects(createAdoption(validateRequest(base(b8.id, 1))), /already taken/);
  const a2 = await createAdoption(validateRequest(base(b8.id, 2)));
  assert.equal(benchState(b8, await listForBench(b8.id)), "pending");

  // install sets a 10-year term and schedules the first reminder
  const inst = await patchAdoption(a1.id, { status: "installed", termStart: "2026-05-14", payment: { status: "paid", method: "check" } });
  assert.equal(inst.termEnd, "2036-05-14");
  assert.equal(inst.reminders?.nextReminderAt, "2035-05-15");   // 365 days before, 2036 is a leap year
  assert.equal(nextReminderDate("2036-05-14", [-365, -30, 0], "2035-05-15"), "2036-04-14");
  assert.equal(nextReminderDate("2036-05-14", [-365, -30, 0], "2036-05-14"), undefined);

  // cancel frees the side
  await patchAdoption(a2.id, { status: "cancelled" });
  assert.equal((await listLive()).filter((a) => a.benchId === b8.id).length, 1);
  assert.equal(benchState(b8, (await listForBench(b8.id)).filter((a) => isLive(a))), "partial");
  const a3 = await createAdoption(validateRequest(base(b8.id, 2)));
  assert.ok(a3.id !== a2.id);

  // waiver: single use, restricted
  const w = await createWaiver({ label: "check", createdBy: "test", restrictTo: { region: b4.region } });
  const other = BENCHES.find((b) => b.region !== b4.region)!;
  await assert.rejects(createAdoption(validateRequest(base(other.id, 1, { waiverCode: w.code }))), /only valid in region/);
  const free = await createAdoption(validateRequest(base(b4.id, 1, { waiverCode: w.code })));
  assert.equal(free.payment.status, "waived"); assert.equal(free.amountCents, 0); assert.equal(free.status, "paid");
  assert.ok((await getWaiver(w.code))!.usedAt);
  const b4b = BENCHES.find((b) => b.size === 4 && b.region === b4.region && b.id !== b4.id)!;
  await assert.rejects(createAdoption(validateRequest(base(b4b.id, 1, { waiverCode: w.code }))), /already used/);

  console.log("adoptions.check: ok", { bench8: b8.id, bench4: b4.id, ok: !!benchById(b8.id) });
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  await closeStore();

}
main().catch((e) => { console.error(e); process.exit(1); });
