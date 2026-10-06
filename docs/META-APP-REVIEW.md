# App Review: what to write and what to record

Every permission in the submission asks the same three things — a
description, a screencast, and an agreement tick. This has the text to
paste for each, and what each recording has to show.

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

## The text, permission by permission

Paste into "Describe how your app uses this permission or feature".

### `pages_show_list`

> AFD India is a design and architecture entrance-exam coaching institute
> with two centres in Kerala. This app is our own internal CRM, used only
> by our employees, and it works only with our own business assets.
>
> We use pages_show_list so an administrator setting up the integration
> can pick our institute's Facebook Page from a list of the Pages they
> manage, instead of typing a Page ID by hand. It is used once during
> setup, on a settings screen only administrators can open.

**Screencast:** Settings → Integrations → Meta, pressing the button that
lists the Pages, and the Page being selected.

### `pages_read_engagement`

> This app is AFD India's own internal CRM, used only by our employees on
> our own Facebook Page.
>
> We use pages_read_engagement to read the Page's own details — its name
> and id — so the CRM can confirm it is connected to the right Page and
> show that to the administrator, and so the lead and messaging
> integrations know which Page they are working with.

**Screencast:** the same setup screen, showing the connected Page's name
read back after connecting.

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

**Screencast:** a counsellor sending a WhatsApp reply from a lead's page
in the CRM and it arriving on a phone — show both.

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
campaign.

---

## Before pressing Submit

- Every permission has its three ticks.
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
