# AFD India Marketing Brain

A multi-agent marketing system for AFD India (design and architecture entrance coaching, Kerala). You chat with one
orchestrator agent; it plans a month of content, then builds each piece for every platform, helps you publish, handles
comments and DMs, and learns from results.

One content piece becomes: a **carousel** (Google Business Profile and Instagram), a **reel brief** (talking and faceless, for
your creator studio; YouTube and Instagram), a **keyword-researched blog article** (the website, authored by Julie James), and a
**free resource** every platform promotes with a trigger word ("Comment NIDPLAN").

## Start
```bash
npm install
npx playwright install chromium     # once, for rendering slides and PDFs
claude --agent orchestrator         # then: "analyse my niche and plan this month"
```
Needs Node 22.18 or newer. `npm test` runs everything (tool tests and the vendored Marketing Brain tests).

## Setup you must do yourself
1. **Google:** `secrets/google-service-account.json`, shared with Search Console and GA4 (see `performance/README.md`).
2. **Form address:** `LEAD_FORM_ENDPOINT=<Apps Script /exec address>` when building blog pages (never stored in the repo).
3. **Brand assets:** fonts, logo and mascot cut-outs in `assets/brand/`; hex codes in `context/design-tokens.json`.
4. **Meta permissions** for posting and comment replies (`docs/crm/META-APP-REVIEW.md`). Until approved, agents hand you ready packages.

## Map
| Folder | What |
|---|---|
| `CLAUDE.md` | Shared context and hard rules. Every agent reads it first. |
| `.claude/agents/` | The agents: orchestrator, content-strategist, carousel-maker, carousel-renderer, reel-scriptwriter, blog-writer, resource-copywriter, resource-maker, poster, comment-replier, dm-agent, performance-analyst |
| `context/` | Company, voice, exam calendar, playbooks, design tokens, learnings |
| `config/` | Facts, copy rules, offers, forms, CTA playbook, keyword seeds, free-resource registry, Google sites |
| `tools/` | Renderers, keyword and Google tools, resource registry, Knorish builder |
| `mb/` | Vendored, tested Marketing Brain packages (Knorish builder, lead forms, analytics) |
| `queue/` | ideas, drafts, approved, posted, rejected: only you move a file into approved |
| `resources/`, `publish/`, `assets/`, `performance/`, `research/` | Outputs and data |

## Rules that never bend
Nothing publishes without your approval. No fees or prices, no dashes, no superlatives or promised results, no invented facts:
dates and figures come only from verified entries in `config/facts.seed.json`. A post can only promise a free resource that is
`live` with a tested link. Secrets stay in `secrets/` and the environment; `data/` (DM log) and `publish/` are git-ignored.
