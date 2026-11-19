import { copyGuard, isReady, type CheckResult, type CopyRules, type Draft } from '@mb/content-quality';
import { isUsable, resolveFactsLive, type Fact } from '@mb/facts';
import { formScriptTag, stickyContact, type BrandTheme, inferExam, planCtas, recommendOffers, renderCentresBlock, renderCtas, renderOffer, type CentresConfig, type CtaPlaybook, type LeadFormsConfig } from '@mb/lead-intake';
import { intentOf } from '@mb/topics';
import { err, ok, type Result } from '@mb/platform';
import { styleArticle } from '../design/article.ts';
import { DESIGN_VERSION, FONTS_URL, SITE_CSS } from '../design/site-css.ts';
import { bodyProblems, renderBody, type OfferSetup } from './body.ts';
import { articleLd, breadcrumbLd, centreLd, faqLd } from './schema-ld.ts';

// The six pieces the owner pastes into Knorish, in the order Knorish asks for them.
export interface KnorishPackage {
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly metaKeywords: string;
  readonly headerCode: string;
  readonly pageBody: string;
  readonly footerCode: string;
}

export interface BuildContext {
  readonly facts: ReadonlyMap<string, Fact>;
  readonly rules: CopyRules;
  readonly forms: LeadFormsConfig;
  readonly now: Date;
  readonly author: string;
  readonly siteName: string;
  readonly siteUrl: string;
  readonly offers?: OfferSetup;
  // The wording and placement of the tailored calls to action (config/cta-playbook.json). Without it a page gets the plain closing panel.
  readonly cta?: CtaPlaybook;
  // Where each centre is (Google Maps link, embed, address). Without it, or with empty fields, no centres block is added.
  readonly centres?: CentresConfig;
  // Shown on the author card; the card appears only when a bio is given.
  readonly authorProfile?: { readonly role: string; readonly bio: string; readonly photoUrl: string; readonly url?: string };
  // Other posts to point to at the end of an article.
  readonly related?: readonly { readonly title: string; readonly path: string }[];
  readonly demoUrl?: string;
  // Ready-made blocks for the free tools whose rule matches a confirmed fact, by tool id.
  readonly tools?: ReadonlyMap<string, string>;
  // The checker for each exam, added after an article about that exam that has none of its own.
  readonly toolsByExam?: ReadonlyMap<string, string>;
  // The brand colours the footer script carries.
  readonly brand?: BrandTheme;
}

export interface BuildRequest {
  readonly draft: Draft;
  readonly check: CheckResult;
  readonly kind: 'blog' | 'page';
  readonly path: string; // e.g. /blog/post/nid-dat-preparation
  readonly topic?: string; // the small label above the title (the exam)
}

const FORBIDDEN_PATH = /^\/(publisher|user)(\/|$)/i;
const dateLabel = (d: Date): string => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(d);

// The design block that goes in the header code: the site's fonts and the page stylesheet (scoped, versioned so a re-read can confirm it).
export const designHeader = (): string => `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS_URL}">\n<style data-afd-design="${DESIGN_VERSION}">${SITE_CSS}</style>`;

const FEE = /fee|price|cost|discount/i;
const RELATION_ORDER = { here: 0, 'next-door': 1, further: 2 } as const;

// A local page shows the centre in or next to its district first; any other page keeps the usual order.
function centreOrder(req: BuildRequest): string[] {
  return [...(req.draft.brief.geo?.centres ?? [])].sort((a, b) => RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation]).map((c) => c.name);
}

// The pages above a local page, found from the links the plan gave it: the whole-country page, then the state page.
function trailOf(req: BuildRequest): { title: string; path: string }[] {
  const plan = req.draft.brief.plan;
  if (plan?.parentPath !== undefined) { const up = plan.links.find((l) => l.path === plan.parentPath); return up === undefined ? [] : [up]; }
  const geo = req.draft.brief.geo;
  if (geo === undefined || geo.tier === 'india') return [];
  const india = geo.links.find((l) => l.path.endsWith('-in-india'));
  const kerala = geo.tier === 'district' ? geo.links.find((l) => l.path === geo.parentPath) : undefined;
  return [...(india === undefined ? [] : [india]), ...(kerala === undefined ? [] : [kerala])];
}
const dayOf = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

// The next few dates for the exam from the facts table, shown beside the article. They are tagged, so they stay live.
function keyDatesFor(ctx: BuildContext, exam: string | undefined): { id: string; label: string; value: string }[] {
  if (exam === undefined) return [];
  const today = dayOf(ctx.now);
  return [...ctx.facts.values()]
    .filter((f) => f.exam === exam && isUsable(f) && f.date !== undefined && f.date >= today && !FEE.test(f.id) && !FEE.test(f.label))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).slice(0, 4).map((f) => ({ id: f.id, label: f.label, value: f.value }));
}

// The article as it will look: facts filled in, offers and forms in place, then dressed in the site's design.
export function buildArticleHtml(ctx: BuildContext, req: BuildRequest): Result<{ html: string; qa: readonly { question: string; answer: string }[] }, string[]> {
  // Dates and figures in the body stay live: the footer script refreshes them when the fact is updated in Marketing Brain.
  const text = resolveFactsLive(req.draft.body, ctx.facts);
  if (!text.ok) return err(text.error.map((p) => (p.kind === 'unknown' ? `unknown fact "${p.id}"` : `fact "${p.id}" is ${p.status}, not verified`)));
  const body = renderBody(text.value, ctx.forms, ctx.offers, ctx.tools);
  if (!body.ok) return err(body.error);
  // Refused out loud before the design step, which would otherwise drop such things without saying so.
  const unsafe = bodyProblems(body.value.html);
  if (unsafe.length > 0) return err(unsafe);
  const exam = ctx.offers?.exam ?? inferExam(`${req.path} ${req.topic ?? ''} ${req.draft.seoTitle}`);
  // The card beside the article: a blog offers the exam's free resource, a page leads with the demo class (same funnel as in the text).
  let railOffer = '';
  if (ctx.offers !== undefined) {
    const pick = recommendOffers({ kind: req.kind, exam }, ctx.offers.config).find((p) => p.placement === (req.kind === 'blog' ? 'middle' : 'top'));
    const offer = ctx.offers.config.offers.find((o) => o.id === pick?.offerId);
    if (offer !== undefined) {
      const rail = renderOffer(offer, 'rail', exam, ctx.offers.config, ctx.offers.ctx);
      if (!rail.ok) return err([rail.error]);
      railOffer = rail.value;
    }
  }
  const intent = intentOf(`${req.path} ${req.draft.seoTitle}`.replace(/[-_/]/g, ' '))?.id;
  let ctaError: string | undefined;
  // Planned once the article knows how many sections it has, so cards land between sections and never after the last.
  const cta = ctx.cta;
  const setup = ctx.offers;
  const ctas = cta === undefined || setup === undefined ? undefined : (sections: number) => {
    const plan = planCtas({ title: req.draft.seoTitle, exam, intent, sections, offers: setup.config, ctx: setup.ctx, playbook: cta });
    if (plan === undefined) return undefined;
    const drawn = renderCtas(plan, ctx.forms, req.path);
    if (!drawn.ok) { ctaError = drawn.error; return undefined; }
    return drawn.value;
  };
  const html = styleArticle(body.value.html, {
    variant: req.kind, title: req.draft.seoTitle, topic: req.topic ?? 'Design entrance', siteUrl: ctx.siteUrl,
    author: req.kind === 'blog' ? { name: ctx.author, role: ctx.authorProfile?.role ?? '', bio: ctx.authorProfile?.bio ?? '', photoUrl: ctx.authorProfile?.photoUrl ?? '', url: ctx.authorProfile?.url ?? '' } : undefined,
    dateLabel: dateLabel(ctx.now), related: req.draft.brief.geo?.links ?? req.draft.brief.plan?.links ?? ctx.related ?? [], trail: trailOf(req), centresBlock: ctx.centres === undefined ? '' : renderCentresBlock(ctx.centres, ctx.forms, centreOrder(req)), centres: ctx.forms.centres, demoUrl: ctx.demoUrl ?? '/page/demo-class', railOffer, keyDates: keyDatesFor(ctx, exam), ctas, exam, intent,
  });
  if (ctaError !== undefined) return err([ctaError]);
  // A page about an exam gets that exam's checker once, never twice, and never on the checker's own page.
  const checker = exam === undefined || html.includes('data-afd-tool') ? undefined : ctx.toolsByExam?.get(exam);
  return ok({ html: checker === undefined ? html : `${html}\n${checker}`, qa: body.value.qa });
}

function centreSchemas(ctx: BuildContext): string[] {
  return (ctx.forms.centres).flatMap((c) => {
    const p = ctx.centres?.centres.find((x) => x.id === c.id);
    return p === undefined || p.streetAddress === '' || p.locality === '' || p.postalCode === '' ? [] : [centreLd({ name: c.name, phone: c.phone, ...p, latitude: p.latitude, longitude: p.longitude }, ctx.siteName, ctx.siteUrl)];
  });
}

export function buildKnorishPackage(ctx: BuildContext, req: BuildRequest): Result<KnorishPackage, string[]> {
  const { draft } = req;
  // Only a draft whose last check passed, and has not changed since, can be packaged.
  if (!isReady(req.check, draft)) return err(['the draft has not passed its content check, or was edited after it']);
  if (FORBIDDEN_PATH.test(req.path)) return err([`${req.path} is under /publisher or /user: no conversion changes there`]);

  const article = buildArticleHtml(ctx, req);
  if (!article.ok) return article;

  const schema = [
    req.kind === 'blog'
      ? articleLd({ headline: draft.seoTitle, description: draft.metaDescription, author: ctx.author, authorUrl: ctx.authorProfile?.url, authorJobTitle: ctx.authorProfile?.role, siteName: ctx.siteName, siteUrl: ctx.siteUrl, path: req.path, publishedAt: ctx.now, modifiedAt: ctx.now })
      : '',
    article.value.qa.length >= 2 ? faqLd(article.value.qa) : '',
    ...centreSchemas(ctx),
    req.draft.brief.geo === undefined && req.draft.brief.plan === undefined ? '' : breadcrumbLd([{ name: 'Home', url: ctx.siteUrl }, ...trailOf(req).map((t) => ({ name: t.title, url: `${ctx.siteUrl}${t.path}` })), { name: draft.seoTitle, url: `${ctx.siteUrl}${req.path}` }]),
  ].filter((x) => x !== '').join('\n');

  const pkg: KnorishPackage = {
    metaTitle: draft.seoTitle,
    metaDescription: draft.metaDescription,
    metaKeywords: [draft.brief.primaryKeyword, ...draft.brief.secondaryKeywords].join(', '),
    headerCode: `${designHeader()}\n${schema}`.trim(),
    pageBody: article.value.html,
    footerCode: formScriptTag(ctx.forms.endpoint, ctx.brand, stickyContact(ctx.forms)),
  };

  // Final safety net on exactly what will be pasted: the house rules once more, now on resolved text with no placeholders left.
  const problems = [
    ...bodyProblems(pkg.pageBody),
    ...copyGuard([pkg.metaTitle, pkg.metaDescription, pkg.pageBody.replace(/<[^>]+>/g, ' ')].join('\n'), ctx.rules, { allowFactTokens: false }).map((f) => f.message),
  ];
  return problems.length > 0 ? err(problems) : ok(pkg);
}
