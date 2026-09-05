import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { describeSchedule } from "@/lib/whatsapp/schedule";
import { createClient } from "@/lib/supabase/server";

import { CancelBroadcastButton } from "./cancel-button";

interface BroadcastRow {
  id: string;
  name: string;
  template_name: string;
  status: "draft" | "scheduled" | "sending" | "completed" | "failed" | "cancelled";
  audience_entity: "lead" | "student";
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  started_at: string | null;
  scheduled_for: string | null;
}

const STATUS_VARIANT: Record<BroadcastRow["status"], "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  scheduled: "secondary",
  sending: "default",
  completed: "default",
  failed: "destructive",
  // A person stopped it. Not "destructive" — nothing went wrong, somebody
  // changed their mind, and colouring a decision like a fault is how a
  // dashboard trains people to ignore red.
  cancelled: "secondary",
};

export default async function WhatsAppBroadcastsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const supabase = await createClient();
  const { data: broadcasts } = await supabase
    .from("whatsapp_broadcasts")
    .select(
      "id, name, template_name, status, audience_entity, total_recipients, sent_count, failed_count, started_at, scheduled_for",
    )
    .order("created_at", { ascending: false })
    .returns<BroadcastRow[]>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          An approved template sent to a slice of your leads or students, picked with the same
          filters as Insights. Each message can carry that person&rsquo;s own name and details. Send
          it now or set a time; a background job sends a few at a time, so refresh to see progress.
        </p>
        <Button asChild>
          <Link href="/whatsapp/broadcasts/new">New broadcast</Link>
        </Button>
      </div>

      {!broadcasts || broadcasts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No broadcasts sent yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>When</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {broadcasts.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell>{b.template_name}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[b.status]}>{b.status}</Badge>
                </TableCell>
                <TableCell>
                  {b.sent_count + b.failed_count} / {b.total_recipients}
                  {b.failed_count > 0 && (
                    <span className="text-destructive"> ({b.failed_count} failed)</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {b.status === "scheduled" && b.scheduled_for
                    ? `Goes out ${describeSchedule(b.scheduled_for)}`
                    : b.started_at
                      ? formatDateIST(b.started_at, "d MMM yyyy, h:mm a")
                      : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {(b.status === "scheduled" || b.status === "sending") && (
                    <CancelBroadcastButton
                      broadcastId={b.id}
                      scheduled={b.status === "scheduled"}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
