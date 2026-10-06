# Making the CRM feel like a product

Leon's note: *"it's a bit too plain… I want the experience of the person using it to be
much better, and a lot more visual representation of the data."*

This is the reference list and the plan. It is written against what the code actually
does today, not against a general idea of good design.

---

## 1. What is actually plain

Not the colours — those were worked over already (`globals.css` has one saturated blue
for "do this next", neutrals with a blue bias, and separate semantic green/amber/red for
paid, attention and overdue). The problems are structural:

**The dashboard is a wall of equal numbers.** `my-numbers-widget.tsx` renders eight
`StatTile`s in two rows of four, and `stat-tile.tsx` is a bordered box with a label and a
number. Eight tiles of identical weight means none of them is the answer to "how am I
doing". There is no comparison (against last month, against target), no direction of
travel, no shape.

**There are two charts in the entire application** — `funnel-chart.tsx` and
`breakdown-chart.tsx`, both on Insights. Everything else is a number or a table. A
counsellor's month, a centre's pipeline, collections against bookings, where leads came
from: all text.

**Every screen is the same.** A `Card`, a `CardHeader`, a grid of children. Nothing
distinguishes the screen you live in (the lead page) from the screen you visit monthly
(Settings → Dropdowns). The work surfaces do not feel different from the admin surfaces.

**Nothing responds.** No skeletons while a page loads, no empty states beyond a line of
grey text, no transitions, no keyboard path. The app is correct and silent.

The good news is that the foundation is right: design tokens exist and are used, the two
charts already follow the rules (single hue for magnitude, theme variables so dark mode
is automatic), and the stack — Next.js 15, Tailwind, shadcn/ui, Recharts — is exactly the
stack every reference below is written for. Nothing here requires a rewrite.

---

## 2. Repositories worth taking from

Ordered by how much they fit this codebase. Everything here is MIT or similar and
copy-paste rather than a dependency, which matters: a CRM that has to run for years
should own its components.

### Charts and data display

**[shadcn/ui Charts](https://ui.shadcn.com/charts)** — the canonical one, and it *is*
Recharts: a `ChartContainer` that maps your CSS variables onto the chart, a tooltip and a
legend that match the rest of the app. We already hand-roll both. Adopting the container
would make every future chart consistent for free.
`npx shadcn@latest add chart`

**[Tremor](https://tremor.so)** ([tremorlabs/tremor](https://github.com/tremorlabs/tremor))
— 35+ components in the same copy-paste model, built on Tailwind v4 + Radix + Recharts,
acquired by Vercel and with the Blocks library now free. The pieces worth stealing by
name: **KPI cards** (number, delta, sparkline, target bar), **BarList** (the ranked list
that replaces a pie chart), **Tracker** (the 30-day squares strip — perfect for SLA
compliance), and their **spark charts**. Same stack, so a Tremor component drops into
this app with its class names intact.

**[Recharts](https://github.com/recharts/recharts)** — already a dependency, 2.4M weekly
downloads, and the thing shadcn's charts and Tremor are both built on. No reason to add
a second charting library; everything below can be built with what is installed.

### Layout, shell and interaction

**[satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)** (~12k stars) — the
most polished free shadcn dashboard. Take the **sidebar behaviour**, the **global search
command palette**, and the **data table** patterns. It is Vite + TanStack Router, so copy
the components, not the routing.

**[Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter)**
(~6.6k stars) — the same ideas on Next.js App Router, which is our router. Closer to
copy-paste for layout and nav.

**[TanStack Table](https://github.com/TanStack/table)** — when the leads list needs
column pinning, resizing, saved views and virtualised scrolling for 2,000 rows. Headless,
so it styles as ours.

**[cmdk](https://github.com/pacocoursey/cmdk)** — the ⌘K palette. For a counsellor who
lives in this app all day, "type a name, press enter, land on the lead" is the single
biggest speed win available.

### A CRM to study rather than copy

**[twentyhq/twenty](https://github.com/twentyhq/twenty)** (~44k stars) — the leading
open-source CRM. Different stack (Emotion, not Tailwind), and benchmarks call its list UI
bland, so do not copy the chrome. Study its **record page** — how one person's
information, timeline and related records sit together — and its **keyboard model**.

---

## 3. Products to look at

Code only goes so far; these are the ones to open and use.

| Product | What to steal |
|---|---|
| **Linear** | Restraint, density, and status at a glance. Every card shows the same fields in the same places, so the eye learns one pattern and reads a hundred rows. |
| **Attio** | A CRM that feels fast. Record pages, inline editing, and AI output as a real surface rather than a chat bubble floating over the old UI. |
| **PostHog** | Charts that are drillable. Every number is a link to the rows behind it — exactly what our Insights pages should do. |
| **Stripe** | The best financial tables in software. Worth studying before touching Finance or the payment ledger. |
| **Plausible / Supabase** | Simple analytics done honestly: few numbers, clear comparisons, no vanity metrics. |

Galleries: **[saasui.design](https://www.saasui.design/pattern/dashboard)** catalogues
real products screen by screen — dashboards, analytics, empty states, onboarding — which
is far more useful than Dribbble, where nothing has to work.

---

## 4. What I would actually build, in order

Each of these is a self-contained change. None needs a rewrite, and the order is by value
per hour.

### A. The dashboard stops being a wall of numbers

Three **hero figures** for the role — for a counsellor: active leads, admissions this
month, overdue follow-ups — each with the number, a delta against last month, and a
14-day sparkline. The other five figures move into a compact list beneath. One screen,
one answer to "how am I doing", four seconds to read.

Then two charts the dashboard has never had: **leads per day over 30 days** (area, one
hue, with a crosshair) and **this month's admissions against target** (a bar with a
target line, if targets are set).

### B. Insights becomes visual

The data is already computed; it is only ever rendered as a table. Add, following the
project's dataviz rules — one axis, fixed hue order, one hue for magnitude, status
colours reserved for status:

- **Source mix over time** — stacked area, so "Shiksha is 40% of leads and 2% of
  admissions" is visible rather than inferred.
- **Conversion by counsellor** — horizontal bar list, sorted, with the institute average
  as a reference line.
- **Funnel with drop-off** — we have the funnel; add the percentage lost at each step,
  which is the number anybody actually acts on.
- **Collections against bookings** — two bars per month, booked and collected, because
  the gap is the finance conversation.
- **SLA compliance tracker** — 30 squares, one per day, green/amber/red. Tremor's
  Tracker component, ~40 lines.

Every chart gets a hover tooltip and a click-through to the rows behind it. A number
nobody can drill into is a number nobody trusts.

### C. The app feels alive

- **⌘K command palette** — jump to a lead, a student, a settings page, by typing.
- **Loading skeletons** on every list, so a slow page looks like it is working.
- **Empty states that teach** — "No leads yet. They arrive from your ads automatically,
  or add one by hand" with the button, instead of "No results".
- **Sticky table headers and a density toggle** on the leads list.
- **Toasts for every mutation**, so saving something is visibly acknowledged.

### D. The lead page becomes the product

It is where counsellors spend their day, and it currently looks like Settings. Give the
timeline the room, put the next action and the phone button where the thumb is on a
phone, and make logging an interaction feel like one gesture rather than a form.

---

## 5. Rules any of this has to keep

From `CLAUDE.md` and the dataviz skill, so a redesign does not quietly undo them:

- **Theme tokens only.** No hex in a component. Dark mode is a selected palette, not an
  automatic flip.
- **One hue for magnitude; a fixed hue order for identity, never cycled.** Status colours
  (paid, overdue, breached) are reserved and never reused as "series 4".
- **Never a dual-axis chart.** Two measures of different scale are two charts.
- **Phone numbers stay masked in lists** however pretty the list gets.
- **Every chart is also a table**, for accessibility and for the person who wants the
  number.
- **No new dependency without a reason.** Recharts is installed; shadcn and Tremor are
  copy-paste. Nothing above needs a library we do not have.
