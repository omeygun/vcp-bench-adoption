import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/admin/login");
  return (
    <main className="admin">
      <nav>
        <Link href="/admin"><b>VCP Benches admin</b></Link>
        <Link href="/admin/requests">Requests</Link><Link href="/admin/reports">Reports</Link><Link href="/admin/waivers">Waivers</Link><Link href="/admin/staff">Staff</Link><Link href="/">Public site</Link>
        <form action="/api/admin/logout" method="post"><span className="muted" style={{ marginRight: 8 }}>{s.email}</span><button className="btn ghost">Sign out</button></form>
      </nav>
      {children}
    </main>
  );
}
