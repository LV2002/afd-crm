import Link from "next/link";
import { Plus } from "lucide-react";

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
import { createClient } from "@/lib/supabase/server";

import { PlacementControls, RequiredSwitch } from "./question-row-actions";

/**
 * The student profile form, built as a form rather than as a list of
 * columns.
 *
 * Settings → Custom Fields still exists and still edits the same rows —
 * this screen is a different view of them, for a different job. There, an
 * admin is adding a field to the student record; here they are composing
 * the questionnaire a student receives, in the order they receive it,
 * which is why this screen shows order, required and on/off the form, and
 * hides entity, list and filter visibility.
 */

interface QuestionRow {
  id: string;
  key: string;
  label: string;
  help_text: string | null;
  type: string;
  section: string;
  is_required: boolean;
  is_active: boolean;
  on_profile_form: boolean;
}

export default async function ProfileFormSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const { data } = await supabase
    .from("field_definitions")
    .select("id, key, label, help_text, type, section, is_required, is_active, on_profile_form")
    .eq("entity", "student")
    .is("deleted_at", null)
    .order("sort_order")
    .order("key")
    .returns<QuestionRow[]>();

  const all = data ?? [];
  const onForm = all.filter((row) => row.on_profile_form);
  const offForm = all.filter((row) => !row.on_profile_form);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Student Profile Form</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The questions a student answers on their own profile form — the link a counsellor
            copies from a lead&apos;s page once that student has confirmed they&apos;re joining.
            Changes take effect immediately, including on links already sent.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/fields/new?entity=student">
            <Plus /> Add a question
          </Link>
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          On the form · {onForm.length} question{onForm.length === 1 ? "" : "s"}
        </h2>
        {onForm.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No questions on the form yet. Switch one on below, or add a new one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Section</TableHead>
                <TableHead className="text-center">Required</TableHead>
                <TableHead className="text-right">On form</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {onForm.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <Link
                      href={`/settings/fields/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.label}
                    </Link>
                    {!row.is_active && (
                      <Badge variant="outline" className="ml-2">
                        Inactive
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {row.help_text ? row.help_text : row.key}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.type.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.section}</TableCell>
                  <TableCell>
                    <RequiredSwitch fieldId={row.id} isRequired={row.is_required} />
                  </TableCell>
                  <TableCell>
                    <PlacementControls
                      fieldId={row.id}
                      onForm
                      isFirst={index === 0}
                      isLast={index === onForm.length - 1}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Not asked on the form
        </h2>
        {/*
          Shown rather than hidden: these are the student fields staff fill
          in themselves, and an admin looking for a question that isn't on
          the form needs to find it here rather than assume it doesn't
          exist and create a duplicate.
        */}
        <p className="max-w-2xl text-sm text-muted-foreground">
          Part of the student record, filled in by staff. Switch one on to start asking students
          for it instead.
        </p>
        {offForm.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every student field is on the form.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Section</TableHead>
                <TableHead className="text-right">On form</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offForm.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/settings/fields/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.label}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.key}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.type.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.section}</TableCell>
                  <TableCell>
                    <PlacementControls fieldId={row.id} onForm={false} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
