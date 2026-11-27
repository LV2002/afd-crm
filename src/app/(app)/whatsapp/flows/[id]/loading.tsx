/** Shown straight away while an automation's page is being put together, instead of a blank wait. */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Loading the automation">
      <div className="h-6 w-64 rounded bg-muted" />
      <div className="h-16 rounded-lg bg-muted" />
      <div className="h-32 rounded-lg bg-muted" />
      <div className="h-32 rounded-lg bg-muted" />
    </div>
  );
}
