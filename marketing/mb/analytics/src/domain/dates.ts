const DAY = 86_400_000;
const parse = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso: string, days: number): string => new Date(parse(iso) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string): number => Math.round((parse(to) - parse(from)) / DAY);
export const dateRange = (from: string, to: string): string[] => Array.from({ length: Math.max(0, daysBetween(from, to) + 1) }, (_, i) => addDays(from, i));
// Google's own yyyymmdd (Analytics) to yyyy-mm-dd.
export const fromCompact = (d: string): string => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
// "https://afdindia.com/page/x?y=1" to "/page/x".
export const pathOf = (url: string): string => { try { return new URL(url).pathname.replace(/\/$/, '') || '/'; } catch { return url; } };
