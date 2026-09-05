"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { deleteReminderRule, saveReminderRule, type ReminderRuleState } from "./actions";

const initialState: ReminderRuleState = {};

export interface RuleValues {
  id?: string;
  name: string;
  daysAfterDue: string;
  channel: "notification" | "whatsapp";
  templateName: string;
  templateLanguage: string;
  isActive: boolean;
}

/**
 * One rung. Each saves independently, so a mistake in the day-30 rung
 * cannot take the day-1 rung down with it.
 *
 * The template field appears only for a WhatsApp rung, because a template
 * name on a staff notification is a field that does nothing — and a
 * WhatsApp rung WITHOUT one is a rung that fails silently at 3am every
 * night, which is why both the action and a check constraint refuse it.
 */
export function RuleForm({ values }: { values: RuleValues }) {
  const [state, action, pending] = useActionState(saveReminderRule, initialState);
  const [removeState, removeAction] = useActionState(deleteReminderRule, initialState);
  const [channel, setChannel] = useState(values.channel);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <form action={action} className="flex flex-col gap-3">
        {values.id && <input type="hidden" name="ruleId" value={values.id} />}

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              name="name"
              required
              defaultValue={values.name}
              placeholder="First nudge"
              className="h-9 w-48"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Days after due</Label>
            <Input
              name="daysAfterDue"
              type="number"
              step="1"
              required
              defaultValue={values.daysAfterDue}
              className="h-9 w-28"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Send</Label>
            <Select
              name="channel"
              value={channel}
              onValueChange={(value) => setChannel(value as RuleValues["channel"])}
            >
              <SelectTrigger className="h-9 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="notification">A notification to staff</SelectItem>
                <SelectItem value="whatsapp">A WhatsApp to the student</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {channel === "whatsapp" && (
            <>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Approved template</Label>
                <Input
                  name="templateName"
                  defaultValue={values.templateName}
                  placeholder="fee_reminder"
                  className="h-9 w-44"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Language</Label>
                <Input
                  name="templateLanguage"
                  defaultValue={values.templateLanguage}
                  className="h-9 w-24"
                />
              </div>
            </>
          )}

          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              className="size-4"
              defaultChecked={values.isActive}
            />
            On
          </label>

          <Button type="submit" size="sm" disabled={pending} className="mb-0.5">
            {values.id ? <Save className="size-4" /> : <Plus className="size-4" />}
            {pending ? "Saving…" : values.id ? "Save" : "Add rung"}
          </Button>
        </div>

        <FormMessage error={state.error} success={state.success} />
      </form>

      {values.id && (
        <form action={removeAction}>
          <input type="hidden" name="ruleId" value={values.id} />
          <Button type="submit" variant="ghost" size="sm">
            <Trash2 className="size-4" /> Remove this rung
          </Button>
          <FormMessage error={removeState.error} success={removeState.success} />
        </form>
      )}
    </div>
  );
}
