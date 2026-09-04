import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getAccounts, getFinanceCategories } from "@/lib/finance/get-finance";
import { createClient } from "@/lib/supabase/server";

import { RecordForms } from "./record-forms";

/**
 * The workbook's three intake sheets on one screen: Expense, Other Income,
 * Transfer.
 *
 * Student fees are deliberately NOT here. They go through the enrolment,
 * where they get a receipt number and can move the accounts→academics
 * gate, and they post to this same ledger from there. Two doors into the
 * same fee record is how a receipt ends up without a payment behind it.
 */
export default async function RecordEntryPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.record")) return <AccessDenied />;

  const supabase = await createClient();
  const [accounts, categories] = await Promise.all([
    getAccounts(supabase),
    getFinanceCategories(supabase),
  ]);

  return (
    <RecordForms
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      expenseCategories={categories.expense}
      incomeCategories={categories.income}
    />
  );
}
