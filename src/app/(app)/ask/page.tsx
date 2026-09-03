import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { analystScope } from "@/lib/ai/tools/scope";

import { AskPanel } from "./ask-panel";

export default async function AskPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "ai.query")) return <AccessDenied />;

  const scope = analystScope(user);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Ask AI</h1>
        <p className="text-sm text-muted-foreground">
          Questions about your leads, answered from live data.{" "}
          {scope === "own"
            ? "You'll see answers about your own leads."
            : scope === "center"
              ? "You'll see answers about your centre(s)."
              : "You'll see answers across every centre."}
        </p>
      </div>
      <AskPanel
        configured={Boolean(process.env.ANTHROPIC_API_KEY)}
        suggestions={
          scope === "own"
            ? ["Where are my leads stuck?", "Why am I losing leads?", "How many leads am I yet to respond to?"]
            : [
                "Which sources brought the most leads this month?",
                "How does each counsellor's conversion compare?",
                "Where is the funnel leaking?",
                "Why are we losing leads?",
              ]
        }
      />
    </div>
  );
}
