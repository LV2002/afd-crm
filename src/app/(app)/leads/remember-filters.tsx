"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * The filters survive opening a lead.
 *
 * They have always lived in the URL, so the browser's own Back button
 * worked. What did not was the thing people actually do: open a lead from
 * a filtered list, read it, then press **Leads** in the sidebar — which is
 * a link to a bare `/leads` and threw the filters away. A counsellor
 * working through "overdue follow-ups at Kochi" rebuilt that filter after
 * every single lead.
 *
 * So the last query is remembered, and a visit to `/leads` carrying no
 * query at all is sent back to it.
 *
 * ## Why `sessionStorage` and not a cookie or the database
 *
 * It is per tab and it ends with the tab, which is the right lifetime for
 * "what I am looking at right now". A cookie would follow them to a new
 * window a week later; a saved view is a different feature with a name
 * and an explicit save. Nothing here is worth a round trip, and
 * `sessionStorage` can throw in a private window, so every access is
 * wrapped — a browser that refuses simply gets the old behaviour.
 *
 * ## Clearing really clears
 *
 * An empty filter bar is a deliberate state, not an absence: somebody who
 * has just emptied the last filter must not have it reinstated.
 *
 * This is the part that was described here and not implemented, and Leon
 * found it: *"the follow up filter is not clearing, it clears but then
 * comes back again."* Clearing the only filter navigates to a bare
 * `/leads`, the effect saw an empty query, skipped the write — the write
 * was inside `if (current)` — read the filter still sitting in storage
 * and put it straight back.
 *
 * The two cases cannot be told apart from the query alone, because both
 * are a bare `/leads`. What tells them apart is **when** it happened:
 * arriving on the screen, or changing something while already on it.
 * React keeps this component mounted across a navigation within the same
 * route, so a ref that remembers whether this mount has already run is
 * exactly the distinction:
 *
 * - **First run, no query** — they came from the sidebar. Restore.
 * - **A later run, no query** — they emptied the bar in front of us.
 *   Store the empty string and restore nothing.
 *
 * `replace`, not `push`, so Back still leaves the list rather than
 * bouncing between the bare and the restored URL.
 */

const KEY = "leads:last-filters";

function read(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(value: string): void {
  try {
    window.sessionStorage.setItem(KEY, value);
  } catch {
    /* Private window, or storage disabled. Not worth telling anyone. */
  }
}

export function RememberLeadFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** False until this mount has run once — see "Clearing really clears". */
  const hasRun = useRef(false);

  useEffect(() => {
    const current = searchParams.toString();
    const isFirstRun = !hasRun.current;
    hasRun.current = true;

    if (current) {
      write(current);
      return;
    }

    // Emptied in front of us. Record the empty bar as the deliberate
    // state it is, so coming back to this list later shows it empty too.
    if (!isFirstRun) {
      write("");
      return;
    }

    /*
      Arrived at a bare `/leads` — the sidebar link. Restore what they
      were last looking at.

      `page` is dropped: coming back to a list should start at the top,
      not on page four of a list that may have changed underneath them.
    */
    const remembered = read();
    if (!remembered) return;

    const params = new URLSearchParams(remembered);
    params.delete("page");
    const restored = params.toString();
    if (restored) router.replace(`/leads?${restored}`);
  }, [searchParams, router]);

  return null;
}
