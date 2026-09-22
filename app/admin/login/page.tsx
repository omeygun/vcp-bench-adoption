"use client";
import { useState } from "react";
export default function Login() {
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <h1 style={{ fontSize: 28, color: "var(--green-900)" }}>VCP Benches · Staff sign-in</h1>
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); const f = new FormData(e.currentTarget);
        const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.get("email"), password: f.get("password") }) });
        const j = await r.json().catch(() => ({})); setBusy(false);
        if (!r.ok) return setErr(j.error || "Sign-in failed");
        location.href = j.mustChange ? "/admin/staff?change=1" : "/admin"; }}>
        <input name="email" type="email" required autoComplete="username" placeholder="you@vancortlandt.org" />
        <input name="password" type="password" required autoComplete="current-password" placeholder="Password" />
        <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      {err && <p style={{ color: "#a23b2f" }}>{err}</p>}
      <p style={{ color: "var(--muted)", fontSize: 13 }}>Forgot your password? Ask another admin to reset it from the Staff page.</p>
    </main>
  );
}
