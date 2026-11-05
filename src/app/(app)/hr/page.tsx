import { redirect } from "next/navigation";

import { can, getCurrentUser } from "@/lib/auth/session";

export default async function HrIndex() {
  const user = await getCurrentUser();
  redirect(user && can(user, "hr.self") ? "/hr/me" : "/hr/employees");
}
