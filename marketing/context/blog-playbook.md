# Blog and page playbook (ported from Marketing Brain's page-studio, 2026-11-19)

The blog-writer follows this. Source of truth for the original is the Marketing Brain repo
(`packages/page-studio/src/domain/prompt.ts`, `config/copy-rules.json`, `config/author-voice.json`,
`config/cta-playbook.json`, `config/offers.json`, `docs/SEO-STRATEGY.md`, `docs/briefs/author-voice.md`).

## Voice (measured from 50 live posts)
Talk to one student or parent: "you" about 26 times per 1,000 words. Sentences about 19 words, about
10% short (8 or fewer). Paragraphs of 2 to 3 sentences, about 35 words. A question about every 400
words. Under 1 exclamation mark per 1,000 words. Practical, imperative advice, numbered steps, short
subheadings framed as questions. "I" only for advice ("I recommend..."), never a personal story or
claimed experience (real anecdotes may be used only if the owner puts them in `context/author-notes.md`,
which does not exist yet). Comparisons ("X vs Y: which matches your goals?") end with who should pick which.
Do not copy the old posts' em dashes, stale 2026 dates or repeated boilerplate.

## Article structure (every article)
- Exactly one H1 with the main keyword. Intro at most 100 words, main keyword in the first sentence.
- Directly after: `## Key takeaways`, 3 to 5 bullets.
- At least two H2s written as questions a student would type, each followed at once by a direct
  40 to 60 word answer, then detail. Main keyword in at least one H2 and used 4 to 6 times in total.
- Secondary keywords used naturally. Only H2 and H3 below the H1. No images.
- Callouts as markdown quotes starting **Tip:**, **Watch out:** or **Check the source:** (one or two).
  Tables only for real comparisons.
- `## Frequently asked questions` before the ending: 3 to 5 `### question?` headings, 40 to 60 word answers.
- Ending points to one next step (default "Book a free demo class").
- Length 900 to 1,200 words for a new article.
- Output header: `SEO_TITLE` (max 60 chars, keyword near the start), `META_DESCRIPTION` (120 to 155 chars,
  includes the keyword), `SLUG` (lowercase hyphenated, includes keyword), then the markdown.

## Types of page
hub (one complete guide per exam), comparison (NID vs NIFT, B.Des vs B.Arch: never say one is
better), question page, college page (facts only), local page (see below), tool/career guide.
Comparison and college pages use only facts from `context/facts.json` or official documents; where a
point is not a fact, tell the reader to check the official brochure.

## Local pages ("UCEED coaching in Ernakulam")
Only with something real to say for that place. Say plainly: centres in Kochi and Kannur, online for
everyone else. Never state distances, student numbers, hostels or schools. Never a page that only swaps
a place name (doorway page). Reader's own word "best" may appear in a question heading, answered with
how to choose, never implying AFD is best.

## Conversion blocks (offers and calls to action)
Place offer placeholders `{{offer:ID@PLACEMENT}}` each alone on a line. Offers in Marketing Brain's
`config/offers.json`: `demo-class`, `nid-question-bank` (NID), `nata-past-papers` (NATA, JEE Paper 2),
`self-study-materials` (NIFT, UCEED, CEED), `career-call`, `career-webinar`, `afdsat` (do NOT use: unverified
scholarship claim). Choose the CTA by search intent:
| Intent | Headline idea | Offer |
|---|---|---|
| dates | Never miss a {exam} deadline | career-call |
| syllabus | Know exactly what to study for {exam} | demo-class |
| eligibility | Not sure you are eligible for {exam}? | career-call |
| papers | Practise with real {exam} papers | lead-magnet (only if it exists) |
| preparation | Get a preparation plan for {exam} | demo-class |
| colleges | Find the right college for your goals | career-call |
| coaching | See how we teach {exam} | demo-class |
| career | Find the design path that fits you | career-call |
A post that promises a lead magnet is not approvable until the resource exists and its link is tested.

## Forms and the CRM
Every form submission goes to the Google Sheet first (backup), then to the CRM webhook, signed
HMAC-SHA256 (Marketing Brain `packages/lead-intake`, endpoint in its `config/lead-forms.json`). Forms
carry the submission id, exam, centre and page, so outcomes (contacted, demo, admitted, lost, revenue)
flow back and pages can be judged on admissions. The site-wide footer script (Marketing Brain
`npm run form-script`) injects the forms and CTA behaviour; articles only contain the placeholders. No
conversion actions on URLs starting `/publisher` or `/user`. Conversion changes must never alter existing
SEO (URLs, titles, headings, text, schema) of live pages.

## Knorish delivery (no server access)
Final page = six paste-in pieces: meta title, meta description, keywords, header code (Article and FAQ
JSON-LD), body HTML (no script, style or event handlers), footer code. Marketing Brain's `buildKnorishPackage`
makes these from a checked draft. Until that is wired into this system, the blog-writer delivers the
markdown draft, meta fields, keyword plan and FAQ JSON-LD, and the owner runs the six-piece build.
Protected pages (city pages, `config/protected-pages.json` in Marketing Brain) are never edited.

## Keyword rules
Primary keyword chosen from `research/keywords/<date>.json` (volume, India). Prefer a keyword with real
volume that the site has no page for, or a page ranking 5 to 15 that can be reworked. One primary keyword
per page; do not make a second page for a keyword an existing page already covers. Estimated clicks are
estimates and must be labelled so; nobody can promise a ranking.
