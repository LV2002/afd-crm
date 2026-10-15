"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { removeDroppedAdmissions } from "@/lib/enrolment/remove-dropped-admissions";
import { createClient } from "@/lib/supabase/server";

export interface RemoveState {
  error?: string;
  success?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Administrators only, and org-wide: taking an admission out of every report
 * is not a decision for somebody who runs one centre. Both permissions are
 * checked because it deletes admissions AND (usually) the leads behind them.
 */
export async function removeSelectedAdmissions(
  _prev: RemoveState,
  formData: FormData,
): Promise<RemoveState> {
  const user = await getCurrentUser();
  if (
    !user ||
    scopeFor(user, "settings.manage") !== "all" ||
    !can(user, "lead.delete") ||
    scopeFor(user, "lead.delete") !== "all"
  ) {
    return { error: "Only an administrator can remove admissions." };
  }

  const enrolmentIds = formData.getAll("enrolmentId").map(String).filter((id) => UUID.test(id));
  if (enrolmentIds.length === 0) return { error: "Tick at least one admission." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Say why — for example “test admissions from the workflow trial”." };
  if (reason.length > 500) return { error: "Keep the reason under 500 characters." };

  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "remove") {
    return { error: "Type the word remove to confirm." };
  }

  const alsoDeleteLeads = formData.get("alsoDeleteLeads") === "on";

  const result = await db.transaction((tx) =>
    removeDroppedAdmissions(tx, { enrolmentIds, reason, removedBy: user.id, alsoDeleteLeads }),
  );

  const supabase = await createClient();
  for (const row of result.removed) {
    await writeAuditLog(supabase, {
      actorId: user.id,
      action: "enrolment.remove_dropped",
      entityType: "enrolments",
      entityId: row.enrolmentId,
      before: { course: row.course, leadId: row.leadId, studentId: row.studentId },
      after: {
        reason,
        leadDeleted: row.leadDeleted,
        paymentsLeftOnLedger: row.paymentCount,
        netPaymentPaise: row.netPaymentPaise,
      },
    });
  }

  for (const path of ["/settings/test-admissions", "/accounts", "/students", "/leads", "/dashboard", "/insights"]) {
    revalidatePath(path);
  }

  if (result.removed.length === 0) {
    return { error: result.skipped.map((row) => row.why).join(" ") || "Nothing was removed." };
  }

  const withMoney = result.removed.filter((row) => row.paymentCount > 0).length;
  return {
    success:
      `Removed ${result.removed.length} admission${result.removed.length === 1 ? "" : "s"}.` +
      (withMoney > 0
        ? ` ${withMoney} had payments, which stay on the finance ledger (it cannot be edited) — reverse them in Accounts if the money should come out too.`
        : "") +
      (result.skipped.length > 0 ? ` ${result.skipped.length} could not be removed.` : ""),
  };
}
