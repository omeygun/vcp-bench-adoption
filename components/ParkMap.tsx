"use client";
import { useEffect, useRef } from "react";
import * as d3 from "d3";
import layers from "../data/map-layers.json";
import benchData from "../data/benches.json";
import subData from "../data/subsections.json";

type Pt = [number, number];
export type Section = { id: string; name: string; points: Pt[]; holes: Pt[][]; centroid: Pt };
type Layers = {
  meta: { viewBox: [number, number, number, number] };
  sections: Section[];
  water: { id: string; points: Pt[] }[];
  roads: { id: string; outer: Pt[]; holes: Pt[][] }[];
  roadLines: { points: Pt[]; width: number }[];
  trails: { id: string; name: string; color: string; dashed: boolean; lines: Pt[][] }[];
};
const L = layers as unknown as Layers;
export type Bench = { id: string; region: string; section: string; sub: string | null; x: number; y: number; angle: number; type: "worlds-fair" | "concrete"; size: 4 | 8; sides: 1 | 2 };
export type Sub = { id: string; section: string; centroid: Pt; rings: Pt[][]; holes: Pt[][] };
export const SUBS = subData as Sub[];
export const BENCHES = benchData as Bench[];
export const SECTIONS = L.sections;
export const PALETTE = ["#8fc79a", "#7fbfb0", "#a9a0d0", "#d9b57a", "#d59aa2", "#86c4b3", "#c9c078"];
export const colorOf = (id: string) => PALETTE[SECTIONS.findIndex((s) => s.id === id) % PALETTE.length];
export const letterOf = (id: string) => String.fromCharCode(65 + SECTIONS.findIndex((s) => s.id === id));

export type BenchState = "available" | "partial" | "pending" | "adopted";
type Props = { activeId: string | null; activeSub?: string | null; onSelect: (id: string | null) => void; onSelectSub?: (id: string) => void; labels?: boolean;
  statuses?: Record<string, BenchState>; activeBench?: string | null; onSelectBench?: (id: string) => void };

/** D3 zoom-to-bounding-box map of the traced park layers (park, roads, water). */
export default function ParkMap({ activeId, activeSub = null, onSelect, onSelectSub, labels = true, statuses, activeBench = null, onSelectBench }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const api = useRef<{ zoomTo: (id: string | null, sub: string | null) => void; labels: (on: boolean) => void; benches: (st: Record<string, BenchState> | undefined, sel: string | null) => void } | null>(null);
  const onSelectBenchRef = useRef(onSelectBench);
  onSelectBenchRef.current = onSelectBench;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectSubRef = useRef(onSelectSub);
  onSelectSubRef.current = onSelectSub;

  useEffect(() => {
    const [vx, vy, width, height] = L.meta.viewBox;
    const T = ([x, y]: Pt): Pt => [x - vx, y - vy];
    const ring = (pts: Pt[]) => "M" + pts.map((p) => T(p).join(",")).join("L") + "Z";
    const line = (pts: Pt[]) => "M" + pts.map((p) => T(p).join(",")).join("L");

    const svg = d3.select(svgRef.current!).attr("viewBox", [0, 0, width, height].join(" "));
    svg.selectAll("*").remove();
    const g = svg.append("g");

    const roadsG = g.append("g");
    const roads = roadsG.selectAll("path").data(L.roads).join("path")
      .attr("class", "road").attr("fill-rule", "evenodd")
      .attr("d", (d) => ring(d.outer) + d.holes.map(ring).join(""));
    const centers = roadsG.append("g").selectAll("path").data(L.roadLines).join("path")
      .attr("class", "road-center").attr("d", (d) => line(d.points));

    const water = g.append("g").selectAll("path").data(L.water).join("path").attr("class", "water").attr("d", (d) => ring(d.points));

    const sections = g.append("g").selectAll("path").data(L.sections).join("path")
      .attr("class", "section").attr("fill", (d) => colorOf(d.id)).attr("fill-rule", "evenodd")
      .attr("d", (d) => ring(d.points) + (d.holes || []).map(ring).join(""))
      .on("click", (event, d) => { event.stopPropagation(); onSelectRef.current(d.id); });
    sections.append("title").text((d) => d.name);

    // subsections: visible for the active section, clickable for the second zoom level
    const subs = g.append("g").selectAll("path").data(SUBS).join("path")
      .attr("class", "subsection").attr("fill-rule", "evenodd")
      .attr("d", (d) => d.rings.map(ring).join("") + d.holes.map(ring).join(""))
      .on("click", (event, d) => { event.stopPropagation(); onSelectSubRef.current?.(d.id); });
    subs.append("title").text((d) => d.id);
    const subLabels = g.append("g").selectAll("text").data(SUBS).join("text")
      .attr("class", "label sub-label").attr("x", (d) => T(d.centroid)[0]).attr("y", (d) => T(d.centroid)[1]).text((d) => d.id);

    // trails the benches were placed along
    const trailG = g.append("g").attr("class", "trails");
    const trails = trailG.selectAll("path").data(L.trails.flatMap((t) => t.lines.map((l) => ({ t, l })))).join("path")
      .attr("class", "trail").attr("stroke", (d) => d.t.color === "#f8fdf9" ? "#9fb3a6" : d.t.color).attr("d", (d) => line(d.l));
    trails.append("title").text((d) => d.t.name);

    // benches: small rotated rectangles, 8 ft twice as long as 4 ft; ids show once zoomed in
    const benchG = g.append("g").selectAll("g").data(BENCHES).join("g")
      .attr("class", (d) => `bench bench-${d.type}`)
      .attr("transform", (d) => `translate(${T([d.x, d.y])}) rotate(${d.angle})`)
      .on("click", (event, d) => { event.stopPropagation(); (onSelectBenchRef.current || (() => onSelectRef.current(d.section)))(d.id); });
    const benchRects = benchG.append("rect").attr("rx", 0.6);
    benchG.append("title").text((d) => `Bench ${d.id} · ${d.type === "concrete" ? "Concrete base" : "World's Fair"} · ${d.size} ft`);
    const benchLabels = benchG.append("text").attr("class", "bench-id").text((d) => d.id);

    const labelSel = g.append("g").selectAll("text").data(L.sections).join("text")
      .attr("class", "label").attr("x", (d) => T(d.centroid)[0]).attr("y", (d) => T(d.centroid)[1]).text((d) => letterOf(d.id));

    const applyScale = (k: number) => {
      const s = 1 / Math.sqrt(k);
      roads.attr("stroke-width", 1.6 * s);
      centers.attr("stroke-width", 1.1 * s).attr("stroke-dasharray", `${8 * s} ${8 * s}`);
      water.attr("stroke-width", 1 * s);
      sections.attr("stroke-width", (d) => (d.id === current ? 4 : 2) * s);
      labelSel.attr("font-size", 34 * s).attr("display", (d) => (d.id === current && SUBS.some((x) => x.section === d.id) ? "none" : null));
      subs.attr("stroke-width", 2.5 * s).attr("stroke-dasharray", `${8 * s} ${5 * s}`);
      subLabels.attr("font-size", 22 * s).attr("display", k > 7 ? "none" : null);
      trails.attr("stroke-width", 2.4 * s).attr("stroke-dasharray", (d) => (d.t.dashed ? `${6 * s} ${4 * s}` : null));
      const bs = Math.max(0.45, s);                       // benches shrink with zoom but stay a visible rectangle
      benchRects.attr("x", (d) => -d.size * 0.7 * bs).attr("y", -2.4 * bs).attr("width", (d) => d.size * 1.4 * bs).attr("height", 4.8 * bs).attr("stroke-width", 0.7 * bs);
      const ppu = ((svgRef.current?.clientWidth || width) / width) * k;   // screen px per map unit
      benchLabels.attr("font-size", 10 / ppu).attr("y", -3.2 * bs).attr("display", ppu >= 1.5 ? null : "none");
    };
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([1, 14]).on("zoom", (e) => { g.attr("transform", e.transform); applyScale(e.transform.k); });
    svg.call(zoom).on("click", () => onSelectRef.current(null));
    let current: string | null = null;

    const zoomToPts = (pts: Pt[]) => {
      const [x0, x1] = d3.extent(pts, (p) => p[0]) as [number, number];
      const [y0, y1] = d3.extent(pts, (p) => p[1]) as [number, number];
      svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity.translate(width / 2, height / 2)
          .scale(Math.min(14, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height)))
          .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
      );
    };
    api.current = {
      labels: (on) => labelSel.attr("display", on ? null : "none"),
      benches: (st, sel) => benchG.attr("class", (d) => `bench bench-${d.type} st-${st?.[d.id] || "available"}${d.id === sel ? " sel" : ""}`),
      zoomTo: (id, sub) => {
        current = id;
        sections.classed("active", (d) => d.id === id);
        subs.classed("shown", (d) => d.section === id).classed("active", (d) => d.id === sub);
        subLabels.classed("shown", (d) => d.section === id);
        labelSel.attr("display", (d) => (d.id === id && SUBS.some((x) => x.section === d.id) ? "none" : null));
        const sd = SUBS.find((d) => d.id === sub && d.section === id);
        const d = L.sections.find((s) => s.id === id);
        if (sd) return zoomToPts(sd.rings.flat().map(T));
        if (d) return zoomToPts(d.points.map(T));
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
      },
    };
    applyScale(1);
    return () => { svg.on(".zoom", null); svg.selectAll("*").remove(); api.current = null; };
  }, []);

  useEffect(() => { api.current?.zoomTo(activeId, activeSub); }, [activeId, activeSub]);
  useEffect(() => { api.current?.labels(labels); }, [labels]);
  useEffect(() => { api.current?.benches(statuses, activeBench); }, [statuses, activeBench]);

  return <svg ref={svgRef} className="park-map" role="img" aria-label="Map of Van Cortlandt Park sections" />;
}
