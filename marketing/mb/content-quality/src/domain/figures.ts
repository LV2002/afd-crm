const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const PATTERNS = [
  /(?:₹|\bRs\.?\s?)\s?\d(?:[\d,]*\d)?/gi, // money
  /\b\d+(?:\.\d+)?\s?%/g, // percentages
  /\b20[2-3]\d\b/g, // years
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b`, 'gi'), // dates
  /\bAIR\s?\d+/gi, // ranks
  /\b\d[\d,]*\s+(?:seats|students|applicants|candidates)\b/gi,
];

// Numbers a reader could take as fact. In a draft they should be fact tokens, so each one is flagged for the owner.
export function unsourcedFigures(textWithoutTokens: string): string[] {
  const found = new Set<string>();
  for (const pattern of PATTERNS) for (const m of textWithoutTokens.matchAll(pattern)) found.add(m[0].trim());
  return [...found];
}
