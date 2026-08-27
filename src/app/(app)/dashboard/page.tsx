import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user?.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user?.roleName}
          {user?.centerIds.length ? ` · ${user.centerIds.length} centre(s)` : ""}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Phase 0 is live</CardTitle>
          <CardDescription>
            Auth, dynamic roles and RLS are wired up. The nav on the left only shows what your
            role is permitted to see.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Lead management, the pipeline and reporting ship in later phases — see{" "}
          <code className="rounded bg-muted px-1 py-0.5">docs/02-BUILD-PHASES.md</code>.
        </CardContent>
      </Card>
    </div>
  );
}
