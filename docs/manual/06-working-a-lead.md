# Chapter 6 — Working a lead

The lead's own page is where most of the day happens. Open it by clicking
a name anywhere in the system.

## 6.1 What is on the page

**At the top**: the student's name, their lead number (`Lead #124`), and
badges for the assigned counsellor and centre.

**Under that**: the **status bar** — stage on the left, temperature on the
right — and the tag strip.

### Changing stage and temperature

Both are changed here, on the lead's own page, while you are still looking
at it. Pick a stage from the dropdown; tap a temperature. Each saves on its
own the moment you choose it, with no Save button, and a small *Saved*
appears beside them.

**They are two separate things and neither follows the other.** The stage
is where the student is in the funnel; the temperature is how likely you
think they are to join. A lead can be **Hot** at *Demo Scheduled* and
**Cold** at *Payment Pending*, and both are perfectly normal. That is the
whole point of having two.

Tapping the temperature you are already on clears it, which hands the lead
back to the automatic rules.

Moving to a stage that needs a reason — **Lost**, normally — asks for the
reason before it moves, not after.

> **Temperature you set beats the overnight recalculation**, for a few days
> (an admin sets how many). You have just spoken to them; the rules have
> not.

The rest of the page is in two halves, and the line between them is the
admission.

### The top half — winning them

**Left (the wide column)**: the lead's details, grouped into sections
(Personal, Education, Preferences, Tracking…). You edit them here, in
place.

**Right (the narrow column)**, from top to bottom:
- **Log an interaction** — first, because it is the thing you do most
- **Tasks**
- **Sent us N people** — who this person referred, if any

### The bottom half — once they are joining

**Left (the wide column)**: **Student profile form**, then **Fees &
instalment agreement**.

**Right (the narrow column)**: **Confirm admission** — or, once it is
confirmed, the admission summary and the controls for changing course or
batch.

**Below, full width**: **Documents** and the **Timeline**.

Panels you do not have permission for simply are not there.

[Screenshot: A lead detail page with all panels visible]

## 6.2 Logging an interaction

This is the habit the whole system depends on. If a call is not logged, it
did not happen.

### Goal
Record a conversation and book the next one.

### Before you start
`interaction.create`.

### Steps
1. Open the lead.
2. Find **Log an interaction** on the right.
3. **Type** — Call, WhatsApp, Email, SMS, Walk-in, Meeting or Note.
4. **Outcome** — Connected, Not Reachable, Call Back Later, Interested,
   Not Interested, Demo Scheduled or Converted.
5. **Notes** — what was actually said. Write for the colleague who picks
   this up when you are on leave.
6. **Next action** — what happens next.
7. **Next follow-up** — the date and time. **Set this.**
8. Save.

### What you should see
The entry appears at the top of the **Timeline** with your name and the
time. The lead's next follow-up date updates, and the lead appears in
your Dashboard queue on that date.

### Common mistakes and fixes
- **No next follow-up.** The lead silently drops off everybody's queue.
  The only leads that should have no next step are won, lost or parked.
- **Notes like "called".** Useless in three weeks. Say what they wanted
  and what is blocking them.
- **Logging an interaction instead of moving the stage.** They are
  different: the interaction is the conversation, the stage is where the
  lead now sits. Usually you do both.

### Related
- 6.3 Tasks, for work that is not a conversation

## 6.3 Tasks

Smaller than a follow-up: "send the brochure", "collect the 10th
certificate".

### Procedure: add and complete a task
1. Open the lead and find the **Tasks** panel.
2. Type into the box marked *New task…*
3. Press **Add**.
4. When it is finished, press **Done** on that task.

Task due dates feed the **Overdue** bucket of your Dashboard queue, the
same as follow-ups.

## 6.4 Revealing a phone number


**On the lead's own page the numbers are simply there**, in boxes you can
type in. Revealing is for the **list**, where two hundred numbers on one
screen is the thing worth being careful about. One lead you are working
is not.

**Chat** opens that lead's conversation in **Chats**, inside the CRM —
not WhatsApp Web in another tab. Everything said there is on the lead's
record and the rest of the office can see it.

**Call** opens your phone's dialler with the number in it.

Somebody **without** permission to see full numbers sees `+91 98••••3456`
on the lead's page too, and cannot type in it. That is done before the
page is sent, so the number is not in the page at all.

If a lead has never messaged the institute's WhatsApp number, Chat says
so and offers the way back. You cannot write to them first from here —
WhatsApp only allows a free-form message within 24 hours of theirs, which
is Meta's rule, not the CRM's. Message them from the WhatsApp Business
app on your phone and the conversation appears here once they reply.

### Goal
See a lead's full number so you can ring them.

### Before you start
`lead.reveal_phone`. Counsellors, centre heads and accounts have it as
shipped.

### Steps
1. Open the lead.
2. The phone shows masked, as `+91 98••••3456`.
3. Click it to reveal.

### What you should see
The full number. **This is recorded** — who revealed which number, and
when.

### Why it works this way
Lists never show full numbers, to anybody. Counsellors move on and
databases walk out of the door with them; a masked list cannot be
screenshotted into a competitor's CRM. Revealing one number at a time
for a call you are about to make is normal and nobody minds. Revealing
four hundred in an afternoon shows up in the audit log.

## 6.5 Editing lead details

### Goal
Correct or complete the information on a lead.

### Before you start
`lead.update`.

### Steps
1. Open the lead.
2. Edit the fields in the left-hand column.
3. Save.

### What you should see
The values update, and the change is written to the audit log.

### Notes and edge cases
- **The fields are not fixed.** They come from Settings → Custom Fields,
  so an administrator can add a question without any code change.
  Anything they add appears here automatically.
- **Required fields** are marked. You cannot save without them.
- **Editing after an admission is confirmed.** The lead's sales details
  stop mattering at that point — the admission holds the course, fee and
  mode that were actually agreed. Changing the lead's "courses interested"
  afterwards does not change the admission, and that separation is
  deliberate (Chapter 7).
- **Some fields you cannot set.** Stage, temperature, owner and centre are
  changed through their own actions, not as free text.
- **Phone numbers are ordinary boxes** on the lead's page. The permission
  that lets you see a full number is the one that lets you change it —
  you cannot sensibly overwrite a value you are not allowed to read.
- **Changing the primary phone moves the lead's identity with it.** That
  number is what every form, ad and import is matched against, so
  correcting a typo also corrects what future enquiries from that person
  attach to. If the number you type already belongs to another lead, the
  save is refused and you are told to merge them instead — that keeps both
  histories, which overwriting would not.
- **WhatsApp Number** is separate from Primary Phone, for the student who
  fills in a form with one number and does their talking on another. Leave
  it blank when they are the same.

## 6.6 Tags

Tags are labels for segmentation — "scholarship", "parent is an alumnus",
"wants hostel".

### Procedure: add or remove a tag
1. Open the lead.
2. In the tag strip, open **+ Add tag** and choose one.
3. To remove, press the small × beside the tag.

Tags are filterable on the leads list and can drive retargeting
audiences. An administrator creates them in Settings → Tags.

## 6.7 Duplicates and merging

### What happens automatically
When a lead arrives that matches somebody already in the system:

- **Same phone number** → the new enquiry is attached to the existing
  person. No second record.
- **Phone matches one person and email matches a different one** → the
  enquiry attaches to the phone match, and the pair goes to **Merge
  review** for a human to judge.

You will never see "this phone number already exists". That error does
not exist here, by design.

### Procedure: resolve a merge review

**Goal** — decide whether two records are the same human being.

**Before you start** — `lead.merge`.

**Steps**
1. Open **Leads** → **Merge review** (the button only appears when
   something is pending).
2. Each row shows **Kept (phone match)** on one side and **Candidate
   (email match)** on the other.
3. Compare the names, numbers and histories.
4. Press **Confirm — same person, merge** or **Reject — different
   people**.

**What you should see** — the pair leaves the queue. A merge folds the
candidate's history into the kept record.

**Common mistakes**
- *Merging a parent and a child who share an email.* Very common in this
  business. Two siblings using one parent's address are two leads. Read
  the names.
- *Merging because it looks tidier.* A merge is not easily undone. If in
  doubt, reject: two records are recoverable, one merged record is harder
  to pull apart.

## 6.8 Deleting and restoring a lead

### Goal
Remove a test row or a record created in error.

### Before you start
`lead.delete`. Counsellors do not have it.

### Steps
1. Open the lead.
2. Find the delete panel.
3. Fill in **Why are you deleting it?** — for example "Test row from the
   webhook trial".
4. Confirm.

### What you should see
The lead disappears from the list. **It is not gone.** It moves to
**Leads → Deleted**, keeping who deleted it, when, and why.

### Procedure: restore
1. Open **Leads** → **Deleted**.
2. Find the lead and restore it.

### Edge cases
- **Deleting a lead with an admission.** Think hard. The payments are
  financial records and cannot be deleted at all — you would be hiding
  the person while their money remains.
- **Nothing is ever hard-deleted.** There is no screen anywhere that
  destroys a record permanently.

## 6.9 Documents

The **Documents** panel holds files attached to the lead — ID proofs,
mark sheets, the signed agreement.

- Upload needs `file.upload`.
- Viewing needs `file.read`. Files are private; links expire.
- Deleting needs `file.delete` (centre heads and admins).

The **signed instalment agreement** is an ordinary document with a
special marker, so the fees panel can tell whether a signed copy exists.

## 6.10 The Timeline


The timeline sits **under the box where you log an interaction**, on the
right of the lead page — it used to be the last thing on the page, below
the fee agreement and the documents, which is three screens away from the
question it answers. It is what you read before you ring: what did we say
last time. On a phone it comes before the details form for the same
reason.

A long history scrolls inside its own box rather than pushing everything
else off the screen, newest first.

Everything that has happened, newest first: interactions, stage changes,
assignment changes, messages. It is the handover document when somebody
takes over a lead, and the answer to "what did we promise them?".

You cannot edit the timeline. That is the point of it.

---

[Back to contents](#contents)
