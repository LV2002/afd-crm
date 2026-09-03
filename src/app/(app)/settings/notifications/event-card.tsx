"use client";

import { useActionState, useState } from "react";

import { RoleCheckboxes } from "@/app/(app)/settings/fields/role-checkboxes";
import { FormMessage } from "@/components/layout/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { unknownVariables } from "@/lib/notifications/render";

import { saveNotificationSetting, type NotificationSettingState } from "./actions";

const initialState: NotificationSettingState = {};

export interface EventCardProps {
  event: { key: string; label: string; description: string; variables: string[] };
  roles: Array<{ id: string; name: string }>;
  values: {
    isEnabled: boolean;
    notifyRoleIds: string[];
    notifyOwner: boolean;
    titleTemplate: string;
    bodyTemplate: string;
  };
  usingDefaults: boolean;
}

export function EventCard({ event, roles, values, usingDefaults }: EventCardProps) {
  const [state, action, pending] = useActionState(saveNotificationSetting, initialState);
  const [title, setTitle] = useState(values.titleTemplate);
  const [body, setBody] = useState(values.bodyTemplate);

  /**
   * A variable the event doesn't supply renders as an em dash in front of
   * staff. Shown here as they type, because the alternative is finding out
   * from a counsellor asking why their notification says "—".
   */
  const unknown = [
    ...new Set([
      ...unknownVariables(title, event.variables),
      ...unknownVariables(body, event.variables),
    ]),
  ];

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border p-4">
      <input type="hidden" name="eventKey" value={event.key} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{event.label}</p>
            {usingDefaults && <Badge variant="outline">Using defaults</Badge>}
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">{event.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${event.key}-enabled`}
            name="isEnabled"
            defaultChecked={values.isEnabled}
          />
          <Label htmlFor={`${event.key}-enabled`} className="font-normal">
            Notify on this
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Notify these roles</Label>
        <RoleCheckboxes
          name="notifyRoles"
          roles={roles}
          defaultCheckedIds={values.notifyRoleIds}
        />
        <div className="mt-1 flex items-center gap-2">
          <Checkbox
            id={`${event.key}-owner`}
            name="notifyOwner"
            defaultChecked={values.notifyOwner}
          />
          <Label htmlFor={`${event.key}-owner`} className="font-normal">
            Also notify whoever owns the lead
          </Label>
        </div>
        {/* Worth stating: it is the reason a Kannur centre head never
            hears about a Kochi lead. */}
        <p className="text-xs text-muted-foreground">
          People only receive notifications about centres they work in.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${event.key}-title`}>Title</Label>
          <Input
            id={`${event.key}-title`}
            name="titleTemplate"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${event.key}-body`}>Message</Label>
          <Textarea
            id={`${event.key}-body`}
            name="bodyTemplate"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Available:</span>
        {event.variables.map((variable) => (
          <code key={variable} className="rounded bg-muted px-1.5 py-0.5 font-mono">
            {`{{${variable}}}`}
          </code>
        ))}
      </div>

      {unknown.length > 0 && (
        <p className="text-xs text-destructive">
          {unknown.map((v) => `{{${v}}}`).join(", ")} {unknown.length === 1 ? "isn't" : "aren't"}{" "}
          supplied by this event and will print as “—”.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}
