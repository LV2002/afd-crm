import { cn } from "@/lib/utils";

export function FormMessage({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  if (!error && !success) return null;

  return (
    <p
      role={error ? "alert" : "status"}
      className={cn("text-sm", error ? "text-destructive" : "text-emerald-600")}
    >
      {error ?? success}
    </p>
  );
}
