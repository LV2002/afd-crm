export interface ArticleInfo {
  readonly headline: string;
  readonly description: string;
  readonly author: string;
  readonly siteName: string;
  readonly siteUrl: string;
  readonly path: string;
  readonly publishedAt: Date;
  readonly modifiedAt: Date;
}

// Escape "<" so the JSON can never close its own <script> tag.
const safe = (data: unknown): string => JSON.stringify(data).replaceAll('<', '\\u003c');
const tag = (data: unknown): string => `<script type="application/ld+json">${safe(data)}</script>`;

export const articleLd = (a: ArticleInfo): string =>
  tag({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.headline,
    description: a.description,
    author: { '@type': 'Person', name: a.author },
    publisher: { '@type': 'Organization', name: a.siteName, url: a.siteUrl },
    mainEntityOfPage: `${a.siteUrl}${a.path}`,
    datePublished: a.publishedAt.toISOString(),
    dateModified: a.modifiedAt.toISOString(),
  });

// Built from the question headings and answers the reader can see on the page, so markup and page always agree.
export const faqLd = (qa: readonly { readonly question: string; readonly answer: string }[]): string =>
  tag({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map((x) => ({ '@type': 'Question', name: x.question, acceptedAnswer: { '@type': 'Answer', text: x.answer } })),
  });

// The trail from the home page down to this page, so search results can show it and a reader can climb back up.
export const breadcrumbLd = (trail: readonly { readonly name: string; readonly url: string }[]): string =>
  tag({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: t.url })),
  });

export interface CentreInfo {
  readonly name: string;
  readonly phone: string;
  readonly streetAddress: string;
  readonly locality: string;
  readonly postalCode: string;
  readonly latitude: number | undefined;
  readonly longitude: number | undefined;
  readonly mapsUrl: string;
  readonly reviewsUrl: string;
  readonly openingHours: string;
}

// One organisation entry per centre that has a full postal address, so search engines can tie the page to the place. A centre with a
// partial address is left out rather than published half-complete.
export const centreLd = (c: CentreInfo, siteName: string, siteUrl: string): string =>
  tag({
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: `${siteName} ${c.name}`,
    url: siteUrl,
    telephone: `+91${c.phone}`,
    address: { '@type': 'PostalAddress', streetAddress: c.streetAddress, addressLocality: c.locality, addressRegion: 'Kerala', postalCode: c.postalCode, addressCountry: 'IN' },
    ...(c.latitude === undefined || c.longitude === undefined ? {} : { geo: { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude } }),
    ...(c.mapsUrl === '' ? {} : { hasMap: c.mapsUrl }),
    ...(c.mapsUrl === '' && c.reviewsUrl === '' ? {} : { sameAs: [c.mapsUrl, c.reviewsUrl].filter((x) => x !== '') }),
    ...(c.openingHours === '' ? {} : { openingHours: c.openingHours }),
  });
