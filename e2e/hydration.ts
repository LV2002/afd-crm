import type { Page } from "@playwright/test";

/**
 * Waits until React has taken over the server-rendered markup.
 *
 * Playwright clicks as soon as an element is visible and stable, which on
 * a Next.js page can be well before the JavaScript has run. A form clicked
 * in that window submits the old-fashioned way — React renders a real
 * `action` and `method="POST"` on purpose, so a browser with no JavaScript
 * still works — and the test is then exercising progressive enhancement
 * rather than the thing it meant to exercise.
 *
 * The signal is React's own: on hydration it hangs `__reactFiber$<id>` and
 * `__reactProps$<id>` off every host node it owns. That is an
 * implementation detail of React rather than a public API, which is why it
 * is behind this one function with this comment on it — if a React upgrade
 * ever renames those keys, this call fails loudly in CI and the fix is in
 * one place.
 *
 * Deliberately not a fixed wait. A page that hydrates in 80ms should cost
 * 80ms, and a page that takes four seconds under a loaded CI runner should
 * still be waited for rather than raced.
 */
export async function waitForHydration(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const node = document.querySelector(sel);
      return node !== null && Object.keys(node).some((key) => key.startsWith("__react"));
    },
    selector,
    { timeout: 15_000 },
  );
}
