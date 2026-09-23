import { listAll, matchesQuery } from "@/lib/adoptions";
import { RequestActions } from "@/components/admin/Actions";

const PAGE = 50;

export default async function Requests({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const { status = "", q = "", page = "1" } = await searchParams;
  const needle = q.trim().toLowerCase();
  const all = (await listAll()).filter((a) => (!status || a.status === status) && (!needle || matchesQuery(a, needle))).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const pages = Math.max(1, Math.ceil(all.length / PAGE)), p = Math.min(pages, Math.max(1, Number(page) || 1));
  const rows = all.slice((p - 1) * PAGE, p * PAGE);
  const qs = (o: Record<string, string | number>) => "?" + new URLSearchParams(Object.entries({ status, q, ...o }).filter(([k, v]) => v !== "" && !(k === "page" && String(v) === "1")).map(([k, v]) => [k, String(v)])).toString();
  const tabs = ["", "inquiry", "awaiting_payment", "paid", "installed", "cancelled"];
  return (
    <>
      <h1>Adoption requests</h1>
      <nav style={{ marginBottom: 12 }}>{tabs.map((t) => <a key={t} href={qs({ status: t, page: 1 })} style={{ fontWeight: status === t ? 700 : 400 }}>{t ? t.replace("_", " ") : "all"}</a>)}</nav>
      <form className="row" style={{ marginBottom: 12, gap: 8 }}>
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Search bench, donor, email, honoree, plaque…" style={{ flex: 1, minWidth: 200 }} />
        <button className="btn ghost">Search</button>
        <a className="btn ghost" href={`/api/admin/export${qs({ page: 1 })}`}>Export CSV</a>
      </form>
      <p className="muted">{all.length} request{all.length === 1 ? "" : "s"}{pages > 1 ? ` · page ${p} of ${pages}` : ""}</p>
      <table className="stack"><thead><tr><th>Bench</th><th>Donor</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td><b><a href={`/bench/${a.benchId}`} target="_blank" rel="noreferrer">{a.benchId}</a></b> side {a.side}<br /><small className="muted">{a.createdAt.slice(0, 10)}<br />{a.id}<br /><a href={`/?bench=${a.benchId}`}>on map</a></small></td>
            <td>{a.donor.name}<br /><small className="muted">{a.donor.email}{a.donor.phone ? ` · ${a.donor.phone}` : ""}</small>{a.honoree && <><br /><small>for {a.honoree}</small></>}{a.requestedStart && <><br /><small>prefers {a.requestedStart}</small></>}{a.fundraising && <><br /><small>wants fundraising help</small></>}{a.questions && <><br /><small>Q: {a.questions}</small></>}</td>
            <td>{a.status.replace("_", " ")}<br /><small className="muted">payment {a.payment.status}{a.payment.method ? ` (${a.payment.method})` : ""}<br />${(a.amountCents / 100).toLocaleString()}{a.termStart ? <><br />{a.termStart} → {a.termEnd}</> : null}{a.reminders?.nextReminderAt ? <><br />next reminder {a.reminders.nextReminderAt}</> : null}</small>
              {a.log?.length ? <details><summary><small>history ({a.log.length})</small></summary><ul className="log">{[...a.log].reverse().map((l, i) => <li key={i}><small>{l.at.slice(0, 16).replace("T", " ")} · {l.by}<br />{l.change}</small></li>)}</ul></details> : null}</td>
            <td><RequestActions id={a.id} status={a.status} payment={a.payment} termStart={a.termStart} notes={a.notes} plaque={a.plaque.text} /></td>
          </tr>
        ))}
      </tbody></table>
      {all.length === 0 && <p className="muted">Nothing here.</p>}
      {pages > 1 && <nav className="row" style={{ marginTop: 12, gap: 8 }}>{p > 1 && <a href={qs({ page: p - 1 })}>← Newer</a>}{p < pages && <a href={qs({ page: p + 1 })}>Older →</a>}</nav>}
    </>
  );
}
