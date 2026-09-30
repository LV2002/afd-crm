import { redirect } from "next/navigation";

/**
 * Handovers is a tab in Insights now.
 *
 * It was a sidebar entry of its own, which put a report one level above the
 * eight reports it belongs with — and Leon's own reading of it was right:
 * it is a performance report, not a workspace.
 *
 * The route stays as a redirect rather than being deleted, for the same
 * reason `/my-day` did: it is in bookmarks and in the staff handbook, and a
 * 404 is a worse outcome than one extra hop.
 */
export default function HandoversPage() {
  redirect("/insights/handovers");
}
