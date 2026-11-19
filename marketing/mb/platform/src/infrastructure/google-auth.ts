import { createSign } from 'node:crypto';
import { z } from 'zod';
import type { Clock } from '../domain/clock.ts';
import { err, ok, type Result } from '../domain/result.ts';

export type FetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const ServiceAccountKeySchema = z.object({ client_email: z.string(), private_key: z.string(), token_uri: z.string().default('https://oauth2.googleapis.com/token') });

export interface GoogleAuthOptions {
  readonly readKeyFile: () => string; // the service account JSON text (kept in secrets/, never logged)
  readonly fetch: FetchFn;
  readonly clock: Clock;
}

const b64 = (data: string | Buffer): string => Buffer.from(data).toString('base64url');

// One service account signs in for every Google service we read (Sheets, Search Console, Analytics), each with its own
// read-only scope. Tokens are kept until a minute before they expire.
export class GoogleAuth {
  private readonly o: GoogleAuthOptions;
  private readonly tokens = new Map<string, { value: string; until: number }>();

  constructor(options: GoogleAuthOptions) {
    this.o = options;
  }

  // The address the owner must share each sheet or property with.
  clientEmail(): Result<string, string> {
    const key = this.key();
    return key.ok ? ok(key.value.client_email) : key;
  }

  private key(): Result<z.infer<typeof ServiceAccountKeySchema>, string> {
    try { return ok(ServiceAccountKeySchema.parse(JSON.parse(this.o.readKeyFile()))); } catch { return err('The Google key file is missing or not valid (secrets/google-service-account.json).'); }
  }

  async token(scope: string): Promise<Result<string, string>> {
    const key = this.key();
    if (!key.ok) return key;
    const nowS = Math.floor(this.o.clock.now().getTime() / 1000);
    const cached = this.tokens.get(scope);
    if (cached !== undefined && cached.until > nowS + 60) return ok(cached.value);
    const claims = { iss: key.value.client_email, scope, aud: key.value.token_uri, iat: nowS, exp: nowS + 3600 };
    const unsigned = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify(claims))}`;
    const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key.value.private_key).toString('base64url')}`;
    const res = await this.o.fetch(key.value.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}` });
    if (!res.ok) return err(`Google would not give access (status ${String(res.status)}). Check that the key file is the right one.`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (body.access_token === undefined) return err('Google sent no access token.');
    this.tokens.set(scope, { value: body.access_token, until: nowS + (body.expires_in ?? 3600) });
    return ok(body.access_token);
  }
}
