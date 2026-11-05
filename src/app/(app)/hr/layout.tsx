import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

import { HrNav } from "./hr-nav";

/** One gate for HR. Every screen inside decides for itself who may act. */
export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !(can(user, "hr.self") || can(user, "hr.read"))) return <AccessDenied />;

  const tabs = [
    ...(can(user, "hr.self") ? [{ href: "/hr/me", label: "My HR" }] : []),
    ...(can(user, "hr.read") ? [{ href: "/hr/employees", label: "Employees" }, { href: "/hr/leave", label: "Leave" }] : []),
    ...(can(user, "hr.manage") ? [{ href: "/hr/policy", label: "Leave policy & holidays" }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">HR</h1>
      <HrNav tabs={tabs} />
      {children}
    </div>
  );
}
