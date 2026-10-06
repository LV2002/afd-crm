"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

/**
 * What a form says after it ran. Used by 73 screens, which is why the
 * toast lives here rather than in each of them.
 *
 * **Success toasts, errors stay put.** A success message is often below
 * the fold on a long form — somebody presses Save at the bottom of the
 * fee agreement, the confirmation renders where they are not looking, and
 * the save reads as having done nothing. A toast is the acknowledgement.
 *
 * An error is the opposite: it belongs beside the field that caused it,
 * where the person has to go anyway to fix it. Throwing it into the
 * corner of the screen as well would be noise, and would train people to
 * dismiss the thing that matters.
 *
 * The inline message stays in both cases — it carries the `role` a screen
 * reader announces, and a toast that has already faded is not a record of
 * anything.
 */
export function FormMessage({ error, success }: { error?: string; success?: string }) {
  // Only when it *changes*: a form re-rendering for an unrelated reason
  // must not re-announce a save from two minutes ago.
  const announced = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (success && success !== announced.current) {
      toast.success(success);
    }
    announced.current = success;
  }, [success]);

  if (!error && !success) return null;

  return (
    <p
      role={error ? "alert" : "status"}
      className={cn("text-sm", error ? "text-destructive" : "text-emerald-600")}
    >
      {error ?? success}
    </p>
  );
}
