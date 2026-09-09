"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { targets } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export interface TargetFormState {
  error?: string;
  success?: string;
}

const MONTH = /^\d{4}-\d{2}$/;

const METRICS = ["leads", "admissions", "revenue"] as const;
type Metric = (typeof METRICS)[number];

/**
 * Reads one target box.
 *
 * Blank means "no target", which is a real answer and different from
 * zero: the forecast screen shows a dash for the first and would show a
 * permanent failure for the second. Rupees on screen, paise in the
 * database — the same single conversion point as everywhere else.
 */
function readValue(formData: FormData, metric: Metric): number | null | "invalid" {
  const raw = String(formData.get(metric) ?? "").trim();
  if (raw === "") return null;
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return "invalid";
  if (metric === "revenue") return Math.round(value * 100);
  if (!Number.isInteger(value)) return "invalid";
  return value;
}

/**
 * Saves one scope's targets for one month.
 *
 * Gated on `target.manage` rather than `settings.manage`: a centre head
 * sets their centre's numbers and their counsellors' without also holding
 * the keys to the pipeline, the roles and the integrations. The RLS
 * policies enforce the same split, so this check is the courteous error
 * message rather than the security boundary.
 */
export async function saveTargets(
  _prev: TargetFormState,
  formData: FormData,
): Promise<TargetFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "target.manage")) {
    return { error: "You don't have permission to set targets." };
  }

  const month = String(formData.get("month") ?? "").trim();
  if (!MONTH.test(month)) return { error: "Pick a month first." };
  const periodMonth = `${month}-01`;

  const kind = String(formData.get("kind") ?? "");
  const scopeId = String(formData.get("scopeId") ?? "").trim() || null;

  const centerId = kind === "center" ? scopeId : null;
  const ownerId = kind === "owner" ? scopeId : null;
  if (kind !== "org" && !scopeId) return { error: "Which centre or person?" };

  // The same scope rule the RLS policies apply, in code, so somebody
  // without org-wide reach gets a sentence rather than a database error.
  // Only holders of the permission at "all" set the institute's own
  // number; a centre head is limited to their own centres.
  const scope = scopeFor(user, "target.manage");
  if (kind === "org" && scope !== "all") {
    return { error: "Only an administrator sets the institute-wide target." };
  }
  if (kind === "center" && scope !== "all" && !user.centerIds.includes(centerId!)) {
    return { error: "That centre isn't one of yours." };
  }

  const saved: Record<string, number | null> = {};

  for (const metric of METRICS) {
    const value = readValue(formData, metric);
    if (value === "invalid") {
      return {
        error:
          metric === "revenue"
            ? "A revenue target has to be a positive amount in rupees."
            : `A ${metric} target has to be a whole number above zero.`,
      };
    }
    saved[metric] = value;

    if (value === null) {
      // Clearing a box removes the target rather than storing a zero,
      // which would read as "we aimed for nothing and achieved it".
      await db
        .update(targets)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(targets.periodMonth, periodMonth),
            eq(targets.metric, metric),
            centerId ? eq(targets.centerId, centerId) : isNull(targets.centerId),
            ownerId ? eq(targets.ownerId, ownerId) : isNull(targets.ownerId),
            isNull(targets.deletedAt),
          ),
        );
      continue;
    }

    // Update-then-insert rather than onConflictDoUpdate: the unique index
    // is a partial expression index over coalesced nullable columns, and
    // Postgres cannot infer a conflict target from one of those.
    const updated = await db
      .update(targets)
      .set({ targetValue: value, updatedAt: new Date() })
      .where(
        and(
          eq(targets.periodMonth, periodMonth),
          eq(targets.metric, metric),
          centerId ? eq(targets.centerId, centerId) : isNull(targets.centerId),
          ownerId ? eq(targets.ownerId, ownerId) : isNull(targets.ownerId),
          isNull(targets.deletedAt),
        ),
      )
      .returning({ id: targets.id });

    if (updated.length === 0) {
      await db.insert(targets).values({
        periodMonth,
        centerId,
        ownerId,
        metric,
        targetValue: value,
        createdBy: user.id,
      });
    }
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "target.set",
    entityType: "targets",
    entityId: `${periodMonth}:${kind}:${scopeId ?? "org"}`,
    after: { periodMonth, kind, scopeId, ...saved },
  });

  revalidatePath("/settings/targets");
  revalidatePath("/insights/forecast");
  return { success: "Saved." };
}
