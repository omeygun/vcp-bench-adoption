import { getConfig } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { StaffForm } from "@/components/admin/Actions";
export default async function Staff() {
  const { emails } = await getConfig("STAFF");
  const me = (await getSession())?.email;
  return (<><h1>Staff</h1><p className="muted">Only these addresses can request a sign-in link.</p><div className="card"><StaffForm emails={emails} me={me || ""} /></div></>);
}
