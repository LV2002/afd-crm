import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { updateStage } from "../actions";
import { StageForm } from "../stage-form";

export default async function EditStagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id, name, color, stage_type, probability, sla_hours, requires_reason, required_fields")
    .eq("id", id)
    .maybeSingle();

  if (!stage) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{stage.name}</h1>
      <StageForm
        values={{
          name: stage.name,
          color: stage.color ?? "",
          stageType: stage.stage_type,
          probability: stage.probability ? String(Number(stage.probability)) : "",
          slaHours: stage.sla_hours ? String(stage.sla_hours) : "",
          requiresReason: stage.requires_reason,
          requiredFields: (stage.required_fields ?? []).join(", "),
        }}
        action={updateStage.bind(null, stage.id)}
        submitLabel="Save changes"
      />
    </div>
  );
}
