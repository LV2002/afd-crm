"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A submit button that asks first, for the things that cannot be undone.
 *
 * This application has several one-way doors — confirming an admission
 * ends sales work on that lead, recording a payment writes an
 * append-only ledger line, sending a broadcast spends money on four
 * hundred messages. Every one of them was a plain button sitting a
 * mis-click away from a form somebody was still filling in.
 *
 * The dialog is not there to nag. It is there for the specific case of a
 * person who meant to press Save and pressed the button next to it — so
 * it names *what will happen*, in the same words the screen used, rather
 * than asking "Are you sure?", which nobody reads.
 *
 * ## How it submits
 *
 * A real submit button is rendered, hidden, inside the surrounding form;
 * confirming clicks it. Radix moves the dialog itself to the end of the
 * document, so a submit button in there would no longer be inside the
 * form and would do nothing — this keeps the form's own submission,
 * including `useActionState` and the pending state, working untouched.
 */
export function ConfirmSubmit({
  label,
  title,
  body,
  confirmLabel,
  variant = "default",
  disabled,
  pending,
  pendingLabel,
  size = "default",
  icon,
}: {
  /** The button on the page. */
  label: string;
  /** The dialog heading — say what is about to happen, not "Are you sure?". */
  title: string;
  /** What it will do, and what cannot be undone about it. */
  body: React.ReactNode;
  /** The button that goes through with it. Repeat the verb: "Confirm admission". */
  confirmLabel: string;
  variant?: "default" | "destructive" | "success";
  disabled?: boolean;
  pending?: boolean;
  pendingLabel?: string;
  size?: "default" | "sm" | "lg";
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const submitRef = React.useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={submitRef} type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />

      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
      >
        {icon}
        {pending ? (pendingLabel ?? "Working…") : label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <div className="text-[0.9375rem] leading-relaxed">{body}</div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            {/* Cancel first and visually quieter: the safe choice should be
                the easy one to hit, including for a thumb. */}
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Go back
            </Button>
            <Button
              type="button"
              variant={variant}
              onClick={() => {
                setOpen(false);
                submitRef.current?.click();
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
