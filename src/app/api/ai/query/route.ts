import { NextResponse } from "next/server";
import { z } from "zod";

import { ANALYST_TOOLS, runAnalystTool } from "@/lib/ai/tools";
import { analystScope } from "@/lib/ai/tools/scope";
import {
  GeminiError,
  generateWithTools,
  listUsableModels,
  resolveModel,
  type GeminiContent,
} from "@/lib/ai/gemini";
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
    "- When a question names an individual, call find_person first, then person_history with the id it returns. If several people match, list them and ask which.",
    "- A person_history result may be quoted in full: this caller can already open that record. Do not repeat a phone number that came back masked as though it were complete.",
    "- Answer in a few sentences. Give the number first, then what it means. For one person's history, a short list of facts reads better than a paragraph.",
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

  // Resolved once and recorded on the audit row: which model answered is
  // part of what was asked and answered, and it is no longer a constant.
  const model = await resolveModel(apiKey);

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
          after: { question: parsed.data.question, toolsUsed, model },
        });

        return NextResponse.json({
          answer: result.text || "I couldn't find an answer to that.",
          toolsUsed,
        });
      }

      // Echo the model's own turn back VERBATIM before the results, or
      // the next request loses the link between a call and its response.
      // Rebuilding the parts from name and args is not good enough: a
      // thinking model attaches a `thoughtSignature` to each functionCall
      // and rejects the follow-up without it.
      contents.push({ role: "model", parts: result.parts });

      const responses: GeminiContent["parts"] = [];
      for (const call of result.functionCalls) {
        toolsUsed.push(call.name);
        const outcome = await runAnalystTool(call.name, call.args, { user });
        // Reading one person's whole file is the one thing the analyst does
        // that isn't an aggregate, so it gets its own row against that lead
        // rather than being buried in the question text — the same reason a
        // phone reveal and an export are audited (CLAUDE.md § Non-negotiables 5).
        if (call.name === "person_history" && outcome.ok) {
          const leadId = (call.args as { leadId?: unknown } | null)?.leadId;
          if (typeof leadId === "string") {
            const supabase = await createClient();
            await writeAuditLog(supabase, {
              actorId: user.id,
              action: "ai.person_history",
              entityType: "lead",
              entityId: leadId,
              after: { question: parsed.data.question },
            });
          }
        }
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
      // Both of these mean every model the key can reach was busy or out
      // of quota — generateWithTools() has already stepped down through
      // them. Nothing here is worth an operator's attention, so say what
      // a counsellor should actually do.
      if (error.status === 429) {
        return NextResponse.json(
          {
            error:
              "Every free Gemini model this key can use is out of quota for now. The free tier resets daily; try again in a few minutes, or later today.",
          },
          { status: 429 },
        );
      }
      if (error.status === 503 || error.status === 500 || error.status === 502) {
        return NextResponse.json(
          {
            error:
              "Google's free models are all busy right now. This clears on its own — try the question again in a minute.",
          },
          { status: 503 },
        );
      }
      if (error.status === 400 || error.status === 403) {
        return NextResponse.json(
          { error: `The analyst couldn't run: ${error.message}` },
          { status: 502 },
        );
      }
      if (error.status === 404) {
        // Google retires model names, so rather than tell the operator to
        // go and find a valid one, ask the API which names their own key
        // accepts and put them in the message.
        const available = await listUsableModels(apiKey).catch(() => [] as string[]);
        const suggestion =
          available.length > 0
            ? ` This key can use: ${available.slice(0, 5).join(", ")}. Set GEMINI_MODEL to one of them, or unset it to let the CRM pick.`
            : " Set GEMINI_MODEL to a current model name, or unset it to let the CRM pick.";
        return NextResponse.json(
          { error: `Gemini doesn't recognise the model "${model}".${suggestion}` },
          { status: 502 },
        );
      }
      return NextResponse.json({ error: `The analyst failed: ${error.message}` }, { status: 502 });
    }
    throw error;
  }
}
