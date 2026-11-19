// Styling for the call to action blocks. Standalone like the form (scoped to .afd-*, variables set here) and delivered the same
// way: the footer script puts it on the page, and the article design includes it, so a block looks right anywhere it is placed.
export const CTA_CSS = String.raw`
.afd-strip{--o:#D84315;--a:#F9A825;--k:#D4CC98;--ks:#F7F4E6;--ink:#14110C;--wa:#25D366;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 18px;margin:14px 0 22px;padding:12px 16px;background:var(--ks);border:1px solid var(--k);border-radius:14px;font:500 15px/1.45 Montserrat,system-ui,sans-serif;color:var(--ink)}
.afd-strip *{box-sizing:border-box}.afd-strip-t{margin:0;flex:1 1 280px;font-weight:600}.afd-strip-a{display:flex;flex-wrap:wrap;gap:8px}
.afd-chip{display:inline-block;margin-left:6px;padding:2px 10px;border:1px solid var(--k);border-radius:999px;background:#fff;color:#D84315;font-size:.82em;font-weight:700;white-space:nowrap}
.afd-b{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border:2px solid #14110C;border-radius:10px;background:#fff;color:#14110C!important;font:700 .92em Montserrat,system-ui,sans-serif;text-decoration:none!important;cursor:pointer}
.afd-b.wa{background:#25D366;border-color:#25D366;color:#111!important}.afd-b:focus-visible{outline:3px solid #14110C;outline-offset:2px}
.afd-cta{--o:#D84315;--a:#F9A825;--k:#D4CC98;--ks:#F7F4E6;--ink:#14110C;--mu:#5E5A50;box-sizing:border-box;margin:2em 0;padding:22px 24px;background:#fff;border:1px solid var(--k);border-left:6px solid var(--o);border-radius:16px;font:500 16px/1.5 Montserrat,system-ui,sans-serif;color:var(--ink)}
.afd-cta *{box-sizing:border-box}.afd-cta-h{margin:0 0 6px;font:800 1.2em/1.3 Montserrat,system-ui,sans-serif}.afd-cta-b{margin:0 0 12px;color:var(--mu);font-size:.95em}
.afd-cta .afd-lead,.afd-sheet .afd-lead,.afd-slide .afd-lead{max-width:none;margin:12px 0 0;padding:0;background:transparent;border:0}
@media(min-width:560px){.afd-cta .afd-lead.short form{grid-template-columns:1fr 1fr}.afd-cta .afd-lead.short form>div:nth-child(3),.afd-cta .afd-lead.short form>button{grid-column:1/-1}}
.afd-cta.big{background:#D84315;border:0;color:#fff;padding:30px 28px;border-radius:22px}.afd-cta.big .afd-cta-b{color:rgba(255,255,255,.92)}.afd-cta.big .afd-lead label{color:#fff}.afd-cta.big .afd-lead label small{color:rgba(255,255,255,.8)}
.afd-cta.big .afd-lead button[type=submit]{background:#F9A825;color:#14110C}.afd-cta.big .afd-chip{margin:0 0 10px;color:#14110C;background:#FFF6DE;border-color:#F3DDA0}.afd-cta.big .afd-lead [data-afd-thanks],.afd-cta.big .afd-lead [data-afd-thanks] a{color:#fff}.afd-cta.big .afd-lead [data-afd-thanks]::before{background:#fff;color:#D84315}
.afd-wrap{max-width:960px;margin:0 auto;padding:0 20px}
.afd-bar{display:none}
@media(max-width:1099px){.afd-bar{display:flex;gap:8px;position:fixed;left:0;right:0;bottom:0;z-index:60;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #E7E2D4;box-shadow:0 -6px 18px rgba(20,17,12,.08)}.afd-bar .afd-b{flex:1;min-height:44px;padding:0 8px;font-size:.88em}}
.afd-b.go{background:#D84315;border-color:#D84315;color:#fff!important}
.afd-sheet,.afd-slide{--o:#D84315;--ink:#14110C;--mu:#5E5A50;--k:#D4CC98;box-sizing:border-box;background:#fff;color:var(--ink);font:500 15px/1.45 Montserrat,system-ui,sans-serif;box-shadow:0 12px 40px rgba(20,17,12,.22)}
.afd-sheet *,.afd-slide *{box-sizing:border-box}
.afd-sheet{position:fixed;left:0;right:0;bottom:0;z-index:70;max-height:88vh;overflow:auto;padding:20px 18px calc(20px + env(safe-area-inset-bottom));border-radius:18px 18px 0 0;border-top:4px solid var(--o)}
.afd-slide{position:fixed;right:20px;bottom:20px;z-index:65;width:340px;max-width:calc(100vw - 40px);padding:18px 18px 16px;border-radius:16px;border-top:4px solid var(--o);animation:afd-up .28s ease-out}
.afd-sheet[hidden],.afd-slide[hidden]{display:none!important}
@media(max-width:1099px){.afd-slide{display:none!important}}
.afd-x{position:absolute;top:8px;right:10px;width:34px;height:34px;border:0;border-radius:50%;background:#F7F4E6;color:#14110C;font:400 22px/1 system-ui,sans-serif;cursor:pointer}
.afd-sheet .afd-cta-h,.afd-slide .afd-cta-h{padding-right:34px;font-size:1.1em}
.afd-sheet .afd-lead.short form,.afd-slide .afd-lead.short form{grid-template-columns:1fr}
@keyframes afd-up{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}
@media(prefers-reduced-motion:reduce){.afd-slide{animation:none}}
`;
