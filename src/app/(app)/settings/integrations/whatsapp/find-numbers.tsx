"use client";

import { Search } from "lucide-react";
import { useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { askMetaAboutCounsellorNumbers, connectAccountMessages, findUnregisteredNumbers, registerFoundNumber, type FindNumbersState, type FoundNumber } from "./find-numbers-actions";
import type { CounsellorOption } from "./whatsapp-numbers";

function FoundRow({ number, counsellors, onDone }: { number: FoundNumber; counsellors: CounsellorOption[]; onDone: (state: FindNumbersState) => void }) {
  const [label, setLabel] = useState("");
  const [counsellorId, setCounsellorId] = useState("");
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">
        {number.displayPhoneNumber ?? "(number not shown)"}
        {number.verifiedName ? ` · ${number.verifiedName}` : ""}
        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">ID {number.id}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Athira's phone" className="h-9 w-56" aria-label="Label" />
        <select value={counsellorId} onChange={(e) => setCounsellorId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Whose phone">
          <option value="">Whose phone…</option>
          {counsellors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={pending || !label.trim() || !counsellorId}
          onClick={() => start(async () => onDone(await registerFoundNumber({ phoneNumberId: number.id, wabaId: number.wabaId, displayPhoneNumber: number.displayPhoneNumber, label, counsellorId })))}
        >
          {pending ? "Adding…" : "Add as a counsellor's number"}
        </Button>
      </div>
    </li>
  );
}

/**
 * Finds numbers already connected in Meta that the CRM does not know yet, and
 * registers one as a counsellor's Coexistence number. The way round Meta's
 * connection window when its last step (swapping a code for a token) fails.
 */
export function FindNumbers({ counsellors }: { counsellors: CounsellorOption[] }) {
  const [state, setState] = useState<FindNumbersState>({});
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState("");
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">Find a number already connected in Meta</p>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          If Meta&rsquo;s window finished but the number didn&rsquo;t appear above, this asks every WhatsApp account the saved token can see which numbers they have that the CRM doesn&rsquo;t
          know yet. It uses the saved access token, so Meta&rsquo;s connection window isn&rsquo;t needed.
        </p>
      </div>
      <Input
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        placeholder="Optional: WhatsApp account ID to look in (from WhatsApp Manager)"
        className="h-9 max-w-md"
        aria-label="WhatsApp account ID"
      />
      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => start(async () => setState(await findUnregisteredNumbers(accountId)))}>
        <Search className="size-4" /> {pending ? "Looking…" : "Look for numbers"}
      </Button>
      <p className="max-w-2xl text-sm text-muted-foreground">
        If a number is registered here but its messages never arrive, type its WhatsApp account ID above and press this. It switches on
        message delivery for that account and shows what Meta answered.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={pending || !accountId.trim()}
        onClick={() => start(async () => setState(await connectAccountMessages(accountId)))}
      >
        Connect messages from this account
      </Button>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Not sure what is wrong? This asks Meta, read-only, what state each counsellor number is really in: whether it is attached to the
        platform, whether it is in the Business app, and whether anything sends its messages somewhere other than here.
      </p>
      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => start(async () => setState(await askMetaAboutCounsellorNumbers(accountId)))}>
        Ask Meta about the counsellor numbers
      </Button>
      {state.facts && (
        <ul className="flex max-w-3xl flex-col gap-1.5 text-sm">
          {state.facts.map((f, i) => (
            <li
              key={i}
              className={
                f.verdict === "bad" ? "text-destructive" : f.verdict === "good" ? "text-green-700 dark:text-green-400" : "pt-1 font-medium"
              }
            >
              {f.verdict === "bad" ? "✗ " : f.verdict === "good" ? "✓ " : ""}
              {f.text}
            </li>
          ))}
        </ul>
      )}
      <FormMessage error={state.error} success={state.success} />
      {state.numbers && state.numbers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {state.numbers.map((n) => (
            <FoundRow key={n.id} number={n} counsellors={counsellors} onDone={(result) => setState(result.success ? { success: result.success } : { ...state, error: result.error })} />
          ))}
        </ul>
      )}
    </div>
  );
}
