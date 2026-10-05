# Archiving a year, and putting it back

**Settings → Archive.** One file holding every setting, lead, admission,
payment and message. Download it, keep it, restore it later.

---

## What it is for

The habit this was built for: at the end of an academic year, take a copy
of everything, keep it on a hard disk, and carry on without three years
of finished leads in the way.

## What it is not

**It is not a backup of the hosting.** It is one file, on one disk, taken
on one day. If the question is *"what if the database is lost, or
somebody deletes something by mistake on a Tuesday"*, the answer is
Supabase's own backups and point-in-time recovery — continuous, and not
something anybody has to remember to do. Check they are enabled on your
plan; that is the safety net, and this is not a substitute for it.

---

## Three things an archive does not contain

**Sign-in accounts and passwords.** These live in Supabase Auth, a
separate system no application code can export — password hashes are not
exposed by any API. Who existed and what they were allowed to do *is*
archived (`profiles`, `roles`, `user_centers`). Their logins are not. A
restore therefore means inviting every member of staff again from
Settings → Users before anybody can get in.

**Uploaded files.** Student documents, photographs and the organisation
logo are in Supabase Storage, not Postgres. The database rows that *point*
at them are archived, so after a restore the records know a file should
exist and the file itself will be missing. Download those separately from
the Supabase dashboard if they matter to you.

**Operational logs.** `webhook_events`, `error_events` and `cron_runs` are
left out deliberately. They are about the running of the system rather
than the institute's records, and `webhook_events` alone — which keeps the
raw JSON of every delivery Meta has ever made — is usually larger than
everything else put together.

All three are also written into the archive file's own header, so a file
sitting on a disk in two years' time carries its own caveats.

---

## Taking one

**Settings → Archive → Download the archive.**

You get `afd-crm-archive-YYYY-MM-DD.ndjson.gz`. It streams, so the
download begins before the file has finished being written — leave the
tab alone until the browser says it is done. A partial file is detectable
on restore (its last line will not parse) rather than silently restoring
half an institute.

Needs permission to export **both** configuration and lead data, because
it contains both.

## Putting one back

**Settings → Archive → Put an archive back.**

**It only restores into an empty database.** If any table already has a
row, the restore stops before writing anything and names what it found.
That is the whole safety design: a merge would silently overwrite
whatever has happened since the archive was taken, and nobody can reason
about that halfway through a recovery. Everything lands in one
transaction, so a failure leaves nothing behind.

Sequences — including `receipts.receipt_no`, which the ledger's
gaplessness depends on — are reset past the highest restored value, so the
next receipt written does not reuse a number that is already on a
receipt somebody has.

### The 4 MB upload limit

The hosting platform caps a browser upload at 4.5 MB, and the screen
refuses above 4 MB with a message saying so. The download has no such
limit — it streams — so an archive can easily grow past what can be
uploaded back through the browser.

If that happens, restore it with a database tool instead:

```bash
gunzip -c afd-crm-archive-2026-10-05.ndjson.gz | head -1   # read the header
```

and load the rows with a script using the same order the header lists.
If this becomes routine, the fix is to upload the file to Supabase
Storage and have the server read it from there — ask, and it is a small
piece of work.

---

## A caution about the ledger

Payments and receipts are append-only by design (CLAUDE.md
§ Non-negotiables 7) and nothing in this system hard-deletes them. If the
yearly habit is to archive *and then empty* the live database, be aware
that this moves your financial records out of the system and onto a disk.

In India, income-tax rules generally require books of account to be kept
for **six years**, and the Companies Act for **eight**. One file on one
hard disk is a fragile place for eight years of receipts, and it is not
queryable when somebody asks a question about a payment from two years
ago.

A safer shape for the same goal: keep the financial history in the
database, and declutter the *screens* by filtering on academic year.
Nothing is lost, nothing has to be restored to answer a question, and the
day-to-day lists are just as clean. If you want that, it is a feature
worth asking for rather than a reason not to take archives — take them
either way.

---

## The file format

Gzipped newline-delimited JSON. First line is a header:

```json
{"kind":"afd-crm-archive","version":1,"createdAt":"…","organisation":"AFD India",
 "tables":["centers","roles",…],"excluded":[…],"notIncluded":[…]}
```

Every line after it is one row: `{"t":"leads","r":{…}}`.

Newline-delimited rather than one JSON document so that both ends stream
in constant memory — year three will not fit comfortably in a serverless
function otherwise — and so a truncated file fails to parse instead of
restoring silently.

`version` changes only when the *shape* changes. Adding a table does not
touch it, because the header lists the tables the file actually carries.
A restore refuses a file from a newer format rather than guessing.

**The table order is computed from the live foreign-key graph**, not
written down, so a table added next year lands in the right place in both
the file and the restore without anybody remembering to update a list.
