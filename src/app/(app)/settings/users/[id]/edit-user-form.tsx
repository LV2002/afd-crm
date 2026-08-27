"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateUserProfile, type UserFormState } from "../actions";
import { RoleSelect } from "../role-select";

const initialState: UserFormState = {};

export function EditUserForm({
  userId,
  fullName,
  phone,
  roleId,
  roles,
}: {
  userId: string;
  fullName: string;
  phone: string;
  roleId: string;
  roles: Array<{ id: string; name: string }>;
}) {
  const action = updateUserProfile.bind(null, userId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" defaultValue={fullName} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={phone} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="roleId">Role</Label>
        <RoleSelect name="roleId" roles={roles} defaultValue={roleId} />
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
