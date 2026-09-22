import { bad, handle, json } from "@/lib/http";
import { verifyStripeSignature } from "@/lib/stripe";
import { getAdoption, patchAdoption, createAdoption } from "@/lib/adoptions";
import { addDays } from "@/lib/ids";
/** checkout.session.completed with metadata.adoptionId -> renewal item, paid. */
export const POST = handle(async (req) => {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) return bad("Bad signature", 400);
  const evt = JSON.parse(raw) as { type: string; data: { object: { id: string; amount_total?: number; metadata?: Record<string, string> } } };
  if (evt.type !== "checkout.session.completed") return json({ ignored: evt.type });
  const s = evt.data.object, prev = s.metadata?.adoptionId ? await getAdoption(s.metadata.adoptionId) : undefined;
  if (!prev) return json({ ignored: "no adoption" });
  // renewal: new item on the same side starting the day after the old term ends, already paid
  const next = await createAdoption({ benchId: prev.benchId, side: prev.side, donor: prev.donor, honoree: prev.honoree, plaqueText: prev.plaque.text, fundraising: false, acknowledged: true,
    requestedStart: prev.termEnd ? addDays(prev.termEnd, 1) : undefined, channels: prev.reminders?.channels }).catch(() => undefined);
  if (!next) return json({ ignored: "side not free (already renewed?)" });
  await patchAdoption(next.id, { status: "paid", payment: { status: "paid", method: "online", ref: s.id }, notes: `Renewal of ${prev.id}` });
  await patchAdoption(prev.id, { notes: `${prev.notes || ""}\nRenewed by ${next.id}`.trim() });
  return json({ renewal: next.id });
});
