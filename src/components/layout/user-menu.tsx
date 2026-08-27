import { LogOut } from "lucide-react";

import { logout } from "@/lib/auth/actions";
import type { SessionUser } from "@/lib/auth/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu({ user }: { user: SessionUser }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-medium">{user.fullName}</span>
        <span className="text-xs text-muted-foreground">{user.roleName}</span>
      </div>
      <form action={logout}>
        <Button variant="ghost" size="icon" type="submit" title="Sign out">
          <LogOut className="size-4" />
        </Button>
      </form>
    </div>
  );
}
