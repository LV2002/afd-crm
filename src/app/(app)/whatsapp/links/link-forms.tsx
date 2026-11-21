"use client";

import { Copy } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createLink, deleteLink, type LinkState } from "./actions";

export function NewLinkForm() {
  const [state, action, pending] = useActionState(createLink, {} as LinkState);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <Input name="name" placeholder="Name, e.g. Fee page" className="h-9 w-48" aria-label="Name" />
      <Input name="url" placeholder="https://afdindia.com/fees" className="h-9 w-80" aria-label="Where it goes" />
      <Button type="submit" size="sm" disabled={pending}>Create link</Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function LinkActions({ id, shortUrl }: { id: string; shortUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => navigator.clipboard.writeText(shortUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      >
        <Copy className="size-4" /> {copied ? "Copied" : "Copy"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => start(() => void deleteLink(id))}>Remove</Button>
    </div>
  );
}
