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

## Google data (automatic once set up)
One read-only service account reads Search Console and GA4. Setup, about 10 minutes:
1. In Google Cloud (project of your choice), create a service account and a JSON key. Save it as
   `secrets/google-service-account.json` (git-ignored; never commit it, this repository is public).
   An earlier account existed for Marketing Brain (`afd-marketing-engine-service-a@afd-marketing-engine.iam.gserviceaccount.com`);
   if you still have its key you can reuse it.
2. Search Console: add the key's `client_email` as a user (Restricted is enough) on `sc-domain:afdindia.com`.
3. Analytics: add the same email as a Viewer on property `405959903`. Mark `generate_lead` as a key event (Admin, Events).
4. Enable the "Google Search Console API" and "Google Analytics Data API" in the same Cloud project.
5. Run `node tools/google-sync.mjs` on your own computer. First run backfills 90 days; later runs re-read the last 4 days.
   It writes `performance/google/<date>.md` and `.json` and keeps `data/analytics.db` (git-ignored).
Sites are set in `config/google.json`. Nothing here writes to Google: scopes are read-only.
