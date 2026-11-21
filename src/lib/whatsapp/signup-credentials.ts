/**
 * Which WhatsApp credentials to save when a counsellor's number is connected.
 *
 * The CRM keeps ONE access token, Business Account ID and Phone Number ID for
 * the institute's own API number — the one every broadcast and automation
 * sends from. Connecting a counsellor's number used to overwrite all three
 * with the new number's, which could repoint broadcasts at the counsellor's
 * phone and cut the API number's messages off. Now a value that is already
 * saved is left alone; only what is missing is filled in (the first number
 * ever connected, on a fresh install).
 */
export interface SignupCredentials {
  access_token: string;
  waba_id: string;
  phone_number_id: string;
}

export function credentialsToSave(
  existing: Partial<Record<keyof SignupCredentials, string | null | undefined>>,
  incoming: SignupCredentials,
): { toSave: Partial<SignupCredentials>; keptExisting: Array<keyof SignupCredentials> } {
  const toSave: Partial<SignupCredentials> = {};
  const keptExisting: Array<keyof SignupCredentials> = [];
  for (const key of ["access_token", "waba_id", "phone_number_id"] as const) {
    if (existing[key]) keptExisting.push(key);
    else toSave[key] = incoming[key];
  }
  return { toSave, keptExisting };
}
