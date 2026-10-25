import { redirect } from "next/navigation";

/**
 * Batches now live under their course. The old list is kept as a redirect so
 * bookmarks and the links inside older notifications still land somewhere.
 */
export default function BatchesPage() {
  redirect("/settings/courses");
}
