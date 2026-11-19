const syllables = (word: string): number => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, trimmed.match(/[aeiouy]{1,2}/g)?.length ?? 1);
};

// Flesch-Kincaid grade level: roughly the school year needed to read the text easily.
export function readingGrade(text: string): number {
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => /\w/.test(s));
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (sentences.length === 0 || words.length === 0) return 0;
  const perSentence = words.length / sentences.length;
  const perWord = words.reduce((sum, w) => sum + syllables(w), 0) / words.length;
  return 0.39 * perSentence + 11.8 * perWord - 15.59;
}
