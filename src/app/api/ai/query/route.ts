import { NextResponse } from "next/server";
import { z } from "zod";

import { ANALYST_TOOLS, runAnalystTool } from "@/lib/ai/tools";
import { analystScope } from "@/lib/ai/tools/scope";
import { GEMINI_MODEL, GeminiError, generateWithTools, type GeminiContent } from "@/lib/ai/gemini";
import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * The AI analyst endpoint, running on Gemini's free tier.
 *
 * The provider is deliberately the only thing this file knows about the
 * model. Which questions can be answered, and with whose data, is decided
 * entirely by `@/lib/ai/tools`: Gemini picks a tool and arguments, this
 * loop runs it with the caller's own SessionUser, and no SQL is ever
 * generated (CLAUDE.md § AI analyst rules).
 */

export const maxDuration = 60;

/** Bounded so a confused model cannot loop indefinitely against the quota. */
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "The analyst isn't configured yet — GEMINI_API_KEY is not set." },
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

  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: parsed.data.question }] }];
  const toolDeclarations = ANALYST_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
  const toolsUsed: string[] = [];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const result = await generateWithTools({
        apiKey,
        systemInstruction: systemPrompt(analystScope(user), user.centerIds.length),
        contents,
        tools: toolDeclarations,
      });

      if (result.functionCalls.length === 0) {
        const supabase = await createClient();
        // Every question asked of the data is worth a row, even though the
        // analyst only returns aggregates: it records who asked what, the
        // same reason exports are audited.
        await writeAuditLog(supabase, {
          actorId: user.id,
          action: "ai.query",
          entityType: "ai",
          after: { question: parsed.data.question, toolsUsed, model: GEMINI_MODEL },
        });

        return NextResponse.json({
          answer: result.text || "I couldn't find an answer to that.",
          toolsUsed,
        });
      }

      // Echo the model's own turn back before the results, or the next
      // request loses the link between a call and its response.
      contents.push({
        role: "model",
        parts: result.functionCalls.map((call) => ({ functionCall: call })),
      });

      const responses: GeminiContent["parts"] = [];
      for (const call of result.functionCalls) {
        toolsUsed.push(call.name);
        const outcome = await runAnalystTool(call.name, call.args, { user });
        responses.push({
          functionResponse: {
            name: call.name,
            // A failed tool is reported back as data rather than dropped,
            // so the model can correct itself instead of hanging.
            response: outcome.ok
              ? { result: outcome.result }
              : { error: outcome.error },
          },
        });
      }
      contents.push({ role: "user", parts: responses });
    }

    return NextResponse.json({
      answer: "I couldn't finish working that out. Try asking something more specific.",
      toolsUsed,
    });
  } catch (error) {
    if (error instanceof GeminiError) {
      if (error.status === 429) {
        return NextResponse.json(
          { error: "The free Gemini quota is used up for now. Try again in a few minutes." },
          { status: 429 },
        );
      }
      if (error.status === 400 || error.status === 403) {
        return NextResponse.json(
          { error: `The analyst couldn't run: ${error.message}` },
          { status: 502 },
        );
      }
      if (error.status === 404) {
        return NextResponse.json(
          {
            error: `Gemini doesn't recognise the model "${GEMINI_MODEL}". Set GEMINI_MODEL to a current model name.`,
          },
          { status: 502 },
        );
      }
      return NextResponse.json({ error: `The analyst failed: ${error.message}` }, { status: 502 });
    }
    throw error;
  }
}
