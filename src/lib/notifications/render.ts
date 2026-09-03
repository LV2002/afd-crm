/**
 * Template rendering for notification copy.
 *
 * Deliberately tiny: `{{variable}}` substitution and nothing else. No
 * conditionals, no loops, no expression language. An admin writing "New
 * lead: {{lead_name}}" in a settings box should not be able to write
 * something that loops, throws, or reaches into an object it was not
 * given — the copy is configuration, not code.
 */

export type TemplateContext = Record<string, string | number | null | undefined>;

/**
 * Substitutes `{{key}}` from the context.
 *
 * An unknown or empty variable renders as an em dash rather than being
 * left as a literal `{{course}}` on a counsellor's screen. A typo in the
 * copy then looks like missing data, which is the milder of the two
 * failures — and the settings screen lists the variables each event
 * actually supplies, so the typo is avoidable in the first place.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key: string) => {
    const value = context[key];
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  });
}

/**
 * The variables a template refers to, in order of first appearance.
 * Used by the settings screen to warn about a name the event doesn't
 * supply, before the copy reaches anybody.
 */
export function templateVariables(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    const key = match[1];
    if (!found.includes(key)) found.push(key);
  }
  return found;
}

/**
 * Variables used in the copy that the event does not supply. These would
 * render as em dashes, so they are worth showing the admin as they type
 * rather than leaving to be discovered by a counsellor.
 */
export function unknownVariables(template: string, available: readonly string[]): string[] {
  return templateVariables(template).filter((v) => !available.includes(v));
}
