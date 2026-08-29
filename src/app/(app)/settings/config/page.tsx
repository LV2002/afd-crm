import { AccessDenied } from "@/components/layout/access-denied";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import { ExportButton } from "./export-button";

interface SnapshotRow {
  id: string;
  name: string;
  kind: "export" | "import";
  created_at: string;
}

export default async function ConfigPage() {
  const user = await getCurrentUser();
  const canExport = can(user!, "config.export");
  const canImport = can(user!, "config.import");
  if (!user || (!canExport && !canImport)) return <AccessDenied />;

  const supabase = await createClient();
  const { data: snapshots } = await supabase
    .from("config_snapshots")
    .select("id, name, kind, created_at")
    .order("created_at", { ascending: false })
    .returns<SnapshotRow[]>();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Config Export/Import</h1>
        <p className="text-sm text-muted-foreground">
          Every configuration table — organisation settings, terminology, centres, pipeline stages, custom
          fields, roles, dropdowns, temperature rules, SLA policies, business hours, holidays, fee
          structures and tags — as one bundle. Never includes leads, students, payments, users or the audit log.
        </p>
      </div>

      {canExport && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Export</h2>
          <p className="text-sm text-muted-foreground">
            Downloads the current configuration as a JSON file — a starting template for a new instance, or a
            backup before making a big change.
          </p>
          <ExportButton />
        </section>
      )}

      {canImport && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Import</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Import bootstraps a <strong>fresh, empty instance</strong> — it refuses to run once anything is
            already configured, since real data (leads, users) can end up referencing the wrong thing if
            configuration changes out from under it. Run it against a freshly-migrated database, before
            anyone has logged in:
          </p>
          <pre className="w-fit rounded-md bg-muted px-3 py-2 font-mono text-sm">
            npm run db:config-import -- path/to/bundle.json
          </pre>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">History</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(snapshots ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.name}</TableCell>
                <TableCell className="capitalize">{s.kind}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateIST(s.created_at, "d MMM yyyy, h:mm a")}
                </TableCell>
              </TableRow>
            ))}
            {(snapshots ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No exports or imports yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
