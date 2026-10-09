/**
 * The no-flash theme script.
 *
 * This runs BEFORE the first paint, inlined in <head>, which is the only
 * way to avoid the white flash a dark-mode user gets if the class is
 * applied from React after hydration. That flash is not cosmetic: it is a
 * bright screen in a dark room, every single navigation.
 *
 * Deliberately tiny and deliberately defensive. It runs before anything
 * else on the page, so a thrown exception here is a blank application —
 * hence the try/catch, and hence no dependencies.
 *
 * Storage holds "light" or "dark" ONLY when the person has chosen. No
 * stored value means follow the operating system, which is what somebody
 * who never finds the button should get.
 */
export const THEME_STORAGE_KEY = "afd-theme";

export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var dark = stored === "dark" || (stored !== "light" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();
`.trim();
