import { getStore } from "./store";
export const DEFAULTS = {
  PRICING: { adoptCents: 350000 },                          // placeholder until VCPA confirms
  REMINDERS: { offsetsDays: [-365, -180, -90, -30, -14, 0, 30], channels: ["email"] as string[] },
  STAFF: { staff: [] as { email: string; hash?: string; createdAt?: string; mustChange?: boolean }[] },
};
export type ConfigName = keyof typeof DEFAULTS;
export async function getConfig<N extends ConfigName>(name: N): Promise<(typeof DEFAULTS)[N]> {
  const item = await getStore().get("CONFIG", name);
  return { ...DEFAULTS[name], ...((item?.value as object) || {}) } as (typeof DEFAULTS)[N];
}
export const setConfig = (name: ConfigName, value: object) => getStore().put({ PK: "CONFIG", SK: name, value, updatedAt: new Date().toISOString() });
