// Google Ads API version — bump as Google deprecates old ones (roughly
// quarterly); same maintenance shape as Meta's GRAPH_API_VERSION constant.
const GOOGLE_ADS_API_VERSION = "v18";
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export class GoogleAdsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

/**
 * The Google Ads API only ever accepts a short-lived OAuth2 access token,
 * never the refresh token directly — every call in this integration
 * exchanges the stored refresh token for a fresh access token first. No
 * caching across cron invocations: each sync run is a handful of requests
 * at most, and a cron function's memory doesn't persist between
 * invocations anyway, so caching would only ever help within a single run.
 */
export async function getGoogleAdsAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new GoogleAdsApiError(`Google OAuth token refresh returned ${response.status}`, response.status, body);
  }
  return body.access_token as string;
}

export interface GoogleAdsCredentials {
  developerToken: string;
  accessToken: string;
  /** The manager (MCC) account id, if the target customer is managed under one — sent as the `login-customer-id` header. Digits only, no dashes. */
  loginCustomerId?: string | null;
}

/**
 * `googleAds:search` (not `:searchStream`) — a plain REST POST with a GAQL
 * query string, paginated via `nextPageToken` like any other Google API
 * list endpoint. `customerId` is the target ad account, digits only (the
 * API rejects the dashed display format).
 */
export async function searchGoogleAds<T>(customerId: string, credentials: GoogleAdsCredentials, query: string): Promise<T[]> {
  const results: T[] = [];
  let pageToken: string | undefined;

  do {
    const response = await fetch(`${GOOGLE_ADS_BASE_URL}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials.accessToken}`,
        "developer-token": credentials.developerToken,
        ...(credentials.loginCustomerId ? { "login-customer-id": credentials.loginCustomerId } : {}),
      },
      body: JSON.stringify({ query, pageToken }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new GoogleAdsApiError(`Google Ads API returned ${response.status} for customer ${customerId}`, response.status, body);
    }
    results.push(...((body.results ?? []) as T[]));
    pageToken = body.nextPageToken;
  } while (pageToken);

  return results;
}
