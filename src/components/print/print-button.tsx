"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Print, or save as PDF — which is the same button.
 *
 * Worth saying out loud on the page rather than assuming. The thing an
 * accountant wants is a file to send a family on WhatsApp, and the way to
 * get one is the browser's own print dialog with "Save as PDF" chosen as
 * the destination. Nobody who has not done it before guesses that from a
 * button marked Print, and the alternative — generating the PDF on the
 * server — is a rendering engine and a font stack to maintain for a file
 * the browser already makes correctly from the same stylesheet.
 */
export function PrintButton({
  /** Shown beside the button. Omit on documents where it would be noise. */
  hint,
}: {
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-3 print:hidden">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Button size="sm" onClick={() => window.print()}>
        <Printer /> Print or save as PDF
      </Button>
    </div>
  );
}
