// HTML for one slide. Flat, text based, fixed font sizes per element type (never auto scaled).
import { existsSync, readFileSync } from 'node:fs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Highlight the first number in a title with the highlighter treatment.
const highlightNumber = (t) => esc(t).replace(/(\d+)/, '<mark>$1</mark>');

export function fontFaces(tokens, root) {
  const files = tokens.font.fontFiles ?? {};
  return Object.entries(files).filter(([, p]) => existsSync(`${root}/${p}`))
    .map(([name, p]) => `@font-face{font-family:'${name}';src:url('file://${root}/${p}');font-weight:100 900}`).join('\n');
}

function css(t, accent, root) {
  const c = t.colors; const s = t.sizes; const m = t.margin;
  return `${fontFaces(t, root)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${t.size.width}px;height:${t.size.height}px}
body{background:${c.paper};color:${c.ink};font-family:${t.font.body}}
.slide{position:relative;width:${t.size.width}px;height:${t.size.height}px;padding:${m}px;display:flex;flex-direction:column;overflow:hidden}
.slide.dark{background:${c.dark};color:${c.onDark}}
.top{display:flex;justify-content:space-between;align-items:center;font-size:${s.counter}px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.badge{background:${accent};color:#fff;padding:10px 22px;border-radius:999px}
.counter{opacity:.7}
.body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:44px}
h1,h2{font-family:${t.font.display};font-weight:900;line-height:1.04;letter-spacing:-.01em}
h1{font-size:${s.hookTitle}px} h2{font-size:${s.title}px}
mark{background:${c.highlight};color:${c.ink};padding:0 .14em}
.dark mark{color:${c.ink}}
.lines{display:flex;flex-direction:column;gap:30px;font-size:${s.line}px;line-height:1.28;font-weight:600}
.lines .l{display:flex;gap:22px;align-items:flex-start}
.arrow{color:${accent};font-weight:900;flex:none}
.chip{flex:none;min-width:64px;height:64px;border-radius:14px;background:${accent};color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;font-size:${s.small + 4}px;padding:0 10px}
.row{display:flex;gap:26px;align-items:center;padding:22px 26px;background:${c.khaki};border-radius:18px}
.row .k{font-weight:900;flex:none;color:${accent}}
.ref .lines{gap:22px}
.tick{flex:none;width:56px;height:56px;border-radius:50%;background:${accent};color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;font-size:${s.small + 6}px}
.foot{display:flex;justify-content:space-between;align-items:center;font-size:${s.small}px;font-weight:700}
.cue{color:${accent};font-weight:900}
.mascot{position:absolute;right:${m}px;bottom:${m + 40}px;height:360px}
.cta h2{font-size:${s.hookTitle - 8}px}
.chips{display:flex;gap:16px;flex-wrap:wrap}
.chips span{border:3px solid ${c.onDark};border-radius:999px;padding:8px 22px;font-size:${s.small}px;font-weight:800}
.pill{display:inline-block;background:${c.highlight};color:${c.ink};border-radius:999px;padding:14px 30px;font-size:${s.small + 4}px;font-weight:900}
.pills{display:flex;gap:18px;flex-wrap:wrap}
.save{border:3px solid ${c.highlight};color:${c.highlight};border-radius:999px;padding:10px 26px;font-size:${s.small}px;font-weight:900}
`;
}

function splitRef(line) {
  const m = /^([^:]{1,24}):\s*(.+)$/.exec(line);
  return m ? { k: m[1], v: m[2] } : null;
}

function inner(slide, i, total, ctx) {
  const { tokens, meta, mascotUri } = ctx; const n = i + 1; const lines = slide.lines ?? [];
  const accent = ctx.accent;
  const top = `<div class="top"><span class="badge">${esc(meta.exam || 'AFD India')}</span><span class="counter">${n} / ${total}</span></div>`;
  switch (slide.role) {
    case 'hook':
      return `<div class="slide">${top}<div class="body"><h1>${highlightNumber(slide.title)}</h1>
        <div class="lines">${lines.map((l) => `<div class="l"><span>${esc(l)}</span></div>`).join('')}</div></div>
        <div class="foot"><span>AFD India</span><span class="cue">${total} slides &rarr;</span></div>${mascotUri ? `<img class="mascot" src="${mascotUri}">` : ''}</div>`;
    case 'reference': {
      const rows = lines.map((l, k) => { const r = splitRef(l); return r
        ? `<div class="row"><span class="k">${esc(r.k)}</span><span>${esc(r.v)}</span></div>`
        : `<div class="l"><span class="chip">${k + 1}</span><span>${esc(l)}</span></div>`; });
      return `<div class="slide ref">${top}<div class="body"><h2>${esc(slide.title)}</h2><div class="lines">${rows.join('')}</div></div></div>`;
    }
    case 'summary':
      return `<div class="slide">${top}<div class="body"><h2>${esc(slide.title)}</h2>
        <div class="lines">${lines.map((l) => `<div class="l"><span class="tick">&#10003;</span><span>${esc(l)}</span></div>`).join('')}</div></div></div>`;
    case 'cta': {
      const chips = ctx.examChips.map((e) => `<span>${esc(e)}</span>`).join('');
      const phones = tokens.contact.phones.map((p) => `<span class="pill">${esc(p.centre)} ${esc(p.number)}</span>`).join('');
      return `<div class="slide dark cta">${top}<div class="body"><h2>${highlightNumber(slide.title)}</h2>
        <div class="lines">${lines.map((l) => `<div class="l"><span>${esc(l)}</span></div>`).join('')}</div>
        <div class="chips">${chips}</div><div class="lines"><div class="l"><span>Call or WhatsApp</span></div></div><div class="pills">${phones}</div></div>
        <div class="foot"><span>${esc(tokens.contact.site)}</span><span class="save">Save for later</span></div></div>`;
    }
    default:
      return `<div class="slide">${top}<div class="body"><h2>${esc(slide.title)}</h2>
        <div class="lines">${lines.map((l) => `<div class="l"><span class="arrow">&rarr;</span><span>${esc(l)}</span></div>`).join('')}</div></div></div>`;
  }
}

export function slideDocument(slide, i, total, ctx) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(ctx.tokens, ctx.accent, ctx.root)}</style></head><body>${inner(slide, i, total, ctx)}</body></html>`;
}

export function mascotDataUri(tokens, root) {
  const p = `${root}/${tokens.mascot.dir}/${tokens.mascot.coverExpression}.png`;
  return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null;
}
