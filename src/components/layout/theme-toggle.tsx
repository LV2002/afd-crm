"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/lib/theme/script";

/**
 * One button, two states, no menu.
 *
 * A light/dark/system dropdown is the usual shape, and it is the wrong
 * one here: "system" is a concept the person has to already understand,
 * and it costs a second click to reach either of the two things anybody
 * actually wants. So the system preference is still the DEFAULT — the
 * inline script in the root layout applies it before first paint — and
 * this button simply flips to the other one and remembers that choice.
 *
 * The icon shows what you will GET, not what you are in, with the label
 * saying so in words, because an unlabelled sun/moon is genuinely
 * ambiguous and half of all users read it the other way round.
 */
export function ThemeToggle() {
  // Starts null, not a guess. The server does not know the person's
  // preference, so rendering either icon would mean rendering the wrong
  // one and swapping it on hydration — a visible flicker on every load.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function apply(next: boolean) {
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private browsing, or storage full. The theme still changed for
      // this visit; it just will not be remembered, which is a far
      // better outcome than the button not working at all.
    }
  }

  // Same footprint as the rendered button, so the header does not reflow
  // the moment the effect runs.
  if (dark === null) {
    return <div className="size-9" aria-hidden />;
  }

  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      type="button"
      onClick={() => apply(!dark)}
      title={label}
      aria-label={label}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
