import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  centers,
  notificationSettings,
  notifications,
  profiles,
  rolePermissions,
  userCenters,
} from "@/lib/db/schema";

import { notificationEvent, type NotificationEventKey } from "./events";
import { renderTemplate, type TemplateContext } from "./render";
import { resolveRecipients, type RecipientCandidate } from "./recipients";

/**
 * Tells the right people that something happened.
 *
 * Runs on the direct database connection, not the caller's RLS-bound
 * client, for the same reason `applyAssignment()` and `writeAuditLog()` do:
 * a notification is written FOR somebody else, so the writer necessarily
 * has no read access to the row it creates. `notifications` has no INSERT
 * policy at all (migration 0037), which makes that the only way in and
 * means a browser session cannot manufacture a message for a colleague.
 *
 * Never throws. A notification is a courtesy attached to some other piece
 * of work — an admission being confirmed, a payment being recorded — and
 * failing that work because the courtesy failed would be the wrong trade
 * every time. Failures are logged and swallowed; the caller gets a count.
 */
export async function notify(input: {
  eventKey: NotificationEventKey;
  /** Values for the event's template variables. */
  context: TemplateContext;
  /** Relative path the notification links to, e.g. `/leads/<id>`. */
  href?: string;
  entityType?: string;
  entityId?: string;
  centerId?: string | null;
  /** The subject lead's owner, for the "notify the owner" switch. */
  ownerId?: string | null;
  /** Whoever did the thing. Never told about their own action. */
  actorId?: string | null;
  /**
   * Replaces the event's configured roles for this one call.
   *
   * Exists for the SLA escalation ladder, where the rung itself names who
   * to wake ("at 48 hours, tell the centre head"). That is more specific
   * than a blanket per-event setting, so when a rung names roles they win;
   * a rung that names none falls back to the event's configuration, which
   * is what makes the ladder useful without forcing an admin to fill in
   * role ids by hand on every rung.
   */
  overrideRoles?: string[] | null;
  /** Same, for the "notify the owner" switch. */
  overrideNotifyOwner?: boolean;
}): Promise<number> {
  try {
    const [setting] = await db
      .select()
      .from(notificationSettings)
      .where(
        and(
          eq(notificationSettings.eventKey, input.eventKey),
          isNull(notificationSettings.deletedAt),
        ),
      );

    // No row means the seed hasn't run for this event yet. Fall back to the
    // definition's defaults rather than going silent: a newly added event
    // should work on deploy, not after somebody remembers to re-seed.
    const definition = notificationEvent(input.eventKey);
    const enabled = setting ? setting.isEnabled : true;
    if (!enabled) return 0;

    const rules = {
      notifyRoles:
        input.overrideRoles && input.overrideRoles.length > 0
          ? input.overrideRoles
          : (setting?.notifyRoles ?? []),
      notifyOwner:
        input.overrideNotifyOwner ??
        (setting ? setting.notifyOwner : definition.defaultNotifyOwner),
    };

    // Nothing to do and nobody to look up. Worth checking before the
    // candidate query, which is the expensive part.
    if (rules.notifyRoles.length === 0 && !(rules.notifyOwner && input.ownerId)) {
      return 0;
    }

    const candidates =
      rules.notifyRoles.length > 0 ? await loadCandidates(rules.notifyRoles) : [];

    const recipientIds = resolveRecipients({
      rules,
      candidates,
      ownerId: input.ownerId,
      actorId: input.actorId,
      centerId: input.centerId,
    });
    if (recipientIds.length === 0) return 0;

    // `center_name` is a variable nearly every event's copy can use, and
    // nearly every caller has the id but not the name. Filled in here so
    // six call sites don't each carry the same join — and only when the
    // caller hasn't supplied it, so an event with a better name for the
    // place keeps it.
    const context = { ...input.context };
    if (context.center_name === undefined && input.centerId) {
      const [center] = await db
        .select({ name: centers.name })
        .from(centers)
        .where(eq(centers.id, input.centerId));
      context.center_name = center?.name ?? null;
    }

    const title = renderTemplate(setting?.titleTemplate ?? definition.defaultTitle, context);
    const body = renderTemplate(setting?.bodyTemplate ?? definition.defaultBody, context);

    await db.insert(notifications).values(
      recipientIds.map((recipientId) => ({
        recipientId,
        eventKey: input.eventKey,
        title,
        body,
        href: input.href ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        centerId: input.centerId ?? null,
        context: context as Record<string, unknown>,
      })),
    );

    return recipientIds.length;
  } catch (error) {
    console.error(`notify(${input.eventKey}) failed`, error);
    return 0;
  }
}

/**
 * Active people in the chosen roles, with what they can see.
 *
 * `seesAllCenters` is read from the role's own `lead.read` scope rather
 * than assumed from the role's name: roles are database rows an admin can
 * create and rename, so "admin" is not a thing this code may test for
 * (CLAUDE.md § Roles).
 */
async function loadCandidates(roleIds: string[]): Promise<RecipientCandidate[]> {
  const [people, centerLinks, orgWideRoles] = await Promise.all([
    db
      .select({ userId: profiles.id, roleId: profiles.roleId })
      .from(profiles)
      .where(and(inArray(profiles.roleId, roleIds), eq(profiles.isActive, true))),
    db.select({ userId: userCenters.userId, centerId: userCenters.centerId }).from(userCenters),
    db
      .select({ roleId: rolePermissions.roleId })
      .from(rolePermissions)
      .where(
        and(
          inArray(rolePermissions.roleId, roleIds),
          eq(rolePermissions.permissionCode, "lead.read"),
          eq(rolePermissions.scope, "all"),
        ),
      ),
  ]);

  const centersByUser = new Map<string, string[]>();
  for (const link of centerLinks) {
    const list = centersByUser.get(link.userId) ?? [];
    list.push(link.centerId);
    centersByUser.set(link.userId, list);
  }
  const orgWide = new Set(orgWideRoles.map((r) => r.roleId));

  return people.map((person) => ({
    userId: person.userId,
    roleId: person.roleId,
    centerIds: centersByUser.get(person.userId) ?? [],
    seesAllCenters: orgWide.has(person.roleId),
  }));
}
