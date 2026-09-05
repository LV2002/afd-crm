/**
 * What every screen shows while its data is being fetched.
 *
 * Before this file existed there was nothing: clicking a link left the
 * old page on screen, frozen, until the server finished — no spinner, no
 * movement, nothing. That reads as "the app is broken" long before it
 * reads as "the app is slow", and it is why the CRM felt far heavier than
 * its actual query times.
 *
 * One file at the top of the app group covers every screen inside it.
 * Next.js shows it the instant a navigation starts, so a click is
 * acknowledged immediately even when the data behind it takes a second.
 *
 * Deliberately a grey skeleton rather than a spinner. A skeleton in
 * roughly the shape of the page that is coming makes the wait feel
 * shorter and stops the layout jumping when the real content lands.
 */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="h-6 w-48 rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full rounded-md bg-muted/60" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="h-3 w-24 rounded bg-muted/60" />
            <div className="h-7 w-20 rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border p-4">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="flex items-center gap-4 border-b py-2 last:border-0">
            <div className="h-4 w-1/4 rounded bg-muted" />
            <div className="h-4 w-1/6 rounded bg-muted/60" />
            <div className="h-4 w-1/5 rounded bg-muted/60" />
            <div className="ml-auto h-4 w-16 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
