import { Badge } from "@/components/ui/badge";
import { formatDateIST } from "@/lib/format/date";
import type { WebhookDelivery } from "@/lib/integrations/recent-deliveries";

/**
 * What the platform has actually sent, newest first.
 *
 * The empty state is the most useful thing on this panel, so it says what
 * an empty list MEANS rather than "no data": nothing has ever arrived, so
 * the problem is upstream of the CRM and no amount of looking at the CRM
 * will show it.
 */
export function RecentDeliveries({
  deliveries,
  emptyHint,
}: {
  deliveries: WebhookDelivery[];
  emptyHint: string;
}) {
  if (deliveries.length === 0) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning-subtle p-4">
        <p className="text-[0.9375rem]">
          <strong>Nothing has ever arrived here.</strong> {emptyHint}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {deliveries.map((delivery) => (
        <div
          key={delivery.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border p-3 text-sm"
        >
          <div className="flex items-center gap-2">
            <Badge
              variant={
                delivery.status === "done"
                  ? "default"
                  : delivery.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
            >
              {delivery.status}
            </Badge>
            {/* A failed signature is a different problem from a failed
                lead fetch — it means the App Secret saved here does not
                match the one that signed the request. */}
            {!delivery.signature_ok && <Badge variant="destructive">bad signature</Badge>}
            <span className="font-mono text-xs text-muted-foreground">{delivery.external_id}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDateIST(delivery.received_at, "d MMM, h:mm a")}
            {delivery.attempts > 1 && ` · ${delivery.attempts} attempts`}
          </span>
          {delivery.last_error && (
            <p className="w-full break-words text-xs text-destructive">{delivery.last_error}</p>
          )}
        </div>
      ))}
    </div>
  );
}
