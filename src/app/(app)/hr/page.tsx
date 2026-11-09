import { redirect } from "next/navigation";

import { can, getCurrentUser } from "@/lib/auth/session";

export default async function HrIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard");
  redirect(can(user, "hr.self") ? "/hr/me" : can(user, "hr.read") ? "/hr/employees" : "/hr/payroll");
}
