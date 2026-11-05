import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { companyHolidays } from "@/lib/db/schema";
import { getCenterOptions } from "@/lib/hr/queries";
import { loadPolicy } from "@/lib/hr/service";
import { and, asc, isNull } from "drizzle-orm";

import { HolidayForm, PolicyForm, RemoveHolidayButton } from "../hr-forms";
import { dayText } from "../leave-ui";

export const dynamic = "force-dynamic";

export default async function PolicyPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.manage")) return <AccessDenied />;
  const [policy, centers, holidays] = await Promise.all([
    loadPolicy(db),
    getCenterOptions(),
    db.select().from(companyHolidays).where(and(isNull(companyHolidays.deletedAt))).orderBy(asc(companyHolidays.onDate)),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Leave policy</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Leave resets on 1 January with no carry over. In the year somebody joins, their leave is the annual figure for the
          months left, to the nearest half day.
        </p>
        <PolicyForm policy={policy} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Company holidays</h2>
        <p className="text-sm text-muted-foreground">Not counted as leave days, and shown on everybody&apos;s page.</p>
        <HolidayForm centers={centers} />
        <ul className="flex flex-col gap-1.5 text-sm">
          {holidays.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3">
              <span>
                {dayText(h.onDate)} — {h.name}
                {h.centerId ? ` (${centers.find((c) => c.id === h.centerId)?.name ?? "one centre"})` : ""}
              </span>
              <RemoveHolidayButton holidayId={h.id} />
            </li>
          ))}
          {holidays.length === 0 && <li className="text-muted-foreground">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
