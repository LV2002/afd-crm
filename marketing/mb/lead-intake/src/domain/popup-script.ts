// The pop-up on the website (ES5). It reads the pop-ups that are ON from the same feed as the live facts, picks the first one that suits the
// page, and shows it after its delay: a small landscape picture, the owner's words and a short form that goes through the same signed route as
// every other form. A pop-up that is off is simply not in the feed. Never on /publisher or /user; never again after the visitor has sent
// their details; after a close it waits the days the owner chose.
export const POPUP_CSS = String.raw`
.afd-pop-ov{--p:var(--b-primary,#C8102E);--k:var(--b-ink,#111111);--w:var(--b-surface,#FFFFFF);position:fixed;inset:0;z-index:2147483002;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);font:500 16px/1.45 Montserrat,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:afd-fade .2s ease-out}
.afd-pop-ov[hidden]{display:none!important}
.afd-pop-ov *{box-sizing:border-box}
.afd-pop{position:relative;width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;background:var(--w);color:var(--k);border:3px solid var(--k);border-radius:10px;box-shadow:8px 8px 0 var(--p)}
.afd-pop-img{display:block;width:100%;height:150px;object-fit:cover;border-bottom:3px solid var(--k);background:#eee}
.afd-pop-in{padding:20px 20px 22px}
.afd-pop-h{margin:0 28px 8px 0;font:900 clamp(1.5rem,6vw,2rem)/1.05 Montserrat,system-ui,sans-serif;letter-spacing:-.02em;text-transform:uppercase}
.afd-pop-t{margin:0 0 14px;font-size:1rem;font-weight:600}
.afd-pop-x{position:absolute;top:8px;right:8px;width:38px;height:38px;border:2px solid var(--k);border-radius:50%;background:var(--w);color:var(--k);font:700 22px/1 system-ui;cursor:pointer;z-index:1}
.afd-pop form{display:grid;gap:10px;margin:0}
.afd-pop label{display:grid;gap:3px;font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
.afd-pop input,.afd-pop select,.afd-pop textarea{width:100%;padding:0 12px;border:2px solid var(--k);border-radius:6px;font:600 1rem Montserrat,system-ui,sans-serif;background:#fff;color:#111;text-transform:none;letter-spacing:0}
.afd-pop input,.afd-pop select{height:46px}.afd-pop textarea{padding:10px 12px;min-height:76px;resize:vertical}
.afd-pop button[type=submit]{height:56px;border:3px solid var(--k);border-radius:8px;background:var(--p);color:#fff;font:900 1.15rem Montserrat,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.03em;cursor:pointer;box-shadow:4px 4px 0 var(--k)}
.afd-pop button[disabled]{opacity:.6;cursor:wait}
.afd-pop [data-afd-error]{margin:10px 0 0;padding:10px 12px;border-radius:6px;background:#fdeeee;color:#9b1c1c;font-weight:600;font-size:.9rem}
.afd-pop [data-afd-thanks]{margin:0;padding:6px 0;font-weight:700}
.afd-pop [hidden]{display:none!important}
.afd-pop-lock{overflow:hidden}
@keyframes afd-fade{from{opacity:0}to{opacity:1}}
@media(prefers-reduced-motion:reduce){.afd-pop-ov{animation:none}}
`;

export const POPUP_SCRIPT = `(function () {
  if (/^\\/(publisher|user)(\\/|$)/i.test(location.pathname)) return;
  var doc = document, lead = window.AFD_LEAD;
  if (!lead || !lead.feed || !lead.endpoint()) return;
  var ep = lead.endpoint(), theme = (doc.currentScript || window.__afdScript) && (doc.currentScript || window.__afdScript).getAttribute('data-afd-theme');
  function el(tag, cls, txt) { var n = doc.createElement(tag); if (cls) n.className = cls; if (txt) n.textContent = txt; return n; }
  function get(store, key) { try { return JSON.parse(store.getItem(key) || 'null'); } catch (e) { return null; } }
  function put(store, key, value) { try { store.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function track(name, data) { try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, data)); } catch (e) {} }
  function norm(p) { return String(p).replace(/\\/+$/, '') || '/'; }
  function suits(p) {
    var path = norm(location.pathname), mode = p.pages && p.pages.mode, list = (p.pages && p.pages.paths) || [], hit = false, i;
    for (i = 0; i < list.length; i++) { var e = norm(list[i]); if (path === e || path.indexOf(e === '/' ? '/' : e + '/') === 0) hit = true; }
    return mode === 'only' ? hit : mode === 'except' ? !hit : true;
  }
  function quiet(p) {
    var seen = get(window.localStorage, 'afd_seen'); if (seen && seen.lead) return true;
    var s = get(window.localStorage, 'afd_pop_' + p.id);
    if (s && s.done) return true;
    if (s && s.v === p.v && s.closedAt) return p.repeatDays === 0 ? !!get(window.sessionStorage, 'afd_pop_' + p.id) : Date.now() - s.closedAt < p.repeatDays * 86400000;
    return false;
  }
  function show(p) {
    if (!doc.querySelector('style[data-afd-pop]')) { var st = doc.createElement('style'); st.setAttribute('data-afd-pop', 'v1'); st.textContent = ${JSON.stringify(POPUP_CSS)}; doc.head.appendChild(st); }
    var ov = el('div', 'afd-pop-ov'), box = el('div', 'afd-pop'), inner = el('div', 'afd-pop-in'), opener = doc.activeElement;
    ov.setAttribute('data-afd-popup', p.id); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', p.title);
    if (theme) ov.style.cssText = theme;
    var x = el('button', 'afd-pop-x', '\\u00d7'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
    function close() { put(window.localStorage, 'afd_pop_' + p.id, { v: p.v, closedAt: Date.now(), done: (get(window.localStorage, 'afd_pop_' + p.id) || {}).done }); put(window.sessionStorage, 'afd_pop_' + p.id, 1); ov.hidden = true; doc.documentElement.classList.remove('afd-pop-lock'); doc.removeEventListener('keydown', onKey); if (opener && opener.focus) { try { opener.focus(); } catch (e) {} } }
    function onKey(e) { if (e.key === 'Escape') close(); }
    x.addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    box.appendChild(x);
    if (p.imageUrl) { var img = el('img', 'afd-pop-img'); img.alt = ''; img.src = p.imageUrl; box.appendChild(img); }
    inner.appendChild(el('p', 'afd-pop-h', p.title));
    if (p.body) inner.appendChild(el('p', 'afd-pop-t', p.body));
    var form = el('form'), f, i;
    function field(label, ctl, required) { var w = el('label'); w.appendChild(el('span', '', label + (required ? '' : ' (optional)'))); w.appendChild(ctl); form.appendChild(w); }
    f = el('input'); f.type = 'text'; f.name = 'name'; f.required = true; f.autocomplete = 'name'; field('Your name', f, true);
    f = el('input'); f.type = 'tel'; f.name = 'phone'; f.required = true; f.autocomplete = 'tel'; f.inputMode = 'numeric'; field('Your phone number', f, true);
    for (i = 0; i < p.fields.length; i++) {
      var d = p.fields[i], c;
      if (d.options) { c = el('select'); var o0 = el('option', '', 'Choose'); o0.value = ''; c.appendChild(o0); for (var k = 0; k < d.options.length; k++) { var o = el('option', '', d.options[k]); o.value = d.options[k]; c.appendChild(o); } }
      else if (d.key === 'message') c = el('textarea');
      else { c = el('input'); c.type = d.key === 'email' ? 'email' : 'text'; if (d.key === 'email') c.autocomplete = 'email'; }
      c.name = d.key === 'studying' ? 'studying_in' : d.key; c.required = d.required === true; field(d.label, c, d.required === true);
    }
    var go = el('button', '', p.button); go.type = 'submit'; form.appendChild(go);
    var err = el('p'); err.hidden = true; err.setAttribute('data-afd-error', ''); var thanks = el('p', '', p.thanks); thanks.hidden = true; thanks.setAttribute('data-afd-thanks', '');
    inner.appendChild(form); inner.appendChild(err); inner.appendChild(thanks); box.appendChild(inner); ov.appendChild(box);
    form.setAttribute('data-endpoint', ep); form.setAttribute('data-crm-form', 'popup-' + p.id);
    lead.hidden(form, 'form', 'popup-' + p.id); lead.hidden(form, 'action', 'popup'); lead.hidden(form, 'offer', 'popup-' + p.id); lead.hidden(form, 'page', location.pathname); lead.hidden(form, 'page_url', location.href);
    lead.wire(form);
    doc.addEventListener('afd-lead', function () { put(window.localStorage, 'afd_pop_' + p.id, { v: p.v, closedAt: Date.now(), done: true }); });
    doc.body.appendChild(ov); doc.documentElement.classList.add('afd-pop-lock'); doc.addEventListener('keydown', onKey);
    var first = form.querySelector('input'); if (first && first.focus) { try { first.focus(); } catch (e) {} }
    track('cta_view', { cta: 'popup', placement: 'popup-' + p.id });
  }
  lead.feed(function (feed) {
    var list = (feed && feed.popups) || [], pick = null, i;
    for (i = 0; i < list.length && !pick; i++) if (suits(list[i]) && !quiet(list[i])) pick = list[i];
    if (!pick) return;
    window.setTimeout(function () { if (!doc.querySelector('.afd-pop-ov')) show(pick); }, Math.max(0, (pick.delaySeconds || 0) * 1000));
  });
})();`;
