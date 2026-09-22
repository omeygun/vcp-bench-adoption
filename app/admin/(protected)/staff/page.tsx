import { getSession, staffList } from "@/lib/auth";
import { StaffForm, ChangePassword } from "@/components/admin/Actions";
export default async function Staff({ searchParams }: { searchParams: Promise<{ change?: string }> }) {
  const { change } = await searchParams;
  const staff = (await staffList()).map((s) => ({ email: s.email, hasPassword: !!s.hash, mustChange: !!s.mustChange }));
  const me = (await getSession())?.email || "";
  return (<>
    <h1>Staff</h1>
    {change && <p style={{ color: "#a23b2f" }}>You signed in with a temporary password. Please set your own below.</p>}
    <div className="card"><h2 style={{ marginTop: 0 }}>Your password</h2><ChangePassword /></div>
    <div className="card"><h2 style={{ marginTop: 0 }}>Staff accounts</h2><p className="muted">Add a colleague with a temporary password, or type an existing email to reset theirs. They should change it after signing in.</p><StaffForm staff={staff} me={me} /></div>
  </>);
}
