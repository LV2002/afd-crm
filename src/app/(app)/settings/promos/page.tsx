import { asc, eq, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { centers, promos } from "@/lib/db/schema";
import { activeDropdownValues } from "@/lib/config/dropdown-values";

import { PromoRow, type PromoValues } from "./promo-row";

export const dynamic = "force-dynamic";

/**
 * The offers the institute is running.
 *
 * The difference between one of these and a counsellor typing 10% into
 * the fee panel is authority: the institute decided on this offer in
 * advance, wrote down its cap and its expiry, and put it here — so
 * applying it does not queue for approval the way a negotiated discount
 * does. That is what the page has to make obvious, which is why it says
 * so at the top.
 */
export default async function PromosSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const [rows, centerRows, courses] = await Promise.all([
    db.select().from(promos).where(isNull(promos.deletedAt)).orderBy(asc(promos.name)),
    db
      .select({ id: centers.id, name: centers.name })
      .from(centers)
      .where(eq(centers.isActive, true))
      .orderBy(asc(centers.name)),
    activeDropdownValues("course"),
  ]);

  const blank: PromoValues = {
    name: "",
    code: "",
    discountType: "percentage",
    percentValue: "",
    fixedAmount: "",
    maxDiscount: "",
    validFrom: "",
    validUntil: "",
    courses: "",
    centerIds: "",
    maxUses: "",
    isActive: true,
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Offers</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Named discounts the institute is running — &ldquo;Early Bird 10% until 30 June&rdquo;,
          &ldquo;Sibling ₹5,000&rdquo;. Because you decided on these in advance, a counsellor
          applying one <strong>does not need approval</strong> for it, however large it is. That is
          the difference between an offer and a discount somebody negotiates in the room.
        </p>
      </div>

      {rows.map((row) => (
        <PromoRow
          key={row.id}
          courses={courses}
          centers={centerRows}
          values={{
            id: row.id,
            name: row.name,
            code: row.code ?? "",
            discountType: row.discountType === "fixed" ? "fixed" : "percentage",
            percentValue: row.percentValue ?? "",
            fixedAmount: row.fixedPaise ? String(row.fixedPaise / 100) : "",
            maxDiscount: row.maxDiscountPaise ? String(row.maxDiscountPaise / 100) : "",
            validFrom: row.validFrom ?? "",
            validUntil: row.validUntil ?? "",
            courses: (row.courses ?? []).join(","),
            centerIds: (row.centerIds ?? []).join(","),
            maxUses: row.maxUses === null ? "" : String(row.maxUses),
            isActive: row.isActive,
            usedCount: row.usedCount,
          }}
        />
      ))}

      <PromoRow values={blank} courses={courses} centers={centerRows} />
    </div>
  );
}
