"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { Flip } from "gsap/Flip";
import { SplitText } from "gsap/SplitText";
import ParkMap, { SECTIONS, BENCHES, SUBS, colorOf, letterOf, type Section, type BenchState } from "./ParkMap";
import BenchPanel, { type PublicAdoption, benchStates, sideStates } from "./BenchPanel";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin, Flip, SplitText);

const STATS = [
  { value: BENCHES.length, suffix: "", label: "benches in the program" },
  { value: 1146, suffix: "", label: "acres of park" },
  { value: 7, suffix: "", label: "map sections" },
];
const STEPS = [
  { n: "01", title: "Pick a section", text: "Zoom into the corner of the park you love: the Parade Ground, Croton Woods, the lake." },
  { n: "02", title: "Choose a bench", text: "See which benches are already adopted, by whom and until when. Pick one that is free." },
  { n: "03", title: "Dedicate it", text: "Add a name or a message and choose how long you want to adopt it for. No payment step here for now." },
];

function SectionDetail({ s, sub, statuses, onSub, onBench, onlyFree, setOnlyFree, onBack }: { s: Section; sub: string | null; statuses: Record<string, BenchState>; onSub: (id: string) => void; onBench: (id: string) => void; onlyFree: boolean; setOnlyFree: (v: boolean) => void; onBack: () => void }) {
  const mine = BENCHES.filter((b) => b.section === s.id);
  const n = (st: BenchState) => mine.filter((b) => (statuses[b.id] || "available") === st).length;
  const st = (id: string) => statuses[id] || "available";
  const listed = mine.filter((b) => (!sub || b.sub === sub) && (!onlyFree || st(b.id) === "available" || st(b.id) === "partial")).sort((a, b) => parseInt(a.id) - parseInt(b.id));
  const subs = SUBS.filter((d) => d.section === s.id);
  const xs = s.points.map((p) => p[0]), ys = s.points.map((p) => p[1]);
  const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const pad = 12;
  const d = "M" + s.points.join("L") + "Z" + (s.holes || []).map((h) => "M" + h.join("L") + "Z").join("");
  return (
    <div className="side-detail">
      <button className="side-back" onClick={onBack}>← {sub ? `Whole section ${letterOf(s.id)}` : "All sections"}</button>
      <svg className="thumb" viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`} aria-hidden>
        <path d={d} fill={colorOf(s.id)} fillRule="evenodd" stroke="#fff" strokeWidth={4} />
      </svg>
      <b style={{ background: colorOf(s.id) }}>{letterOf(s.id)}</b>
      <h3>{s.name}</h3>
      {subs.length > 0 && (
        <div className="subs">
          {subs.map((d) => (
            <button key={d.id} className={sub === d.id ? "on" : ""} onClick={() => onSub(d.id)}>
              {d.id} <small>{mine.filter((b) => b.sub === d.id).length}</small>
            </button>
          ))}
        </div>
      )}
      <div className="bench-list-head">
        <b>{sub ? `Benches in ${sub}` : "Benches"} <small>({listed.length})</small></b>
        <label className="toggle"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> free only</label>
      </div>
      <div className="bench-chips">
        {listed.map((b) => <button key={b.id} className={`chip st-${st(b.id)}`} title={`${b.size} ft ${b.type === "concrete" ? "concrete" : "World's Fair"} · ${st(b.id)}`} onClick={() => onBench(b.id)}>{b.id}</button>)}
        {listed.length === 0 && <small>No benches match.</small>}
      </div>
      <dl>
        <dt>Benches</dt><dd>{mine.length}</dd>
        <dt>8 ft (two plaque sides)</dt><dd>{mine.filter((b) => b.size === 8).length}</dd>
        <dt>4 ft</dt><dd>{mine.filter((b) => b.size === 4).length}</dd>
        <dt>Adopted</dt><dd>{n("adopted")}</dd>
        <dt>Requested / pending</dt><dd>{n("pending")}</dd>
        <dt>One side free</dt><dd>{n("partial")}</dd>
        <dt>Available</dt><dd>{n("available")}</dd>
      </dl>
      <ul className="key">
        <li><i className="k-available" /> available</li><li><i className="k-partial" /> one side free</li><li><i className="k-pending" /> requested</li><li><i className="k-adopted" /> adopted</li>
      </ul>
      <p className="tbd">Tap a bench number above or on the map to see its plaques or request one. 8 ft benches have two plaque sides.</p>
    </div>
  );
}

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [bench, setBench] = useState<string | null>(null);
  const [underlay, setUnderlay] = useState(false);
  const [benchQuery, setBenchQuery] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [adoptions, setAdoptions] = useState<PublicAdoption[]>([]);
  const statuses = useMemo(() => benchStates(BENCHES, adoptions), [adoptions]);
  const sides = useMemo(() => sideStates(BENCHES, adoptions), [adoptions]);
  const reload = () => fetch("/api/adoptions").then((r) => r.json()).then(setAdoptions).catch(() => {});
  useEffect(() => { reload(); }, []);
  const pick = (id: string | null) => { setActive(id); setActiveSub(null); setBench(null); };
  const pickBench = (id: string) => { const b = BENCHES.find((x) => x.id === id); if (!b) return; setBench(id); setActive(b.section); setActiveSub(b.sub); };
  useEffect(() => { const id = new URLSearchParams(location.search).get("bench"); if (id && BENCHES.some((b) => b.id === id)) { pickBench(id); setTimeout(() => scrollTo("#map"), 300); } }, []);   // deep link /?bench=6A
  const [expanded, setExpanded] = useState(false);
  const flipState = useRef<Flip.FlipState | null>(null);

  const scrollTo = (sel: string) => gsap.to(window, { duration: 1, ease: "power2.inOut", scrollTo: { y: sel, offsetY: 72 } });
  const toggleExpand = () => { flipState.current = Flip.getState(card.current!); setExpanded((e) => !e); };

  // page intro + scroll reveals
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add({ reduce: "(prefers-reduced-motion: reduce)", ok: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
      const fast = ctx.conditions?.reduce ? 0 : 1;
      const split = SplitText.create(".hero h1", { type: "words, lines", linesClass: "line" });
      gsap.timeline({ defaults: { ease: "power3.out", duration: 0.9 * fast } })
        .from(".nav", { yPercent: -100, autoAlpha: 0, duration: 0.6 * fast })
        .from(split.words, { yPercent: 110, autoAlpha: 0, stagger: 0.04 * fast }, "-=0.2")
        .from(".hero p, .hero .cta", { y: 24, autoAlpha: 0, stagger: 0.12 * fast }, "-=0.5")
        .from(".hero-map", { scale: 0.92, autoAlpha: 0, duration: 1.1 * fast, ease: "expo.out" }, "-=0.8");

      gsap.to(".blob-a", { xPercent: 12, yPercent: -10, duration: 9, yoyo: true, repeat: -1, ease: "sine.inOut" });
      gsap.to(".blob-b", { xPercent: -10, yPercent: 14, duration: 11, yoyo: true, repeat: -1, ease: "sine.inOut" });

      gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
        gsap.from(el, { y: 40, autoAlpha: 0, duration: 0.9 * fast, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%", toggleActions: "play none none reverse" } });
      });
      gsap.from(".step", { y: 50, autoAlpha: 0, stagger: 0.15 * fast, duration: 0.9 * fast, ease: "power3.out",
        scrollTrigger: { trigger: ".steps", start: "top 80%" } });
      gsap.utils.toArray<HTMLElement>(".stat b").forEach((el) => {
        const target = Number(el.dataset.value);
        const o = { v: 0 };
        gsap.to(o, { v: target, duration: 1.6 * fast, ease: "power2.out", snap: { v: 1 },
          onUpdate: () => { el.textContent = o.v.toLocaleString(); },
          scrollTrigger: { trigger: el, start: "top 85%", once: true } });
      });
      gsap.to(".hero-map", { yPercent: 8, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
      return () => split.revert();
    });
    return () => mm.revert();
  }, { scope: root });

  // FLIP the map card between its slot and full screen
  useGSAP(() => {
    const state = flipState.current;
    if (!state) return;
    // keep `state` until the flip finishes: in dev, React runs this effect twice and the first tween gets reverted
    Flip.from(state, { duration: 0.7, ease: "power3.inOut", onComplete: () => { flipState.current = null; ScrollTrigger.refresh(); } });
    gsap.fromTo(".backdrop", { autoAlpha: expanded ? 0 : 1 }, { autoAlpha: expanded ? 1 : 0, duration: 0.5 });
  }, { dependencies: [expanded], scope: root });

  useEffect(() => {
    document.body.style.overflow = expanded ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (expanded ? toggleExpand() : pick(null)); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const activeSection = SECTIONS.find((s) => s.id === active);

  return (
    <div ref={root} className="page">
      <nav className="nav">
        <a href="#top" className="brand" onClick={(e) => { e.preventDefault(); scrollTo("#top"); }}>VCP <span>Benches</span></a>
        <div className="links">
          <button onClick={() => scrollTo("#map")}>Map</button>
          <button onClick={() => scrollTo("#how")}>How it works</button>
          <button className="pill" onClick={() => scrollTo("#adopt")}>Adopt a bench</button>
        </div>
      </nav>

      <header id="top" className="hero">
        <div className="blob blob-a" /><div className="blob blob-b" />
        <div className="hero-text">
          <h1>Adopt a bench. Leave your mark on the Bronx&apos;s biggest backyard.</h1>
          <p>Van Cortlandt Park has more than 500 benches. Find one that is free, dedicate it to someone, and help keep the park cared for.</p>
          <div className="cta">
            <button className="btn primary" onClick={() => scrollTo("#map")}>Explore the map</button>
            <button className="btn ghost" onClick={() => scrollTo("#how")}>How it works</button>
          </div>
        </div>
        <div className="hero-map" aria-hidden><ParkMap activeId={null} onSelect={() => scrollTo("#map")} labels={false} /></div>
      </header>

      <section className="stats reveal">
        {STATS.map((s) => (
          <div className="stat" key={s.label}><b data-value={s.value}>0</b><span>{s.suffix}</span><small>{s.label}</small></div>
        ))}
      </section>

      <section id="map" className="map-section">
        <div className="section-head reveal">
          <h2>Find your corner of the park</h2>
          <p>Click a section, then a bench. Free benches show in their natural colour, adopted ones in red-brown. Expand the map for the full view.</p>
        </div>
        <div className="map-slot">
          <div className="backdrop" onClick={toggleExpand} />
          <div ref={card} className={`map-card${expanded ? " expanded" : ""}`}>
            <div className="map-bar">
              <strong>{bench ? `Bench ${bench}` : activeSection ? `${activeSub || letterOf(activeSection.id)} · ${activeSection.name}` : "Van Cortlandt Park"}</strong>
              <div className="map-actions">
                <form className="goto" onSubmit={(e) => { e.preventDefault(); const id = benchQuery.trim().toUpperCase(); if (BENCHES.some((b) => b.id === id)) { pickBench(id); setBenchQuery(""); } else setBenchQuery("?"); }}>
                  <input value={benchQuery} onChange={(e) => { const v = e.target.value; const id = v.trim().toUpperCase(); if (BENCHES.some((b) => b.id === id)) { pickBench(id); setBenchQuery(""); } else setBenchQuery(v); }} placeholder="Bench # e.g. 12A" aria-label="Go to bench" list="bench-ids" />
                  <datalist id="bench-ids">{BENCHES.map((b) => <option key={b.id} value={b.id} />)}</datalist>
                  <button type="submit">Go</button>
                </form>
                <label className="toggle"><input type="checkbox" checked={underlay} onChange={(e) => setUnderlay(e.target.checked)} /> Original map</label>
                {active && <button onClick={() => (bench ? setBench(null) : activeSub ? setActiveSub(null) : pick(null))}>{bench ? "Back" : activeSub ? "Whole section" : "All sections"}</button>}
                <button onClick={toggleExpand}>{expanded ? "Close" : "Expand"}</button>
              </div>
            </div>
            <div className="map-body">
              <ParkMap activeId={active} activeSub={activeSub} onSelect={(id) => (id === active && !activeSub && !bench ? pick(null) : pick(id))}
                onSelectSub={(id) => { setBench(null); setActiveSub((cur) => (cur === id ? null : id)); }} statuses={statuses} sides={sides} activeBench={bench} onSelectBench={pickBench} underlay={underlay} />
              <aside className="map-side">
                {bench ? <BenchPanel benchId={bench} onBack={() => setBench(null)} onChanged={reload} /> : activeSection ? <SectionDetail s={activeSection} sub={activeSub} statuses={statuses} onSub={(id) => setActiveSub((cur) => (cur === id ? null : id))} onBench={pickBench} onlyFree={onlyFree} setOnlyFree={setOnlyFree} onBack={() => (activeSub ? setActiveSub(null) : pick(null))} /> : (
                  <ul className="side-list">
                    {SECTIONS.map((s) => (
                      <li key={s.id} onClick={() => pick(s.id)}>
                        <b style={{ background: colorOf(s.id) }}>{letterOf(s.id)}</b><span>{s.name}</span><small>{BENCHES.filter((b) => b.section === s.id).length}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="how">
        <div className="section-head reveal"><h2>How it works</h2></div>
        <div className="steps">
          {STEPS.map((s) => (
            <article className="step" key={s.n}><span>{s.n}</span><h3>{s.title}</h3><p>{s.text}</p></article>
          ))}
        </div>
      </section>

      <section id="adopt" className="adopt reveal">
        <h2>Ready to adopt?</h2>
        <p>Pick a free bench on the map and request a plaque. $3,500 for a 10-year adoption; VCPA will contact you to arrange payment.</p>
        <button className="btn primary" onClick={() => scrollTo("#map")}>Start on the map</button>
      </section>

      <footer>Map traced from the Van Cortlandt Park Alliance map. Not affiliated with NYC Parks.</footer>
    </div>
  );
}
