/** Resend when RESEND_API_KEY is set, otherwise log to the server console (dev). */
export async function sendEmail(msg: { to: string; subject: string; html: string; text?: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log(`\n[email -> ${msg.to}] ${msg.subject}\n${msg.text || msg.html.replace(/<[^>]+>/g, "")}\n`); return { id: "console" }; }
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "VCP Benches <benches@vancortlandt.org>", ...msg }) });
  if (!r.ok) throw new Error("Resend failed: " + (await r.text()));
  return (await r.json()) as { id: string };
}
export const VCPA_EMAIL = process.env.VCPA_NOTIFY_EMAIL || "info@vancortlandt.org";
export const SITE = process.env.AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
