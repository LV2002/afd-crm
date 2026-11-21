import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { applyAssignment } from "@/lib/assignment/apply-assignment";
import { db } from "@/lib/db/client";
import { leads, whatsappAutoReplies, whatsappChatRules, whatsappReplyAlerts } from "@/lib/db/schema";
import { notify } from "@/lib/notifications/notify";

import { isOpenNow } from "./auto-reply";
import { dueAlerts, type WaitingChat } from "./reply-alerts";

const LOOKBACK_DAYS = 3;

/**
 * Finds chats whose latest message is from the student and has gone
 * unanswered, tells the owner (and later the centre head), and — if the
 * admin switched it on — hands a chat on a lead nobody owns to the
 * assignment rules, the same path every other lead takes.
 */
export async function sweepReplyAlerts(now = new Date()): Promise<{ alerted: number; assigned: number }> {
  const [rules] = await db.select().from(whatsappChatRules).where(eq(whatsappChatRules.id, "default"));
  if (!rules || (!rules.alertEnabled && !rules.autoAssignUnowned)) return { alerted: 0, assigned: 0 };

  // Latest message per lead, kept only when it is inbound and not resolved since.
  const rows = await db.execute<{ lead_id: string; occurred_at: string }>(sql`
    select lead_id, occurred_at from (
      select distinct on (m.lead_id) m.lead_id, m.occurred_at, m.direction, l.primary_phone
      from whatsapp_messages m
      join leads l on l.id = m.lead_id and l.deleted_at is null
      where m.deleted_at is null and m.lead_id is not null
        and m.occurred_at > ${new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString()}
      order by m.lead_id, m.occurred_at desc
    ) latest
    where direction = 'inbound'
      and not exists (
        select 1 from whatsapp_conversations c
        where c.phone = latest.primary_phone and c.status = 'resolved' and c.resolved_at >= latest.occurred_at
      )
  `);
  const waiting = Array.from(rows).map((r) => ({ leadId: r.lead_id, inboundAt: new Date(r.occurred_at) }));
  if (waiting.length === 0) return { alerted: 0, assigned: 0 };

  let assigned = 0;
  if (rules.autoAssignUnowned) {
    const unowned = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(inArray(leads.id, waiting.map((w) => w.leadId)), isNull(leads.assignedTo)));
    for (const lead of unowned) {
      try {
        const result = await db.transaction((tx) => applyAssignment(tx, lead.id, { trigger: "update" }));
        if (result) assigned += 1;
      } catch {
        /* one lead's failure must not stop the rest */
      }
    }
  }

  let alerted = 0;
  if (rules.alertEnabled) {
    const [away] = await db.select().from(whatsappAutoReplies).where(eq(whatsappAutoReplies.kind, "away"));
    // Opening hours come from the away-message settings; without them, always open.
    const officeOpen = away ? isOpenNow(away, now) : true;

    const sent = await db
      .select({ leadId: whatsappReplyAlerts.leadId, inboundAt: whatsappReplyAlerts.inboundAt, level: whatsappReplyAlerts.level })
      .from(whatsappReplyAlerts)
      .where(inArray(whatsappReplyAlerts.leadId, waiting.map((w) => w.leadId)));
    const chats: WaitingChat[] = waiting.map((w) => ({
      ...w,
      sentLevels: sent.filter((s) => s.leadId === w.leadId && s.inboundAt.getTime() === w.inboundAt.getTime()).map((s) => s.level),
    }));

    for (const alert of dueAlerts(chats, rules, now, officeOpen)) {
      const [lead] = await db
        .select({ name: leads.studentName, number: leads.leadNumber, owner: leads.assignedTo, centerId: leads.centerId })
        .from(leads)
        .where(eq(leads.id, alert.leadId));
      if (!lead) continue;
      // Claim first: a second overlapping sweep loses the insert and sends nothing.
      const claimed = await db
        .insert(whatsappReplyAlerts)
        .values({ leadId: alert.leadId, inboundAt: alert.inboundAt, level: alert.level })
        .onConflictDoNothing()
        .returning({ id: whatsappReplyAlerts.id });
      if (claimed.length === 0) continue;
      const common = {
        context: { lead_name: lead.name, lead_number: lead.number ?? "", minutes_waiting: String(alert.minutesWaiting) },
        href: `/whatsapp/personal?thread=${encodeURIComponent(`lead:${alert.leadId}`)}`,
        entityType: "leads",
        entityId: alert.leadId,
        centerId: lead.centerId,
        ownerId: lead.owner,
      };
      if (alert.level === 1) await notify({ eventKey: "whatsapp.reply_overdue", ...common });
      else await notify({ eventKey: "whatsapp.reply_escalated", ...common });
      alerted += 1;
    }
  }
  return { alerted, assigned };
}
