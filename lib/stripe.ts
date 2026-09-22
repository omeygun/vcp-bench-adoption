import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE } from "./email";
/** Stripe over plain fetch: one Checkout Session for a renewal, one webhook verifier. No SDK. */
export async function createRenewalCheckout(a: { id: string; benchId: string; side: number }, amountCents: number, email?: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const p = new URLSearchParams({ mode: "payment", "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amountCents), "line_items[0][price_data][product_data][name]": `Bench ${a.benchId} side ${a.side} — 10-year renewal`,
    "metadata[adoptionId]": a.id, success_url: `${SITE}/?bench=${a.benchId}&renewed=1`, cancel_url: `${SITE}/?bench=${a.benchId}` });
  if (email) p.set("customer_email", email);
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: p });
  if (!r.ok) throw new Error("Stripe: " + (await r.text()));
  return ((await r.json()) as { url: string }).url;
}
export function verifyStripeSignature(raw: string, header: string | null, tolerance = 300) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t); if (!t || Math.abs(Date.now() / 1000 - t) > tolerance) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const got = header.split(",").filter((kv) => kv.startsWith("v1=")).map((kv) => kv.slice(3));
  return got.some((g) => g.length === expected.length && timingSafeEqual(Buffer.from(g), Buffer.from(expected)));
}
