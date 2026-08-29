import { createTag } from "../actions";
import { TagForm } from "../tag-form";

export default function NewTagPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">New tag</h1>
      <TagForm values={{ name: "", color: "#0ea5e9" }} action={createTag} submitLabel="Create tag" />
    </div>
  );
}
