# Inventory — everything the manual must cover

Compiled by reading the codebase on 4 October 2026. This is the checklist:
every line here must appear somewhere in the manual. The right-hand column
is the chapter that covers it.

Counts at the time of writing: **103 pages**, **18 API routes**, **66 database
tables**, **45 permissions**, **6 seeded roles**, **14 pipeline stages**,
**17 dropdown categories**, **30 lead fields**, **34 student fields**,
**7 dashboard widgets**, **25 settings screens**.

---

## 1. Screens — the sidebar

| Screen | Route | Permission | Chapter |
|---|---|---|---|
| Dashboard | `/dashboard` | (everyone) | 4 |
| Leads (list) | `/leads` | `lead.read` | 5 |
| Pipeline (kanban) | `/pipeline` | `lead.read` | 5 |
| Unassigned | `/leads/orphans` | `lead.assign` | 5 |
| Admissions | `/accounts` | `payment.read` | 7 |
| Students | `/students` | `student.read` | 8 |
| Finance | `/finance` | `finance.read` | 9 |
| Chats | `/whatsapp` | `whatsapp.read` | 10 |
| Student Profile Forms | `/profile-forms` | `lead.read` | 8 |
| Insights | `/insights` | `report.read` | 11 |
| Ad Performance | `/marketing` | `report.read` (+ `report.org` to see it) | 11 |
| Ask AI | `/ask` | `ai.query` | 11 |
| Settings | `/settings` | `settings.manage` | 13 |

Sidebar badges (red counts): Unassigned, Admissions, Students, Chats,
Student Profile Forms. — Chapter 4.

## 2. Screens — leads

| Screen | Route | Chapter |
|---|---|---|
| Lead detail | `/leads/[id]` | 6 |
| New lead | `/leads/new` | 5 |
| Import | `/leads/import` | 12 |
| Merge review | `/leads/merge-review` | 6 |
| Deleted leads | `/leads/deleted` | 6 |
| Unassigned queue | `/leads/orphans` | 5 |
| Instalment agreement (print) | `/leads/[id]/instalment-agreement` | 7 |
| Profile form (print) | `/leads/[id]/profile-form/print` | 8 |
| Public profile form | `/f/[token]` (no login) | 8 |

## 3. Screens — admissions, students, finance

| Screen | Route | Chapter |
|---|---|---|
| Admissions list | `/accounts` | 7 |
| Admission detail / record payment | `/accounts/[id]` | 7 |
| Receipt (print) | `/accounts/[id]/receipt/[paymentId]` | 7 |
| Students list | `/students` | 8 |
| Student detail | `/students/[id]` | 8 |
| Student record (print) | `/students/[id]/print` | 8 |
| Onboarding queue | `/students/onboarding` | 8 |
| Handovers | `/handovers` | 8 |
| Finance dashboard | `/finance` | 9 |
| Collections | `/finance/collections` | 9 |
| Monthly report | `/finance/reports` | 9 |
| Yearly report | `/finance/reports/year` | 9 |
| Cash flow | `/finance/reports/cash-flow` | 9 |
| Transactions | `/finance/transactions` | 9 |
| Account ledger | `/finance/ledger` | 9 |
| Record entry | `/finance/record` | 9 |
| Bank & cash accounts | `/finance/accounts` | 9 |

## 4. Screens — chats

| Screen | Route | Chapter |
|---|---|---|
| WhatsApp Business inbox | `/whatsapp` | 10 |
| Personal WhatsApp (explainer) | `/whatsapp/personal` | 10 |
| Instagram DMs | `/whatsapp/instagram` | 10 |
| Templates | `/whatsapp/templates` | 10 |
| Broadcasts | `/whatsapp/broadcasts`, `/new` | 10 |
| Automations (flows) | `/whatsapp/flows`, `/new`, `/[id]` | 10 |
| Opted out | `/whatsapp/suppressions` | 10 |

## 5. Screens — insights and reporting

| Screen | Route | Chapter |
|---|---|---|
| Explore | `/insights` | 11 |
| Sources | `/insights/sources` | 11 |
| Timing | `/insights/timing` | 11 |
| Handovers | `/insights/handovers` | 11 |
| Segments | `/insights/segments` | 11 |
| Referrals | `/insights/referrals` | 11 |
| Targets | `/insights/forecast` | 11 |
| Activity | `/insights/activity` | 11 |
| Ad Performance | `/marketing` | 11 |
| Ask AI | `/ask` | 11 |

## 6. Screens — settings (25)

Organisation · Terminology · Centres · Users · Roles & Permissions ·
Pipeline Stages · Temperatures · Assignment Rules · SLA Policies ·
Batches · Fee Structures · Payment Reminders · Audit Log ·
Platform Health · Targets · Offers · Discount Authority · Tags ·
Dropdowns · Dashboards · Notifications · Student Profile Form ·
Custom Fields · Config Export/Import · Integrations (Meta, Google,
WhatsApp, Website). — Chapter 13.

## 7. Other screens

| Screen | Route | Chapter |
|---|---|---|
| Login | `/login` | 2 |
| Notifications | `/notifications` | 4 |
| My Day (redirects to Dashboard) | `/my-day` | 4 |

## 8. Roles (seeded)

Admin · Co-Admin · Centre Head · Counsellor · Accounts · Academics.
Roles are database rows and can be renamed, edited or created. — Chapter 3.

## 9. Permissions (45 primitives)

`lead.read` `lead.create` `lead.update` `lead.delete` `lead.assign`
`lead.merge` `lead.export` `lead.reveal_phone` `lead.import`
`interaction.read` `interaction.create` `whatsapp.read` `whatsapp.send`
`whatsapp.campaign` `enrolment.read` `enrolment.create` `enrolment.update`
`enrolment.change_plan` `enrolment.drop` `payment.read` `payment.record` `payment.refund`
`discount.approve` `finance.read` `finance.record` `finance.manage`
`student.read` `student.update` `batch.manage` `file.read` `file.upload`
`file.delete` `report.read` `report.center` `report.org` `target.manage`
`ai.query` `settings.manage` `user.reset_password` `users.manage`
`roles.manage` `rules.manage` `config.export` `config.import` `audit.read`

Each is granted at a scope: **own**, **centre** or **all**. — Chapter 3,
Appendix.

## 10. Pipeline stages (seeded, 14)

New Lead · Contacted · Qualified · Demo Scheduled · Demo Completed ·
Counselling Done · Brochure Sent · Follow-up · Registration Form Sent ·
Registration Form Submitted · Payment Pending · Admission Confirmed ·
Lost · Parked. — Chapter 5, Appendix.

Stage types (fixed in code): `new` `normal` `scheduled` `enrolment_form`
`payment` `won` `lost` `parked`.

## 11. Dropdown categories (17)

temperature · lead_source · exam · course · education_status ·
preferred_mode · gender · lost_reason · consent_status · payment_method ·
interaction_type · interaction_outcome · finance_income_category ·
finance_expense_category · whatsapp_optin_keyword ·
whatsapp_optout_keyword · task_type. — Chapter 13, Appendix.

## 12. Business logic and automation

| Thing | Where | Chapter |
|---|---|---|
| Identity resolution / never reject a duplicate | `resolveOrCreateLead()` | 6, 12 |
| Assignment rules engine | `applyAssignment()` | 13 |
| Temperature recalculation (nightly) | `/api/cron/recompute-temperature` | 5, 13 |
| SLA sweep and escalation (nightly) | `/api/cron/sla-sweep` | 5, 13 |
| Payment reminders (nightly) | `/api/cron/payment-reminders` | 7, 13 |
| WhatsApp automations (nightly) | `/api/cron/whatsapp-flows` | 10 |
| Scheduled broadcasts (nightly) | `/api/cron/whatsapp-broadcast-sweep` | 10 |
| Meta / Google ad spend sync (nightly) | `/api/cron/ad-spend-sync/*` | 11, 13 |
| Retargeting audience sync (nightly) | `/api/cron/retargeting-sync/*` | 13 |
| Google offline conversions (nightly) | `/api/cron/google-conversions` | 13 |
| The one nightly job that runs them all | `/api/cron/daily`, 10:00 IST | 13 |
| Two handover gates | `sales_to_accounts_at`, `accounts_to_academics_at` | 7, 8 |
| Append-only ledger, gapless receipt numbers | `payments`, `receipts` | 7, 9 |
| Phone masking + reveal audit | `maskPhone()`, `lead.reveal_phone` | 5, 6 |
| Soft delete (`deleted_at`), nothing hard-deleted | everywhere | 6 |
| Audit log on every mutation and export | `audit_log` | 13 |
| Consent capture and withdrawal | `consentOnEntry()` | 10, 13 |

## 13. Integrations and inbound

| Thing | Route / screen | Chapter |
|---|---|---|
| Meta Lead Ads webhook | `/api/webhooks/meta-leads` | 13 |
| Meta custom question mapping | `mapMetaCustomAnswers()` | 13 |
| Instagram DM webhook | `/api/webhooks/instagram` | 10, 13 |
| WhatsApp Cloud API webhook | `/api/webhooks/whatsapp` | 10, 13 |
| Google Lead Form webhook | `/api/webhooks/google-leads` | 13 |
| Website form webhook | `/api/webhooks/website` | 13 |
| Ad spend history import (button) | Settings → Integrations | 13 |
| Retargeting window setting | Settings → Integrations | 13 |
| Recent deliveries panels | Settings → Integrations | 13, 14 |

## 14. Import / export / bulk

CSV import wizard (upload → map columns → preview → import) ·
Lead export (CSV, audited) · Config export/import bundle ·
Bulk assignment from the Unassigned queue · Merge review. — Chapter 12.

## 15. Notifications

In-app notification list · bell badge · email via Resend ·
per-event, per-role settings with editable copy · Platform Health
alerts. — Chapters 4, 13.

## 16. Printed documents

Instalment agreement · Payment receipt · Student record ·
Student profile form. — Chapters 7, 8.

---

## Covered where?

Every row above names its chapter. Chapter 15 (common workflows),
Chapter 14 (troubleshooting), Chapter 16 (FAQ), Chapter 17 (glossary) and
Chapter 18 (appendix) cut across all of it.

---

## Verification, 4 October 2026

Checked after writing:

- **79 named features and screens** from this inventory searched for in
  the chapters — all 79 present.
- **57 on-screen labels** quoted in procedures (`Confirm admission`,
  `Yes, record it`, `Skip this column`, `Onboarding done`, `Assign to…`,
  `Escalation ladder (JSON array)` …) grepped back against the source —
  all 57 found.
- **Seeded data re-read from `seed.ts`**: 6 roles, 45 permissions, 14
  stages with their types, probabilities and SLA hours, 17 dropdown
  categories with every option, 30 lead fields, 34 student fields, 7
  dashboard widgets, discount limits per role, finance categories.
- **Spot-checked against the code**: the export and phone-reveal audit
  writes, the `/my-day` → `/dashboard` redirect, `/handovers` →
  `/insights/handovers`, the import wizard's required columns, the
  nightly job order, and the assignment strategies.

Not covered, deliberately: internal technical documents
(`docs/HANDBOOK-TECHNICAL.md`, `docs/01-DATA-MODEL.md`,
`docs/02-BUILD-PHASES.md`, `CLAUDE.md`), which are for whoever maintains
the code, not for staff. `docs/ADS-SETUP.md` is referenced from
Chapter 13 rather than duplicated.

Seven items could not be answered from the code and are listed in
`_open-questions.md`.
