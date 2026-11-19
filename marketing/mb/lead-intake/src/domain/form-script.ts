// The one script pasted into every page that has a form (Knorish footer code). ES5 on purpose: it runs in any browser.
// 1. Never runs under /publisher or /user (CLAUDE.md product rule).
// 2. Adds the hidden fields the CRM wants (form, page, page_url) to EVERY form on the page, never overwriting a
//    field the form already has. This covers the owner's existing forms that post elsewhere.
// 3. Puts the form design (FORM_CSS) and the site font on the page once, so every form looks like afdindia wherever it sits.
// 4. Refreshes every <span data-afd-fact="id"> from the facts feed, so a date changed in Marketing Brain changes on every page.
// 5. On an article page: fills the reading-progress bar and highlights the section being read in the contents list.
// 6. Takes over only forms marked data-afd-lead: checks the phone, posts to the Apps Script, shows thanks.
import { footerScript } from './cta-script.ts';
import { BrandThemeSchema, themeVariables, type BrandTheme } from './brand.ts';
import { FORM_CSS, SITE_FONTS_URL } from './form-css.ts';

export const FORM_SCRIPT = `(function () {
  if (/^\\/(publisher|user)(\\/|$)/i.test(location.pathname)) return;
  var doc = document, TRACK = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'], attr = {};
  try {
    var q = new URLSearchParams(location.search);
    TRACK.forEach(function (k) { if (q.get(k)) attr[k] = q.get(k); });
    if (Object.keys(attr).length) sessionStorage.setItem('afd_attr', JSON.stringify(attr));
    else attr = JSON.parse(sessionStorage.getItem('afd_attr') || '{}');
  } catch (e) {}
  function addStyle() {
    if (doc.querySelector('style[data-afd-form]') || !doc.querySelector('.afd-lead,.afd-strip,.afd-cta')) return;
    var style = doc.createElement('style');
    style.setAttribute('data-afd-form', 'v1'); style.textContent = ${JSON.stringify(FORM_CSS)};
    doc.head.appendChild(style);
    var tag = doc.currentScript || window.__afdScript, theme = tag && tag.getAttribute('data-afd-theme');
    if (theme) {
      var over = doc.createElement('style');
      over.setAttribute('data-afd-theme-style', '1'); over.textContent = '.afd-lead,.afd-strip,.afd-cta,.afd-offer{' + theme + '}';
      doc.head.appendChild(over);
    }
    if (!doc.querySelector('link[href*="family=Montserrat"]')) {
      var link = doc.createElement('link');
      link.rel = 'stylesheet'; link.href = ${JSON.stringify(SITE_FONTS_URL)};
      doc.head.appendChild(link);
    }
  }
  function endpointOf() {
    var s = doc.currentScript || window.__afdScript, own = s && s.getAttribute('data-afd-endpoint'), f = doc.querySelector('form[data-endpoint]');
    return own || (f && f.getAttribute('data-endpoint')) || window.AFD_ENDPOINT || '';
  }
  function fillFacts(feed) {
    var spans = doc.querySelectorAll('[data-afd-fact]');
    for (var j = 0; j < spans.length; j++) {
      var item = feed && feed.facts && feed.facts[spans[j].getAttribute('data-afd-fact')];
      if (item && typeof item.value === 'string') spans[j].textContent = item.value;
    }
    var counts = doc.querySelectorAll('[data-afd-count]');
    for (var c = 0; c < counts.length; c++) {
      var due = feed && feed.facts && feed.facts[counts[c].getAttribute('data-afd-count')];
      if (!due || !due.date) continue;
      var days = Math.round((Date.parse(due.date + 'T00:00:00Z') - Date.parse(new Date(Date.now() + 19800000).toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000);
      var chip = counts[c].closest ? counts[c].closest('.afd-chip') : null;
      if (days < 0) { if (chip) chip.hidden = true; } else if (days === 0) counts[c].textContent = 'today'; else if (days <= 45) counts[c].textContent = 'in ' + days + (days === 1 ? ' day' : ' days');
    }
  }
  // The website's feed (facts and pop-ups), fetched once per five minutes per browser tab and shared by everything that needs it.
  var feedWaiting = [], feedFetching = false;
  function getFeed(cb) {
    var ep = endpointOf();
    if (!ep) { cb(null); return; }
    try {
      var saved = JSON.parse(sessionStorage.getItem('afd_facts') || 'null');
      if (saved && Date.now() - saved.at < 300000) { cb(saved.feed); return; }
    } catch (e) {}
    feedWaiting.push(cb);
    if (feedFetching) return;
    feedFetching = true;
    function finish(feed) { feedFetching = false; var q = feedWaiting; feedWaiting = []; for (var n = 0; n < q.length; n++) q[n](feed); }
    fetch(ep + (ep.indexOf('?') < 0 ? '?' : '&') + 'facts=1', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (feed) {
        if (!feed || feed.ok !== true) { finish(null); return; }
        try { sessionStorage.setItem('afd_facts', JSON.stringify({ at: Date.now(), feed: feed })); } catch (e) {}
        finish(feed);
      })
      .catch(function () { finish(null); });
  }
  function liveFacts() {
    if (!doc.querySelector('[data-afd-fact],[data-afd-count]')) return;
    getFeed(function (feed) { if (feed) fillFacts(feed); });
  }
  function readingAids() {
    var art = doc.getElementById('afd-post');
    if (!art) return;
    var bar = art.querySelector('.ap-prog i'), links = art.querySelectorAll('.ap-side .ap-toc a'), secs = [], k;
    if (bar) {
      var move = function () {
        var r = art.getBoundingClientRect(), total = r.height - window.innerHeight;
        bar.style.width = (total > 0 ? Math.min(100, Math.max(0, (-r.top / total) * 100)) : 0) + '%';
      };
      window.addEventListener('scroll', move, { passive: true }); move();
    }
    for (k = 0; k < links.length; k++) { var sec = doc.getElementById((links[k].getAttribute('href') || '').slice(1)); if (sec) secs.push({ el: sec, link: links[k] }); }
    if (!secs.length || !window.IntersectionObserver) return;
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        for (var m = 0; m < secs.length; m++) secs[m].link.classList.toggle('on', secs[m].el === en.target);
      });
    }, { rootMargin: '0px 0px -70% 0px' });
    secs.forEach(function (x) { seen.observe(x.el); });
  }
  function track(name, data) {
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, data)); } catch (e) {}
  }
  function addHidden(form, name, value) {
    if (!value || form.querySelector('[name="' + name + '"]')) return;
    var input = doc.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = value;
    form.appendChild(input);
  }
  function uuid() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  // A phone number is exactly ten digits. Typing and pasting are cleaned as they happen: anything but digits goes, and a leading +91, 91 or 0 is dropped.
  function tenDigits(v) {
    var d = String(v || '').replace(/\\D/g, '');
    if (d.length > 10 && d.slice(0, 2) === '91') d = d.slice(2); else if (d.length > 10 && d.charAt(0) === '0') d = d.slice(1);
    return d.slice(0, 10);
  }
  function limitPhone(input) {
    if (!input) return;
    input.maxLength = 10; input.inputMode = 'numeric'; input.setAttribute('pattern', '[0-9]{10}'); input.setAttribute('title', 'A 10 digit mobile number');
    input.addEventListener('input', function () { var c = tenDigits(input.value); if (c !== input.value) input.value = c; });
  }
  function wire(f, onDone) {
    var box = f.parentNode, err = box.querySelector('[data-afd-error]'), thanks = box.querySelector('[data-afd-thanks]'), btn = f.querySelector('button[type=submit]'), started = false;
    function fail(msg) { btn.disabled = false; err.textContent = msg; err.hidden = false; track('form_error', { form: f.getAttribute('data-crm-form') }); }
    function done(res) {
      track('generate_lead', { form: f.getAttribute('data-crm-form'), exam: f.elements.exam ? f.elements.exam.value : '', placement: f.elements.placement ? f.elements.placement.value : '' });
      try { doc.dispatchEvent(new window.CustomEvent('afd-lead')); } catch (e) {}
      if (onDone) { onDone(); return; }
      f.hidden = true; thanks.hidden = false;
      // A free resource comes back as a private link: shown as a big button, and opened in a new tab (a blocked pop-up leaves the button).
      if (f.hasAttribute('data-afd-open-label') && !(res && res.download)) {
        var miss = doc.createElement('p'); miss.textContent = 'Your download could not open here. Please WhatsApp us and we will send it to you.'; thanks.insertBefore(miss, thanks.firstChild);
      }
      if (res && res.download) {
        var open = doc.createElement('a'); open.className = 'afd-open'; open.href = res.download; open.target = '_blank'; open.rel = 'noopener'; open.textContent = f.getAttribute('data-afd-open-label') || 'Open my download';
        thanks.insertBefore(open, thanks.firstChild);
        try { window.open(res.download, '_blank', 'noopener'); } catch (e) {}
      }
    }
    limitPhone(f.elements.phone);
    f.addEventListener('focusin', function () { if (!started) { started = true; track('form_start', { form: f.getAttribute('data-crm-form') }); } });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      var digits = tenDigits(f.elements.phone.value);
      if (digits.length !== 10) { fail('Please enter a 10 digit mobile number.'); f.elements.phone.focus(); return; }
      if (f.elements.company_website && f.elements.company_website.value) { done(); return; }
      f.elements.phone.value = digits;
      var body = new URLSearchParams(new FormData(f));
      body.delete('company_website'); body.set('submission_id', uuid());
      Object.keys(attr).forEach(function (k) { if (!body.get(k)) body.set(k, attr[k]); });
      var url = f.getAttribute('data-endpoint');
      btn.disabled = true;
      fetch(url, { method: 'POST', body: body })
        .then(function (r) { if (!r.ok) { fail('We could not send that. Please call or WhatsApp us.'); return; } var read; try { read = r.json(); } catch (x) { read = null; } if (read && read.then) read.then(done, function () { done(); }); else done(); })
        .catch(function () { fetch(url, { method: 'POST', body: body, mode: 'no-cors' }).then(done).catch(function () { fail('We could not send that. Please call or WhatsApp us.'); }); });
    });
  }
  // The free tools build their form after this runs, so they take over its sending through this one door.
  window.AFD_LEAD = { wire: wire, endpoint: endpointOf, hidden: addHidden, feed: getFeed };
  // Every tap on a phone or WhatsApp link, ours or one already on the page, becomes call_click or whatsapp_click in the dataLayer,
  // so Google Tag Manager can send it to Google Analytics with one trigger each.
  doc.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '', kind = /^tel:/i.test(href) ? 'call_click' : /^https?:\\/\\/(wa\\.me|api\\.whatsapp\\.com|web\\.whatsapp\\.com)\\//i.test(href) ? 'whatsapp_click' : '';
    if (!kind) return;
    var blk = a.closest('[data-placement]');
    track(kind, { link_url: href.slice(0, 200), placement: a.closest('.afd-sbar') ? 'sticky-bar' : blk ? blk.getAttribute('data-placement') : 'page', page_path: location.pathname });
  }, true);
  addStyle();
  liveFacts();
  readingAids();
  var forms = doc.querySelectorAll('form');
  for (var i = 0; i < forms.length; i++) {
    var f = forms[i];
    addHidden(f, 'form', f.getAttribute('data-crm-form') || f.getAttribute('id') || f.getAttribute('name') || 'form-' + (i + 1));
    addHidden(f, 'page', location.pathname);
    addHidden(f, 'page_url', location.href);
    if (f.hasAttribute('data-afd-lead')) wire(f);
  }
})();`;

// The address goes in as an attribute, so the script can find the facts feed even on a page that has no form.
const attrEscape = (v: string): string => v.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

// The endpoint and the brand colours go in as attributes, so the script can find the facts feed even on a page with no
// form, and a theme change is one paste of the footer, never an edit of every block.
export interface StickyContact { readonly centres: readonly { readonly name: string; readonly phone: string; readonly whatsapp: string }[]; readonly exams: readonly string[] }

// The numbers and exams the bar needs, taken from the lead form settings so they are configured in one place.
export const stickyContact = (forms: { readonly centres: StickyContact['centres']; readonly exams: readonly string[] }): StickyContact => ({ centres: forms.centres, exams: forms.exams });

export const formScriptTag = (endpoint = '', theme?: BrandTheme, contact?: StickyContact): string => {
  const endpointAttr = endpoint === '' ? '' : ` data-afd-endpoint="${attrEscape(endpoint)}"`;
  const themeAttr = theme === undefined ? '' : ` data-afd-theme="${attrEscape(themeVariables(BrandThemeSchema.parse(theme)))}"`;
  const barAttr = contact === undefined ? '' : ` data-afd-bar="${attrEscape(JSON.stringify({ centres: contact.centres.map((c) => ({ name: c.name, phone: c.phone, whatsapp: c.whatsapp })), exams: contact.exams }))}"`;
  return `<script${endpointAttr}${themeAttr}${barAttr}>${footerScript(FORM_SCRIPT)}</script>`;
};
