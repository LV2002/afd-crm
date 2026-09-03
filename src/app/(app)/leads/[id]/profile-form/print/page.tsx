import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { ProfileSheet } from "@/components/print/profile-sheet";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { formatDateIST } from "@/lib/format/date";
import { buildSheetCells, resolveOptionsForPrint } from "@/lib/print/profile-sheet";
import { createClient } from "@/lib/supabase/server";

/**
 * What a student answered on their own profile form, printed on AFD's
 * paper sheet.
 *
 * Same layout as /students/[id]/print, from the shared component, because
 * it IS the same sheet — the difference is only which side filled it in.
 * This one exists because a student's answers arrive long before the
 * `students` row does: the record is created at the accounts→academics
 * gate, and the office needs the sheet in the file from the day the form
 * comes back.
 *
 * Read through the RLS-bound client, so a counsellor gets their own
 * leads' forms and a centre head their centre's — the same boundary as
 * the lead page, enforced by the same policies.
 */

interface LeadRow {
  id: string;
  lead_number: number;
  student_name: string;
  profile_form_data: Record<string, unknown> | null;
  profile_form_submitted_at: string | null;
}

interface OrgRow {
  name: string;
  logo_url: string | null;
}

export default async function LeadProfileFormPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: lead }, { data: org }, fields] = await Promise.all([
    supabase
      .from("leads")
      .select("id, lead_number, student_name, profile_form_data, profile_form_submitted_at")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<LeadRow>(),
    supabase.from("org_settings").select("name, logo_url").maybeSingle<OrgRow>(),
    // The STUDENT field definitions: the profile form's answers are keyed
    // by them, so they are what turns a stored key into a printed label.
    getFieldSchema(supabase, "student", user),
  ]);

  if (!lead) notFound();

  const answers = lead.profile_form_data ?? {};
  const options = await resolveOptionsForPrint(supabase, fields);
  const cells = buildSheetCells(fields, options, (key) => answers[key] ?? null);

  /**
   * The student's own spelling of their name wins over the one on the
   * lead, which is often whatever an ad form or a walk-in slip captured
   * ("Rahul" for "Rahul Krishnan M"). Falls back to the lead's when the
   * form doesn't ask for it.
   */
  const fullName = typeof answers.full_name === "string" && answers.full_name.trim()
    ? answers.full_name.trim()
    : lead.student_name;

  const photoUrl =
    typeof answers.photo_url === "string" && answers.photo_url.startsWith("http")
      ? answers.photo_url
      : null;

  const caption = lead.profile_form_submitted_at
    ? `Submitted ${formatDateIST(lead.profile_form_submitted_at, "d MMM yyyy, h:mm a")} · Lead #${lead.lead_number}`
    : // Still worth printing: an unsubmitted form comes out as the blank
      // sheet, which is exactly what a walk-in fills in by hand.
      `Not submitted yet — this prints as a blank form. Lead #${lead.lead_number}`;

  return (
    <ProfileSheet
      orgName={org?.name ?? "AFD India"}
      logoUrl={org?.logo_url ?? null}
      name={fullName}
      photoUrl={photoUrl}
      cells={cells}
      caption={caption}
    />
  );
}
