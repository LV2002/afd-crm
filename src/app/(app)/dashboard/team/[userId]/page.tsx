import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OptionBadge } from "@/components/ui/option-badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getCounsellors } from "@/lib/dashboard/get-counsellors";
import { getDropdownOptions } from "@/lib/fields/resolve-field-options";
import { formatDateIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import { MyDayWidget } from "../../my-day-widget";
import { MyNumbersWidget } from "../../my-numbers-widget";

/**
 * One counsellor, as their manager sees them.
 *
 * Leon: *"these counsellor navigation should show a overview of the
 * counsellors performance, their tasks, their leads and its status,
 * etc. basically i should be able to monitor all my counsellors."*
 *
 * Four things, in the order a manager reads them: how the month and the
 * year are going, what is on their desk today, what they have been
 * asked to do, and the shape of the pipeline they are holding.
 *
 * ## Gated on report.center, not lead.read
 *
 * One person's numbers shown to another person is a reporting act —
 * the same reasoning the team table carries, and the same permission.
 * A counsellor holds `report.read` at `own` scope and so never reaches
 * this, which is correct: it is not a screen for looking sideways at a
 * colleague.
 *
 * ## Every card reuses the counsellor's own
 *
 * `MyNumbersWidget` and `MyDayWidget` both already take a user id and
 * both read through the RLS-bound client, so a head sees exactly what
 * the policies allow and nothing is re-implemented. A second copy of
 * the numbers card "for managers" would have drifted from the real one
 * by the second change, and then two people would be reading different
 * figures off screens that claim to say the same thing.
 */
export default async function CounsellorPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer || !can(viewer, "report.center")) return <AccessDenied />;

  const { userId } = await params;
  const supabase = await createClient();

  /*
    The person is looked up through the same list the sidebar is built
    from, rather than by a direct read.

    That means RLS decides who exists here: a centre head typing another
    centre's user id into the address bar gets the same "not found" as
    one typing nonsense, which is the honest answer and leaks nothing
    about who works where. It also means only counsellors have a page: a
    colleague who is not one is "not found" too, by design.
  */
  const counsellors = await getCounsellors(supabase, viewer.id);
  const member = counsellors.find((row) => row.userId === userId);
  if (!member) notFound();

  // The centres, for the subtitle only — the list above deliberately does
  // not carry them, because the sidebar no longer groups by centre.
  const { data: centreLinks } = await supabase
    .from("user_centers")
    .select("centers(name)")
    .eq("user_id", userId)
    .returns<Array<{ centers: { name: string } | null }>>();
  const centerNames = (centreLinks ?? [])
    .map((link) => link.centers?.name)
    .filter((name): name is string => Boolean(name));

  const [{ data: stageRows }, { data: leadRows }, { data: taskRows }, temperatureOptions] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, name, color, sort_order, stage_type")
        .eq("is_active", true)
        .order("sort_order")
        .returns<
          Array<{ id: string; name: string; color: string | null; sort_order: number; stage_type: string }>
        >(),
      supabase
        .from("leads")
        .select("id, stage_id, temperature")
        .eq("assigned_to", userId)
        .is("deleted_at", null)
        .returns<Array<{ id: string; stage_id: string | null; temperature: string | null }>>(),
      supabase
        .from("tasks")
        .select("id, title, due_at, type, lead_id")
        .eq("assigned_to", userId)
        .eq("status", "open")
        .is("deleted_at", null)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(25)
        .returns<
          Array<{ id: string; title: string; due_at: string | null; type: string | null; lead_id: string }>
        >(),
      getDropdownOptions(supabase, "temperature"),
    ]);

  const leads = leadRows ?? [];
  const stages = stageRows ?? [];
  const tasks = taskRows ?? [];

  const countByStage = new Map<string, number>();
  const countByTemperature = new Map<string, number>();
  for (const lead of leads) {
    if (lead.stage_id) countByStage.set(lead.stage_id, (countByStage.get(lead.stage_id) ?? 0) + 1);
    if (lead.temperature) {
      countByTemperature.set(lead.temperature, (countByTemperature.get(lead.temperature) ?? 0) + 1);
    }
  }
  const noStage = leads.filter((lead) => !lead.stage_id).length;

  const firstName = member.name.split(" ")[0];
  const possessive = firstName.endsWith("s") ? `${firstName}'` : `${firstName}'s`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{member.name}</h1>
          <p className="text-sm text-muted-foreground">
            {member.roleName ?? "No role"}
            {centerNames.length > 0 ? ` · ${centerNames.join(", ")}` : ""}
          </p>
        </div>
      </div>

      <MyNumbersWidget
        userId={userId}
        title={`${possessive} numbers`}
        description="This month so far, then the whole year to date."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <MyDayWidget userId={userId} canRevealPhone={can(viewer, "lead.reveal_phone")} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Open tasks</CardTitle>
              <CardDescription>
                {tasks.length === 0
                  ? "Nothing outstanding."
                  : `${tasks.length} waiting, soonest first.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  A task is anything booked against a {""}
                  {possessive} lead that is not a follow-up date.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {tasks.map((task) => (
                    <li key={task.id} className="flex items-start justify-between gap-3 text-sm">
                      <a href={`/leads/${task.lead_id}`} className="min-w-0 hover:underline">
                        <span className="block font-medium">{task.title}</span>
                        {task.type && (
                          <span className="block text-xs text-muted-foreground">{task.type}</span>
                        )}
                      </a>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {task.due_at ? formatDateIST(task.due_at, "d MMM") : "No date"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Their pipeline</CardTitle>
              <CardDescription>
                {leads.length} {leads.length === 1 ? "lead" : "leads"} assigned, by stage and
                temperature.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                {stages.map((stage) => (
                  <Row
                    key={stage.id}
                    label={stage.name}
                    color={stage.color}
                    count={countByStage.get(stage.id) ?? 0}
                    total={leads.length}
                  />
                ))}
                {noStage > 0 && (
                  <Row label="No stage yet" color={null} count={noStage} total={leads.length} />
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t pt-3">
                {temperatureOptions.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No temperatures configured.</span>
                ) : (
                  temperatureOptions.map((option) => (
                    <span key={option.value} className="flex items-center gap-1.5">
                      <OptionBadge option={option} />
                      <span className="text-sm tabular-nums">
                        {countByTemperature.get(option.value) ?? 0}
                      </span>
                    </span>
                  ))
                )}
                {leads.some((lead) => !lead.temperature) && (
                  <span className="flex items-center gap-1.5">
                    <Badge variant="outline">No temperature</Badge>
                    <span className="text-sm tabular-nums">
                      {leads.filter((lead) => !lead.temperature).length}
                    </span>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * One stage, with a bar.
 *
 * A bar rather than a number alone because the question a manager is
 * asking is about shape — "is everything stuck at Contacted" — and
 * fourteen numbers in a column do not answer that at a glance. Width is
 * a share of the whole pipeline, so the bars across two counsellors with
 * very different volumes are not comparable and are not meant to be;
 * the count beside each is.
 */
function Row({
  label,
  color,
  count,
  total,
}: {
  label: string;
  color: string | null;
  count: number;
  total: number;
}) {
  const share = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-40 shrink-0 truncate text-muted-foreground">{label}</span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{ width: `${share}%`, background: color ?? "var(--primary)" }}
        />
      </span>
      <span className="w-8 shrink-0 text-right tabular-nums">{count}</span>
    </div>
  );
}
