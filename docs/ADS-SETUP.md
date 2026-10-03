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
> A Meta app starts in **Development mode**, and a development-mode app
> **does not receive real leads**. It only receives leads submitted by somebody
> who holds a role on the app — which is exactly what the Lead Ads Testing Tool
> does, so you can prove the whole chain works today.
>
> For leads from actual members of the public you need two more things:
>
> 1. **App Review** for `leads_retrieval` (submitted together with
>    `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`), which
>    moves that permission from Standard to **Advanced Access**
> 2. The app switched to **Live** mode
>
> Review takes days, sometimes longer, and usually wants Business Verification
> first. So treat it as two phases: **set it up and test it now**, submit for
> review in parallel, and switch to Live when it comes back. Do not point a live
> ad campaign at this until the app is Live — the leads are not queued anywhere,
> they are simply never delivered.
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
3. With it selected, click **Add assets → Pages**
   - Tick your AFD Page
   - Turn on **Access Page**, **Create ads for the Page** and **Manage Page**
   - **Save changes**
4. **Add assets → Ad accounts** → tick your ad account → **Manage campaigns** → Save
   *(this is what makes the spend and retargeting syncs work — same token, one trip)*
5. Click **Generate new token**
   - App: `AFD CRM`
   - **Expiration: Never**
   - Permissions: `leads_retrieval`, `pages_show_list`, `pages_read_engagement`,
     `pages_manage_metadata`, `ads_read`, `ads_management`
   - **Generate token**
6. **Copy it now.** Meta shows it once and never again.

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

### 1.5 Subscribe your Page

Still in Webhooks, under the Page object, select your AFD Page and subscribe it. A Page
that isn't subscribed sends nothing, with no error anywhere.

### 1.6 Spend and retargeting

Already done, if you followed 1.3 — the same System User token carries `ads_read` and
`ads_management`, and step 4 gave it the ad account. Nothing further to set up.

### 1.7 Check it

CRM → **Settings → Integrations → Meta → Test connection.**

Then submit a test lead through Meta's **Lead Ads Testing Tool**
(developers.facebook.com/tools/lead-ads-testing) and watch it appear under **Leads**.

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
| No leads, no errors | Page not subscribed to **leadgen** (step 1.5) |
| Google test data fails | Key doesn't match the CRM's Webhook Verify Key |
| Spend shows zero | Ads token lacks `ads_read`, or the Ad Account ID still has `act_` on it |
| Can't generate a token in the Graph API Explorer | Use the System User route in 1.3 instead — it does not need Facebook Login configured |
| Google API errors | Developer token still pending approval, or it's a test token |
| Test leads arrive, real ones never do | The Meta app is still in Development mode — it needs App Review and Live mode |

Every failure above is recorded in **Settings → Platform Health** with the real error.
