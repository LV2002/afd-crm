import { POPUP_SCRIPT } from './popup-script.ts';
import { STICKY_BAR_SCRIPT } from './sticky-bar.ts';
import { TOOLS_SCRIPT } from './tools-script.ts';
// The browser side of the calls to action (ES5, runs in any browser). It reads what the page already carries (data-afd-*) and:
// 1. remembers, in this browser only, which exam a visitor keeps reading about and how often they come back;
// 2. tailors the blocks: the exam on a form with none, and gentler words for someone who has been here before;
// 3. opens the bottom sheet on a phone and shows the corner card on a computer, once, never as a full-screen pop-up;
// 4. stops asking once someone has sent their details;
// 5. tells Google Tag Manager what was seen and clicked, so conversion can be measured per block.
// Nothing here is sent anywhere except through the page's dataLayer; the memory never leaves the visitor's browser.
export const CTA_SCRIPT = `(function () {
  if (/^\\/(publisher|user)(\\/|$)/i.test(location.pathname)) return;
  var doc = document, DAY = 86400000;
  function get(store, key) { try { return JSON.parse(store.getItem(key) || 'null'); } catch (e) { return null; } }
  function put(store, key, value) { try { store.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function track(name, data) { try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, data)); } catch (e) {} }
  var art = doc.getElementById('afd-post'), pageExam = (art && art.getAttribute('data-afd-exam')) || '';
  var blocks = doc.querySelectorAll('[data-afd-cta]');
  if (!blocks.length && !pageExam) return;

  var seen = get(window.localStorage, 'afd_seen') || { visits: 0, exams: {}, lead: 0, hid: 0 };
  if (!seen.exams) seen.exams = {};
  if (!get(window.sessionStorage, 'afd_visit')) { seen.visits += 1; put(window.sessionStorage, 'afd_visit', 1); }
  if (pageExam && !get(window.sessionStorage, 'afd_read_' + location.pathname)) { seen.exams[pageExam] = (seen.exams[pageExam] || 0) + 1; put(window.sessionStorage, 'afd_read_' + location.pathname, 1); }
  put(window.localStorage, 'afd_seen', seen);
  var top = '', k;
  for (k in seen.exams) if (!top || seen.exams[k] > seen.exams[top]) top = k;
  var returning = seen.visits >= 2 && !seen.lead;

  function text(el, sel, value) { var n = el.querySelector(sel); if (n && value) n.textContent = value; }
  function tailor(el) {
    var exam = el.getAttribute('data-exam') || '';
    var fields = el.querySelectorAll('select[name=exam], input[name=exam]');
    if (!exam && top) for (var i = 0; i < fields.length; i++) { if (!fields[i].value || fields[i].tagName === 'SELECT') try { fields[i].value = top; } catch (e) {} }
    if (!returning || el.getAttribute('data-afd-cta') === 'strip') return;
    var swap = function (v) { return (v || '').replace('design entrance', exam || top || 'design entrance'); };
    text(el, '.afd-cta-h', swap(el.getAttribute('data-ret-h')));
    text(el, '.afd-cta-b', swap(el.getAttribute('data-ret-b')));
    text(el, 'button[type=submit]', swap(el.getAttribute('data-ret-btn')));
  }
  for (k = 0; k < blocks.length; k++) tailor(blocks[k]);

  function hide(el) { if (el) el.hidden = true; }
  function stopAsking() { hide(doc.querySelector('[data-afd-cta=sheet]')); hide(doc.querySelector('[data-afd-cta=slide]')); }
  if (seen.lead) stopAsking();
  doc.addEventListener('afd-lead', function () { seen.lead = Date.now(); put(window.localStorage, 'afd_seen', seen); stopAsking(); });

  var sheet = doc.querySelector('[data-afd-cta=sheet]'), opener = doc.querySelectorAll('[data-afd-open=sheet]');
  for (k = 0; k < opener.length; k++) opener[k].addEventListener('click', function () { if (sheet) { sheet.hidden = !sheet.hidden; track('cta_click', { cta: 'sheet', placement: 'bar', exam: pageExam }); } });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') { hide(sheet); } });
  doc.addEventListener('click', function (e) {
    var t = e.target, x = t && t.closest ? t.closest('[data-afd-close]') : null;
    if (x) { var b = x.closest('[data-afd-cta]'); hide(b); if (b && b.getAttribute('data-afd-cta') === 'slide') { seen.hid = Date.now(); put(window.localStorage, 'afd_seen', seen); } return; }
    var c = t && t.closest ? t.closest('[data-afd-cta] a, [data-afd-cta] button[type=submit]') : null;
    if (c) { var blk = c.closest('[data-afd-cta]'); track('cta_click', { cta: blk.getAttribute('data-afd-cta'), placement: blk.getAttribute('data-placement'), exam: blk.getAttribute('data-exam') || pageExam, act: c.getAttribute('data-afd-act') || 'form' }); }
  });

  var slide = doc.querySelector('[data-afd-cta=slide]');
  if (slide && !seen.lead && window.matchMedia && window.matchMedia('(min-width:1100px)').matches && !(seen.hid && Date.now() - seen.hid < Number(slide.getAttribute('data-afd-hide-days') || 7) * DAY) && !get(window.sessionStorage, 'afd_slide')) {
    var shown = false, wait = Number(slide.getAttribute('data-afd-after-seconds') || 40) * 1000, pct = Number(slide.getAttribute('data-afd-after-scroll') || 55);
    var show = function () {
      if (shown || seen.lead) return;
      shown = true; slide.hidden = false; put(window.sessionStorage, 'afd_slide', 1);
      track('cta_view', { cta: 'slide', placement: 'slide', exam: pageExam });
    };
    window.setTimeout(show, wait);
    window.addEventListener('scroll', function () { var h = doc.documentElement; if ((window.scrollY + window.innerHeight) / h.scrollHeight * 100 >= pct) show(); }, { passive: true });
    doc.addEventListener('mouseout', function (e) { if (!e.relatedTarget && e.clientY <= 0 && Date.now() - start > 8000) show(); });
  }
  var start = Date.now();

  if (window.IntersectionObserver) {
    var viewed = {}, watch = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var id = en.target.getAttribute('data-afd-cta');
        if (!en.isIntersecting || viewed[id]) return;
        viewed[id] = true; track('cta_view', { cta: id, placement: en.target.getAttribute('data-placement'), exam: en.target.getAttribute('data-exam') || pageExam });
      });
    }, { threshold: 0.5 });
    for (k = 0; k < blocks.length; k++) if (blocks[k].getAttribute('data-afd-cta') !== 'slide') watch.observe(blocks[k]);
  }
})();`;

// The five scripts run together once the page body exists, so the footer script works wherever it is pasted (even in the header box by mistake),
// and a second copy on the same page stops at once instead of doing everything twice.
export const footerScript = (scripts: string): string => `(function () {
  if (window.__afdFooterV === 2) return;
  window.__afdFooterV = 2;
  window.__afdScript = document.currentScript;
  function go() {
${scripts}
${CTA_SCRIPT}
${TOOLS_SCRIPT}
${STICKY_BAR_SCRIPT}
${POPUP_SCRIPT}
  }
  // Pasted in the footer, the page body is already there and it runs at once; pasted in the header, it waits for the page.
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
})();`;
