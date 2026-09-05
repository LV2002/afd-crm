import { GoogleAdsApiError, type GoogleAdsCredentials } from "./ads-client";

const GOOGLE_ADS_API_VERSION = "v18";
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

function headers(credentials: GoogleAdsCredentials) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${credentials.accessToken}`,
    "developer-token": credentials.developerToken,
    ...(credentials.loginCustomerId ? { "login-customer-id": credentials.loginCustomerId } : {}),
  };
}

/**
 * One-time (per customer account) — the daily sync creates this
 * automatically the first time it runs and stores the resulting resource
 * name as a credential, same pattern as Meta's `createCustomAudience`.
 * `uploadKeyType: CONTACT_INFO` is what makes this a Customer Match list
 * matched on phone/email rather than a mobile device id or user id.
 */
export async function createUserList(customerId: string, credentials: GoogleAdsCredentials, name: string): Promise<string> {
  const response = await fetch(`${GOOGLE_ADS_BASE_URL}/customers/${customerId}/userLists:mutate`, {
    method: "POST",
    headers: headers(credentials),
    body: JSON.stringify({
      operations: [
        {
          create: {
            name,
            membershipLifeSpan: 10000, // Google's max — leads should keep matching indefinitely, not expire off the list on a fixed window.
            crmBasedUserList: { uploadKeyType: "CONTACT_INFO", dataSourceType: "FIRST_PARTY" },
          },
        },
      ],
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new GoogleAdsApiError(`Google Ads API returned ${response.status} creating a user list`, response.status, body);
  }
  return body.results[0].resourceName as string;
}

/**
 * Phone-only matching, same reasoning as Meta's client: every lead has a
 * `primary_phone`, so there's no real gain from also uploading email.
 * `userListResourceName` is the full `customers/{id}/userLists/{id}`
 * resource name returned by `createUserList`.
 */
async function modifyUserListMembers(
  customerId: string,
  credentials: GoogleAdsCredentials,
  userListResourceName: string,
  hashedPhonesE164: string[],
  op: "create" | "remove",
): Promise<void> {
  if (hashedPhonesE164.length === 0) return;

  const response = await fetch(`${GOOGLE_ADS_BASE_URL}/customers/${customerId}:uploadUserData`, {
    method: "POST",
    headers: headers(credentials),
    body: JSON.stringify({
      operations: hashedPhonesE164.map((hashedPhone) => ({
        [op]: { userIdentifiers: [{ hashedPhoneNumber: hashedPhone }] },
      })),
      customerMatchUserListMetadata: { userList: userListResourceName },
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    const verb = op === "create" ? "adding to" : "removing from";
    throw new GoogleAdsApiError(`Google Ads API returned ${response.status} ${verb} the user list`, response.status, body);
  }
}

export async function addUsersToList(
  customerId: string,
  credentials: GoogleAdsCredentials,
  userListResourceName: string,
  hashedPhonesE164: string[],
): Promise<void> {
  await modifyUserListMembers(customerId, credentials, userListResourceName, hashedPhonesE164, "create");
}

export async function removeUsersFromList(
  customerId: string,
  credentials: GoogleAdsCredentials,
  userListResourceName: string,
  hashedPhonesE164: string[],
): Promise<void> {
  await modifyUserListMembers(customerId, credentials, userListResourceName, hashedPhonesE164, "remove");
}

/**
 * Reports an admission back to Google Ads against a click.
 *
 * `conversionActionResourceName` is the full
 * `customers/{id}/conversionActions/{id}` an admin pastes into Settings →
 * Integrations → Google. It must be an action created in Google Ads with
 * type "Import — from clicks", or the upload is rejected.
 *
 * `partialFailure: true` deliberately. A batch of forty conversions where
 * one GCLID has expired should upload the other thirty-nine, not fail
 * whole. Google returns the per-row errors in `partialFailureError`,
 * which the caller records against the rows that failed.
 */
export async function uploadClickConversions(
  customerId: string,
  credentials: GoogleAdsCredentials,
  conversionActionResourceName: string,
  conversions: Array<{ gclid: string; conversionDateTime: string; value: number; currency: string }>,
): Promise<{ uploaded: number; partialFailure: unknown }> {
  if (conversions.length === 0) return { uploaded: 0, partialFailure: null };

  const response = await fetch(
    `${GOOGLE_ADS_BASE_URL}/customers/${customerId}:uploadClickConversions`,
    {
      method: "POST",
      headers: headers(credentials),
      body: JSON.stringify({
        conversions: conversions.map((conversion) => ({
          gclid: conversion.gclid,
          conversionAction: conversionActionResourceName,
          conversionDateTime: conversion.conversionDateTime,
          conversionValue: conversion.value,
          currencyCode: conversion.currency,
        })),
        partialFailure: true,
      }),
    },
  );

  const body = await response.json();
  if (!response.ok) {
    throw new GoogleAdsApiError(
      `Google Ads API returned ${response.status} uploading conversions`,
      response.status,
      body,
    );
  }

  // `results` carries one entry per accepted row; a row rejected under
  // partial failure comes back empty, so counting the non-empty ones is
  // how many Google actually took.
  const results = Array.isArray(body.results) ? body.results : [];
  return {
    uploaded: results.filter((result: unknown) => result && Object.keys(result).length > 0).length,
    partialFailure: body.partialFailureError ?? null,
  };
}
