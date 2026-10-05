# The launch walkthrough video

A silent, seven-and-a-half-minute training film for staff, built from
text files in this folder and rendered to a real video by a browser.

```
docs/video/
  scenes.mjs    the content — every word on screen, scene by scene
  render.mjs    turns the scenes into a video (and into stills)
  script.mjs    turns the scenes into script.md
  script.md     the timed shot list — generated, do not edit
  out/          the rendered film — not committed
```

`out/` is in `.gitignore`. The film is 26 MB and is rebuilt from the
files beside it in one command, so the repository carries the script
rather than the print.

## Making it

```
npm run video          # the film  → docs/video/out/afd-crm-walkthrough.webm
npm run video:stills   # one PNG per scene, for checking wording
npm run video:script   # regenerate script.md
```

`npm run video` **records in real time** — a seven-and-a-half-minute
film takes seven and a half minutes to render, because it is a screen
recording of a page playing itself. It prints progress every thirty
seconds.

## What it is, and what it is not

**It is motion graphics**: typography, diagrams and the system's real
vocabulary. Every stage name, role, queue bucket, button label and rule
in it was read out of the codebase.

**It contains no footage of the application and no screenshots.** That
is deliberate. The only real data in this system is students' names and
fee records, and a mocked-up interface in a training video teaches
people a product that does not exist. The diagrams are plainly diagrams.

**It is silent.** The video encoder available here has no audio codecs
at all, so there is no soundtrack and no narration. The film is written
to be read: `script.md` is the word-for-word text if a voiceover is ever
recorded over it.

## Format

| | |
|---|---|
| Resolution | 1920 × 1080 |
| Format | WebM, VP8 |
| Audio | none |
| Length | 7m 26s |
| Size | 26 MB |

WebM plays in every modern browser, in VLC, and uploads to YouTube,
Drive and WhatsApp Web directly. If you need `.mp4` — for example to
AirDrop it, or for an older projector — convert it once with any
converter, or on a machine with full ffmpeg installed:

```
ffmpeg -i afd-crm-walkthrough.webm -c:v libx264 -crf 20 -pix_fmt yuv420p afd-crm-walkthrough.mp4
```

(The ffmpeg bundled with the browser here cannot do that: it is built
with VP8 and nothing else.)

## Changing it

Edit `scenes.mjs`. Each scene is an object with a `type`, a `hold` in
seconds, and its text. The scene types available are listed in
`render.mjs` — title, chapter, statement, rule, warning, steps,
definitions, contrast, and the named diagrams (pipeline, gates, sidebar,
badges, buckets, stages, roles, channels, masked, help).

Then:

```
npm run video:stills   # check the wording and the layout
npm run video          # render the film
npm run video:script   # keep the shot list in step
```

### Timing takes care of itself

You do not have to work out how long a scene needs. `hold` is a floor,
and the renderer raises it when the words on screen cannot be read that
fast — 215 words a minute for prose, 330 for a list that is scanned
rather than read.

That means **adding a sentence lengthens the film rather than making it
unreadable**, which is the right way round for a training video nobody
can pause and rewind in a meeting.

### Keep it true

The same rule as the manual: everything on screen must be true of the
system as built. The lists in `render.mjs` — the sidebar entries, the
fourteen stages, the six roles, the five badges — are copies of what the
code does. If a stage is renamed or a role changes, change them here and
re-render, or the film starts teaching something that is no longer so.

## Where it came from

Written alongside `docs/manual/`, from the same reading of the codebase.
The film is the ten-minute version; the manual is the one you look things
up in. Chapter 19 of the manual explains how to keep that in step.
