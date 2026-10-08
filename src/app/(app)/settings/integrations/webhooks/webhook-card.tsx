"use client";

import { Check, Copy, Eye, EyeOff, Power, RefreshCw, Save, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RESPONSE_CASES,
  SUCCESS_RESPONSE,
  samplePayload,
} from "@/lib/integrations/custom-webhook/setup-guide";

import {
  deleteCustomWebhook,
  rotateCustomWebhookCredentials,
  saveCustomWebhook,
  setCustomWebhookActive,
  type WebhookFormState,
} from "./actions";

const initialState: WebhookFormState = {};

export interface CustomWebhookView {
  id: string;
  name: string;
  slug: string;
  source: string;
  subSource: string | null;
  centerId: string | null;
  signingSecret: string;
  authToken: string | null;
  requireSignature: boolean;
  aliasText: string;
  isActive: boolean;
  deliveries: number;
  lastDeliveryAt: string | null;
  lastError: string | null;
}

/** One line of a credential, with a copy button that works. */
function CopyRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some app views refuse clipboard access outright. Showing the
      // value and selecting it is the fallback that always works.
      setShown(true);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-muted px-3 py-2 font-mono text-xs">
          {shown ? value : "•".repeat(48)}
        </code>
        {secret && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShown(!shown)}>
            {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            <span className="sr-only">{shown ? "Hide" : "Show"}</span>
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          <span className="sr-only">Copy {label}</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * The same copy affordance for something several lines long.
 *
 * `CopyRow` keeps its value on one line with a horizontal scroll, which
 * is right for a URL or a key and wrong for a JSON body — the thing a
 * sender's setup screen wants pasted whole, and the thing somebody needs
 * to read to see which fields are on offer.
 */
function CopyBlock({ label, value, note }: { label: string; value: string; note?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Nothing to reveal — the value is already on screen in full.
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          <span className="sr-only">Copy {label}</span>
        </Button>
      </div>
      <pre className="overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
        {value}
      </pre>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function WebhookCard({
  webhook,
  centers,
  aliasFields,
}: {
  webhook: CustomWebhookView;
  centers: Array<{ id: string; name: string }>;
  aliasFields: string[];
}) {
  const [state, action, pending] = useActionState(saveCustomWebhook, initialState);
  const [open, setOpen] = useState(false);
  const [requireSignature, setRequireSignature] = useState(webhook.requireSignature);
  const [requireAuthToken, setRequireAuthToken] = useState(webhook.authToken !== null);

  // Built in the browser: the server has no reliable idea whether this
  // admin is on production, a preview deployment or localhost, and the
  // URL they need is the host they are looking at.
  const url =
    typeof window === "undefined"
      ? `/api/webhooks/custom/${webhook.slug}`
      : `${window.location.origin}/api/webhooks/custom/${webhook.slug}`;

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{webhook.name}</h3>
            {webhook.isActive ? (
              <Badge variant="outline">Live</Badge>
            ) : (
              <Badge variant="secondary">Off</Badge>
            )}
            {/*
              "Unsigned" is about whether anything authenticates the
              sender, not about HMAC specifically. An endpoint with an
              authentication key is not the open door this badge warns
              about, so it says the weaker thing instead of the alarming
              one.
            */}
            {!webhook.requireSignature &&
              (webhook.authToken ? (
                <Badge variant="secondary">Key only</Badge>
              ) : (
                <Badge variant="destructive">Unsigned</Badge>
              ))}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Leads arrive as <strong>{webhook.source}</strong>
            {webhook.subSource ? ` · ${webhook.subSource}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {webhook.deliveries === 0
              ? "Nothing has been posted here yet."
              : `${webhook.deliveries} deliver${webhook.deliveries === 1 ? "y" : "ies"}, last ${webhook.lastDeliveryAt}.`}
            {webhook.lastError && (
              <span className="text-destructive"> Last error: {webhook.lastError}</span>
            )}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Set up"}
        </Button>
      </div>

      <CopyRow label="POST this URL" value={url} />

      {open && (
        <>
          <CopyRow label="Signing secret" value={webhook.signingSecret} secret />

          {webhook.authToken && (
            <CopyRow label="Authentication key" value={webhook.authToken} secret />
          )}

          <CopyBlock
            label="Sample payload"
            value={samplePayload()}
            note={
              <>
                Only <code className="font-mono">name</code> and{" "}
                <code className="font-mono">phone</code> are required. Field names do not have to
                match these — <code className="font-mono">Full Name</code> and{" "}
                <code className="font-mono">student_name</code> are understood too, and anything not
                recognised is still kept on the enquiry.
              </>
            }
          />

          <CopyBlock
            label="Expected response"
            value={SUCCESS_RESPONSE}
            note="Sent with HTTP 200 once the lead is recorded. The other replies are listed below."
          />

          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">What the sender has to do</p>
            <p className="mt-1">
              POST that JSON to the URL above. A name and a phone number are the only required
              fields, and opening the URL in a browser confirms it is live.
            </p>
            <p className="mt-1.5">
              {webhook.requireSignature ? (
                <>
                  Sign the exact request body with the signing secret (HMAC SHA-256) and send it as{" "}
                  <code className="font-mono">X-AFD-Signature: sha256=&lt;hex&gt;</code>.
                </>
              ) : webhook.authToken ? (
                <>No signature needed — the authentication key below takes its place.</>
              ) : (
                <>
                  No signature needed. The random token in the URL is the only credential, so treat
                  that URL as a password.
                </>
              )}
            </p>
            {webhook.authToken && (
              <p className="mt-1.5">
                Send the authentication key as{" "}
                <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>, or as{" "}
                <code className="font-mono">X-AFD-Key: &lt;key&gt;</code> if the sender will not let
                you set the Authorization header. Either is accepted.
              </p>
            )}

            <p className="mt-3 font-medium text-foreground">Every reply it can get</p>
            <ul className="mt-1 flex flex-col gap-1">
              {RESPONSE_CASES.map((reply) => (
                <li key={`${reply.status}-${reply.body}`}>
                  <code className="font-mono">{reply.status}</code>{" "}
                  <code className="font-mono">{reply.body}</code> — {reply.meaning}
                </li>
              ))}
            </ul>
          </div>

          <form action={action} className="flex flex-col gap-3 border-t pt-4">
            <input type="hidden" name="id" value={webhook.id} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`name-${webhook.id}`}>Name</Label>
                <Input id={`name-${webhook.id}`} name="name" defaultValue={webhook.name} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`source-${webhook.id}`}>Source name</Label>
                <Input
                  id={`source-${webhook.id}`}
                  name="source"
                  defaultValue={webhook.source}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  What the reports group these leads under. Added to the Lead source dropdown
                  automatically.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`sub-${webhook.id}`}>Sub-source (optional)</Label>
                <Input
                  id={`sub-${webhook.id}`}
                  name="subSource"
                  defaultValue={webhook.subSource ?? ""}
                  placeholder="Foundation course page"
                />
                <p className="text-xs text-muted-foreground">
                  Used when the sender does not name the form itself.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`center-${webhook.id}`}>Centre (optional)</Label>
                <select
                  id={`center-${webhook.id}`}
                  name="centerId"
                  defaultValue={webhook.centerId ?? ""}
                  className="h-9 rounded-md border bg-transparent px-3 text-sm"
                >
                  <option value="">Let the assignment rules decide</option>
                  {centers.map((centre) => (
                    <option key={centre.id} value={centre.id}>
                      {centre.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`aliases-${webhook.id}`}>Extra field names (optional)</Label>
              <Textarea
                id={`aliases-${webhook.id}`}
                name="fieldAliases"
                rows={3}
                defaultValue={webhook.aliasText}
                placeholder={"phone: mob, contact_no\nname: buyer"}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                One per line, for a sender that names a field something unusual. Fields you can map:{" "}
                {aliasFields.join(", ")}.
              </p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                name="requireSignature"
                checked={requireSignature}
                onCheckedChange={(next) => setRequireSignature(next === true)}
              />
              <span>
                Require a signature
                <span className="block text-xs text-muted-foreground">
                  Leave this on wherever the sender supports it. Turning it off means anyone who
                  ever sees the URL can post leads into your CRM — only do it for a service that
                  cannot sign requests at all.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                name="requireAuthToken"
                checked={requireAuthToken}
                onCheckedChange={(next) => setRequireAuthToken(next === true)}
              />
              <span>
                Require an authentication key
                <span className="block text-xs text-muted-foreground">
                  {webhook.authToken
                    ? "A key exists for this endpoint. Saving does not change it — unticking this deletes it, and anything still sending it starts getting 401s."
                    : "For a sender that cannot sign requests but can set one header. A key is generated when you save, and from then on a request without it is refused."}
                  {!requireSignature && !requireAuthToken && (
                    <strong className="mt-1 block text-destructive">
                      With both of these off, the URL is the only thing protecting this endpoint.
                    </strong>
                  )}
                </span>
              </span>
            </label>

            <FormMessage error={state.error} success={state.success} />

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending} size="sm">
                <Save className="size-4" />
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <form action={async () => void (await setCustomWebhookActive(webhook.id, !webhook.isActive))}>
              <Button type="submit" size="sm" variant="outline">
                <Power className="size-4" />
                {webhook.isActive ? "Switch off" : "Switch on"}
              </Button>
            </form>

            <form action={async () => void (await rotateCustomWebhookCredentials(webhook.id))}>
              <ConfirmSubmit
                label="New URL & secret"
                icon={<RefreshCw className="size-4" />}
                size="sm"
                variant="destructive"
                title="Replace this endpoint's URL and secret?"
                body="The current URL stops working immediately and the sender will get a 404 until it is updated with the new one. Have the sender's settings open before you confirm."
                confirmLabel="Replace them"
              />
            </form>

            <form action={async () => void (await deleteCustomWebhook(webhook.id))}>
              <ConfirmSubmit
                label="Delete"
                icon={<Trash2 className="size-4" />}
                size="sm"
                variant="destructive"
                title={`Delete ${webhook.name}?`}
                body="The endpoint stops accepting anything. Leads it already created stay exactly as they are, and so does the record of what it delivered — so you can still answer where those leads came from."
                confirmLabel="Delete it"
              />
            </form>
          </div>
        </>
      )}
    </div>
  );
}
