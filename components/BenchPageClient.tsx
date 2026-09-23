"use client";
import { useState } from "react";
import ParkMap, { type BenchState } from "./ParkMap";

/** Non-interactive close-up of one bench on the park map. */
export function BenchSpot({ id, section, state }: { id: string; section: string; state: BenchState }) {
  return <div className="bench-spot"><ParkMap activeId={section} activeBench={id} onSelect={() => {}} onSelectBench={() => {}} statuses={{ [id]: state }} /></div>;
}

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = location.href;
    if (navigator.share) return navigator.share({ title, url }).catch(() => {});
    await navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return <button className="btn ghost" onClick={share}>{copied ? "Link copied" : "Share"}</button>;
}
