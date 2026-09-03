export interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Gemini's JSON Schema subset is narrower than the tool definitions'.
 *
 * It rejects `additionalProperties`, which the definitions carry because
 * it documents intent (and a future provider may enforce it), and it
 * rejects an object schema with an empty `properties` map, which is how a
 * no-argument tool would otherwise be expressed. Both are normalised here
 * rather than in the tool definitions: arguments are validated by zod
 * inside `runAnalystTool` regardless, so the model not seeing these
 * constraints costs nothing, and the definitions stay provider-neutral.
 */
export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    if (key === "properties" && Object.keys(value as object).length === 0) continue;
    out[key] = value;
  }
  return out;
}
