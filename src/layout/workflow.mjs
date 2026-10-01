/**
 * Workflow layout: rank left to right, branch up and down.
 *
 * The x axis is strictly order — a node's column is its longest path from a
 * start, so it sits right of everything that must happen first. The y axis
 * carries only the branch structure: the trunk holds one row and a gate's
 * alternatives step off it. Declared lanes claim the y axis instead, and the
 * rows become swimlanes. Back-edges are left out of the ranking — one retry
 * would push half the diagram rightwards — and sweep clear on router hints.
 */

import { GEO } from '../render/tokens.mjs';
import { columnGrid, computeFrame, railBands, RAIL_MAX_HEIGHT } from './frame.mjs';
import { bracket, pill } from './marks.mjs';
import { finishScene } from './scene.mjs';

const BOX = { minH: 34, maxRowH: 104, laneMinH: 58, laneMaxH: RAIL_MAX_HEIGHT, rowGap: GEO.nodeGap };
const FAN_LIMIT = 24;  // how far a branch may fan before it settles for its parent's row
const BRACKET_PAD = 12;
const PILL_INSET = 16;
const SWEEP_SIDES = { escalate: ['top', 'top'], retry: ['bottom', 'bottom'] };
const BRANCH_VARIANTS = ['yes', 'no'];

export function layout(doc) {
  const frame = computeFrame(doc);
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const links = doc.links.filter((link) => byId.has(link.from) && byId.has(link.to));
  const back = findBackEdges(doc.nodes, groupBy(links, 'from'), links);
  const forwardOut = groupBy(links.filter((link) => !back.has(link.id)), 'from');

  // Rank order is a topological order, so a parent is always placed first.
  const rank = rankNodes(doc.nodes, forwardOut);
  const explicit = explicitCols(doc.nodes);
  const colOf = (node) => (explicit.has(node.id) ? node.col : rank.get(node.id));
  const ordered = [...doc.nodes].sort((a, b) => rank.get(a.id) - rank.get(b.id) || a.index - b.index);

  const placed = doc.layers.length
    ? placeInLanes(doc, frame, ordered, colOf)
    : placeInRows(doc, frame, ordered, byId, forwardOut, colOf);
  return finishScene({
    doc: withSweepHints(doc, back), frame, layers: placed.layers, nodes: placed.nodes,
    marks: decorations(placed.nodes, forwardOut),
  });
}

/** Depth-first from every entry point; an edge onto a node still open goes back. */
function findBackEdges(nodes, outgoing, links) {
  const targeted = new Set(links.map((link) => link.to));
  const entries = nodes.filter((node) => node.kind === 'start' || !targeted.has(node.id));
  const state = new Map();
  const back = new Set();
  const walk = (id) => {
    state.set(id, 'open');
    for (const link of outgoing.get(id) || []) {
      if (state.get(link.to) === 'open') back.add(link.id);
      else if (!state.get(link.to)) walk(link.to);
    }
    state.set(id, 'closed');
  };
  for (const node of [...entries, ...nodes]) if (!state.get(node.id)) walk(node.id);
  return back;
}

/** Longest path over the forward edges, relaxed in Kahn order. Sugiyama-lite. */
function rankNodes(nodes, forwardOut) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const list of forwardOut.values()) for (const l of list) indegree.set(l.to, indegree.get(l.to) + 1);
  const rank = new Map(nodes.map((node) => [node.id, 0]));
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  while (queue.length) {
    const id = queue.shift();
    for (const link of forwardOut.get(id) || []) {
      rank.set(link.to, Math.max(rank.get(link.to), rank.get(id) + 1));
      indegree.set(link.to, indegree.get(link.to) - 1);
      if (indegree.get(link.to) === 0) queue.push(link.to);
    }
  }
  return rank;
}
/** Normalisation fills every `.col`: replay it to find where the author disagreed. */
function explicitCols(nodes) {
  const next = new Map();
  const explicit = new Set();
  for (const node of nodes) {
    if (node.col !== (next.get(node.layer) ?? 0)) explicit.add(node.id);
    next.set(node.layer, node.col + node.span);
  }
  return explicit;
}

/** The slots one box covers on one track — two boxes never share one. */
const slotKeys = (track, col, span) => Array.from({ length: span }, (_, i) => `${track}:${col + i}`);
/** Take the free row nearest `preferred`, so the trunk keeps the row it is on. */
function claimRow(col, span, preferred, taken) {
  for (let d = 0; d <= FAN_LIMIT; d += 1) {
    for (const row of d ? [preferred + d, preferred - d] : [preferred]) {
      const keys = slotKeys(row, col, span);
      if (keys.some((key) => taken.has(key))) continue;
      keys.forEach((key) => taken.add(key));
      return row;
    }
  }
  return preferred;
}

/** First child dead ahead, the rest alternating outwards: 0, +1, -1, +2, -2. */
const branchOffset = (i) => (i % 2 ? Math.ceil(i / 2) : -i / 2);
/** No lanes: the rows carry the branching, and the trunk stays on one of them. */
function placeInRows(doc, frame, ordered, byId, forwardOut, colOf) {
  const rows = new Map();
  const taken = new Set();
  for (const node of ordered) {
    if (!rows.has(node.id)) rows.set(node.id, claimRow(colOf(node), node.span, 0, taken));
    const base = rows.get(node.id);
    let fan = 0;
    for (const link of forwardOut.get(node.id) || []) {
      if (rows.has(link.to)) continue;
      const kid = byId.get(link.to);
      rows.set(kid.id, claimRow(colOf(kid), kid.span, base + branchOffset(fan), taken));
      fan += 1;
    }
  }
  const used = [...rows.values()];
  const top = Math.min(...used);
  const slotH = frame.canvas.h / (Math.max(...used) - top + 1);
  const h = Math.min(slotH, BOX.maxRowH, Math.max(BOX.minH, slotH - BOX.rowGap));
  const bandFor = (n) => ({ y: frame.canvas.y + (rows.get(n.id) - top) * slotH + (slotH - h) / 2, h });
  return { layers: [], nodes: onGrid(doc, frame.canvas.x, frame.canvas.w, colOf, bandFor) };
}

/** Lanes own the y axis, so a rank collision inside one lane slides right. */
function placeInLanes(doc, frame, ordered, colOf) {
  // Ten lanes under a caption panel overflow at the default gap, so the gap
  // closes first and only then does a rail drop below its floor.
  const count = doc.layers.length;
  const gap = Math.min(GEO.railGap, Math.max(0, (frame.canvas.h - BOX.minH * count) / Math.max(1, count - 1)));
  const fair = (frame.canvas.h - gap * (count - 1)) / count;
  const bands = railBands(frame, doc.layers, { gap, minHeight: Math.min(BOX.laneMinH, fair), maxHeight: BOX.laneMaxH });
  const taken = new Set();
  const cols = new Map();
  for (const node of ordered) {
    let col = colOf(node);
    let keys = slotKeys(node.layerIndex, col, node.span);
    while (keys.some((key) => taken.has(key))) keys = slotKeys(node.layerIndex, (col += 1), node.span);
    keys.forEach((key) => taken.add(key));
    cols.set(node.id, col);
  }
  const nodes = onGrid(doc, bands[0].contentX, bands[0].contentW,
    (node) => cols.get(node.id), (node) => bands[node.layerIndex] || bands[0]);
  return { layers: bands, nodes };
}

/** Every node on one shared column grid. An author's pos/size outranks the slot. */
function onGrid(doc, originX, width, colOf, bandFor) {
  const grid = columnGrid(originX, width, Math.max(1, ...doc.nodes.map((n) => colOf(n) + n.span)));
  return doc.nodes.map((node) => {
    const slot = grid.at(colOf(node), node.span);
    const band = bandFor(node);
    return { ...node, x: node.pos ? node.pos[0] : slot.x, y: node.pos ? node.pos[1] : band.y,
      w: node.size ? node.size[0] : slot.w, h: node.size ? node.size[1] : band.h };
  });
}

/** Rationed marks: a bracket round a fan-out, pills on an unlabelled gate only. */
function decorations(nodes, forwardOut) {
  const boxes = new Map(nodes.map((node) => [node.id, node]));
  return nodes.flatMap((node) => {
    const kids = (forwardOut.get(node.id) || []).filter((link) => boxes.has(link.to));
    if (node.kind === 'parallel') return kids.length > 1 ? [fanBracket(node, kids.map((l) => boxes.get(l.to)))] : [];
    if (node.kind !== 'gate') return [];
    const branches = kids.filter((l) => BRANCH_VARIANTS.includes(l.variant) && !l.label);
    if (branches.length < 2) return [];
    return branches.map((link) => {
      const kid = boxes.get(link.to);
      return pill(node.x + node.w + PILL_INSET, (node.y + node.h / 2 + kid.y + kid.h / 2) / 2, link.variant, node.accent);
    });
  });
}

function fanBracket(node, kids) {
  const x = Math.min(...kids.map((k) => k.x)) - BRACKET_PAD;
  const y = Math.min(...kids.map((k) => k.y)) - BRACKET_PAD;
  const right = Math.max(...kids.map((k) => k.x + k.w)) + BRACKET_PAD;
  const bottom = Math.max(...kids.map((k) => k.y + k.h)) + BRACKET_PAD;
  return bracket(x, y, right - x, bottom - y, node.tag || node.label, node.accent);
}

/** A copy of the document — never the input — whose loops carry routing hints. */
const withSweepHints = (doc, back) => ({
  ...doc,
  links: doc.links.map((link) => {
    const sides = SWEEP_SIDES[link.variant] || (back.has(link.id) ? SWEEP_SIDES.retry : null);
    return sides ? { ...link, fromSide: link.fromSide || sides[0], toSide: link.toSide || sides[1] } : link;
  }),
});

const groupBy = (links, key) => links.reduce(
  (map, link) => map.set(link[key], [...(map.get(link[key]) || []), link]), new Map());
