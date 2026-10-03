# Connecting Meta Ads and Google Ads

Written for Leon. No code, no terminal — every step is a page in a browser.

Everything here is already built. These are the credentials that switch it on.

---

## What you get, and what each piece needs

| What it does | Meta needs | Google needs |
|---|---|---|
| **Leads arrive instantly** — somebody submits your ad form, the lead is in the CRM seconds later, assigned by your rules | Webhook + Verify Token + Page Access Token | Webhook + Verify Key |
| **Cost per lead and ROAS** — spend pulled in nightly and matched to leads | Ads Access Token + Ad Account ID | OAuth + Developer Token + Customer ID |
| **Retargeting audiences** — consenting leads kept in sync, removed the moment consent is withdrawn | Ads Access Token + Ad Account ID | — |
| **Teach Google what a real student looks like** — admissions reported back so bidding optimises for enrolments, not form fills | — | Offline Conversion Action |

You do **not** have to do all of it at once. The first row is the one that matters on day
one; the rest can follow.

> **Leads arrive in real time, not once a day.** The daily job at 10:00 AM IST is only for
> ad *spend*, retargeting audiences and reporting conversions back. An actual lead comes
> in through a webhook the moment the form is submitted.

---

## Before you start

Have ready:

- Your CRM's address: `https://afd-crm-one.vercel.app`
- Admin access to the CRM (Settings → Integrations)
- A **Meta Business account** that owns the Facebook Page your lead ads run on
- A **Google Ads account**, and permission to create a Google Cloud project

Pick two passwords of your own invention and write them down — one for Meta, one for
Google. They're called "verify tokens". They aren't issued by anyone; you make them up,
and type the same value in two places. Anything long and random is fine.

---

# Part 1 — Meta Ads

> ## Read this before you spend an afternoon on it
>
> A Meta app starts in **Development mode**. In that state it delivers leads only
> for people who hold a role on the app — which includes you, so **your own test
> leads do arrive** and the whole chain can be proven today.
>
> What it will **not** deliver is a lead from a member of the public. For that:
>
> 1. **App Review** for `leads_retrieval` (submitted with `pages_show_list`,
>    `pages_read_engagement`, `pages_manage_metadata`), moving it from Standard to
>    **Advanced Access**
> 2. The app switched to **Live** mode
>
> Review takes days, sometimes longer, and usually wants Business Verification
> first. Do not point a live ad campaign at this until the app is Live — the leads
> are not queued anywhere, they are simply never delivered.
>
> **Meanwhile, use the CSV import.** `Leads → Import` runs the same
> `resolveOrCreateLead()` path every webhook uses, so a spreadsheet of leads gets
> the same de-duplication, the same first-touch attribution and the same
> assignment rules as a live one. If your forms already deliver to a Google Sheet
> (Meta's CRM Setup), export it and import it — daily if you like. That is a
> working CRM today rather than one waiting on Meta, and nothing about it has to
> be undone when the webhook starts.
>
> The same two-phase split applies to the ad spend and retargeting syncs, which
> need `ads_read` / `ads_management` on the same review.


### 1.1 Create a Meta app

1. Go to **developers.facebook.com** → **My Apps** → **Create App**
2. Use case: **Other** → Type: **Business** → pick your Business portfolio
3. Name it `AFD CRM`

### 1.2 Copy the App ID and Secret

In the new app: **App settings → Basic**.

- **App ID** — copy it
- **App Secret** — click Show, copy it

Now in the CRM: **Settings → Integrations → Meta**, paste both, and put your made-up Meta
password in **Verify Token**. Save.

### 1.3 Get a token — use a System User, not the Graph API Explorer

The Explorer is the route most tutorials show, and on a **Business**-type app with
Facebook Login for Business it fights you: the token controls stay inert until a Login
Configuration exists, and even when it works the token it hands you expires and has to be
extended by hand every sixty days. A token that silently dies in two months is a lead
source that silently dies in two months.

A **System User** avoids all of it. It is a non-human account inside your Business
portfolio, built for exactly this, and its token can be set to **never expire**.

1. Go to **business.facebook.com** → **Business settings**
2. **Users → System users → Add**
   - Name: `AFD CRM Sync`
   - Role: **Admin**
3. **Add the app as an asset. Do this one first** — without it, Generate new token
   shows *"No permissions available — assign an app role to the system user"* and
   offers you nothing to tick.
   - First check **Business settings → Accounts → Apps** lists `AFD CRM`. If it does
     not, **Add → Add an app** (you need to be an admin of both the app and the
     business portfolio).
   - Then, with the system user selected: **Add assets → Apps** → tick `AFD CRM` →
     turn on **Manage app** → **Save changes**
   - **And add the products whose permissions you want.** A system user can only be
     granted permissions the app itself has. A new app has none of the ones here, so
     the wizard offers an empty list however the assets are assigned. In the app at
     **developers.facebook.com → AFD CRM → Add Product**, add **Marketing API** (for
     `ads_read` / `ads_management`) and **Webhooks** (for lead delivery). Then check
     **App Review → Permissions and Features** lists `leads_retrieval`,
     `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `ads_read`
     and `ads_management` — Standard Access is enough to generate a token.
4. **Add assets → Pages**
   - Tick your AFD Page
   - Turn on **Access Page**, **Create ads for the Page** and **Manage Page**
   - **Save changes**
5. **Add assets → Ad accounts** → tick your ad account → **Manage campaigns** → Save
   *(this is what makes the spend and retargeting syncs work — same token, one trip)*
6. Click **Generate new token**
   - App: `AFD CRM`
   - **Expiration: Never**
   - Permissions: `leads_retrieval`, `pages_show_list`, `pages_read_engagement`,
     `pages_manage_metadata`, `ads_read`, `ads_management`
   - **Generate token**
7. **Copy it now.** Meta shows it once and never again.

In the CRM (**Settings → Integrations → Meta**), paste that same token into **both**
**Page Access Token** and **Ads Access Token**, then Save. They are separate fields
because they are often separate tokens; one System User token that holds both sets of
permissions is allowed to be both, and is one fewer thing to renew.

**Ad Account ID**: in Ads Manager it reads `act_1234567890` — enter **only the digits**.

> If you would rather use the Graph API Explorer: **User or Page → Get User Access
> Token**, tick the four page permissions, **Generate Access Token**, then re-open that
> same dropdown and pick your Page under **Page Access Tokens** — a User token is not a
> Page token. Then extend it at **/tools/debug/accesstoken** → Debug → Extend Access
> Token, and put a reminder in your calendar for sixty days' time.
>
> The banner reading **"Facebook Login for Business requires advanced access"** is
> unrelated — it concerns using Facebook as a sign-in button for other people, which this
> CRM does not do.

### 1.4 Point Meta at the CRM

1. In your app: **Add Product → Webhooks**
2. Choose **Page** → **Subscribe to this object**
3. **Callback URL:** `https://afd-crm-one.vercel.app/api/webhooks/meta-leads`
4. **Verify Token:** the Meta password you invented in 1.2 — exactly, character for character
5. **Verify and Save**
6. In the field list, find **leadgen** and click **Subscribe**

If verification fails, the token doesn't match what you saved in the CRM. That's almost
always it.

### 1.5 Subscribe your Page — press the button in the CRM

**CRM → Settings → Integrations → Meta → "Subscribe this Page to leads".**

That is the whole step. It needs the Page Access Token saved first, and nothing else.

**Why this exists as its own step.** Meta has *two* switches for lead delivery, in two
different places:

| | Says | Where |
|---|---|---|
| 1 | "This app wants leadgen events" | App Dashboard → Webhooks → Page → `leadgen` (step 1.4) |
| 2 | "This Page sends its events to that app" | Per Page — this step |

With only the first, Meta accepts your webhook, verifies it, shows it as subscribed, and
**delivers nothing.** No error, no failed request, nothing in any log — the enquiries
simply never arrive. It is the most common reason a correctly built Lead Ads integration
produces silence, and the hardest to find precisely because everything you would think to
check looks right.

The button makes the call for you and then **reads the subscription back** to confirm it,
rather than trusting Meta's "OK" — which is exactly the reassurance that misleads people
here.

**It also fixes the wrong-token mistake rather than reporting it.** A User token and a
Page token are both opaque strings, generated two clicks apart, and indistinguishable
once pasted into a settings field — but only a Page token can subscribe a Page. Meta's
refusal is
`Object with ID '1221…' does not exist … (code 100, subcode 33)`, naming an app-scoped
user id that means nothing to the reader. So the button asks `debug_token` what kind of
token it has first, and if it is a User token it looks up the Page token through
`/me/accounts`, saves that in its place and carries on — telling you it did. With more
than one Page it lists them and stops, because picking on your behalf is not its call.

**Test connection** reports the same thing, so it is caught before you get here.

### 1.6 Spend and retargeting

Already done, if you followed 1.3 — the same System User token carries `ads_read` and
`ads_management`, and step 4 gave it the ad account. Nothing further to set up.

### 1.7 Send yourself a test lead

**First you need a lead form to exist.** The testing tool can only submit against a real
instant form, and you do not have to run an ad to make one: **Meta Business Suite → your
Page → Lead forms** (or Ads Manager → the lead form asset), create one with at least a
name and a phone number, and publish it.

Then:

1. Go to **developers.facebook.com/tools/lead-ads-testing**
2. Select your **Page**, then your **form**
3. **Preview form** to see it, then **Create lead**
4. Open the CRM's **Leads** list — it should be there within seconds

A lead created this way costs nothing, does not touch your ad budget, and is a genuine
`leadgen_id`, so it exercises the whole chain: webhook → signature → fetch → dedupe →
assignment rules.

> **You need a role on both.** An Admin or Advertiser role on the Page, and — while the
> app is in Development mode — a role on the app too. Without the second, Meta drops the
> delivery with no error anywhere.

#### If you already send these leads to a Google Sheet

Meta's **CRM Setup** on an instant form (Google Sheets, Zapier and the rest) is a
*separate* delivery path from webhooks. Connecting one does not switch off the other, and
both receive the same lead.

**Leave the sheet connected.** Run the two side by side until you trust the CRM — the
sheet is your proof that a lead existed, and the thing you compare against when one does
not appear here. Disconnect it when you have gone a week without a discrepancy, not
before.

One thing worth checking if leads reach the sheet and not the CRM: **Meta Business Suite
→ your Page → Lead Access**. That list controls which people and which partner apps may
retrieve a Page's leads, and it is maintained separately from everything in Part 1. A
Page that happily writes to a sheet can still be refusing your app.

#### Press "Preview form", not "Create lead"

The testing tool's two buttons do very different things.

- **Preview form** opens the form for you to fill in and submit. The answers are yours,
  so the lead is real all the way through and lands in the CRM.
- **Create lead** submits placeholders — every answer comes through as
  `<test lead: dummy data for phone_number>`. The lead is genuine, its id is genuine, the
  CRM fetches it successfully, and then declines to file a person under a phone number
  that is not one.

Use **Preview form**. If you press **Create lead**, Recent deliveries will say exactly
that, which is the chain working rather than failing — but you still will not get a lead
you can work with.

#### Three things that are working, even though they look like failures

**"Test" in App Dashboard → Webhooks** sends a fixed sample payload with the fake lead id
`444444444444`. It proves delivery and the signature, and then fails to fetch a lead that
does not exist. **Recent deliveries** says so in as many words; it is not a fault.

**"Create lead" in the testing tool** — as above. Delivery is proven; the contents are
not data.

**A lead that arrives but does not appear under Leads** has usually been merged into an
existing person — the CRM never rejects a duplicate, it links it (CLAUDE.md § Identity).
Search the phone number rather than scanning the top of the list.

### 1.8 Check the connection

CRM → **Settings → Integrations → Meta → Test connection**, and read **Recent deliveries**
underneath — that panel is the answer to "is anything arriving?" and says where to look
when nothing is.

---

# Part 2 — Google Ads

Google is more work than Meta. Lead delivery (2.1) is quick; the API parts take longer
because Google has to approve a developer token.

### 2.1 Lead delivery — do this first, it's five minutes

1. **Google Ads → Tools → Assets → Lead forms** (or open the lead form asset on a campaign)
2. Scroll to **Lead delivery option** → **Webhook**
3. **Webhook URL:** `https://afd-crm-one.vercel.app/api/webhooks/google-leads`
4. **Key:** the Google password you invented
5. Put that same key in the CRM: **Settings → Integrations → Google → Webhook Verify Key**. Save.
6. Back in Google Ads, click **Send test data**. It should say success.

That's leads flowing. Everything below is reporting and optimisation.

### 2.2 Developer token

1. **Google Ads** → switch to your **Manager (MCC)** account — if you don't have one, create one at ads.google.com/home/tools/manager-accounts
2. **Tools → Setup → API Center**
3. Apply for a developer token. **Basic access** is enough.
4. Approval usually takes a day or two. A *test* token won't work against live data.
5. Paste it into the CRM's **Developer Token**

### 2.3 Google Cloud OAuth

1. **console.cloud.google.com** → create a project, `AFD CRM`
2. **APIs & Services → Library** → search **Google Ads API** → **Enable**
3. **APIs & Services → OAuth consent screen** → **External** → fill in name and your email → add yourself as a **Test user**
4. **Credentials → Create credentials → OAuth client ID** → **Desktop app**
5. Copy the **Client ID** and **Client Secret** into the CRM

### 2.4 Refresh token

A one-time step that gives the CRM standing permission.

1. Go to **developers.google.com/oauthplayground**
2. Gear icon (top right) → tick **Use your own OAuth credentials** → paste your Client ID and Secret
3. Left panel → bottom box → enter `https://www.googleapis.com/auth/adwords` → **Authorize APIs**
4. Sign in with the Google account that has access to your Ads account
5. **Exchange authorization code for tokens**
6. Copy the **Refresh token** into the CRM

### 2.5 Account IDs

- **Customer ID** — top right in Google Ads, looks like `123-456-7890`. Enter **digits only**: `1234567890`
- **Manager (Login) Customer ID** — only if your account sits under an MCC. Same, digits only. Otherwise leave blank.

### 2.6 Offline conversions (the valuable one)

This is what tells Google which clicks became actual admissions, so it stops optimising
for people who fill in forms and starts optimising for people who enrol.

1. **Google Ads → Goals → Conversions → New conversion action → Import → Manual import using an API**
2. Name it `CRM Admission`
3. Set a value if you want ROAS; mark it a **Primary** action
4. Open the created action and copy its **resource name** — it looks like
   `customers/1234567890/conversionActions/987654321`
5. Paste into the CRM's **Offline Conversion Action**

### 2.7 Check it

CRM → **Settings → Integrations → Google → Test connection.**

---

## After both are connected

- **Settings → Assignment Rules** — decide who gets leads from each source. Without a rule
  they land in **Unassigned** (the red badge) rather than going to a counsellor.
- **Ad Performance** — spend, cost per lead and ROAS, once the first nightly sync has run
  (10:00 AM IST).
- **Settings → Platform Health** — where a broken token will show up. A webhook that stops
  working appears here instead of being noticed three weeks later.

## If something stops working

| Symptom | Almost always |
|---|---|
| Meta leads stop arriving | The token expired. A System User token set to Never does not; a Graph Explorer one does, every 60 days |
| Meta webhook won't verify | Verify Token doesn't match the CRM exactly |
| No leads, no errors | Page not subscribed — press **Subscribe this Page to leads** (step 1.5) |
| Google test data fails | Key doesn't match the CRM's Webhook Verify Key |
| Spend shows zero | Ads token lacks `ads_read`, or the Ad Account ID still has `act_` on it |
| Can't generate a token in the Graph API Explorer | Use the System User route in 1.3 instead — it does not need Facebook Login configured |
| "No permissions available — assign an app role to the system user" | Three causes, in this order: (1) the app has no product granting those permissions — add **Marketing API** and **Webhooks** to it; (2) the app is not an asset of the system user — **Add assets → Apps → Manage app**; (3) link it from the app side too — **Accounts → Apps → AFD CRM → Assign people** → the system user, Full control |
| Google API errors | Developer token still pending approval, or it's a test token |
| Track status sits on "Pending" | Give it a minute and press **Track status** again — it does resolve. Check **Recent deliveries** rather than this table; it is the one that knows. |
| A test lead arrives but is not created | You pressed **Create lead**, which sends placeholder text. Press **Preview form** and fill it in. |

Every failure above is recorded in **Settings → Platform Health** with the real error.
