import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
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
import { OPT_OUT_KEYWORD_CATEGORY } from "@/lib/whatsapp/opt-out";
import { getDropdownOptions } from "@/lib/fields/resolve-field-options";
import { createClient } from "@/lib/supabase/server";

import { AddSuppressionForm, ReleaseButton } from "./suppression-form";

interface SuppressionRow {
  id: string;
  phone: string;
  reason: string | null;
  source: string;
  created_at: string;
  released_at: string | null;
}

/**
 * Everyone who has told us to stop, and how to let one back in.
 *
 * Numbers are shown in full, unlike every other list in this CRM. The
 * point of the screen is to answer "why didn't this person get the
 * message?" and to let somebody be added or removed by number — a masked
 * number answers neither. Only `whatsapp.campaign` holders can open it,
 * which is a much smaller group than CLAUDE.md non-negotiable #6 is
 * about.
 */
export default async function WhatsAppSuppressionsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const supabase = await createClient();
  const [{ data: rows }, keywords] = await Promise.all([
    supabase
      .from("whatsapp_suppressions")
      .select("id, phone, reason, source, created_at, released_at")
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<SuppressionRow[]>(),
    getDropdownOptions(supabase, OPT_OUT_KEYWORD_CATEGORY),
  ]);

  const all = rows ?? [];
  const live = all.filter((row) => row.released_at === null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Nobody here receives WhatsApp from the CRM — not a broadcast, not an automated
          reminder. Anyone who messages the number with{" "}
          {keywords.length > 0 ? (
            <span className="font-medium">
              {keywords.map((keyword) => keyword.label).join(", ")}
            </span>
          ) : (
            "an opt-out keyword"
          )}{" "}
          lands here on their own. Those words are yours to change in{" "}
          <Link href="/settings/dropdowns" className="font-medium underline">
            Settings → Dropdowns
          </Link>
          .
        </p>
        <p className="mt-2 text-sm">
          <span className="font-semibold">{live.length}</span> number
          {live.length === 1 ? "" : "s"} currently opted out.
        </p>
      </div>

      {all.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nobody has opted out.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>How</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>When</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.phone}</TableCell>
                  <TableCell>
                    {row.released_at ? (
                      <Badge variant="secondary">Allowed again</Badge>
                    ) : (
                      <Badge variant="outline" className="border-destructive text-destructive">
                        Opted out
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.source === "keyword" ? "Messaged us" : "By hand"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.reason ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateIST(row.created_at, "d MMM yyyy")}
                    {row.released_at && (
                      <span className="block text-xs">
                        allowed {formatDateIST(row.released_at, "d MMM yyyy")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.released_at === null && <ReleaseButton phone={row.phone} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddSuppressionForm />
    </div>
  );
}
