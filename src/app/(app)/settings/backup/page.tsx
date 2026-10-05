import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Button } from "@/components/ui/button";
import { can, getCurrentUser } from "@/lib/auth/session";

import { RestoreForm } from "./restore-form";

export const dynamic = "force-dynamic";

/**
 * Take the whole institute away in one file, and put it back.
 *
 * Built for one specific habit Leon described: at the end of an academic
 * year, download everything, keep it on a hard disk, and start the next
 * year without three years of finished leads in the way.
 *
 * The screen's job is as much to set expectations as to offer buttons.
 * An archive is not a backup of the hosting — it does not contain
 * sign-in accounts or uploaded files, and it is one file on one disk.
 * Saying that here, where somebody is deciding to rely on it, is worth
 * more than saying it in a document they will read once.
 */
export default async function BackupSettingsPage() {
  const user = await getCurrentUser();
  if (!user) return <AccessDenied />;

  const canExport = can(user, "config.export") && can(user, "lead.export");
  const canImport = can(user, "config.import") && can(user, "lead.import");
  if (!canExport && !canImport) return <AccessDenied />;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Archive</h1>
        <p className="text-sm text-muted-foreground">
          The whole institute — every setting, lead, admission, payment and message — as one file
          you can keep, and put back later.
        </p>
      </div>

      {canExport && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Download everything</h2>
          <p className="text-sm text-muted-foreground">
            One compressed file. It can take a minute on a large database, and the download starts
            before it has finished being written — so leave the tab alone until your browser says
            it is done.
          </p>
          <Button asChild className="w-fit">
            {/* A plain link, not a fetch: the browser streams it straight to
                disk rather than the page holding it all in memory first. */}
            <a href="/api/backup/archive" download>
              Download the archive
            </a>
          </Button>
        </section>
      )}

      <section className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-medium">What an archive does not contain</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Sign-in accounts and passwords.</strong> These live in the authentication
            system, which no export can reach. Who existed and what they were allowed to do is in
            the file; their logins are not, so a restore means inviting everybody again.
          </li>
          <li>
            <strong>Uploaded files.</strong> Student documents, photographs and your logo are kept
            in file storage, not the database.
          </li>
          <li>
            <strong>Operational logs.</strong> Webhook deliveries, error history and scheduled-run
            history are left out deliberately — they are about the running of the system, and they
            are far larger than everything else put together.
          </li>
        </ul>
        <p className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-sm">
          <strong>This is an archive, not a backup.</strong> It is one file, on one disk, taken on
          one day. If the question is &ldquo;what happens if the database is lost or something is
          deleted by mistake&rdquo;, the answer is your database provider&apos;s own backups and
          point-in-time recovery, which run continuously and are not something anybody has to
          remember to do.
        </p>
      </section>

      {canImport && (
        <section className="flex flex-col gap-3 border-t pt-6">
          <h2 className="text-lg font-medium">Put an archive back</h2>
          <p className="text-sm text-muted-foreground">
            Only into an <strong>empty</strong> database. If anything is already here the restore
            stops and tells you what it found, without changing a thing — so it can never
            overwrite records you still have.
          </p>
          <RestoreForm />
        </section>
      )}

      <section className="flex flex-col gap-2 border-t pt-6">
        <h2 className="text-lg font-medium">Just the settings</h2>
        <p className="text-sm text-muted-foreground">
          To set up a second instance shaped the same way, with none of this one&apos;s data, use{" "}
          <Link href="/settings/config" className="underline">
            Config Export/Import
          </Link>{" "}
          instead. That bundle is stages, roles, fields and rules only.
        </p>
      </section>
    </div>
  );
}
