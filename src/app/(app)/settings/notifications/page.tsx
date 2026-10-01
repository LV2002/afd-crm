import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { emailConfigured } from "@/lib/email/send";
import { NOTIFICATION_EVENTS } from "@/lib/notifications/events";
import { createClient } from "@/lib/supabase/server";

import { EventCard } from "./event-card";

/**
 * Who hears about what.
 *
 * The rows are the fixed event catalogue in `lib/notifications/events.ts`,
 * not whatever happens to be in the table: an event with no settings row
 * yet (a fresh install, or one added in a later release) still appears,
 * showing the defaults it will use until saved. The alternative — listing
 * the table — would hide a working event because nobody had re-seeded.
 */

interface SettingRow {
  event_key: string;
  is_enabled: boolean;
  notify_roles: string[] | null;
  notify_owner: boolean;
  channels: string[] | null;
  title_template: string;
  body_template: string;
}

export default async function NotificationSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const [{ data: settings }, { data: roles }] = await Promise.all([
    supabase
      .from("notification_settings")
      .select("event_key, is_enabled, notify_roles, notify_owner, channels, title_template, body_template")
      .is("deleted_at", null)
      .returns<SettingRow[]>(),
    supabase
      .from("roles")
      .select("id, name")
      .order("name")
      .returns<Array<{ id: string; name: string }>>(),
  ]);

  const byKey = new Map((settings ?? []).map((row) => [row.event_key, row]));

  const categories = [...new Set(NOTIFICATION_EVENTS.map((e) => e.category))];

  // Read on the server, because the key is a server environment variable and
  // must never reach the browser. Only the yes/no crosses the boundary.
  const mailWorks = emailConfigured();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Which events notify which roles, and in what words. The events themselves are fixed —
          each one is a real thing the CRM does — but everything about the response is yours.
          Everybody sees their own on the bell in the top bar; tick <strong>Also send an
          email</strong> on an event to send it to their inbox as well.
        </p>
      </div>

      {/*
        Said once, at the top, rather than on all thirteen cards. Email is
        configured with two environment variables and nothing in the
        application can turn it on — so if it is off, ticking the box on an
        event would do nothing and it would take somebody a while to work
        out why.
      */}
      {!mailWorks && (
        <div className="rounded-lg border border-dashed p-4 text-sm">
          <p className="font-medium">Email is not set up yet.</p>
          <p className="mt-1 text-muted-foreground">
            Notifications are working — they appear on the bell. To send them to people&apos;s
            inboxes as well, your developer needs to set <code className="font-mono">RESEND_API_KEY</code>{" "}
            and <code className="font-mono">EMAIL_FROM</code> in the hosting environment. Until
            then the email tick below is remembered but has no effect.
          </p>
        </div>
      )}

      {categories.map((category) => (
        <section key={category} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {category}
          </h2>
          {NOTIFICATION_EVENTS.filter((event) => event.category === category).map((event) => {
            const saved = byKey.get(event.key);
            return (
              <EventCard
                key={event.key}
                event={{
                  key: event.key,
                  label: event.label,
                  description: event.description,
                  variables: [...event.variables],
                }}
                roles={roles ?? []}
                values={{
                  isEnabled: saved ? saved.is_enabled : true,
                  notifyRoleIds: saved?.notify_roles ?? [],
                  notifyOwner: saved ? saved.notify_owner : event.defaultNotifyOwner,
                  alsoEmail: (saved?.channels ?? ["in_app"]).includes("email"),
                  titleTemplate: saved?.title_template ?? event.defaultTitle,
                  bodyTemplate: saved?.body_template ?? event.defaultBody,
                }}
                emailConfigured={mailWorks}
                /* No row yet means nobody has touched this event's rule.
                   Saying so beats showing defaults that look like choices
                   somebody made. */
                usingDefaults={!saved}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
