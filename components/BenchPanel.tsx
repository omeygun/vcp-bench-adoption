"use client";
import { useEffect, useState } from "react";
import type { BenchState } from "./ParkMap";

export type PublicAdoption = { id: string; benchId: string; side: number; status: string; honoree?: string; plaque?: string; termStart?: string; termEnd?: string };
type SideInfo = { side: number; state: "available" | "pending" | "adopted"; current: PublicAdoption[]; history: PublicAdoption[] };
type Detail = { bench: { id: string; type: string; size: number; sides: number; region: string; angle: number }; state: BenchState; sides: SideInfo[]; openReports: { id: string; category: string; status: string; createdAt: string }[] };

/** Same rule as lib/adoptions.benchState, computed client-side from the public adoption list. */
export function benchStates(benches: { id: string; sides: number }[], adoptions: PublicAdoption[]) {
  const out: Record<string, BenchState> = {};
  for (const b of benches) {
    const states = Array.from({ length: b.sides }, (_, i) => { const mine = adoptions.filter((a) => a.benchId === b.id && a.side === i + 1); return mine.some((a) => a.status === "installed") ? "adopted" : mine.length ? "pending" : "available"; });
    out[b.id] = states.every((s) => s === "available") ? "available" : states.some((s) => s === "available") ? "partial" : states.some((s) => s === "adopted") ? "adopted" : "pending";
  }
  return out;
}
export function sideStates(benches: { id: string; sides: number }[], adoptions: PublicAdoption[]) {
  const out: Record<string, ("available" | "pending" | "adopted")[]> = {};
  for (const b of benches) out[b.id] = Array.from({ length: b.sides }, (_, i) => { const mine = adoptions.filter((a) => a.benchId === b.id && a.side === i + 1); return mine.some((a) => a.status === "installed") ? "adopted" : mine.length ? "pending" : "available"; });
  return out;
}
/** Which half is which, drawn with the bench's real orientation on the map (north up). */
export function SideDiagram({ angle, sides, highlight }: { angle: number; sides: number; highlight?: number }) {
  return (
    <svg className="side-diagram" viewBox="-30 -30 60 60" aria-label="Bench orientation">
      <g transform={`rotate(${angle})`}>
        {Array.from({ length: sides }, (_, i) => (
          <g key={i}>
            <rect x={-22 + (i * 44) / sides} y={-7} width={44 / sides} height={14} rx={1.5} fill={highlight === i + 1 ? "#e0862b" : "#6b4a2b"} stroke="#fff" strokeWidth={1.5} />
            {sides === 2 && <text x={-22 + ((i + 0.5) * 44) / 2} y={0} transform={`rotate(${-angle} ${-22 + ((i + 0.5) * 44) / 2} 0)`} fontSize={9} fontWeight={700} fill="#fff" textAnchor="middle" dominantBaseline="central">{i + 1}</text>}
          </g>
        ))}
      </g>
      <text x={0} y={-24} fontSize={6} fill="#5b6a63" textAnchor="middle">N</text>
    </svg>
  );
}
const TYPE = { "worlds-fair": "World's Fair", concrete: "Concrete base" } as Record<string, string>;
const fmt = (d?: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "");

export default function BenchPanel({ benchId, onBack, onChanged }: { benchId: string; onBack: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [mode, setMode] = useState<{ kind: "request"; side: number } | { kind: "report" } | null>(null);
  const load = () => fetch(`/api/benches/${benchId}`).then((r) => r.json()).then(setD).catch(() => setD(null));
  useEffect(() => { setD(null); setMode(null); load(); }, [benchId]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div className="bench-panel"><small>Loading bench {benchId}…</small></div>;
  const done = () => { setMode(null); load(); onChanged(); };
  return (
    <div className="bench-panel">
      <button className="side-back" onClick={mode ? () => setMode(null) : onBack}>← {mode ? `Bench ${d.bench.id}` : "Back to section"}</button>
      <h3>Bench {d.bench.id}</h3>
      <p className="meta">{TYPE[d.bench.type]} · {d.bench.size} ft · {d.bench.sides === 2 ? "two plaque sides" : "one plaque side"} · region {d.bench.region}</p>
      {d.bench.sides === 2 && <div className="orient"><SideDiagram angle={d.bench.angle} sides={2} highlight={mode?.kind === "request" ? mode.side : undefined} /><small>Side numbers match the map when zoomed in. Each side of an 8 ft bench takes its own plaque.</small></div>}
      {mode?.kind === "request" ? <RequestForm benchId={benchId} side={mode.side} onDone={done} onCancel={() => setMode(null)} /> :
       mode?.kind === "report" ? <ReportForm benchId={benchId} open={d.openReports} onDone={done} onCancel={() => setMode(null)} /> : (
        <>
          {d.sides.map((s) => (
            <section className="side" key={s.side}>
              <header>Side {s.side} <span className={`tag ${s.state}`}>{s.state === "pending" ? "requested" : s.state}</span></header>
              {s.current.map((a) => (
                <div key={a.id}>
                  {a.honoree && <div>{a.honoree}</div>}
                  {a.plaque ? <pre>{a.plaque}</pre> : <small>Plaque text is shown once installed.</small>}
                  {a.termEnd ? <small>Adopted through {fmt(a.termEnd)}</small> : <small>Request in progress</small>}
                </div>
              ))}
              {s.state === "available" && <button className="btn primary" onClick={() => setMode({ kind: "request", side: s.side })}>Request this side</button>}
              {s.history.length > 0 && <small>{s.history.length} past adoption{s.history.length > 1 ? "s" : ""}</small>}
            </section>
          ))}
          <div className="report-link">
            {d.openReports.length > 0 && <div><small>{d.openReports.length} open report{d.openReports.length > 1 ? "s" : ""} on this bench ({d.openReports.map((r) => r.category.replace("_", " ")).join(", ")}).</small></div>}
            <button className="linkish" onClick={() => setMode({ kind: "report" })}>Report a problem with this bench</button>
          </div>
        </>
      )}
    </div>
  );
}

function useSubmit(url: string, onDone: () => void) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<Record<string, unknown> | null>(null);
  const submit = async (payload: unknown) => {
    setBusy(true); setErr(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error || "Something went wrong"); return; }
    setOk(j);
    if (onDone) setTimeout(onDone, 4000);
  };
  return { busy, err, ok, submit };
}

function RequestForm({ benchId, side, onDone, onCancel }: { benchId: string; side: number; onDone: () => void; onCancel: () => void }) {
  const { busy, err, ok, submit } = useSubmit("/api/adoptions", onDone);
  const [plaque, setPlaque] = useState("");
  const [waiver, setWaiver] = useState(""); const [waiverMsg, setWaiverMsg] = useState<string | null>(null);
  const lines = plaque.split("\n").length;
  const checkWaiver = async () => { if (!waiver) return setWaiverMsg(null); const r = await fetch(`/api/waivers/${waiver}/check?benchId=${benchId}`); const j = await r.json(); setWaiverMsg(r.ok ? `Valid: ${j.label}. Covers this bench.` : j.error); };
  if (ok) return <div className="ok"><b>Request received.</b> We emailed you a copy. A VCPA representative will contact you to arrange payment; plaque installation takes 6–8 weeks after payment and final text. Reference {String(ok.id)}.</div>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit({ benchId, side, donor: { name: f.get("name"), email: f.get("email"), phone: f.get("phone") || undefined }, honoree: f.get("honoree") || undefined, plaqueText: plaque, requestedStart: f.get("requestedStart") || undefined, fundraising: f.get("fundraising") === "on", acknowledged: f.get("ack") === "on", questions: f.get("questions") || undefined, waiverCode: waiver || undefined }); }}>
      <b>Request side {side} of bench {benchId}</b>
      <small>$3,500 for a 10-year adoption. No payment here: VCPA will contact you to arrange payment online, by check or Zelle. Fully tax deductible.</small>
      <label>Your name<input name="name" required maxLength={80} /></label>
      <label>Email<input name="email" type="email" required /></label>
      <label>Phone (optional)<input name="phone" maxLength={30} /></label>
      <label>In honor or memory of (optional)<input name="honoree" maxLength={120} /></label>
      <label>Plaque text · {plaque.length}/300 characters · {lines}/7 lines
        <textarea required value={plaque} onChange={(e) => setPlaque(e.target.value.slice(0, 300))} placeholder={"In loving memory of\nJane Doe\nwho walked these trails every morning"} />
      </label>
      <label>Preferred timing (optional)<input name="requestedStart" type="month" /></label>
      <label>Waiver code (if VCPA gave you one)<div className="row"><input value={waiver} onChange={(e) => setWaiver(e.target.value.toUpperCase())} maxLength={12} style={{ flex: 1 }} /><button type="button" className="btn ghost" onClick={checkWaiver}>Check</button></div>{waiverMsg && <small>{waiverMsg}</small>}</label>
      <label className="check"><input type="checkbox" name="fundraising" /> I&apos;d like help with group fundraising for this bench.</label>
      <label className="check"><input type="checkbox" name="ack" required /> I understand that creating and installing the plaque takes at least 6–8 weeks after payment and final plaque text.</label>
      <label>Questions (optional)<textarea name="questions" maxLength={1000} style={{ minHeight: 50 }} /></label>
      {err && <div className="err">{err}</div>}
      <div className="row"><button className="btn primary" disabled={busy || lines > 7}>{busy ? "Sending…" : "Send request"}</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

const CATS: [string, string][] = [["damaged_bench", "Damaged bench"], ["damaged_plaque", "Damaged plaque"], ["missing_plaque", "Missing plaque"], ["graffiti", "Graffiti"], ["bench_missing", "Bench is gone"], ["other", "Something else"]];
function ReportForm({ benchId, open, onDone, onCancel }: { benchId: string; open: Detail["openReports"]; onDone: () => void; onCancel: () => void }) {
  const { busy, err, ok, submit } = useSubmit("/api/reports", onDone);
  if (ok) return <div className="ok"><b>Thank you.</b> Your report is with the Van Cortlandt Park Alliance. Reference {String(ok.id)}.</div>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit({ benchId, category: f.get("category"), description: f.get("description"), side: f.get("side") || undefined, reporter: { name: f.get("name") || undefined, email: f.get("email") || undefined }, duplicateOf: open[0]?.id }); }}>
      <b>Report a problem with bench {benchId}</b>
      {open.length > 0 && <small>Already reported: {open.map((r) => `${r.category.replace("_", " ")} (${r.status})`).join(", ")}. Your report will be added to it.</small>}
      <label>What happened?<select name="category" required>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Details<textarea name="description" required minLength={3} maxLength={1000} placeholder="Where on the bench, what you saw, when." /></label>
      <label>Plaque side (optional)<select name="side"><option value="">Not about a plaque</option><option value="1">Side 1</option><option value="2">Side 2</option></select></label>
      <label>Your name (optional)<input name="name" maxLength={80} /></label>
      <label>Email, if you want an update (optional)<input name="email" type="email" /></label>
      {err && <div className="err">{err}</div>}
      <div className="row"><button className="btn primary" disabled={busy}>{busy ? "Sending…" : "Send report"}</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
