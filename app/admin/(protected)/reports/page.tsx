import { listReports, REPORT_STATUSES } from "@/lib/reports";
import { ReportActions } from "@/components/admin/Actions";
export default async function Reports({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "open" } = await searchParams;
  const rows = await listReports(status);
  return (
    <>
      <h1>Problem reports</h1>
      <nav style={{ marginBottom: 12 }}>{REPORT_STATUSES.map((t) => <a key={t} href={`?status=${t}`} style={{ fontWeight: status === t ? 700 : 400 }}>{t}</a>)}</nav>
      <table className="stack"><thead><tr><th>Bench</th><th>Category</th><th>Description</th><th>Reporter</th><th>Actions</th></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td><b><a href={`/bench/${r.benchId}`} target="_blank" rel="noreferrer">{r.benchId}</a></b>{r.side ? ` side ${r.side}` : ""}<br /><small className="muted">{r.createdAt.slice(0, 10)}<br />{r.id}</small>{r.adoptionId && <><br /><small>adopter linked</small></>}</td>
            <td>{r.category.replace("_", " ")}{r.duplicateOf && <><br /><small className="muted">dup of {r.duplicateOf.slice(-6)}</small></>}
              {r.log?.length ? <details><summary><small>history ({r.log.length})</small></summary><ul className="log">{[...r.log].reverse().map((l, i) => <li key={i}><small>{l.at.slice(0, 16).replace("T", " ")} · {l.by}<br />{l.change}</small></li>)}</ul></details> : null}</td>
            <td>{r.description}{r.photos.length > 0 && <><br />{r.photos.map((p, i) => <a key={i} href={p.url} target="_blank" rel="noreferrer">photo {i + 1} </a>)}</>}</td>
            <td>{r.reporter?.name || <span className="muted">anonymous</span>}<br /><small className="muted">{r.reporter?.email}</small></td>
            <td><ReportActions id={r.id} status={r.status} notes={r.staffNotes} /></td>
          </tr>
        ))}
      </tbody></table>
      {rows.length === 0 && <p className="muted">No {status} reports.</p>}
    </>
  );
}
