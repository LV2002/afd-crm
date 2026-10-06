<!-- audience: admin -->
# Chapter 19 — How to keep this manual updated

## 19.1 Where it lives

```
docs/manual/
  _inventory.md            the checklist of everything the manual covers
  _open-questions.md       things nobody has answered yet
  01-introduction.md
  02-getting-started.md
  …
  19-keeping-this-updated.md
  manual-staff.html        the built staff book — do not edit by hand
  manual-admin.html        the built administrator book — likewise
  build.mjs                the script that builds both
  pdf.mjs                  prints the built books to PDF
```

Each chapter is an ordinary Markdown file. Editing one is editing a text
file.

## 19.2 Editing a chapter

1. Open the chapter file in any text editor.
2. Make the change.
3. Rebuild (19.4).
4. Commit the chapter and both rebuilt `.html` files.

### House style
- Write for somebody who has never seen the CRM.
- Use the **exact** words from the screen, in bold: **Confirm admission**,
  not "the confirm button".
- Procedures keep the same six parts: Goal · Before you start · Steps ·
  What you should see · Common mistakes and fixes · Related.
- Explain *why* a rule exists where it is not obvious. "You cannot edit a
  payment" is an instruction; "because corrections are reversals, so the
  history stays readable" is the thing that stops somebody trying.
- Never document something that is not in the code. If you are unsure,
  put it in `_open-questions.md`.

### Adding a chapter
1. Create `20-something.md` with a `# Chapter 20 — Something` heading.
2. Rebuild. The script picks up numbered files automatically, in order.
3. Add it to `_inventory.md`.

### Screenshots
Placeholders look like
`[Screenshot: Lead detail page with the Status dropdown open]`.
Replace one with `![](images/lead-detail.png)` and put the file in
`docs/manual/images/`.

## 19.3 Two books, one set of chapters

These chapters build into two books:

| Book | Who it is for | What it leaves out |
|---|---|---|
| `manual-staff.html` | Counsellors, accounts, academics, centre heads | Settings, the integrations, the schedules, the technical troubleshooting |
| `manual-admin.html` | Administrators | Nothing |

One source, because two sets of chapters describing the same screens
drift apart within a month.

Chapters and sections are **renumbered per book**, so the staff book runs
1, 2, 3 with no hole where the admin guide was, and every
cross-reference is rewritten to match. A reference to something the staff
book does not contain becomes *the administrator handbook* — which is
true, and tells the reader where to look.

### Marking a whole chapter

Its very first line:

```
<!-- audience: admin -->
```

### Marking part of a chapter

A section, a paragraph, a table row, a single bullet:

```
<!-- only: admin -->
...administrator-only prose...
<!-- /only -->
```

`<!-- only: staff -->` does the same job the other way, for a passage
that has to read differently for the two audiences. The usual shape is a
short staff version followed by a fuller administrator one.

Regions do not nest, and an unclosed one **fails the build** instead of
quietly swallowing the rest of the chapter.

### Where the line falls

Anything a person does in the CRM is staff material — including screens
most of them cannot open, because a counsellor reading about Ad
Performance learns what the institute measures. Anything under
**Settings**, anything involving Meta or Google, anything that sends the
reader to a `docs/*.md` runbook, and anything whose fix is "an
administrator does X" is administrator material.

## 19.4 Rebuilding

From the project root:

```
npm run manual
```

That runs `docs/manual/build.mjs`, which reads every numbered chapter and
writes both books — self-contained files with a table of contents, no
external files, no internet needed. It prints what went into each book,
and warns about any cross-reference left pointing at nothing.

Open one by double-clicking. Print it with your browser's print command;
each chapter starts on a new page.

For the versions that get handed to people:

```
npm run manual:pdf
```

That prints both books to A4 with page numbers and a navigable outline,
using the Chromium that Playwright already installs for the end-to-end
tests, and writes `AFD-CRM-Staff-Handbook.pdf` and
`AFD-CRM-Administrator-Handbook.pdf`. The PDFs are not committed —
rebuild them whenever somebody needs one.

## 19.5 Reading it inside the CRM

Both books are served inside the CRM, by URL only — deliberately not in
the sidebar:

| URL | Book | Who gets it |
|---|---|---|
| **`/manual`** | Staff | Anybody signed in |
| **`/manual/admin`** | Administrator | `settings.manage`. Anybody else is sent to `/manual`, because what they were looking for is almost certainly in it |

The routes read the built files at request time, so **rebuilding and
deploying is all that is needed** — no second copy to keep in step. If a
file is missing, the page says so and tells you to run `npm run manual`.

## 19.6 When to update it

Update the manual in the same change as the code, not afterwards.

| If you change… | Update |
|---|---|
| A button or field label | The chapter that names it |
| A permission or role | Chapter 3 and the Appendix |
| A pipeline stage or dropdown | Chapter 5 or 18 |
| A new screen | A chapter, plus `_inventory.md` |
| An integration | Chapter 13 |
| Anything that will generate questions | Chapter 16 (FAQ) |
| Something only an administrator does | Mark it, so it stays out of the staff book (19.3) |

A quick check before shipping a change: **would a new member of staff
find this in the manual?** If not, it is not finished.

## 19.7 Checking it is still accurate

Every few months:

1. Open `_inventory.md` and confirm each line still exists in the
   product.
2. Pick five procedures at random and follow them on screen, word for
   word. Labels drift.
3. Re-read `_open-questions.md` — some will have answered themselves.
4. Rebuild both books and commit them.

---

[Back to contents](#contents)
