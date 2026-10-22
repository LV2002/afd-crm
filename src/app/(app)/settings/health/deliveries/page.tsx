import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import {
  OUTCOME_LABELS,
  type DeliveryOutcome,
} from "@/lib/integrations/classify-delivery";
import { getDeliveryChannels, getDeliveryLog } from "@/lib/integrations/delivery-log";

export const dynamic = "force-dynamic";

const OUTCOMES = Object.keys(OUTCOME_LABELS) as DeliveryOutcome[];
const DAY_CHOICES = [1, 7, 14, 30];
const SHOWN = 200;

const BADGE: Record<DeliveryOutcome, "default" | "secondary" | "destructive" | "outline"> = {
  created: "default",
  linked: "secondary",
  refused: "destructive",
  failed: "destructive",
  pending: "outline",
  accepted: "outline",
};

/**
 * Every delivery each channel and each custom endpoint has sent, and what
 * became of it.
 *
 * Built for one question: "the ad platform says nine leads, the CRM shows
 * three — did it try?" A delivery that arrived has a row here with its
 * outcome. A lead the sender never posted, or posted to a wrong address,
 * has no row at all, and that absence is the answer.
 */
export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ endpoint?: string; outcome?: string; days?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const params = await searchParams;
  const endpoint = params.endpoint || null;
  const outcome = OUTCOMES.find((o) => o === params.outcome) ?? null;
  const days = DAY_CHOICES.includes(Number(params.days)) ? Number(params.days) : 14;

  const [rows, channels] = await Promise.all([
    getDeliveryLog({ days, endpoint }),
    getDeliveryChannels(),
  ]);

  const counts = new Map<DeliveryOutcome, number>();
  for (const row of rows) counts.set(row.outcome, (counts.get(row.outcome) ?? 0) + 1);
  const duplicatesIgnored = rows.reduce((sum, row) => sum + row.duplicates, 0);

  const filtered = outcome ? rows.filter((row) => row.outcome === outcome) : rows;
  const shown = filtered.slice(0, SHOWN);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/settings/health" className="text-sm text-muted-foreground hover:underline">
          ← Platform health
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Every delivery</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          What each channel and each custom endpoint sent, and what became of it. A lead the sender
          never posted, or posted to a wrong address, has <strong>no row here</strong> — which tells
          you the CRM was never asked.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Endpoint
          <select
            name="endpoint"
            defaultValue={endpoint ?? ""}
            className="h-9 rounded-md border bg-background px-2"
          >
            <option value="">All channels</option>
            {channels.map((channel) => (
              <option key={channel.key} value={channel.key}>
                {channel.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Outcome
          <select
            name="outcome"
            defaultValue={outcome ?? ""}
            className="h-9 rounded-md border bg-background px-2"
          >
            <option value="">Any</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Period
          <select name="days" defaultValue={String(days)} className="h-9 rounded-md border bg-background px-2">
            {DAY_CHOICES.map((d) => (
              <option key={d} value={d}>
                Last {d} {d === 1 ? "day" : "days"}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground">
          Show
        </button>
      </form>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="outline">{rows.length} deliveries</Badge>
        {OUTCOMES.filter((o) => counts.get(o)).map((o) => (
          <Badge key={o} variant={BADGE[o]}>
            {counts.get(o)} {OUTCOME_LABELS[o].toLowerCase()}
          </Badge>
        ))}
        {duplicatesIgnored > 0 && (
          <Badge variant="secondary">{duplicatesIgnored} repeat sends ignored</Badge>
        )}
      </div>

      {rows.length >= 500 && (
        <p className="text-sm text-muted-foreground">Showing the newest 500 deliveries in this period.</p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Nothing matches. If you expected a lead here, it never reached the CRM: check the sender —
          is it still posting, and to this exact address?
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Received (IST)</th>
                <th className="px-3 py-2 font-medium">Endpoint</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">What became of it</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatDateIST(row.receivedAt, "d MMM, h:mm:ss a")}
                  </td>
                  <td className="px-3 py-2">{row.channel}</td>
                  <td className="px-3 py-2">
                    {row.who ? (
                      <>
                        <span className="font-medium">{row.who}</span>
                        {row.phone && <span className="block text-xs text-muted-foreground">{row.phone}</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={BADGE[row.outcome]}>{OUTCOME_LABELS[row.outcome]}</Badge>
                    {row.leadId && (
                      <Link href={`/leads/${row.leadId}`} className="ml-2 underline underline-offset-2">
                        Lead #{row.leadNumber}
                      </Link>
                    )}
                    {row.reason && <p className="mt-1 max-w-xl break-words text-xs text-muted-foreground">{row.reason}</p>}
                    {row.duplicates > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sent again {row.duplicates} more {row.duplicates === 1 ? "time" : "times"}
                        {row.lastDuplicateAt ? ` (last ${formatDateIST(row.lastDuplicateAt, "d MMM, h:mm a")})` : ""} and
                        ignored as a repeat of this one.
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > shown.length && (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {filtered.length}. Narrow the period or the endpoint to see the rest.
        </p>
      )}
    </div>
  );
}
