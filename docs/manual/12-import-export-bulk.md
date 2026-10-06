# Chapter 12 — Importing, exporting and bulk operations

## 12.1 Importing leads from a spreadsheet

### Goal
Bring a list of leads in from a CSV — a purchased database, an event
sign-up sheet, an export from somewhere else.

### Before you start
- `lead.import` (centre heads and administrators; counsellors do not
  have it).
- A **CSV file**. Export your spreadsheet as CSV first.
- The file must have a **header row** and must include a **name** column
  and a **phone** column. Everything else is optional.

### Steps

**Step 1 — upload**
1. Open **Leads** → **Import**.
2. Choose your file.

If the file has no readable columns you get *Couldn't find any columns or
rows in that file.* — usually an Excel file renamed to `.csv`, or an
empty sheet.

**Step 2 — map the columns**

3. The system guesses a field for each of your column headings. *Map each
   column to a field, or leave it as Skip.*
4. Correct anything it got wrong. Choose **Skip this column** for columns
   you do not want.
5. **Student Name** and **Primary Phone** are marked with `*`. The
   **Next: Preview** button stays disabled until both are mapped.
6. If your file has no centre column, set a default centre. It is used
   only for rows where Centre does not map.
7. Press **Next: Preview**. (**Start over** throws the file away.)

**Step 3 — preview**

8. Check the first rows under your chosen headings. This is the moment to
   catch a column mapped one place to the left.
9. **Back to mapping** to fix anything, or **Import N rows** to proceed.

**Step 4 — the summary**

10. You get four counts: **total**, **new leads created**, **matched an
    existing lead**, and **skipped** (only if any were).
11. Any row with a problem is listed with its **Row**, **Status** and
    **Note**.
12. **Import another file** starts again.

### What you should see
New leads in the list, assigned by your assignment rules exactly as if
they had arrived one at a time.

### What "matched an existing lead" means
That phone number was already in the system. **The row was not rejected
and no duplicate was created** — a new enquiry was attached to the
existing person, and their first-touch source was left alone. This is
correct behaviour and usually the single largest number in a
re-import.

### Common mistakes and fixes
- **Excel renamed to .csv.** Use *Save as → CSV*.
- **Phone numbers mangled by the spreadsheet.** Excel loves turning
  `9847012345` into `9.85E+09`. Format the column as text before
  exporting.
- **No header row.** The first row of data gets used as headings.
- **Importing the same file twice.** Nothing breaks: the second run
  matches instead of creating. You do get a second enquiry on each lead.
- **Expecting the import to set the stage or the owner.** It cannot.
  Stage and assignment are the system's to decide — a spreadsheet column
  cannot bypass the assignment rules.

### Related
- Chapter 5.4 — creating one by hand
- Chapter 13 — assignment rules

## 12.2 Exporting leads

### Goal
Get leads out as a CSV, for a mail-merge or an outside analysis.

### Before you start
`lead.export` — centre heads and administrators. **Not counsellors.**

### Steps
1. Open **Leads**.
2. **Apply the filters you want first.** The export is exactly what the
   list is currently showing — "export what you can see".
3. Press **Export CSV**. It reads **Exporting…** while it works.
4. The file downloads.

### What you should see
A CSV of the filtered leads.

### What is recorded
**Every export is written to the audit log** — who, when, and how many
rows. This is deliberate: an export is the moment a copy of the database
leaves the building.

### Common mistakes
- *Exporting everything to "have a copy".* Filter first.
- *Looking for the button as a counsellor.* It is not there.

## 12.3 Bulk assignment

The nearest thing to a bulk action on leads is the **Unassigned** queue
(Chapter 5.3), where you can assign row by row. There is no
multi-select-and-assign on the main list.

If a whole batch needs reassigning — somebody leaves — an administrator
does it by changing the assignment rules for new leads and reassigning
the existing ones individually, or asks for help.

<!-- only: admin -->
## 12.4 Exporting and importing configuration

This is for setting up a second instance or moving settings between a
test and live system. **It is not a data backup** — no leads, no
students, no payments.

**Settings → Config Export/Import** (`config.export`, `config.import`).

### Procedure: export the configuration
1. **Settings** → **Config Export/Import**.
2. Press **Export**.
3. A JSON bundle downloads, holding stages, roles, fields, dropdowns,
   rules, templates, fee structures and the rest.
4. The **History** table lists past exports and imports with **Kind**,
   **Name** and **When**.

### Procedure: import a configuration
1. Open the same screen on the **new** instance.
2. Press **Import** and choose the bundle.

**Important:** import is meant for an **empty** instance and refuses to
run against one that is already configured. It is a bootstrap, not a
merge.

<!-- /only -->
---

[Back to contents](#contents)
