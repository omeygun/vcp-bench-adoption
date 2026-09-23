import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { benchById } from "@/lib/benches";
import { benchState, isLive, listForBench, sideState, toPublic } from "@/lib/adoptions";
import { BenchSpot, ShareButton } from "@/components/BenchPageClient";
import { fmt } from "@/lib/format";

export const revalidate = 60;

async function load(id: string) {
  const bench = benchById(id);
  if (!bench) notFound();
  const all = await listForBench(id), live = all.filter((a) => isLive(a));
  const sides = Array.from({ length: bench.sides }, (_, i) => {
    const mine = live.filter((a) => a.side === i + 1);
    const past = all.filter((a) => a.side === i + 1 && a.status === "installed" && !isLive(a)).map(toPublic);
    return { side: i + 1, state: sideState(mine), installed: mine.filter((a) => a.status === "installed").map(toPublic), past };
  });
  return { bench, state: benchState(bench, live), sides };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!benchById(id)) return { title: "Bench not found · Van Cortlandt Park" };
  const { sides } = await load(id);
  const honorees = sides.flatMap((s) => s.installed.map((a) => a.honoree)).filter(Boolean);
  const title = honorees.length ? `Bench ${id} · In honor of ${honorees.join(" & ")}` : `Bench ${id} · Van Cortlandt Park`;
  const description = honorees.length ? "A dedicated bench in Van Cortlandt Park, the Bronx." : `Bench ${id} in Van Cortlandt Park is open for adoption. Dedicate it to someone you love.`;
  return { title, description, openGraph: { title, description } };
}

export default async function BenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bench, state, sides } = await load(id);
  const kind = `${bench.size} ft ${bench.type === "concrete" ? "concrete-base" : "World's Fair"} bench`;
  const open = sides.some((s) => s.state === "available");

  return (
    <main className="bench-page">
      <Link href="/" className="brand">VCP <span>Benches</span></Link>
      <header>
        <p className="muted">Van Cortlandt Park · Bronx, NY</p>
        <h1>Bench {bench.id}</h1>
        <p className="muted">{kind}{bench.sides === 2 ? " · two plaque sides" : ""}</p>
      </header>

      {sides.map((s) => (
        <section key={s.side} className="side">
          {bench.sides === 2 && <h2>Side {s.side}</h2>}
          {s.installed.length ? s.installed.map((a) => (
            <div key={a.id}>
              <div className="plaque">{a.plaque}</div>
              {a.termStart && <p className="muted">Adopted {fmt(a.termStart)} – {fmt(a.termEnd)}</p>}
            </div>
          )) : <p className="muted">{s.state === "pending" ? "A dedication for this side is on its way." : "This side is open for adoption."}</p>}
          {s.past.length > 0 && <p className="muted small">Previously: {s.past.map((a) => `${a.honoree ? a.honoree + ", " : ""}${fmt(a.termStart)} – ${fmt(a.termEnd)}`).join(" · ")}</p>}
        </section>
      ))}

      <BenchSpot id={bench.id} section={bench.section} state={state} />

      <div className="actions">
        <ShareButton title={`Bench ${bench.id} · Van Cortlandt Park`} />
        <Link className="btn primary" href={`/?bench=${bench.id}`}>{open ? "Adopt this bench" : "See it on the map"}</Link>
      </div>
    </main>
  );
}
