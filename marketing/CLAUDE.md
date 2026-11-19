# AFD India Marketing System: shared context

Every agent in `.claude/agents/` and the orchestrator read this file first. It is the single
source of truth about the company, the audience and the rules. Deep material lives in
`context/` and is loaded on demand. Compiled 2026-11-19 from the owner's Marketing Brain
project and company chats. Anything marked UNKNOWN is genuinely unknown: ask, do not guess.

## Company
AFD India ("afdindia", afdindia.com, built on Knorish): coaching for design and architecture
entrance exams in Kerala, plus online coaching for students elsewhere. Exams: NIFT, NID,
UCEED, CEED, NATA, JEE Main Paper 2. The site says "more than 25 years"; the founding year
and proof are UNKNOWN, so never state a number of years in content.
- Centres: Kochi (Edappally), Kannur. Calicut appears in the site footer but is NOT confirmed;
  do not mention it. Other cities on the site are coaching pages only.
- Courses (names): Foundation, DWO, DAO, DRH, Crash, Repeat Batch, MDes, Consultancy; the
  site lists Design/Architecture Regular, Weekend, Advanced, Summer, Synopsis, NIFT
  Situation Test, NID Studio Test, Portfolio Development, IIT Capsule. What DWO, DAO, DRH
  stand for: UNKNOWN. Fees exist but are off limits in content (see rules).
- About 200 leads a month. Lead forms write to a Google Sheet first, then the CRM (a separate repository,
  `LV2002/afd-crm`), HMAC-signed.
- Channels: Instagram (instagram.com/afdindia, confirm), Facebook, YouTube
  (@afdindia.design.coaching), LinkedIn, Google Business Profiles (Kochi, Kannur).
- Voice and byline: **Julie James, academic director** (owner confirmed 2026-11-19). Every blog post is
  authored by her, with her author card and profile page attached (`config/site.json`). Advice may use "I";
  never invent personal stories, credentials or years of experience for her. Her bio is deliberately minimal.

## Audience
Students interested in design as a career, ages **14 to 20** (the owner's definition), in
Classes 9 to 12 and drop-year, with some graduates and PG students on the long tail. Parents
pay and decide; students discover. Core Kerala, goal all-India (online). Motivations, fears
and parent worries: UNKNOWN. Many readers are minors: no pressure, no fake urgency, no
collecting more personal data than needed.

## Hard content rules (the owner's, apply to every agent and every draft)
1. English only. No em dashes or en dashes anywhere.
2. **Never mention fees, prices, costs, discounts, EMI, "Rs" or the rupee symbol.**
3. Never invent facts: no results, alumni, student numbers, awards, anecdotes, handles, phone numbers.
4. Dates, deadlines, ages and exam figures only as `{{fact:id}}` placeholders with ids from
   `config/facts.seed.json` (status `official` or `owner_verified`). No fact, leave the detail out.
5. No superlatives or promised results (full banned list in `context/brand-voice.md`). The
   website's "No.1 coaching centre" claim is unverified: never repeat it. "Up to 90% scholarship"
   (AFDSAT) is unverified: never promote it.
6. Name no students from the toppers page (inconsistent data, consent unconfirmed).
7. Promise a free resource only if `config/resources.json` says it is `live` with a tested link. Ask people to
   comment only the resource's registered trigger word. Comment and DM agents get that mapping only from
   `tools/resources.mjs match`.
8. **Nothing publishes without the owner's approval. Never post twice. A global kill switch
   defaults off.** Reworking old posts also needs approval.

## Knowledge files (load only what the task needs)
- `context/exam-calendar.md`: dates and eligibility, with status. Read its "Newest news" first (NIFT deadlines were extended, new dates unknown).
- `config/facts.seed.json`: the only citeable facts.
- `context/brand-voice.md`: voice, banned words, design taste.
- `context/content-playbook.md`: carousel contract, pillars, hypotheses.
- `context/carousel-design.md`: look, sizes, colours (partly UNKNOWN).
- `context/offers-and-resources.md`: free resources, triggers, contacts, automation rules.
- `context/blog-playbook.md`: blog structure, keyword rules, CTAs, forms and CRM, Knorish delivery.
- `config/resources.json`: the free-resource registry (trigger word, status, link, posts). Only `tools/resources.mjs` changes it.
- `context/learnings.md`: dated lessons from performance. `context/design-tokens.json`: the renderer's colours, fonts, sizes.
- `performance/`: data exports to analyse (see its README). `config/`: copy rules, facts, offers, forms, CTA playbook, keyword seeds and places, Google sites.
- `research/`: strategist findings, dated. `docs/crm/`: copies of the CRM's Meta app setup and review guides.

## Marketing Brain (the old system) and how this replaces it
The owner has retired Marketing Brain (private repo `LV2002/Marketing-Brain`, localhost:4310) as an app. Its rules, voice,
facts, keyword templates, CTA playbook, offers and blog writer are ported into `context/` and `config/`, and its tested
code is now **vendored here in `mb/`** (platform, facts, content-quality, lead-intake, topics, knorish, analytics,
page-reader, plus new `site-build` and `google-data`), with 368 of its own tests passing plus new ones. Nothing here needs
the old app or its Mac. Still not ported: its social studio and publisher (replaced by the agents), the page audit and
rework screens, and the outcomes screens. The lead-form Apps Script lives in `mb/lead-intake/apps-script/` (already deployed).

## The content piece and the cycle
One approved topic (a "piece") becomes: a carousel (always: Google Business Profile and Instagram), a reel
script (when it suits: YouTube and Instagram), a keyword-researched blog article (website), and, where it fits, a free
resource that every platform's copy promotes with a trigger word ("Comment NIDPLAN"). The strategist
recommends reel or carousel for Instagram with a reason. Cycle: learn > plan > approve > resource spec and copy > approve > build (carousel, reel, blog, resource) > approve >
render > upload resource, publish blog, test link, mark live > post and register posts > comments and DMs > learn. Performance lessons live in `context/learnings.md` and the strategist must read them.

## Tools (run from this folder; `npm test` runs all tests)
Run Google and autocomplete tools on the owner's computer: this cloud sandbox cannot reach Google.
- `node tools/render-carousel.mjs <approved-draft.md>`: checks the carousel contract, resolves facts, renders 1080x1350 JPEGs to `assets/<name>/` with `manifest.json`. `--preview` for drafts.
- `LEAD_FORM_ENDPOINT=... node tools/knorish-build.mjs <approved-blog.md>`: the six Knorish paste-in pieces in `publish/<slug>/` (article only, no site navigation or footer) with PASTE-STEPS.md and preview.html.
- `node tools/resources.mjs <cmd>`: the free-resource registry (validate, list, add, set, mark-live, dm-on, add-placement, match, log, sync-offers). The comment and DM agents call `match` to learn which resource a comment means on which post. A post can only promise a resource that is `live` with a tested link: the carousel renderer enforces it.
- `node tools/render-resource.mjs resources/<id>/resource.md`: makes the free resource PDF (A4, branded) after copy rules and fact checks.
- `node tools/check-copy.mjs <file> [--blog --keyword "..."]`: banned words, dashes, fees, unknown facts; blog structure and meta lengths.
- `node tools/google-sync.mjs [--report-only] [--page /path --published yyyy-mm-dd]`: Search Console + GA4 into `data/analytics.db`, report to `performance/google/`. Needs `secrets/google-service-account.json`.
- `node tools/suggest.mjs [--dry-run] [--exam NID] [--source google,youtube] [--depth full]`: free Google and YouTube autocomplete expansion into `research/keywords/`. Gentle, capped, cached.
- `node tools/keyword-plan.mjs`: ranks keyword opportunities from autocomplete plus Search Console. Demand signals only, no search volumes. Fee and price searches excluded.

## The agents
| Agent | Job | Writes to |
|---|---|---|
| orchestrator | Chat with the owner; run the cycle; delegate; report | n/a |
| content-strategist | Niche + competitor research, free keyword research, monthly plan of pieces | `research/`, `queue/ideas/` |
| carousel-maker | Idea to carousel JSON, caption, design spec | `queue/drafts/` |
| carousel-renderer | Approved carousel to JPEG slides with alt text | `assets/` |
| reel-scriptwriter | Reel brief for the creator studio: talking and faceless versions, YouTube metadata | `queue/drafts/` |
| blog-writer | Keyword-optimised, conversion-ready article; then the Knorish build | `queue/drafts/`, `publish/` |
| resource-copywriter | Designs each piece's free resource and writes every platform's copy asking for the trigger word; registers it | `queue/drafts/`, `config/resources.json` |
| resource-maker | Builds the resource PDF from the approved spec; prepares the owner's upload steps | `resources/` |
| poster | Publish or hand over owner-approved items; register the post against its resource | `approved/` to `posted/`, `config/resources.json` |
| comment-replier | Resolve trigger words through the registry; draft or post replies | `queue/drafts/` |
| dm-agent | Send the right resource to the right commenter on the right post, via the registry | `data/dm-log.json` (git-ignored) |
| performance-analyst | Judge results from `performance/`; write lessons | `context/learnings.md`, `research/` |

## Workflow and gates
`ideas/ > drafts/ > approved/ > posted/` (or `rejected/`). One markdown file per item,
`YYYY-MM-DD-slug.md`, front-matter: `status`, `format`, `exam`, `hook`, `cta`,
`scheduled_for`, `ig_media_id` (after posting).
1. Only the owner moves a file into `approved/`. Approval of one post is not approval of the next.
2. Comment replies and DMs are draft-only until a row in `offers-and-resources.md` is `Enabled: yes`.
3. Credentials come from environment variables only (`IG_USER_ID`, `META_PAGE_TOKEN`). Never write tokens to files.
4. Every outward action is logged: what, where, when, which file.

## Instagram platform facts (verify before promising a capability)
- Carousel publishing (2 to 10 images, public HTTPS JPEG, alt text up to 1000 chars) needs
  `instagram_content_publish`; comment replies need `instagram_manage_comments`. The CRM's Meta
  app has `instagram_basic` and `instagram_manage_messages` only (`docs/crm/META-APP-SETUP.md`);
  a Meta developer app review is pending. Until approved, the poster hands over a ready package.
- One private-reply DM per comment, within 7 days. Other DMs need the user to have messaged first (24h window).
- Account must be Business/Creator, linked to a Facebook Page.

## Lead handoff
Interested people become leads through the CRM's single ingestion path
(`resolveOrCreateLead()` then `applyAssignment()`), source = Instagram. Agents never write
leads themselves; the CRM's webhook does.
