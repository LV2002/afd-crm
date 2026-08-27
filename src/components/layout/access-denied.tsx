import { ShieldAlert } from "lucide-react";

export function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
      <ShieldAlert className="size-8" />
      <p className="text-sm font-medium">You don&apos;t have access to this page.</p>
      <p className="text-xs">Ask an admin to grant the required permission to your role.</p>
    </div>
  );
}
