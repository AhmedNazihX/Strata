/**
 * Extra primitives a layout engine can ask the renderer to draw.
 *
 * The renderer understands exactly these shapes and nothing else, so a layout
 * cannot invent geometry the exporter, the theme switcher or the geometry
 * checker would not know about.
 */

/** A vertical participant lifeline, dashed, behind everything. */
export const lifeline = (x, y1, y2, accent) => ({ type: 'lifeline', x, y1, y2, accent });

/** A horizontal rule with an optional label sitting on it. */
export const divider = (x1, y, x2, label = '') => ({ type: 'divider', x1, y, x2, label });

/** A caption above a column, used for sequence participants and dataflow stages. */
export const bandLabel = (x, y, w, text, note, accent) =>
  ({ type: 'band-label', x, y, w, text, note, accent });

/** A ring around a node: entry and exit states wear one. */
export const ring = (cx, cy, rx, ry, accent, style = 'solid') =>
  ({ type: 'ring', cx, cy, rx, ry, accent, style });

/** A labelled bracket grouping a run of nodes, for parallel branches. */
export const bracket = (x, y, w, h, label, accent) =>
  ({ type: 'bracket', x, y, w, h, label, accent });

/** A small pill of text floating free, for a condition or a tick on an axis. */
export const pill = (x, y, text, accent) => ({ type: 'pill', x, y, text, accent });

export const MARK_TYPES = ['lifeline', 'divider', 'band-label', 'ring', 'bracket', 'pill'];
