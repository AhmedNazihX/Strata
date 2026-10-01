/**
 * Scene to SVG.
 *
 * Arrowheads are drawn as ordinary paths rather than markers so they inherit
 * the link's state through CSS like everything else, and so an exported SVG
 * carries no marker references that a consumer might not resolve.
 */

import { BOX_PAD_X } from '../layout/boxes.mjs';
import { ACCENT_RAMP, GEO, TYPE } from './tokens.mjs';

const HEAD_LENGTH = 9;
const HEAD_HALF_WIDTH = 4.4;
const PULSE_RADIUS = 3.4;
/* One spark per straight run, all of them moving at once. A single dot walking
   the whole route leaves most of it empty most of the time; a dot on every leg
   lights the entire path at once, which is what makes it read as flow. */
const SEGMENT_SECONDS = 1.6;
const SEGMENT_MAX_SPEED = 450; // px per SEGMENT_SECONDS before the dot is slowed
const RAIL_LABEL_INSET = 14;
/* Corner radii are attributes, never CSS. WebKit does not implement rx/ry as
   CSS properties, so a radius set in the stylesheet silently squares off every
   box in Safari while looking right in Chrome. */
const RAIL_CORNER = 16;
const PILL_CORNER = 7;

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const round = (v) => Math.round(v * 10) / 10;

export function renderSvg(scene) {
  const { frame } = scene;
  const parts = [
    `<svg class="tl-stage" width="${frame.width}" height="${frame.height}"`,
    ` viewBox="0 0 ${frame.width} ${frame.height}" xmlns="http://www.w3.org/2000/svg"`,
    ` role="img" aria-label="${escapeXml(scene.meta.title)}">`,
    defs(),
    `<g class="layer-rails">${scene.layers.map(rail).join('')}</g>`,
    `<g class="layer-marks">${scene.marks.map(mark).filter(Boolean).join('')}</g>`,
    `<g class="layer-links">${scene.links.map(link).join('')}</g>`,
    `<g class="layer-nodes">${scene.nodes.map(node).join('')}</g>`,
    '</svg>',
  ];
  return parts.join('');
}

function accentVar(accent) {
  return `--layer:var(--a-${accent})`;
}

/**
 * One drop-shadow filter per accent.
 *
 * It has to be an SVG filter rather than a CSS one, because WebKit will not
 * paint `filter: drop-shadow()` on an SVG element — and it has to be one filter
 * per accent rather than `flood-color: currentColor`, which WebKit also ignores.
 * The flood colour itself comes from a custom property, so the glow follows the
 * theme.
 */
function defs() {
  const filters = ACCENT_RAMP.map((name) =>
    `<filter id="g-${name}" x="-75%" y="-75%" width="250%" height="250%">`
    + '<feDropShadow dx="0" dy="3" stdDeviation="7" flood-opacity="0.85"/>'
    + '</filter>').join('');
  return `<defs>${filters}</defs>`;
}

function rail(band) {
  const box = `<rect class="rail" x="${round(band.x)}" y="${round(band.y)}"`
    + ` width="${round(band.w)}" height="${round(band.h)}" rx="${RAIL_CORNER}"/>`;

  // A vertical column band has no left gutter to label in; its caption is a
  // band-label mark the layout places above the column instead.
  if (!Number.isFinite(band.labelX)) {
    return `<g class="rail-group" style="${accentVar(band.accent)}">${box}</g>`;
  }

  const noteLines = splitNote(band.note);
  const textTop = band.y + band.h / 2 - (noteLines.length ? 8 : 0);
  const notes = noteLines.map((line, i) =>
    `<text class="rail-note" x="${round(band.labelX)}" y="${round(textTop + 16 + i * 12)}">${escapeXml(line)}</text>`).join('');
  return [
    `<g class="rail-group" style="${accentVar(band.accent)}">`,
    box,
    `<text class="rail-name" x="${round(band.labelX)}" y="${round(textTop + 4)}">${escapeXml(band.name)}</text>`,
    notes,
    '</g>',
  ].join('');
}

function splitNote(note) {
  if (!note) return [];
  const words = String(note).split(/\s+/);
  const lines = [''];
  const limit = GEO.gutter - RAIL_LABEL_INSET - 20;
  for (const word of words) {
    const candidate = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
    if (candidate.length * (TYPE.railNote * 0.5) <= limit || !lines[lines.length - 1]) {
      lines[lines.length - 1] = candidate;
    } else if (lines.length < 2) {
      lines.push(word);
    }
  }
  return lines.filter(Boolean);
}

function node(n) {
  const labelX = round(n.x + BOX_PAD_X);
  const texts = [];
  n.fit.labelLines.forEach((line, i) => {
    texts.push(`<text class="node-label" x="${labelX}" y="${round(n.baselines[i])}" font-size="${n.fit.labelSize}">${escapeXml(line)}</text>`);
  });
  n.fit.subLines.forEach((line, i) => {
    const y = n.baselines[n.fit.labelLines.length + i];
    texts.push(`<text class="node-sub" x="${labelX}" y="${round(y)}" font-size="${n.fit.subSize}">${escapeXml(line)}</text>`);
  });
  if (n.tag) {
    texts.push(`<text class="node-tag" x="${round(n.x + n.w - BOX_PAD_X)}" y="${round(n.y + 14)}" text-anchor="end">${escapeXml(n.tag)}</text>`);
  }

  const detail = n.detail || (n.sources || []).length;
  return [
    `<g class="node${detail ? ' has-detail' : ''}" data-node="${escapeXml(n.id)}"`,
    ` data-kind="${escapeXml(n.kind)}" style="${accentVar(n.accent)}"`,
    detail ? ' tabindex="0" role="button"' : '',
    ` aria-label="${escapeXml(n.label)}${n.sublabel ? `, ${escapeXml(n.sublabel)}` : ''}">`,
    `<rect class="node-box" x="${round(n.x)}" y="${round(n.y)}"`
      + ` width="${round(n.w)}" height="${round(n.h)}" rx="${GEO.corner}"/>`,
    `<rect class="node-ring" x="${round(n.x)}" y="${round(n.y)}"`
      + ` width="${round(n.w)}" height="${round(n.h)}" rx="${GEO.corner}"`
      + ` filter="url(#g-${escapeXml(n.accent)})"/>`,
    texts.join(''),
    '</g>',
  ].join('');
}

function link(l) {
  const head = arrowHead(l.points);
  const label = l.labelAt
    ? `<text class="link-label" x="${round(l.labelAt.x)}" y="${round(l.labelAt.y + TYPE.linkLabel)}" text-anchor="${l.labelAt.anchor}">${escapeXml(l.label)}</text>`
    : '';

  return [
    `<g class="link" data-link="${escapeXml(l.id)}" style="${accentVar(l.accent)}">`,
    `<path class="link-halo" d="${l.d}"/>`,
    `<path class="link-line v-${escapeXml(l.variant)}" d="${l.d}"/>`,
    head,
    sparks(l.points),
    label,
    '</g>',
  ].join('');
}

/** A spark per straight run, every one of them starting together. */
function sparks(points) {
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 8) continue;
    const seconds = Math.max(SEGMENT_SECONDS, length / SEGMENT_MAX_SPEED * SEGMENT_SECONDS);
    out.push(`<circle class="pulse" r="${PULSE_RADIUS}" style="offset-path:path('`
      + `M ${round(ax)} ${round(ay)} L ${round(bx)} ${round(by)}');`
      + `animation-duration:${round(seconds)}s"/>`);
  }
  return out.join('');
}

function arrowHead(points) {
  if (points.length < 2) return '';
  const [tipX, tipY] = points[points.length - 1];
  const [prevX, prevY] = points[points.length - 2];
  const dx = tipX - prevX;
  const dy = tipY - prevY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const baseX = tipX - ux * HEAD_LENGTH;
  const baseY = tipY - uy * HEAD_LENGTH;
  const d = [
    `M ${round(tipX)} ${round(tipY)}`,
    `L ${round(baseX - uy * HEAD_HALF_WIDTH)} ${round(baseY + ux * HEAD_HALF_WIDTH)}`,
    `L ${round(baseX + uy * HEAD_HALF_WIDTH)} ${round(baseY - ux * HEAD_HALF_WIDTH)}`,
    'Z',
  ].join(' ');
  return `<path class="link-head" d="${d}"/>`;
}

function mark(m) {
  const style = m.accent ? ` style="${accentVar(m.accent)}"` : '';
  switch (m.type) {
    case 'lifeline':
      return `<line class="mark-lifeline" x1="${round(m.x)}" y1="${round(m.y1)}" x2="${round(m.x)}" y2="${round(m.y2)}"${style}/>`;
    case 'divider':
      return `<line class="mark-divider" x1="${round(m.x1)}" y1="${round(m.y)}" x2="${round(m.x2)}" y2="${round(m.y)}"/>`;
    case 'ring':
      return `<ellipse class="mark-ring${m.style === 'dashed' ? ' dashed' : ''}" cx="${round(m.cx)}" cy="${round(m.cy)}" rx="${round(m.rx)}" ry="${round(m.ry)}"${style}/>`;
    case 'bracket':
      return `<rect class="mark-bracket" x="${round(m.x)}" y="${round(m.y)}" width="${round(m.w)}" height="${round(m.h)}" rx="10"${style}/>`
        + (m.label ? `<text class="mark-band-note" x="${round(m.x + m.w / 2)}" y="${round(m.y - 6)}">${escapeXml(m.label)}</text>` : '');
    case 'band-label': {
      const cx = round(m.x + m.w / 2);
      const note = m.note ? `<text class="mark-band-note" x="${cx}" y="${round(m.y + 17)}">${escapeXml(m.note)}</text>` : '';
      return `<g${style}><text class="mark-band-name" x="${cx}" y="${round(m.y)}">${escapeXml(m.text)}</text>${note}</g>`;
    }
    case 'pill': {
      const w = Math.max(28, String(m.text).length * 6 + 14);
      return `<g${style}><rect class="mark-pill-box" x="${round(m.x - w / 2)}" y="${round(m.y - 9)}" width="${round(w)}" height="18" rx="${PILL_CORNER}"/>`
        + `<text class="mark-pill-text" x="${round(m.x)}" y="${round(m.y + 3.5)}">${escapeXml(m.text)}</text></g>`;
    }
    default:
      return '';
  }
}
