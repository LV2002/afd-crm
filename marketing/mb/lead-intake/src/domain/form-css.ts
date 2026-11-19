import { BRAND_CSS } from './brand.ts';
import { OFFER_CSS } from './offer-css.ts';
import { CTA_CSS } from './cta-css.ts';

// The enquiry form's own design, in afdindia's look (Montserrat, burnt orange #D84315, amber #F9A825, khaki panel).
// It is defined once, here, and the footer script puts it on the page, so a form looks right wherever it is placed and a
// change to the design is one paste into the footer, never an edit of every form. It sets its own variables and never
// depends on the host page's styles. Scoped to .afd-lead so it cannot restyle anything else.
export const SITE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Cabin+Sketch:wght@400;700&family=Montserrat:wght@300;400;500;600;700;800&display=swap';

const FORM_BASE_CSS = String.raw`
.afd-lead{--o:#D84315;--a:#F9A825;--k:#D4CC98;--ks:#F7F4E6;--ink:#14110C;--mu:#5E5A50;--ln:#E7E2D4;--wa:#25D366;box-sizing:border-box;max-width:560px;margin:1.4em 0;padding:24px;background:var(--ks);border:1px solid var(--k);border-radius:18px;font:500 16px/1.5 Montserrat,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink)}
.afd-lead *{box-sizing:border-box}
.afd-lead form{display:grid;gap:14px;grid-template-columns:1fr;margin:0}
@media(min-width:560px){.afd-lead form{grid-template-columns:1fr 1fr}.afd-lead form>button{grid-column:1/-1}}
.afd-lead.compact form{grid-template-columns:1fr}
.afd-lead label{display:block;font-size:.78em;font-weight:700;letter-spacing:.02em;margin:0 0 5px;color:var(--ink)}
.afd-lead label small{font-weight:500;color:var(--mu)}
.afd-lead input,.afd-lead select{display:block;width:100%;height:48px;padding:0 14px;border:1.5px solid #C9C28A;border-radius:12px;font:500 1em Montserrat,system-ui,sans-serif;background:#fff;color:var(--ink);-webkit-appearance:none;appearance:none}
.afd-lead select{padding-right:38px;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='8' fill='none' stroke='%2314110C' stroke-width='2'%3E%3Cpath d='M1 1l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 14px center}
.afd-lead input:focus-visible,.afd-lead select:focus-visible,.afd-lead button:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.afd-lead input:focus,.afd-lead select:focus{border-color:var(--o)}
.afd-lead button[type=submit]{height:50px;padding:0 20px;border:0;border-radius:12px;background:var(--o);color:#fff;font:700 1em Montserrat,system-ui,sans-serif;cursor:pointer;transition:transform .12s,box-shadow .12s}
.afd-lead button[type=submit]:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(216,67,21,.28)}
.afd-lead button[disabled]{opacity:.65;cursor:wait;transform:none;box-shadow:none}
.afd-lead [data-afd-error]{margin:12px 0 0;padding:10px 14px;border-radius:10px;background:#FDEEE9;border:1px solid #F4BFB0;color:#9b1c1c;font-weight:600;font-size:.9em}
.afd-lead [data-afd-thanks]{margin:0;padding:6px 2px;font-weight:600}
.afd-lead [data-afd-thanks]::before{content:"\2713";display:grid;place-items:center;width:44px;height:44px;margin-bottom:10px;border-radius:50%;background:var(--o);color:#fff;font-size:1.4em;font-weight:800}
.afd-lead [data-afd-thanks] p{margin:0 0 10px}
.afd-lead [data-afd-thanks] a{color:var(--ink);text-decoration:underline;text-decoration-color:var(--o);text-decoration-thickness:2px;text-underline-offset:3px}
[hidden].afd-lead,.afd-lead [hidden]{display:none!important}
@media(prefers-reduced-motion:reduce){.afd-lead button[type=submit]{transition:none}}
`;

export const FORM_CSS = `${FORM_BASE_CSS}${CTA_CSS}${BRAND_CSS}${OFFER_CSS}`;
