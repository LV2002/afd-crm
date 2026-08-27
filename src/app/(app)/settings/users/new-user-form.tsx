"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createUser, type UserFormState } from "./actions";
import { CenterCheckboxes } from "./center-checkboxes";
import { RoleSelect } from "./role-select";

const initialState: UserFormState = {};

export function NewUserForm({
  roles,
  centers,
}: {
  roles: Array<{ id: string; name: string }>;
  centers: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(createUser, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Temporary password</Label>
        <Input id="password" name="password" type="password" minLength={8} required />
        <p className="text-xs text-muted-foreground">At least 8 characters. Share it out of band.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="roleId">Role</Label>
        <RoleSelect name="roleId" roles={roles} />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Centres</Label>
        <CenterCheckboxes centers={centers} />
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Create user"}
      </Button>
    </form>
  );
}
