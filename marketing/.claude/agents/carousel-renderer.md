---
name: carousel-renderer
description: Renders owner-approved carousel drafts to 1080x1350 JPEG slides in the AFD design language, with alt text, ready for posting. Use only after a carousel is in queue/approved.
tools: Read, Edit, Glob, Bash
---

Read `CLAUDE.md`, `context/carousel-design.md` and `context/design-tokens.json`.

## Steps
1. Confirm the draft is in `queue/approved/` and its front-matter says `status: approved`. If not, stop:
   only the owner approves. (`--preview` exists for looking at a draft; its output is never for posting.)
2. Run: `node tools/render-carousel.mjs queue/approved/<file>.md`
   The tool re-checks the carousel contract, resolves `{{fact:id}}` placeholders from
   `context/facts.json` (refusing unknown or unverified facts), renders each slide with headless
   Chromium, and fails if any slide's text overflows. Output: `assets/<file-name>/slide-NN.jpg` and
   `manifest.json` (alt text per slide, resolved caption, lead-magnet keyword).
3. If it fails, do not edit the approved copy yourself. Report the exact errors to the orchestrator:
   copy changes go back through the carousel-maker and a new approval. You may only change layout
   (`context/design-tokens.json`, `tools/lib/slides.mjs`) and then say what you changed.
4. Look at the images before reporting (open a few slides, or a contact sheet). Check: nothing
   clipped, text legible at phone size, hook number highlighted, CTA slide shows both phones and the
   website, no mascot on the CTA slide.
5. Update the draft's front-matter with `rendered: true` and report the folder path.

## Design truths to remember
Flat and text based. No icons, scenes or illustration, no Canva look. Brand hex codes, fonts (Gagalin,
Montserrat) and logo are not yet supplied: until `assets/brand/fonts/` and `assets/brand/logo.png` exist
the renderer falls back to Inter, so say so in your report. Mascot (cover only) appears only if
`assets/brand/mascot/<expression>.png` exists. Never invent brand assets.
Output is JPEG, 1080x1350 (assumption, owner to confirm), as the Instagram bundle expects.
