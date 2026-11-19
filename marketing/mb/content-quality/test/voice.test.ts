import { describe, expect, it } from 'vitest';
import { VoiceTargetsSchema, loadCopyRules, measureVoice, voiceScore } from '../src/index.ts';

const targets = VoiceTargetsSchema.parse(JSON.parse((await import('node:fs')).readFileSync(new URL('../../../config/author-voice.json', import.meta.url), 'utf8')));
const authorLike = [
  'Choosing between design and architecture is not an easy decision, and most families feel pressure to settle it soon after the board exams end. Take a little time to understand what each path asks before you commit to a plan.',
  'Have you ever wondered how a mentor reads a drawing in the first thirty seconds of looking at it? They notice proportion, line quality and whether the student observed the object carefully before starting.',
  'Every plan should begin with the exam dates, because the number of weeks that are left decides how much practice is realistic. Divide those weeks into drawing practice, aptitude practice and steady revision.',
  'Many families ask whether coaching is necessary for every student, and the honest answer is that it depends on the guidance a student already gets at school and at home. I recommend you decide after a trial class.',
  'Whatever the choice, keep a notebook of mistakes and read it every Sunday, because small habits like this add up faster than long sessions done once in a while. Progress in drawing is slow, then suddenly visible.',
  'When your drawings improve, show them to a mentor and ask what a stranger would notice first. Rest matters as well, so plan one lighter day each week and return to your work with a clear head.',
].join('\n\n');

describe('voiceScore', () => {
  it('has nothing to say about text in the author\'s style', () => {
    expect(voiceScore(authorLike, targets)).toEqual([]);
  });

  it('measures what it reports', () => {
    const m = measureVoice(authorLike);
    expect(m.youPer1000).toBeGreaterThan(20);
    expect(m.questionsPer1000).toBeGreaterThan(0);
    expect(m.personalI).toBe(0);
  });

  it('flags very long sentences with no direct address', () => {
    const long = 'Notwithstanding the considerable administrative complexities inherent in contemporary institutional admissions frameworks, prospective candidates ought to recognise that comprehensive preparation requires sustained dedication over extended periods of consistent practice.';
    expect(voiceScore(`${long}\n\n${long}\n\n${long}`, targets).map((f) => f.code)).toEqual(expect.arrayContaining(['voice-sentences', 'voice-you']));
  });

  it('flags shouting and personal stories', () => {
    const codes = voiceScore(`${authorLike}\n\nI remember when I started teaching in a small room! It was great!`, targets).map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['voice-exclaim', 'voice-first-person']));
  });

  it('allows "I recommend" as advice but not as a story, depending on the setting', () => {
    expect(voiceScore('I recommend you start early. I suggest a weekly plan.', { ...targets, firstPerson: 'advice-only' }).map((f) => f.code)).not.toContain('voice-first-person');
    expect(voiceScore('I recommend you start early.', { ...targets, firstPerson: 'none' }).map((f) => f.code)).toContain('voice-first-person');
    expect(voiceScore('I remember a student once.', { ...targets, firstPerson: 'allowed' }).map((f) => f.code)).not.toContain('voice-first-person');
  });
});

describe('copy rules file still loads', () => {
  it('loads', () => {
    expect(loadCopyRules(new URL('../../../config/copy-rules.json', import.meta.url).pathname).ok).toBe(true);
  });
});
