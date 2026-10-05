# Chapter 3 — Roles and permissions

## 3.1 How access works here

Three things decide what you can do.

**1. Your role.** Admin, Co-Admin, Centre Head, Counsellor, Accounts,
Academics — or any role an administrator has invented. Roles are not
fixed in the software; they are editable records.

**2. The permissions in that role.** A role is a bundle of named
permissions — 45 of them exist. `lead.read` lets you see leads;
`payment.record` lets you take a payment; and so on. The full list is in
the Appendix.

**3. The scope of each permission.** Every permission is granted at one of
three widths:

| Scope | Means |
|---|---|
| **own** | Only records assigned to you |
| **centre** | Every record at the centre(s) you belong to |
| **all** | The whole institute |

So "Counsellor" is really "`lead.read` at **own**, `lead.update` at
**own**, …". A Centre Head has many of the same permissions at **centre**.

**This is enforced in the database, not just hidden in the screens.** You
cannot reach another counsellor's lead by typing its address into your
browser — the database will not return it.

## 3.2 The six roles as shipped

An administrator can change any of these. This is how they start.

### Admin
Everything, at institute scope. Protected: the Admin role cannot be
deleted, and its permissions cannot be stripped, so the institute can
never lock itself out.

### Co-Admin
Everything Admin has, at institute scope, **except** resetting passwords
and reading the audit log.

### Centre Head
Their own centre(s), at **centre** scope:
leads (read, create, update, assign, merge, export, reveal phone, import),
interactions, WhatsApp (read and send), files (including delete),
enrolments (read, create, update, drop), payments (read),
discount approval, finance (read and record), students (read),
batches, reports (own centre), targets, and user management.

They do **not** get: recording or refunding payments, managing finance
accounts, the audit log, or system settings.

> Why no audit log? It cannot be limited to one centre — a record about a
> role change belongs to no centre — so a centre-scoped grant would show
> the whole institute's log. It stays with Admin.

### Counsellor
Their own leads, at **own** scope: read, create and update leads, reveal a
phone number, log interactions, read and send WhatsApp, read and upload
files, read and create enrolments, change the course or batch of an
admission they sold, read payments, and read reports about their own
leads.

They cannot: assign leads to anyone, merge, export, import, delete,
record payments, see Finance, or reach Settings.

### Accounts
Their centre(s), at **centre** scope: read leads and reveal phone numbers,
read interactions, read and upload files, read/record/refund payments,
approve discounts, full finance (read, record, manage accounts), read
enrolments, **change a fee** and change a course or batch, mark an
admission dropped, read students, and centre reports.

They cannot create or edit leads.

### Academics
Their centre(s), at **centre** scope: read and update students, manage
batches, read and upload files, read enrolments and change the course or
batch on one, and centre reports.

They cannot change a fee — that stays with accounts and the centre head.

They see no leads at all.

## 3.3 Discount authority

Separately from permissions, each role has a ceiling on how much it can
take off a fee before the discount needs approving. As shipped:

| Role | Maximum percent | Maximum amount | Unlimited? |
|---|---|---|---|
| Admin | — | — | Yes |
| Co-Admin | — | — | Yes |
| Centre Head | 25% | ₹25,000 | No |
| Counsellor | 10% | ₹5,000 | No |
| Accounts | 25% | ₹25,000 | No |
| Academics | 0% | ₹0 | No |

A discount above your ceiling is not refused — it is recorded as
**pending approval** and someone with `discount.approve` decides.
Administrators change these in **Settings → Discount Authority**.

## 3.4 Belonging to more than one centre

A user can be attached to several centres. Every "centre" scoped
permission then covers all of them. An administrator sets this in
Settings → Users.

## 3.5 What happens when you lack permission

Three different things, depending on where you are:

- **The sidebar entry is absent.** You cannot reach the section at all.
- **The page says you do not have permission.** You reached it by link or
  by typing the address.
- **The button is simply not there.** For example, a counsellor sees no
  **Export CSV** on the leads list. The action does not exist for you
  rather than failing when pressed.

If you believe you should have something, ask an administrator rather than
working around it — every one of these is deliberate.

## 3.6 Procedure: find out what you can do

### Goal
Settle an argument about whether you are allowed to do something.

### Before you start
Nothing.

### Steps
1. Look at your sidebar. Anything missing is something you cannot reach.
2. Open a lead you own and look at which panels appear.
3. If you need more detail, ask an administrator to open
   **Settings → Roles & Permissions**, open your role, and read the list.

### What you should see
The role page lists every permission with its scope, so there is a
definitive answer rather than a guess.

### Related
- Chapter 13 — Admin guide: creating roles and users
- Chapter 18 — Appendix: the full permission reference

---

[Back to contents](#contents)
