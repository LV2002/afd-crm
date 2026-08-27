import { createStage } from "../actions";
import { StageForm } from "../stage-form";

export default function NewStagePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">New stage</h1>
      <StageForm
        values={{
          name: "",
          color: "#0ea5e9",
          stageType: "normal",
          probability: "",
          slaHours: "",
          requiresReason: false,
          requiredFields: "",
        }}
        action={createStage}
        submitLabel="Create stage"
      />
    </div>
  );
}
