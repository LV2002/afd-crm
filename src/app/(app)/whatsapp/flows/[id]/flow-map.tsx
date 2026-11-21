import { ArrowDown, CornerDownRight } from "lucide-react";

import { describeStep, stepEdges, type FlowStep } from "@/lib/whatsapp/flow-engine";

/**
 * The flow drawn as a picture: each step a card, with an arrow to what
 * comes next. Steps that branch (a reply, a question, a condition) list
 * where each answer goes, so a jump to step 6 is visible without counting.
 *
 * Read-only on purpose: the editor below changes steps, and this stays a
 * pure function of what is saved.
 */
export function FlowMap({ steps }: { steps: FlowStep[] }) {
  const sorted = [...steps].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">The flow at a glance</h3>
      <ol className="flex max-w-xl flex-col items-stretch">
        {sorted.map((step, index) => {
          const edges = stepEdges(sorted, step);
          const branching = edges.length > 1;
          const next = sorted[index + 1];
          // A plain "go to the next step" arrow is drawn between the cards;
          // anything else is spelled out inside this one.
          const plainNext = edges.length === 1 && edges[0].label === null && edges[0].to === next?.position;
          return (
            <li key={step.id} className="flex flex-col items-stretch">
              <div className="rounded-lg border bg-card p-3 text-sm shadow-sm">
                <p className="text-xs font-medium text-muted-foreground">Step {step.position}</p>
                <p>{describeStep(step)}</p>
                {!plainNext && edges.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 border-t pt-2 text-xs text-muted-foreground">
                    {edges.map((edge, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <CornerDownRight className="size-3" />
                        {edge.label ?? "next"} →{" "}
                        <span className="font-medium text-foreground">{edge.to === "end" ? "ends here" : `step ${edge.to}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {edges.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Ends here.</p>}
              </div>
              {next && !branching && plainNext && <ArrowDown className="mx-auto my-1 size-4 text-muted-foreground" aria-hidden />}
              {next && (branching || !plainNext) && <div className="h-3" />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
