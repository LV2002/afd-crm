"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

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
 * has just emptied the last filter must not have them reinstated on their
 * next visit. So an empty query is *stored* as empty rather than ignored,
 * and only a remembered query with something in it is ever restored.
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

  useEffect(() => {
    const current = searchParams.toString();

    if (current) {
      write(current);
      return;
    }

    /*
      A bare `/leads`. Restore, unless they arrived here by clearing the
      filters — in which case the stored value is the empty string they
      just chose, and there is nothing to put back.

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
