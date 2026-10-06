# Rebuilding the Meta app, from the top

One Meta app serves everything this CRM does with Meta: Lead Ads,
Instagram DMs, WhatsApp, ad spend and retargeting. This is the order to
build it in, and the way to prove each piece before moving on.

Written to be followed start to finish on an app that is already half
set up. Nothing here is destructive — re-doing a step that was already
right changes nothing.

> **Business verification is done.** That was the slow gate, and with it
> cleared, Advanced Access on most of these is granted on request rather
> than after a review queue.

---

## 0. What has to end up true

Five things, and every later section is one of them.

| # | | Proven by |
|---|---|---|
| 1 | Five products added to the app | the left sidebar |
| 2 | Three webhook objects, each with a callback URL and fields | Settings → Platform health → Inbound deliveries |
| 3 | Advanced Access on eleven permissions | App Review → Permissions and Features |
| 4 | Three tokens generated and pasted into the CRM | Settings → Integrations → Test connection |
| 5 | The Page subscribed to the app | the Subscribe button's own read-back |

**The commonest way this goes wrong is #5 looking like #2.** Subscribing
the *app* to a field and subscribing the *Page* to the app are different
switches in different places, and with only the first, Meta verifies the
webhook, reports it subscribed, and delivers nothing.

---

## 1. Products

**Add Product**, and make sure all five are present:

| Product | What it carries |
|---|---|
| **Facebook Login for Business** | Generating the Page and Ads tokens |
| **Webhooks** | The three subscriptions in §2 |
| **WhatsApp** | The institute's WhatsApp number, templates, inbound messages |
| **Instagram** | DMs |
| **Marketing API** | Ad spend, retargeting audiences, offline conversions |

> ### Check WhatsApp is actually there
>
> If **WhatsApp** is not in the sidebar, that alone explains inbound
> WhatsApp never arriving — there is no WhatsApp Business Account to
> subscribe, so Meta has nothing to call. Add it first; §2c then has
> somewhere to point.

---

## 2. Webhooks — three objects, three callback URLs

All three live under **Webhooks** in the sidebar, chosen from the object
dropdown at the top. They are separate subscriptions and none implies
another.

Replace `YOUR-CRM` with your domain (`afd-crm-one.vercel.app`).

### 2a. Page → `leadgen`

| | |
|---|---|
| Callback URL | `https://YOUR-CRM/api/webhooks/meta-leads` |
| Verify token | the value in **Settings → Integrations → Meta → Verify Token** |
| Field to subscribe | `leadgen` |

### 2b. Instagram → `messages`

| | |
|---|---|
| Callback URL | `https://YOUR-CRM/api/webhooks/instagram` |
| Verify token | **the same one** as 2a — same app, same token |
| Field to subscribe | `messages` |

### 2c. WhatsApp Business Account → `messages`

| | |
|---|---|
| Callback URL | `https://YOUR-CRM/api/webhooks/whatsapp` |
| Verify token | **Settings → Integrations → WhatsApp → Verify Token** — a *different* field from the Meta one, though you may set it to the same value |
| Field to subscribe | `messages` |

Also subscribe `smb_message_echoes`, `history` and `smb_app_state_sync`
**only** if you put a counsellor's own number on Coexistence
(`docs/WHATSAPP-SETUP.md` Part 4). Skip them otherwise.

Press **Verify and save** on each. It must go green — Meta calls the URL
immediately and will not save a URL that does not answer correctly.

> **Two app secrets, and this is where it bites.** The CRM checks every
> delivery's signature. WhatsApp reads its App Secret from
> **Settings → Integrations → WhatsApp**; Instagram and Lead Ads read a
> separate copy from **Settings → Integrations → Meta**. It is the same
> value from the same app — but setting one does not set the other, and
> a wrong one means every message is refused while the inbox simply
> stays empty.

---

## 3. Advanced Access — eleven permissions

**App Review → Permissions and Features.** Use the search box; the list
is long and several names are nearly identical.

| Permission | What stops working without it |
|---|---|
| `pages_show_list` | Listing the Pages this account manages |
| `pages_read_engagement` | Reading the Page at all |
| `pages_manage_metadata` | Subscribing the Page — nothing is delivered |
| `leads_retrieval` | Fetching a Lead Ads form's answers |
| `pages_messaging` | Receiving Instagram DMs |
| `instagram_basic` | Reading the linked Instagram account |
| `instagram_manage_messages` | Instagram DMs, in and out |
| `whatsapp_business_messaging` | Sending any WhatsApp message |
| `whatsapp_business_management` | Templates |
| `ads_read` | Ad spend sync |
| `ads_management` | Retargeting audiences |

> ### `instagram_manage_messages`, not `instagram_business_manage_messages`
>
> Meta lists both, alphabetically adjacent, one word apart. They belong
> to different integration routes:
>
> | Permission | Route | Used here |
> |---|---|---|
> | `instagram_manage_messages` | Facebook Login — a Page token against `graph.facebook.com` | **yes** |
> | `instagram_business_manage_messages` | Instagram Login — an Instagram user token against `graph.instagram.com` | no |
>
> This CRM is on the first. Requesting the second grants a permission
> nothing here uses.

**Standard Access is not enough for any of these.** With Standard, Meta
serves only people who hold a role on the app — which is why Instagram
DMs arrive from staff and from nobody else. The app being **Live** does
not substitute: both switches have to be on.

### "Request advanced access" is greyed out

Hover it. If the tooltip says a **successful test API call** is needed,
that is the real gate — look at the **API calls** column and it will read
`(0)`. Meta will not widen access to a permission the app has never
demonstrably used, and the button stays inactive for **up to 24 hours
after the first call**.

The CRM can make those calls for you; each of these buttons exercises
the permission in the course of doing its actual job:

| In the CRM | Exercises |
|---|---|
| Settings → Integrations → Meta → **Subscribe this Page** | `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata` |
| An **Instagram DM from an account that has not messaged before** | `instagram_basic`, `pages_messaging`, `instagram_manage_messages` |
| Platform health → the **hourly run** | `ads_read`, `ads_management` |
| Chats → **Templates** | `whatsapp_business_management` |
| A **WhatsApp reply** from a lead's page | `whatsapp_business_messaging` |

The Instagram one has a catch: the CRM fetches a sender's profile only
when it does not already know their username, and that fetch is the
`instagram_basic` call. A repeat message from somebody already in the
inbox will not make it.

Otherwise use the **Graph API Explorer**
(`developers.facebook.com/tools/explorer`), in this order — the order
matters, and getting it wrong produces an error that looks like the
integration is broken when it is only the Explorer being misconfigured:

1. **Meta App** → `afd CRM`.
2. **Permissions** → add the ones the call needs *before* generating a
   token. A call made with a token that does not carry the permission
   does not count toward anything. For `instagram_basic`, add
   `instagram_basic`, `pages_show_list` and `pages_read_engagement`.
3. **Generate Access Token**, and approve.
4. **User or Page** → switch to the **Page**, not User Token.
5. Run the call. For `instagram_basic`:
   `me?fields=instagram_business_account{id,username}`

> **`(#100) Tried accessing nonexisting field (instagram_business_account)
> on node type (User)`** means step 4 was missed. `me` is whoever the
> token speaks for — with a User token that is the person, and an
> Instagram account hangs off the *Page*. Either switch the dropdown, or
> keep the user token and go in two hops: `me/accounts` for the Page id,
> then `{page-id}?fields=instagram_business_account{id,username}`.

A successful response counts. Tokens from the Explorer are short-lived
and belong nowhere but the Explorer — never paste one into the CRM, and
regenerate it if it has been on screen in front of anybody.

Do all of them in one sitting and come back the next day to request
advanced access on everything at once.

### If the page renders empty

It does that. In order of likelihood: an ad blocker or privacy extension
(Meta's dashboard breaks exactly this way — try an incognito window with
extensions off); the `?business_id=…` on the URL (drop it); or something
sitting under **Required actions** or **Alerts** in the sidebar.

---

## 4. Tokens

Three different tokens, three different jobs. A Page token cannot read ad
spend and an Ads token cannot receive a DM, so "connected" is not one
yes-or-no.

| Token | Generate from | Paste into |
|---|---|---|
| **Page access token** | Graph API Explorer or Business Settings → System Users, with the Page permissions from §3 | Settings → Integrations → Meta → Page Access Token |
| **Ads access token** | same, with `ads_read` + `ads_management` | Settings → Integrations → Meta → Ads Access Token |
| **WhatsApp access token** | Business Settings → System Users, with `whatsapp_business_messaging` + `whatsapp_business_management` | Settings → Integrations → WhatsApp → Access Token |

Prefer a **System User** token for all three: a token tied to a person
dies when that person's password changes or they leave.

Also needed, all from the dashboard:

- **App ID** and **App Secret** → Settings → Integrations → Meta (and the
  same App Secret again under WhatsApp — see §2)
- **Ad Account ID**, numeric, without the `act_` prefix
- **Instagram Account ID** → Settings → Integrations → Meta
- **Phone Number ID** and **WhatsApp Business Account ID** → Settings →
  Integrations → WhatsApp

### Prove each one

**Settings → Integrations → Meta → Test connection** reads each token
back from Meta and now names the permissions it is missing, in
consequences:

> Page Access Token: valid, never expires. Missing: Instagram DMs, in and
> out (instagram_manage_messages).

A *missing* permission there is definitive. A permission that is present
still does not say whether it has Standard or Advanced access — which is
the whole difference between staff DMs and student DMs — so a clean
result means "nothing is absent", not "everything works".

---

## 5. Subscribe the Page to the app

**Settings → Integrations → Meta → Subscribe this Page.**

This is the switch that is not in Meta's dashboard, and the one whose
absence is invisible: §2a tells Meta *the app wants `leadgen` events*,
this tells it *this Page sends its events to that app*. Both are
required. The button reads the subscription back afterwards and prints
what Meta actually recorded, rather than trusting its own request.

If it reports that Meta refused `messages`, that is `pages_messaging`
missing from §3 — it subscribes `leadgen` alone instead and says so,
rather than silently subscribing nothing.

---

## 6. The order, and what to check after each step

1. **Products** (§1) — two minutes. Confirm WhatsApp is among them.
2. **App settings → Basic** — App ID, App Secret, privacy policy and
   terms URLs, icon, data deletion URL.
3. **Advanced Access** (§3) — request all eleven in one go. With business
   verification done, most are immediate.
4. **Tokens** (§4) → paste into the CRM → **Test connection** on both
   screens. Do not continue until each reports valid with nothing
   missing.
5. **Webhooks** (§2) — all three. Each must verify green.
6. **Subscribe the Page** (§5).
7. **Send yourself a test** — a WhatsApp message to the institute's
   number, an Instagram DM from an account with no role on the app, and a
   test lead from Meta's Lead Ads Testing Tool.
8. **Settings → Platform health → Inbound deliveries** — all three
   sources should show deliveries, with **zero rejected**.

That last screen is the whole verification. It distinguishes the three
states an empty inbox cannot:

| What it shows | What it means |
|---|---|
| Nothing received | Meta is not calling — §2, callback URL or fields |
| Received, some **rejected** | Meta is calling and being refused — the App Secret, §2 |
| Received, none rejected | Messages are in; look at the inbox filter or the registered number |

---

## Where the feature-level detail lives

This document is the app itself. The two that build on it:

- **`docs/WHATSAPP-SETUP.md`** — registering the number, templates,
  Coexistence, Instagram DMs in depth
- **`docs/ADS-SETUP.md`** — Lead Ads forms, ad spend, retargeting
  audiences, and the Google side
