import { listAll } from "@/lib/adoptions";
import { RequestActions } from "@/components/admin/Actions";
export default async function Requests({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const all = (await listAll()).filter((a) => !status || a.status === status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const tabs = ["", "inquiry", "awaiting_payment", "paid", "installed", "cancelled"];
  return (
    <>
      <h1>Adoption requests</h1>
      <nav style={{ marginBottom: 12 }}>{tabs.map((t) => <a key={t} href={t ? `?status=${t}` : "?"} style={{ fontWeight: (status || "") === t ? 700 : 400 }}>{t ? t.replace("_", " ") : "all"}</a>)}</nav>
      <table><thead><tr><th>Bench</th><th>Donor</th><th>Plaque</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {all.map((a) => (
          <tr key={a.id}>
            <td><b>{a.benchId}</b> side {a.side}<br /><small className="muted">{a.createdAt.slice(0, 10)}<br />{a.id}</small></td>
            <td>{a.donor.name}<br /><small className="muted">{a.donor.email}{a.donor.phone ? ` · ${a.donor.phone}` : ""}</small>{a.honoree && <><br /><small>for {a.honoree}</small></>}{a.requestedStart && <><br /><small>prefers {a.requestedStart}</small></>}{a.fundraising && <><br /><small>wants fundraising help</small></>}{a.questions && <><br /><small>Q: {a.questions}</small></>}</td>
            <td><pre style={{ margin: 0, whiteSpace: "pre-wrap", font: "inherit" }}>{a.plaque.text}</pre></td>
            <td>{a.status.replace("_", " ")}<br /><small className="muted">payment {a.payment.status}{a.payment.method ? ` (${a.payment.method})` : ""}<br />${(a.amountCents / 100).toLocaleString()}{a.termStart ? <><br />{a.termStart} → {a.termEnd}</> : null}{a.reminders?.nextReminderAt ? <><br />next reminder {a.reminders.nextReminderAt}</> : null}</small></td>
            <td><RequestActions id={a.id} status={a.status} payment={a.payment} termStart={a.termStart} notes={a.notes} /></td>
          </tr>
        ))}
      </tbody></table>
      {all.length === 0 && <p className="muted">Nothing here.</p>}
    </>
  );
}
