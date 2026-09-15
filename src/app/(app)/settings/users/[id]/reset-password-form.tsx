"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { resetUserPassword, type UserFormState } from "../actions";

const initialState: UserFormState = {};

/**
 * Setting somebody else's password.
 *
 * Behind a confirmation because it is a one-way door of a particular
 * kind: the moment it succeeds, the password this person has been using
 * stops working, and if the admin closes the tab without telling them,
 * nobody can recover it — not even by looking, since it is stored
 * hashed. The dialog says exactly that rather than asking "Are you
 * sure?".
 *
 * Two boxes rather than one. A single field plus a "show password" toggle
 * would be friendlier, but this is a value typed once, for somebody else,
 * that cannot be read back afterwards; a typo in it locks the person out
 * more thoroughly than the forgotten password did.
 */
export function ResetPasswordForm({ userId, fullName }: { userId: string; fullName: string }) {
  const [state, action, pending] = useActionState(
    resetUserPassword.bind(null, userId),
    initialState,
  );

  return (
    <form action={action} className="flex max-w-md flex-col gap-4 rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-semibold">Reset password</h2>
        <p className="text-sm text-muted-foreground">
          For when {fullName.split(" ")[0]} is locked out. You will need to tell them the new
          password yourself — nobody can read it back afterwards.
        </p>
      </div>

      <Field
        label="New password"
        htmlFor="new-password"
        required
        hint="At least 8 characters."
      >
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <Field label="Type it again" htmlFor="confirm-password" required>
        <Input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <div className="flex items-center gap-3">
        <ConfirmSubmit
          label="Reset password"
          icon={<KeyRound className="size-4" />}
          title={`Change ${fullName}'s password?`}
          body={`Their current password stops working immediately, and they will not be able to sign in until you tell them the new one. This is recorded in the audit log.`}
          confirmLabel="Change it"
          variant="destructive"
          pending={pending}
          pendingLabel="Changing…"
        />
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}
