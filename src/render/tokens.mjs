/**
 * The Strata style language.
 *
 * One ink-dark ground, a warm signal colour for anything in motion, and a fixed
 * ramp of layer accents. Every value is emitted as a CSS custom property so a
 * rendered diagram can switch themes without re-rendering.
 */

/** Accents are assigned to layers in declaration order, then they wrap. */
export const ACCENT_RAMP = ['blue', 'teal', 'amber', 'violet', 'green', 'rose', 'gold', 'cyan'];

const DARK = {
  bg: '#0D1016',
  bgDeep: '#090B10',
  panel: 'rgba(255,255,255,0.030)',
  panelSolid: '#141922',
  rail: 'rgba(255,255,255,0.022)',
  stroke: 'rgba(255,255,255,0.075)',
  strokeStrong: 'rgba(255,255,255,0.16)',
  display: '#F5F2EB',
  text: '#ECEFF4',
  muted: '#9BA5B2',
  dim: '#7D8794',
  idle: 'rgba(255,255,255,0.085)',
  idleFill: 'rgba(255,255,255,0.028)',
  flow: '#FFB765',
  flowBright: '#FFD9A8',
  cite: '#6FD99A',
  accent: {
    blue: '#7FB3FF', teal: '#5AD3C4', amber: '#F5A96B', violet: '#B49BFF',
    green: '#86D98C', rose: '#E8A0B8', gold: '#FFD166', cyan: '#8FD3E8',
  },
};

const LIGHT = {
  bg: '#FAF9F5',
  bgDeep: '#F2F0E9',
  panel: 'rgba(20,20,19,0.030)',
  panelSolid: '#FFFFFF',
  rail: 'rgba(20,20,19,0.028)',
  stroke: 'rgba(20,20,19,0.10)',
  strokeStrong: 'rgba(20,20,19,0.22)',
  display: '#141413',
  text: '#1C2027',
  muted: '#4D5763',
  dim: '#5F6975',
  idle: 'rgba(20,20,19,0.14)',
  idleFill: 'rgba(20,20,19,0.035)',
  flow: '#B45309',
  flowBright: '#8A3D06',
  cite: '#15803D',
  accent: {
    blue: '#1D5FD4', teal: '#07766A', amber: '#9A4F0C', violet: '#5B3DC4',
    green: '#1F7A33', rose: '#A83A61', gold: '#8A6100', cyan: '#116B86',
  },
};

export const THEMES = { dark: DARK, light: LIGHT };

export const FONTS = {
  display: "'Fraunces', Georgia, 'Times New Roman', serif",
  body: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  href:
    'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600' +
    '&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap',
};

/** Type scale, in px. Layout and the text measurer both read these. */
export const TYPE = {
  h1: 29,
  h2: 25,
  nodeLabel: 13,
  nodeLabelSm: 11,
  nodeSub: 10.5,
  nodeSubSm: 9,
  linkLabel: 10.5,
  railName: 11,
  railNote: 9.5,
  caption: 13,
  chipKey: 11.5,
  chipVal: 11,
  meta: 10.5,
};

/** Geometry constants shared by every layout engine. */
export const GEO = {
  pageW: 1600,
  pageH: 900,
  margin: 16,
  gutter: 194,      // left label column, where a layout uses rails
  headerH: 96,
  captionH: 318,
  railGap: 24,
  nodeGap: 20,
  linkGap: 6,       // clearance a routed link keeps from any node box
  corner: 12,
  pulseSpeed: 1.7,  // seconds for one pulse to traverse a link
};

/**
 * Colour by meaning when there is no layer to colour by.
 *
 * Where a document has layers, an accent says which tier a node is in. Where it
 * has none — a lifecycle, a workflow without lanes — falling back to the ramp
 * colours nodes by declaration order, which encodes nothing and reads as noise.
 * These map the one distinction that does carry meaning in those dialects.
 */
export const KIND_ACCENTS = {
  lifecycle: {
    initial: 'blue', active: 'teal', waiting: 'gold', terminal: 'green', error: 'rose',
  },
  workflow: {
    start: 'blue', action: 'teal', gate: 'gold', parallel: 'violet', wait: 'cyan', end: 'green',
  },
};

export function kindAccent(type, kind) {
  return (KIND_ACCENTS[type] || {})[kind] || null;
}

/** Resolve a layer accent name to the ramp, tolerating an explicit choice. */
export function accentFor(index, explicit) {
  if (explicit && ACCENT_RAMP.includes(explicit)) return explicit;
  return ACCENT_RAMP[index % ACCENT_RAMP.length];
}

/** The `:root` custom-property block for one theme. */
export function cssVars(themeName) {
  const t = THEMES[themeName];
  const lines = [
    `--bg:${t.bg}`, `--bg-deep:${t.bgDeep}`, `--panel:${t.panel}`,
    `--panel-solid:${t.panelSolid}`, `--rail:${t.rail}`, `--stroke:${t.stroke}`,
    `--stroke-strong:${t.strokeStrong}`, `--display:${t.display}`, `--text:${t.text}`,
    `--muted:${t.muted}`, `--dim:${t.dim}`, `--idle:${t.idle}`, `--idle-fill:${t.idleFill}`,
    `--flow:${t.flow}`, `--flow-bright:${t.flowBright}`, `--cite:${t.cite}`,
    `--font-display:${FONTS.display}`, `--font-body:${FONTS.body}`, `--font-mono:${FONTS.mono}`,
  ];
  for (const [name, hex] of Object.entries(t.accent)) lines.push(`--a-${name}:${hex}`);
  return lines.join(';');
}
