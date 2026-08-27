import { CenterForm } from "../center-form";
import { createCenter } from "../actions";

export default function NewCenterPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">New centre</h1>
      <CenterForm
        values={{ name: "", city: "", address: "", timezone: "Asia/Kolkata" }}
        action={createCenter}
        submitLabel="Create centre"
      />
    </div>
  );
}
