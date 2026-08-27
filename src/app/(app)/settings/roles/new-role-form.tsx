"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createRole, type RoleFormState } from "./actions";

const initialState: RoleFormState = {};

export function NewRoleForm() {
  const [state, formAction, pending] = useActionState(createRole, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="Front Desk" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" placeholder="front_desk" required />
        <p className="text-xs text-muted-foreground">
          Lowercase, no spaces. Used internally only — never shown to users.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" />
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Create role"}
      </Button>
    </form>
  );
}
