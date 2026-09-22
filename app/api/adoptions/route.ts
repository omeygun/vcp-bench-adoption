import { body, handle, ip, json, rateLimit } from "@/lib/http";
import { createAdoption, listLive, toPublic, validateRequest } from "@/lib/adoptions";
import { benchById } from "@/lib/benches";
import { sendEmail, VCPA_EMAIL } from "@/lib/email";

export const GET = handle(async () => json((await listLive()).map(toPublic), 200, { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" }));

export const POST = handle(async (req) => {
  rateLimit("adopt:" + ip(req), 10, 3600_000);
  const input = validateRequest(await body(req));
  const a = await createAdoption(input);
  const bench = benchById(a.benchId)!;
  const amount = a.payment.status === "waived" ? "covered by a waiver" : `$${(a.amountCents / 100).toLocaleString()} — a VCPA representative will contact you to arrange payment (online, check or Zelle)`;
  await sendEmail({ to: a.donor.email, subject: `Bench ${a.benchId} request received`, text: `Hi ${a.donor.name},\n\nWe received your request for bench ${a.benchId} (${bench.size} ft ${bench.type === "concrete" ? "concrete-base" : "World's Fair"}), plaque side ${a.side}.\nAmount: ${amount}.\nPlaque text:\n${a.plaque.text}\n\nPlaque installation takes 6–8 weeks after payment and final text. Request id: ${a.id}\n\nVan Cortlandt Park Alliance · info@vancortlandt.org · 718-601-1460`,
    html: `<p>Hi ${a.donor.name},</p><p>We received your request for bench <b>${a.benchId}</b>, plaque side ${a.side}.<br>Amount: ${amount}.</p><pre>${a.plaque.text}</pre><p>Plaque installation takes 6–8 weeks after payment and final text. Request id: ${a.id}</p>` }).catch(console.error);
  await sendEmail({ to: VCPA_EMAIL, subject: `New bench request: ${a.benchId} side ${a.side} (${a.donor.name})`, text: `${a.donor.name} <${a.donor.email}> ${a.donor.phone || ""}\nStatus: ${a.status}, payment: ${a.payment.status}${a.waiverCode ? " (waiver " + a.waiverCode + ")" : ""}\nHonoree: ${a.honoree || "-"}\nPreferred start: ${a.requestedStart || "-"}\nGroup fundraising: ${a.fundraising ? "yes" : "no"}\nQuestions: ${a.questions || "-"}\n\nPlaque:\n${a.plaque.text}\n\nRequest id ${a.id}`, html: `<pre>${a.donor.name} &lt;${a.donor.email}&gt; ${a.donor.phone || ""}\nStatus: ${a.status}, payment: ${a.payment.status}\nHonoree: ${a.honoree || "-"}\nPreferred start: ${a.requestedStart || "-"}\nGroup fundraising: ${a.fundraising ? "yes" : "no"}\nQuestions: ${a.questions || "-"}\n\nPlaque:\n${a.plaque.text}\n\nRequest id ${a.id}</pre>` }).catch(console.error);
  return json({ ...toPublic(a), amountCents: a.amountCents, payment: a.payment.status }, 201);
});
