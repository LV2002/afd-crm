// The master footer's design, scoped to its own wrapper (.afd-footer) so it looks the same wherever it is pasted: dark, in a tidy grid, with the form as a
// white card, the centres as cards of their own and the legal line last. The builder keeps colours and widths in inline styles, hence !important.
export const FOOTER_CSS = `.afd-footer{box-sizing:border-box;background:#111;border-top:6px solid var(--b-primary,#C8102E);color:#fff;font-family:Montserrat,system-ui,sans-serif;padding:44px 20px 28px}
.afd-footer *{box-sizing:border-box}
.afd-footer .row{max-width:1180px;margin-left:auto!important;margin-right:auto!important;display:grid!important;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:28px 36px;align-items:start;margin:0 0 28px!important}
.afd-footer .row:first-of-type{grid-template-columns:minmax(280px,1.3fr) minmax(230px,1fr) minmax(140px,.6fr)}
/* The scholarship form leads on the left, the contact column follows, and the page links sit on the right. Only the order changes, not the code. (nth-of-type, because the builder puts a spell-checker element before the first column.) */
.afd-footer .row:first-of-type>.column:nth-of-type(2){order:1}
.afd-footer .row:first-of-type>.column:nth-of-type(3){order:2}
.afd-footer .row:first-of-type>.column:nth-of-type(1){order:3}
.afd-footer .column{width:auto!important;max-width:none!important;flex:none!important;min-height:0!important;padding:0!important;margin:0!important;align-items:flex-start!important;justify-content:flex-start!important;text-align:left!important}
.afd-footer .column>p,.afd-footer .column>p *,.afd-footer .column>span,.afd-footer .column>span *,.afd-footer .column .text-center>a:not([role=button]){color:#fff!important;text-align:left!important}
.afd-footer .column a{text-decoration:none}.afd-footer .column a:hover{text-decoration:underline}
.afd-footer .column>p.font-semibold,.afd-footer .column>p.font-semibold *{color:#F08595!important;font-size:.78rem!important;font-weight:800!important;letter-spacing:.08em;text-transform:uppercase}
.afd-footer .column>span a{display:block;padding:3px 0;font-weight:700;text-decoration:none!important}
.afd-footer .column>span p{margin:0!important}
.afd-footer .text-center{text-align:left!important}
.afd-footer a[role=button]{display:inline-flex!important;margin:4px 8px 4px 0!important;background:var(--b-primary,#C8102E)!important;border:2px solid #fff!important;border-radius:8px!important;box-shadow:none;padding:10px 20px!important}
.afd-footer a[role=button],.afd-footer a[role=button] *{color:#fff!important;font-weight:800!important;text-transform:uppercase;letter-spacing:.04em}
.afd-footer .is-social{display:flex!important;flex-wrap:wrap;gap:10px;margin:4px 0 14px}
.afd-footer .is-social a{display:inline-flex!important;padding:6px!important;background:#fff;border-radius:50%}
.afd-footer .is-social img{width:30px!important;height:30px!important;margin:0!important}
.afd-footer .row:nth-of-type(2){grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-auto-rows:1fr;align-items:stretch!important}
.afd-footer .row:nth-of-type(2) .column{display:flex!important;flex-direction:column!important;justify-content:flex-start!important;width:100%!important;height:100%;min-height:150px!important;background:#1b1b1b;border:2px solid #333;border-radius:10px;padding:18px 20px!important}
.afd-footer .row:nth-of-type(2) .column .font-semibold>br,.afd-footer .row:nth-of-type(2) .column .font-semibold+br{display:none!important}
.afd-footer .row:nth-of-type(2) .column>p{margin:0!important;width:100%}
.afd-footer .row:nth-of-type(2) .column>p,.afd-footer .row:nth-of-type(2) .column>p *{font-size:.92rem;line-height:1.55}
.afd-footer .row:nth-of-type(2) .column>p .font-semibold{display:block;margin-bottom:4px;color:#F08595!important;font-size:.82rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.afd-footer .row:last-of-type{display:block!important;margin:0!important;padding-top:18px;border-top:1px solid #333}
.afd-footer .row:last-of-type .column{text-align:center!important;align-items:center!important}
.afd-footer .afd-offer{margin:0!important}
.afd-footer .row:last-of-type .column>p,.afd-footer .row:last-of-type .column>p *{text-align:center!important;font-size:.85rem;color:#bbb!important}
@media(max-width:900px){.afd-footer .row:first-of-type,.afd-footer .row:nth-of-type(2){grid-template-columns:1fr!important}.afd-footer .row:nth-of-type(2){grid-auto-rows:auto}}`;
