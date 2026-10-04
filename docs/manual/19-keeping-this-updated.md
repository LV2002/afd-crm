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
  manual.html              the built book — do not edit this by hand
  build.mjs                the script that builds it
```

Each chapter is an ordinary Markdown file. Editing one is editing a text
file.

## 19.2 Editing a chapter

1. Open the chapter file in any text editor.
2. Make the change.
3. Rebuild (19.3).
4. Commit both the chapter and the rebuilt `manual.html`.

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

## 19.3 Rebuilding

From the project root:

```
npm run manual
```

That runs `docs/manual/build.mjs`, which reads every numbered chapter and
writes `docs/manual/manual.html` — one self-contained file with a table
of contents, no external files, no internet needed.

Open it by double-clicking. Print it with your browser's print command;
each chapter starts on a new page.

## 19.4 Reading it inside the CRM

The manual is also served at **`/manual`** for anybody signed in. The
route reads `docs/manual/manual.html` at request time, so **rebuilding
and deploying is all that is needed** — no second copy to keep in step.

If the file is missing, the page says so and tells you to run
`npm run manual`.

## 19.5 When to update it

Update the manual in the same change as the code, not afterwards.

| If you change… | Update |
|---|---|
| A button or field label | The chapter that names it |
| A permission or role | Chapter 3 and the Appendix |
| A pipeline stage or dropdown | Chapter 5 or 18 |
| A new screen | A chapter, plus `_inventory.md` |
| An integration | Chapter 13 |
| Anything that will generate questions | Chapter 16 (FAQ) |

A quick check before shipping a change: **would a new member of staff
find this in the manual?** If not, it is not finished.

## 19.6 Checking it is still accurate

Every few months:

1. Open `_inventory.md` and confirm each line still exists in the
   product.
2. Pick five procedures at random and follow them on screen, word for
   word. Labels drift.
3. Re-read `_open-questions.md` — some will have answered themselves.
4. Rebuild and commit.

---

[Back to contents](#contents)
