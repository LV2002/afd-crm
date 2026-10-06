"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isTrustedSignupOrigin,
  parseSignupMessage,
  signupLoginOptions,
  type SignupFinished,
} from "@/lib/integrations/whatsapp/embedded-signup";

import {
  completeEmbeddedSignup,
  type EmbeddedSignupState,
} from "./embedded-signup-actions";
import type { CounsellorOption } from "./whatsapp-numbers";

/**
 * Connecting a counsellor's own WhatsApp number, without leaving the CRM.
 *
 * This is the step the setup documentation used to describe and nobody
 * could perform. Embedded Signup is not a page in Meta's dashboard — it
 * is a dialog that an application opens, so until there was a button here
 * there was no way to do it at all.
 *
 * ## Two answers, arriving separately
 *
 * The popup reports its result twice over, by two different routes, and
 * both halves are needed:
 *
 * - a `postMessage` to this window carrying the WhatsApp Business Account
 *   id and the phone number id;
 * - an authorisation `code`, handed to the `FB.login` callback.
 *
 * They do not arrive in a guaranteed order, so both are stashed and the
 * server action fires when the second one lands. Hence the refs: a
 * message listener registered once must not read a stale `useState`
 * closure.
 *
 * ## Why the origin is checked against a list
 *
 * Meta's own sample does `event.origin.endsWith("facebook.com")`, which
 * accepts `https://notfacebook.com`. The payload decides which WhatsApp
 * account this institute connects itself to, so the check is an exact
 * allowlist in `embedded-signup.ts`, with tests.
 */

interface FacebookSdk {
  init(options: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }): void;
  login(
    callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void,
    options: Record<string, unknown>,
  ): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const GRAPH_VERSION = "v21.0";
const initialState: EmbeddedSignupState = {};

export function EmbeddedSignupButton({
  appId,
  configId,
  counsellors,
}: {
  appId: string | null;
  configId: string | null;
  counsellors: CounsellorOption[];
}) {
  const [state, setState] = useState<EmbeddedSignupState>(initialState);
  const [isPending, startTransition] = useTransition();
  const [sdkReady, setSdkReady] = useState(false);
  const [label, setLabel] = useState("");
  const [counsellorId, setCounsellorId] = useState("");

  // Refs, not state: the `message` listener is registered once and would
  // otherwise read the values as they were on that render for ever.
  const finishedRef = useRef<SignupFinished | null>(null);
  const codeRef = useRef<string | null>(null);
  const detailsRef = useRef({ label: "", counsellorId: "" });
  detailsRef.current = { label, counsellorId };

  const submitIfReady = useCallback(() => {
    const finished = finishedRef.current;
    const code = codeRef.current;
    if (!finished || !code) return;

    if (!finished.phoneNumberId) {
      setState({
        error:
          "Meta connected the WhatsApp Business Account but did not add a phone number to it. Run this again and complete the number step.",
      });
      return;
    }

    // Single-use: clear before firing so a second message cannot replay it.
    finishedRef.current = null;
    codeRef.current = null;

    const { label: currentLabel, counsellorId: currentCounsellor } = detailsRef.current;
    startTransition(async () => {
      const result = await completeEmbeddedSignup({
        code,
        wabaId: finished.wabaId,
        phoneNumberId: finished.phoneNumberId as string,
        label: currentLabel,
        counsellorId: currentCounsellor,
      });
      setState(result);
      if (result.success) {
        setLabel("");
        setCounsellorId("");
      }
    });
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isTrustedSignupOrigin(event.origin)) return;

      const message = parseSignupMessage(event.data);
      if (!message) return;

      if (message.status === "cancelled") {
        setState({
          cancelled: message.step
            ? `Connection cancelled at the ${message.step.toLowerCase().replace(/_/g, " ")} step. Nothing was changed.`
            : "Connection cancelled. Nothing was changed.",
        });
        return;
      }
      if (message.status === "failed") {
        setState({ error: message.message });
        return;
      }

      finishedRef.current = message;
      submitIfReady();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [submitIfReady]);

  function launch() {
    if (!window.FB || !configId) return;
    setState(initialState);
    finishedRef.current = null;
    codeRef.current = null;

    window.FB.login((response) => {
      const code = response?.authResponse?.code;
      if (!code) {
        // No code and no message either way means they closed the window.
        // Said softly: it is not a failure, and the popup blocker is the
        // other common reason, which is worth naming.
        setState((previous) =>
          previous.error || previous.cancelled || previous.success
            ? previous
            : { cancelled: "The connection window closed before it finished. If it never appeared, allow popups for this site." },
        );
        return;
      }
      codeRef.current = code;
      submitIfReady();
    }, signupLoginOptions(configId));
  }

  if (!appId || !configId) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Connect a counsellor&apos;s number</p>
        <p className="mt-1">
          Save the <strong>App ID</strong> and the <strong>Embedded Signup Configuration ID</strong>{" "}
          in Credentials above, and this becomes a button. The Configuration ID is created in the
          Meta App Dashboard under <strong>WhatsApp → Configuration → Embedded Signup</strong>;
          neither value is secret.
        </p>
      </div>
    );
  }

  const ready = sdkReady && label.trim().length > 0 && counsellorId.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="lazyOnload"
        onLoad={() => {
          window.FB?.init({ appId, cookie: true, xfbml: false, version: GRAPH_VERSION });
          setSdkReady(Boolean(window.FB));
        }}
      />

      <div>
        <p className="font-medium">Connect a counsellor&apos;s number</p>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Opens Meta&apos;s connection window on the <strong>WhatsApp Business app</strong> path,
          so the counsellor keeps their number and their chats. They scan a QR code from their
          phone and are asked to allow history to sync — <strong>they must say yes</strong>, and
          it cannot be asked for again afterwards.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signupLabel">Label</Label>
          <Input
            id="signupLabel"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Simi's phone"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signupCounsellor">Whose phone</Label>
          <select
            id="signupCounsellor"
            value={counsellorId}
            onChange={(event) => setCounsellorId(event.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Choose a counsellor…</option>
            {counsellors.map((counsellor) => (
              <option key={counsellor.id} value={counsellor.id}>
                {counsellor.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Messages sent from the phone are attributed to them, and leads from it are assigned
            to them.
          </p>
        </div>
      </div>

      {state.cancelled && <p className="text-sm text-muted-foreground">{state.cancelled}</p>}
      <FormMessage error={state.error} success={state.success} />

      <Button type="button" onClick={launch} disabled={!ready || isPending} className="w-fit">
        {isPending ? "Finishing…" : sdkReady ? "Connect with Meta" : "Loading Meta…"}
      </Button>
    </div>
  );
}
