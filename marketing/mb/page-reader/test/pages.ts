// Small realistic pages for the tests.
const filler = (n: number): string => Array.from({ length: n }, () => 'Practise every day with a timer and review each attempt with a mentor.').join(' ');
const answer = 'Start with simple drawing tasks, then add timed practice, and ask a mentor to review your work every week so you can see exactly what to fix next time. Keep a notebook of mistakes and revisit it before each new attempt.';

export const goodPage = `<!doctype html><html lang="en"><head>
<title>NID DAT Prelims 2027: pattern and preparation</title>
<meta name="description" content="Everything about the NID DAT Prelims 2027 pattern, with a weekly preparation plan, mentor review and a free demo class to begin.">
<link rel="canonical" href="https://afdindia.com/page/nid-dat-prelims">
<meta name="viewport" content="width=device-width"><meta property="og:title" content="x"><meta property="og:image" content="https://afdindia.com/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}</script>
</head><body>
<header><img src="/logo.png" alt=""></header>
<main>
<h1>NID DAT Prelims 2027</h1>
<p>By Julie James. ${filler(1)}</p>
<a href="tel:+919895484652">Call</a> <a href="https://wa.me/919895484652?text=hi">WhatsApp</a>
<form action="https://script.google.com/x"><input name="name"><input name="phone" type="tel"><select name="exam"></select></form>
<h2>Key takeaways</h2><ul><li>Start early</li></ul>
<h2>How do you prepare for the NID DAT Prelims?</h2><p>${answer}</p>
<h2>What does the studio test check?</h2><p>${answer}</p>
<h2>Plan</h2><p>${filler(30)}</p>
<p>Official details are on <a href="https://admissions.nid.edu">the NID admissions site</a>. Call 98954 84651 for help.</p>
<img src="/own.jpg" alt="Students drawing">
</main><footer>© 2026 afdindia</footer><script>sessionStorage.getItem('afd_attr')</script></body></html>`;

export const badPage = `<html><head><title>NID</title>
<meta name="robots" content="noindex">
<script type="application/ld+json">{ broken</script>
<script type="application/ld+json">{"@type":"Event"}</script>
</head><body><h1>One</h1><h1>Two</h1><h3>Skipped</h3>
<p>Short page for the 2024 exam. Call 90000 11111.</p>
<img src="/a.jpg"><img src="/logo.png">
</body></html>`;
