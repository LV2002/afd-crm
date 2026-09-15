import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { getCurrentUser } from "@/lib/auth/session";

import { manageScope } from "../scope";
import { createClient } from "@/lib/supabase/server";

import { loadRuleOptions } from "../load-options";
import { RuleForm } from "../rule-form";

export const dynamic = "force-dynamic";

export default async function NewAssignmentRulePage() {
  const user = await getCurrentUser();
  if (!user || manageScope(user) !== "all") return <AccessDenied />;

  const supabase = await createClient();
  const options = await loadRuleOptions(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/settings/rules" className="text-sm text-muted-foreground hover:underline">
          ← Assignment rules
        </Link>
        <h1 className="text-2xl font-semibold">New rule</h1>
      </div>

      <RuleForm
        values={{
          name: "",
          isActive: true,
          appliesOn: ["create"],
          conditions: [],
          strategy: "fixed",
          assignTo: "",
          userIds: [],
          centerId: "",
        }}
        users={options.users}
        centers={options.centers}
        fields={options.fields}
        optionsByField={options.optionsByField}
      />
    </div>
  );
}
