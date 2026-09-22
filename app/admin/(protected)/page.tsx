import { computeStats } from "@/lib/stats";
const usd = (c: number) => "$" + (c / 100).toLocaleString();
export default async function Dashboard() {
  const s = await computeStats();
  const Tile = ({ v, l }: { v: string | number | null; l: string }) => <div className="tile"><b>{v ?? "—"}</b><small>{l}</small></div>;
  const regions = Object.entries(s.benches.perRegion).sort();
  return (
    <>
      <h1>Dashboard <small className="muted" style={{ fontSize: 14 }}>as of {s.asOf}</small></h1>
      <h2>Benches</h2>
      <div className="tiles"><Tile v={s.benches.total} l="benches" /><Tile v={s.benches.adopted || 0} l="adopted" /><Tile v={s.benches.partial || 0} l="one side free" /><Tile v={s.benches.pending || 0} l="requested / pending" /><Tile v={s.benches.available || 0} l="available" /></div>
      <h2>By region</h2>
      <table><thead><tr><th>Region</th><th>Adopted</th><th>Partial</th><th>Pending</th><th>Available</th><th style={{ width: "40%" }}>Adopted share</th></tr></thead><tbody>
        {regions.map(([r, c]) => { const tot = Object.values(c).reduce((a, b) => a + b, 0), ad = c.adopted || 0; return <tr key={r}><td>{r}</td><td>{ad}</td><td>{c.partial || 0}</td><td>{c.pending || 0}</td><td>{c.available || 0}</td><td><div className="bar"><i style={{ width: `${(100 * ad) / tot}%` }} /></div></td></tr>; })}
      </tbody></table>
      <h2>Requests</h2>
      <div className="tiles"><Tile v={s.requests.newThisMonth} l="new this month" /><Tile v={s.requests.awaitingPayment} l="awaiting payment" /><Tile v={s.requests.paidNotInstalled} l="paid, not installed" /><Tile v={s.requests.medianDaysToInstall} l="median days to install" />{Object.entries(s.requests.byStatus).map(([k, v]) => <Tile key={k} v={v} l={k.replace("_", " ")} />)}</div>
      <h2>Money <small className="muted">(placeholder amounts)</small></h2>
      <div className="tiles"><Tile v={usd(s.money.pledgedCents)} l="pledged" /><Tile v={usd(s.money.receivedCents)} l="received" /><Tile v={s.money.waived} l="waived" /></div>
      <h2>Renewals</h2>
      <div className="tiles"><Tile v={s.renewals.endingWithin12Months} l="terms ending within 12 months" /><Tile v={s.renewals.remindersSentThisMonth} l="reminders sent this month" /><Tile v={s.renewals.unsubscribed} l="unsubscribed" /></div>
      <h2>Reports</h2>
      <div className="tiles">{Object.entries(s.reports.byStatus).map(([k, v]) => <Tile key={k} v={v} l={k} />)}<Tile v={s.reports.medianDaysToFix} l="median days to fix" />{Object.entries(s.reports.byCategory).map(([k, v]) => <Tile key={k} v={v} l={k.replace("_", " ")} />)}</div>
    </>
  );
}
