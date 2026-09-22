"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function useAction() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); router.refresh(); } catch (e) { setErr((e as Error).message); } setBusy(false); };
  return { busy, err, run };
}

export function RequestActions({ id, status, payment, termStart, notes }: { id: string; status: string; payment: { status: string; method?: string; ref?: string }; termStart?: string; notes?: string }) {
  const { busy, err, run } = useAction();
  const [f, setF] = useState({ status, paymentStatus: payment.status, method: payment.method || "", ref: payment.ref || "", termStart: termStart || "", notes: notes || "" });
  const save = () => run(() => call(`/api/adoptions/${id}`, "PATCH", { status: f.status, payment: { status: f.paymentStatus, method: f.method || undefined, ref: f.ref || undefined }, termStart: f.termStart || undefined, notes: f.notes }));
  return (
    <div className="actions">
      <div className="row">
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{["inquiry", "awaiting_payment", "paid", "installed", "cancelled"].map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.paymentStatus} onChange={(e) => setF({ ...f, paymentStatus: e.target.value })}>{["pending", "paid", "waived"].map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="">method…</option>{["online", "check", "zelle", "waiver"].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="row"><input placeholder="payment ref" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /><label className="muted" style={{ fontSize: 12 }}>installed on <input type="date" value={f.termStart} onChange={(e) => setF({ ...f, termStart: e.target.value })} /></label></div>
      <textarea placeholder="staff notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} />
      <div className="row"><button className="btn primary" disabled={busy} onClick={save}>Save</button>{err && <span style={{ color: "#a23b2f" }}>{err}</span>}</div>
    </div>
  );
}

export function ReportActions({ id, status, notes }: { id: string; status: string; notes?: string }) {
  const { busy, err, run } = useAction();
  const [f, setF] = useState({ status, notes: notes || "" });
  return (
    <div className="actions">
      <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{["open", "acknowledged", "fixed", "closed", "duplicate"].map((s) => <option key={s}>{s}</option>)}</select>
      <textarea placeholder="staff notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} />
      <div className="row"><button className="btn primary" disabled={busy} onClick={() => run(() => call(`/api/reports/${id}`, "PATCH", { status: f.status, staffNotes: f.notes }))}>Save</button>{err && <span style={{ color: "#a23b2f" }}>{err}</span>}</div>
    </div>
  );
}

export function WaiverForm() {
  const { busy, err, run } = useAction();
  const [code, setCode] = useState<string | null>(null);
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const el = e.currentTarget; run(async () => { const w = await call("/api/admin/waivers", "POST", { label: f.get("label"), expiresAt: f.get("expiresAt") || undefined, benchId: f.get("benchId") || undefined, region: f.get("region") || undefined }); setCode(w.code); el.reset(); }); }}>
      <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label>Label<br /><input name="label" required placeholder="Rotary Club 2026" /></label>
        <label>Expires (optional)<br /><input name="expiresAt" type="date" /></label>
        <label>Only bench (optional)<br /><input name="benchId" placeholder="6A" style={{ width: 80 }} /></label>
        <label>Only region (optional)<br /><input name="region" placeholder="A" maxLength={1} style={{ width: 60 }} /></label>
        <button className="btn primary" disabled={busy}>Create key</button>
      </div>
      {err && <p style={{ color: "#a23b2f" }}>{err}</p>}
      {code && <p>New key, shown once: <span className="code">{code}</span></p>}
    </form>
  );
}
export function WaiverRevoke({ codeHint }: { codeHint: string }) {
  const { busy, run } = useAction();
  const [code, setCode] = useState("");
  return <span className="row"><input placeholder={`full code ending ${codeHint.slice(-4)}`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} style={{ width: 150 }} /><button className="btn ghost" disabled={busy || code.length !== 12} onClick={() => run(() => call(`/api/admin/waivers/${code}`, "DELETE"))}>Revoke</button></span>;
}

export function StaffForm({ staff, me }: { staff: { email: string; hasPassword: boolean; mustChange: boolean }[]; me: string }) {
  const { busy, err, run } = useAction();
  const [pw, setPw] = useState("");
  const gen = () => setPw(Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 52]).join(""));
  return (
    <div>
      <ul style={{ padding: 0, listStyle: "none" }}>{staff.map((s) => <li key={s.email} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0" }}>{s.email}{s.email === me && <small className="muted">(you)</small>}{!s.hasPassword && <small className="muted">(no password yet)</small>}{s.mustChange && s.hasPassword && <small className="muted">(temporary password)</small>}{s.email !== me && staff.length > 1 && <button className="btn ghost" disabled={busy} onClick={() => run(() => call("/api/admin/staff", "DELETE", { email: s.email }))}>Remove</button>}</li>)}</ul>
      <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const el = e.currentTarget; run(async () => { await call("/api/admin/staff", "POST", { email: f.get("email"), password: pw }); el.reset(); setPw(""); }); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input name="email" type="email" required placeholder="colleague@vancortlandt.org" />
        <input value={pw} onChange={(e) => setPw(e.target.value)} required minLength={10} placeholder="temporary password (10+ chars)" style={{ width: 240 }} />
        <button type="button" className="btn ghost" onClick={gen}>Generate</button>
        <button className="btn primary" disabled={busy}>Add / reset</button>
      </form>
      {pw && <p className="muted" style={{ fontSize: 13 }}>Share this password with them through a private channel; it is not emailed.</p>}
      {err && <p style={{ color: "#a23b2f" }}>{err}</p>}
    </div>
  );
}
export function ChangePassword() {
  const { busy, err, run } = useAction();
  const [ok, setOk] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const el = e.currentTarget; run(async () => { await call("/api/admin/password", "POST", { current: f.get("current"), next: f.get("next") }); el.reset(); setOk(true); }); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input name="current" type="password" required autoComplete="current-password" placeholder="current password" />
      <input name="next" type="password" required minLength={10} autoComplete="new-password" placeholder="new password (10+ chars)" />
      <button className="btn primary" disabled={busy}>Change</button>
      {ok && <span className="muted">Changed.</span>}{err && <span style={{ color: "#a23b2f" }}>{err}</span>}
    </form>
  );
}
