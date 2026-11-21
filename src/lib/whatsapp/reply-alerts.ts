/**
 * Which unanswered chats to alert on, decided from plain data.
 *
 * Level 1 after `alertMinutes`, level 2 after `escalateMinutes`. Each level
 * goes out once per unanswered message (the caller records it). Nothing is
 * sent outside opening hours — a message left at midnight is alerted when
 * the office opens, not at 3am.
 */

export interface ChatRules {
  alertEnabled: boolean;
  alertMinutes: number;
  escalateMinutes: number;
  autoAssignUnowned: boolean;
}

export interface WaitingChat {
  leadId: string;
  inboundAt: Date;
  /** Levels already sent for this unanswered message. */
  sentLevels: number[];
}

export interface DueAlert {
  leadId: string;
  inboundAt: Date;
  level: 1 | 2;
  minutesWaiting: number;
}

export function dueAlerts(chats: WaitingChat[], rules: ChatRules, now: Date, officeOpen: boolean): DueAlert[] {
  if (!rules.alertEnabled || !officeOpen) return [];
  const due: DueAlert[] = [];
  for (const chat of chats) {
    const waiting = Math.floor((now.getTime() - chat.inboundAt.getTime()) / 60_000);
    // Only the highest level that is due and unsent: a chat found already two
    // hours late gets one escalation, not an alert and then an escalation.
    const level: 1 | 2 | null =
      waiting >= rules.escalateMinutes && !chat.sentLevels.includes(2)
        ? 2
        : waiting >= rules.alertMinutes && !chat.sentLevels.includes(1) && !chat.sentLevels.includes(2)
          ? 1
          : null;
    if (level) due.push({ leadId: chat.leadId, inboundAt: chat.inboundAt, level, minutesWaiting: waiting });
  }
  return due;
}
