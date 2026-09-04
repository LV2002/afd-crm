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
let cachedModels: string[] | null = null;

/** How many models one question may fall through before giving up. */
const MAX_CANDIDATES = 4;

/** Statuses where the model, not the request, is the problem — so another model is worth trying. */
function isModelUnavailable(status: number): boolean {
  // 503 UNAVAILABLE is the free tier's daily reality: the newest flash
  // model is the one everybody is hammering, and it sheds load while an
  // older one answers instantly. 429 is the per-model quota, which is
  // also per-model — so both are reasons to step down, not to fail.
  return status === 429 || status === 500 || status === 502 || status === 503;
}

/**
 * The models to try, best first.
 *
 * Returning a list rather than one name is the whole fix for "the analyst
 * has been down for two days": picking the single best model makes the
 * feature exactly as available as that one model, and Google's newest
 * flash model is the least available thing on the free tier precisely
 * because it is the newest. The one below it is usually idle.
 */
export async function resolveModelCandidates(
  apiKey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  // An operator who names a model means that model. Respect it; the retry
  // in generateWithTools still gives a busy one a second chance.
  if (GEMINI_MODEL_OVERRIDE) return [GEMINI_MODEL_OVERRIDE];
  if (cachedModels) return cachedModels;

  try {
    const usable = await listUsableModels(apiKey, signal);
    cachedModels = usable.length > 0 ? usable.slice(0, MAX_CANDIDATES) : [FALLBACK_MODEL];
  } catch {
    // A listing failure is not worth failing the question over: the
    // generate call is about to report the real problem (bad key, quota)
    // with Google's own wording.
    cachedModels = [FALLBACK_MODEL];
  }
  return cachedModels;
}

export async function resolveModel(apiKey: string, signal?: AbortSignal): Promise<string> {
  const [best] = await resolveModelCandidates(apiKey, signal);
  return best ?? FALLBACK_MODEL;
}

/**
 * Remembers the model that actually answered, so the rest of this
 * process's questions — including the remaining round trips of the tool
 * loop this one is in — go straight to it instead of knocking on the
 * overloaded door every time.
 */
function preferModel(model: string): void {
  if (!cachedModels) return;
  cachedModels = [model, ...cachedModels.filter((name) => name !== model)];
}

/** Forgets the resolved models, so a 404 can be retried against a fresh listing. */
export function forgetResolvedModel(): void {
  cachedModels = null;
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * One part of one turn.
 *
 * Deliberately an open shape rather than a union of the three parts this
 * code constructs, because a model's own parts have to be handed BACK
 * verbatim and they carry fields this code never writes. `thoughtSignature`
 * is the one that bites: on a thinking model (Gemini 3.x) every
 * `functionCall` comes with one, and returning the call without it is
 * rejected —
 *
 *   Function call is missing a thought_signature in functionCall parts.
 *
 * — because the signature is how the model resumes its own reasoning
 * across the tool round trip. Reconstructing a turn from just the name and
 * args loses it.
 */
export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: { name: string; response: Record<string, unknown> };
}

/** One turn of the conversation, in Gemini's shape. */
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiTurn {
  text: string;
  functionCalls: GeminiFunctionCall[];
  /**
   * The model's parts exactly as they arrived. Push these back onto
   * `contents` rather than rebuilding the turn — see GeminiPart above.
   */
  parts: GeminiPart[];
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
  const candidates = await resolveModelCandidates(options.apiKey, options.signal);
  let lastError: GeminiError | null = null;

  for (const model of candidates) {
    try {
      const turn = await callModel(model, options);
      preferModel(model);
      return turn;
    } catch (error) {
      if (!(error instanceof GeminiError) || !isModelUnavailable(error.status)) throw error;
      lastError = error;
      // Nothing about this request was wrong, so step down to the next
      // model rather than telling a counsellor to try again later.
      console.warn(`[ai] ${model} returned ${error.status}; trying the next model`);
    }
  }

  throw (
    lastError ??
    new GeminiError("No Gemini model was available to answer.", 503)
  );
}

async function callModel(
  model: string,
  options: {
    apiKey: string;
    systemInstruction: string;
    contents: GeminiContent[];
    tools: GeminiToolDeclaration[];
    signal?: AbortSignal;
  },
): Promise<GeminiTurn> {
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
    // Otherwise surface Google's own message: on the free tier the
    // failures that actually happen are a bad key, an exhausted quota and
    // an overloaded model, and all three say so clearly enough to act on.
    // The caller decides which of those are worth another model.
    throw new GeminiError(
      `Gemini returned ${response.status} for model "${model}": ${body.slice(0, 400)}`,
      response.status,
    );
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: GeminiPart[] };
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
    // `thought` parts are the model's own reasoning summary, not an
    // answer — they belong in the echoed turn but not on screen.
    text: parts
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("")
      .trim(),
    functionCalls: parts
      .map((part) => part.functionCall)
      .filter((call): call is GeminiFunctionCall => Boolean(call)),
    parts,
  };
}
