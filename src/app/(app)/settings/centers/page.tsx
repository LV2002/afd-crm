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

export default async function CentersSettingsPage() {
  const supabase = await createClient();
  const { data: centers } = await supabase
    .from("centers")
    .select("id, name, city, is_active, timezone")
    .order("name")
    .returns<Array<{ id: string; name: string; city: string; is_active: boolean; timezone: string }>>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Centres</h1>
          <p className="text-sm text-muted-foreground">Branches, each with their own timezone.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/centers/new">
            <Plus /> New centre
          </Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Timezone</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(centers ?? []).map((center) => (
            <TableRow key={center.id}>
              <TableCell>
                <Link href={`/settings/centers/${center.id}`} className="font-medium hover:underline">
                  {center.name}
                </Link>
              </TableCell>
              <TableCell>{center.city}</TableCell>
              <TableCell className="text-muted-foreground">{center.timezone}</TableCell>
              <TableCell>
                <Badge variant={center.is_active ? "default" : "secondary"}>
                  {center.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
