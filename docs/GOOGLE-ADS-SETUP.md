# Google Ads: making form submissions and ad spend line up

**The situation.** Google Ads sends people to a landing page. The page has
its own form. A submission is marked as a conversion in Google Ads. That
form is used by nothing else, so every lead from it came from Google.

**What you want.** Those submissions in the CRM, sitting against what the
campaign cost, in the reports.

**What was missing.** One field. The rest was already built.

---

## How the pieces fit

```
Google Ads  ──click──▶  landing page  ──form POST──▶  CRM
    ▲                   (carries gclid                 │
    │                    + campaign id)                │
    │                                                  ▼
    └────── offline conversion ◀──── student actually pays
            (the admission, not the form fill)
```

Three separate things, and it is worth keeping them straight:

| | What it is | Where it happens |
|---|---|---|
| **Conversion tag** | Your existing one. Fires when the form is submitted. | The landing page |
| **Attribution** | The lead arrives in the CRM knowing which campaign and click produced it | The form POST |
| **Offline conversion** | The CRM tells Google which of those leads became a *paying student*, and for how much | Nightly, automatic |

The third is the one most institutes never get to, and it is the one that
changes how Google spends your money. More on it below.

---

## Step 1 — Turn on auto-tagging

**Google Ads → Admin → Account settings → Auto-tagging → on.**

This appends `gclid` to every click's landing-page URL. Without it there
is no click id, and the offline conversions in Step 4 cannot work at all.

## Step 2 — Add a Final URL suffix

**Google Ads → Admin → Account settings → Final URL suffix**, paste:

```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}
```

`{campaignid}` and `{creative}` are ValueTrack parameters — Google replaces
them with the **numeric** campaign and ad ids at click time.

> **The numbers matter, not the names.** Google reports what it charged
> against numeric campaign ids. If you put `utm_campaign=Brand-Search`
> there instead, the CRM will not match it to any spend, and the report
> would show a campaign with leads and no spend sitting next to one with
> spend and no leads — the same money counted twice. The CRM therefore
> **ignores** a campaign name and only accepts a numeric id. A blank is
> obviously missing; a wrong row looks like an answer.

Set it at account level and every campaign inherits it.

## Step 3 — Make the landing page pass it all on

The page has to carry the query string into the form submission. Add
hidden fields and fill them from the URL:

```html
<form id="enquiry" method="post">
  <!-- your real fields -->
  <input type="text"  name="name"  required>
  <input type="tel"   name="phone" required>

  <!-- attribution: filled in by the script below -->
  <input type="hidden" name="gclid">
  <input type="hidden" name="utm_source">
  <input type="hidden" name="utm_medium">
  <input type="hidden" name="utm_campaign">
  <input type="hidden" name="utm_content">
  <input type="hidden" name="utm_term">
</form>

<script>
  // Remembered for the session, because somebody may browse to another
  // page before coming back to the form — at which point the query
  // string is gone and the lead would arrive unattributed.
  (function () {
    var params = new URLSearchParams(location.search);
    ["gclid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
      .forEach(function (key) {
        var value = params.get(key);
        if (value) sessionStorage.setItem(key, value);
        var field = document.querySelector('[name="' + key + '"]');
        if (field) field.value = value || sessionStorage.getItem(key) || "";
      });
  })();
</script>
```

Then POST the form to the CRM's endpoint. Create one in
**Settings → Integrations → Webhooks** (it gives you a URL and a signing
secret) and post JSON to it — the CRM recognises `name`, `phone`, `email`,
`city` and most spellings of them, and keeps everything else on the
enquiry regardless.

**Keep your existing Google Ads conversion tag firing too.** It is the
fast signal that tells Google the ad worked at all; nothing here replaces
it.

## Step 4 — Let the CRM tell Google who actually paid

Already built, already running on the hourly and daily schedules. Nothing
to configure beyond connecting Google Ads in
**Settings → Integrations → Google**.

What it does: when a lead from a Google click becomes an admission **that
has cleared its first payment**, the CRM uploads an offline conversion to
Google Ads against that click's `gclid`, with the actual fee as the value.

Why it is worth more than the form-fill tag: a form fill tells Google that
somebody typed their number in. An offline conversion tells it which
clicks turned into ₹40,000 of fees. Smart Bidding optimises toward
whatever you report — so with only the form tag, Google chases form
fillers; with this, it chases students.

Set it up in Google Ads as a **separate conversion action**, imported from
clicks, so the two never double-count:

**Tools → Conversions → New → Import → Other data sources → Track
conversions from clicks.** Name it something like *Admission (paid)*,
count **One**, and set its value to **Use the value from the upload**.

Then decide which ones bid: usually *Admission (paid)* as the primary
conversion action and the form fill as a **secondary** (observed only).
That is the setting that actually changes where your budget goes.

---

## What you get

**Ad Performance** (in the CRM) — spend, leads, admissions, cost per lead
and cost per admission per campaign, Google and Meta side by side.

**Insights** — any report sliced by campaign, because the lead carries the
campaign id from its first enquiry onward.

**In Google Ads** — form fills as they happen, and paid admissions with
real rupee values a few days later.

### The gap you should expect

Google counts a conversion against the **click's** date; the CRM counts an
admission against the **day it was paid**. A student who clicked in June
and paid in August appears in June in Google and in August in the CRM.
Neither is wrong. Compare *trends* between the two, not *numbers*, and use
the CRM's figures when the question is "did we make money".

---

## When it does not seem to work

**A campaign shows spend but no leads.** The landing page is not sending
`utm_campaign`, or is sending a name rather than `{campaignid}`. Open a
lead that came from that campaign and look at its enquiry attribution —
the raw payload is kept on it.

**Leads arrive but with no campaign at all.** The hidden fields are empty.
Usually the script runs before the fields exist — put it at the end of the
body — or the person navigated away and back, which the `sessionStorage`
above is there to survive.

There is a second route if the hidden fields are more trouble than they
are worth: have the form post the **page address it was submitted from**,
query string included, under any of `page`, `page_url`, `url` or
`referrer`. The CRM reads `utm_*`, `gclid` and `fbclid` out of it, and
merges them with any hidden fields that did arrive — field wins where
both have the same parameter. That is often the quicker fix for a form
builder or course platform with no way to run a script at all.

**No offline conversions are uploading.** *Settings → Platform health →
Daily* lists the job and its reason. `nothing to do: not-configured` means
the Google Ads credentials are missing, not that the job is broken. The
upload also needs the click to be **within 90 days** — Google rejects
older ones, which is why the CRM attributes to the *first* Google click
rather than the most recent.
