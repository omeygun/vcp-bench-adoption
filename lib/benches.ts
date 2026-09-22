import benches from "../data/benches.json";
export type Bench = { id: string; region: string; section: string; sub: string | null; x: number; y: number; angle: number; type: "worlds-fair" | "concrete"; size: 4 | 8; sides: 1 | 2 };
export const BENCHES = benches as Bench[];
const byId = new Map(BENCHES.map((b) => [b.id, b]));
export const benchById = (id: string) => byId.get(id);
