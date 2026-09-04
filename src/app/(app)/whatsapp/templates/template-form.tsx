"use client";

import { useActionState } from "react";

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
import { Textarea } from "@/components/ui/textarea";

import { submitTemplate, type TemplateFormState } from "./actions";

const initialState: TemplateFormState = {};

const CATEGORIES = [
  {
    value: "UTILITY",
    label: "Utility",
    help: "About something already happening — a fee reminder, a demo confirmation, a receipt.",
  },
  {
    value: "MARKETING",
    label: "Marketing",
    help: "Promotions, offers, new batch announcements. Costs more, and people can opt out.",
  },
  {
    value: "AUTHENTICATION",
    label: "Authentication",
    help: "One-time passcodes only.",
  },
];

/**
 * Creating a template, submitted straight to Meta for approval.
 *
 * The fields are Meta's, not ours: name, language, category, an optional
 * header and footer, the body with `{{1}}` placeholders, and up to three
 * quick-reply buttons. Nothing is stored here — Meta owns both the
 * template and its approval state.
 */
export function TemplateForm() {
  const [state, formAction, pending] = useActionState(submitTemplate, initialState);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">New template</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            name="name"
            required
            placeholder="fee_reminder"
            pattern="[A-Za-z0-9 _]+"
          />
          <p className="text-xs text-muted-foreground">
            Lowercase, digits and underscores. Spaces become underscores.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="template-language">Language</Label>
          <Input id="template-language" name="language" defaultValue="en" placeholder="en" />
          <p className="text-xs text-muted-foreground">
            Meta&apos;s code — <code>en</code>, <code>en_US</code>, <code>ml</code>.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="template-category">Category</Label>
          <Select name="category" defaultValue="UTILITY">
            <SelectTrigger id="template-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Meta re-categorises anything it thinks is misfiled, and marketing costs more than
            utility.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="template-header">Header (optional)</Label>
        <Input id="template-header" name="header" placeholder="AFD India" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="template-body">Message</Label>
        <Textarea
          id="template-body"
          name="body"
          required
          rows={4}
          placeholder="Hi {{1}}, your next instalment of {{2}} is due on {{3}}. Reply here if you need to talk it through."
        />
        <p className="text-xs text-muted-foreground">
          Use <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code> … for the parts that change per
          student. Number them from 1 with no gaps, and don&apos;t end the message on one — Meta
          rejects both.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="template-footer">Footer (optional)</Label>
        <Input id="template-footer" name="footer" placeholder="AFD India, Kochi & Kannur" />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Quick replies (optional)</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Input key={i} name={`quickReply${i}`} placeholder={`Button ${i}`} maxLength={25} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Tappable buttons, up to three. A tap arrives back as an ordinary inbound message with
          that exact text, so it lands on the lead&apos;s thread like any other reply.
        </p>
      </div>

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Submitting…" : "Submit for approval"}
      </Button>
    </form>
  );
}
