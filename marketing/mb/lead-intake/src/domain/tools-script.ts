import { TOOL_CSS } from './tools-css.ts';

// The browser side of the free tools (ES5). It finds each [data-afd-tool], reads its rule, builds the form and shows an answer. With a lead address (the footer script knows it) it asks for name and phone first and sends them through
// the same signed route as every other form before it shows the answer; without one it just answers, sending nothing but a count to the dataLayer.
export const TOOLS_SCRIPT = `(function () {
  var doc = document, boxes = doc.querySelectorAll('[data-afd-tool]');
  if (!boxes.length || /^\\/(publisher|user)(\\/|$)/i.test(location.pathname)) return;
  if (!doc.querySelector('style[data-afd-tools]')) { var st = doc.createElement('style'); st.setAttribute('data-afd-tools', 'v1'); st.textContent = ${JSON.stringify(TOOL_CSS)}; doc.head.appendChild(st); }
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function track(spec, verdict) { try { (window.dataLayer = window.dataLayer || []).push({ event: 'afd_tool_used', tool: spec.id, exam: spec.exam, verdict: verdict }); } catch (e) {} }
  function el(tag, cls, txt) { var n = doc.createElement(tag); if (cls) n.className = cls; if (txt) n.textContent = txt; return n; }
  function fmt(d) { return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function iso(s) { var p = String(s).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function field(label, control) { var w = el('label', 'afd-tool-f'); w.appendChild(el('span', '', label)); w.appendChild(control); return w; }
  function select(name, options) { var s = el('select'); s.name = name; var i; for (i = 0; i < options.length; i++) { var o = el('option', '', options[i].label); o.value = options[i].value; s.appendChild(o); } return s; }
  function show(out, verdict, message) { out.className = 'afd-tool-out afd-tool-' + verdict; out.textContent = message; out.hidden = false; }

  function answer(spec, inputs) {
    var k;
    if (spec.kind === 'choice') {
      var answers = {}; for (k in inputs) answers[k] = inputs[k].value;
      for (k in answers) if (!answers[k]) return { verdict: 'check', message: 'Please answer every question.', invalid: true };
      for (var j = 0; j < spec.outcomes.length; j++) {
        var o = spec.outcomes[j], ok = true, w; for (w in o.when) if (answers[w] !== o.when[w]) ok = false;
        if (ok) return { verdict: o.verdict, message: o.text };
      }
      return { verdict: 'check', message: 'Please check the official notice for your case.' };
    }
    if (!inputs.dob.value) return { verdict: 'check', message: 'Please enter your date of birth.', invalid: true };
    var dob = iso(inputs.dob.value), cat = spec.categories[+inputs.cat.value], ok2, msg;
    if (spec.kind === 'dob-cutoff') { var cutoff = iso(cat.bornOnOrAfter); ok2 = dob >= cutoff; msg = 'Born on ' + fmt(dob) + '. For ' + cat.label + ' the rule is born on or after ' + fmt(cutoff) + '. ' + (ok2 ? 'You meet this age rule.' : 'You do not meet this age rule.'); }
    else {
      var asOn = iso(spec.asOn), limit = new Date(Date.UTC(asOn.getUTCFullYear() - (spec.youngerThanYears + cat.extraYears), asOn.getUTCMonth(), asOn.getUTCDate()));
      ok2 = dob > limit;
      var y = asOn.getUTCFullYear() - dob.getUTCFullYear(), m = asOn.getUTCMonth() - dob.getUTCMonth(); if (asOn.getUTCDate() < dob.getUTCDate()) m -= 1; if (m < 0) { y -= 1; m += 12; }
      msg = 'On ' + fmt(asOn) + ' you will be ' + y + ' years and ' + m + ' months. For ' + cat.label + ' you must be under ' + (spec.youngerThanYears + cat.extraYears) + '. ' + (ok2 ? 'You meet this age rule.' : 'You do not meet this age rule.');
    }
    return { verdict: ok2 ? 'yes' : 'no', message: msg };
  }

  function build(box) {
    var spec; try { spec = JSON.parse(box.getAttribute('data-afd-tool')); } catch (e) { return; }
    var body = box.querySelector('.afd-tool-body'); if (!body || body.children.length) return;
    var lead = window.AFD_LEAD, ep = lead ? lead.endpoint() : '';
    var form = el('form', 'afd-tool-form'), out = el('p', 'afd-tool-out'); out.hidden = true; out.setAttribute('role', 'status'); out.setAttribute('aria-live', 'polite');
    var inputs = {}, i, pending = null;
    if (ep) {
      var nm = el('input'); nm.type = 'text'; nm.name = 'name'; nm.required = true; nm.autocomplete = 'name'; form.appendChild(field('Your name', nm));
      var ph = el('input'); ph.type = 'tel'; ph.name = 'phone'; ph.required = true; ph.autocomplete = 'tel'; ph.inputMode = 'numeric'; form.appendChild(field('Your phone number', ph));
    }
    if (spec.kind === 'choice') {
      for (i = 0; i < spec.questions.length; i++) {
        var q = spec.questions[i], opts = [{ value: '', label: 'Choose' }].concat(q.options);
        inputs[q.id] = select(q.id, opts); form.appendChild(field(q.text, inputs[q.id]));
      }
    } else {
      var cats = []; for (i = 0; i < spec.categories.length; i++) cats.push({ value: String(i), label: spec.categories[i].label });
      inputs.cat = select('category', cats); form.appendChild(field('Your category', inputs.cat));
      inputs.dob = el('input'); inputs.dob.type = 'date'; inputs.dob.name = 'dob'; inputs.dob.required = true; form.appendChild(field('Your date of birth', inputs.dob));
    }
    var btn = el('button', 'afd-tool-btn', ep ? 'Show my result' : 'Check'); btn.type = 'submit'; form.appendChild(btn);
    body.appendChild(form); body.appendChild(out);
    function present(r) { show(out, r.verdict, r.message); if (!r.invalid) track(spec, r.verdict); }
    if (!ep || !lead) { form.addEventListener('submit', function (ev) { ev.preventDefault(); present(answer(spec, inputs)); }); return; }
    // With an address to send to, the result is shown only once the visitor's details are on their way.
    var err = el('p', 'afd-tool-err'), thanks = el('p'), again = el('button', 'afd-tool-again', 'Check another'); err.hidden = true; err.setAttribute('data-afd-error', ''); thanks.hidden = true; thanks.setAttribute('data-afd-thanks', ''); again.type = 'button'; again.hidden = true;
    body.insertBefore(err, out); body.appendChild(thanks); body.appendChild(again);
    form.setAttribute('data-endpoint', ep); form.setAttribute('data-crm-form', 'tool-' + spec.id);
    lead.hidden(form, 'form', 'tool-' + spec.id); lead.hidden(form, 'page', location.pathname); lead.hidden(form, 'page_url', location.href); lead.hidden(form, 'exam', spec.exam); lead.hidden(form, 'offer', 'tool-' + spec.id);
    form.addEventListener('submit', function (ev) {
      pending = answer(spec, inputs);
      if (pending.invalid) { ev.preventDefault(); ev.stopImmediatePropagation(); show(out, pending.verdict, pending.message); }
    });
    lead.wire(form, function () { form.hidden = true; again.hidden = false; present(pending); });
    again.addEventListener('click', function () { form.hidden = false; again.hidden = true; out.hidden = true; var b2 = form.querySelector('button[type=submit]'); if (b2) b2.disabled = false; });
  }
  for (var b = 0; b < boxes.length; b++) build(boxes[b]);
})();`;
