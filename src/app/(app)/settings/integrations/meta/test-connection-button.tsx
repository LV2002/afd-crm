"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { testMetaConnection } from "./actions";

export function TestConnectionButton() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        className="w-fit"
        onClick={() => startTransition(async () => setResult(await testMetaConnection()))}
      >
        {isPending ? "Testing…" : "Test connection"}
      </Button>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
