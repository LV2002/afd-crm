"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <div className="flex justify-end print:hidden">
      <Button size="sm" onClick={() => window.print()}>
        <Printer /> Print
      </Button>
    </div>
  );
}
