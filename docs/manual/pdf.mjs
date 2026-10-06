#!/usr/bin/env node
/**
 * Renders the built books to PDF.
 *
 * The HTML books are the real artefact — they are searchable, they work
 * on a phone and they are one file. The PDFs exist because a handbook
 * gets forwarded on WhatsApp, printed, and read by people who will not
 * open an `.html` file, and because a PDF has page numbers somebody can
 * say out loud.
 *
 * Uses the Chromium that Playwright already installs for the end-to-end
 * tests, so there is nothing extra to add to the project. Set
 * `CHROME_PATH` if yours lives somewhere else.
 *
 *   npm run manual && npm run manual:pdf
 */

import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const BOOKS = [
  { html: "manual-staff.html", pdf: "AFD-CRM-Staff-Handbook.pdf", title: "AFD India CRM — Staff Handbook" },
  {
    html: "manual-admin.html",
    pdf: "AFD-CRM-Administrator-Handbook.pdf",
    title: "AFD India CRM — Administrator Handbook",
  },
];

/**
 * The running foot: the book's name on the left, the page number on the
 * right. Chromium substitutes `pageNumber` and `totalPages`; the inline
 * styles are required because the header and footer are rendered in
 * their own document and inherit nothing from the page.
 */
function footer(title) {
  return `<div style="width:100%;font-family:Georgia,serif;font-size:8pt;color:#000;padding:0 18mm;display:flex;justify-content:space-between;">
    <span>${title}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

async function main() {
  const missing = BOOKS.filter((book) => !existsSync(join(HERE, book.html)));
  if (missing.length > 0) {
    throw new Error(`Not built yet: ${missing.map((b) => b.html).join(", ")}. Run "npm run manual" first.`);
  }
  if (!existsSync(CHROME)) {
    throw new Error(`No Chromium at ${CHROME}. Run "npm run e2e:install", or set CHROME_PATH.`);
  }

  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const page = await browser.newPage();
    for (const book of BOOKS) {
      await page.goto(pathToFileURL(join(HERE, book.html)).href, { waitUntil: "load" });
      await page.pdf({
        path: join(HERE, book.pdf),
        format: "A4",
        printBackground: true,
        // Room for the running foot, and a margin a printer will not eat.
        // These win over the stylesheet's `@page`, which is there for
        // somebody printing the HTML from their own browser.
        margin: { top: "18mm", bottom: "18mm", left: "20mm", right: "20mm" },
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: footer(book.title),
        // A PDF outline from the headings, so the chapters are navigable
        // in a reader's sidebar as well as from the contents page.
        outline: true,
        tagged: true,
      });
      const mb = (statSync(join(HERE, book.pdf)).size / 1024 / 1024).toFixed(1);
      console.log(`${book.pdf} — ${mb} MB`);
    }
  } finally {
    await browser.close();
  }
}

await main();
