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

import { StageRowActions } from "./stage-row-actions";

interface StageRow {
  id: string;
  name: string;
  color: string | null;
  stage_type: string;
  probability: string | null;
  sla_hours: number | null;
  is_active: boolean;
}

export default async function PipelineStagesSettingsPage() {
  const supabase = await createClient();
  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, name, color, stage_type, probability, sla_hours, is_active")
    .is("deleted_at", null)
    .order("sort_order")
    .returns<StageRow[]>();

  const rows = stages ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline Stages</h1>
          <p className="text-sm text-muted-foreground">
            Funnel position. Order, colour, probability and SLA are all yours to change.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/pipeline-stages/new">
            <Plus /> New stage
          </Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Stage</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Probability</TableHead>
            <TableHead>SLA hours</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((stage, index) => (
            <TableRow key={stage.id}>
              <TableCell>
                <Link
                  href={`/settings/pipeline-stages/${stage.id}`}
                  className="flex items-center gap-2 font-medium hover:underline"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: stage.color ?? "#94a3b8" }}
                  />
                  {stage.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{stage.stage_type}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {stage.probability ? `${Number(stage.probability)}%` : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">{stage.sla_hours ?? "—"}</TableCell>
              <TableCell>
                <StageRowActions
                  stageId={stage.id}
                  isActive={stage.is_active}
                  isFirst={index === 0}
                  isLast={index === rows.length - 1}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
