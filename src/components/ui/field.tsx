"use client";

import { AlertCircle } from "lucide-react";
import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * One shape for every field in the application: label, control, then the
 * hint or the error underneath it.
 *
 * Forms here had each field assembled by hand, so the same question was
 * asked three different ways on three different screens — label above on
 * one, placeholder-only on another, help text in a tooltip on a third.
 * Inconsistency is a tax everybody pays and older users pay twice,
 * because every screen has to be learned separately.
 *
 * Two rules this enforces that matter on their own:
 *
 * **A placeholder is never the label.** Placeholder text vanishes the
 * moment somebody types, so a form filled in from a placeholder cannot be
 * checked afterwards — you are left looking at values with no idea what
 * they were meant to be.
 *
 * **Required is marked on the label, not left to a red border after
 * submitting.** Finding out what was compulsory only by failing is the
 * most avoidable frustration in any form.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  /** Shown under the control. Say what a good answer looks like, not what the field is. */
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const reactId = React.useId();
  const hintId = hint ? `${reactId}-hint` : undefined;
  const errorId = error ? `${reactId}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="text-destructive" aria-label="required">
            *
          </span>
        )}
      </Label>

      {children}

      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-sm text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/**
 * The live echo under an input: what the system will actually store,
 * shown while somebody is still looking at what they typed.
 *
 * This is the single cheapest way to stop a data-entry mistake. A phone
 * number with nine digits and a fee of ₹4,500 where ₹45,000 was meant
 * both look completely fine as raw text in a box — and both are obvious
 * the moment the system says back what it understood.
 */
export function Echo({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "text-sm tabular",
        tone === "good" && "text-success",
        tone === "bad" && "text-destructive",
        tone === "neutral" && "text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}
