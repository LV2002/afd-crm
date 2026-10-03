import { AccessDenied } from "@/components/layout/access-denied";
import { RecentDeliveries } from "@/components/integrations/recent-deliveries";
import { can, getCurrentUser } from "@/lib/auth/session";
import { recentWebhookDeliveries } from "@/lib/integrations/recent-deliveries";
import { createClient } from "@/lib/supabase/server";

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

// ── Wiring it in ─────────────────────────────────────────────────────
//
// If your script receives the form POST directly (doPost), pass the whole
// thing straight through — the CRM matches field names loosely and keeps
// everything it does not recognise:
//
// function doPost(e) {
//   const data = e.parameter;              // every field the form sent
//   sheet.appendRow([data.name, data.phone, data.email]);   // as today
//   sendToCrm(data);                       // and now the CRM
//   return ContentService.createTextOutput('ok');
// }
//
// If it is bound to a Google Form's sheet instead:
//
// function onFormSubmit(e) {
//   const data = {
//     submission_id: e.range ? 'row' + e.range.getRow() : String(Date.now()),
//     name:  e.namedValues['Name'][0],
//     phone: e.namedValues['Phone'][0],
//     email: e.namedValues['Email'][0],
//     page:  '/contact',                   // which page this form lives on
//     form:  'Contact form',               // which form it is
//   };
//   sendToCrm(data);
// }`;

/**
 * The browser half.
 *
 * Leon's forms are hand-written HTML on different pages, some pages having
 * more than one. Asking him to add hidden inputs to each one by hand is how
 * three of them end up unlabelled and their leads unattributable — so this
 * snippet fills the page, the form and the campaign parameters in for every
 * form on the site from one `<script>` tag.
 *
 * It adds hidden fields rather than intercepting the submit: the forms keep
 * posting exactly where they post today, so nothing about the existing Apps
 * Script or the sheet has to change, and a mistake here cannot lose an
 * enquiry.
 */
const PAGE_SNIPPET = `<!-- AFD CRM — paste once, before </body>, on every page with a form.
     Adds three hidden fields to each form so the CRM knows which page and
     which form produced the enquiry. Your forms keep posting where they
     already post; nothing else changes. -->
<script>
(function () {
  var forms = document.querySelectorAll('form');

  for (var i = 0; i < forms.length; i++) {
    var form = forms[i];

    // Which form. Prefer a name you chose; fall back to the element's id or
    // name, then to its position on the page so two unnamed forms are still
    // told apart.
    var label =
      form.getAttribute('data-crm-form') ||
      form.getAttribute('id') ||
      form.getAttribute('name') ||
      'form-' + (i + 1);

    add(form, 'form', label);
    add(form, 'page', window.location.pathname);
    // The full URL carries the campaign parameters. The CRM strips the query
    // string out of the page label and records it as attribution instead.
    add(form, 'page_url', window.location.href);
  }

  function add(form, name, value) {
    if (!value) return;
    // Never overwrite a field the form already has: a hidden input somebody
    // filled in deliberately is better evidence than anything guessed here.
    if (form.querySelector('[name="' + name + '"]')) return;
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
})();
</script>

<!-- Give a form a readable name, and it is used instead of the id: -->
<!-- <form data-crm-form="Book a demo" action="..."> -->`;

export default async function WebsiteIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const deliveries = await recentWebhookDeliveries(await createClient(), "website");

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
        <h2 className="font-medium">2. Paste this on every page with a form</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          One script tag, before <code>&lt;/body&gt;</code>. It adds three hidden fields to every
          form on the page — which page, which form, and the full address including any campaign
          parameters — so you can tell your forms apart in reports without editing each one by
          hand. Your forms keep posting exactly where they post today.
        </p>
        <div className="overflow-x-auto rounded-lg border bg-muted/50">
          <pre className="p-4 font-mono text-xs leading-relaxed">{PAGE_SNIPPET}</pre>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">3. Add this to your Apps Script</h2>
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
        <h2 className="font-medium">4. What the CRM understands</h2>
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
          <strong>Which page and which form</strong> both arrive as the sub-source, page first: an
          enquiry from the demo form on your NIFT page reads{" "}
          <code>/courses/nift · Book a demo</code>. Page first so Insights → Sources sorts by
          page, with the several forms on one page grouped underneath it. Either half on its own
          works too.
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The page is reduced to its path, so <code>?utm_source=…</code>, a trailing slash,{" "}
          <code>www.</code> and a difference in capitals all count as the same page rather than
          four separate rows in your reports.
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          <strong>Campaign parameters are kept as attribution.</strong> Anything starting{" "}
          <code>utm_</code>, plus <code>gclid</code> and <code>fbclid</code>, is recorded against
          the enquiry — so an ad pointing at a landing page can be credited with the form fills it
          produced. Fields your form sends explicitly beat whatever was in the address bar.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">5. Check it worked</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Submit a test enquiry on your own site. It should appear in the leads list within
          seconds, with <strong>Website</strong> as its source. If it does not, Settings →
          Platform Health lists every rejected delivery with the reason — a wrong key shows as
          &ldquo;Invalid or missing X-AFD-Signature&rdquo;.
        </p>
      </section>

      {/*
        The one question worth asking when leads are not arriving, and
        until now the only place it could be answered was a SQL console.
        Every delivery is written down before it is processed (CLAUDE.md
        non-negotiable #9), so an empty list here is not missing data —
        it is the answer.
      */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Recent deliveries</h2>
        <RecentDeliveries
          deliveries={deliveries}
          emptyHint="Your website has never posted here. Check the Apps Script or form handler is posting to the webhook URL above with the signing secret."
        />
      </section>
    </div>
  );
}
