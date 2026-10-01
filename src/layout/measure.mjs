/**
 * Text measurement without a browser.
 *
 * SVG does not wrap text, so every layout has to know how wide a string will be
 * before it places a box around it. These are calibrated approximations with a
 * deliberate bias to over-estimate: a box that comes out slightly roomy is a
 * cosmetic miss, a box that clips its own label is a defect. The browser gate
 * re-measures every string exactly and fails on real overflow.
 */

const NARROW = new Set(" .,:;'\"`!|()[]{}/\\-iljtfrI¡·");
const WIDE = new Set('mwABCDEFGHJKLNOPQRSTUVXYZ0123456789@#%&€$');
const EXTRA_WIDE = new Set('MW—…');

const SANS_FACTOR = { narrow: 0.31, normal: 0.545, wide: 0.66, extraWide: 0.9 };
const MONO_ADVANCE = 0.6;
const DISPLAY_SCALE = 1.06;
const WEIGHT_BUMP = 0.012; // per 100 units of weight above 400
const SAFETY = 1.03;

function bucket(ch) {
  if (EXTRA_WIDE.has(ch)) return 'extraWide';
  if (NARROW.has(ch)) return 'narrow';
  if (WIDE.has(ch)) return 'wide';
  return 'normal';
}

/**
 * @param {string} text
 * @param {{font?: 'body'|'mono'|'display', size?: number, weight?: number}} opts
 * @returns {number} width in px
 */
export function measureText(text, opts = {}) {
  const { font = 'body', size = 12, weight = 400 } = opts;
  if (!text) return 0;
  const chars = Array.from(String(text));
  let units = 0;
  if (font === 'mono') {
    units = chars.length * MONO_ADVANCE;
  } else {
    for (const ch of chars) units += SANS_FACTOR[bucket(ch)];
    if (font === 'display') units *= DISPLAY_SCALE;
  }
  const weightFactor = 1 + (Math.max(400, weight) - 400) / 100 * WEIGHT_BUMP;
  return units * size * weightFactor * SAFETY;
}

/**
 * Greedy word wrap. Returns at most `maxLines` lines; the last one is
 * ellipsised when the text does not fit, so a caller can detect truncation by
 * comparing the joined result against the input.
 */
export function wrapText(text, maxWidth, opts = {}) {
  const { maxLines = 2 } = opts;
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(candidate, opts) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;

  const rendered = lines.join(' ');
  if (rendered !== words.join(' ') && lines.length) {
    lines[lines.length - 1] = ellipsise(lines[lines.length - 1], maxWidth, opts);
  }
  return lines;
}

/** Trim a single line until it fits, appending an ellipsis. */
export function ellipsise(text, maxWidth, opts = {}) {
  if (measureText(text, opts) <= maxWidth) return text;
  const chars = Array.from(String(text));
  while (chars.length > 1) {
    chars.pop();
    const candidate = `${chars.join('').replace(/[\s,;:.-]+$/, '')}…`;
    if (measureText(candidate, opts) <= maxWidth) return candidate;
  }
  return '…';
}

/** True when the string needs more room than it has. */
export function overflows(text, maxWidth, opts = {}) {
  return measureText(text, opts) > maxWidth;
}

/** Width of the widest string in a list. */
export function widestOf(texts, opts = {}) {
  return texts.reduce((max, t) => Math.max(max, measureText(t, opts)), 0);
}
