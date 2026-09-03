import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { anthropicToolDefinitions, runAnalystTool } from "@/lib/ai/tools";
import { analystScope } from "@/lib/ai/tools/scope";
import { createClient } from "@/lib/supabase/server";

/**
 * The AI analyst endpoint.
 *
 * Claude is given a fixed set of tools and asked a question; it chooses
 * which to call. It never sees, writes or receives SQL — see
 * src/lib/ai/tools/index.ts for why that boundary is where it is.
 *
 * The loop runs server-side and the caller's own SessionUser is passed to
 * every tool, so the answer can only ever be built from data that caller
 * could already see.
 */

export const maxDuration = 60;

/**
 * Configurable rather than hardcoded (CLAUDE.md § Non-negotiables 10). The
 * default is the current recommended model; an operator who wants to trade
 * quality for cost sets ANTHROPIC_MODEL without a deploy.
 */
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

/** Bounded so a confused model cannot loop indefinitely on someone's bill. */
const MAX_TURNS = 6;

const requestSchema = z.object({
  question: z.string().trim().min(1).max(1000),
});

function systemPrompt(scope: string, centreCount: number): string {
  return [
    "You are the analyst for AFD India, a design and architecture entrance-exam coaching institute in Kerala.",
    "You answer questions about their CRM data using only the tools provided.",
    "",
    "Rules:",
    "- Use the tools. Never guess a number, and never state a figure a tool did not return.",
    "- If the tools cannot answer the question, say so plainly and say what you would need.",
    `- The person asking has '${scope}' report access${scope === "center" ? ` across ${centreCount} centre(s)` : ""}. Results are already limited to what they may see; do not speculate about the rest of the organisation.`,
    "- Answer in a few sentences. Give the number first, then what it means.",
    "- Amounts are Indian rupees; dates are Asia/Kolkata.",
    "- Where a number suggests an obvious action, say it in one line. Do not invent targets or benchmarks.",
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "ai.query")) {
    return NextResponse.json({ error: "You don't have permission to use the analyst." }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The analyst isn't configured yet — ANTHROPIC_API_KEY is not set." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: parsed.data.question },
  ];
  const toolsUsed: string[] = [];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt(analystScope(user), user.centerIds.length),
        tools: anthropicToolDefinitions(),
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        const answer = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();

        // Every question asked of the data is worth a row, even though the
        // analyst only ever returns aggregates: it records who asked what,
        // which is the same reason exports are audited.
        const supabase = await createClient();
        await writeAuditLog(supabase, {
          actorId: user.id,
          action: "ai.query",
          entityType: "ai",
          after: { question: parsed.data.question, toolsUsed },
        });

        return NextResponse.json({
          answer: answer || "I couldn't find an answer to that.",
          toolsUsed,
        });
      }

      messages.push({ role: "assistant", content: response.content });

      // All tool results for one assistant turn must go back in a SINGLE
      // user message, or the model learns to stop calling tools in parallel.
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        toolsUsed.push(block.name);
        const outcome = await runAnalystTool(block.name, block.input, { user });
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }),
          // Report a failed tool back as an error rather than dropping it,
          // so the model can correct course instead of hanging.
          is_error: !outcome.ok,
        });
      }
      messages.push({ role: "user", content: results });
    }

    return NextResponse.json({
      answer: "I couldn't finish working that out. Try asking something more specific.",
      toolsUsed,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "The analyst's API key was rejected." }, { status: 502 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "The analyst is rate limited. Try again shortly." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `The analyst failed: ${error.message}` }, { status: 502 });
    }
    throw error;
  }
}
