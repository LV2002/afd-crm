# Content playbook

Source: Marketing Brain (Social Studio) exports, compiled 2026-11-19. Nothing here is proven
by AFD's own results yet: no performance numbers were supplied. Treat all "what works"
items as **hypotheses to test**, and measure saves per reach and shares per reach.

## Goal
Reach and engagement. Carousels people save for later and screenshot. Formats for now:
**carousels only** (reels/video and the poster studio are parked).

## The owner's three carousel rules (2026-10-14 brief)
1. A number on the hook slide.
2. More than three slides, aim for about eight.
3. Worth saving: reference value, plus a summary or checklist worth a screenshot.
Context: existing hand-built content "performs decently but gives too little value to blow
up". Old median slide had 16 words; the aim moved to real substance per slide.

## Carousel contract (matches Marketing Brain `config/social-playbook.json`)
- 7 to 10 slides (under 5 or over 10 is blocked; 5 to 6 is advisory warning).
- Roles: `hook` (slide 1), `content`, `reference` (at least one), `summary` (second to last), `cta` (last, exactly one).
- Hook: at most 8 words, contains a number.
- Each slide: short title (up to 120 chars), at most 3 lines, at most 45 words.
- Caption: two or three short sentences, ends with a question, no hashtags, at most 2200 chars.
- Default CTA: "Save this for later and send it to a friend preparing for the same exam", unless a real free resource is attached.
- Dates, deadlines, ages and exam figures only as `{{fact:id}}` placeholders, ids from `config/facts.seed.json`. If no fact exists, leave the detail out.

## Content pillars (placeholders in Marketing Brain; the owner's own 5 to 8 are still open)
| Pillar | Weight | Examples |
|---|---|---|
| Dates and deadlines (from the calendar) | n/a | countdown posts 21, 7 and 2 days before a dated fact |
| Exam cheat sheets and timelines | 3 | "The NIFT entrance exam in one page: GAT, CAT and the Situation Test"; "How the NID DAT works: Prelims, then Mains"; "UCEED paper layout: what Part A and Part B test"; "CEED at a glance" |
| X vs Y comparisons | 2 | "NID DAT vs NIFT: which one fits you?"; "B.Des vs B.Arch: choosing after Class 12" |
| Step-by-step preparation plans | 3 | "A weekly drawing practice plan for design entrance students" |
| Sample questions with worked answers | 2 | "5 visual reasoning questions with worked answers" (UCEED) |

## Posting rhythm (placeholders, owner has not confirmed)
Mon, Wed, Fri 19:00 and Sat 11:00 IST. Plan 120 days ahead, write 7 days ahead.

## Hook style used before
Old covers were clickbait hooks built on exam keywords (NID, NIFT, UCEED, CEED, NATA, B.Des,
M.Des, B.Arch). Keep keywords and a number; stay honest, no fake urgency.

## Quiz and question content
Quiz stories use two frames per question (question, then answer) because the Instagram quiz
sticker did not work. Every question image needs a factual check (a dice image once showed 2
pips on two faces).

## Method inspiration
Marketing Brain's method was ported from the public `Ootto-AI/claude-content-skills`
(viral-carousel, carousel-builder, caption-and-hashtags): structure only, never the words.
Claims like "numbers double views", "8 slides on average", "saves are the strongest signal"
are creator claims. Test them, do not state them as facts.

## Unfilled (strategist to research, owner to confirm)
- Competitor and inspiration accounts (none named yet).
- Baseline reach, followers, engagement (Instagram handles: instagram.com/afdindia on the site; confirm).
- 3 posts the owner likes and 1 they dislike.
- Approved example carousels (none supplied; the only complete one on file is a test fixture).
