/** Chip colours for conversation labels, with a dark-mode partner each. */
export const LABEL_CHIP: Record<string, string> = {
  slate: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  green: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-100",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-100",
  red: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-100",
};
export const chipClass = (colour: string) => LABEL_CHIP[colour] ?? LABEL_CHIP.slate;
