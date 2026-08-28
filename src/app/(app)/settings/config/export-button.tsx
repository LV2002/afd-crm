"use client";

import { Download } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { exportConfigAction } from "./actions";

export function ExportButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const result = await exportConfigAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!result.bundleJson) return;

      const blob = new Blob([result.bundleJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `afd-crm-config-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" disabled={isPending} onClick={handleExport} className="w-fit">
        <Download /> {isPending ? "Exporting…" : "Export configuration"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
