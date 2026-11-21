"use client";

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
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [replies, setReplies] = useState(["", "", ""]);
  const [urlText, setUrlText] = useState("");
  const [callText, setCallText] = useState("");

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
        <Input id="template-header" name="header" placeholder="AFD India" value={header} onChange={(e) => setHeader(e.target.value)} />
        <Label htmlFor="template-header-file" className="text-xs font-normal text-muted-foreground">
          …or a picture, video or PDF header instead (this replaces the text above)
        </Label>
        <input id="template-header-file" name="headerFile" type="file" accept=".jpg,.jpeg,.png,.mp4,.pdf" className="text-sm" />
        <p className="text-xs text-muted-foreground">
          Meta reviews the file you pick as the sample. When you send the template you attach the real picture each time.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="template-body">Message</Label>
        <Textarea
          id="template-body"
          name="body"
          required
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
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
        <Input id="template-footer" name="footer" placeholder="AFD India, Kochi & Kannur" value={footer} onChange={(e) => setFooter(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Quick replies (optional)</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Input key={i} name={`quickReply${i}`} placeholder={`Button ${i}`} maxLength={25} value={replies[i - 1]} onChange={(e) => setReplies((r) => r.map((v, idx) => (idx === i - 1 ? e.target.value : v)))} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Tappable buttons, up to three. A tap arrives back as an ordinary inbound message with
          that exact text, so it lands on the lead&apos;s thread like any other reply.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Web-page and call buttons (optional)</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input name="urlText" placeholder="Button words, e.g. See fees" maxLength={25} value={urlText} onChange={(e) => setUrlText(e.target.value)} />
          <Input name="urlValue" placeholder="https://afdindia.com/fees" />
          <Input name="callText" placeholder="Button words, e.g. Call us" maxLength={20} value={callText} onChange={(e) => setCallText(e.target.value)} />
          <Input name="callPhone" placeholder="+919847012345" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Preview</Label>
        <PhonePreview header={header} body={body} footer={footer} buttons={[...replies, urlText, callText]} />
      </div>

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Submitting…" : "Submit for approval"}
      </Button>
    </form>
  );
}

/** How the message will look on a phone. Placeholders show as sample words so the shape is clear. */
function PhonePreview({ header, body, footer, buttons }: { header: string; body: string; footer: string; buttons: string[] }) {
  const sample = (text: string) => text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => ["Anjali", "₹25,000", "15 Dec", "NIFT"][Number(n) - 1] ?? `[${n}]`);
  const shown = buttons.map((b) => b.trim()).filter(Boolean);
  return (
    <div className="w-72 rounded-2xl bg-[#e5ddd5] p-3 dark:bg-zinc-800">
      <div className="rounded-lg bg-white p-2 text-sm text-zinc-900 shadow-sm">
        {header.trim() && <p className="font-semibold">{sample(header)}</p>}
        <p className="whitespace-pre-wrap">{body.trim() ? sample(body) : "Your message appears here."}</p>
        {footer.trim() && <p className="mt-1 text-xs text-zinc-500">{footer}</p>}
      </div>
      {shown.map((b, i) => (
        <div key={i} className="mt-1 rounded-lg bg-white p-2 text-center text-sm font-medium text-sky-600 shadow-sm">{b}</div>
      ))}
    </div>
  );
}
