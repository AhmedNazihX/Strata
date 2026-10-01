/**
 * Dataflow layout: vertical stage columns, data running left to right.
 *
 * The reading is "where this data comes from, what happens to it, and who ends
 * up consuming it", so the page is a pipeline: every stage is a column in
 * declaration order, every column wears a caption, and a link between adjacent
 * stages is a clean horizontal run from one box's right edge to the next box's
 * left edge. An edge that points backwards is a feedback or derived edge, so it
 * is hinted bottom-to-bottom and sweeps under the row rather than cutting back
 * through the boxes it already passed.
 */

import { computeFrame, columnBands } from './frame.mjs';
import { bandLabel } from './marks.mjs';
import { finishScene } from './scene.mjs';

const IMPLICIT_STAGE = { id: '__pipeline', name: 'PIPELINE', note: '', accent: 'blue', index: 0 };

const STAGE_GAP = 26;       // horizontal air between two stage columns
const STAGE_HEADROOM = 74;  // reserved at the top of a column for its caption
const STAGE_MIN_W = 150;
const STAGE_MAX_W = 300;
const BOX_INSET = 10;       // a box fills its column minus this on each side
const ROW_GAP = 18;         // vertical air between two boxes in the same stage
const MIN_NODE_H = 52;
const MAX_NODE_H = 118;
const CAPTION_TOP = 6;

export function layout(doc) {
  const frame = computeFrame(doc);
  const stages = doc.layers.length ? doc.layers : [IMPLICIT_STAGE];
  const bands = columnBands(frame, stages, {
    gap: STAGE_GAP,
    headroom: STAGE_HEADROOM,
    minWidth: STAGE_MIN_W,
    maxWidth: STAGE_MAX_W,
  });

  const bandById = new Map(bands.map((b) => [b.id, b]));
  const bandOrder = new Map(bands.map((b, i) => [b.id, i]));
  const fallback = bands[0];

  // Each stage sizes its own rows, so a stage holding one node gets a tall box
  // and a stage holding four gets four shorter ones; both stay in the canvas.
  const rowCounts = countRows(doc.nodes, bandById, fallback.id);
  const metrics = new Map(bands.map((b) => [b.id, rowMetrics(b.contentH, rowCounts.get(b.id) ?? 1)]));

  const nodes = doc.nodes.map((node) => {
    const band = bandById.get(node.layer) || fallback;
    const slot = rowSlot(band, metrics.get(band.id), node.col, node.span);
    return {
      ...node,
      x: node.pos ? node.pos[0] : slot.x,
      y: node.pos ? node.pos[1] : slot.y,
      w: node.size ? node.size[0] : slot.w,
      h: node.size ? node.size[1] : slot.h,
      bandId: band.id,
    };
  });

  const marks = bands.map((band) =>
    bandLabel(band.x, band.y + CAPTION_TOP, band.w, band.name, band.note || '', band.accent));

  return finishScene({
    doc: withRoutingHints(doc, nodes, bandOrder),
    frame,
    layers: doc.layers.length ? bands : [],
    nodes,
    marks,
  });
}

/**
 * How many rows each stage has to hold.
 *
 * Unlike the architecture layout, where `col` is a shared horizontal column
 * across every rail, here a node's `col` selects its ROW within the stage: the
 * stage is already the horizontal axis, so the only free coordinate left inside
 * one is vertical. `span` follows it and means "this box covers that many
 * rows". Normalisation hands every node a `col`, assigning them in declaration
 * order per layer, so an author who writes none still gets a clean stack.
 */
function countRows(nodes, bandById, fallbackId) {
  const counts = new Map();
  for (const node of nodes) {
    const id = bandById.has(node.layer) ? node.layer : fallbackId;
    counts.set(id, Math.max(counts.get(id) ?? 1, node.col + node.span));
  }
  return counts;
}

/**
 * Row height for one stage, clamped to a readable band.
 *
 * A crowded stage shrinks its gap before it shrinks its boxes, and shrinks its
 * boxes below the minimum before it spills out of the column — the canvas
 * bound is the one thing that is not negotiable.
 */
function rowMetrics(contentH, rows) {
  const even = (contentH - ROW_GAP * (rows - 1)) / rows;
  const ideal = Math.min(MAX_NODE_H, Math.max(MIN_NODE_H, even));
  const roomForGaps = rows > 1 ? Math.max(0, (contentH - ideal * rows) / (rows - 1)) : 0;
  const gap = Math.min(ROW_GAP, roomForGaps);
  const h = Math.max(1, Math.min(ideal, (contentH - gap * (rows - 1)) / rows));
  const total = h * rows + gap * (rows - 1);
  return { h, gap, offset: Math.max(0, (contentH - total) / 2) };
}

/** The rectangle for one node: full column width minus the inset, `span` rows tall. */
function rowSlot(band, metrics, row, span) {
  const pitch = metrics.h + metrics.gap;
  return {
    x: band.x + BOX_INSET,
    y: band.contentY + metrics.offset + row * pitch,
    w: Math.max(1, band.w - BOX_INSET * 2),
    h: metrics.h * span + metrics.gap * (span - 1),
  };
}

/**
 * A copy of the document whose links carry side hints.
 *
 * The router picks sides from the centre offsets of the two boxes, which in a
 * column layout reads any two stages as "mostly vertical" and sends a forward
 * edge out of the top or bottom of a box. Naming the sides here is what keeps
 * the pipeline horizontal. An author who named a side keeps it. The input
 * document is never touched.
 */
function withRoutingHints(doc, nodes, bandOrder) {
  const placed = new Map(nodes.map((n) => [n.id, { stage: bandOrder.get(n.bandId) ?? 0, y: n.y }]));
  const links = (doc.links || []).map((link) => {
    const from = placed.get(link.from);
    const to = placed.get(link.to);
    if (!from || !to) return link;
    const [fromSide, toSide] = sidesFor(from, to);
    return { ...link, fromSide: link.fromSide || fromSide, toSide: link.toSide || toSide };
  });
  return { ...doc, links };
}

/** Forward runs straight across; a backwards edge sweeps under both boxes. */
function sidesFor(from, to) {
  if (to.stage > from.stage) return ['right', 'left'];
  if (to.stage < from.stage) return ['bottom', 'bottom'];
  return from.y <= to.y ? ['bottom', 'top'] : ['top', 'bottom'];
}
