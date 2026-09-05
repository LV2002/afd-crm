import { asc, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { paymentReminderRules } from "@/lib/db/schema";
import { describeTiming } from "@/lib/finance/reminder-schedule";

import { RuleForm } from "./rule-form";

/**
 * The ladder for chasing an unpaid instalment.
 *
 * Collections has shown who is late since the finance module shipped; this
 * is what decides who gets contacted about it and when. Rows rather than
 * constants because the timing and the wording are exactly the sort of
 * thing an institute changes without wanting a deploy.
 */
export const dynamic = "force-dynamic";

export default async function PaymentRemindersPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const rules = await db
    .select()
    .from(paymentReminderRules)
    .where(isNull(paymentReminderRules.deletedAt))
    .orderBy(asc(paymentReminderRules.daysAfterDue));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Payment Reminders</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          What happens when a fee instalment goes unpaid. The sweep runs nightly; each rung fires{" "}
          <strong>once per instalment</strong>, and only the latest one due goes out on any night —
          so switching a ladder on does not send four messages to somebody who is months late.
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No reminders configured, so nothing is chased automatically. Add a rung below.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <div key={rule.id} className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                Fires when an instalment is {describeTiming(rule.daysAfterDue)}
                {rule.isActive ? "" : " — currently off"}
              </p>
              <RuleForm
                values={{
                  id: rule.id,
                  name: rule.name,
                  daysAfterDue: String(rule.daysAfterDue),
                  channel: rule.channel === "whatsapp" ? "whatsapp" : "notification",
                  templateName: rule.templateName ?? "",
                  templateLanguage: rule.templateLanguage,
                  isActive: rule.isActive,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Add a rung</h2>
        <RuleForm
          values={{
            name: "",
            daysAfterDue: "1",
            channel: "notification",
            templateName: "",
            templateLanguage: "en_US",
            isActive: true,
          }}
        />
      </div>

      <p className="max-w-2xl text-xs text-muted-foreground">
        A negative number reminds <em>before</em> the due date, which is the cheapest collection
        there is. A WhatsApp rung needs a template already approved in Settings → WhatsApp; a
        student who has replied STOP, or a lead marked do-not-contact, is skipped and the reason
        recorded. Dropped students are never chased.
      </p>
    </div>
  );
}
