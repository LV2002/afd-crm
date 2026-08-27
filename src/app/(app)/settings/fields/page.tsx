import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

import { FieldRowActions } from "./field-row-actions";

interface FieldRow {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: string;
  section: string;
  is_core: boolean;
  is_active: boolean;
}

export default async function FieldsSettingsPage() {
  const supabase = await createClient();
  const { data: fields } = await supabase
    .from("field_definitions")
    .select("id, entity, key, label, type, section, is_core, is_active")
    .order("entity")
    .order("sort_order")
    .returns<FieldRow[]>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Custom Fields</h1>
          <p className="text-sm text-muted-foreground">
            Add a field to lead, student or enrolment — it drives the form, the list, the
            filters and exports, no migration.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/fields/new">
            <Plus /> New field
          </Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Field</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Section</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(fields ?? []).map((field) => (
            <TableRow key={field.id}>
              <TableCell>
                <Link href={`/settings/fields/${field.id}`} className="font-medium hover:underline">
                  {field.label}
                </Link>
                <p className="text-xs text-muted-foreground">{field.key}</p>
              </TableCell>
              <TableCell className="capitalize text-muted-foreground">{field.entity}</TableCell>
              <TableCell className="text-muted-foreground">{field.type.replace(/_/g, " ")}</TableCell>
              <TableCell className="text-muted-foreground">{field.section}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  {field.is_core && <Badge variant="outline">Core</Badge>}
                  <FieldRowActions fieldId={field.id} isActive={field.is_active} isCore={field.is_core} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
