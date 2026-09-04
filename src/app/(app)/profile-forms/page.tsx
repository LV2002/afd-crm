import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import type { FieldSchemaEntry, FieldType } from "@/lib/fields/get-field-schema";
import {
  OPTION_BEARING_TYPES,
  resolveFieldOptions,
  type FieldOption,
} from "@/lib/fields/resolve-field-options";
import { getStudentFieldLabels } from "@/lib/profile-form/field-labels";
import { defaultColumnKeys, isSheetColumn } from "@/lib/profile-form/sheet";
import { createClient } from "@/lib/supabase/server";

import { ProfileFormsTable, type ProfileFormRow, type SheetColumnWithDefault } from "./profile-forms-table";

interface StudentFieldRow {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  options: Array<{ value: string; label: string }> | null;
  show_in_list: boolean;
  is_core: boolean;
}

/**
 * Every submitted student profile form, in one queryable table.
 *
 * Reads through the RLS-bound Supabase client, so a counsellor sees the
 * forms for their own leads and a centre head their centre's — the same
 * boundary as the leads list, enforced by the same policies rather than
 * by anything this page does.
 *
 * The columns come from the questions themselves: whatever the form asks
 * can be a column, sorted and filtered on. Nothing here names a question,
 * so a form rewritten in Settings brings its own new columns with it.
 */
export default async function ProfileFormsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  const supabase = await createClient();
  const [{ data: rows }, fieldLabels, { data: definitions }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, lead_number, student_name, profile_form_submitted_at, profile_form_token, profile_form_data, center_id",
      )
      .is("deleted_at", null)
      .not("profile_form_token", "is", null)
      .order("profile_form_submitted_at", { ascending: false, nullsFirst: false })
      .returns<ProfileFormRow[]>(),
    getStudentFieldLabels(supabase),
    supabase
      .from("field_definitions")
      .select("id, key, label, type, options, show_in_list, is_core")
      .eq("entity", "student")
      .eq("on_profile_form", true)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order")
      .returns<StudentFieldRow[]>(),
  ]);

  // Only questions the form actually asks can be columns — anything else
  // would be a column of blanks — and only the types worth putting in a
  // grid (see sheet.ts on why a phone number is not one of them).
  const columnFields = (definitions ?? []).filter(isSheetColumn);

  const withOptions = await Promise.all(
    columnFields.map(async (definition): Promise<SheetColumnWithDefault> => {
      let options: FieldOption[] = [];
      if (definition.type === "boolean") {
        options = [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ];
      } else if (OPTION_BEARING_TYPES.has(definition.type)) {
        // Resolves a batch or a centre to its name, and a dropdown-backed
        // question to the admin's own option list.
        options = await resolveFieldOptions(supabase, {
          id: definition.id,
          key: definition.key,
          label: definition.label,
          helpText: null,
          type: definition.type,
          rawOptions: definition.options,
          isCore: definition.is_core,
          isRequired: false,
          section: "",
          sortOrder: 0,
          showInList: definition.show_in_list,
          showInFilters: false,
          isEditable: false,
        } satisfies FieldSchemaEntry);
      }
      return {
        key: definition.key,
        label: definition.label,
        type: definition.type,
        options,
        showInList: definition.show_in_list,
      };
    }),
  );

  const all = rows ?? [];
  const submitted = all.filter((r) => r.profile_form_submitted_at !== null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Student Profile Forms</h1>
        <p className="text-sm text-muted-foreground">
          Forms sent to students who are joining. {submitted.length} submitted of {all.length} sent.
        </p>
        {/*
          The questions are not edited here — they live on their own
          builder screen. Saying so where someone looks for them saves a
          hunt through Settings.
        */}
        <p className="mt-1 text-sm text-muted-foreground">
          To change what the form asks, use{" "}
          <Link href="/settings/profile-form" className="font-medium underline">
            Settings → Student Profile Form
          </Link>
          . A form link is created from an individual lead&apos;s page.
        </p>
      </div>

      {all.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No profile forms yet. Open a lead who is joining and create their form link from the
            Student profile form section on their page.
          </p>
        </div>
      ) : (
        <ProfileFormsTable
          rows={all}
          fieldLabels={fieldLabels}
          columns={withOptions}
          defaultColumns={defaultColumnKeys(withOptions)}
          canRevealPhone={can(user, "lead.reveal_phone")}
          phoneKeys={(definitions ?? []).filter((d) => d.type === "phone").map((d) => d.key)}
        />
      )}
    </div>
  );
}
