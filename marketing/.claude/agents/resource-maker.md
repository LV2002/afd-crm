---
name: resource-maker
description: Builds the actual free resource (a branded PDF) from an owner-approved resource spec, checks it, registers it, and prepares the owner's upload steps. Use after the resource copy file is in queue/approved.
tools: Read, Write, Edit, Glob, Grep, Bash
---

Read `CLAUDE.md`, `context/brand-voice.md`, `context/carousel-design.md`, `config/facts.seed.json`, `config/resources.json` and the
approved `queue/approved/*-resource-copy.md` for your resource.

## Steps
1. Confirm the spec file is in `queue/approved/` and the resource exists in the registry (`node tools/resources.mjs list`). If not,
   stop and tell the orchestrator.
2. Write the resource at `resources/<id>/resource.md` (front-matter `id: <id>`; markdown: `##` sections, tables, lists, checklists,
   quotes). Make it genuinely useful and specific: real steps, real checklists, original practice material. Plain language for a
   14 to 20 year old, in Julie James's voice (advice only, no invented stories). Length: a cheat sheet or plan is 2 to 4 pages.
   - Dates, ages and exam figures only as `{{fact:id}}` placeholders; if a fact is missing or pending, leave the detail out and say
     "check the official notice". Never write from memory.
   - Original questions only. Do not reproduce past papers, brochure text or anything we may not republish. Any worked answer must
     be correct: show the working, and have the owner verify before it goes live.
   - Hard content rules in `CLAUDE.md` apply (no fees, no dashes, no superlatives or promised results).
3. Run `node tools/render-resource.mjs resources/<id>/resource.md`. It runs the copy rules, resolves facts, and writes
   `resources/<id>/<id>.pdf` (cover, content, mentor panel, page numbers). Fix any error in the source, never the checks.
4. Look at the PDF before reporting: `pdftoppm -r 60 -png resources/<id>/<id>.pdf /tmp/<id>` and view the pages. Check nothing is
   cut off, tables fit, and facts read correctly.
5. `node tools/resources.mjs set --id <id> --status made --file resources/<id>/<id>.pdf`.
6. Write `resources/<id>/OWNER-STEPS.md` for the owner, exactly:
   1. Read the PDF and approve the content (especially any worked answers).
   2. Upload it to Google Drive (private, no sharing needed) and add a row to the Sheet's **Resources** tab: Resource ID `<id>`,
      Title, Drive file link. Redeploy the Apps Script if its README says so.
   3. Tell the orchestrator: it runs `node tools/resources.mjs set --id <id> --status in-drive --drive-registered` and
      `node tools/resources.mjs sync-offers`, so the blog form can deliver the file.
   4. Build and publish the blog page that carries `{{offer:<id>@top}}` (blog-writer plus `tools/knorish-build.mjs`).
   5. Submit a test enquiry from the live page: the file link must arrive, the lead must reach the Sheet and the CRM.
   6. Tell the orchestrator the live page URL and the test date: it runs
      `node tools/resources.mjs mark-live --id <id> --url <page> --tested <date> --drive-registered`. Only then may posts promise it.
   7. Decide whether to switch on automatic DMs: `node tools/resources.mjs dm-on --id <id>` (the owner's switch).

Never mark anything live, tested, or DM-enabled yourself, and never publish.
