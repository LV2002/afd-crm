import { z } from 'zod';

// The brand look of every conversion block (forms, strips, tools). Colours are data so another academy can be
// themed without touching code. Defaults are AFD's bold red, black and white with a dull green accent; the owner
// replaces them with exact hex values in config/brand.json.
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six digit hex colour such as #C8102E');

export const BrandThemeSchema = z.object({
  primary: Hex.default('#C8102E'),
  ink: Hex.default('#111111'),
  surface: Hex.default('#FFFFFF'),
  accent: Hex.default('#6F7B52'),
});
export type BrandTheme = z.infer<typeof BrandThemeSchema>;

export const DEFAULT_BRAND: BrandTheme = BrandThemeSchema.parse({});

// Variable overrides only. The bold shapes live in BRAND_CSS and read these, so a theme is four values.
export const themeVariables = (theme: BrandTheme): string =>
  `--b-primary:${theme.primary};--b-ink:${theme.ink};--b-surface:${theme.surface};--b-accent:${theme.accent}`;

// Appended after the base form CSS so it wins on equal specificity. Big uppercase headline, heavy red button.
export const BRAND_CSS = String.raw`
.afd-lead,.afd-strip,.afd-cta{${themeVariables(DEFAULT_BRAND)}}
.afd-lead{--o:var(--b-primary);--ink:var(--b-ink);--ks:var(--b-surface);--k:var(--b-accent);--ln:var(--b-accent);border:3px solid var(--b-ink);border-radius:10px;box-shadow:8px 8px 0 var(--b-primary)}
.afd-lead h2,.afd-lead h3,.afd-lead .afd-title{margin:0 0 14px;font:800 clamp(1.5rem,5vw,2.1rem)/1.1 Montserrat,system-ui,sans-serif;text-transform:uppercase;letter-spacing:-.01em;color:var(--b-ink)}
.afd-lead label{text-transform:uppercase;letter-spacing:.06em}
.afd-lead input,.afd-lead select{border:2px solid var(--b-ink);border-radius:6px}
.afd-lead button[type=submit]{height:58px;border-radius:6px;background:var(--b-primary);color:#fff;font:800 1.15em Montserrat,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em}
.afd-lead button[type=submit]:hover{box-shadow:0 8px 18px rgba(0,0,0,.3);background:var(--b-ink)}
.afd-lead [data-afd-thanks]::before{background:var(--b-accent)}
`;
