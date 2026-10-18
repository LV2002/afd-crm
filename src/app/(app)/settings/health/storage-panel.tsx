import { formatBytes, type Usage } from "@/lib/health/storage-level";
import type { StorageReport } from "@/lib/health/storage-usage";

const BAR: Record<Usage["level"], string> = {
  ok: "bg-[var(--success)]",
  warn: "bg-amber-500",
  critical: "bg-destructive",
  unknown: "bg-muted-foreground",
};

function Meter({ label, usage, extra }: { label: string; usage: Usage | null; extra?: string }) {
  if (!usage) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">Could not be measured here.</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.round(usage.fraction * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatBytes(usage.usedBytes)} of {formatBytes(usage.limitBytes)} · {Math.round(usage.fraction * 100)}%
          {extra ? ` · ${extra}` : ""}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} used`}
      >
        <div className={`h-full rounded-full ${BAR[usage.level]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * How much of the hosting plan is used.
 *
 * Files are the one that fills first (every profile form and signed
 * agreement lands there), the database the one that almost never does — so
 * both are shown, and the warning names which one is the problem.
 */
export function StoragePanel({ report }: { report: StorageReport }) {
  const worst = [report.files, report.database]
    .filter((u): u is Usage => u !== null)
    .sort((a, b) => b.fraction - a.fraction)[0];
  const tone =
    worst?.level === "critical"
      ? "rounded-lg border border-destructive/50 bg-destructive/5 p-4"
      : worst?.level === "warn"
        ? "rounded-lg border border-amber-500/50 bg-amber-500/5 p-4"
        : "rounded-lg border p-4";

  return (
    <div className={`${tone} flex flex-col gap-4`}>
      <Meter
        label="File storage"
        usage={report.files}
        extra={report.fileCount !== null ? `${report.fileCount.toLocaleString("en-IN")} files` : undefined}
      />
      <Meter label="Database" usage={report.database} />
      {worst && worst.level !== "ok" && (
        <p className="text-[0.9375rem]">
          <strong>
            {worst.level === "critical" ? "Almost full — act today." : "Getting full — plan the upgrade."}
          </strong>{" "}
          When file storage fills, new uploads start failing. Upgrade the Supabase plan (Pro is 100 GB of
          files and 8 GB of database) or free space by removing test files. Then set{" "}
          <code>STORAGE_LIMIT_MB</code> / <code>DATABASE_LIMIT_MB</code> in Vercel to the new plan&rsquo;s
          size so this gauge stays accurate.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Measured by the database. Limits assume the Supabase free plan (1 GB files, 500 MB database).
      </p>
    </div>
  );
}
