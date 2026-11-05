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
| Accountant (records entries) | Record entries, record bank lines as entries, see every exception. **Cannot** upload statements, pair by hand, or set a line aside. |
| Admin / co-admin | Everything above, plus upload statements (**Upload bank statements**) and pair, undo or accept lines (**Match and review bank transactions**). |

Both are permissions in **Settings → Roles & Permissions**. They are ticked for admin and co-admin only. Give them to the
accountant and the protection is gone, so don't.

- A pair must match **exactly**: same direction, same amount to the paisa. Nobody can force a mismatch through.
- Undoing a pair or accepting a line needs a written reason. Nothing is deleted: the history stays, with who did it.
- Lines set aside ("accepted as having no entry") are listed at the bottom of the page so they get reviewed.
- Reversing a paired entry creates a new exception: the bank has to show the money going back.

## What it does not catch

- **Cash that was never recorded.** If a student pays cash and nobody writes it down, there is nothing to compare. The
  safeguard is to deposit cash into the bank promptly: the deposit then has to be explained.
- **A wrong category** on a real bank line (a withdrawal booked as "Stationery"). The amounts agree, so this is for you to
  spot when you review the entries. Each shows who recorded it.
- **A statement nobody uploaded.** The coverage table shows the dates each account is checked up to and flags any that is
  more than 35 days old, and the upload warns about a gap between two statements.

## Checking starts at the first statement

Entries dated before the first statement line for an account have nothing to be checked against and aren't counted. Entries
from the last few days, newer than the latest statement, are shown as "waiting" and are not exceptions yet.
