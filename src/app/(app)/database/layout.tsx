import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

import { DatabaseNav } from "./database-nav";

/**
 * One gate for the whole section, checked once here. RLS is still the real
 * boundary (the policies return nothing without `contact.read`), but somebody
 * who cannot use it should be told so at the door.
 */
export default async function DatabaseLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.read")) return <AccessDenied />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Database</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          People we hold details for who are <strong className="font-medium text-foreground">not leads</strong>:
          seminar attendees, purchased lists, exam-application data. Nobody here is assigned, timed or counted in
          your reports. They are here to be retargeted, and the few who turn out to be real enquiries are moved
          into the leads (they stay here too, marked as a lead).
        </p>
      </div>
      <DatabaseNav canManage={can(user, "contact.manage")} />
      {children}
    </div>
  );
}
