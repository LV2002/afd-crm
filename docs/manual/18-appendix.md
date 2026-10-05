# Chapter 18 — Appendix

## 18.1 Lead field reference

These are the fields as shipped. An administrator can add, hide or rename
any of them (Settings → Custom Fields), so your system may differ.

**List** = appears as a column on the Leads list.
**Filter** = appears in the filter bar.

### Personal

| Field | Type | What to enter | Notes |
|---|---|---|---|
| **Student Name** | Text | The student's name, not the parent's | **Required**, List |
| Father's Name | Text | The parent you actually deal with | |
| **Primary Phone** | Phone | Any format; normalised to `+91…` | **Required**, List, Filter. Masked in lists |
| Alternate Phone | Phone | A second number | |
| Email | Email | | |
| Date of Birth | Date | | |
| City | Text | Where they live | Filter |
| State | Dropdown | | Filter |
| State (specify) | Text | Only if the state is not in the list | |
| District | Dropdown | | Filter |
| Pincode | Text | | |
| Parents' Occupation | Text | Useful context for fee conversations | |

### Education

| Field | Type | What to enter | Notes |
|---|---|---|---|
| Education Status | Dropdown | 10th, 11th, 12th, 12th Pass, Diploma, Graduate, Other | Filter |
| School / College | Text | Where they study now | |
| Previous Attempts | Number | How many times they have sat the exam | |
| Competitor Student? | Yes/No | Already coaching elsewhere | |
| Competitor Institute | Text | Which one | |

### Preferences

| Field | Type | What to enter | Notes |
|---|---|---|---|
| Interested Exams | Multi-select | NID, NIFT UG, NIFT MDes, UCEED, CEED, NATA, JEE Paper 2 | Filter |
| Exam Year | Text | Four digits, e.g. `2027` | Filter |
| Courses Interested | Multi-select | Foundation, DWO, DAO, DRH, Crash, Repeat Batch, MDes, Consultancy | Filter |
| Preferred Mode | Dropdown | Online, Offline, Hybrid | |

### Tracking

| Field | Type | What to enter | Notes |
|---|---|---|---|
| Lead Source | Dropdown | Set automatically for ad and form leads | List, Filter. First touch is never overwritten |
| Sub-source | Text | The specific form or campaign | |
| Stage | Dropdown | Set by moving the lead, not typed | List, Filter |
| Temperature | Dropdown | Hot, Warm, Cold, Dead | List, Filter. Manual override lasts a few days |
| Assigned Counsellor | Person | Set by the rules or by assigning | List, Filter |
| Centre | Dropdown | | List, Filter |
| Next Follow-up | Date & time | **The most important field on the lead** | List. Drives your daily queue |
| Referred by | Lead | Who sent them | Powers the Referrals report |
| Brochure Sent | Yes/No | | |

## 18.2 Student field reference

Thirty fields in five sections. Most come from the student's own profile
form.

**Personal** — Name*, Student Phone Number*, Email, DOB, Parent Phone,
City, Address, Pincode, State

**Parents** — Mother Name, Mother Phone Number, Father Name, Father Phone
Number

**Program** — Course, Batch, Centre, Date of Joining, Design Exam
Interested In, Exam Year

**Academic History** — Student Current Qualification, Last/Current School
Attended, 11th & 12th Stream, Exam Board, 10th Percentage, 12th
Percentage, Art Teacher Name, Art Teacher Contact Number

**Interests & Notes** — Design Discipline Interested In, Areas of
Interest & Hobbies, Comments

(*) required. Program fields are filled by the institute and are **not**
asked on the student-facing form.

## 18.3 Stage reference

| Stage | Type | Probability | SLA | Reason required |
|---|---|---|---|---|
| New Lead | new | 5% | — | |
| Contacted | normal | 10% | 4h | |
| Qualified | normal | 20% | 24h | |
| Demo Scheduled | scheduled | 35% | 48h | |
| Demo Completed | normal | 45% | 24h | |
| Counselling Done | normal | 55% | 48h | |
| Brochure Sent | normal | 40% | 72h | |
| Follow-up | normal | 50% | 72h | |
| Registration Form Sent | enrolment_form | 65% | 48h | |
| Registration Form Submitted | enrolment_form | 80% | — | |
| Payment Pending | payment | 90% | 24h | |
| Admission Confirmed | won | 100% | — | |
| Lost | lost | 0% | — | Yes |
| Parked | parked | 15% | — | |

## 18.4 Status reference

**Temperature** — Hot · Warm · Cold · Dead

**Student status** — Active · On hold · Completed · Dropped

**Lost reason** — Not Interested · Budget Constraint · Joined Competitor ·
Not Reachable · Wrong Number · Other

**Consent status** — Given · Withdrawn · Pending

**Interaction type** — Call · WhatsApp · Email · SMS · Walk-in · Meeting ·
Note

**Interaction outcome** — Connected · Not Reachable · Call Back Later ·
Interested · Not Interested · Demo Scheduled · Converted

**Payment method** — Cash · UPI · Card · NEFT · Cheque · Other

**Lead source** — Meta · Google · Website · Walk-in · Referral ·
Purchased Database · Knorish · WhatsApp · Instagram · Other

**Task type** — Follow-up Call · Send Brochure · Document Collection ·
Demo · Other

**Preferred mode** — Online · Offline · Hybrid

**Gender** — Male · Female · Other · Prefer not to say

**Expense category** — Salaries · Rent · Mobile Bills & WiFi ·
Electricity · Printing · Google Ads · Meta Ads · Other Marketing · Bank
Charges · Stationery & Office Supplies · Travel & Conveyance · Repairs &
Maintenance · Software & Subscriptions · Professional Fees (CA/Legal) ·
Other Expenses

**Other income category** — Study Material Sales · Test Series Sales ·
Workshop / Seminar Income · Late Fee / Penalty Collected · Sponsorship /
Grant · Other Income

**Exam** — NID · NIFT UG · NIFT MDes · UCEED · CEED · NATA · JEE Paper 2

**Course** — Foundation · DWO · DAO · DRH · Crash · Repeat Batch · MDes ·
Consultancy

All of these are editable in Settings → Dropdowns.

## 18.5 Permission reference

| Permission | Lets you |
|---|---|
| `lead.read` | See leads |
| `lead.create` | Create a lead |
| `lead.update` | Edit a lead, move its stage |
| `lead.delete` | Delete and restore leads |
| `lead.assign` | Assign leads, see Unassigned |
| `lead.merge` | Resolve merge review |
| `lead.export` | Export leads to CSV |
| `lead.reveal_phone` | Reveal a full phone number |
| `lead.import` | Import from CSV |
| `interaction.read` | See the timeline |
| `interaction.create` | Log an interaction |
| `whatsapp.read` | See Chats |
| `whatsapp.send` | Send a message |
| `whatsapp.campaign` | Templates, broadcasts, automations, opt-outs |
| `enrolment.read` | See admissions |
| `enrolment.create` | Confirm an admission |
| `enrolment.update` | Change the fee plan |
| `enrolment.change_plan` | Change the batch, mode or academic year |
| `enrolment.change_course` | Change the course — academics, admin and co-admin only |
| `enrolment.drop` | Mark an admission dropped |
| `payment.read` | See payments |
| `payment.record` | Record a payment |
| `payment.refund` | Refunds and reversals |
| `discount.approve` | Approve a discount above somebody's limit |
| `finance.read` | See Finance |
| `finance.record` | Record expenses, income, transfers |
| `finance.manage` | Manage bank and cash accounts |
| `student.read` | See students |
| `student.update` | Edit a student, mark onboarding done |
| `batch.manage` | Manage batches |
| `file.read` | Open attachments |
| `file.upload` | Upload attachments |
| `file.delete` | Delete attachments |
| `report.read` | See Insights |
| `report.center` | Reports across a centre |
| `report.org` | Reports across the institute, incl. Ad Performance |
| `target.manage` | Set targets |
| `ai.query` | Use Ask AI |
| `settings.manage` | Reach Settings |
| `user.reset_password` | Reset a password (Admin only) |
| `users.manage` | Create and edit users |
| `roles.manage` | Create and edit roles |
| `rules.manage` | Edit assignment rules |
| `config.export` | Export the config bundle |
| `config.import` | Import a config bundle |
| `audit.read` | Read the audit log (Admin only) |

Each is granted at **own**, **centre** or **all**.

## 18.6 Where do I find X?

| I want to… | Go to |
|---|---|
| Find a lead by name or number | **Leads**, search box, press Enter |
| See what I should do today | **Dashboard** |
| See leads nobody owns | **Unassigned** |
| Add a walk-in | **Leads → New lead** |
| Log a call | Lead page → **Log an interaction** |
| See a full phone number | Lead page → click the masked number |
| Move a lead's stage | **Pipeline**, drag the card |
| Mark a lead lost | Drag to **Lost**, give a reason |
| Confirm an admission | Lead page → **Confirm admission** |
| Set up instalments | Lead page → **Fees & instalment agreement** |
| Print the agreement | Same panel |
| Record a payment | **Admissions** → the student → **Record a payment** |
| Print a receipt | **Admissions** → the student → **Payment ledger** |
| Approve a discount | Lead or admission → the pending discount panel |
| Mark somebody dropped | **Admissions** → the student → drop panel |
| See who owes money | **Finance → Collections** |
| Record an expense | **Finance → Record entry → Expense** |
| Reconcile a bank account | **Finance → Account ledger** |
| See this month's finances | **Finance → Monthly** |
| Send a student their profile form | Lead page → **Student profile form** → **Copy link** |
| See submitted profile forms | **Student Profile Forms** |
| Mark a student onboarded | **Students → Onboarding** → **Onboarding done** |
| Reply to a WhatsApp message | **Chats** |
| Send a campaign | **Chats → Broadcasts → New broadcast** |
| See who opted out | **Chats → Opted out** |
| Turn an Instagram DM into a lead | **Chats → Instagram → Convert to lead** |
| See conversion by source | **Insights → Sources** |
| See who refers people | **Insights → Referrals** |
| See progress against targets | **Insights → Targets** |
| See what ads cost | **Ad Performance** |
| Ask a question in English | **Ask AI** |
| Import a spreadsheet | **Leads → Import** |
| Export leads | **Leads → Export CSV** |
| Restore a deleted lead | **Leads → Deleted** |
| Resolve a duplicate | **Leads → Merge review** |
| Add a user | **Settings → Users** |
| Change what a role can do | **Settings → Roles & Permissions** |
| Add a pipeline stage | **Settings → Pipeline Stages** |
| Change who gets new leads | **Settings → Assignment Rules** |
| Add a dropdown option | **Settings → Dropdowns** |
| Add a field to the lead form | **Settings → Custom Fields** |
| Set a course fee | **Settings → Fee Structures** |
| Create a discount offer | **Settings → Offers** |
| Change discount limits | **Settings → Discount Authority** |
| Rename "Lead" | **Settings → Terminology** |
| Change the letterhead | **Settings → Organisation** |
| Connect Meta or Google | **Settings → Integrations** |
| Import past ad spend | **Settings → Integrations → Meta / Google** |
| Change the retargeting window | **Settings → Integrations** |
| See who changed something | **Settings → Audit Log** |
| See what has broken | **Settings → Platform Health** |

---

[Back to contents](#contents)
