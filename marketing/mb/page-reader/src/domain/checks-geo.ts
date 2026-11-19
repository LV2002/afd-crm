import { ok, warn, type Check } from './audit.ts';

const QUESTION = /\?\s*$|^(how|what|why|when|where|which|who|is|are|can|should|does|do|will)\b/i;
const ANSWER_MIN = 30;
const ANSWER_MAX = 80;
const BLOG = '/blog/post/';

export const geoChecks: readonly Check[] = [
  (p) => {
    const answered = p.sections.filter((s) => QUESTION.test(s.heading.trim()) && s.answerWords >= ANSWER_MIN && s.answerWords <= ANSWER_MAX).length;
    return answered >= 2 ? ok('answer-ready', 'geo', `${String(answered)} question headings with a direct answer.`) : warn('answer-ready', 'geo', `${String(answered)} question headings with a ${String(ANSWER_MIN)} to ${String(ANSWER_MAX)} word direct answer under them.`, 'Add question headings (H2) each followed by a short, direct answer that a search engine or AI assistant can quote.');
  },
  (p) => (p.headings.slice(0, Math.max(3, Math.ceil(p.headings.length * 0.3))).some((h) => /key takeaways|quick answer|in short|at a glance/i.test(h.text)) ? ok('takeaways', 'geo', 'Key takeaways near the top.') : warn('takeaways', 'geo', 'No key-takeaways section near the top.', 'Add a short "Key takeaways" list under the introduction.')),
  (p) => (p.jsonLd.some((j) => j.types.includes('FAQPage')) && !p.sections.some((s) => QUESTION.test(s.heading.trim())) ? warn('faq-visible', 'geo', 'FAQ markup exists but the page shows no visible questions.', 'Search engines want the markup to match what readers can see; show the questions or remove the markup.') : undefined),
  (p, ctx) => {
    if (p.years.length === 0) return undefined;
    const newest = Math.max(...p.years);
    return newest < ctx.cycleYear ? warn('fresh-dates', 'geo', `The newest year mentioned is ${String(newest)}, a cycle behind ${String(ctx.cycleYear)}.`, 'Update dates and details from the facts table.') : ok('fresh-dates', 'geo', `Mentions ${String(newest)}.`);
  },
  (p) => (p.path.startsWith(BLOG) && !p.hasByline ? warn('author', 'geo', 'No author or byline found.', 'Show who wrote it; search engines and AI assistants favour pages with a named expert.') : undefined),
  (p, ctx) => (p.path.startsWith(BLOG) && !p.links.some((l) => ctx.officialDomains.some((d) => l.href.includes(d))) ? warn('official-source', 'geo', 'No link to an official source (the exam body).', 'Cite the official page for dates and rules; it builds trust.') : undefined),
  (p, ctx) => {
    const bad = p.images.filter((i) => !i.hasAlt && !ctx.templateImages.has(i.src)).length;
    return bad > 0 ? warn('image-alt', 'media', `${String(bad)} image(s) without alt text.`, 'Describe each image in a few words.') : ok('image-alt', 'media', 'Images have alt text.');
  },
];
