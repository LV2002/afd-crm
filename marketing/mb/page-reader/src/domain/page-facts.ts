// Everything the audits need to know about one page, read from its HTML. Plain data: no HTML library types leak out.
export interface PageFacts {
  readonly url: string;
  readonly path: string;
  readonly status: number;
  readonly title: string;
  readonly metaDescription: string;
  readonly canonical: string;
  readonly robotsMeta: string;
  readonly metaKeywords: string;
  // The first words of the page's own text, to confirm a pasted page is the one we sent.
  readonly textStart: string;
  // The page's own text (up to 30,000 characters), so a rework starts from what is really there.
  readonly bodyText: string;
  // Offer blocks of ours already on the page (data-afd-offer ids).
  readonly offerIds: readonly string[];
  // Our footer script (form fields, campaign details, submit) is present on the page.
  readonly leadScript: boolean;
  // The version of our page design on the page (from the style block in its header code), or empty.
  readonly designVersion: string;
  readonly lang: string;
  readonly viewport: boolean;
  readonly ogTitle: boolean;
  readonly ogImage: boolean;
  readonly headings: readonly { readonly level: number; readonly text: string }[];
  // For each H2: how many words are in the first paragraph under it (0 if none).
  readonly sections: readonly { readonly heading: string; readonly answerWords: number }[];
  readonly wordCount: number;
  readonly years: readonly number[];
  readonly images: readonly { readonly src: string; readonly hasAlt: boolean }[];
  readonly links: readonly { readonly href: string; readonly text: string }[];
  readonly forms: readonly { readonly fields: readonly string[]; readonly hasPhone: boolean; readonly textOffsetShare: number }[];
  readonly telLinks: readonly string[];
  readonly whatsappLinks: readonly string[];
  // Ten-digit numbers found in the visible text and in call/WhatsApp links.
  readonly phoneNumbers: readonly string[];
  readonly jsonLd: readonly { readonly types: readonly string[]; readonly valid: boolean }[];
  readonly hasByline: boolean;
}
