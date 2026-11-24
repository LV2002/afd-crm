import type { GraphFact } from "@/lib/integrations/whatsapp/client";

/**
 * What Meta says about one phone number, in plain words, with a verdict on
 * each line: fine, a problem, or just information.
 *
 * Written for the case where a counsellor's number is registered and works
 * in the Business app but nothing reaches the CRM. Those causes live on
 * Meta's side and are invisible from the CRM unless it asks: the number not
 * being connected to the platform, or Meta sending that number's messages to
 * a different address than the app's own (a per-number or per-account
 * override).
 */

export interface FactLine {
  verdict: "good" | "bad" | "info";
  text: string;
}

const val = (facts: Record<string, GraphFact>, key: string): unknown => {
  const f = facts[key];
  return f && f.ok ? f.value : undefined;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** True when a callback address points at this CRM's webhook. */
export function pointsAtThisApp(uri: string | null | undefined, expectedCallback: string | null): boolean {
  if (!uri || !expectedCallback) return false;
  try {
    return new URL(uri).host === new URL(expectedCallback).host;
  } catch {
    return false;
  }
}

/** Looks for a callback address anywhere inside a `webhook_configuration` answer. */
export function callbackUrisIn(configuration: unknown): string[] {
  if (!configuration || typeof configuration !== "object") return [];
  const found: string[] = [];
  for (const value of Object.values(configuration as Record<string, unknown>)) {
    if (typeof value === "string" && /^https?:\/\//.test(value)) found.push(value);
    else found.push(...callbackUrisIn(value));
  }
  return found;
}

export function describeNumberFacts(
  label: string,
  facts: Record<string, GraphFact>,
  expectedCallback: string | null,
): FactLine[] {
  const lines: FactLine[] = [];
  const unsupported = Object.entries(facts).filter(([, f]) => !f.ok);

  const status = str(val(facts, "status"));
  if (status) {
    lines.push({
      verdict: status.toUpperCase() === "CONNECTED" ? "good" : "bad",
      text: `${label}: Meta's status for the number is ${status}.${status.toUpperCase() === "CONNECTED" ? "" : " Messages are not delivered until it is CONNECTED."}`,
    });
  }

  const platform = str(val(facts, "platform_type"));
  if (platform) {
    lines.push({
      verdict: platform.toUpperCase() === "CLOUD_API" ? "good" : "bad",
      text: `Platform: ${platform}. ${platform.toUpperCase() === "CLOUD_API" ? "It is attached to the Cloud API." : "It is NOT attached to the Cloud API, so Meta has nothing to send the CRM."}`,
    });
  }

  const onApp = val(facts, "is_on_biz_app");
  if (typeof onApp === "boolean") {
    lines.push({
      verdict: onApp ? "good" : "bad",
      text: onApp
        ? "Meta knows this number is also in the WhatsApp Business app (Coexistence)."
        : "Meta does not see this number in the WhatsApp Business app. It is an ordinary API number, not Coexistence.",
    });
  }

  const configuration = val(facts, "webhook_configuration");
  const uris = callbackUrisIn(configuration);
  if (uris.length > 0) {
    const elsewhere = uris.filter((u) => !pointsAtThisApp(u, expectedCallback));
    lines.push(
      elsewhere.length > 0
        ? { verdict: "bad", text: `Meta is sending this number's messages to ${elsewhere.join(", ")} instead of to the CRM. That override has to be removed in Meta.` }
        : { verdict: "good", text: "This number has its own webhook address, and it is the CRM's." },
    );
  } else {
    lines.push({ verdict: "good", text: "No separate webhook address is set for this number, so Meta uses the app's own." });
  }

  const quality = str(val(facts, "quality_rating"));
  const codeStatus = str(val(facts, "code_verification_status"));
  const mode = str(val(facts, "account_mode"));
  const info = [quality && `quality ${quality}`, codeStatus && `verification ${codeStatus}`, mode && `mode ${mode}`].filter(Boolean);
  if (info.length) lines.push({ verdict: "info", text: `Also: ${info.join(", ")}.` });

  if (unsupported.length > 0) {
    lines.push({ verdict: "info", text: `Meta would not answer for: ${unsupported.map(([k, f]) => `${k} (${(f as { error: string }).error})`).join("; ")}.` });
  }
  return lines;
}
