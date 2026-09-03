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
 * Configurable because model names on this API change faster than the
 * code around them, and a wrong one is a 404 the operator can fix without
 * a deploy. The default is a current free-tier model; if Google renames
 * it, set GEMINI_MODEL rather than editing this file.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

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
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
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
    // Surface Google's own message: on the free tier the two failures that
    // actually happen are a bad key and a quota exhaustion, and both say so
    // clearly enough to act on.
    throw new GeminiError(
      `Gemini returned ${response.status}: ${body.slice(0, 400)}`,
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
