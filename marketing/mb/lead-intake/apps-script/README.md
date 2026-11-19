# Lead intake script (Google Apps Script)

Every form posts here. The script writes the Google Sheet row first, then sends the lead to the CRM, signed. If the CRM
is down the lead waits in the "CRM queue" tab and is retried every 15 minutes. It runs on Google, so it works with your laptop closed.

What the CRM receives for each lead: `name`, `phone`, `email`, `exam` (also sent as `course`), `page` (the page path),
`form` (which form on that page), `page_url` (full address with campaign details), `submission_id`, and any `utm_*`,
`gclid`, `fbclid`. Anything else a form sends is kept too. The CRM shows the source as `page · form`.

## One-time setup (about 10 minutes)
1. Open the enquiries Google Sheet, then Extensions > Apps Script.
2. Replace the default file with the contents of `Code.gs`, then add a second file named `Crm` with the contents of `Crm.gs`. Save.
3. Project Settings (gear icon) > Script properties > add two properties:
   - `CRM_URL` = the webhook address shown in the CRM (ends in `/api/webhooks/website`)
   - `CRM_SECRET` = the signing key from the CRM ("Generate the signing key")
   Do not paste the key anywhere else, and do not share it in chat.
4. In the editor choose the function `setup` and press Run. Approve the permissions when Google asks. It creates the "Enquiries" tab and the 15 minute retry timer.
5. Choose `sendTestEnquiry` and Run. A lead named "TEST - ignore" should appear in the CRM; delete it there.
6. Deploy > New deployment > type Web app > Execute as: Me > Who has access: Anyone > Deploy. Copy the web app address (it ends in `/exec`).
7. Put that address in `config/lead-forms.json` as `endpoint` (or tell Claude and it will).

After any later change to the code: Deploy > Manage deployments > edit > New version.

## On the website
Run `npm run form-script`, copy the `<script>` it prints, and paste it once into the footer code of every page with a form.
It adds the hidden fields `form`, `page` and `page_url` to every form on the page (it never overwrites a field the form already has),
so your existing forms report their page and form to the CRM too. Forms made by Page Studio post straight to this script.
It does nothing on addresses starting `/publisher` or `/user`.

## Checks
`npm test` runs this exact code against stand-ins for Google's services: sheet written first, signature matches the
body, duplicates and bots ignored, CRM down then queued then delivered, CRM refusal not retried, formulas neutralised.

## Live facts (exam dates that update on every page)
1. In the Apps Script project add a third file named `Facts` with the contents of `Facts.gs`. Save, then Deploy > Manage deployments > edit > New version (the address stays the same).
2. Project Settings > Script properties > add `FACTS_SECRET`, a long random phrase (for example four unrelated words and a number). Never share it in chat.
3. Put the same phrase in the app's `.env` as `FACTS_PUBLISH_SECRET`, then restart the app.
4. In the app, open Facts and dates and press "Publish to the website now". A tab called "Live facts" appears in the Sheet.
5. Paste the new footer script (`npm run form-script`, or Paste into Knorish) into the site-wide Knorish footer code, replacing the old one. It carries the form design, the fact refresh and the reading aids.
After that, change a fact in the app and the website follows within minutes. Pages made by Page Studio tag every date automatically. For a page you wrote by hand, wrap the figure in the tag shown on the Facts screen.
Limit, said plainly: titles, page descriptions and search-result snippets cannot change this way. Those change when you paste the page again.

## Admissions: what happened to each enquiry (CRM reports back)
The app can show which pages and sources bring admissions, not only enquiries, if the CRM tells the script what became of each one.
1. In the Apps Script project add a file named `Outcomes` with the contents of `Outcomes.gs`. Save, then Deploy > Manage deployments > edit > New version.
2. Project Settings > Script properties > add `OUTCOMES_SECRET`, a long random phrase. Never share it in chat. Give it to whoever maintains the CRM.
3. The CRM sends a POST to the same `/exec` address whenever an enquiry's status changes (a form post or JSON, with these fields):
   - `_afd_publish` = `outcome`
   - `timestamp` = the time now in milliseconds
   - `payloadJson` = text of `{"version":1,"events":[{"submission_id":"...","status":"admitted","event_at":"2026-10-20T05:00:00.000Z","revenue_inr":45000}]}`
   - `signature` = HMAC-SHA256, in hex, of `timestamp + "." + payloadJson`, using `OUTCOMES_SECRET` as the key
   Up to 200 events a call. `submission_id` is the id the website sent with the enquiry (the CRM already receives it). Statuses are lower case words with underscores: `contacted`, `demo_booked`, `demo_done`, `admitted`, `lost` (the words the app understands are in Settings, "Enquiries to admissions"). Send `revenue_inr` once, on the admitted event, as the total for that admission. A repeated event is ignored; a request older than ten minutes is refused.
4. Node example for the CRM side:
   ```js
   const crypto = require('crypto');
   const payloadJson = JSON.stringify({ version: 1, events: [{ submission_id: id, status: 'admitted', event_at: new Date().toISOString(), revenue_inr: 45000 }] });
   const timestamp = Date.now();
   const signature = crypto.createHmac('sha256', process.env.OUTCOMES_SECRET).update(`${timestamp}.${payloadJson}`).digest('hex');
   await fetch(EXEC_URL, { method: 'POST', body: new URLSearchParams({ _afd_publish: 'outcome', timestamp: String(timestamp), payloadJson, signature }) });
   ```
5. A tab called "Lead outcomes" appears in the Sheet after the first report. The app reads it with the same read-only access it uses for the enquiries.

## Free resources behind a private link (past papers and the like)
1. In the Apps Script project add another file named `Resources` with the contents of `Resources.gs`. Save.
2. Upload each file (PDF or image) to Google Drive. It can stay private: no sharing is needed, because the script reads it as you.
3. Open the Sheet. Run `setup` once more, or just submit one test form: a tab called "Resources" appears. Add one row per file: the short name (for example `nid-past-papers`), a title, and the Drive link.
4. Deploy > Manage deployments > edit > New version (the address stays the same).
5. In Marketing Brain, Settings, Offers added to pages: on the offer, put the same short name in "Private file name". The form then asks for name, phone and email.
When a visitor sends the form, the lead goes to the Sheet and the CRM first, then the page opens a link in a new tab. The link works for 24 hours and 3 opens, shows the file from inside the page (the Drive address is never shown), and every issue is logged in a "Downloads" tab. Keep each file under about 20 MB.
