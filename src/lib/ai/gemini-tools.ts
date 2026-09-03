import type { AnalystTool } from "./tools";
import { toGeminiSchema, type GeminiToolDeclaration } from "./gemini-schema";

/**
 * Translates the provider-agnostic tool list into Gemini's declaration
 * shape. Separated from `gemini.ts` so it can be tested without importing
 * the fetch-based client.
 */
export function geminiToolDeclarations(tools: AnalystTool[]): GeminiToolDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiSchema(tool.inputSchema),
  }));
}
