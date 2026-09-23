import { handle } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { listAll, matchesQuery } from "@/lib/adoptions";

/** Adoption requests as CSV (same status/q filters as the Requests page), for accounting and plaque orders. */
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // stop spreadsheets running it as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const GET = handle(async (req) => {
  await requireAdmin(req);
  const u = new URL(req.url), status = u.searchParams.get("status") || "", q = (u.searchParams.get("q") || "").trim().toLowerCase();
  const rows = (await listAll()).filter((a) => (!status || a.status === status) && (!q || matchesQuery(a, q))).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const head = ["id", "created", "bench", "side", "status", "payment", "method", "ref", "amount_usd", "donor", "email", "phone", "honoree", "plaque", "term_start", "term_end", "notes"];
  const lines = rows.map((a) => [a.id, a.createdAt.slice(0, 10), a.benchId, a.side, a.status, a.payment.status, a.payment.method, a.payment.ref, (a.amountCents / 100).toFixed(2),
    a.donor.name, a.donor.email, a.donor.phone, a.honoree, a.plaque.text, a.termStart, a.termEnd, a.notes].map(cell).join(","));
  return new Response([head.join(","), ...lines].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="bench-requests-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
});
