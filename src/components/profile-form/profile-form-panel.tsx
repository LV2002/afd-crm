"use client";

import Link from "next/link";
import { Check, Copy, Link2, Printer } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { createProfileFormLink, type ProfileFormState } from "@/lib/profile-form/actions";

const initialState: ProfileFormState = {};

export function ProfileFormPanel({
  leadId,
  token,
  submittedAt,
  answers,
  fieldLabels,
  canManage,
}: {
  leadId: string;
  token: string | null;
  submittedAt: string | null;
  answers: Record<string, unknown> | null;
  /** key -> label, so answers read as the questions they belong to. */
  fieldLabels: Record<string, string>;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(createProfileFormLink, initialState);
  const [copied, setCopied] = useState(false);

  /**
   * Built in the browser because the server has no reliable idea which host
   * the counsellor is on — localhost, a preview deployment, or production.
   * `window.location.origin` is always the one they're looking at.
   */
  async function copyLink() {
    const url = `${window.location.origin}/f/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link and send it to the student:", url);
    }
  }

  if (submittedAt && answers) {
    const entries = Object.entries(answers).filter(([, v]) => v !== null && v !== "");
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Submitted{" "}
            {new Date(submittedAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            })}
          </p>
          {/*
            The office keeps a paper copy in the student's file from the
            day the form comes back, months before the `students` record
            that /students/[id]/print needs exists. Same A4 sheet, same
            layout.
          */}
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/leads/${leadId}/profile-form/print`} target="_blank">
              <Printer className="size-4" />
              Print profile form
            </Link>
          </Button>
        </div>
        <dl className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{fieldLabels[key] ?? key}</dt>
              <dd className="text-sm font-medium">
                {Array.isArray(value) ? value.join(", ") : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      {token ? (
        <>
          <p className="text-sm">
            Send this link to the student. Their answers appear here once they submit it.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
              /f/{token.slice(0, 12)}…
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copyLink}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Not yet submitted.</p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Once this student has confirmed they&apos;re joining, create their profile form link and
            send it to them. Completing it is the first step of admission.
          </p>
          {canManage && (
            <form action={action}>
              <input type="hidden" name="leadId" value={leadId} />
              <Button type="submit" size="sm" disabled={pending}>
                <Link2 className="size-4" />
                {pending ? "Creating…" : "Create profile form link"}
              </Button>
            </form>
          )}
          {state.error && <FormMessage error={state.error} />}
        </>
      )}
    </div>
  );
}
