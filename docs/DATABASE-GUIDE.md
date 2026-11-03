# The contact database — a guide for the team

## What it is

A place for people we hold details for who are **not leads**: students from a
school seminar and its aptitude test, purchased databases, exam-application
files. Nobody here is assigned to a counsellor, has a follow-up, has a
response clock, or appears in any lead report or dashboard count. They are here
to be **retargeted**. The few who turn out to be real enquiries are moved into
the leads.

It is separate from leads on purpose: a thousand people who have not enquired
must not land in anybody's queue.

## Who can do what

Three permissions, in **Settings → Roles & Permissions** under *Contacts*:

| Permission | Lets them |
|---|---|
| **View the contact database** | See the database and its lists. Phone numbers are masked; "Show" reveals one and is audited. |
| **Manage contacts** | Add, edit, import and remove contacts; create and archive lists. |
| **Move contacts into leads** | Move a contact into the leads, or merge it with the lead it already is. |

As shipped: **Admin and Co-Admin** have all three. **Counsellors** can view. **Centre Heads** can view and move
contacts into leads. Everything is an ordinary editable grant. These are institute-wide, so Centre or All makes no
difference. There is no export: nobody can take the database out as a file.

## Lists

Every contact belongs to at least one **list**: one batch with one origin, such as "St Xavier's seminar, Nov 2026" or
"NATA applicants 2026 (purchased)". A list records:

* **Where they came from**, which becomes the lead's source if one of them is moved into the leads.
* **May be used for Meta and Google retargeting** (ticked by default).
* **These people agreed to WhatsApp messages.** Only lists with this ticked can be chosen when you send a WhatsApp broadcast to the database.

The same person can be on several lists. They are **one contact**: a student at a seminar who is also in a purchased
exam database is one row on two lists, never retargeted twice.

## Adding people

* **Add a contact** — a form with every lead field, including any custom field you add later, so a new field is on this
  form the moment it exists.
* **Import a file** — upload a CSV, match its columns to fields, preview, import. A big file goes in chunks of 1,000.
  The file is read in your browser and is not stored.

Someone already in the database is **never rejected or duplicated**: they are added to the new list, and any detail
that was blank is filled in. Nothing already stored is overwritten.

A contact needs a name and a phone *or* an email. A lead needs a phone, so an email-only contact can't be moved into
the leads until a phone is added.

## Moving into the leads, and merging

On the Contacts screen, tick people and press **Move selected to leads**, or use the button on a row.

* **Not a lead yet → Move to leads.** A new lead is created through the normal route: the same assignment rules, the same
  source tracking, the same notifications as any other new lead. Its source is the list's source and its sub-source the
  list's name, and every detail is copied across.
* **Already a lead → Merge.** If the phone or email is already a lead's (including a number or email that lead used
  earlier), the button says **Merge** and the row shows *Already a lead · #123*. Merging adds this contact to that lead
  as one more enquiry, fills the **blank** details on the lead, and **never overwrites** anything the lead already
  has. First-touch source and the assigned counsellor are untouched.
* This is worked out when the screen is drawn, so a lead who arrived by any other route after the import (a website form, a
  call) is recognised as soon as you refresh.

**After either, the person stays in the database**, marked *Moved · Lead #123* or *Merged · Lead #123*, so a list can
still tell you how many of its people responded. The lead's own page shows an **In the database** line saying which
lists they were on.

## Retargeting

Every hour, the Meta and Google audience sync also sends the database, by these rules:

* The contact has a phone, is on at least one list that allows ads and isn't archived, and **is not a lead** (not
  linked to one, and no phone or email of theirs belongs to any lead).
* **Anyone who has become a lead is governed by the lead rules**, which already exclude anyone who has taken admission. A
  seminar student who joins stops seeing ads for the course without anybody doing anything.
* A contact is **taken out** of the audience when they are removed, become a lead, or their list stops allowing ads or
  is archived.

Because contacts and leads are kept apart in the audience, nobody is in it twice.

## WhatsApp broadcasts to the database

**Chats → Broadcasts → New broadcast** now has three choices at the top: **Leads**, **Students** and **Database**.

* Pick **Database**, then tick the **lists** to send to (the lists act as your tags: "St Xavier's seminar", "NATA applicants").
  The same filters as for leads (class, city, exam and so on) narrow it further.
* The message goes **only to people on those lists who are not leads**. Anyone who has become a lead is left out and
  counted ("12 are already leads and are left out"); the Leads choice reaches them. The reverse is also true: a
  broadcast to Leads never reaches the database.
* Only lists ticked **"These people agreed to WhatsApp messages"** can be chosen. Picking one that isn't is refused by name.
* People who replied STOP are skipped, as for every broadcast.
* It is checked again at the moment each message is sent. Someone who became a lead since you composed it, was removed,
  or whose list lost the tick is skipped, with the reason shown.
* Replies come into the same Chats inbox as "Not in the CRM" conversations.

**Not built:** multi-step **automation flows** (a message, a wait, a follow-up depending on the reply) still run on
leads only. A one-off bulk message to the database works; a sequence does not yet.

## Things to know

* **Purchased lists:** you have confirmed ads are fine. Meta and Google ask you to confirm the people agreed; that is
  your confirmation. WhatsApp is different: sending to numbers that never opted in can get your WhatsApp number
  restricted, so keep the WhatsApp tick for seminar contacts who agreed.
* **Removing someone** removes them from the database and the ad audiences. It is a soft removal (the record is kept, hidden).
* **A person asking for their data to be erased** isn't built as a separate step yet: removal hides them and takes them
  out of audiences, but the record remains in the database.
