import { handle, json } from "@/lib/http";
import { getConfig } from "@/lib/config";
export const GET = handle(async () => json({ ...(await getConfig("PRICING")), termYears: 10, placeholder: true }, 200, { "Cache-Control": "public, s-maxage=300" }));
