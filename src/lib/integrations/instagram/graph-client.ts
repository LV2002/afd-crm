import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Instagram messaging runs on the same Graph API, the same app and the
 * same Page access token as Lead Ads — so this reuses
 * `MetaGraphApiError`, which is what keeps Meta's own sentence ("Requires
 * instagram_manage_messages", "This person isn't available right now")
 * attached to the failure instead of only a status code.
 *
 * Thin wrappers around `fetch` on purpose: everything with a decision in
 * it lives in `map-webhook.ts`, which is pure and tested.
 */

/**
 * Sends a text reply.
 *
 * `recipient.id` is the Instagram-scoped id (IGSID) from the inbound
 * webhook — not a handle, which cannot be messaged. The call is made
 * against the Instagram professional account's own id.
 *
 * Meta's 24-hour rule applies: outside 24 hours of the person's last
 * message this fails, by design, and the error says so. The inbox
 * disables the box rather than letting somebody type a reply that cannot
 * be sent, but this is still the authority — a clock can drift and the
 * window can close while a reply is being typed.
 */
export async function sendInstagramMessage(
  igAccountId: string,
  accessToken: string,
  recipientIgUserId: string,
  text: string,
): Promise<{ messageId: string | null }> {
  const response = await fetch(`${GRAPH_BASE_URL}/${igAccountId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientIgUserId },
      message: { text },
      access_token: accessToken,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new MetaGraphApiError(
      `Meta Graph API returned ${response.status} sending an Instagram message`,
      response.status,
      body,
    );
  }

  return { messageId: (body as { message_id?: string } | null)?.message_id ?? null };
}

export interface InstagramProfile {
  username: string | null;
  name: string | null;
  profilePicUrl: string | null;
}

/**
 * The handle and display name behind an IGSID, for the inbox to show
 * something other than a long number.
 *
 * Returns nulls rather than throwing when Meta refuses: a profile lookup
 * is decoration, and failing a message's arrival because the display name
 * could not be fetched would be the wrong trade — an unnamed conversation
 * that is there beats a named one that is not. Meta also genuinely
 * refuses this for some accounts and after some privacy settings, which
 * is not an error condition to escalate.
 */
export async function fetchInstagramProfile(
  igUserId: string,
  accessToken: string,
): Promise<InstagramProfile> {
  try {
    const url = new URL(`${GRAPH_BASE_URL}/${igUserId}`);
    url.searchParams.set("fields", "username,name,profile_pic");
    url.searchParams.set("access_token", accessToken);

    const response = await fetch(url.toString());
    if (!response.ok) return { username: null, name: null, profilePicUrl: null };

    const body = (await response.json()) as {
      username?: string;
      name?: string;
      profile_pic?: string;
    };
    return {
      username: body.username ?? null,
      name: body.name ?? null,
      profilePicUrl: body.profile_pic ?? null,
    };
  } catch {
    return { username: null, name: null, profilePicUrl: null };
  }
}

/**
 * Reads the institute's own Instagram account. Throws on refusal.
 *
 * Deliberately different from `fetchInstagramProfile` above, which reads
 * a *sender* and swallows every error — right for a webhook mid-flight,
 * where a missing username must not lose the message, and wrong for a
 * button whose entire job is to report what Meta said.
 *
 * This is also the canonical `instagram_basic` call, which matters for a
 * reason beyond diagnostics: Meta will not let an app request Advanced
 * Access to a permission it has never successfully used, and the
 * "Request advanced access" button stays greyed out with the API-calls
 * column reading zero. Pressing a button in the CRM is a great deal
 * easier than assembling the same call by hand in the Graph API
 * Explorer — which for a Business-owned Page means a System User token
 * first, because a plain user token there sees no Pages at all.
 */
export async function fetchInstagramAccountIdentity(
  igUserId: string,
  accessToken: string,
): Promise<{ id: string; username: string | null }> {
  const url = new URL(`${GRAPH_BASE_URL}/${igUserId}`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  const body = (await response.json()) as {
    id?: string;
    username?: string;
    error?: { message?: string; code?: number };
  };

  if (!response.ok || body.error) {
    // Meta's own wording, unedited — it is what gets pasted into their
    // documentation or a support thread.
    throw new Error(body.error?.message ?? `Meta returned ${response.status}.`);
  }

  return { id: body.id ?? igUserId, username: body.username ?? null };
}
