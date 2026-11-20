"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/layout/form-message";
import { Input } from "@/components/ui/input";
import { sendWhatsAppTemplate, type WhatsAppSendState } from "@/lib/whatsapp/send-actions";
import { renderTemplateBody, type SendableTemplate } from "@/lib/whatsapp/template-preview";

/**
 * Reopens a closed conversation with an approved template: choose it from a
 * list, fill in its blanks, see exactly what they will receive.
 */
export function TemplateSender({
  leadId,
  toPhone,
  leadFirstName,
  templates,
  allowed,
}: {
  leadId: string;
  toPhone: string;
  leadFirstName: string;
  templates: SendableTemplate[];
  /** Template sends belong to whoever runs campaigns (they are billed and count against the number's quality). */
  allowed: boolean;
}) {
  const [chosen, setChosen] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [state, setState] = useState<WhatsAppSendState>({});
  const [pending, start] = useTransition();
  const template = useMemo(() => templates.find((t) => `${t.name}|${t.language}` === chosen), [templates, chosen]);

  if (!allowed) {
    return (
      <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        The 24-hour window has closed, so WhatsApp won&apos;t take a free reply from here. Message them from the WhatsApp Business app on your phone, or ask
        whoever runs WhatsApp campaigns to send a template.
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md bg-muted/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!template) return;
        start(async () => {
          const result = await sendWhatsAppTemplate(leadId, toPhone, template.name, template.language, values.slice(0, template.variableCount));
          setState(result);
          if (!result.error) { setChosen(""); setValues([]); }
        });
      }}
    >
      <p className="text-xs text-muted-foreground">
        The 24-hour window has closed. Send an approved template to reopen the conversation; once they reply you can chat freely again.
      </p>
      {templates.length === 0 ? (
        <p className="text-sm">No approved templates yet. Create one under WhatsApp → Templates; Meta usually approves within minutes.</p>
      ) : (
        <select
          value={chosen}
          onChange={(e) => { setChosen(e.target.value); setValues([]); setState({}); }}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Template"
        >
          <option value="">Choose a template…</option>
          {templates.map((t) => (
            <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`} disabled={Boolean(t.headerKind && t.headerKind !== "TEXT")}>
              {t.name.replace(/_/g, " ")} ({t.category.toLowerCase()}){t.headerKind && t.headerKind !== "TEXT" ? " — needs a file, send from Broadcasts" : ""}
            </option>
          ))}
        </select>
      )}
      {template && (
        <>
          {template.variableCount > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: template.variableCount }, (_, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    value={values[i] ?? ""}
                    onChange={(e) => setValues((v) => { const next = [...v]; next[i] = e.target.value; return next; })}
                    placeholder={`Value for {{${i + 1}}}`}
                    aria-label={`Value ${i + 1}`}
                  />
                  {i === 0 && leadFirstName && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setValues((v) => { const next = [...v]; next[0] = leadFirstName; return next; })}>
                      Name
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="max-w-sm self-start rounded-lg bg-background p-3 text-sm shadow-sm">
            {template.header && <p className="font-semibold">{template.header}</p>}
            <p className="whitespace-pre-wrap">{renderTemplateBody(template.body, values)}</p>
            {template.footer && <p className="mt-1 text-xs text-muted-foreground">{template.footer}</p>}
            {template.buttons.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {template.buttons.map((b) => (
                  <span key={b} className="rounded border px-2 py-1 text-center text-xs font-medium text-primary">{b}</span>
                ))}
              </div>
            )}
          </div>
          <Button type="submit" disabled={pending || (template.variableCount > 0 && values.slice(0, template.variableCount).some((v) => !v?.trim()))} className="w-fit">
            {pending ? "Sending…" : "Send template"}
          </Button>
        </>
      )}
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
