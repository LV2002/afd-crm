import { Badge } from "@/components/ui/badge";

export function PageStub({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Badge variant="secondary">{phase}</Badge>
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
