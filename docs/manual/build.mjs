#!/usr/bin/env node
/**
 * Builds the manual into two self-contained HTML books, from one set of
 * chapters:
 *
 *   manual-staff.html   everything a counsellor, accountant, centre head
 *                       or academics coordinator does in the CRM
 *   manual-admin.html   all of that, plus Settings, the integrations and
 *                       the technical runbooks
 *
 * One source, two audiences, because the alternative is two sets of
 * chapters that describe the same screens and drift apart within a month.
 *
 * ## How a chapter says who it is for
 *
 * A whole chapter, with this as its FIRST line:
 *
 *     <!-- audience: admin -->
 *
 * Part of a chapter — a section, a paragraph, one bullet — fenced:
 *
 *     <!-- only: admin -->
 *     ...administrator-only prose...
 *     <!-- /only -->
 *
 * `staff` works the same way, for the rare passage that belongs in the
 * staff book and would be noise in the administrator's. Regions do not
 * nest, and an unclosed one fails the build rather than silently
 * swallowing the rest of a chapter.
 *
 * ## Numbering
 *
 * Chapters and sections are renumbered per book, so the staff book runs
 * 1, 2, 3 … with no gaps where an administrator chapter was removed.
 * Cross-references are rewritten from the same map — `Chapter 13`,
 * `Chapter 6.4` and a bare `(7.5)` all follow. A reference that points
 * at something this book does not contain becomes a pointer to the other
 * book, which is the honest answer: the material exists, just not here.
 *
 * Deliberately a hand-written Markdown subset rather than a library: the
 * manual is prose, tables and the occasional code span, and adding a
 * dependency to the project so a documentation file can be built is a
 * worse trade than three hundred lines that never change.
 *
 *   node docs/manual/build.mjs      (or: npm run manual)
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const EDITIONS = [
  {
    audience: "staff",
    out: "manual-staff.html",
    title: "AFD India CRM — Staff Handbook",
    subtitle: "The staff handbook",
    elsewhere: "the administrator handbook",
  },
  {
    audience: "admin",
    out: "manual-admin.html",
    title: "AFD India CRM — Administrator Handbook",
    subtitle: "The administrator handbook",
    elsewhere: "the staff handbook",
  },
];

/** `01-introduction.md` … in numeric order. Files starting `_` are notes, not chapters. */
function chapterFiles() {
  return readdirSync(HERE)
    .filter((name) => /^\d{2}-.+\.md$/.test(name))
    .sort();
}

const FRONT_MATTER = /^<!--\s*audience:\s*(staff|admin)\s*-->\s*$/;
const OPEN_REGION = /^<!--\s*only:\s*(staff|admin)\s*-->\s*$/;
const CLOSE_REGION = /^<!--\s*\/only\s*-->\s*$/;
const STRAY_DIRECTIVE = /^<!--\s*\/?(audience|only)\b/;

/** Stands in for a removed directive until `healSeams` decides what it should be. */
const SEAM = "\u0001";

const H1 = /^#\s+Chapter\s+(\d{1,2}[a-z]?)\s+—\s+(.*)$/;
const H2 = /^##\s+(\d{1,2})\.(\d{1,2}[a-z]?)\s+(.*)$/;

/**
 * A chapter reference (`Chapter 13`, `Chapter 6.4`) or a bare section
 * number in running prose (`(7.5)`). The lookaround keeps version-ish
 * and scientific numbers out: `9.85E+09` has a digit after the second
 * group, `1.2.3` has a dot.
 */
const REFERENCE =
  /(Chapter\s+)(\d{1,2})(?:\.(\d{1,2}[a-z]?))?|(?<![\d.])(\d{1,2})\.(\d{1,2}[a-z]?)(?![\d.])/g;

/** The audience declared on a file's first line, or `all`. */
function declaredAudience(source) {
  const first = source.split("\n", 1)[0];
  const matched = FRONT_MATTER.exec(first);
  return matched ? matched[1] : "all";
}

/**
 * Drops the `only:` regions that belong to the other book, and the
 * directives themselves.
 */
function selectForAudience(source, audience, file) {
  const out = [];
  let open = null;
  let fenced = false;

  source.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;

    if (index === 0 && FRONT_MATTER.test(line)) return;

    // Chapter 19 prints the directives as examples. Inside a fence they
    // are text, not instructions to this parser.
    if (/^```/.test(line)) fenced = !fenced;
    if (fenced || /^```/.test(line)) {
      if (!(open && open.audience !== audience)) out.push(line);
      return;
    }

    const opened = OPEN_REGION.exec(line);
    if (opened) {
      if (open) {
        throw new Error(
          `${file}:${lineNumber} — an "only" region opened on line ${open.line} is still open. Regions do not nest.`,
        );
      }
      open = { audience: opened[1], line: lineNumber };
      out.push(SEAM);
      return;
    }

    if (CLOSE_REGION.test(line)) {
      if (!open) throw new Error(`${file}:${lineNumber} — "<!-- /only -->" with no region open.`);
      open = null;
      out.push(SEAM);
      return;
    }

    if (STRAY_DIRECTIVE.test(line)) {
      throw new Error(`${file}:${lineNumber} — unrecognised directive: ${line.trim()}`);
    }

    if (open && open.audience !== audience) return;
    out.push(line);
  });

  if (open) {
    throw new Error(`${file} — the "only: ${open.audience}" region on line ${open.line} is never closed.`);
  }

  return healSeams(out).join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}

const LIST_LINE = /^(\s*([-*]|\d+\.)\s|\s{2,}\S)/;

/**
 * Repairs the join where a region was cut out.
 *
 * A directive line was doing double duty as a blank line: remove it and
 * the paragraph above runs into the paragraph below, which the renderer
 * then sets as one paragraph. So every cut leaves a marker, and the
 * marker becomes a blank line — unless the cut was inside a list, where
 * a blank line would end the list and start a second one a visible gap
 * further down.
 */
function healSeams(lines) {
  const neighbour = (from, step) => {
    for (let i = from + step; i >= 0 && i < lines.length; i += step) {
      if (lines[i] !== SEAM) return lines[i];
    }
    return "";
  };

  return lines
    .map((line, index) => {
      if (line !== SEAM) return line;
      const before = neighbour(index, -1);
      const after = neighbour(index, 1);
      if (LIST_LINE.test(before) && LIST_LINE.test(after)) return null;
      return "";
    })
    .filter((line) => line !== null);
}

/** Every chapter and section number the manual contains, both audiences. */
function allHeadingNumbers(files) {
  const keys = new Set();
  for (const file of files) {
    let fenced = false;
    for (const line of readFileSync(join(HERE, file), "utf8").split("\n")) {
      if (/^```/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      const h1 = H1.exec(line);
      if (h1) keys.add(h1[1]);
      const h2 = H2.exec(line);
      if (h2) keys.add(`${h2[1]}.${h2[2]}`);
    }
  }
  return keys;
}

/**
 * Old number → number in this book. Chapters are numbered by position,
 * sections by position within their chapter, so a book that leaves out
 * Chapter 13 and § 14.6 has no holes in either sequence.
 */
function numbering(chapters) {
  const chapterMap = new Map();
  const sectionMap = new Map();

  chapters.forEach((chapter, index) => {
    const now = String(index + 1);
    let was = null;
    let section = 0;

    let fenced = false;
    for (const line of chapter.source.split("\n")) {
      if (/^```/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      const h1 = H1.exec(line);
      if (h1) {
        was = h1[1];
        chapterMap.set(was, now);
        continue;
      }
      const h2 = H2.exec(line);
      if (h2) {
        if (h2[1] !== was) {
          throw new Error(
            `${chapter.file} — section "${h2[1]}.${h2[2]}" is numbered for chapter ${h2[1]}, but this is chapter ${was}.`,
          );
        }
        section += 1;
        sectionMap.set(`${was}.${h2[2]}`, `${now}.${section}`);
      }
    }

    if (!was) throw new Error(`${chapter.file} — no "# Chapter N — Title" heading.`);
  });

  return { chapterMap, sectionMap };
}

function rewriteReferences(text, { chapterMap, sectionMap }, known, elsewhere) {
  return text.replace(REFERENCE, (match, prefix, chapter, section, bareChapter, bareSection) => {
    const major = chapter ?? bareChapter;
    const minor = section ?? bareSection;
    const key = minor ? `${major}.${minor}` : major;
    const now = (minor ? sectionMap : chapterMap).get(key);
    if (now) return `${prefix ?? ""}${now}`;
    // In this manual but not in this book: say where it went.
    if (known.has(key)) return elsewhere;
    // Some other number. Leave it exactly as written.
    return match;
  });
}

/** Renumbers headings and references, leaving code spans and fences alone. */
function renumber(markdown, maps, known, elsewhere) {
  let fenced = false;

  return markdown
    .split("\n")
    .map((line) => {
      if (/^```/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;

      const codes = [];
      const masked = line.replace(/`[^`]*`/g, (span) => {
        codes.push(span);
        return `\u0000${"x".repeat(codes.length)}\u0000`;
      });

      const rewritten = rewriteReferences(masked, maps, known, elsewhere);
      return rewritten.replace(/\u0000(x+)\u0000/g, (_, xs) => codes[xs.length - 1]);
    })
    .join("\n");
}

/**
 * Numbers that look like references but name nothing in this book.
 *
 * Printed, not thrown: the usual cause is a new cross-reference typed by
 * hand with a number that no longer exists, and the person who needs to
 * know is whoever just ran the build.
 */
function danglingReferences(markdown, { chapterMap, sectionMap }) {
  const chapters = new Set(chapterMap.values());
  const sections = new Set(sectionMap.values());
  const found = new Set();
  let fenced = false;

  for (const line of markdown.split("\n")) {
    if (/^```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const prose = line.replace(/`[^`]*`/g, "");
    for (const match of prose.matchAll(REFERENCE)) {
      const [, prefix, chapter, section, bareChapter, bareSection] = match;
      const major = chapter ?? bareChapter;
      const minor = section ?? bareSection;
      if (minor) {
        if (!sections.has(`${major}.${minor}`)) found.add(match[0]);
      } else if (prefix && !chapters.has(major)) {
        found.add(match[0]);
      }
    }
  }

  return [...found];
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
  /*
    On a phone, a wide table scrolls by itself rather than taking the page
    with it. A width of 100% is not enough on its own: the cells' own
    minimum widths can still push a seven-column table past a 412px
    screen, and with no scroll container the whole document goes sideways.

    Screen-only and narrow-only, so the printed book and the desktop
    reading width keep an ordinary full-width table.
  */
  @media screen and (max-width: 48em) {
    table { display: block; width: max-content; max-width: 100%; overflow-x: auto; }
    code { overflow-wrap: anywhere; }
  }
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

function buildEdition(edition, files, known, built) {
  const selected = files
    .map((file) => ({ file, raw: readFileSync(join(HERE, file), "utf8") }))
    .filter(({ raw }) => {
      const audience = declaredAudience(raw);
      return audience === "all" || audience === edition.audience;
    })
    .map(({ file, raw }) => ({ file, source: selectForAudience(raw, edition.audience, file) }));

  if (selected.length === 0) throw new Error(`No chapters for the ${edition.audience} edition.`);

  const maps = numbering(selected);
  const seen = new Map();

  const chapters = selected.map(({ file, source }) => {
    // The per-chapter "back to contents" link is added by this script, so
    // the Markdown files do not each have to carry working anchor markup.
    const trimmed = source.replace(/\n---\n\n\[Back to contents\]\(#contents\)\s*$/, "\n");
    const markdown = renumber(trimmed, maps, known, edition.elsewhere);
    const { body, headings } = render(markdown, seen);
    return { file, body, headings, markdown, title: headings[0]?.text ?? file };
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

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(edition.title)}</title>
<style>${CSS}</style>
</head>
<body>

<div class="title-block">
  <h1>AFD India CRM</h1>
  <p>${escapeHtml(edition.subtitle)}</p>
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

  writeFileSync(join(HERE, edition.out), html, "utf8");

  const dangling = danglingReferences(chapters.map((c) => c.markdown).join("\n"), maps);
  const kb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
  console.log(`\n${edition.out} — ${chapters.length} chapters, ${kb} KB.`);
  for (const chapter of chapters) {
    console.log(`  ${chapter.file.padEnd(32)} ${chapter.headings.length - 1} sections`);
  }
  if (dangling.length > 0) {
    console.log(`  ! references to nothing in this book: ${dangling.join(", ")}`);
  }
}

export { selectForAudience, numbering, rewriteReferences, renumber, allHeadingNumbers, declaredAudience };

function build() {
  const files = chapterFiles();
  if (files.length === 0) throw new Error("No chapter files found in docs/manual/");

  const known = allHeadingNumbers(files);
  const built = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  for (const edition of EDITIONS) buildEdition(edition, files, known, built);
}

/*
  Run as a script, imported by its tests. `import.meta.main` is Node 24+;
  the argv comparison is what works on the Node that builds this project.
*/
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) build();
