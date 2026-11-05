import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { getFinanceCenterId } from "@/lib/finance/center-filter";
import { STALE_STATEMENT_DAYS, getReconciliation } from "@/lib/finance/reconcile-queries";
import { formatINR } from "@/lib/format/currency";
import { formatDateIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import { PairButton, ReasonForm, RunMatchingButton } from "./reconcile-forms";

export const dynamic = "force-dynamic";

const day = (iso: string) => formatDateIST(`${iso.slice(0, 10)}T12:00:00+05:30`, "d MMM yyyy");

/**
 * Where the books and the bank are held against each other.
 *
 * Every line on a bank statement should be an entry in the books, and every
 * entry in a bank account should be a line on a statement. Whatever is not,
 * is listed here until somebody deals with it. Nothing on this page can be
 * edited away by the person keeping the books: pairing and accepting a line
 * need their own permission, and every action is recorded with who did it.
 */
export default async function ReconcilePage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.read")) return <AccessDenied />;

  const supabase = await createClient();
  const centerId = await getFinanceCenterId(supabase);
  const scope = scopeFor(user, "finance.read");
  const data = await getReconciliation(scope === "all" ? null : user.centerIds, centerId);
  const canReconcile = can(user, "bank.reconcile");

  const open = data.lines.length + data.entries.length + data.payments.length;
  const noStatements = data.coverage.every((c) => c.lines === 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Bank reconciliation</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every line on the bank statement should be an entry in the books, and every entry in a bank account
            should be a line on the statement. What isn&apos;t is listed below until it is dealt with.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Open items" value={String(open)} bad={open > 0} />
          <Stat label="On the bank, not in the books" value={String(data.lines.length)} bad={data.lines.length > 0} />
          <Stat label="In the books, not on the bank" value={String(data.entries.length)} bad={data.entries.length > 0} />
          <Stat label="Paired" value={String(data.matchedCount)} />
        </dl>
        {data.awaitingStatement > 0 && (
          <p className="text-xs text-muted-foreground">
            {data.awaitingStatement} recent entr{data.awaitingStatement === 1 ? "y is" : "ies are"} newer than the last
            statement and can&apos;t be checked yet. They are not counted above.
          </p>
        )}
      </section>

      {noStatements && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No bank statement has been uploaded yet, so there is nothing to check against. Checking starts from the first
          statement line.{" "}
          <Link href="/finance/bank" className="font-medium underline">
            Bank import
          </Link>
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Statement coverage</h3>
        <p className="text-xs text-muted-foreground">
          Days with no statement are days nobody checked. A statement older than {STALE_STATEMENT_DAYS} days is flagged.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Account</th>
                <th className="p-2">Centre</th>
                <th className="p-2">Covers</th>
                <th className="p-2">Lines</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {data.coverage.map((c) => (
                <tr key={c.accountId} className="border-t">
                  <td className="p-2 font-medium">{c.name}</td>
                  <td className="p-2">{c.centerName}</td>
                  <td className="p-2">
                    {c.from && c.to ? (
                      <>
                        {day(c.from)} – {day(c.to)}{" "}
                        {c.daysSince !== null && c.daysSince > STALE_STATEMENT_DAYS && (
                          <Badge variant="destructive">{c.daysSince} days old</Badge>
                        )}
                      </>
                    ) : (
                      <Badge variant="destructive">No statement</Badge>
                    )}
                  </td>
                  <td className="p-2">{c.lines}</td>
                  <td className="p-2">{canReconcile && c.lines > 0 && <RunMatchingButton accountId={c.accountId} name="now" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">On the bank statement, not in the books ({data.lines.length})</h3>
        <p className="text-xs text-muted-foreground">
          Money that moved through the bank with no entry. Record it from{" "}
          <Link href="/finance/bank" className="underline">
            Bank import
          </Link>{" "}
          (the entry is then paired automatically), or pair it with an entry that already exists.
        </p>
        {data.lines.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Account</th>
                  <th className="p-2">Bank narration</th>
                  <th className="p-2 text-right">Amount</th>
                  {canReconcile && <th className="p-2">Resolve</th>}
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr key={l.id} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap">{day(l.occurredOn)}</td>
                    <td className="p-2">{l.accountName}</td>
                    <td className="p-2">{l.particulars}</td>
                    <td className={`p-2 text-right whitespace-nowrap ${l.direction === "out" ? "text-red-700" : "text-green-700"}`}>
                      {l.direction === "out" ? "−" : "+"}
                      {formatINR(l.amountPaise)}
                    </td>
                    {canReconcile && (
                      <td className="flex flex-col gap-2 p-2">
                        {l.suggestions.map((s) => (
                          <PairButton
                            key={s.id}
                            bankLineId={l.id}
                            transactionId={s.id}
                            label={`Pair with #${s.txnNo} · ${day(s.occurredOn)} · ${s.studentName ?? s.description}`}
                          />
                        ))}
                        <ReasonForm kind="waive" idName="bankLineId" id={l.id} button="Accept, no entry" placeholder="Why there is no entry" />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">In the books, not on the bank statement ({data.entries.length})</h3>
        <p className="text-xs text-muted-foreground">
          Entries in a bank account that no statement line proves. Either the bank never showed it, or it was recorded
          wrongly (wrong amount, wrong account).
        </p>
        {data.entries.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Entry</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Account</th>
                  <th className="p-2">What</th>
                  <th className="p-2">Recorded by</th>
                  <th className="p-2 text-right">Amount</th>
                  {canReconcile && <th className="p-2">Resolve</th>}
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className="border-t align-top">
                    <td className="p-2">#{e.txnNo}</td>
                    <td className="p-2 whitespace-nowrap">{day(e.occurredOn)}</td>
                    <td className="p-2">{e.accountName}</td>
                    <td className="p-2">
                      {e.category}
                      <p className="text-xs text-muted-foreground">
                        {e.studentName ? `${e.studentName} · ` : ""}
                        {e.description}
                      </p>
                    </td>
                    <td className="p-2">{e.recordedByName ?? "—"}</td>
                    <td className={`p-2 text-right whitespace-nowrap ${e.direction === "out" ? "text-red-700" : "text-green-700"}`}>
                      {e.direction === "out" ? "−" : "+"}
                      {formatINR(e.amountPaise)}
                    </td>
                    {canReconcile && (
                      <td className="flex flex-col gap-2 p-2">
                        {e.suggestions.map((s) => (
                          <PairButton
                            key={s.id}
                            bankLineId={s.id}
                            transactionId={e.id}
                            label={`Pair with ${day(s.occurredOn)} · ${s.particulars.slice(0, 50)}`}
                          />
                        ))}
                        {e.suggestions.length === 0 && (
                          <span className="text-xs text-muted-foreground">No statement line with this amount.</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Fee payments not in any account ({data.payments.length})</h3>
        <p className="text-xs text-muted-foreground">
          A receipt was issued but the money was never put against a bank account or cash box, so it can&apos;t be
          checked against anything.
        </p>
        {data.payments.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{day(p.receivedAt)}</td>
                    <td className="p-2">
                      <Link href={`/accounts/${p.enrolmentId}`} className="underline">
                        {p.studentName}
                      </Link>
                    </td>
                    <td className="p-2 capitalize">{p.method}</td>
                    <td className="p-2 text-right">{formatINR(p.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Accepted as having no entry ({data.waived.length})</h3>
        <p className="text-xs text-muted-foreground">
          Lines somebody chose to set aside. Listed so they are reviewed, not buried.
        </p>
        {data.waived.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {data.waived.map((w) => (
                  <tr key={w.matchId} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap">{day(w.occurredOn)}</td>
                    <td className="p-2">
                      {w.particulars}
                      <p className="text-xs text-muted-foreground">
                        {w.reason} — {w.byName ?? "unknown"}, {day(w.at)}
                      </p>
                    </td>
                    <td className={`p-2 text-right whitespace-nowrap ${w.direction === "out" ? "text-red-700" : "text-green-700"}`}>
                      {w.direction === "out" ? "−" : "+"}
                      {formatINR(w.amountPaise)}
                    </td>
                    {canReconcile && (
                      <td className="p-2">
                        <ReasonForm kind="undo" idName="matchId" id={w.matchId} button="Reopen" placeholder="Why reopen it" />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-2xl font-semibold ${bad ? "text-red-700" : ""}`}>{value}</dd>
    </div>
  );
}

function Empty() {
  return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing open here.</p>;
}
