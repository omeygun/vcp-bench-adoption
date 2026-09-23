import { body, handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { getAdoption, patchAdoption, type Adoption, type Patch } from "@/lib/adoptions";
import { sendEmail, SITE } from "@/lib/email";

/** One short email to the donor whenever staff move their request to a new status. */
const NOTICE: Partial<Record<Adoption["status"], (a: Adoption) => string>> = {
  awaiting_payment: (a) => `Your request for bench ${a.benchId} is approved. A VCPA representative will contact you to arrange payment of $${(a.amountCents / 100).toLocaleString()} (online, check or Zelle).`,
  paid: (a) => `Thank you, we received your payment for bench ${a.benchId}. Plaque installation takes 6–8 weeks; we'll email you when it's in place.`,
  installed: (a) => `Your plaque on bench ${a.benchId} is now in place. Here's a page you can share with family and friends:\n${SITE}/bench/${a.benchId}`,
  cancelled: (a) => `Your request for bench ${a.benchId} has been cancelled. If this is unexpected, reply to this email or call 718-601-1460.`,
};
const SUBJECT: Record<string, string> = { awaiting_payment: "ready for payment", paid: "payment received", installed: "your plaque is installed", cancelled: "request cancelled" };
async function notify(before: Adoption["status"], a: Adoption) {
  const body = before !== a.status && NOTICE[a.status]?.(a);
  if (!body) return;
  const text = `Hi ${a.donor.name},\n\n${body}\n\nRequest id: ${a.id}\nVan Cortlandt Park Alliance · info@vancortlandt.org · 718-601-1460`;
  await sendEmail({ to: a.donor.email, subject: `Bench ${a.benchId}: ${SUBJECT[a.status]}`, text,
    html: `<pre style="font:inherit;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>` }).catch(console.error);
}

export const PATCH = handle(async (req, { params }) => {
  const me = await requireAdmin(req);
  const { id } = await params;
  const b = (await body(req)) as Patch;
  const before = (await getAdoption(id))?.status;
  const a = await patchAdoption(id, { status: b.status, payment: b.payment, termStart: b.termStart, notes: b.notes, relocatedFrom: b.relocatedFrom, plaqueText: b.plaqueText }, me.email);
  if (before) await notify(before, a);
  return json(a);
});
export const DELETE = handle(async (req, { params }) => {
  const me = await requireAdmin(req);
  const { id } = await params;
  const before = (await getAdoption(id))?.status;
  const a = await patchAdoption(id, { status: "cancelled" }, me.email);
  if (before) await notify(before, a);
  return json(a);
});
