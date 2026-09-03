"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";

import { setRegistrationFormActive, type FormState } from "./actions";

const initialState: FormState = {};

export function FormRowActions({
  id,
  token,
  isActive,
}: {
  id: string;
  token: string;
  isActive: boolean;
}) {
  const [, action, pending] = useActionState(setRegistrationFormActive, initialState);
  const [copied, setCopied] = useState(false);

  /**
   * The absolute URL is built in the browser rather than rendered on the
   * server, because the server has no reliable idea what host the admin is
   * actually using — localhost in development, a preview deployment, or
   * the production domain. `window.location.origin` is always the one they
   * are looking at, which is the one they want to share.
   */
  async function copyLink() {
    const url = `${window.location.origin}/r/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure context, denied
      // permission). Falling back to a prompt still lets them copy it by
      // hand rather than leaving them with a button that does nothing.
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={copyLink}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={isActive ? "false" : "true"} />
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          {isActive ? "Close" : "Open"}
        </Button>
      </form>
    </div>
  );
}
