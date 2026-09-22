"use client";
import { useState } from "react";
export default function Login() {
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const expired = typeof location !== "undefined" && location.search.includes("expired");
  return (
    <main className="login">
      <h1 style={{ fontSize: 28, color: "var(--green-900)" }}>VCP Benches · Staff sign-in</h1>
      <p style={{ color: "var(--muted)" }}>Enter your staff email and we&apos;ll send a one-time sign-in link.</p>
      {expired && !msg && <p style={{ color: "#a23b2f" }}>That link expired or was already used. Request a new one.</p>}
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); const email = new FormData(e.currentTarget).get("email"); const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); const j = await r.json(); setMsg(j.message || j.error); setBusy(false); }}>
        <input name="email" type="email" required placeholder="you@vancortlandt.org" />
        <button className="btn primary" disabled={busy}>{busy ? "Sending…" : "Send sign-in link"}</button>
      </form>
      {msg && <p>{msg}</p>}
      {process.env.NODE_ENV !== "production" && <p style={{ color: "var(--muted)", fontSize: 13 }}>Dev: without RESEND_API_KEY the link is printed in the server console.</p>}
    </main>
  );
}
