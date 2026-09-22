import { NextResponse } from "next/server";
export const json = (data: unknown, status = 200, headers?: Record<string, string>) => NextResponse.json(data, { status, headers });
export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
export const ip = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
// ponytail: per-instance in-memory limiter; move to Vercel KV if abuse shows up across regions
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  if (arr.length > max) throw new HttpError(429, "Too many requests, try again later");
}
export const isEmail = (s: unknown): s is string => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
export const str = (v: unknown, max: number, min = 0) => (typeof v === "string" && v.trim().length >= min && v.length <= max ? v.trim() : undefined);
export async function body(req: Request): Promise<Record<string, unknown>> { try { return (await req.json()) as Record<string, unknown>; } catch { throw new HttpError(400, "Invalid JSON"); } }
export function handle(fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try { return await fn(req, ctx); }
    catch (e) { if (e instanceof HttpError) return bad(e.message, e.status); if ((e as Error)?.name === "ConditionFailed") return bad("Conflict: " + (e as Error).message, 409); console.error(e); return bad("Server error", 500); }
  };
}
