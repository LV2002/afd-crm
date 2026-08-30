import type { MetaLeadgenResponse } from "./map-lead-fields";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaGraphApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "MetaGraphApiError";
  }
}

/**
 * Meta's leadgen webhook notification carries only a `leadgen_id` — the
 * actual answers (name, phone, email, custom questions) have to be
 * fetched separately with a Page access token. This is the one network
 * call in the whole ingestion path, deliberately kept as a thin wrapper
 * around `fetch` so the actual field-mapping logic
 * (`map-lead-fields.ts`) stays pure and unit-testable without it.
 */
export async function fetchMetaLead(leadgenId: string, pageAccessToken: string): Promise<MetaLeadgenResponse> {
  const url = new URL(`${GRAPH_BASE_URL}/${leadgenId}`);
  url.searchParams.set("fields", "field_data,form_id,ad_id,adset_id,campaign_id,created_time");
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new MetaGraphApiError(`Meta Graph API returned ${response.status} fetching lead ${leadgenId}`, response.status, body);
  }

  return body as MetaLeadgenResponse;
}

export interface MetaTokenDebugInfo {
  isValid: boolean;
  appId?: string;
  scopes?: string[];
  expiresAt?: number;
}

/** Used by the "Test connection" button in Settings — confirms a token is real and shows what it can actually do, without ever echoing the token itself back to the browser. */
export async function debugMetaToken(accessToken: string, appAccessToken: string): Promise<MetaTokenDebugInfo> {
  const url = new URL(`${GRAPH_BASE_URL}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", appAccessToken);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new MetaGraphApiError(`Meta Graph API returned ${response.status} debugging the token`, response.status, body);
  }

  const data = body.data ?? {};
  return {
    isValid: Boolean(data.is_valid),
    appId: data.app_id,
    scopes: data.scopes,
    expiresAt: data.expires_at,
  };
}
