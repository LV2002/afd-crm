import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { groupBySection } from "@/lib/fields/group-by-section";
import {
  getDropdownOptions,
  OPTION_BEARING_TYPES,
  resolveFieldOptions,
  type FieldOption,
} from "@/lib/fields/resolve-field-options";
import { getLeadDetail } from "@/lib/leads/get-lead-detail";
import { formatDateIST } from "@/lib/format/date";
import { formatINR } from "@/lib/format/currency";
import { createClient } from "@/lib/supabase/server";
import { AttachmentsPanel } from "@/components/files/attachments-panel";
import { FeePlanPanel } from "@/components/enrolment/fee-plan-panel";
import { ProfileFormPanel } from "@/components/profile-form/profile-form-panel";
import { listAttachments } from "@/lib/storage/attachments";
import { getLeadFeePlan } from "@/lib/enrolment/get-fee-plan";
import { getStudentFieldLabels } from "@/lib/profile-form/field-labels";
import { getWhatsAppThread, isWithinCustomerServiceWindow } from "@/lib/whatsapp/get-thread";

import { ConfirmAdmissionForm } from "./confirm-admission-form";
import { InteractionForm } from "./interaction-form";
import { LeadEditForm } from "./lead-edit-form";
import { LeadTagsPanel, type TagOption } from "./lead-tags-panel";
import { TasksPanel, type TaskRow } from "./tasks-panel";
import { WhatsAppPanel } from "@/components/whatsapp/whatsapp-panel";

interface EnrolmentRow {
  id: string;
  course: string;
  net_fee_paise: number;
  status: string;
  dropped_at: string | null;
  drop_reason: string | null;
  sales_to_accounts_at: string | null;
}

interface TimelineEntry {
  id: string;
  at: string;
  label: string;
  detail: string | null;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();
  const detail = await getLeadDetail(supabase, id);
  if (!detail) notFound();

  const { row, stageName, centerName, assignedToName } = detail;
  const canRevealPhone = can(user, "lead.reveal_phone");

  const fields = await getFieldSchema(supabase, "lead", user);
  const editableFields = fields.filter((f) => f.isEditable || f.type === "phone");
  const sections = groupBySection(editableFields);

  const optionsByKey: Record<string, FieldOption[]> = {};
  for (const field of editableFields) {
    if (OPTION_BEARING_TYPES.has(field.type)) {
      optionsByKey[field.key] = await resolveFieldOptions(supabase, field);
    }
  }

  const values: Record<string, unknown> = {};
  for (const field of fields) {
    values[field.key] = field.isCore ? row[field.key] : (row.custom ?? {})[field.key];
  }

  const canCreateEnrolment = can(user, "enrolment.create");

  const [interactionTypes, interactionOutcomes, courseOptions, modeOptions, { data: enrolment }] = await Promise.all([
    getDropdownOptions(supabase, "interaction_type"),
    getDropdownOptions(supabase, "interaction_outcome"),
    canCreateEnrolment ? getDropdownOptions(supabase, "course") : Promise.resolve([]),
    canCreateEnrolment ? getDropdownOptions(supabase, "preferred_mode") : Promise.resolve([]),
    supabase
      .from("enrolments")
      .select("id, course, net_fee_paise, status, dropped_at, drop_reason, sales_to_accounts_at")
      .eq("lead_id", id)
      .is("deleted_at", null)
      .maybeSingle<EnrolmentRow>(),
  ]);

  const [{ data: leadTagRows }, { data: allTagRows }] = await Promise.all([
    supabase
      .from("lead_tags")
      .select("tag_id, tags(id, name, color)")
      .eq("lead_id", id)
      .returns<Array<{ tag_id: string; tags: TagOption | null }>>(),
    supabase
      .from("tags")
      .select("id, name, color")
      .eq("is_active", true)
      .order("name")
      .returns<TagOption[]>(),
  ]);
  const currentTags = (leadTagRows ?? []).map((r) => r.tags).filter((t): t is TagOption => t !== null);
  const currentTagIds = new Set(currentTags.map((t) => t.id));
  const availableTags = (allTagRows ?? []).filter((t) => !currentTagIds.has(t.id));

  const timeline = await getTimeline(supabase, id);

  const canReadWhatsApp = can(user, "whatsapp.read");
  const [whatsappMessages, withinWhatsAppWindow] = canReadWhatsApp
    ? await Promise.all([getWhatsAppThread(supabase, id), isWithinCustomerServiceWindow(supabase, id)])
    : [[], false];

  const canReadFiles = can(user, "file.read");
  const attachments = canReadFiles ? await listAttachments(supabase, { kind: "lead", id }) : [];
  // The signed agreement is just an attachment labelled as such — the same
  // storage and access rules as any other file, no separate mechanism.
  const hasSignedAgreement = attachments.some((a) =>
    (a.label ?? "").toLowerCase().includes("instalment"),
  );

  const canReadFees = can(user, "enrolment.read");
  const feePlan = canReadFees ? await getLeadFeePlan(id) : null;
  const studentFieldLabels = await getStudentFieldLabels(supabase);

  const { data: taskRows } = await supabase
    .from("tasks")
    .select("id, title, type, due_at, status")
    .eq("lead_id", id)
    .is("deleted_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .returns<TaskRow[]>();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{row.student_name}</h1>
          <p className="text-sm text-muted-foreground">Lead #{row.lead_number}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stageName && <Badge variant="secondary">{stageName}</Badge>}
          {Boolean(row.temperature) && <Badge variant="outline">{String(row.temperature)}</Badge>}
          {assignedToName && <Badge variant="outline">{assignedToName}</Badge>}
          {centerName && <Badge variant="outline">{centerName}</Badge>}
        </div>
      </div>

      <LeadTagsPanel
        leadId={id}
        currentTags={currentTags}
        availableTags={availableTags}
        canEdit={can(user, "lead.update")}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {can(user, "lead.update") ? (
            <LeadEditForm
              key={String(row.updated_at)}
              leadId={id}
              sections={sections}
              values={values}
              optionsByKey={optionsByKey}
              canRevealPhone={canRevealPhone}
            />
          ) : (
            <p className="text-sm text-muted-foreground">You don&apos;t have permission to edit this lead.</p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/*
            An existing admission shows to anyone who may read enrolments,
            not only to whoever could have created it: a counsellor asked
            why their conversion disappeared from the numbers needs to see
            that the student dropped, and they are not the person who
            records it.
          */}
          {enrolment
            ? canReadFees && (
                <div
                  className={
                    enrolment.dropped_at
                      ? "flex flex-col gap-1 rounded-lg border border-destructive/50 bg-destructive/5 p-4"
                      : "flex flex-col gap-1 rounded-lg border p-4"
                  }
                >
                  <h3 className="text-sm font-semibold">
                    {enrolment.dropped_at ? "Dropped out" : "Admission confirmed"}
                  </h3>
                  <p className="text-sm text-muted-foreground">{enrolment.course}</p>
                  <p className="text-sm">{formatINR(enrolment.net_fee_paise)}</p>
                  <p className="text-xs text-muted-foreground">
                    Confirmed {formatDateIST(enrolment.sales_to_accounts_at, "d MMM yyyy, h:mm a")}
                  </p>
                  {enrolment.dropped_at && (
                    <>
                      <p className="text-xs text-destructive">
                        Left {formatDateIST(enrolment.dropped_at, "d MMM yyyy")}
                      </p>
                      {enrolment.drop_reason && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Reason: </span>
                          {enrolment.drop_reason}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )
            : canCreateEnrolment && (
                <ConfirmAdmissionForm leadId={id} courses={courseOptions} modes={modeOptions} />
              )}
          {can(user, "interaction.create") && (
            <InteractionForm leadId={id} types={interactionTypes} outcomes={interactionOutcomes} />
          )}
          <TasksPanel leadId={id} tasks={taskRows ?? []} />
        </div>
      </div>

      {canReadWhatsApp && (
        <WhatsAppPanel
          leadId={id}
          toPhone={row.primary_phone}
          messages={whatsappMessages}
          canSend={can(user, "whatsapp.send")}
          withinWindow={withinWhatsAppWindow}
        />
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Student profile form</h2>
        <ProfileFormPanel
          leadId={id}
          token={row.profile_form_token}
          submittedAt={row.profile_form_submitted_at}
          answers={row.profile_form_data}
          fieldLabels={studentFieldLabels}
          canManage={can(user, "lead.update")}
        />
      </div>

      {canReadFees && feePlan && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Fees &amp; instalment agreement</h2>
          <FeePlanPanel
            leadId={id}
            values={feePlan.values}
            canEdit={can(user, "enrolment.update")}
            hasEnrolment={feePlan.hasEnrolment}
            hasSignedAgreement={hasSignedAgreement}
            printHref={`/leads/${id}/instalment-agreement`}
          />
        </div>
      )}

      {canReadFiles && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Files</h2>
          <AttachmentsPanel
            parentKind="lead"
            parentId={id}
            attachments={attachments}
            canUpload={can(user, "file.upload")}
            canDelete={can(user, "file.delete")}
            labelSuggestions={["Signed instalment agreement", "ID proof", "Marksheet", "Fee receipt"]}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Timeline</h2>
        {timeline.length === 0 && <p className="text-sm text-muted-foreground">Nothing logged yet.</p>}
        <ul className="flex flex-col gap-3">
          {timeline.map((entry) => (
            <li key={entry.id} className="flex gap-3 border-l-2 border-muted pl-3">
              <div>
                <p className="text-sm">{entry.label}</p>
                {entry.detail && <p className="text-sm text-muted-foreground">{entry.detail}</p>}
                <p className="text-xs text-muted-foreground">
                  {formatDateIST(entry.at, "d MMM yyyy, h:mm a")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

async function getTimeline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
): Promise<TimelineEntry[]> {
  const [stageHistoryRes, interactionsRes] = await Promise.all([
    supabase
      .from("stage_history")
      .select("id, changed_at, from_stage, to_stage")
      .eq("lead_id", leadId)
      .returns<Array<{ id: string; changed_at: string; from_stage: string | null; to_stage: string }>>(),
    supabase
      .from("interactions")
      .select("id, occurred_at, type, outcome, notes, next_action")
      .eq("lead_id", leadId)
      .is("deleted_at", null)
      .returns<
        Array<{
          id: string;
          occurred_at: string;
          type: string;
          outcome: string | null;
          notes: string | null;
          next_action: string;
        }>
      >(),
  ]);

  const stageIds = new Set<string>();
  for (const row of stageHistoryRes.data ?? []) {
    if (row.from_stage) stageIds.add(row.from_stage);
    stageIds.add(row.to_stage);
  }
  const stageNameById = new Map<string, string>();
  if (stageIds.size > 0) {
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, name")
      .in("id", Array.from(stageIds))
      .returns<Array<{ id: string; name: string }>>();
    for (const s of stages ?? []) stageNameById.set(s.id, s.name);
  }

  const entries: TimelineEntry[] = [
    ...(stageHistoryRes.data ?? []).map((row) => ({
      id: `stage-${row.id}`,
      at: row.changed_at,
      label: row.from_stage
        ? `Stage changed: ${stageNameById.get(row.from_stage) ?? "?"} → ${stageNameById.get(row.to_stage) ?? "?"}`
        : `Entered pipeline at ${stageNameById.get(row.to_stage) ?? "?"}`,
      detail: null,
    })),
    ...(interactionsRes.data ?? []).map((row) => ({
      id: `interaction-${row.id}`,
      at: row.occurred_at,
      label: `${row.type}${row.outcome ? ` — ${row.outcome}` : ""}`,
      detail: [row.notes, `Next: ${row.next_action}`].filter(Boolean).join(" · "),
    })),
  ];

  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
