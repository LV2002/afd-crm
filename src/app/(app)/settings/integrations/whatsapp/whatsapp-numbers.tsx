"use client";

import { Plus, Power, Save, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  deleteWhatsAppNumber,
  saveWhatsAppNumber,
  setWhatsAppNumberActive,
  type NumberFormState,
} from "./numbers-actions";

const initialState: NumberFormState = {};

export interface WhatsAppNumberView {
  id: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  label: string;
  mode: "api" | "coexistence";
  counsellorId: string | null;
  counsellorName: string | null;
  createsLeads: boolean;
  isActive: boolean;
  historyCompletedAt: string | null;
  historyMessageCount: number;
}

export interface CounsellorOption {
  id: string;
  name: string;
}

/**
 * One number's settings.
 *
 * The two fields that matter are the mode and whether it creates leads,
 * and they are related: a counsellor's own phone on Coexistence should
 * almost always create leads, and the institute's broadcast number should
 * almost never. Picking Coexistence ticks the box, because the one is the
 * reason for the other — but it stays a box, because an institute that
 * wants a shared Coexistence inbox without auto-created leads is making a
 * reasonable choice and should not have to fight the form.
 */
function NumberForm({
  number,
  counsellors,
}: {
  number?: WhatsAppNumberView;
  counsellors: CounsellorOption[];
}) {
  const [state, action, pending] = useActionState(saveWhatsAppNumber, initialState);
  const [mode, setMode] = useState<"api" | "coexistence">(number?.mode ?? "api");
  const [createsLeads, setCreatesLeads] = useState(number?.createsLeads ?? false);

  function chooseMode(next: "api" | "coexistence") {
    setMode(next);
    setCreatesLeads(next === "coexistence");
  }

  const id = number?.id ?? "new";

  return (
    <form action={action} className="flex flex-col gap-3">
      {number && <input type="hidden" name="id" value={number.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`label-${id}`}>Label</Label>
          <Input
            id={`label-${id}`}
            name="label"
            required
            defaultValue={number?.label ?? ""}
            placeholder="Athira's phone"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`pnid-${id}`}>Phone number ID</Label>
          <Input
            id={`pnid-${id}`}
            name="phoneNumberId"
            required
            defaultValue={number?.phoneNumberId ?? ""}
            className="font-mono text-sm"
            placeholder="1234567890123456"
          />
          <p className="text-xs text-muted-foreground">
            From Meta → WhatsApp → API Setup. Not the phone number itself — this is the id every
            webhook names.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`display-${id}`}>Number (optional)</Label>
          <Input
            id={`display-${id}`}
            name="displayPhoneNumber"
            defaultValue={number?.displayPhoneNumber ?? ""}
            placeholder="+91 98470 00001"
          />
          <p className="text-xs text-muted-foreground">
            Shown on screen, and used to tell which way a Coexistence message went.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`counsellor-${id}`}>Whose phone</Label>
          <select
            id={`counsellor-${id}`}
            name="counsellorId"
            defaultValue={number?.counsellorId ?? ""}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">Nobody — a shared number</option>
            {counsellors.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">What this number is</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            value="api"
            checked={mode === "api"}
            onChange={() => chooseMode("api")}
            className="mt-1"
          />
          <span>
            API only — the institute&apos;s own number
            <span className="block text-xs text-muted-foreground">
              Sends campaigns and receives the replies. Not in use by the WhatsApp Business app
              on anybody&apos;s phone.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            value="coexistence"
            checked={mode === "coexistence"}
            onChange={() => chooseMode("coexistence")}
            className="mt-1"
          />
          <span>
            Coexistence — a phone and the API, same number
            <span className="block text-xs text-muted-foreground">
              The counsellor keeps their phone and their chats; everything mirrors into the CRM.
              Needs an owner above.
            </span>
          </span>
        </label>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          name="createsLeads"
          checked={createsLeads}
          onCheckedChange={(next) => setCreatesLeads(next === true)}
        />
        <span>
          A message from somebody new creates a lead
          <span className="block text-xs text-muted-foreground">
            Right for a counsellor&apos;s own number: a stranger asking about coaching is a real
            enquiry. Wrong for the broadcast number, where a reply is somebody who pressed a
            button on a campaign.
          </span>
        </span>
      </label>

      <FormMessage error={state.error} success={state.success} />

      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {number ? <Save className="size-4" /> : <Plus className="size-4" />}
        {pending ? "Saving…" : number ? "Save changes" : "Register this number"}
      </Button>
    </form>
  );
}

export function WhatsAppNumbers({
  numbers,
  counsellors,
}: {
  numbers: WhatsAppNumberView[];
  counsellors: CounsellorOption[];
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {numbers.map((number) => (
        <div key={number.id} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{number.label}</h3>
                <Badge variant={number.mode === "coexistence" ? "default" : "outline"}>
                  {number.mode === "coexistence" ? "Coexistence" : "API only"}
                </Badge>
                {!number.isActive && <Badge variant="secondary">Off</Badge>}
                {number.createsLeads && <Badge variant="outline">Creates leads</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {number.displayPhoneNumber ?? number.phoneNumberId}
                {number.counsellorName ? ` · ${number.counsellorName}` : " · shared"}
              </p>
              {number.mode === "coexistence" && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {number.historyCompletedAt
                    ? `History synced — ${number.historyMessageCount} past messages attached to leads.`
                    : number.historyMessageCount > 0
                      ? `History still arriving — ${number.historyMessageCount} so far.`
                      : "No history has arrived yet. It comes in the minutes after onboarding, if it was consented to."}
                </p>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOpen(open === number.id ? null : number.id)}
            >
              {open === number.id ? "Close" : "Edit"}
            </Button>
          </div>

          {open === number.id && (
            <>
              <div className="border-t pt-3">
                <NumberForm number={number} counsellors={counsellors} />
              </div>
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <form
                  action={async () => void (await setWhatsAppNumberActive(number.id, !number.isActive))}
                >
                  <Button type="submit" size="sm" variant="outline">
                    <Power className="size-4" />
                    {number.isActive ? "Switch off" : "Switch on"}
                  </Button>
                </form>
                <form action={async () => void (await deleteWhatsAppNumber(number.id))}>
                  <ConfirmSubmit
                    label="Unregister"
                    icon={<Trash2 className="size-4" />}
                    size="sm"
                    variant="destructive"
                    title={`Unregister ${number.label}?`}
                    body="The CRM stops processing its messages. Everything it already brought in stays on the leads it belongs to — a conversation does not stop having happened because a settings screen was tidied."
                    confirmLabel="Unregister it"
                  />
                </form>
              </div>
            </>
          )}
        </div>
      ))}

      <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
        <h3 className="font-medium">
          {numbers.length === 0 ? "Register your first number" : "Register another number"}
        </h3>
        <NumberForm counsellors={counsellors} />
      </div>
    </div>
  );
}
