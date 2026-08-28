"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { LeadFilterValues } from "@/lib/leads/apply-filters";

import { exportLeadsCsv } from "./actions";

/**
 * Exports exactly the filters currently applied to the list — "export what
 * you're looking at," not a separate export configuration screen.
 */
export function ExportButton({ filterValues }: { filterValues: LeadFilterValues }) {
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportLeadsCsv(filterValues);
      if (!result.csv || !result.filename) return;

      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={handleExport}>
      <Download /> {isPending ? "Exporting…" : "Export CSV"}
    </Button>
  );
}
