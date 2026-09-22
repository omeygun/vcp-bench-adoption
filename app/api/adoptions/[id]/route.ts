import { body, handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { patchAdoption, type Patch } from "@/lib/adoptions";

export const PATCH = handle(async (req, { params }) => {
  await requireAdmin(req);
  const { id } = await params;
  const b = (await body(req)) as Patch;
  return json(await patchAdoption(id, { status: b.status, payment: b.payment, termStart: b.termStart, notes: b.notes, relocatedFrom: b.relocatedFrom, plaqueText: b.plaqueText }));
});
export const DELETE = handle(async (req, { params }) => {
  await requireAdmin(req);
  const { id } = await params;
  return json(await patchAdoption(id, { status: "cancelled" }));
});
