// The bar pinned to the bottom of every page: Call us, WhatsApp us, Enquiry now. It builds itself from the footer script, so it needs no
// block pasted into any page and a change to it is one paste of the footer. The numbers, exam list and colours arrive as attributes on the
// script tag; the enquiry goes through the same signed route as every other form (window.AFD_LEAD, set by the form script).
// ES5 on purpose. Never on /publisher or /user (CLAUDE.md product rule).
export const STICKY_CSS = String.raw`
.afd-sbar,.afd-sb-sheet{--p:var(--b-primary,#C8102E);--k:var(--b-ink,#111111);--w:var(--b-surface,#FFFFFF)}
.afd-sbar{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;gap:8px;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:var(--k);box-shadow:0 -6px 24px rgba(0,0,0,.28);font:700 15px/1.2 Montserrat,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.afd-sbar *{box-sizing:border-box}
.afd-sb-i{position:relative;flex:1 1 0;min-width:0}
.afd-sb-b{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:50px;padding:0 10px;border:2px solid var(--w);border-radius:8px;background:var(--k);color:var(--w)!important;font:inherit;text-transform:uppercase;letter-spacing:.03em;text-decoration:none;cursor:pointer}
.afd-sb-b.wa{background:#25D366;border-color:#25D366;color:#0b1a0f!important}
.afd-sb-b.go{background:var(--p);border-color:var(--p);color:#fff!important}
.afd-sb-b:focus-visible{outline:3px solid #F9A825;outline-offset:2px}
.afd-sb-m{position:absolute;left:0;right:0;bottom:calc(100% + 8px);display:grid;gap:6px;padding:8px;border-radius:8px;background:var(--w);box-shadow:0 8px 28px rgba(0,0,0,.35)}
.afd-sb-m a{display:block;padding:12px;border-radius:6px;background:var(--k);color:var(--w)!important;text-align:center;text-decoration:none;font-weight:700}
.afd-sb-m[hidden],.afd-sb-sheet[hidden]{display:none!important}
.afd-sb-sheet{position:fixed;left:0;right:0;bottom:0;z-index:2147483001;max-height:90vh;overflow:auto;padding:22px 18px calc(22px + env(safe-area-inset-bottom));background:var(--w,#fff);color:var(--k,#111);border-top:6px solid var(--p);box-shadow:0 -12px 40px rgba(0,0,0,.35);font:500 16px/1.45 Montserrat,system-ui,sans-serif}
@media(min-width:720px){.afd-sb-sheet{left:auto;right:20px;bottom:76px;width:380px;max-height:calc(100vh - 100px);border-radius:10px;border:3px solid var(--k);box-shadow:8px 8px 0 var(--p)}}
.afd-sb-sheet *{box-sizing:border-box}
.afd-sb-h{margin:0 34px 12px 0;font:800 1.5em/1.1 Montserrat,system-ui,sans-serif;text-transform:uppercase}
.afd-sb-x{position:absolute;top:10px;right:12px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(0,0,0,.08);color:inherit;font:400 24px/1 system-ui;cursor:pointer}
.afd-sb-sheet form{display:grid;gap:12px;margin:0}
.afd-sb-sheet label{display:grid;gap:4px;font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.afd-sb-sheet input,.afd-sb-sheet select{width:100%;height:48px;padding:0 12px;border:2px solid var(--k);border-radius:6px;font:500 1rem Montserrat,system-ui,sans-serif;background:#fff;color:#111}
.afd-sb-sheet button[type=submit]{height:56px;border:0;border-radius:6px;background:var(--p);color:#fff;font:800 1.1em Montserrat,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em;cursor:pointer}
.afd-sb-sheet button[disabled]{opacity:.6;cursor:wait}
.afd-sb-sheet [data-afd-error]{margin:10px 0 0;padding:10px 12px;border-radius:6px;background:#fdeeee;color:#9b1c1c;font-weight:600;font-size:.9em}
.afd-sb-sheet [data-afd-thanks]{margin:0;padding:6px 0;font-weight:700}
.afd-sb-sheet [hidden]{display:none!important}
.afd-has-sticky .afd-bar,.afd-has-sticky .afd-slide{display:none!important}
`;

export const STICKY_BAR_SCRIPT = `(function () {
  if (/^\\/(publisher|user)(\\/|$)/i.test(location.pathname)) return;
  var doc = document, s = doc.currentScript || window.__afdScript, cfg;
  try { cfg = JSON.parse((s && s.getAttribute('data-afd-bar')) || 'null'); } catch (e) { return; }
  if (!cfg || !cfg.centres || !cfg.centres.length) return;
  // A bar left by an older copy of this script is replaced, so pasting the new script over (or beside) the old one gives one bar with the new look.
  var old = doc.querySelector('.afd-sbar');
  if (old && old.getAttribute('data-v') === '2') return;
  var gone = doc.querySelectorAll('.afd-sbar,.afd-sb-sheet,style[data-afd-sbar]'), g;
  for (g = 0; g < gone.length; g++) gone[g].parentNode.removeChild(gone[g]);
  var lead = window.AFD_LEAD, ep = lead ? lead.endpoint() : '';
  function track(name, data) { try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, data)); } catch (e) {} }
  function el(tag, cls, txt) { var n = doc.createElement(tag); if (cls) n.className = cls; if (txt) n.textContent = txt; return n; }
  function digits(v) { return String(v).replace(/\\D/g, ''); }
  var st = doc.createElement('style'); st.setAttribute('data-afd-sbar', 'v1'); st.textContent = ${JSON.stringify(STICKY_CSS)}; doc.head.appendChild(st);
  var bar = el('div', 'afd-sbar'); bar.setAttribute('data-v', '2'); bar.setAttribute('role', 'navigation'); bar.setAttribute('aria-label', 'Contact us');
  var theme = s.getAttribute('data-afd-theme'); if (theme) bar.style.cssText = theme;
  var menus = [];
  function closeMenus() { for (var m = 0; m < menus.length; m++) { menus[m].menu.hidden = true; menus[m].btn.setAttribute('aria-expanded', 'false'); } }
  function item(label, cls, key, hrefOf) {
    var wrap = el('div', 'afd-sb-i'), c = cfg.centres;
    if (c.length === 1) {
      var a = el('a', 'afd-sb-b ' + cls, label); a.href = hrefOf(c[0]);
      a.addEventListener('click', function () { track('cta_click', { cta: key, placement: 'sticky-bar' }); });
      wrap.appendChild(a); return wrap;
    }
    var btn = el('button', 'afd-sb-b ' + cls, label), menu = el('div', 'afd-sb-m'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false'); menu.hidden = true;
    for (var i = 0; i < c.length; i++) {
      var l = el('a', '', c[i].name + ' ' + (key === 'sticky-call' ? c[i].phone : '')); l.href = hrefOf(c[i]);
      (function (centre) { l.addEventListener('click', function () { track('cta_click', { cta: key, placement: 'sticky-bar', centre: centre.name }); }); })(c[i]);
      menu.appendChild(l);
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); var open = menu.hidden; closeMenus(); hideSheet(); menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
    menus.push({ menu: menu, btn: btn }); wrap.appendChild(btn); wrap.appendChild(menu); return wrap;
  }
  bar.appendChild(item('Call us', '', 'sticky-call', function (c) { return 'tel:+91' + digits(c.phone).slice(-10); }));
  bar.appendChild(item('WhatsApp', 'wa', 'sticky-whatsapp', function (c) { return 'https://wa.me/' + digits(c.whatsapp); }));

  var sheet = null;
  function hideSheet() { if (sheet) sheet.hidden = true; }
  if (ep && lead) {
    sheet = el('div', 'afd-sb-sheet'); sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Enquiry');
    if (theme) sheet.style.cssText = theme;
    var close = el('button', 'afd-sb-x', '\\u00d7'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.addEventListener('click', hideSheet);
    var inner = el('div'), form = el('form'), f;
    function field(label, ctl) { var w = el('label'); w.appendChild(el('span', '', label)); w.appendChild(ctl); form.appendChild(w); }
    f = el('input'); f.type = 'text'; f.name = 'name'; f.required = true; f.autocomplete = 'name'; field('Your name', f);
    f = el('input'); f.type = 'tel'; f.name = 'phone'; f.required = true; f.autocomplete = 'tel'; f.inputMode = 'numeric'; field('Your phone number', f);
    if (cfg.exams && cfg.exams.length) {
      f = el('select'); f.name = 'exam'; var o0 = el('option', '', 'Choose your exam'); o0.value = ''; f.appendChild(o0);
      for (var x = 0; x < cfg.exams.length; x++) { var o = el('option', '', cfg.exams[x]); o.value = cfg.exams[x]; f.appendChild(o); }
      field('Exam you are preparing for', f);
    }
    var go = el('button', '', 'Send my enquiry'); go.type = 'submit'; form.appendChild(go);
    var err = el('p'); err.hidden = true; err.setAttribute('data-afd-error', ''); var thanks = el('p', '', 'Thank you. We will call you soon.'); thanks.hidden = true; thanks.setAttribute('data-afd-thanks', '');
    inner.appendChild(el('p', 'afd-sb-h', 'Enquire now')); inner.appendChild(form); inner.appendChild(err); inner.appendChild(thanks);
    sheet.appendChild(close); sheet.appendChild(inner);
    form.setAttribute('data-endpoint', ep); form.setAttribute('data-crm-form', 'sticky-bar');
    lead.hidden(form, 'form', 'sticky-bar'); lead.hidden(form, 'action', 'sticky-bar'); lead.hidden(form, 'page', location.pathname); lead.hidden(form, 'page_url', location.href);
    lead.wire(form);
    var enq = el('div', 'afd-sb-i'), eb = el('button', 'afd-sb-b go', 'Enquiry now'); eb.type = 'button';
    eb.addEventListener('click', function (e) { e.stopPropagation(); closeMenus(); sheet.hidden = !sheet.hidden; track('cta_click', { cta: 'sticky-enquiry', placement: 'sticky-bar' }); });
    enq.appendChild(eb); bar.appendChild(enq);
    doc.body.appendChild(sheet);
  }
  doc.addEventListener('click', closeMenus);
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMenus(); hideSheet(); } });
  doc.body.appendChild(bar);
  doc.documentElement.className += ' afd-has-sticky';
  doc.body.style.paddingBottom = (bar.offsetHeight || 66) + 'px';
})();`;
