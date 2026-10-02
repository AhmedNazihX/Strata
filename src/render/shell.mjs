/**
 * The HTML document.
 *
 * Everything is inlined — stylesheet, scripts, data — so the file works from a
 * disk, an email attachment or a USB stick with no build step and no server.
 * The one network reference is the web-font stylesheet; the page is designed to
 * read correctly in its fallback stack when that cannot load.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONTS, THEMES } from './tokens.mjs';
import { stylesheet } from './css.mjs';
import { escapeXml, renderSvg } from './svg.mjs';
import { collectSnippets } from './snippets.mjs';

const CLIENT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'client');
const CLIENT_FILES = ['core.js', 'detail.js', 'export.js'];

/** Caption geometry, stated once here and used by both the DOM and the export. */
export const CAPTION_LAYOUT = {
  padX: 30, padY: 26, leftW: 540, gap: 32, chipGap: 10, ledeLines: 5,
};

export function renderHtml(scene, options = {}) {
  const { frame, meta } = scene;
  const data = viewerData(scene, options);

  return `<!doctype html>
<html lang="en" data-theme="${escapeXml(meta.theme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(meta.title)}</title>
<meta name="generator" content="strata">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS.href}">
<style id="tl-css">${stylesheet()}</style>
</head>
<body>
<main class="tl-page" style="width:${frame.width}px;height:${frame.height}px">
  ${toolbar()}
  ${header(scene)}
  ${renderSvg(scene)}
  ${legend(scene)}
  ${caption(scene)}
  ${detailPanel()}
</main>
<script id="tl-data" type="application/json">${jsonForHtml(data)}</script>
<script>${clientScript()}</script>
</body>
</html>`;
}

function toolbar() {
  return `<div class="tl-toolbar">
    <button class="btn" id="tl-motion" type="button" title="Turn the animation on or off (M)">Motion</button>
    <button class="btn" id="tl-theme" type="button" title="Switch theme (T)">Light</button>
    <button class="btn" id="tl-copy" type="button" title="Copy the diagram to the clipboard as PNG">Copy</button>
    <button class="btn" id="tl-png" type="button" title="Download a 2x PNG">PNG</button>
    <button class="btn" id="tl-svg" type="button" title="Download the vector">SVG</button>
  </div>`;
}

function header(scene) {
  const { frame, meta, steps } = scene;
  const narrated = steps.length > 1;
  const repo = meta.repository;
  const right = narrated
    ? `<div class="tl-counter" id="tl-counter">01 / ${pad(steps.length)}</div>`
    : '';
  const provenance = repo && repo.url
    ? `<div class="tl-meta">${escapeXml(repo.url)}${repo.ref ? ` @ ${escapeXml(repo.ref)}` : ''}</div>`
    : '';

  return `<header style="position:absolute;left:${frame.header.x}px;top:${frame.header.y}px;width:${frame.header.w}px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px">
    <div>
      <h1 class="tl-title">${escapeXml(meta.title)}</h1>
      ${meta.subtitle ? `<p class="tl-subtitle">${escapeXml(meta.subtitle)}</p>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;margin-top:24px">${right}${provenance}</div>
  </header>
  ${narrated ? `<div class="tl-progress" style="position:absolute;left:0;top:0;width:${frame.width}px;border-radius:0"><i id="tl-progress-fill" style="width:${Math.round(100 / scene.steps.length)}%"></i></div>` : ''}`;
}

function legend(scene) {
  if (!scene.legend.length) return '';
  const { frame } = scene;
  const y = frame.caption ? frame.caption.y - 26 : frame.height - 34;
  const items = scene.legend.map((entry) =>
    `<span class="tl-legend-item" style="--layer:var(--a-${entry.accent})">`
    + `<i class="${entry.shape === 'pill' ? 'pill' : 'box'}"></i>`
    + `<b>${escapeXml(entry.label)}</b>`
    + `${entry.note ? ` — ${escapeXml(entry.note)}` : ''}</span>`).join('');
  return `<div class="tl-legend" style="position:absolute;left:${frame.margin + 14}px;top:${y}px;width:${frame.width - (frame.margin + 14) * 2}px">${items}</div>`;
}

function caption(scene) {
  const box = scene.frame.caption;
  if (!box || scene.steps.length < 2) return '';
  const dots = scene.steps.map((step, i) =>
    `<button class="dot" type="button" aria-current="${i === 0}" aria-label="Step ${i + 1}: ${escapeXml(step.title)}"><i></i></button>`).join('');

  return `<section class="tl-caption" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px">
    <div class="tl-cap-grid">
      <div class="tl-cap-left" style="width:${CAPTION_LAYOUT.leftW}px">
        <div class="tl-step-no" id="tl-step-no">STEP 01</div>
        <h2 class="tl-cap-title" id="tl-cap-title">${escapeXml(scene.steps[0].title)}</h2>
        <p class="tl-cap-lede" id="tl-cap-lede">${escapeXml(scene.steps[0].lede)}</p>
      </div>
      <div class="tl-chips" id="tl-chips"></div>
    </div>
    <div class="tl-controls">
      <button class="btn" id="tl-prev" type="button" aria-label="Previous step">&#8592;</button>
      <button class="btn key" id="tl-play" type="button" aria-pressed="true">Pause</button>
      <button class="btn" id="tl-next" type="button" aria-label="Next step">&#8594;</button>
      <div class="tl-dots">${dots}</div>
    </div>
  </section>`;
}

function detailPanel() {
  return `<aside class="tl-detail" id="tl-detail" data-open="false" role="dialog" aria-label="Component detail">
    <button class="close" type="button" aria-label="Close">&#215;</button>
    <div class="tl-detail-body"></div>
  </aside>`;
}

function viewerData(scene, options = {}) {
  const nodes = {};
  for (const node of scene.nodes) {
    if (!node.detail && !(node.sources || []).length && !node.sublabel) continue;
    nodes[node.id] = {
      label: node.label,
      sublabel: node.sublabel || '',
      detail: node.detail || '',
      sources: node.sources || [],
    };
  }

  const { snippets } = collectSnippets({ nodes: scene.nodes }, options.repoRoot);

  return {
    snippets,
    meta: {
      title: scene.meta.title,
      subtitle: scene.meta.subtitle || '',
      theme: scene.meta.theme,
      motion: scene.meta.motion,
      autoplay: scene.meta.autoplay,
      stepSeconds: scene.meta.stepSeconds,
      width: scene.frame.width,
      height: scene.frame.height,
    },
    frame: { header: scene.frame.header, caption: scene.frame.caption },
    capLayout: CAPTION_LAYOUT,
    cssVarNames: cssVarNames(),
    fontHref: FONTS.href,
    steps: scene.steps.map((step) => ({
      title: step.title,
      lede: step.lede,
      notes: step.notes || [],
      nodes: (step.nodes || []).includes('*') ? scene.nodes.map((n) => n.id) : (step.nodes || []),
      links: step.links || [],
    })),
    nodes,
  };
}

function cssVarNames() {
  const base = [
    '--bg', '--bg-deep', '--panel', '--panel-solid', '--rail', '--stroke', '--stroke-strong',
    '--display', '--text', '--muted', '--dim', '--idle', '--idle-fill', '--flow', '--flow-bright', '--cite',
    '--font-display', '--font-body', '--font-mono',
  ];
  return base.concat(Object.keys(THEMES.dark.accent).map((name) => `--a-${name}`));
}

function clientScript() {
  return CLIENT_FILES
    .map((file) => readFileSync(join(CLIENT_DIR, file), 'utf8'))
    .join('\n');
}

/** JSON is safe inside a script element only once `<` cannot close it. */
function jsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function pad(n) {
  return n < 10 ? `0${n}` : String(n);
}
