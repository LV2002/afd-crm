# Bank reconciliation: the idea

**Every rupee the bank shows must be an entry in the books, and every entry in a bank account must be a line on the
bank statement.** Anything that isn't is listed under **Finance → Reconciliation** until somebody deals with it.

## How it works day to day

1. **You upload the bank statement** (Finance → Bank import). PDF or CSV. A password-protected HDFC PDF is fine: type the
   password next to the file. The file and the password are used to read it and are never saved.
2. The CRM **pairs lines with entries automatically** when the direction and the amount are exactly the same and the dates
   are within a few days. If two entries could both be one line, it pairs nothing and leaves it for you.
3. What's left over is the **exceptions**:
   - **On the bank, not in the books**: money moved and nobody recorded it. The accountant records it from Bank import; the
     entry is then paired automatically.
   - **In the books, not on the bank**: an entry no statement line proves. Wrong amount, wrong account, or it never happened.
   - **Fee payments not in any account**: a receipt was issued but the money isn't against any account.
4. The red number beside **Reconciliation** is the count of open items.

## Who can do what (this is the protection)

| Person | Can |
|---|---|
| Accountant | Upload bank statements. Record entries, and record a bank line as an entry. See every exception. **Cannot** pair by hand, accept a line as having no entry, confirm the bank balance, or count the cash. |
| Admin / co-admin | Everything above, plus pair, undo or accept lines, confirm the bank balance, and count the cash (**Match and review bank and cash**). |

Because the accountant uploads the statements, the uploads themselves are checked:

- **A statement has to join up with the last one.** Its opening balance must equal the balance the previous statement closed on.
  If a month, or some lines, were left out, the balances don't join and the upload is refused.
- **Dates already imported can't change.** New lines on days that were already imported are refused: a bank statement doesn't
  change after the fact. Only an admin can import past that, and it is recorded.
- **Bank balance check.** About once a week an admin reads the balance off the bank's own app or passbook and enters it. It is
  compared with what the statement says for that day. This is the one check that doesn't depend on the uploaded file being
  honest, so **please do it yourself, not through the accountant**. A disagreement stays open (red) until a later check agrees.

Other rules:

- A pair must match **exactly**: same direction, same amount to the paisa. Nobody can force a mismatch through.
- Undoing a pair or accepting a line needs a written reason. Nothing is deleted: the history stays, with who did it.
- Lines set aside ("accepted as having no entry") are listed at the bottom of the page so they get reviewed.
- Reversing a paired entry creates a new exception: the bank has to show the money going back.

## Cash

Cash has no bank statement, so it is kept in its own cash ledger and checked by **counting**:

1. An admin counts the cash box and enters the amount on the Reconciliation page (Cash section).
2. It is set against what the books say the box should hold. If they differ, a few words of explanation are required, and the
   difference is saved with the count. A count is never edited.
3. A box not counted for 8 days is flagged, and a box that came up short or over stays red until a later count agrees.
4. Reversals in cash in the last 60 days are listed with who made them and why, because reversing an entry is how a missing
   receipt is most easily hidden.

Cash is only as good as how often it's counted and who counts it. Count it weekly, and don't let the person who handles the
cash be the one who counts it.

## What it does not catch

- **Cash that was never recorded.** If a student pays cash and nobody writes it down, no count can notice: the box would
  simply hold more than the books say, and that surplus is easy to pocket. The best defence is that the family gets a receipt
  that is recorded in the CRM, so a payment that was never recorded has no receipt to match. Ask families to check the
  receipt number.
- **A wrong category** on a real bank line (a withdrawal booked as "Stationery"). The amounts agree, so this is for you to
  spot when you review the entries. Each shows who recorded it.
- **A statement nobody uploaded.** The coverage table shows the dates each account is checked up to and flags any that is
  more than 35 days old.

## Checking starts at the first statement

Entries dated before the first statement line for an account have nothing to be checked against and aren't counted. Entries
from the last few days, newer than the latest statement, are shown as "waiting" and are not exceptions yet.
