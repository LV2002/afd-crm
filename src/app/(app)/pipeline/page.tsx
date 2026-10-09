import { redirect } from "next/navigation";

/**
 * The Pipeline board is gone; this is what its URL does now.
 *
 * Leon did not use it. A kanban answers "where is everybody in the
 * funnel", which is a manager's question asked occasionally, and the
 * counsellors' actual question — "who am I behind on this morning" — it
 * answered worst of all: the follow-up date was a line of small text on
 * a card in whichever column the lead happened to sit. `/follow-ups`
 * replaced it in the sidebar, and this redirect keeps every bookmark,
 * stale link and revalidate path working rather than turning them into
 * a 404 nobody can explain.
 *
 * Stages themselves have since gone too: a lead's status is its
 * temperature, changed from the bar at the top of the lead's own page.
 */
export default function PipelineRedirect() {
  redirect("/follow-ups");
}
