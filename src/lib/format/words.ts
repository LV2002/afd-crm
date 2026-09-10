/**
 * An amount, written out.
 *
 * Every printed receipt in India carries one, and not for decoration: a
 * figure can be altered with a pen and a line of words cannot. It is the
 * single feature that makes a paper receipt hard to tamper with, which is
 * why a receipt without it looks unofficial to anybody who handles them.
 *
 * ## Indian numbering, deliberately
 *
 * Lakh and crore, not million and billion. "Four lakh fifty thousand" is
 * what a family reads back; "four hundred fifty thousand" is a foreign
 * document that happens to be in rupees.
 */

const ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 0–99. The teens are irregular in English, so they get their own table above. */
function underHundred(value: number): string {
  if (value < 20) return ONES[value];
  const tens = TENS[Math.floor(value / 10)];
  const ones = ONES[value % 10];
  return ones ? `${tens} ${ones}` : tens;
}

function underThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) parts.push(underHundred(rest));
  return parts.join(" ");
}

/**
 * A whole number of rupees in words, in the Indian system.
 *
 * Caps at 99,99,99,999 (just under a hundred crore). Above that the words
 * would be longer than the receipt is wide, and an institute taking a
 * hundred crore in one payment has a different problem.
 */
export function rupeesInWords(rupees: number): string {
  if (!Number.isFinite(rupees) || rupees < 0) return "zero";
  const whole = Math.floor(rupees);
  if (whole === 0) return "zero";

  const crore = Math.floor(whole / 10_000_000);
  const lakh = Math.floor((whole % 10_000_000) / 100_000);
  const thousand = Math.floor((whole % 100_000) / 1000);
  const rest = whole % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${underThousand(crore)} crore`);
  if (lakh) parts.push(`${underThousand(lakh)} lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} thousand`);
  if (rest) parts.push(underThousand(rest));

  return parts.join(" ");
}

/**
 * Paise in, words out — including the paise, when there are any.
 *
 * Money is stored in paise everywhere in this system (CLAUDE.md), so this
 * takes paise rather than rupees: a helper that silently expected rupees
 * would be wrong by a factor of a hundred on a document about money, and
 * nobody would notice until a receipt said four hundred rupees instead of
 * forty thousand.
 */
export function amountInWords(paise: number): string {
  if (!Number.isFinite(paise)) return "zero";
  const absolute = Math.abs(Math.round(paise));
  const rupees = Math.floor(absolute / 100);
  const remainder = absolute % 100;

  const words = rupeesInWords(rupees);
  if (remainder === 0) return capitalise(words);
  return capitalise(`${words} and ${underHundred(remainder)} paise`);
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
