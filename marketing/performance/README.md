# Performance data drop folder

Put exports here, one folder per platform and month, e.g. `performance/instagram/2026-12/`.
Accepted: CSV/XLSX/JSON exports or pasted tables. The performance-analyst reads whatever is here.

| Platform | Where to export | Key metrics |
|---|---|---|
| Instagram | Meta Business Suite > Insights > Content (export CSV) | reach, saves, shares, likes, comments, profile visits, follows, plays and watch time (reels) |
| YouTube | YouTube Studio > Analytics > Content (Advanced mode, export) | views, impressions CTR, average view duration, average percentage viewed, subscribers gained |
| Google Business Profile | Business Profile > Performance (or Insights export) | views, calls, direction requests, website clicks, post views and clicks |
| Blog and site | Search Console (Performance, pages and queries) and GA4 (pages, `generate_lead` events) | impressions, clicks, position, enquiries per page |
| Leads | CRM or Google Sheet "Lead outcomes" tab | enquiries, contacted, demo, admitted, revenue by source and page |

Each content piece has an id (its slug). Record the piece-to-post mapping in `queue/posted/<slug>.md`
(`ig_media_id`, `youtube_url`, `gbp_post`, `blog_url`) so metrics can be joined to the piece.
No automated feed exists yet; API automation comes after Meta, YouTube and Business Profile approvals.
