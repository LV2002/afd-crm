"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import {
  PERMISSION_CATEGORIES,
  PERMISSIONS,
  type PermissionCode,
} from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

import { updateRolePermissions, type PermissionsFormState } from "./actions";

const SCOPE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "own", label: "Own" },
  { value: "center", label: "Centre" },
  { value: "all", label: "All" },
] as const;

const initialState: PermissionsFormState = {};

export function PermissionGrid({
  roleId,
  isProtected,
  currentScopes,
}: {
  roleId: string;
  isProtected: boolean;
  currentScopes: Partial<Record<PermissionCode, string>>;
}) {
  const action = updateRolePermissions.bind(null, roleId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {isProtected ? (
        <p className="text-sm text-muted-foreground">
          This role is protected — it holds every permission at every scope, and that can&apos;t be
          changed here.
        </p>
      ) : null}
      <div className="flex flex-col gap-6">
        {PERMISSION_CATEGORIES.map((category) => (
          <div key={category} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{category}</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Permission
                    </th>
                    {SCOPE_OPTIONS.map((opt) => (
                      <th key={opt.value} className="px-3 py-2 text-center font-medium text-muted-foreground">
                        {opt.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.filter((p) => p.category === category).map((perm) => {
                    const current = isProtected ? "all" : (currentScopes[perm.code] ?? "none");
                    return (
                      <tr key={perm.code} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium">{perm.label}</p>
                          <p className="text-xs text-muted-foreground">{perm.code}</p>
                        </td>
                        {SCOPE_OPTIONS.map((opt) => (
                          <td key={opt.value} className="px-3 py-2 text-center">
                            <input
                              type="radio"
                              name={`perm.${perm.code}`}
                              value={opt.value}
                              defaultChecked={current === opt.value}
                              disabled={isProtected}
                              className={cn(
                                "size-4 accent-primary",
                                isProtected && "opacity-40",
                              )}
                              aria-label={`${perm.label}: ${opt.label}`}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <FormMessage error={state.error} success={state.success} />
      {!isProtected && (
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Saving..." : "Save permissions"}
        </Button>
      )}
    </form>
  );
}
