# Payroll, salary payments and biometric attendance

## The monthly routine
1. **Attendance.** Punches arrive from the biometric devices (see below). HR → Attendance shows each person's days, late and early minutes.
2. **Generate.** HR → Payroll → *Generate a payslip*. Pick the month and the person. The form shows their brought-forward leave and
   advance, takes **approved leave from the leave slips** (it can't be changed here), and offers the biometric suggestions (late,
   early, one punch, no punch) for you to check and edit. Add overtime, arrears, incentives, bonus, insurance, advances.
3. **Approve.** The owner approves each payslip. Nothing can be paid until then.
4. **Pay.** Open the payslip → record the payment from a bank account or the cash box. Or, if the money has already left the bank
   and the statement is imported, pick the statement line on the payslip: one click makes it the payment.
5. **Check.** HR → Payroll for the month shows each person's net pay, whether it is approved, how much has been paid, and whether a
   **bank statement line proves it**.

## "Was it paid?"
| Shown | Means |
|---|---|
| Paid | Everything owed is recorded, and the bank statement proves it (cash is shown as cash). |
| Recorded, not on statement | In the books, but no statement line proves it yet. Wait for the statement, or ask why. |
| Part paid | Some paid, some still owed. |
| Unpaid | Nothing recorded. |

A payment that is reversed stops counting as paid. You can't pay more than what is owed.

## The rules (all from your brief, all editable in Policy & holidays)
- Leave: 6 sick and 6 casual, reset 1 January, joining-year proration. **Probation:** only 1 paid sick/casual a month; more become loss of pay.
  A leave with no balance (or under 1 day) is loss of pay. A half day is 0.5 day of loss of pay.
- Late coming and early exit are separate, each with a 60-minute free allowance; the excess ÷ days in the month × 0.5 is the days deducted.
- Loss of pay = days × (the gross in force that day ÷ days in the month).
- A joiner is paid from the joining day. A promotion blends the old and new pay across the month, from its effective date.
- An advance given this month does not change this month's pay; only the repayment does.

## Who can do what
| | |
|---|---|
| Employee | Sees their own approved payslips under My HR. |
| Accounts / HR | Generate payslips, record salary payments, see pay. **Cannot** change pay rates, regenerate, or approve. |
| Owner / co-admin | Everything: set pay and bank details, revise pay, approve, regenerate, payroll rules, attendance setup. |

A manager does **not** see their reports' pay. Every change to somebody's pay, every generation, approval and payment is on the audit trail.
A regenerated month adds a new version; the old one is kept. Months go in order, and only the latest can be regenerated.
The payslip page also warns when the biometric device saw nobody on a day the slip doesn't treat as leave or loss of pay, so a missing
deduction can be noticed by someone other than whoever made the slip.

## Biometric attendance (eSSL)
Three ways in. Use whichever fits your setup; the report works the same.
1. **The device pushes to the CRM.** Devices with a "cloud server" (ADMS) setting: register the device serial under HR → Attendance → Setup and
   set the device's server address to this site. *Written from the protocol and tested in parts, but not yet tried on a real eSSL device:
   watch the first connection.*
2. **A relay next to the eSSL software.** A small script reads the software's log and posts it to `/api/webhooks/essl` with a key made on the
   Attendance page. The key is shown once, and only its hash is kept.
3. **Import a CSV** exported from the software (HR → Attendance → Import punches). Overlapping files are fine: a punch is never stored twice.

Each person needs their **biometric code** (their number on the device) on their employee page; codes seen on the device with no owner are
listed on the Attendance page to map. The report measures the first and last punch of each working day against the shift (default 9:30 to 5:30,
editable), skips days off, holidays, leave and days before joining, and **only suggests**: a missing punch is as likely to be a flat battery as an absence.

## Not built
- Importing the old payslips (needs your data file) and PDF generation: slips print from the browser (Print → Save as PDF).
- One bank transfer covering several people's salaries: each salary pairs with its own statement line.
- Late/early exemptions per employee or per shift, and half-day detection from punches.
