const TOKEN_SHAPES = [/Bearer\s+[A-Za-z0-9._~+/=-]+/g, /\b(?:sk-|EAA|AIza)[A-Za-z0-9_-]{16,}/g];
const MIN_SECRET_LENGTH = 6;

// Secrets must never reach logs or error messages (CLAUDE.md rule 13). Known values first, then common token shapes.
export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= MIN_SECRET_LENGTH) out = out.split(secret).join('[redacted]');
  }
  for (const shape of TOKEN_SHAPES) out = out.replace(shape, '[redacted]');
  return out;
}
