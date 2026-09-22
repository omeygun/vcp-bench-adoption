import { listWaivers } from "@/lib/waivers";
import { WaiverForm, WaiverRevoke } from "@/components/admin/Actions";
export default async function Waivers() {
  const rows = await listWaivers();
  return (
    <>
      <h1>Waiver keys</h1>
      <p className="muted">A waiver key lets one client adopt one bench side at no charge. The full code is shown once, when you create it; hand it to the client. Redeeming it in the request form marks the adoption paid (waived).</p>
      <div className="card"><WaiverForm /></div>
      <table><thead><tr><th>Label</th><th>Code</th><th>Status</th><th>Restriction</th><th>Created</th><th>Used</th><th></th></tr></thead><tbody>
        {rows.map((w) => (
          <tr key={w.createdAt + w.code}>
            <td>{w.label}</td><td><code>{w.codeHint}</code></td><td>{w.status}</td>
            <td>{w.restrictTo?.benchId ? `bench ${w.restrictTo.benchId}` : w.restrictTo?.region ? `region ${w.restrictTo.region}` : "any bench"}{w.expiresAt ? `, until ${w.expiresAt}` : ""}</td>
            <td>{w.createdAt.slice(0, 10)}<br /><small className="muted">{w.createdBy}</small></td>
            <td>{w.usedAt ? <>{w.usedAt.slice(0, 10)}<br /><small className="muted">{w.usedBy}</small></> : "—"}</td>
            <td>{w.status === "active" && <WaiverRevoke codeHint={w.codeHint} />}</td>
          </tr>
        ))}
      </tbody></table>
    </>
  );
}
