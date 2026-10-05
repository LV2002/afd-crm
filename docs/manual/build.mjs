#!/usr/bin/env node
/**
 * Builds the staff manual into one self-contained HTML file.
 *
 * Reads every numbered chapter in this folder, in order, and writes
 * `manual.html` — a printed-book layout with a table of contents, no
 * external stylesheet, no fonts to fetch, nothing to install. Open it by
 * double-clicking; print it with the browser's own print command.
 *
 * Deliberately a hand-written Markdown subset rather than a library: the
 * manual is prose, tables and the occasional code span, and adding a
 * dependency to the project so a documentation file can be built is a
 * worse trade than two hundred lines that never change.
 *
 *   node docs/manual/build.mjs      (or: npm run manual)
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `01-introduction.md` … in numeric order. Files starting `_` are notes, not chapters. */
function chapterFiles() {
  return readdirSync(HERE)
    .filter((name) => /^\d{2}-.+\.md$/.test(name))
    .sort();
}

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A stable id for a heading, so the contents can link to it and the link survives a rebuild. */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Inline markup, applied after escaping so a `<` in the prose cannot
 * become a tag. Order matters: code spans first, so `**` inside one is
 * left alone.
 */
function inline(text) {
  const codes = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = out
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*]+)\*/g, "$1<em>$2</em>");

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

function renderTableRow(line, cell) {
  const cells = line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
  return `<tr>${cells.map((c) => `<${cell}>${inline(c)}</${cell}>`).join("")}</tr>`;
}

/**
 * Markdown → HTML, for the subset the manual actually uses. Returns the
 * body and the headings found.
 *
 * `seen` is shared across chapters so ids stay unique in the one built
 * file: every procedure has a "Steps" heading, and twenty elements with
 * `id="steps"` is invalid HTML and makes an in-page link ambiguous.
 */
function render(markdown, seen) {
  const lines = markdown.split("\n");
  const html = [];
  const headings = [];
  let i = 0;

  const close = (tag) => {
    if (html.at(-1) === `<${tag}>`) html.pop();
    else html.push(`</${tag}>`);
  };

  let inList = null;

  function endList() {
    if (inList) {
      close(inList);
      inList = null;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule, and the "back to contents" link we add ourselves.
    if (/^---\s*$/.test(line)) {
      endList();
      html.push("<hr />");
      i += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      endList();
      const level = heading[1].length;
      const text = heading[2].trim();
      let id = slug(text);
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      if (n > 1) id = `${id}-${n}`;
      // Only h1 and h2 go in the contents: h3 and below are detail.
      if (level <= 2) headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    // Table: a header row, a separator, then body rows.
    if (/^\|/.test(line) && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "")) {
      endList();
      html.push("<table><thead>", renderTableRow(line, "th"), "</thead><tbody>");
      i += 2;
      while (i < lines.length && /^\|/.test(lines[i])) {
        html.push(renderTableRow(lines[i], "td"));
        i += 1;
      }
      html.push("</tbody></table>");
      continue;
    }

    // Fenced code.
    if (/^```/.test(line)) {
      endList();
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      html.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Block quote.
    if (/^>\s?/.test(line)) {
      endList();
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote>${inline(body.join(" "))}</blockquote>`);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);

    if (bullet || numbered) {
      const want = bullet ? "ul" : "ol";
      if (inList !== want) {
        endList();
        html.push(`<${want}>`);
        inList = want;
      }
      // Continuation lines are indented under the bullet.
      const parts = [(bullet ?? numbered)[1]];
      i += 1;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
        parts.push(lines[i].trim());
        i += 1;
      }
      html.push(`<li>${inline(parts.join(" "))}</li>`);
      continue;
    }

    if (line.trim() === "") {
      endList();
      i += 1;
      continue;
    }

    // Paragraph: gather until a blank line or the start of another block.
    const para = [line.trim()];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4}\s|[-*]\s|\d+\.\s|\||```|>|---\s*$)/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    endList();
    html.push(`<p>${inline(para.join(" "))}</p>`);
  }

  endList();
  return { body: html.join("\n"), headings };
}

const CSS = `
  @page { margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 11.5pt;
    line-height: 1.6;
    color: #000;
    background: #fff;
    margin: 0 auto;
    padding: 3rem 1.5rem 6rem;
    max-width: 38em;
    text-rendering: optimizeLegibility;
  }
  h1, h2, h3, h4 { font-weight: normal; line-height: 1.25; }
  h1 {
    font-size: 1.9em;
    margin: 0 0 1.5rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid #000;
  }
  h2 { font-size: 1.35em; margin: 2.4rem 0 0.8rem; }
  h3 { font-size: 1.1em; margin: 1.8rem 0 0.6rem; font-style: italic; }
  h4 { font-size: 1em; margin: 1.4rem 0 0.5rem; font-weight: bold; }
  p { margin: 0 0 1rem; }
  ul, ol { margin: 0 0 1rem; padding-left: 1.6rem; }
  li { margin-bottom: 0.35rem; }
  strong { font-weight: bold; }
  code {
    font-family: "Courier New", Courier, monospace;
    font-size: 0.88em;
  }
  pre {
    font-family: "Courier New", Courier, monospace;
    font-size: 0.85em;
    line-height: 1.45;
    border: 1px solid #000;
    padding: 0.8rem 1rem;
    overflow-x: auto;
    margin: 0 0 1rem;
  }
  pre code { font-size: 1em; }
  blockquote {
    margin: 0 0 1rem;
    padding-left: 1rem;
    border-left: 2px solid #000;
    font-style: italic;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0 0 1.2rem;
    font-size: 0.92em;
  }
  th, td {
    border: 1px solid #000;
    padding: 0.35rem 0.55rem;
    text-align: left;
    vertical-align: top;
  }
  th { font-weight: bold; }
  hr { border: 0; border-top: 1px solid #000; margin: 2rem 0; }
  a { color: #000; }
  .title-block { text-align: center; margin-bottom: 4rem; }
  .title-block h1 { border: 0; font-size: 2.4em; margin-bottom: 0.5rem; }
  .title-block p { font-style: italic; }
  nav.contents ol { list-style: none; padding-left: 0; }
  nav.contents > ol > li { margin-bottom: 0.9rem; }
  nav.contents ol ol { list-style: none; padding-left: 1.5rem; margin-top: 0.25rem; }
  nav.contents ol ol li { margin-bottom: 0.1rem; font-size: 0.95em; }
  nav.contents a { text-decoration: none; }
  nav.contents a:hover { text-decoration: underline; }
  .chapter { page-break-before: always; }
  .back-to-contents {
    font-size: 0.85em;
    font-style: italic;
    margin-top: 2rem;
  }
  @media print {
    body { padding: 0; max-width: none; font-size: 10.5pt; }
    nav.contents { page-break-after: always; }
    a { text-decoration: none; }
    h2, h3, h4 { page-break-after: avoid; }
    table, pre, blockquote, li { page-break-inside: avoid; }
    .back-to-contents { display: none; }
  }
`;

function build() {
  const files = chapterFiles();
  if (files.length === 0) throw new Error("No chapter files found in docs/manual/");

  const seen = new Map();
  const chapters = files.map((file) => {
    let markdown = readFileSync(join(HERE, file), "utf8");
    // The per-chapter "back to contents" link is added by this script, so
    // the Markdown files do not each have to carry working anchor markup.
    markdown = markdown.replace(/\n---\n\n\[Back to contents\]\(#contents\)\s*$/, "\n");
    const { body, headings } = render(markdown, seen);
    return { file, body, headings, title: headings[0]?.text ?? file };
  });

  const toc = chapters
    .map((chapter) => {
      const [first, ...rest] = chapter.headings;
      const sub = rest
        .map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`)
        .join("\n");
      return `<li><a href="#${first.id}"><strong>${escapeHtml(first.text)}</strong></a>${
        sub ? `\n<ol>\n${sub}\n</ol>` : ""
      }</li>`;
    })
    .join("\n");

  const built = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AFD India CRM — Staff Manual</title>
<style>${CSS}</style>
</head>
<body>

<div class="title-block">
  <h1>AFD India CRM</h1>
  <p>The staff manual</p>
  <p>Built ${built}</p>
</div>

<nav class="contents" id="contents">
<h1>Contents</h1>
<ol>
${toc}
</ol>
</nav>

${chapters
  .map(
    (chapter) => `<section class="chapter">
${chapter.body}
<p class="back-to-contents"><a href="#contents">Back to contents</a></p>
</section>`,
  )
  .join("\n\n")}

</body>
</html>
`;

  writeFileSync(join(HERE, "manual.html"), html, "utf8");
  const kb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
  console.log(`Built docs/manual/manual.html — ${chapters.length} chapters, ${kb} KB.`);
  for (const chapter of chapters) {
    console.log(`  ${chapter.file.padEnd(32)} ${chapter.headings.length - 1} sections`);
  }
}

build();
