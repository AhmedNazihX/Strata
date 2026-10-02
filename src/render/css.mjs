/**
 * The rendered page's stylesheet.
 *
 * Two rules decide most of what this file does. Colour is never written into
 * markup — every fill and stroke reads a custom property, so one attribute on
 * <html> repaints the whole diagram. And anything that moves is driven by a
 * class, not by script, so pausing is one `animation-play-state` and an export
 * is a still frame of whatever is on screen.
 */

import { FONTS, GEO, TYPE, cssVars } from './tokens.mjs';

export function stylesheet() {
  return `
:root { ${cssVars('dark')}; color-scheme: dark; }
:root[data-theme="light"] { ${cssVars('light')}; color-scheme: light; }

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg-deep); }
body {
  font-family: ${FONTS.body};
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
}
a { color: var(--flow); }
a:hover { color: var(--flow-bright); }
:focus-visible { outline: 2px solid var(--flow); outline-offset: 2px; border-radius: 6px; }

.tl-page {
  position: relative;
  background: var(--bg);
  overflow: hidden;
  transform-origin: center center;
  /* body is a flex row: without this a canvas wider than the window shrinks to it
     before the fit scale runs, and the header and caption spill past the page. */
  flex-shrink: 0;
}
.tl-page.is-fit { box-shadow: 0 30px 90px -40px rgba(0,0,0,.6); }

/* ---------- header ---------- */
.tl-title {
  margin: 0;
  font-family: ${FONTS.display};
  font-size: ${TYPE.h1}px;
  font-weight: 600;
  letter-spacing: -.3px;
  color: var(--display);
}
.tl-subtitle { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); }
.tl-meta { font-family: ${FONTS.mono}; font-size: ${TYPE.meta}px; color: var(--dim); text-align: right; }
.tl-counter { font-family: ${FONTS.mono}; font-size: 12px; letter-spacing: 1px; color: var(--flow); }
.tl-progress { height: 2px; border-radius: 2px; background: var(--stroke); overflow: hidden; }
.tl-progress > i { display: block; height: 2px; background: var(--flow); transition: width .55s ease; }

/* ---------- diagram ---------- */
.tl-stage { display: block; }

.rail { fill: var(--rail); stroke: var(--stroke); stroke-width: 1; }
.rail-name {
  font-family: ${FONTS.mono}; font-size: ${TYPE.railName}px; font-weight: 500;
  letter-spacing: 1.4px; fill: var(--layer);
}
.rail-note { font-size: ${TYPE.railNote}px; fill: var(--dim); }

.node-box {
  fill: var(--idle-fill); stroke: var(--idle); stroke-width: 1;
  transition: fill .5s ease, stroke .5s ease, opacity .5s ease;
}
.node-label { font-family: ${FONTS.mono}; font-weight: 500; fill: var(--text); }
.node-sub { fill: var(--dim); }
.node-tag {
  font-family: ${FONTS.mono}; font-size: 8.5px; letter-spacing: .6px;
  fill: var(--dim); text-transform: uppercase;
}
.node { opacity: .44; transition: opacity .5s ease; cursor: default; }
.node.has-detail { cursor: pointer; }
.node.on { opacity: 1; }
.node.on .node-box {
  fill: color-mix(in srgb, var(--layer) 14%, transparent);
  stroke: transparent;
}
.node.on .node-sub { fill: var(--layer); }

/* The ring is the border and the glow at once: a crisp accent outline that the
   filter blooms outward. It thickens and thins rather than fading, which is
   what makes an active node look lit rather than merely coloured. */
.node-ring {
  fill: none; stroke: var(--layer); stroke-width: 1.4;
  opacity: 0; transition: opacity .5s ease;
}
.node.on .node-ring { opacity: 1; }
.motion .node.on .node-ring { animation: tl-ring 3.4s ease-in-out infinite; }
@keyframes tl-ring {
  0%, 100% { stroke-width: 1.2; }
  50%      { stroke-width: 2.4; }
}

#g-blue feDropShadow { flood-color: var(--a-blue); }
#g-teal feDropShadow { flood-color: var(--a-teal); }
#g-amber feDropShadow { flood-color: var(--a-amber); }
#g-violet feDropShadow { flood-color: var(--a-violet); }
#g-green feDropShadow { flood-color: var(--a-green); }
#g-rose feDropShadow { flood-color: var(--a-rose); }
#g-gold feDropShadow { flood-color: var(--a-gold); }
#g-cyan feDropShadow { flood-color: var(--a-cyan); }

.link-line {
  fill: none; stroke: var(--stroke-strong); stroke-width: 1.6; stroke-linecap: round;
  transition: stroke .5s ease, stroke-width .5s ease;
}
.link.on .link-line { stroke: var(--flow); stroke-width: 2; stroke-opacity: .62; }
.link-halo {
  fill: none; stroke: var(--flow); stroke-width: 6; stroke-linecap: round;
  opacity: 0; transition: opacity .5s ease;
}
.link.on .link-halo { opacity: .10; }


.link-line.v-dashed, .link-line.v-async, .link-line.v-derived,
.link-line.v-retry, .link-line.v-timeout, .link-line.v-no { stroke-dasharray: 5 5; }
.link-line.v-security, .link-line.v-error, .link-line.v-failure { stroke-dasharray: 2 4; }
.link-line.v-emphasis, .link-line.v-yes { stroke-width: 2.4; }
.link-head { fill: var(--idle); transition: fill .5s ease; }
.link.on .link-head { fill: var(--flow); }
.link-label {
  font-size: ${TYPE.linkLabel}px; fill: var(--dim);
  transition: fill .5s ease; paint-order: stroke; stroke: var(--bg); stroke-width: 3px;
}
.link.on .link-label { fill: var(--flow-bright); }

.pulse {
  fill: var(--flow-bright); opacity: 0;
  stroke: var(--flow); stroke-width: 5; stroke-opacity: .25;
}
@supports (offset-path: path("M 0 0 L 1 1")) {
  .motion .link.on .pulse { opacity: 1; animation-name: tl-run; animation-timing-function: linear; animation-iteration-count: infinite; }
}
.link .pulse { transition: opacity .35s ease; }
@keyframes tl-run { from { offset-distance: 0%; } to { offset-distance: 100%; } }
/* Pause stops the walkthrough advancing; it does not freeze the diagram. A
   presenter who pauses to talk about a step still wants that step's flow
   moving in front of them. Motion is the control for motion. */

.mark-lifeline { stroke: var(--layer); stroke-width: 1.2; stroke-dasharray: 3 6; opacity: .45; }
.mark-divider { stroke: var(--stroke); stroke-width: 1; }
.mark-bracket { fill: none; stroke: var(--stroke-strong); stroke-width: 1.2; }
.mark-band-name {
  font-family: ${FONTS.mono}; font-size: ${TYPE.railName}px; font-weight: 500;
  letter-spacing: 1.2px; fill: var(--layer); text-anchor: middle;
}
.mark-band-note { font-size: ${TYPE.railNote}px; fill: var(--dim); text-anchor: middle; }
.mark-pill-box { fill: var(--panel-solid); stroke: var(--stroke); }
.mark-pill-text { font-family: ${FONTS.mono}; font-size: 9.5px; fill: var(--muted); text-anchor: middle; }

/* ---------- caption ---------- */
.tl-caption {
  border: 1px solid var(--stroke); border-radius: 18px; background: var(--panel);
  padding: 26px 30px; display: flex; flex-direction: column; gap: 16px;
}
.tl-cap-grid { display: flex; gap: 32px; flex-grow: 1; min-height: 0; }
.tl-cap-left { width: 540px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
.tl-step-no {
  font-family: ${FONTS.mono}; font-size: 10.5px; letter-spacing: 1.6px; color: var(--flow);
}
.tl-cap-title {
  margin: 0; font-family: ${FONTS.display}; font-size: ${TYPE.h2}px; font-weight: 600;
  letter-spacing: -.2px; color: var(--display);
}
.tl-cap-lede { margin: 0; font-size: ${TYPE.caption}px; line-height: 1.62; color: var(--muted); }
.tl-chips {
  flex-grow: 1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px; align-content: start; overflow: hidden;
}
.tl-chip {
  padding: 10px 13px; border: 1px solid var(--stroke); border-radius: 10px;
  background: var(--panel); display: flex; flex-direction: column; gap: 3px;
}
.tl-chip b { font-family: ${FONTS.mono}; font-size: ${TYPE.chipKey}px; font-weight: 500; color: var(--flow); }
.tl-chip span { font-size: ${TYPE.chipVal}px; line-height: 1.45; color: var(--muted); }

/* ---------- controls ---------- */
.tl-controls { display: flex; align-items: center; gap: 10px; }
.btn {
  font-family: ${FONTS.mono}; font-size: 11.5px; letter-spacing: .3px; color: var(--text);
  background: var(--panel); border: 1px solid var(--stroke-strong); border-radius: 9px;
  height: 34px; min-width: 46px; padding: 0 14px; cursor: pointer;
  transition: background-color .2s ease, border-color .2s ease;
}
.btn:hover { background: var(--idle-fill); border-color: var(--flow); }
.btn.key { color: var(--bg); background: var(--flow); border-color: var(--flow); font-weight: 500; }
.btn.key:hover { background: var(--flow-bright); border-color: var(--flow-bright); }
.tl-dots { display: flex; gap: 2px; margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }
.dot {
  width: 40px; height: 30px; padding: 0; background: none; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.dot > i { display: block; width: 24px; height: 3px; border-radius: 2px; background: var(--idle); transition: background-color .3s ease; }
.dot:hover > i { background: var(--stroke-strong); }
.dot[aria-current="true"] > i { background: var(--flow); }

/* ---------- node detail ---------- */
.tl-detail {
  position: absolute; max-width: 360px; padding: 14px 16px; border-radius: 12px;
  border: 1px solid var(--stroke-strong); background: var(--panel-solid);
  box-shadow: 0 18px 50px -24px rgba(0,0,0,.7); z-index: 20; display: none;
}
.tl-detail[data-open="true"] { display: block; }
.tl-detail h3 { margin: 0 0 6px; font-family: ${FONTS.mono}; font-size: 12.5px; font-weight: 500; color: var(--text); }
.tl-detail p { margin: 0 0 8px; font-size: 11.5px; line-height: 1.5; color: var(--muted); }
.tl-detail.wide { max-width: 660px; }

.tl-sources { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.tl-src {
  font-family: ${FONTS.mono}; font-size: 10.5px; text-align: left; width: 100%;
  color: var(--cite); background: color-mix(in srgb, var(--cite) 9%, transparent);
  border: 1px solid color-mix(in srgb, var(--cite) 28%, transparent);
  border-radius: 7px; padding: 6px 9px; cursor: pointer; word-break: break-all;
  transition: background-color .18s ease, border-color .18s ease;
}
.tl-src::before { content: "▸"; margin-right: 7px; opacity: .7; }
.tl-src[aria-expanded="true"]::before { content: "▾"; }
.tl-src:hover:not(:disabled) { background: color-mix(in srgb, var(--cite) 18%, transparent); border-color: var(--cite); }
.tl-src:disabled { color: var(--dim); background: none; border-color: var(--stroke); cursor: default; }
.tl-src:disabled::before { content: "·"; }

.tl-code {
  margin: 2px 0 4px; border: 1px solid var(--stroke); border-radius: 8px;
  background: var(--bg-deep); overflow: hidden;
}
.tl-code-head {
  font-family: ${FONTS.mono}; font-size: 9.5px; letter-spacing: .3px; color: var(--dim);
  padding: 7px 10px; border-bottom: 1px solid var(--stroke);
}
.tl-code pre {
  margin: 0; padding: 8px 0; max-height: 320px; overflow: auto;
  display: flex; flex-direction: column;
}
.tl-line { display: flex; gap: 10px; padding: 0 10px; white-space: pre; }
.tl-line i {
  font-family: ${FONTS.mono}; font-size: 9.5px; font-style: normal; color: var(--dim);
  min-width: 30px; text-align: right; user-select: none; opacity: .65; line-height: 1.65;
}
.tl-line code {
  font-family: ${FONTS.mono}; font-size: 10.5px; line-height: 1.65; color: var(--muted);
}
/* The claim and its evidence, side by side: the cited lines are the only thing
   in the panel wearing a colour, so the eye lands on them first. */
.tl-line.cited { background: color-mix(in srgb, var(--cite) 15%, transparent); box-shadow: inset 2px 0 0 var(--cite); }
.tl-line.cited code { color: var(--text); }
.tl-line.cited i { color: var(--cite); opacity: 1; }
.tl-code-note { font-size: 10px; color: var(--dim); padding: 6px 10px; border-top: 1px solid var(--stroke); }
.tl-detail .close {
  position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; line-height: 1;
  background: none; border: none; color: var(--dim); cursor: pointer; font-size: 15px;
}

/* ---------- legend ---------- */
.tl-legend { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }
.tl-legend-item { display: flex; align-items: center; gap: 7px; font-size: 10.5px; color: var(--muted); }
.tl-legend-item b { font-weight: 500; color: var(--text); }
/* The swatch is the node in miniature: same border, same fill, same corners, so
   "rounded ends mean an exit" is shown rather than asserted. */
.tl-legend-item i {
  display: block; height: 13px; border: 1px solid var(--layer);
  background: color-mix(in srgb, var(--layer) 16%, transparent);
}
.tl-legend-item i.box { width: 20px; border-radius: 4px; }
.tl-legend-item i.pill { width: 24px; border-radius: 999px; }

/* ---------- toolbar ---------- */
.tl-toolbar {
  position: absolute; top: 14px; right: 14px; display: flex; gap: 6px; z-index: 15;
  opacity: .25; transition: opacity .25s ease;
}
.tl-page:hover .tl-toolbar, .tl-toolbar:focus-within { opacity: 1; }
.tl-toolbar .btn { height: 28px; min-width: 32px; padding: 0 10px; font-size: 10.5px; }

@media print {
  body { display: block; background: #fff; }
  .tl-toolbar, .tl-controls { display: none; }
}
/* Motion is a single class the page decides on, so the system preference is
   honoured by default and a viewer can still turn it back on for one document.
   The static glow above means a reduced-motion reader loses the movement, not
   the signal. */
@media (prefers-reduced-motion: reduce) {
  :root:not([data-motion="on"]) * { transition-duration: .01ms !important; }
}
`.trim();
}
