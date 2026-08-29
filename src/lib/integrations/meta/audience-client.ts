import { MetaGraphApiError } from "./graph-client";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** One-time (per ad account) — the daily sync creates this automatically the first time it runs and stores the resulting id as a credential, so there's no separate manual setup step. */
export async function createCustomAudience(adAccountId: string, accessToken: string, name: string): Promise<string> {
  const response = await fetch(`${GRAPH_BASE_URL}/act_${adAccountId}/customaudiences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      subtype: "CUSTOM",
      customer_file_source: "USER_PROVIDED_ONLY",
      access_token: accessToken,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new MetaGraphApiError(`Meta returned ${response.status} creating a custom audience`, response.status, body);
  }
  return body.id as string;
}

/**
 * Phone-only matching, deliberately: `leads.primary_phone` is NOT NULL
 * (every lead has one), so there's no real gain from also sending email
 * and dealing with Meta's rules for what to do about the field a given
 * row doesn't have (blank fields aren't supposed to be hashed). One
 * schema key, always populated, is simpler and just as effective here.
 */
async function modifyAudienceUsers(
  audienceId: string,
  accessToken: string,
  hashedPhones: string[],
  method: "POST" | "DELETE",
): Promise<void> {
  if (hashedPhones.length === 0) return;

  const response = await fetch(`${GRAPH_BASE_URL}/${audienceId}/users`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payload: { schema: ["PHONE"], data: hashedPhones.map((phone) => [phone]) },
      access_token: accessToken,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    const verb = method === "POST" ? "adding to" : "removing from";
    throw new MetaGraphApiError(`Meta returned ${response.status} ${verb} the custom audience`, response.status, body);
  }
}

export async function addUsersToAudience(audienceId: string, accessToken: string, hashedPhones: string[]): Promise<void> {
  await modifyAudienceUsers(audienceId, accessToken, hashedPhones, "POST");
}

export async function removeUsersFromAudience(audienceId: string, accessToken: string, hashedPhones: string[]): Promise<void> {
  await modifyAudienceUsers(audienceId, accessToken, hashedPhones, "DELETE");
}
