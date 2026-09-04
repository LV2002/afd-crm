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
import {
  templateBody,
  templatePlaceholderCount,
  templateQuickReplies,
} from "@/lib/integrations/whatsapp/templates";

import { listTemplates } from "./actions";
import { DeleteTemplateButton } from "./delete-template-button";
import { TemplateForm } from "./template-form";

/**
 * Message templates, read live from Meta.
 *
 * A template is the only thing WhatsApp lets you send to someone who
 * hasn't messaged you in the last 24 hours, and every one has to be
 * approved by Meta first. Before this screen a counsellor typed a
 * template name from memory and found out it was wrong when the send
 * failed; now the approved ones are visible, with what they say and what
 * they still need filled in.
 */
export default async function WhatsAppTemplatesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const result = await listTemplates();

  return (
    <div className="flex flex-col gap-6">
      {result.status === "not_connected" && (
        <div className="rounded-lg border border-dashed p-6">
          <p className="text-sm font-medium">WhatsApp isn&apos;t connected yet.</p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Templates live on your WhatsApp Business Account, so an admin needs to set the access
            token and the WhatsApp Business Account ID in{" "}
            <Link href="/settings/integrations/whatsapp" className="font-medium underline">
              Settings → Integrations → WhatsApp
            </Link>
            .
          </p>
        </div>
      )}

      {result.status === "error" && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{result.message}</p>
        </div>
      )}

      {result.status === "ok" && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Templates on this account
            </h2>
            <p className="text-sm text-muted-foreground">
              Read live from Meta each time this page opens — approval state is theirs to change,
              so a copy kept here would go stale.
            </p>
          </div>

          {result.templates.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No templates yet. Create one below and Meta will review it.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="text-right">Fills in</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.templates.map((template) => {
                    const replies = templateQuickReplies(template);
                    const placeholders = templatePlaceholderCount(template);
                    return (
                      <TableRow key={`${template.id}-${template.language}`}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell>
                          <StatusBadge status={template.status} />
                          {template.rejected_reason &&
                            template.rejected_reason !== "NONE" && (
                              <p className="mt-1 text-xs text-destructive">
                                {template.rejected_reason}
                              </p>
                            )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {template.category.toLowerCase()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {template.language}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="whitespace-pre-wrap text-sm">{templateBody(template)}</p>
                          {replies.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Buttons: {replies.join(" · ")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {placeholders === 0 ? "—" : `${placeholders} value${placeholders === 1 ? "" : "s"}`}
                        </TableCell>
                        <TableCell className="text-right">
                          <DeleteTemplateButton name={template.name} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      <TemplateForm />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "APPROVED") return <Badge variant="secondary">Approved</Badge>;
  if (status === "PENDING" || status === "IN_APPEAL") {
    return <Badge variant="outline">Awaiting Meta</Badge>;
  }
  return (
    <Badge variant="outline" className="border-destructive text-destructive">
      {status.replace(/_/g, " ").toLowerCase()}
    </Badge>
  );
}
