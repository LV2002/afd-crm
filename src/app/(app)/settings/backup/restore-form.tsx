"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { restoreFromArchive, type RestoreState } from "./actions";

const initialState: RestoreState = {};

/**
 * Putting an archive back.
 *
 * Confirms first, and says the two things somebody needs to hear before
 * pressing it rather than after: that it only works into an empty
 * database, and that logins are not in the file. The second is the one
 * that surprises people — a restore that appears to work and then lets
 * nobody in reads as a failed restore.
 */
export function RestoreForm() {
  const [state, action, pending] = useActionState(restoreFromArchive, initialState);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="archive">Archive file</Label>
        <Input id="archive" name="archive" type="file" accept=".gz,.ndjson,application/gzip" required />
        <p className="text-xs text-muted-foreground">
          The <code className="font-mono">.ndjson.gz</code> file a download produced, exactly as
          it was saved.
        </p>
      </div>

      <FormMessage error={state.error} success={state.success} />

      <ConfirmSubmit
        label="Restore this archive"
        variant="destructive"
        size="sm"
        pending={pending}
        pendingLabel="Restoring…"
        title="Restore this archive into this CRM?"
        body={
          <>
            <p>
              This writes every lead, admission, payment and setting from the file into this
              database.
            </p>
            <p className="mt-2">
              It only runs if this database is <strong>empty</strong> — if anything is already
              here it will stop and tell you, without changing a thing. So this cannot overwrite
              records you still have.
            </p>
            <p className="mt-2">
              <strong>Sign-in accounts are not in an archive.</strong> They live in the
              authentication system, which no export can reach. After a restore, staff have to be
              invited again before anybody can log in.
            </p>
          </>
        }
        confirmLabel="Restore it"
      />
    </form>
  );
}
