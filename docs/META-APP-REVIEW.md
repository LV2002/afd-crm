# App Review: what to write and what to record

Every permission in the submission asks for much the same things — a
description, a screencast, an agreement tick, and for some of them a set
of instructions a reviewer can follow themselves. This has the text to
paste for each, what each recording has to show, and the reproduction
steps for the one permission that asks for them.

---

## The framing that decides the outcome

**This app is used by one business, on its own assets, by its own staff.**
AFD India is not offering a platform to other institutes; the app reads
and writes AFD's own Facebook Page, its own Instagram account, its own
WhatsApp number and its own ad account, and the only people who can log
in are AFD's employees.

Say that. Reviewers are mostly screening for apps that take other
people's data to somewhere unaccountable, and an internal tool on
first-party assets is a category they approve readily — but only if they
can tell that is what they are looking at. Every description below opens
by establishing it.

**Write plainly.** "Our counsellors reply to student enquiries" lands
better than "the application facilitates omnichannel engagement".

---

## The screencasts

Meta wants to see the permission doing its job inside the product, not a
slide about it. A few practical points:

- **One recording can cover several permissions.** A single clip of a
  lead arriving from an ad, a counsellor opening it, replying on
  WhatsApp and the reply landing in the inbox covers five of these.
  Upload the same file against each; that is expected.
- **Twenty to sixty seconds each.** Longer gets skimmed.
- **Show the browser.** The CRM's URL bar being visible helps a reviewer
  place what they are watching.
- **Narrate with on-screen actions, not a voice track.** Click
  deliberately and pause on the result.
- **Use real-looking but not real data.** Reviewers see these; a genuine
  student's name and phone number should not be in them. Make one test
  lead called something obviously invented, with your own number.

### Test credentials

The submission asks for a login. **Do not give a reviewer an admin
account on the live CRM** — it holds every student's phone number.

Create a user in **Settings → Users** with the **counsellor** role,
assign it to one centre, name it something like `Meta Reviewer`, and
give those credentials. A counsellor sees masked phone numbers in lists
and only their own centre's leads, which is enough to verify every flow
below and not enough to walk away with a database. Deactivate it when
the review closes.

---

## What to record: five clips, eleven permissions

One recording can carry several permissions, and uploading the same file
against each is expected rather than a shortcut. Eleven permissions come
down to five clips.

Two of them can be made today. Three cannot be made until Meta is
actually calling the CRM's webhook — there is no way to film a message
arriving if no message arrives, and no amount of re-recording gets round
it. Check **Settings → Integrations → WhatsApp → Recent deliveries** and
the same panel on the Meta screen before planning a recording session:
empty means the `messages` and `leadgen` field subscriptions are not on,
and clips C, D and E are all blocked on that one setting.

### Clip A — the Page connection · today

Covers `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`.

Settings → Integrations → Meta. Scroll to **Page subscription**, press
**Subscribe this Page**, and hold on the result:
`"AFD India" is subscribed and will send leads here. Instagram DMs
linked to this Page will arrive too.`

That one sentence is all three permissions — the Page list read, the
Page's own name read back, the subscription written. Twenty seconds.

### Clip B — the ad account · today

Covers `ads_read`, `ads_management`. Four shots, in the order under
"Recording the ads_management screencast" below.

### Clip C — WhatsApp · needs inbound working

Covers `whatsapp_business_messaging`, `whatsapp_business_management`.
Four shots, under "Recording the whatsapp_business_messaging
screencast" below. The test number is fine for this.

### Clip D — Instagram · needs inbound working

Covers `pages_messaging`, `instagram_basic`, `instagram_manage_messages`.

1. On the phone, DM the institute's Instagram account.
2. CRM → Chats → **Instagram**. The conversation appears, labelled with
   the sender's handle — that handle is `instagram_basic` doing its job,
   so pause on it rather than clicking straight through.
3. Open it, reply, show the reply in the thread.
4. Cut to the phone showing the reply arrive.

### Clip E — a lead arriving · needs inbound working

Covers `leads_retrieval`.

Submit a test lead through Meta's **Lead Ads Testing Tool**, then cut to
the CRM's Leads list with the new row at the top, and open it so the
answers from the form are visible on the lead's page. The point to make
is that the CRM holds the student's actual answers, not just a
notification that somebody enquired.

### What you do not have to record

Nothing for `whatsapp_business_management` beyond picking a template in
clip C, and nothing separate for `ads_read`. Both ride other clips.

---

## Reproduction instructions

Some permissions ask for a screencast _and_ "instructions for how to
reproduce this feature" — a numbered path a reviewer can follow
themselves, in the product, with the test login. It is a separate box
from the description and a separate tick; a permission can be four
ticks green and still be held up by this one.

Two rules make the difference between a pass and a rejection:

- **Name the screens by the words on them.** "Chats → Instagram" is
  followable; "the messaging module" is not. Use the labels in the
  left-hand navigation as they actually read.
- **Say what should happen at each step**, so the reviewer can tell
  whether it worked. A step that just says "click Send" leaves them
  guessing what they were meant to see.

### `pages_messaging` — paste this

Replace the handle, and check the URL still matches where the CRM is
deployed.

> Our CRM is at https://afd-crm-one.vercel.app. Sign in with the test
> credentials supplied with this submission — a counsellor account,
> which is the role our sales staff use.
>
> 1. Open https://afd-crm-one.vercel.app and sign in with those
>    credentials.
> 2. From your own Instagram account, send a direct message to
>    @YOUR_HANDLE — our Instagram professional account, which is linked
>    to the Facebook Page in this submission. For example: "Hi, what are
>    the fees for the NID foundation course?"
> 3. In the CRM, click **Chats** in the left-hand navigation, then the
>    **Instagram** tab. Your message appears at the top of the
>    conversation list within a few seconds, labelled with the sender's
>    Instagram handle and marked as awaiting a reply.
> 4. Click that conversation. The full thread opens on the right.
> 5. Type a reply in the box at the bottom and press **Send**. It is
>    delivered using our Page access token, and appears in the thread
>    marked as sent by the counsellor.
> 6. Check the Instagram account you messaged from — the counsellor's
>    reply has arrived there.
>
> Note on access level: while this app holds Standard Access, Meta only
> delivers messages from accounts that have a role on the app, so a
> message sent from an account without one may not arrive at step 3. If
> you would like to reproduce this live, tell us which Instagram or
> Facebook account you will use and we will add it as a tester the same
> day. The screencast attached to this permission shows the whole flow
> end to end on our own account.

That last paragraph is not an excuse, it is the actual constraint, and
saying it plainly is better than a reviewer following the steps, seeing
nothing arrive, and rejecting the permission as not reproducible.

**Before pasting this, check the webhook is live.** Settings →
Integrations → Meta, the **Instagram DMs** panel: if "Recent deliveries"
is empty, Meta has never called this CRM and nothing a reviewer does at
step 2 will appear at step 3. Send yourself a DM and confirm it lands
first. The same panel on that screen says what to check if it does not.

---

## The "required API test calls" tick

Three permissions ask for this as well as a description and a
screencast: `whatsapp_business_messaging`, and anything else Meta has
decided it can verify automatically. It means what it says — Meta wants
to see that this app has actually called the endpoint the permission
governs, recently, and it ticks the box itself when it finds one.

For `whatsapp_business_messaging` the endpoint is
`POST /{phone_number_id}/messages`. Two things reach it:

- **WhatsApp → API setup → Send message** in the App Dashboard. The
  green "Test message successfully sent" toast means the call went
  through.
- **The CRM itself.** `src/lib/integrations/whatsapp/client.ts` posts to
  exactly that node with whatever Phone Number ID and token are saved in
  Settings → Integrations → WhatsApp, so a counsellor replying from
  Chats → Inbox is the same API call made by the same app. A test
  number's credentials count here as much as a live number's.

**The tick is not immediate.** It is a background check, not a response
to the call, so a successful send and a still-grey tick at the same
moment means nothing is wrong. Reload the submission page after a few
hours before concluding anything.

If it is still grey a day later, one suspect is the **From** number:
Meta's `+1 555 …` test number is a shared sandbox asset, and a call on
it is not always attributed back to the app. The other is that one call
is simply not enough to be noticed. Both have the same answer — make the
call from the CRM instead of the console, by saving the same Phone
Number ID in Settings → Integrations → WhatsApp and replying to a thread
in Chats. A reply to somebody who messaged first needs no template and
no approval, and it is the app itself calling the endpoint rather than
Meta's own console doing it on the app's behalf.

Remember that the console's token is temporary and visible on screen.
Do not screenshot that page, and regenerate the token if you have.

---

## Recording the `whatsapp_business_messaging` screencast

**There is no WhatsApp composer on a lead's page.** It was removed in
September 2026; messaging lives in **Chats → Inbox**, and that inbox is
reactive — a thread exists because somebody messaged the number. So the
clip has to start on the phone, not in the CRM.

**A test number is fine for this.** Meta expects an app in review to
demonstrate with the access it has, and nothing in the CRM's screens
names the WhatsApp number, so the clip claims nothing it is not. Do not
film the WhatsApp → API setup console: it shows the test number and the
access token in plain text.

### Setting up before you record

1. **Credentials** — Settings → Integrations → WhatsApp: the test
   number's Phone Number ID and a token. The console's token lasts 24
   hours, so record the same day you paste it.
2. **The webhook** — the inbound half has to work or nothing reaches the
   inbox. Same screen, **Recent deliveries**: it must not be empty. If
   it is, the callback URL and verify token under WhatsApp →
   Configuration are not set, or the `messages` field is not subscribed.
3. **A lead holding your number** — Leads → New, an obviously invented
   name, your own phone number. This is not optional: a reply from a
   number with no lead lands in **Not in the CRM**, which has no send box
   at all, and the clip stops dead at shot 2. A test number can only
   exchange messages with its pre-verified recipients, so use one of
   those.

### The four shots

Thirty to forty-five seconds. The point to make is that every message
goes to somebody who contacted the institute first, and that the person
can stop it — reviewers are screening for unsolicited messaging, so show
the opposite happening.

1. **They message first** — on the phone, send a WhatsApp to the
   business number: "Hi, what are the fees for the NID foundation
   course?" This shot is the whole argument; without it a reviewer is
   watching an outbound message to a stranger.
2. **It arrives** — CRM, Chats → Inbox. The thread appears under the
   invented lead's name, marked as awaiting a reply. Pause on it.
3. **The counsellor replies** — open the thread, type, send, and show it
   in the thread. This is the free-form reply inside the 24-hour window
   that shot 1 opened.
4. **The way out** — Chats → Opted out, pausing on the list. That is the
   suppression list the CRM keeps and honours, and it is the single most
   useful thing to put in front of someone checking for spam.

Same file can go against `whatsapp_business_management` if shot 3 is
done by picking an approved template from the list rather than typing
free text — the template list being read is what that permission does.

---

## Recording the `ads_management` screencast

This is the one permission whose screens a counsellor cannot reach —
Ad Performance needs organisation-wide report access and the retargeting
settings need `settings.manage` — so record it from your own admin
account. That is fine: the screencast is yours to make, and only the
_login_ handed to the reviewer has to be the limited one.

Forty to sixty seconds, no voice track, browser window with the URL bar
visible. Four shots, in this order:

1. **What it is for** — `/settings/integrations/meta`. Pause two seconds
   on the heading and the paragraph beneath it, which names the Custom
   Audience and says consent is honoured. A reviewer reading that knows
   what they are about to watch.
2. **The audience setting** — `/settings/integrations`, the retargeting
   section. Show "Keep leads in the audience for 180 days", change the
   number, press **Save**, and let the confirmation appear.
3. **The sync having run** — `/settings/health`, the **Scheduled work**
   panel. Scroll to **Meta retargeting audience** and pause on its
   result line, which reads like "ok, 412 added". That is the Custom
   Audience being written, which is the first half of what the
   permission is for.
4. **The conversions coming back** — `/marketing`, the **Ad Performance**
   screen. Pause on a campaign row showing spend next to leads and
   admissions. That is the offline-conversion upload doing its job:
   reporting against actual admissions rather than form fills.

Two things to get right:

- **Do not press "Run tonight's jobs now" to make shot 3 happen.** It is
  a real run — queued broadcasts go out and fee reminders are sent. Show
  the result of the run that already happened this morning instead.
- **Invented data only.** Shot 4 is a campaign report, so no student
  names appear, but if you open anything with a person in it, use the
  test lead with your own number.

Export as MP4. Upload the same file against `ads_read` as well — it
shows that permission doing its job too, and one clip covering both is
expected.

---

## The text, permission by permission

Paste into "Describe how your app uses this permission or feature".

### `pages_show_list`

> AFD India is a design and architecture entrance-exam coaching institute
> with two centres in Kerala. This app is our own internal CRM, used only
> by our employees, and it works only with our own business assets.
>
> Setting the integration up means saving a Page Access Token. Meta's own
> interface makes it easy to copy a User token by mistake instead, and
> the two are indistinguishable once pasted. We use pages_show_list so
> that when the administrator presses "Subscribe this Page", the CRM can
> read the list of Pages that token manages, tell them plainly that they
> have saved the wrong kind of token, and name our Page so they can
> correct it. It is used during setup only, on a settings screen only
> administrators can open.

**Screencast:** Settings → Integrations → Meta, pressing **Subscribe this
Page**, and the result naming the Page.

This description was rewritten in October 2026. The earlier one said an
administrator "can pick our institute's Facebook Page from a list" —
there is no such picker, and never was. `fetchMetaPagesForUser()` is
called from one place only (`settings/integrations/meta/actions.ts`), as
the recovery path when `debug_token` reports the saved token is a USER
token. Describing a screen that does not exist is the surest rejection
there is.

### `pages_read_engagement`

> This app is AFD India's own internal CRM, used only by our employees on
> our own Facebook Page.
>
> We use pages_read_engagement to read the Page's own details — its name
> and id — so the CRM can confirm it is connected to the right Page and
> show that to the administrator, and so the lead and messaging
> integrations know which Page they are working with.

**Screencast:** the same **Subscribe this Page** press — its success
message reads `"AFD India" is subscribed and will send leads here`, and
that name came from reading the Page node with this permission. One clip
covers this, `pages_show_list` and `pages_manage_metadata`.

Note that **Test connection** is not the clip: it calls `debug_token`,
which is about the token, not the Page.

### `pages_manage_metadata`

> This app is AFD India's own internal CRM, used only by our employees on
> our own Facebook Page.
>
> We use pages_manage_metadata to subscribe our Page to our app's
> webhook, so that lead form submissions and Instagram messages are
> delivered to the CRM. The administrator presses one button in the CRM's
> settings to do this; the app does not change any other Page setting.

**Screencast:** pressing **Subscribe this Page** in Settings →
Integrations → Meta, and the confirmation showing which fields are now
subscribed.

### `leads_retrieval`

> This app is AFD India's own internal CRM, used only by our employees.
> We run Facebook and Instagram lead ads for our own courses.
>
> When somebody submits one of our lead forms, Meta sends us a webhook
> with a leadgen id. We use leads_retrieval to fetch that submission's
> answers — the student's name, phone number, which exam they are
> preparing for — and create the enquiry in our CRM so a counsellor can
> call them back. Without it we receive a notification that someone
> enquired and no way to know who.

**Screencast:** submit a test lead through Meta's Lead Ads Testing Tool,
then show it appearing in the CRM's Leads list with its answers filled
in.

### `pages_messaging`

> This app is AFD India's own internal CRM, used only by our employees on
> our own Facebook Page and the Instagram account linked to it.
>
> We use pages_messaging to receive messages sent to us — mainly
> Instagram DMs from prospective students asking about courses and fees —
> so they appear in the CRM alongside that person's other enquiries, and
> the counsellor who owns the lead can answer. Messages are only ever
> sent in reply to someone who messaged us first.

**Screencast:** a DM sent to the institute's Instagram account appearing
in the CRM's Chats → Instagram inbox, and a counsellor replying from
there.

**Reproduction instructions:** this permission asks for them as a fourth
item. The text to paste is under "Reproduction instructions" above.

### `instagram_basic`

> This app is AFD India's own internal CRM, used only by our employees
> with our own Instagram professional account, which is linked to our own
> Facebook Page.
>
> We use instagram_basic to read that account — its id and username — so
> the CRM knows which Instagram account it is connected to, and so a
> message arriving from a student can be shown with the sender's handle
> rather than an anonymous numeric id.

**Screencast:** the Instagram inbox in the CRM showing conversations
labelled with the sender's handle.

### `instagram_manage_messages`

> This app is AFD India's own internal CRM, used only by our employees
> with our own Instagram professional account.
>
> Prospective students message our Instagram account to ask about
> courses, fees and batch timings. We use instagram_manage_messages to
> read those messages into the CRM so they sit with the rest of that
> person's history, and to send our counsellor's reply back, within
> Instagram's 24-hour window. We do not send unsolicited messages.

**Screencast:** the same clip as pages_messaging — a student's DM
arriving and a counsellor replying from inside the CRM.

### `whatsapp_business_messaging`

> This app is AFD India's own internal CRM, used only by our employees
> with our own WhatsApp Business number.
>
> We use whatsapp_business_messaging to continue conversations students
> start with us, and to send approved template messages to students who
> have given us their number when enquiring about a course — fee
> reminders, batch start dates, and answers to their questions. Everyone
> we message has contacted us about studying with us, and every message
> includes a way to opt out, which the CRM records and honours
> permanently.

**Screencast:** a counsellor replying from Chats → Inbox and the message
arriving on a phone — show both. Shot list under "Recording the
whatsapp_business_messaging screencast" above.

**API test calls:** this permission wants them too. See "The required
API test calls tick" above.

### `whatsapp_business_management`

> This app is AFD India's own internal CRM, used only by our employees
> with our own WhatsApp Business account.
>
> We use whatsapp_business_management to read and manage our own message
> templates from inside the CRM, so staff can see which templates are
> approved before choosing one to send, rather than switching to the
> WhatsApp Manager to check.

**Screencast:** Chats → Templates in the CRM listing the templates with
their approval status.

### `ads_read`

> This app is AFD India's own internal CRM, used only by our employees
> with our own ad account.
>
> We use ads_read to pull our own daily ad spend per campaign into the
> CRM, so we can see what each campaign cost against the enquiries and
> admissions it produced. We only ever read our own ad account.

**Screencast:** the CRM's Ad Performance screen showing spend per
campaign next to leads and admissions.

### `ads_management`

> This app is AFD India's own internal CRM, used only by our employees
> with our own ad account.
>
> We use ads_management for two things on our own ad account: keeping a
> Custom Audience up to date with the people who have enquired with us,
> so we can show them our own ads; and uploading offline conversions when
> an enquiry becomes a paying student, so our ad reporting reflects
> actual admissions rather than form fills. We do not create, edit or
> spend on campaigns from this app.

**Screencast:** the CRM's retargeting settings showing the audience being
synced, and the Ad Performance screen showing admissions attributed to a
campaign. The shot-by-shot list is under "Recording the ads_management
screencast" above.

---

## Before pressing Submit

- Every permission has all of its ticks — most want three, and
  `pages_messaging` wants a fourth: reproduction instructions.
- The screencasts show the CRM, not a diagram.
- Test credentials are the limited counsellor account, not an admin.
- The app is **Live**, not in Development.
- Business verification is complete.

## If something is rejected

The rejection names the permission and usually the reason, and it is
almost always one of three: the screencast did not show the permission
being used, the description was abstract, or the reviewer could not sign
in. Fix that one and resubmit — a rejection on one permission does not
affect the ones already approved.

Resubmission is not penalised. It is normal to go round twice.
