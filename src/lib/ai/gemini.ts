/**
 * Google Gemini driver for the AI analyst.
 *
 * Chosen over Anthropic because Gemini has a genuinely free tier and this
 * feature must not generate per-query charges (Leon's explicit call). The
 * analyst's *tools* and *scoping* are untouched by that choice — they live
 * in `./tools` and are provider-agnostic. Only this file knows the wire
 * format, so moving providers again means rewriting this file alone.
 *
 * Raw REST rather than a client library: the request shape below is the
 * whole integration, an SDK would add a dependency for two fetch calls,
 * and pinning the endpoint version here makes a breaking change from
 * Google visible in one place.
 */

import { toGeminiSchema, type GeminiToolDeclaration } from "./gemini-schema";

export type { GeminiToolDeclaration };

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * An explicit model choice, if the operator made one. Left unset, the
 * model is discovered from the API instead — see `resolveModel()`.
 */
export const GEMINI_MODEL_OVERRIDE = process.env.GEMINI_MODEL?.trim() || null;

/**
 * Used only when the API can't be asked (the listing call itself failed).
 * Better than nothing, but the whole point of the discovery below is that
 * a hardcoded name here goes stale without anybody noticing until a user
 * gets a 404 — which is exactly what happened to `gemini-2.0-flash`.
 */
const FALLBACK_MODEL = "gemini-2.5-flash";

interface ListedModel {
  /** e.g. "models/gemini-2.5-flash" */
  name: string;
  supportedGenerationMethods?: string[];
}

/**
 * The models this API key can actually call `generateContent` on, newest
 * and most capable first.
 *
 * Model names on this API change faster than any code around them, and
 * Google retires them: a name that worked at the time of writing is a 404
 * some months later. Rather than guess, ask.
 */
export async function listUsableModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(`${API_BASE}?pageSize=200`, {
    headers: { "x-goog-api-key": apiKey },
    signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GeminiError(
      `Gemini returned ${response.status} listing models: ${body.slice(0, 300)}`,
      response.status,
    );
  }

  const payload = (await response.json()) as { models?: ListedModel[] };
  return (payload.models ?? [])
    .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
    .map((model) => model.name.replace(/^models\//, ""))
    .filter((name) => !UNUSABLE.test(name))
    .sort((a, b) => rank(b) - rank(a) || a.localeCompare(b));
}

/**
 * Models that answer `generateContent` but are wrong for an analyst that
 * has to call tools and return text: media generators, embedders, and the
 * audio/live variants.
 */
const UNUSABLE = /embedding|aqa|imagen|veo|tts|image-generation|audio|live|learnlm/i;

/**
 * Prefers a Flash model (the free tier's workhorse, and fast enough that
 * a counsellor waits a second rather than ten), the newest version, and a
 * stable release over a preview or experimental one.
 */
function rank(name: string): number {
  const [, major = "0", minor = "0"] = /(\d+)\.(\d+)/.exec(name) ?? [];
  let score = Number(major) * 100 + Number(minor) * 10;
  if (/flash/i.test(name)) score += 1000;
  if (/lite/i.test(name)) score -= 400;
  if (/preview|exp/i.test(name)) score -= 300;
  // A bare "gemini-2.5-flash" beats "gemini-2.5-flash-001": the unsuffixed
  // alias keeps pointing at the current build.
  if (/-\d{3}$/.test(name)) score -= 50;
  return score;
}

/**
 * Resolved once per process, because the answer changes on Google's
 * release schedule rather than per request, and the listing call is pure
 * overhead on every question after the first.
 */
let cachedModel: string | null = null;

export async function resolveModel(apiKey: string, signal?: AbortSignal): Promise<string> {
  if (GEMINI_MODEL_OVERRIDE) return GEMINI_MODEL_OVERRIDE;
  if (cachedModel) return cachedModel;

  try {
    const [best] = await listUsableModels(apiKey, signal);
    cachedModel = best ?? FALLBACK_MODEL;
  } catch {
    // A listing failure is not worth failing the question over: the
    // generate call is about to report the real problem (bad key, quota)
    // with Google's own wording.
    cachedModel = FALLBACK_MODEL;
  }
  return cachedModel;
}

/** Forgets the resolved model, so a 404 can be retried against a fresh listing. */
export function forgetResolvedModel(): void {
  cachedModel = null;
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/** One turn of the conversation, in Gemini's shape. */
export interface GeminiContent {
  role: "user" | "model";
  parts: Array<
    | { text: string }
    | { functionCall: GeminiFunctionCall }
    | { functionResponse: { name: string; response: Record<string, unknown> } }
  >;
}

export interface GeminiTurn {
  text: string;
  functionCalls: GeminiFunctionCall[];
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export async function generateWithTools(options: {
  apiKey: string;
  systemInstruction: string;
  contents: GeminiContent[];
  tools: GeminiToolDeclaration[];
  signal?: AbortSignal;
}): Promise<GeminiTurn> {
  const model = await resolveModel(options.apiKey, options.signal);
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header rather than a ?key= query parameter so the key cannot end
        // up in a proxy or server access log.
        "x-goog-api-key": options.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.systemInstruction }] },
        contents: options.contents,
        tools: [
          {
            functionDeclarations: options.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              parameters: toGeminiSchema(tool.parameters),
            })),
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
      signal: options.signal,
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // A 404 means the model name is gone. Drop the cached choice so the
    // next question re-resolves against a fresh listing rather than
    // repeating a name Google has retired.
    if (response.status === 404) forgetResolvedModel();
    // Otherwise surface Google's own message: on the free tier the two
    // failures that actually happen are a bad key and a quota exhaustion,
    // and both say so clearly enough to act on.
    throw new GeminiError(
      `Gemini returned ${response.status} for model "${model}": ${body.slice(0, 400)}`,
      response.status,
    );
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; functionCall?: GeminiFunctionCall }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (payload.promptFeedback?.blockReason) {
    throw new GeminiError(
      `Gemini declined the request (${payload.promptFeedback.blockReason}).`,
      400,
    );
  }

  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  return {
    text: parts
      .map((part) => part.text ?? "")
      .join("")
      .trim(),
    functionCalls: parts
      .map((part) => part.functionCall)
      .filter((call): call is GeminiFunctionCall => Boolean(call)),
  };
}
