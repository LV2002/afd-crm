#!/usr/bin/env node
/**
 * Renders the launch walkthrough to a real video file.
 *
 * How it works: the scenes become one self-contained HTML page that
 * plays itself on a timer, Playwright opens it at 1920×1080 and records
 * while it plays, and the browser's own ffmpeg writes a VP8 `.webm`.
 *
 * That is the whole pipeline, and it is deliberate. The alternative —
 * rendering frames and shelling out to a video encoder — needs an ffmpeg
 * build this environment does not have, while Playwright ships one and
 * drives it for us. The cost is the format: `.webm`, silent, because the
 * bundled encoder has no audio codecs at all.
 *
 * **The recording happens in real time.** A seven-minute film takes
 * seven minutes to render. There is no way around that with a screen
 * recorder, and a progress line is printed as it goes.
 *
 *   node docs/video/render.mjs            (or: npm run video)
 *   node docs/video/render.mjs --preview  one still per scene, no video
 */

import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { SCENES } from "./scenes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");

const WIDTH = 1920;
const HEIGHT = 1080;
/** Cross-fade length. Long enough to feel composed, short enough not to waste a reader's time. */
const FADE = 0.6;

/**
 * Chromium is pinned by path because this container's Playwright default
 * points at a headless-shell build that is not installed here. One line
 * now beats a confusing "Executable doesn't exist" later.
 */
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/**
 * How long the words on a scene genuinely take to read, in seconds.
 *
 * There is no voice track, so the only thing pacing this film is a
 * person reading. Two hundred words a minute is a comfortable screen
 * reading speed; the extra second and a half covers the eye finding the
 * start of the text after a transition. A scene's declared `hold` is
 * treated as a floor, never a ceiling — getting this wrong makes a
 * training video that cannot be trained from.
 */
function minimumHold(scene) {
  // Only the words that end up on screen. Counting the object's keys as
  // well — which an earlier version did by stringifying the whole scene —
  // inflated every list scene and pushed the film past eleven minutes.
  const parts = [];
  const take = (v) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(take);
    else if (v && typeof v === "object") Object.values(v).forEach(take);
  };
  for (const [key, value] of Object.entries(scene)) {
    if (key === "type" || key === "hold") continue;
    take(value);
  }

  const words = parts.join(" ").split(/\s+/).filter((w) => w.length > 1).length;

  /*
    Two rates, because the two kinds of scene are read differently. Prose
    is read word by word; a labelled list is scanned, and the eye does not
    stop on every word of a fourteen-row grid. Charging scan scenes the
    prose rate is what made this film half as long again as it needed
    to be.
  */
  const SCANNED = new Set(["sidebar", "stages", "roles", "badges", "definitions", "channels", "buckets"]);
  const rate = SCANNED.has(scene.type) ? 330 : 215;
  return words / (rate / 60) + 1.4;
}

const escape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── The real content the diagrams draw from ───────────────────────────
// Read out of the codebase, not remembered. If any of this drifts, the
// video is wrong and should be re-rendered.

const SIDEBAR = [
  ["Dashboard", "Your queue and your numbers"],
  ["Leads", "Everyone you are allowed to see"],
  ["Pipeline", "The same leads, as a board"],
  ["Unassigned", "Leads nobody owns yet"],
  ["Admissions", "Confirmed, and their fee collection"],
  ["Students", "People who have paid and started"],
  ["Finance", "The institute's own money"],
  ["Chats", "WhatsApp and Instagram"],
  ["Student Profile Forms", "Forms students filled in"],
  ["Insights", "Reports"],
  ["Ad Performance", "What advertising cost"],
  ["Ask AI", "A question in plain English"],
  ["Manual", "This, in writing"],
  ["Settings", "Configuration"],
];

const BADGES = [
  ["Unassigned", "leads nobody owns"],
  ["Admissions", "awaiting a first payment"],
  ["Students", "waiting to be onboarded"],
  ["Chats", "waiting for a reply"],
  ["Student Profile Forms", "nobody has read"],
];

const BUCKETS = [
  ["Overdue", "Past their follow-up or task date"],
  ["Due today", "Before the day is out"],
  ["New", "Assigned to you, not contacted yet"],
  ["At risk", "Hot with no next step, or a missed target"],
];

const STAGES = [
  ["New Lead", "—"],
  ["Contacted", "4h"],
  ["Qualified", "24h"],
  ["Demo Scheduled", "48h"],
  ["Demo Completed", "24h"],
  ["Counselling Done", "48h"],
  ["Brochure Sent", "72h"],
  ["Follow-up", "72h"],
  ["Registration Form Sent", "48h"],
  ["Registration Form Submitted", "—"],
  ["Payment Pending", "24h"],
  ["Admission Confirmed", "—"],
  ["Lost", "reason required"],
  ["Parked", "—"],
];

const ROLES = [
  ["Counsellor", "Their own leads: call, log, follow up, confirm an admission"],
  ["Centre Head", "Their centre's leads, staff and numbers. Can assign, export, import"],
  ["Accounts", "Fees, payments, refunds and the ledger"],
  ["Academics", "Students and batches. Sees no leads at all"],
  ["Co-Admin", "Everything, except resetting passwords and the audit log"],
  ["Admin", "Everything. Protected, so the institute cannot lock itself out"],
];

const CHANNELS = [
  ["WhatsApp Business", "The institute's number. Replies to what it sent out."],
  ["Personal WhatsApp", "Not an inbox — an explanation of why there cannot be one."],
  ["Instagram", "DMs, with a Convert to lead button."],
];

// ── Scene markup ──────────────────────────────────────────────────────

function sceneBody(scene) {
  const stagger = (i) => `style="--i:${i}"`;

  switch (scene.type) {
    case "title":
      return `<div class="center">
        <div class="rule-top"></div>
        <h1 class="display reveal" ${stagger(0)}>${escape(scene.title)}</h1>
        <p class="lede reveal" ${stagger(1)}>${escape(scene.subtitle)}</p>
        <p class="foot reveal" ${stagger(3)}>${escape(scene.footnote)}</p>
      </div>`;

    case "outro":
      return `<div class="center">
        <h1 class="display reveal" ${stagger(0)}>${escape(scene.title)}</h1>
        <p class="lede reveal" ${stagger(1)}>${escape(scene.subtitle)}</p>
        <div class="rule-top reveal" ${stagger(2)} style="margin-top:48px"></div>
      </div>`;

    case "chapter":
      return `<div class="center">
        <div class="chapno reveal" ${stagger(0)}>${escape(scene.number)}</div>
        <h2 class="chaptitle reveal" ${stagger(1)}>${escape(scene.title)}</h2>
      </div>`;

    case "statement":
      return `<div class="center narrow">
        <p class="${scene.emphasis ? "statement emphasis" : "statement"} reveal" ${stagger(0)}>${escape(scene.text)}</p>
      </div>`;

    case "rule":
      return `<div class="center narrow">
        <div class="kicker reveal" ${stagger(0)}>Rule</div>
        <h2 class="ruletitle reveal" ${stagger(1)}>${escape(scene.rule)}</h2>
        <p class="detail reveal" ${stagger(2)}>${escape(scene.detail)}</p>
      </div>`;

    case "warning":
      return `<div class="center narrow">
        <div class="kicker warn reveal" ${stagger(0)}>Careful</div>
        <h2 class="ruletitle reveal" ${stagger(1)}>${escape(scene.heading)}</h2>
        <p class="detail reveal" ${stagger(2)}>${escape(scene.text)}</p>
        <p class="note reveal" ${stagger(3)}>${escape(scene.note)}</p>
      </div>`;

    case "steps":
      return `<div class="pad">
        <div class="kicker reveal" ${stagger(0)}>How to</div>
        <h2 class="h2 reveal" ${stagger(1)}>${escape(scene.heading)}</h2>
        <ol class="steps">
          ${scene.steps
            .map((s, i) => `<li class="reveal" ${stagger(i + 2)}><span class="num">${i + 1}</span><span>${escape(s)}</span></li>`)
            .join("")}
        </ol>
        ${scene.note ? `<p class="note reveal" ${stagger(scene.steps.length + 2)}>${escape(scene.note)}</p>` : ""}
      </div>`;

    case "definitions":
      return `<div class="pad">
        <dl class="defs">
          ${scene.items
            .map(
              ([term, meaning], i) =>
                `<div class="def reveal" ${stagger(i)}><dt>${escape(term)}</dt><dd>${escape(meaning)}</dd></div>`,
            )
            .join("")}
        </dl>
      </div>`;

    case "contrast":
      return `<div class="pad">
        <h2 class="h2 reveal" ${stagger(0)}>${escape(scene.heading)}</h2>
        <div class="split">
          <div class="half reveal" ${stagger(1)}>
            <div class="halflabel">${escape(scene.left.label)}</div>
            <div class="halftext">${escape(scene.left.text)}</div>
          </div>
          <div class="vs reveal" ${stagger(2)}>is not</div>
          <div class="half reveal" ${stagger(3)}>
            <div class="halflabel">${escape(scene.right.label)}</div>
            <div class="halftext">${escape(scene.right.text)}</div>
          </div>
        </div>
        <p class="note center-text reveal" ${stagger(4)}>${escape(scene.note)}</p>
      </div>`;

    case "pipeline": {
      const depts = ["Marketing", "Sales", "Accounts", "Academics"];
      const under = ["lead arrives", "admission confirmed", "fees, payments", "course, batch"];
      return `<div class="pad">
        <div class="flow">
          ${depts
            .map(
              (d, i) => `
            <div class="dept reveal" ${stagger(i * 2)}>
              <div class="deptname">${escape(d)}</div>
              <div class="deptsub">${escape(under[i])}</div>
            </div>
            ${i < depts.length - 1 ? `<div class="arrow reveal" ${stagger(i * 2 + 1)}>→</div>` : ""}`,
            )
            .join("")}
        </div>
        <p class="caption reveal" ${stagger(8)}>${escape(scene.caption)}</p>
      </div>`;
    }

    case "gates":
      return `<div class="pad">
        <div class="gates">
          <div class="gate reveal" ${stagger(0)}>
            <div class="gatenum">Gate 1</div>
            <div class="gatename">Sales → Accounts</div>
            <div class="gatewhat">A counsellor presses <b>Confirm admission</b></div>
            <div class="gateeffect">Sales work on that lead stops</div>
          </div>
          <div class="gate reveal" ${stagger(2)}>
            <div class="gatenum">Gate 2</div>
            <div class="gatename">Accounts → Academics</div>
            <div class="gatewhat">The first payment clears</div>
            <div class="gateeffect">A student record is created, automatically</div>
          </div>
        </div>
        <p class="caption reveal" ${stagger(4)}>${escape(scene.caption)}</p>
      </div>`;

    case "sidebar":
      return `<div class="pad">
        <div class="navgrid">
          ${SIDEBAR.map(
            ([name, what], i) =>
              `<div class="navrow reveal" ${stagger(i)}><span class="navname">${escape(name)}</span><span class="navwhat">${escape(what)}</span></div>`,
          ).join("")}
        </div>
        <p class="caption reveal" ${stagger(15)}>${escape(scene.caption)}</p>
      </div>`;

    case "badges":
      return `<div class="pad">
        <div class="badgelist">
          ${BADGES.map(
            ([name, what], i) =>
              `<div class="badgerow reveal" ${stagger(i)}><span class="dot"></span><span class="navname">${escape(name)}</span><span class="navwhat">${escape(what)}</span></div>`,
          ).join("")}
        </div>
        <p class="caption reveal" ${stagger(6)}>${escape(scene.caption)}</p>
      </div>`;

    case "buckets":
      return `<div class="pad">
        <div class="buckets">
          ${BUCKETS.map(
            ([name, what], i) =>
              `<div class="bucket reveal" ${stagger(i)}><div class="bucketorder">${i + 1}</div><div><div class="bucketname">${escape(name)}</div><div class="bucketwhat">${escape(what)}</div></div></div>`,
          ).join("")}
        </div>
        <p class="caption reveal" ${stagger(5)}>${escape(scene.caption)}</p>
      </div>`;

    case "stages":
      return `<div class="pad">
        <div class="stagegrid">
          ${STAGES.map(
            ([name, sla], i) =>
              `<div class="stage reveal" ${stagger(i)}><span>${escape(name)}</span><span class="sla">${escape(sla)}</span></div>`,
          ).join("")}
        </div>
        <p class="caption reveal" ${stagger(15)}>${escape(scene.caption)} <span class="dim">The right-hand column is the response target.</span></p>
      </div>`;

    case "roles":
      return `<div class="pad">
        <div class="rolelist">
          ${ROLES.map(
            ([name, what], i) =>
              `<div class="rolerow reveal" ${stagger(i)}><span class="rolename">${escape(name)}</span><span class="rolewhat">${escape(what)}</span></div>`,
          ).join("")}
        </div>
        <p class="caption reveal" ${stagger(7)}>${escape(scene.caption)}</p>
      </div>`;

    case "channels":
      return `<div class="pad">
        <div class="channels">
          ${CHANNELS.map(
            ([name, what], i) =>
              `<div class="channel reveal" ${stagger(i)}><div class="channelname">${escape(name)}</div><div class="channelwhat">${escape(what)}</div></div>`,
          ).join("")}
        </div>
        <p class="caption reveal" ${stagger(4)}>${escape(scene.caption)}</p>
      </div>`;

    case "masked":
      return `<div class="center narrow">
        <div class="maskdemo">
          <div class="masked reveal" ${stagger(0)}>+91 98••••3456</div>
          <div class="maskarrow reveal" ${stagger(2)}>click to reveal</div>
          <div class="revealed reveal" ${stagger(3)}>recorded in the audit log</div>
        </div>
        <p class="caption reveal" ${stagger(4)}>${escape(scene.caption)}</p>
      </div>`;

    case "help":
      return `<div class="center narrow">
        <div class="url reveal" ${stagger(0)}>/manual</div>
        <p class="lede reveal" ${stagger(1)}>${escape(scene.caption)}</p>
        <p class="note reveal" ${stagger(2)}>Nineteen chapters, a glossary, a field reference, and a “where do I find X” index. Printable.</p>
      </div>`;

    default:
      return `<div class="center"><p class="statement">${escape(scene.type)}</p></div>`;
  }
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#0E1116}
body{
  font-family:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;
  color:#F2F0EC;-webkit-font-smoothing:antialiased;
}
#stage{position:relative;width:${WIDTH}px;height:${HEIGHT}px}
.scene{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  opacity:0;transition:opacity ${FADE}s ease;
}
.scene.on{opacity:1}
.center{text-align:center;max-width:1500px;padding:0 120px}
.narrow{max-width:1240px}
.pad{width:100%;max-width:1560px;padding:0 120px}

/* Each .reveal rises in, staggered by its --i. */
.reveal{opacity:0;transform:translateY(14px)}
.scene.on .reveal{animation:rise .62s cubic-bezier(.2,.7,.3,1) forwards;animation-delay:calc(var(--i,0) * .11s + .12s)}
@keyframes rise{to{opacity:1;transform:none}}

.display{font-size:104px;font-weight:300;letter-spacing:-2.5px;line-height:1.02}
.lede{font-size:34px;font-weight:300;color:#B9C0C9;margin-top:22px}
.foot{font-size:21px;color:#6F7883;margin-top:56px;letter-spacing:.3px}
.rule-top{width:92px;height:2px;background:#E0A458;margin:0 auto 46px}

.chapno{font-size:19px;letter-spacing:7px;color:#E0A458;font-weight:600}
.chaptitle{font-size:64px;font-weight:300;letter-spacing:-1.2px;margin-top:22px}

.statement{font-size:52px;font-weight:300;line-height:1.34;letter-spacing:-.8px}
.statement.emphasis{color:#E0A458;font-weight:400}

.kicker{font-size:16px;letter-spacing:5px;text-transform:uppercase;color:#E0A458;font-weight:600}
.kicker.warn{color:#E07A5F}
.ruletitle{font-size:58px;font-weight:300;letter-spacing:-1px;margin-top:20px;line-height:1.14}
.detail{font-size:30px;font-weight:300;line-height:1.5;color:#B9C0C9;margin-top:30px}
.note{font-size:24px;color:#8A929C;margin-top:30px;font-style:italic;line-height:1.45}
.center-text{text-align:center}
.caption{font-size:26px;color:#8A929C;margin-top:54px;line-height:1.45;text-align:center}
.dim{color:#5E6670}
.h2{font-size:52px;font-weight:300;letter-spacing:-1px;margin-top:18px}

.steps{list-style:none;margin-top:46px}
.steps li{display:flex;gap:28px;align-items:baseline;font-size:33px;font-weight:300;line-height:1.4;margin-bottom:26px}
.num{flex:0 0 46px;height:46px;border:1px solid #39414C;border-radius:50%;display:grid;place-items:center;
  font-size:19px;color:#E0A458;font-weight:600;transform:translateY(4px)}

.defs{display:flex;flex-direction:column;gap:26px}
.def{display:grid;grid-template-columns:300px 1fr;gap:44px;align-items:baseline;
  border-bottom:1px solid #1D232B;padding-bottom:24px}
.def dt{font-size:38px;font-weight:400;letter-spacing:-.5px}
.def dd{font-size:28px;font-weight:300;color:#B9C0C9;line-height:1.4}

.split{display:flex;align-items:stretch;gap:40px;margin-top:56px}
.half{flex:1;border:1px solid #28303A;padding:44px 38px}
.halflabel{font-size:17px;letter-spacing:4px;text-transform:uppercase;color:#E0A458;font-weight:600}
.halftext{font-size:34px;font-weight:300;margin-top:20px;line-height:1.35}
.vs{align-self:center;font-size:24px;color:#6F7883;font-style:italic}

.flow{display:flex;align-items:center;justify-content:center;gap:26px}
.dept{flex:1;border:1px solid #28303A;padding:42px 26px;text-align:center}
.deptname{font-size:34px;font-weight:400}
.deptsub{font-size:21px;color:#8A929C;margin-top:12px}
.arrow{font-size:38px;color:#E0A458}

.gates{display:flex;gap:44px;margin-bottom:10px}
.gate{flex:1;border-left:3px solid #E0A458;padding:12px 0 12px 36px}
.gatenum{font-size:16px;letter-spacing:5px;text-transform:uppercase;color:#E0A458;font-weight:600}
.gatename{font-size:40px;font-weight:300;margin-top:14px;letter-spacing:-.5px}
.gatewhat{font-size:26px;color:#B9C0C9;margin-top:22px;line-height:1.4}
.gateeffect{font-size:26px;margin-top:14px;line-height:1.4}

.navgrid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(7,auto);
  grid-auto-flow:column;gap:16px 60px}
.navrow{display:grid;grid-template-columns:300px 1fr;gap:26px;align-items:baseline;
  border-bottom:1px solid #1A2028;padding-bottom:13px}
.navname{font-size:27px;font-weight:400}
.navwhat{font-size:21px;color:#8A929C}

.badgelist{display:flex;flex-direction:column;gap:26px}
.badgerow{display:grid;grid-template-columns:22px 360px 1fr;gap:26px;align-items:center}
.dot{width:14px;height:14px;border-radius:50%;background:#E05B5B}

.buckets{display:flex;flex-direction:column;gap:22px}
.bucket{display:flex;gap:32px;align-items:center;border:1px solid #28303A;padding:26px 34px}
.bucketorder{flex:0 0 52px;height:52px;border-radius:50%;background:#E0A458;color:#0E1116;
  display:grid;place-items:center;font-size:24px;font-weight:700}
.bucketname{font-size:34px;font-weight:400}
.bucketwhat{font-size:22px;color:#8A929C;margin-top:6px}

.stagegrid{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(7,auto);
  grid-auto-flow:column;gap:11px 60px}
.stage{display:flex;justify-content:space-between;align-items:baseline;
  border-bottom:1px solid #1A2028;padding-bottom:11px;font-size:26px;font-weight:300}
.sla{font-size:19px;color:#E0A458;letter-spacing:.5px}

.rolelist{display:flex;flex-direction:column;gap:22px}
.rolerow{display:grid;grid-template-columns:300px 1fr;gap:40px;align-items:baseline;
  border-bottom:1px solid #1A2028;padding-bottom:20px}
.rolename{font-size:32px;font-weight:400}
.rolewhat{font-size:24px;color:#B9C0C9;line-height:1.4}

.channels{display:flex;gap:34px}
.channel{flex:1;border:1px solid #28303A;padding:40px 32px}
.channelname{font-size:30px;font-weight:400}
.channelwhat{font-size:22px;color:#8A929C;margin-top:18px;line-height:1.45}

.maskdemo{display:flex;flex-direction:column;align-items:center;gap:22px}
.masked{font-family:"Consolas","Courier New",monospace;font-size:68px;letter-spacing:2px}
.maskarrow{font-size:22px;color:#E0A458;letter-spacing:3px;text-transform:uppercase}
.revealed{font-size:26px;color:#8A929C;font-style:italic}

.url{font-family:"Consolas","Courier New",monospace;font-size:92px;color:#E0A458;letter-spacing:-1px}

#progress{position:absolute;left:0;bottom:0;height:3px;background:#E0A458;width:0;z-index:50}
#brand{position:absolute;right:56px;bottom:40px;font-size:17px;letter-spacing:3.5px;
  text-transform:uppercase;color:#424A55;z-index:50}
`;

function buildHtml(timeline, totalMs) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${CSS}</style></head>
<body>
<div id="stage">
${timeline.map((t, i) => `<section class="scene" id="s${i}">${sceneBody(t.scene)}</section>`).join("\n")}
<div id="progress"></div>
<div id="brand">AFD India CRM</div>
</div>
<script>
  const CUES = ${JSON.stringify(timeline.map((t) => t.startMs))};
  const TOTAL = ${totalMs};
  const bar = document.getElementById("progress");
  let shown = -1;
  // Driven by the wall clock rather than by chained timeouts: a dropped
  // frame then costs that frame, not every cue after it.
  const t0 = performance.now();
  function frame(now) {
    const at = now - t0;
    let want = 0;
    for (let i = 0; i < CUES.length; i++) if (at >= CUES[i]) want = i;
    if (want !== shown) {
      if (shown >= 0) document.getElementById("s" + shown).classList.remove("on");
      // Restart the stagger animations by reflowing the incoming scene.
      const el = document.getElementById("s" + want);
      el.querySelectorAll(".reveal").forEach((n) => { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
      el.classList.add("on");
      shown = want;
    }
    bar.style.width = Math.min(100, (at / TOTAL) * 100) + "%";
    if (at < TOTAL + 400) requestAnimationFrame(frame);
    else window.__done = true;
  }
  requestAnimationFrame(frame);
</script>
</body></html>`;
}

async function main() {
  const preview = process.argv.includes("--preview");

  // Work out the timeline, raising any hold that cannot be read in time.
  let at = 0;
  let raised = 0;
  const timeline = SCENES.map((scene) => {
    const floor = minimumHold(scene);
    const hold = Math.max(scene.hold, floor);
    if (hold > scene.hold + 0.05) raised += 1;
    const entry = { scene, startMs: Math.round(at * 1000), holdS: hold };
    at += hold;
    return entry;
  });
  const totalMs = Math.round(at * 1000);

  const mins = Math.floor(at / 60);
  const secs = Math.round(at % 60);
  console.log(`${SCENES.length} scenes, ${mins}m ${String(secs).padStart(2, "0")}s.`);
  if (raised > 0) console.log(`${raised} scene(s) held longer than specified so the text can be read.`);

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const html = buildHtml(timeline, totalMs);
  writeFileSync(join(OUT, "film.html"), html, "utf8");

  const browser = await chromium.launch({ executablePath: CHROME, args: ["--force-color-profile=srgb"] });

  if (preview) {
    // One still per scene, for checking wording and layout without
    // sitting through the film.
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    for (const [i, entry] of timeline.entries()) {
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="stage">
         <section class="scene on" style="opacity:1">${sceneBody(entry.scene)}</section>
         <div id="brand">AFD India CRM</div></div></body></html>`,
      );
      // Wait for the slowest staggered element, or the still catches a
      // half-drawn list — which is exactly how the fourteen-stage grid
      // first appeared with six rows missing.
      const revealed = await page.locator(".reveal").count();
      await page.waitForTimeout(Math.round((0.12 + revealed * 0.11 + 0.62) * 1000) + 250);
      await page.screenshot({ path: join(OUT, `scene-${String(i + 1).padStart(2, "0")}-${entry.scene.type}.png`) });
    }
    await browser.close();
    console.log(`Wrote ${timeline.length} stills to docs/video/out/`);
    return;
  }

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await context.newPage();

  console.log("Recording in real time — this takes as long as the film does.");
  await page.setContent(html);

  const started = Date.now();
  let lastLogged = -1;
  while (Date.now() - started < totalMs + 1200) {
    await page.waitForTimeout(1000);
    const done = Math.floor((Date.now() - started) / 1000);
    if (done % 30 === 0 && done !== lastLogged) {
      lastLogged = done;
      console.log(`  ${done}s / ${Math.round(totalMs / 1000)}s`);
    }
  }

  await context.close();
  await browser.close();

  // Playwright names the file after the page; give it the name somebody
  // would actually send to their staff.
  const produced = readdirSync(OUT).find((f) => f.endsWith(".webm"));
  const final = join(OUT, "afd-crm-walkthrough.webm");
  if (produced) renameSync(join(OUT, produced), final);
  console.log(`\nWrote docs/video/out/afd-crm-walkthrough.webm`);
}

await main();
