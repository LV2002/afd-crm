import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

import { getWebsiteStatus } from "./actions";
import { SecretPanel } from "./secret-panel";

export const dynamic = "force-dynamic";

/**
 * The institute's own website forms.
 *
 * AFD's site posts its enquiry forms to a Google Apps Script that appends
 * a row to a spreadsheet. This screen does not replace that — the script
 * keeps writing its sheet — it adds one more call, to this CRM, so an
 * enquiry lands with an owner, a response-time clock and a place in every
 * report instead of sitting in a spreadsheet nobody is measured on.
 *
 * The script is printed here in full rather than kept in a document
 * somewhere, because the person pasting it is not necessarily the person
 * who reads this repository.
 */
const APPS_SCRIPT = `// ── AFD CRM ──────────────────────────────────────────────────────────
// Paste into the Apps Script bound to your form's sheet, then call
// sendToCrm(data) from your existing onFormSubmit handler — right after
// the line that appends the row.

const CRM_URL = 'https://YOUR-CRM-DOMAIN/api/webhooks/website';
const CRM_SECRET = 'PASTE-THE-SIGNING-KEY-HERE';

function sendToCrm(data) {
  const body = JSON.stringify(data);

  // Sign the exact bytes being sent. The CRM recomputes this and rejects
  // anything that does not match, so the URL alone is not enough to post
  // a fake enquiry.
  const raw = Utilities.computeHmacSha256Signature(body, CRM_SECRET);
  const hex = raw.map(function (b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');

  const response = UrlFetchApp.fetch(CRM_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    headers: { 'X-AFD-Signature': 'sha256=' + hex },
    muteHttpExceptions: true,
  });

  // Logged, never thrown: a CRM hiccup must not stop the row reaching
  // your sheet. Check View → Executions in Apps Script if enquiries stop
  // arriving.
  console.log('CRM responded ' + response.getResponseCode() + ': ' + response.getContentText());
}

// Example of wiring it into a typical handler:
//
// function onFormSubmit(e) {
//   const data = {
//     submission_id: e.range ? 'row' + e.range.getRow() : String(Date.now()),
//     name:  e.namedValues['Name'][0],
//     phone: e.namedValues['Phone'][0],
//     email: e.namedValues['Email'][0],
//     city:  e.namedValues['City'][0],
//     course: e.namedValues['Course'][0],
//     form: 'Contact form',
//   };
//   sendToCrm(data);
// }`;

export default async function WebsiteIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const { configured } = await getWebsiteStatus();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Website forms</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Enquiries from afdindia.com, arriving here the moment somebody submits one — owned by
          a counsellor, with the response-time clock already running. Your Google Sheet keeps
          filling up exactly as it does now; this adds the CRM alongside it, it does not replace
          it.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">1. Generate the signing key</h2>
        <SecretPanel configured={configured} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">2. Add this to your Apps Script</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Open the script bound to your form&rsquo;s sheet (Extensions → Apps Script), paste this
          in, and replace the two values at the top. Then call <code>sendToCrm(data)</code> from
          your existing submit handler, just after the line that writes the row.
        </p>
        <div className="overflow-x-auto rounded-lg border bg-muted/50">
          <pre className="p-4 font-mono text-xs leading-relaxed">{APPS_SCRIPT}</pre>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">3. What the CRM understands</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Only a <strong>name</strong> and a <strong>phone number</strong> are required.
          Everything else is optional, and field names are matched loosely — <code>name</code>,{" "}
          <code>Full Name</code> and <code>student_name</code> are all read as the name; the same
          goes for phone, email, city, year and course.
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          <strong>Nothing is ever thrown away.</strong> Every field your form sends is stored on
          the enquiry whether the CRM recognised it or not, so adding a question to a form later
          never loses the answers submitted in the meantime.
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Send a <code>form</code> field naming which form it was, and it arrives as the
          sub-source — so several forms on one site stay distinguishable in reports.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">4. Check it worked</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Submit a test enquiry on your own site. It should appear in the leads list within
          seconds, with <strong>Website</strong> as its source. If it does not, Settings →
          Platform Health lists every rejected delivery with the reason — a wrong key shows as
          &ldquo;Invalid or missing X-AFD-Signature&rdquo;.
        </p>
      </section>
    </div>
  );
}
