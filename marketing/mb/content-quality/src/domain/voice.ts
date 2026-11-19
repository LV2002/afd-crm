import { z } from 'zod';
import { advisory, type Finding } from './finding.ts';
import { countWords, parseBlocks, plainText } from './markdown.ts';

const Band = z.object({ target: z.number(), tolerance: z.number() });

// Measured from the live blog (docs/briefs/author-voice.md). Editable in config/author-voice.json.
export const VoiceTargetsSchema = z.object({
  sentenceWords: Band,
  shortSentencePct: Band, // sentences of 8 words or fewer
  youPer1000: Band,
  questionsPer1000: Band,
  paragraphWords: Band,
  maxExclamationsPer1000: z.number(),
  // none: never "I". advice-only: "I recommend / suggest / advise / would" only, no personal stories. allowed: free use.
  firstPerson: z.enum(['none', 'advice-only', 'allowed']),
});
export type VoiceTargets = z.infer<typeof VoiceTargetsSchema>;

export interface VoiceMeasure {
  readonly sentenceWords: number;
  readonly shortSentencePct: number;
  readonly youPer1000: number;
  readonly questionsPer1000: number;
  readonly paragraphWords: number;
  readonly exclamationsPer1000: number;
  readonly personalI: number;
}

export function measureVoice(body: string): VoiceMeasure {
  const paragraphs = parseBlocks(body).filter((b) => b.kind === 'paragraph').map((b) => plainText(b.text));
  const text = paragraphs.join(' ');
  const words = Math.max(1, countWords(text));
  const sentences = text.split(/(?<=[.?!])\s+/).filter((s) => countWords(s) >= 3);
  const per1000 = (re: RegExp): number => ((text.match(re)?.length ?? 0) / words) * 1000;
  const allI = text.match(/\bI\b/g)?.length ?? 0;
  const adviceI = text.match(/\bI\s+(recommend|suggest|advise|would|always tell|encourage)\b/gi)?.length ?? 0;
  return {
    sentenceWords: sentences.length === 0 ? 0 : sentences.reduce((n, s) => n + countWords(s), 0) / sentences.length,
    shortSentencePct: sentences.length === 0 ? 0 : (sentences.filter((s) => countWords(s) <= 8).length / sentences.length) * 100,
    youPer1000: per1000(/\byou(r|rs)?\b/gi), questionsPer1000: per1000(/\?/g), exclamationsPer1000: per1000(/!/g),
    paragraphWords: paragraphs.length === 0 ? 0 : paragraphs.reduce((n, p) => n + countWords(p), 0) / paragraphs.length,
    personalI: allI - adviceI,
  };
}

// A soft check: it tells the owner where a draft drifts from the author's measured style. It never blocks.
export function voiceScore(body: string, t: VoiceTargets): Finding[] {
  const m = measureVoice(body);
  const out: Finding[] = [];
  const band = (code: string, label: string, value: number, b: z.infer<typeof Band>, hint: string): void => {
    if (Math.abs(value - b.target) > b.tolerance) out.push(advisory(code, `${label} is ${value.toFixed(1)}; the author's usual is about ${String(b.target)}. ${hint}`));
  };
  band('voice-sentences', 'Average sentence length', m.sentenceWords, t.sentenceWords, value(m.sentenceWords, t.sentenceWords.target, 'Shorten the long sentences.', 'Join a few short sentences.'));
  band('voice-short', 'Share of very short sentences (percent)', m.shortSentencePct, t.shortSentencePct, 'Mix in a few short sentences, not too many.');
  band('voice-you', 'Times "you" is used per 1,000 words', m.youPer1000, t.youPer1000, value(m.youPer1000, t.youPer1000.target, 'Use "you" a little less often.', 'Speak to the reader more directly.'));
  band('voice-questions', 'Questions per 1,000 words', m.questionsPer1000, t.questionsPer1000, 'The author asks a question now and then.');
  band('voice-paragraphs', 'Average paragraph length in words', m.paragraphWords, t.paragraphWords, value(m.paragraphWords, t.paragraphWords.target, 'Split long paragraphs.', 'Paragraphs of two or three sentences read best.'));
  if (m.exclamationsPer1000 > t.maxExclamationsPer1000) out.push(advisory('voice-exclaim', 'Too many exclamation marks for this author.'));
  if (t.firstPerson === 'none' && m.personalI + (body.match(/\bI\s+(recommend|suggest|advise)/gi)?.length ?? 0) > 0) out.push(advisory('voice-first-person', 'The author does not use "I" here.'));
  if (t.firstPerson === 'advice-only' && m.personalI > 0) out.push(advisory('voice-first-person', 'First person is only for advice ("I recommend"). No personal stories or claimed experience unless the author supplied them.'));
  return out;
}

const value = (v: number, target: number, high: string, low: string): string => (v > target ? high : low);
