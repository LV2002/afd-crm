// afdindia's look, measured from the live site (Montserrat body, Cabin Sketch headings, burnt orange #D84315 top bar,
// amber #F9A825 buttons, khaki cards, WhatsApp green) and carried over from the old project's blog design.
// Everything is scoped under .afd-post so it can never restyle the rest of the Knorish page, and it uses classes only:
// the page body holds no style attributes, no style tags and no scripts.
import { FORM_CSS, SITE_FONTS_URL } from '@mb/lead-intake';

export const DESIGN_VERSION = 'v2';
export const FONTS_URL = SITE_FONTS_URL;

export const SITE_CSS = String.raw`
.afd-post{--o:#D84315;--a:#F9A825;--k:#D4CC98;--ks:#F7F4E6;--ink:#14110C;--mu:#5E5A50;--ln:#E7E2D4;--wa:#25D366;--r:14px;--fs:17px;--w:1140px;--main:740px;--side:300px;--gap:36px;font:400 var(--fs)/1.75 Montserrat,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#fff;-webkit-font-smoothing:antialiased}
.afd-post *{box-sizing:border-box}.afd-post a{color:inherit}.afd-post img{max-width:100%;height:auto;display:block}
.afd-post .ap-wrap{max-width:var(--w);margin:0 auto;padding:22px 18px 56px;display:grid;grid-template-columns:minmax(0,1fr);gap:var(--gap)}
.afd-post .ap-main{min-width:0}.afd-post .ap-side{display:none}.afd-post .ap-toc-m{margin:1.6em 0}
@media(min-width:1100px){.afd-post .ap-wrap{grid-template-columns:minmax(0,var(--main)) var(--side);justify-content:center}.afd-post .ap-side{display:block}.afd-post .ap-toc-m{display:none}}
.afd-post .ap-side-in{position:sticky;top:20px;display:grid;gap:16px;max-height:calc(100vh - 40px);overflow:auto;padding-bottom:4px}
.afd-post .ap-crumbs{font-size:.8em;color:var(--mu);margin:0 0 14px}.afd-post .ap-crumbs a{text-decoration:none}.afd-post .ap-crumbs a:hover{color:var(--o)}
.afd-post .ap-chip{display:inline-block;background:var(--ks);border:1px solid var(--k);color:var(--ink);font-size:.72em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px}
.afd-post h1{font:700 clamp(2em,4.6vw,2.9em)/1.12 "Cabin Sketch","Comic Sans MS",cursive;letter-spacing:-.01em;margin:12px 0 16px}.afd-post h1 .o{color:var(--o)}
.afd-post h2{font:800 clamp(1.4em,2.6vw,1.75em)/1.25 Montserrat,system-ui,sans-serif;letter-spacing:-.01em;margin:2.3em 0 .8em;scroll-margin-top:20px}
.afd-post h2::before{content:"";display:block;width:40px;height:4px;border-radius:2px;background:var(--o);margin-bottom:10px}
.afd-post h3{font:700 1.15em/1.4 Montserrat,sans-serif;margin:1.8em 0 .4em}
.afd-post p{margin:0 0 1.05em}.afd-post p a,.afd-post li a{text-decoration:underline;text-decoration-color:var(--o);text-decoration-thickness:2px;text-underline-offset:3px}.afd-post p a:hover,.afd-post li a:hover{color:var(--o)}
.afd-post .ap-by{display:flex;align-items:center;gap:12px;color:var(--mu);font-size:.88em;margin:0 0 18px}.afd-post .ap-by b{color:var(--ink)}
.afd-post .ap-av{width:46px;height:46px;border-radius:50%;object-fit:cover;flex:none;background:var(--k);display:grid;place-items:center;font-weight:800;color:var(--ink)}
.afd-post .ap-acts{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 22px}
.afd-post .ap-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 18px;border-radius:10px;font:700 .92em/1.2 Montserrat,sans-serif;text-decoration:none!important;border:2px solid transparent;cursor:pointer;transition:transform .12s,box-shadow .12s}
.afd-post .ap-btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(20,17,12,.14)}.afd-post .ap-btn:focus-visible,.afd-post summary:focus-visible,.afd-post input:focus-visible,.afd-post select:focus-visible,.afd-post button:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.afd-post .ap-o{background:var(--o);color:#fff!important}.afd-post .ap-a{background:var(--a);color:var(--ink)!important}.afd-post .ap-w{background:var(--wa);color:#111!important}.afd-post .ap-g{background:#fff;color:var(--ink)!important;border-color:var(--ink)}.afd-post .ap-x{background:transparent;color:#fff!important;border-color:rgba(255,255,255,.7)}
.afd-post figure{margin:1.6em 0}.afd-post figure img{border-radius:12px;width:100%;aspect-ratio:16/9;object-fit:cover;background:var(--ks)}.afd-post figcaption{font-size:.82em;color:var(--mu);margin-top:8px}
.afd-post .ap-take{background:var(--ks);border:1px solid var(--ln);border-left:6px solid var(--o);border-radius:var(--r);padding:18px 22px;margin:1.6em 0}
.afd-post .ap-take b{display:block;font-size:.74em;letter-spacing:.1em;text-transform:uppercase;color:var(--o);margin-bottom:8px}.afd-post .ap-take ul{margin:0;padding:0;list-style:none}
.afd-post .ap-take li{position:relative;padding-left:26px;margin:.5em 0;font-weight:500}.afd-post .ap-take li::before{content:"\2713";position:absolute;left:0;top:0;color:var(--o);font-weight:800}
.afd-post .ap-toc{border:1px solid var(--ln);border-radius:var(--r);padding:16px 18px;background:#fff}.afd-post .ap-toc>b,.afd-post .ap-toc summary{font-size:.74em;letter-spacing:.1em;text-transform:uppercase;font-weight:800;cursor:pointer}
.afd-post .ap-toc ol{margin:.7em 0 0;padding-left:1.15em;font-size:.9em;line-height:1.5}.afd-post .ap-toc li{margin:.45em 0}.afd-post .ap-toc a{text-decoration:none;color:var(--mu)}.afd-post .ap-toc a:hover{color:var(--o)}
.afd-post .ap-toc a.on{color:var(--o);font-weight:700}
.afd-post .ap-kd,.afd-post .ap-ask{border:1px solid var(--ln);border-radius:var(--r);padding:16px 18px;background:#fff}
.afd-post .ap-kd>b,.afd-post .ap-ask>b{display:block;font-size:.74em;letter-spacing:.1em;text-transform:uppercase;font-weight:800;margin-bottom:8px}
.afd-post .ap-kd dl{margin:0}.afd-post .ap-kd dl>div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--ln);font-size:.86em;line-height:1.4}.afd-post .ap-kd dl>div:first-child{border-top:0}
.afd-post .ap-kd dt{color:var(--mu)}.afd-post .ap-kd dd{margin:0;font-weight:700;text-align:right}
.afd-post .ap-ask p{font-size:.88em;line-height:1.55;margin:0 0 12px;color:var(--mu)}.afd-post .ap-ask .ap-acts{margin:0}.afd-post .ap-ask .ap-btn{flex:1 1 auto;padding:10px 12px;font-size:.84em}
.afd-post .ap-side .afd-offer{margin:0;padding:18px;border-radius:var(--r)}.afd-post .ap-side .afd-offer .afd-offer-title strong{font-size:1.6rem}.afd-post .ap-side .afd-offer>p{font-size:.88em}
.afd-post .ap-side .afd-lead{margin:10px 0 0;padding:0;background:transparent;border:0;max-width:none;font-size:15px}
.afd-post .afd-drop{border:0;margin-top:12px}.afd-post .afd-drop>summary{display:block;text-align:center;background:var(--o);color:#fff;border-radius:12px;padding:13px 16px;font:700 .95em Montserrat,sans-serif;cursor:pointer}.afd-post .afd-drop>summary::after{display:none}.afd-post .afd-drop[open]>summary{background:var(--ink)}
.afd-post .ap-centres{margin:2.4em 0}.afd-post .ap-centre-grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}.afd-post .ap-centre{border:1px solid var(--ln);border-radius:var(--r);padding:18px;background:#fff}
.afd-post .ap-centre-n{margin:0 0 4px;font:800 1.15em/1.3 Montserrat,sans-serif}.afd-post .ap-centre-a,.afd-post .ap-centre-h{margin:0 0 6px;color:var(--mu);font-size:.92em;line-height:1.5}.afd-post .ap-centre .ap-acts{margin:12px 0}.afd-post .ap-centre .ap-btn{padding:9px 13px;font-size:.84em}
.afd-post .ap-map{display:block;width:100%;height:240px;border:0;border-radius:12px;background:var(--ks)}
.afd-post .ap-prog{position:fixed;top:0;left:0;right:0;height:4px;z-index:60;pointer-events:none}.afd-post .ap-prog i{display:block;height:100%;width:0;background:var(--o)}
.afd-post .ap-bar{display:none}
@media(max-width:1099px){.afd-post .ap-wrap{padding-bottom:92px}.afd-post .ap-bar{display:flex;gap:10px;position:fixed;left:0;right:0;bottom:0;z-index:55;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--ln);box-shadow:0 -6px 18px rgba(20,17,12,.08)}.afd-post .ap-bar .ap-btn{flex:1}}
.afd-post ul,.afd-post ol{padding-left:1.3em;margin:0 0 1.1em}.afd-post li{margin:.4em 0;padding-left:.2em}.afd-post li::marker{color:var(--o);font-weight:700}
.afd-post .ap-co{display:flex;gap:12px;border-radius:12px;padding:14px 18px;margin:1.5em 0;background:#FFF6DE;border:1px solid #F3DDA0}.afd-post .ap-co div{flex:1;min-width:0}.afd-post .ap-co p{margin:0 0 .6em}.afd-post .ap-co p:last-child{margin:0}
.afd-post .ap-co .l{display:block;font-size:.72em;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:2px;color:#9A6500}
.afd-post .ap-co.warning{background:#FDEEE9;border-color:#F4BFB0}.afd-post .ap-co.warning .l{color:#B3361A}.afd-post .ap-co.fact{background:#EEF3FF;border-color:#C9D6FF}.afd-post .ap-co.fact .l{color:#2B5CFF}
.afd-post .ap-tw{overflow-x:auto;border:1px solid var(--ln);border-radius:12px;margin:1.5em 0;-webkit-overflow-scrolling:touch}
.afd-post table{border-collapse:collapse;width:100%;min-width:460px;font-size:.93em;line-height:1.5}.afd-post caption{caption-side:top;text-align:left;font-weight:700;padding:12px 16px 0}
.afd-post th{background:var(--ks);text-align:left;font-weight:700;font-size:.82em;letter-spacing:.02em}.afd-post th,.afd-post td{padding:11px 16px;border-bottom:1px solid var(--ln)}.afd-post tbody tr:last-child td{border-bottom:0}.afd-post tbody tr:nth-child(even){background:#FCFBF5}
.afd-post .afd-offer{margin:2.2em 0}
.afd-post details{border-bottom:1px solid var(--ln)}.afd-post summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:16px 2px;font-weight:700;line-height:1.45}
.afd-post summary::-webkit-details-marker{display:none}.afd-post summary::after{content:"+";flex:none;width:28px;height:28px;border-radius:50%;background:var(--ks);display:grid;place-items:center;font-weight:800;color:var(--o)}
.afd-post details[open]>summary::after{content:"\2212";background:var(--o);color:#fff}.afd-post details p{margin:0 0 16px;padding-right:44px;color:#2c2820}
.afd-post .ap-end{background:var(--o);color:#fff;border-radius:22px;padding:30px 26px;margin:2.8em 0}.afd-post .ap-lh{font:800 1.6em/1.2 Montserrat,sans-serif;margin:0 0 8px;color:#fff}
.afd-post .ap-end p{color:rgba(255,255,255,.92);margin:0 0 18px}.afd-post .ap-end .ap-lh{color:#fff}.afd-post .ap-end .ap-acts{margin:0 0 6px}
.afd-post .ap-author{display:grid;grid-template-columns:96px 1fr;gap:20px;border:1px solid var(--ln);border-radius:20px;padding:24px;margin:2.6em 0;background:#fff}@media(max-width:560px){.afd-post .ap-author{grid-template-columns:1fr}}
.afd-post .ap-author .ap-av{width:96px;height:96px;font-size:1.8em}.afd-post .ap-author .ap-an{font:800 1.2em/1.3 Montserrat,sans-serif;margin:0}.afd-post .ap-author .r{color:var(--o);font-weight:700;font-size:.88em;margin:2px 0 8px}.afd-post .ap-author p{font-size:.95em;line-height:1.65}
.afd-post .ap-next{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:1em 0}.afd-post .ap-next a{display:block;border:1px solid var(--ln);border-radius:14px;padding:16px;text-decoration:none!important;font-weight:700;line-height:1.4;background:#fff}
.afd-post .ap-next a span{display:block;color:var(--o);font-size:.78em;margin-top:8px}.afd-post .ap-next a:hover{border-color:var(--o);transform:translateY(-2px)}.afd-post .ap-nh{font:700 1.2em/1.3 Montserrat,sans-serif;margin:1.8em 0 .4em}
${FORM_CSS}
@media print{.afd-post .ap-map,.afd-post .ap-side,.afd-post .ap-acts,.afd-post .ap-bar,.afd-post .ap-prog{display:none!important}}@media(prefers-reduced-motion:reduce){.afd-post .ap-btn,.afd-post .ap-next a{transition:none}}
@media(min-width:1400px){.afd-post{--fs:18px;--w:1320px;--main:800px;--side:340px;--gap:44px}}
@media(min-width:1800px){.afd-post{--fs:19.5px;--w:1560px;--main:880px;--side:390px;--gap:56px}}
@media(min-width:2300px){.afd-post{--fs:22px;--w:1900px;--main:960px;--side:440px;--gap:72px}}
`;
