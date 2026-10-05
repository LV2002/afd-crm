import { Badge } from "@/components/ui/badge";
import { formatDateIST } from "@/lib/format/date";

import type { WebhookSourceHealth } from "./webhook-deliveries";

/** What each channel is called on screen. The enum values are not English. */
const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram DMs",
  meta_leads: "Meta Lead Ads",
  google_leads: "Google Lead Forms",
  website: "Website forms",
  custom: "Custom endpoints",
  knorish: "Knorish",
};

function label(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/**
 * Whether anything is arriving, per channel, and whether it is being let in.
 *
 * The reason this is on the health screen and not buried in a developer
 * log: an empty WhatsApp inbox has three causes and only one of them is
 * in this CRM. Meta never calling, Meta being turned away at the door,
 * and a message stored but filtered out of view all look identical from
 * the inbox — and the middle one is invisible by design, because a
 * rejected delivery is not an error, it is this CRM working correctly.
 *
 * So the one number that matters here is **rejected**. Any at all means
 * the signing secret stored in the CRM does not match the app that is
 * sending, and every message is being dropped. That is a two-field fix
 * which nobody can make if nobody can see it.
 */
export function WebhookDeliveriesPanel({ sources }: { sources: WebhookSourceHealth[] }) {
  if (sources.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-[0.9375rem]">
          <strong>Nothing has arrived in the last seven days</strong> — no WhatsApp message, no
          Instagram DM, no ad lead, no website form.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          If that is wrong, the callbacks are not reaching the CRM at all, which is a setting on
          the sending side rather than here: the callback URL, or the fields it is subscribed to.
          See <strong>docs/WHATSAPP-SETUP.md</strong> and <strong>docs/ADS-SETUP.md</strong>.
        </p>
      </div>
    );
  }

  const anyRejected = sources.some((source) => source.rejected > 0);

  return (
    <div className="flex flex-col gap-3">
      {anyRejected && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="text-[0.9375rem]">
            <strong>Deliveries are being rejected.</strong> The CRM checks that each callback is
            signed by the app it claims to come from, and these failed that check — so they were
            recorded and refused, and none of their messages reached anybody.
          </p>
          <p className="mt-2 text-muted-foreground">
            Almost always the <strong>App secret</strong> stored in the CRM not matching the Meta
            app that is sending. Each integration holds its own copy: WhatsApp&apos;s is on{" "}
            <strong>Settings → Integrations → WhatsApp</strong>, and Instagram and Lead Ads share
            the one on <strong>Settings → Integrations → Meta</strong>. Setting one does not set
            the other, which is the usual way this happens.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sources.map((source) => (
          <div
            key={source.source}
            className={
              source.rejected > 0
                ? "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-destructive/50 bg-destructive/5 p-3"
                : "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border p-3"
            }
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{label(source.source)}</p>
              {source.lastAt && (
                <p className="text-xs text-muted-foreground">
                  Last: {formatDateIST(source.lastAt, "d MMM, h:mm a")}
                </p>
              )}
              {source.lastError && (
                <p className="mt-0.5 text-xs text-muted-foreground">{source.lastError}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{source.total} received</Badge>
              {source.rejected > 0 && (
                <Badge variant="destructive">{source.rejected} rejected</Badge>
              )}
              {source.failed > 0 && <Badge variant="secondary">{source.failed} failed</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
