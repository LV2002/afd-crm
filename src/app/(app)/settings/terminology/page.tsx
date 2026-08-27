import { TERMINOLOGY_KEYS } from "@/lib/terminology/terms";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";

import { TerminologyForm } from "./terminology-form";

export default async function TerminologySettingsPage() {
  const map = await getTerminologyMap();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Terminology</h1>
        <p className="text-sm text-muted-foreground">
          Every user-facing label for these words comes from here — rename them and the whole
          app follows, no deploy.
        </p>
      </div>
      <TerminologyForm map={map} keys={TERMINOLOGY_KEYS} />
    </div>
  );
}
