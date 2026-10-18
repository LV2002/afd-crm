/**
 * How full is something, and how loudly to say so.
 *
 * Pure, so the thresholds are tested rather than remembered. 70% is the
 * point at which Leon should be thinking about upgrading (a plan change
 * takes minutes, but a full bucket stops uploads); 90% is "do it today".
 */
export type UsageLevel = "ok" | "warn" | "critical" | "unknown";

export const WARN_AT = 0.7;
export const CRITICAL_AT = 0.9;

export interface Usage {
  usedBytes: number;
  limitBytes: number;
  /** 0..1+, not clamped — 1.2 means over the limit. */
  fraction: number;
  level: UsageLevel;
}

export function assessUsage(usedBytes: number | null, limitBytes: number): Usage | null {
  if (usedBytes === null || !Number.isFinite(usedBytes) || limitBytes <= 0) return null;
  const fraction = usedBytes / limitBytes;
  const level: UsageLevel = fraction >= CRITICAL_AT ? "critical" : fraction >= WARN_AT ? "warn" : "ok";
  return { usedBytes, limitBytes, fraction, level };
}

/** "412 MB", "1.3 GB" — decimal-free below 10 so the bar and the words agree at a glance. */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** An env var in megabytes, falling back to the free-plan figure when unset or nonsense. */
export function limitFromEnv(raw: string | undefined, fallbackMb: number): number {
  const mb = Number(raw);
  return (Number.isFinite(mb) && mb > 0 ? mb : fallbackMb) * 1024 * 1024;
}
