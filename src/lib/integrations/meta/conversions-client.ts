const GRAPH_API_VERSION = "v21.0";

export interface CapiEvent {
  event_name: string;
  /** Unix seconds. */
  event_time: number;
  /** Lets Meta drop a repeat of the same event. */
  event_id: string;
  action_source: "system_generated";
  user_data: { lead_id: string; ph?: string[]; em?: string[] };
  custom_data: { event_source: "crm"; lead_event_source: string };
}

export class MetaCapiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MetaCapiError";
  }
}

/**
 * Sends CRM funnel events to Meta's Conversions API.
 *
 * `datasetId` is the dataset (formerly pixel) the CRM funnel was set up
 * against in Events Manager. Each event carries the lead's own Meta lead id
 * (`user_data.lead_id`), which is how Meta ties "this person took admission"
 * to the ad that produced them, and `custom_data.event_source: "crm"` marks it
 * as coming from a CRM rather than a website.
 */
export async function sendCapiEvents(datasetId: string, accessToken: string, events: CapiEvent[]): Promise<void> {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${datasetId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: events, access_token: accessToken }),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string; error_user_msg?: string } };
      detail = body.error?.error_user_msg ?? body.error?.message ?? "";
    } catch {
      /* no body */
    }
    throw new MetaCapiError(`Meta returned ${response.status}${detail ? `: ${detail}` : ""}`, response.status);
  }
}
