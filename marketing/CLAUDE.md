# AFD India Marketing System — shared context

Every agent in `.claude/agents/` and the orchestrator read this file first. It is the
single source of truth about the company, the audience and the rules. Keep it short; deep
material lives in `context/` and is loaded on demand.

## Company
AFD India: 25-year-old coaching institute that prepares students for design and
architecture entrance exams — **NIFT, NID, UCEED** (also CEED, NATA, JEE Paper 2).
Centres in Kochi and Kannur (Kerala), expanding. About 200 leads a month.
Courses: Foundation, DWO, DAO, DRH, Crash, Repeat Batch, MDes, Consultancy.
The CRM (the parent repo, `../`) is where every lead lands. Marketing feeds it; it does
not replace it.

## Audience
Students aged **14–20** interested in design as a career, and their parents (parents pay
and decide; students discover). Mostly Kerala, also wider India. Platform: Instagram first.
Because many are minors: no pressure tactics, no fake urgency, no collecting more personal
data than needed, no income/placement claims we cannot prove.

## Knowledge files (load only what the task needs)
- `context/exam-calendar.md` — exam dates, registration windows, result dates. Source for any date claim.
- `context/brand-voice.md` — tone, words we use and avoid, example posts.
- `context/content-playbook.md` — formats, hooks, editing styles that have worked for us.
- `context/offers-and-resources.md` — free resources, lead magnets, their trigger keywords, links.
- `research/` — competitor and niche findings written by the content strategist, dated.
- `../docs/` — CRM docs (fees, SLAs, Meta app setup) when a question touches the product side.

If a file is empty or marked TODO, say so and ask the user. Never invent exam dates, fees,
results, or testimonials.

## The agents
| Agent | Job | Writes to |
|---|---|---|
| orchestrator | Chat with the user; split work; call the others; report back | — |
| content-strategist | Research what works in the niche; hooks, formats, editing styles; produce a content plan | `research/`, `queue/ideas/` |
| carousel-maker | Turn an approved idea into carousel slides (copy + design spec + files) | `queue/drafts/` |
| poster | Publish items that a human has approved | moves `approved/` → `posted/` |
| comment-replier | Draft or send replies to comments | `queue/drafts/` or posts per trigger rules |
| dm-agent | Send a free resource by DM to people who comment a trigger keyword | log in `queue/posted/` |

## Workflow and approval gates
`ideas/ → drafts/ → approved/ → posted/` (or `rejected/`). One markdown file per item,
named `YYYY-MM-DD-slug.md`, with front-matter: `status`, `format`, `exam`, `hook`, `cta`,
`scheduled_for`, `ig_media_id` (after posting).

Hard rules:
1. **Only a human moves a file into `approved/`.** The poster publishes nothing else.
2. Comment replies and DMs are **draft-only** until the user enables an automation rule in
   `context/offers-and-resources.md` (keyword, resource, reply text). Rule-matched
   comment-to-DM may run automatically; anything else stays a draft.
3. Never post, reply or DM in a way the user did not approve in kind. Approval of one
   post is not approval of the next.
4. Credentials come from environment variables only (`IG_USER_ID`, `META_PAGE_TOKEN`).
   Never write tokens into files or the repo.
5. Every outward action is logged: what, where, when, which file.

## Instagram platform facts (check before promising a capability)
- Publishing carousels (2–10 items) uses the Instagram Content Publishing API and needs
  `instagram_content_publish`; replying to comments needs `instagram_manage_comments`.
  Neither is in the current CRM Meta app (it has `instagram_basic` and
  `instagram_manage_messages` only — see `../docs/META-APP-SETUP.md`). Adding them means
  another App Review (`../docs/META-APP-REVIEW.md`). Until then, the poster prepares the
  post for manual upload.
- A comment can receive one private-reply DM, within 7 days of the comment. DMs outside
  that window need the user to have messaged us first (24h window).
- The Instagram account must be a Business/Creator account linked to a Facebook Page.

## Lead handoff
Anyone who replies to a DM with interest should become a lead through the CRM's single
ingestion path (`resolveOrCreateLead()` then `applyAssignment()`), source = Instagram.
The dm-agent never writes leads to the database itself; it flags them for the CRM webhook.
