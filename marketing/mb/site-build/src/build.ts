import { readFileSync } from 'node:fs';
import { contentCheck, loadCopyRules, voiceScore, VoiceTargetsSchema, BriefSchema, type Draft, type CheckResult } from '@mb/content-quality';
import { FactSchema, isUsable, type Fact } from '@mb/facts';
import { buildKnorishPackage, type BuildContext, type KnorishPackage } from '@mb/knorish';
import { CentresConfigSchema, CtaPlaybookSchema, OffersConfigSchema, inferExam, loadBrand, loadLeadFormsConfig } from '@mb/lead-intake';
import { err, istDate, ok, type Result } from '@mb/platform';
import { z } from 'zod';
import { listOf, parseBlogDraft } from './blog-draft.ts';
import { toolBlocks, toolSpecs } from './tools-state.ts';

const SiteSchema = z.object({ siteName: z.string(), siteUrl: z.string(), author: z.string(), authorRole: z.string().default(''), authorBio: z.string().default(''), authorPhotoUrl: z.string().default('') });
const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

export function loadFacts(path: string): Result<Map<string, Fact>, string> {
  const parsed = z.array(FactSchema).safeParse(json(path));
  return parsed.success ? ok(new Map(parsed.data.map((f) => [f.id, f]))) : err(`config/facts.seed.json is not valid: ${parsed.error.issues[0]?.message ?? ''}`);
}

// Everything the Knorish builder needs, assembled from this folder's config (the same inputs Marketing Brain's app used).
export function loadBuildContext(root: string, o: { now: Date; endpoint?: string }): Result<BuildContext, string> {
  const rules = loadCopyRules(`${root}/config/copy-rules.json`);
  if (!rules.ok) return err('config/copy-rules.json could not be read.');
  const forms = loadLeadFormsConfig(`${root}/config/lead-forms.json`);
  if (!forms.ok) return err('config/lead-forms.json could not be read.');
  const endpoint = o.endpoint ?? forms.value.endpoint;
  if (endpoint === '') return err('No lead form address. Set LEAD_FORM_ENDPOINT (the Apps Script /exec address) before building pages; it is deliberately not stored in this repository.');
  const formsConfig = { ...forms.value, endpoint };
  const facts = loadFacts(`${root}/config/facts.seed.json`);
  if (!facts.ok) return facts;
  const site = SiteSchema.safeParse(json(`${root}/config/site.json`));
  const offers = OffersConfigSchema.safeParse(json(`${root}/config/offers.json`));
  const cta = CtaPlaybookSchema.safeParse(json(`${root}/config/cta-playbook.json`));
  const centres = CentresConfigSchema.safeParse(json(`${root}/config/centres.json`));
  if (!site.success || !offers.success) return err('config/site.json or config/offers.json is not valid.');
  const tools = toolBlocks(toolSpecs(`${root}/config/tools.json`), facts.value);
  const offerFacts = new Map([...facts.value.values()].map((x) => [x.id, { value: x.value, date: x.date, usable: isUsable(x) }]));
  return ok({
    facts: facts.value, rules: rules.value, forms: formsConfig, now: o.now, author: site.data.author, siteName: site.data.siteName, siteUrl: site.data.siteUrl,
    authorProfile: { role: site.data.authorRole, bio: site.data.authorBio, photoUrl: site.data.authorPhotoUrl },
    ...(cta.success ? { cta: cta.data } : {}), ...(centres.success ? { centres: centres.data } : {}),
    tools: tools.byId, toolsByExam: tools.byExam, brand: loadBrand(`${root}/config/brand.json`),
    offers: { config: offers.data, ctx: { forms: formsConfig, today: istDate(o.now), facts: offerFacts }, exam: undefined },
  });
}

export interface BuiltPage { readonly pkg: KnorishPackage; readonly check: CheckResult; readonly path: string; readonly slug: string; readonly advisory: readonly string[] }

// A blog draft file in, the six paste-in pieces out. Blocking findings (copy rules, SEO structure, unknown facts) stop the build.
export function buildBlog(root: string, text: string, o: { now: Date; endpoint?: string }): Result<BuiltPage, string[]> {
  const parsed = parseBlogDraft(text);
  if (!parsed.ok) return err([parsed.error]);
  const d = parsed.value;
  const ctx = loadBuildContext(root, o);
  if (!ctx.ok) return err([ctx.error]);
  const defaults = json(`${root}/config/brief-defaults.json`) as Record<string, unknown>;
  const brief = BriefSchema.safeParse({ ...defaults, primaryKeyword: d.meta['primary_keyword'] ?? '', secondaryKeywords: listOf(d.meta['secondary_keywords']), ...(d.meta['intent'] === undefined ? {} : { searchIntent: d.meta['intent'] }) });
  if (!brief.success) return err([`front-matter: ${brief.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')} (primary_keyword is required)`]);
  const draft: Draft = { seoTitle: d.seoTitle, metaDescription: d.metaDescription, slug: d.slug, body: d.body, brief: brief.data };
  const check = contentCheck(draft, ctx.value.rules);
  const voice = VoiceTargetsSchema.safeParse(json(`${root}/config/author-voice.json`));
  const advisory = [...check.advisory.map((f) => f.message), ...(voice.success ? voiceScore(draft.body, voice.data).map((f) => f.message) : [])];
  if (!check.ok) return err(check.blocking.map((f) => f.message));
  const path = d.meta['path'] ?? `/blog/post/${d.slug}`;
  const exam = d.meta['exam'] ?? inferExam(`${path} ${d.seoTitle}`);
  const offers = ctx.value.offers === undefined ? undefined : { ...ctx.value.offers, exam };
  const built = buildKnorishPackage({ ...ctx.value, ...(offers === undefined ? {} : { offers }) }, { draft, check, kind: path.startsWith('/blog/') ? 'blog' : 'page', path, topic: exam ?? 'Design entrance' });
  return built.ok ? ok({ pkg: built.value, check, path, slug: d.slug, advisory }) : err(built.error);
}
