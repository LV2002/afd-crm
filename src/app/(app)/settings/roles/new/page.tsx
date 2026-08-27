import { NewRoleForm } from "../new-role-form";

export default function NewRolePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">New role</h1>
      <NewRoleForm />
    </div>
  );
}
