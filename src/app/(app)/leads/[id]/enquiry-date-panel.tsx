"use client";

import { CalendarClock } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { setEnquiryDate, type FormState } from "./actions";

const initial: FormState = {};

/**
 * When did this lead really enquire?
 *
 * A lead entered the next morning is stamped with the morning. This lets
 * whoever can edit the lead put the true date and time on it, which is
 * what every list, report and "new this week" count reads. Closed by
 * default — it is a correction, not something done on every lead.
 *
 * `shown` and `inputValue` arrive already formatted in IST from the server,
 * so the box never shows the browser's or the server's own time zone.
 */
export function EnquiryDatePanel({
  leadId,
  shown,
  inputValue,
}: {
  leadId: string;
  shown: string;
  inputValue: string;
}) {
  const [state, action, pending] = useActionState(setEnquiryDate, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <CalendarClock className="size-4" />
        <span>Enquiry came in {shown}</span>
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setOpen(true)}>
          Change
        </Button>
        {state.success && <span className="text-green-700 dark:text-green-400">{state.success}</span>}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="enquiry-at">Date and time of the enquiry (IST)</Label>
        <Input id="enquiry-at" name="enquiryAt" type="datetime-local" required defaultValue={inputValue} />
        <p className="text-xs text-muted-foreground">
          For a lead entered late. Lists, reports and response-time targets use this date. Can&apos;t be in the future.
        </p>
      </div>
      {state.error && <FormMessage error={state.error} />}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save date"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
