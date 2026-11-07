import { asc, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { onboardingItems } from "@/lib/db/schema";

import { AddItemForm, ItemRow } from "./item-row";

export const dynamic = "force-dynamic";

export default async function OnboardingSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const items = await db
    .select()
    .from(onboardingItems)
    .where(isNull(onboardingItems.deletedAt))
    .orderBy(asc(onboardingItems.sortOrder), asc(onboardingItems.createdAt));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Onboarding checklist</h1>
        <p className="text-sm text-muted-foreground">
          What has to be done for a new student before academics can mark their onboarding complete. Each student gets a tick box per item; they move
          to the Students list only when every item is ticked. Switching an item off removes it from the requirement for everyone still in onboarding.
        </p>
      </div>
      <ul className="divide-y rounded-lg border px-3">
        {items.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No items yet — onboarding can be completed straight away.</li>}
        {items.map((item, i) => (
          <ItemRow key={item.id} id={item.id} label={item.label} isActive={item.isActive} first={i === 0} last={i === items.length - 1} />
        ))}
      </ul>
      <AddItemForm />
    </div>
  );
}
