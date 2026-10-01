import { SectionTabs, type SectionTab } from "@/components/layout/section-tabs";
import { createClient } from "@/lib/supabase/server";

/**
 * Two screens: the roster, and the queue of students who have just arrived.
 *
 * Gate 2 creates a `students` row the moment accounts take a first payment,
 * and until now that student simply appeared somewhere in a list of two
 * hundred, sorted by a join date that is almost always today — academics
 * was never told. So arrivals get a tab of their own with a red count on
 * it, and a student joins the roster when somebody accepts them.
 *
 * Rendered by the two list pages rather than by a `students/layout.tsx`,
 * deliberately. A layout would also wrap `students/[id]` — where neither
 * tab is the current page — and `students/[id]/print`, where a row of
 * navigation tabs would come out on the printed sheet.
 */
export async function StudentsTabs() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .is("onboarded_at", null);

  const tabs: SectionTab[] = [
    { href: "/students", label: "Students", exact: true },
    {
      href: "/students/onboarding",
      label: "Onboarding",
      badgeCount: count ?? 0,
      badgeWhat: "students waiting to be onboarded",
    },
  ];

  return <SectionTabs tabs={tabs} />;
}
