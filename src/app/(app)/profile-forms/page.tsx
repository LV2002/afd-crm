import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getStudentFieldLabels } from "@/lib/profile-form/field-labels";
import { createClient } from "@/lib/supabase/server";

import { ProfileFormsTable, type ProfileFormRow } from "./profile-forms-table";

/**
 * Every submitted student profile form, in one queryable table.
 *
 * Reads through the RLS-bound Supabase client, so a counsellor sees the
 * forms for their own leads and a centre head their centre's — the same
 * boundary as the leads list, enforced by the same policies rather than
 * by anything this page does.
 */
export default async function ProfileFormsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  const supabase = await createClient();
  const [{ data: rows }, fieldLabels] = await Promise.all([
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
  ]);

  const all = rows ?? [];
  const submitted = all.filter((r) => r.profile_form_submitted_at !== null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Student Profile Forms</h1>
        <p className="text-sm text-muted-foreground">
          Forms sent to students who are joining. {submitted.length} submitted of {all.length} sent.
        </p>
      </div>

      {all.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No profile forms yet. Open a lead who is joining and create their form link from the
            Student profile form section.
          </p>
        </div>
      ) : (
        <ProfileFormsTable rows={all} fieldLabels={fieldLabels} />
      )}
    </div>
  );
}
