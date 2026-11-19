# Offers, resources and automation rules

**The machine-readable source of truth is `config/resources.json` (the free-resource registry); this table is a human summary and may lag.** **Nothing here is enabled for automation.** Status of each is unconfirmed by the owner.
Never advertise a resource until its row says `Exists: yes` and has a link.

| Resource (id in Marketing Brain `config/offers.json`) | Exists? | Suggested trigger | Delivery page on site | DM text | Enabled |
|---|---|---|---|---|---|
| Free demo class (`demo-class`) | configured; stated on site | DEMO | /page/demo-class | TODO | no |
| NID question bank with solutions (`nid-question-bank`) | configured; link untested | NID | /page/nid-b-des-solved-question-bank-self-study | TODO | no |
| NATA previous year papers (`nata-past-papers`) | configured; link untested | NATA | /page/nata-past-question-papers | TODO | no |
| Self-study materials (`self-study-materials`) | configured; link untested | STUDY | /page/self-study-materials-nata-nift-nid | TODO | no |
| Free career guidance call (`career-call`) | configured | CAREER | none (form) | TODO | no |
| Design careers webinar (`career-webinar`) | configured; link untested | WEBINAR | /page/design-career-webinar | TODO | no |
| NID and NIFT age/eligibility checkers | stated on site | ELIGIBLE | TODO | TODO | no |
| AFDSAT scholarship test (`afdsat`) | claim "up to 90% scholarship" **unverified**; never promote | none | | | no |

Rules: do not promote the scholarship percentage until the owner confirms the basis.
Resource downloads are gated by name, phone, email and exam, so every DM link should lead
to a gated form that feeds the CRM (Google Sheet first, then CRM, HMAC-signed).

## Contacts safe for calls to action
- Kochi (Edappally): 9895484652 (phone and WhatsApp). Kannur: 9895484651 (phone and WhatsApp).
- info@afdindia.com. Calicut centre: appears in the site footer, not confirmed; do not mention until the owner confirms.
