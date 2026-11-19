// How a free offer looks on the page. Each look is a bold colour block with a big heavy title, so the offers stand out from the text
// and from each other. Colours come from the brand variables (--b-*), set by the theme on the footer script tag.
export const OFFER_CSS = String.raw`
.afd-offer{--b-primary:#C8102E;--b-ink:#111111;--b-surface:#FFFFFF;--b-accent:#6F7B52;box-sizing:border-box;position:relative;margin:2.2em 0;padding:clamp(22px,4vw,38px);border:3px solid var(--b-ink);border-radius:10px;font:600 1rem/1.5 Montserrat,system-ui,sans-serif;background:var(--ob);color:var(--oc)}
.afd-offer *{box-sizing:border-box}
.afd-offer::before{content:attr(data-afd-kicker);display:inline-block;margin:0 0 14px;padding:6px 12px;background:var(--ok);color:var(--okc);font:900 .78rem/1 Montserrat,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase}
.afd-offer .afd-offer-title{margin:0 0 10px}
.afd-offer .afd-offer-title strong{display:block;font:900 clamp(2rem,7vw,3.4rem)/.98 Montserrat,system-ui,sans-serif;letter-spacing:-.025em;text-transform:uppercase;color:var(--ot)}
.afd-offer>p{margin:0 0 12px;font-size:1.1rem;font-weight:600;color:var(--oc)}
.afd-offer .afd-offer-deadline{display:inline-block;padding:5px 14px;border-radius:99px;background:#fff;color:#111;font-size:.85rem;font-weight:800}
.afd-offer .afd-lead{max-width:none;margin:16px 0 0;padding:0;background:transparent;border:0;border-radius:0;box-shadow:none;color:var(--oc)}
.afd-offer .afd-lead label,.afd-offer .afd-lead label small{color:var(--oc)}
.afd-offer .afd-lead input,.afd-offer .afd-lead select{border:2px solid var(--b-ink);background:#fff;color:#111}
.afd-offer .afd-lead button[type=submit]{height:66px;border-radius:8px;border:3px solid var(--b-ink);background:var(--obtn);color:var(--obtc);font:900 1.3em Montserrat,system-ui,sans-serif;letter-spacing:.03em;box-shadow:5px 5px 0 var(--b-ink)}
.afd-offer .afd-lead button[type=submit]:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--b-ink);background:var(--obtn)}
.afd-offer .afd-lead [data-afd-thanks],.afd-offer .afd-lead [data-afd-thanks] a{color:var(--oc)}
.afd-offer .afd-lead [data-afd-thanks]::before{background:#fff;color:#111}
.afd-offer .afd-open,.afd-sb-sheet .afd-open,.afd-lead .afd-open{display:block;margin:0 0 14px;padding:18px 20px;border:3px solid #111;border-radius:8px;background:var(--b-primary,#C8102E);color:#fff!important;font:900 1.25rem/1.1 Montserrat,system-ui,sans-serif;text-align:center;text-transform:uppercase;text-decoration:none!important;box-shadow:5px 5px 0 #111}
.afd-look-red{--ob:var(--b-primary);--oc:#fff;--ot:#fff;--ok:#fff;--okc:var(--b-primary);--obtn:var(--b-ink);--obtc:#fff}
.afd-look-black{--ob:var(--b-ink);--oc:#fff;--ot:#fff;--ok:var(--b-primary);--okc:#fff;--obtn:var(--b-primary);--obtc:#fff;border-color:var(--b-primary)}
.afd-look-black .afd-lead button[type=submit]{border-color:#fff;box-shadow:5px 5px 0 #fff}
.afd-look-green{--ob:var(--b-accent);--oc:#fff;--ot:#fff;--ok:var(--b-ink);--okc:#fff;--obtn:var(--b-ink);--obtc:#fff}
.afd-look-paper{--ob:#fff;--oc:#111;--ot:var(--b-primary);--ok:var(--b-ink);--okc:#fff;--obtn:var(--b-primary);--obtc:#fff;box-shadow:10px 10px 0 var(--b-primary)}
/* Smaller blocks for narrower or busier places. Medium sits between sections; small fits a column such as the footer. */
.afd-offer.afd-size-m{padding:clamp(18px,3vw,28px)}
.afd-offer.afd-size-m .afd-offer-title strong{font-size:clamp(1.6rem,4.5vw,2.3rem)}
.afd-offer.afd-size-m>p{font-size:1rem}
.afd-offer.afd-size-m .afd-lead button[type=submit]{height:56px;font-size:1.1em}
.afd-offer.afd-size-s{padding:18px;border-width:2px}
.afd-offer.afd-size-s.afd-look-paper{box-shadow:5px 5px 0 var(--b-primary)}
.afd-offer.afd-size-s::before{margin-bottom:10px;padding:5px 10px;font-size:.68rem}
.afd-offer.afd-size-s .afd-offer-title{margin-bottom:6px}
.afd-offer.afd-size-s .afd-offer-title strong{font-size:clamp(1.3rem,3.2vw,1.7rem)}
.afd-offer.afd-size-s>p{margin-bottom:6px;font-size:.95rem}
.afd-offer.afd-size-s .afd-lead{margin-top:10px}
.afd-offer.afd-size-s .afd-lead form{gap:10px;grid-template-columns:1fr}
.afd-offer.afd-size-s .afd-lead label{font-size:.68rem;margin-bottom:3px}
.afd-offer.afd-size-s .afd-lead input,.afd-offer.afd-size-s .afd-lead select{height:42px}
.afd-offer.afd-size-s .afd-lead button[type=submit]{height:48px;font-size:1rem;box-shadow:3px 3px 0 var(--b-ink)}
/* Two fields side by side only when the box is wide enough for both. */
.afd-offer .afd-lead form{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}.afd-offer .afd-lead form>button{grid-column:1/-1}
`;
