/**
 * Lifecycle layout: a left-to-right spine of states, with the exits ringed.
 *
 * Rank — the longest path from `initial`, back-edges ignored — becomes the
 * column, and each rank stacks on the midline, so the happy path reads as a
 * straight spine with `waiting` above it and `error` below. Entry and exit are
 * marked, not merely coloured: `initial` wears one ring, `terminal` and `error`
 * wear two. A back-edge leaves through the top or bottom and sweeps around in a
 * reserved lane, because a retry drawn through the boxes reads as a transition
 * that is not there.
 */

import { GEO } from '../render/tokens.mjs';
import { columnGrid, computeFrame, railBands, RAIL_MAX_HEIGHT } from './frame.mjs';
import { rectOf, route } from './route.mjs';
import { finishScene } from './scene.mjs';

const BOX_H = 62;         // a state box at its natural height
const BOX_MIN_H = 44;     // how far it may shrink when a rank is crowded
const BOX_MIN_W = 96;     // a column narrower than this just touches its neighbour
const BOX_MAX_W = 208;    // wider than this and a state reads as a region
const BOX_INSET = 10;     // breathing room inside the column slot
const ROW_GAP = 28;       // vertical gap between two states of one rank
const RING_PAD = 7;       // breathing space kept around a box
const RING_OUT = RING_PAD + 5;
const SWEEP_BAND = 54;    // canvas held back, top and bottom, for back-edges
const LANE_GAP = 18;      // first sweep lane's clearance from the boxes
const LANE_STEP = 14;     // spacing between sweep lanes
const JOG = ROW_GAP / 2;  // how far a sweep drops before it turns aside
const BAND_MIN_H = 58, BAND_MAX_H = RAIL_MAX_HEIGHT;

const ABOVE_KINDS = new Set(['waiting']);
const BELOW_KINDS = new Set(['error']);
const EXIT_KINDS = new Set(['terminal', 'error']);

export function layout(doc) {
  const frame = computeFrame(doc);
  // The canvas minus the room the rings and the sweep lanes need.
  const c = frame.canvas;
  const area = { x: c.x + RING_OUT, y: c.y + SWEEP_BAND,
    w: c.w - RING_OUT * 2, h: Math.max(BOX_H, c.h - SWEEP_BAND * 2) };
  const ranks = rankStates(doc.nodes, doc.links);
  const cols = Math.max(...ranks.values()) + 1;
  // Groups are optional here. When they exist each one is a rail and its states
  // stay on it; when they do not, the whole canvas is one field.
  const bands = doc.layers.length
    ? railBands({ canvas: area }, doc.layers, { minHeight: BAND_MIN_H, maxHeight: BAND_MAX_H })
    : [];
  const fields = bands.length ? bands : [{ id: '__all', ...area }];
  const strip = bands.length ? { x: bands[0].contentX, w: bands[0].contentW } : area;
  const grid = columnGrid(strip.x, strip.w, cols);

  const nodes = placeNodes(doc.nodes, ranks, fields, grid);
  const scope = { nodes, ranks, grid, frame, cols,
    byId: new Map(nodes.map((n) => [n.id, n])), obstacles: nodes.map(rectOf) };
  const links = doc.links.map((link) => ({ ...link, ...hintFor(link, scope) }));

  return finishScene({ doc: { ...doc, links }, frame, layers: bands, nodes: nodes.map(withExitShape), marks: [] });
}

/**
 * Rank = longest path from an `initial` state, over forward edges only. A link
 * to a state already on the walk is a back-edge and does not advance anything,
 * or a cycle would rank for ever. `terminal` states are then pulled to the last
 * rank, so every exit sits at the right-hand end where a reader looks for it.
 */
function rankStates(nodes, links) {
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const link of links) outgoing.get(link.from)?.push(link);
  const walk = new Map(); // id -> 'open' while on the stack, 'done' once left
  const back = new Set();
  const visit = (id) => {
    walk.set(id, 'open');
    for (const link of outgoing.get(id) || []) {
      const seen = walk.get(link.to);
      if (seen === 'open') back.add(link.id);
      else if (!seen) visit(link.to);
    }
    walk.set(id, 'done');
  };
  for (const n of [...nodes.filter((state) => state.kind === 'initial'), ...nodes]) if (!walk.get(n.id)) visit(n.id);

  const rank = new Map(nodes.map((n) => [n.id, 0]));
  const forward = links.filter((l) => !back.has(l.id) && rank.has(l.from) && rank.has(l.to));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false;
    for (const l of forward) if (rank.get(l.from) + 1 > rank.get(l.to)) {
      rank.set(l.to, rank.get(l.from) + 1); moved = true;
    }
    if (!moved) break;
  }
  const last = Math.max(...rank.values());
  return new Map(nodes.map((n) => [n.id, n.kind === 'terminal' ? last : rank.get(n.id)]));
}

/** One column per rank, one stack per (field, rank). */
function placeNodes(nodes, ranks, fields, grid) {
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const groups = new Map();
  for (const node of nodes) {
    const field = fieldById.get(node.layer) || fields[0];
    const key = `${field.id}|${ranks.get(node.id)}`;
    if (!groups.has(key)) groups.set(key, { field, members: [] });
    groups.get(key).members.push(node);
  }
  const placed = [];
  for (const { field, members } of groups.values()) {
    for (const { node, y, h } of stackRank(members, field)) {
      // col and span describe a grid this type does not have: rank owns the column.
      const slot = grid.at(ranks.get(node.id), 1);
      const w = Math.min(Math.max(BOX_MIN_W, slot.w - BOX_INSET * 2), slot.w, BOX_MAX_W);
      placed.push({ ...node, rank: ranks.get(node.id),
        x: node.pos ? node.pos[0] : slot.x + (slot.w - w) / 2, y: node.pos ? node.pos[1] : y,
        w: node.size ? node.size[0] : w, h: node.size ? node.size[1] : h });
    }
  }
  return placed;
}

/** The spine on the field's midline, `waiting` above it, `error` below it. */
function stackRank(members, field) {
  const above = members.filter((n) => ABOVE_KINDS.has(n.kind));
  const below = members.filter((n) => BELOW_KINDS.has(n.kind));
  const spine = members.filter((n) => !ABOVE_KINDS.has(n.kind) && !BELOW_KINDS.has(n.kind));
  const h = clamp((field.h - ROW_GAP * (members.length - 1)) / members.length, BOX_MIN_H, BOX_H);
  const step = h + ROW_GAP;
  const mid = field.y + field.h / 2;
  const top = spine.length ? mid - (spine.length * step - ROW_GAP) / 2 : mid - h / 2;
  const rows = [
    ...above.map((node, i) => ({ node, h, y: top - (above.length - i) * step })),
    ...spine.map((node, i) => ({ node, h, y: top + i * step })),
    ...below.map((node, i) => ({ node, h, y: top + (spine.length + i) * step })),
  ];
  // A rank taller than its field slides back inside rather than spilling out.
  const first = Math.min(...rows.map((r) => r.y));
  const last = Math.max(...rows.map((r) => r.y + r.h));
  const shift = first < field.y ? field.y - first : Math.min(0, field.y + field.h - last);
  return rows.map((row) => ({ ...row, y: row.y + shift }));
}

/**
 * An exit is a shape, not a decoration.
 *
 * Rings around a box add two more outlines to a page that already has a border,
 * a glow and a colour — they read as clutter rather than as meaning. A fully
 * rounded box says "this is where it stops" on its own, and costs nothing.
 */
function withExitShape(node) {
  return EXIT_KINDS.has(node.kind) ? { ...node, corner: node.h / 2 } : node;
}

/**
 * Side hints, and for a back-edge an explicit sweep. Every candidate is routed
 * before it is chosen, so a hint is emitted only when it really does clear the
 * boxes; otherwise the router is left to its own judgement.
 */
function hintFor(link, { nodes, byId, obstacles, ranks, grid, frame, cols }) {
  const from = byId.get(link.from);
  const to = byId.get(link.to);
  if (!from || !to) return {};
  // Only a genuine back-edge sweeps. A `failure` that moves forward is still a
  // forward edge, and sending it out of the bottom makes it loop around the
  // target and arrive from the far side; a same-rank link is two stacked boxes
  // that should simply join.
  const sweeps = ranks.get(to.id) < ranks.get(from.id);
  if (!sweeps) return firstClean(from, to, obstacles, [{ fromSide: 'right', toSide: 'left' }]) || {};

  const side = to.y + to.h / 2 < from.y + from.h / 2 ? 'top' : 'bottom';
  const corridor = (rank) => clamp(grid.at(Math.min(rank, cols), 1).x - grid.gap / 2,
    frame.canvas.x + RING_PAD, frame.canvas.x + frame.canvas.w - RING_PAD);
  const candidates = laneYs(nodes, frame, side, link.index).map((laneY) => ({ fromSide: side, toSide: side,
    via: sweepVia(from, to, side, laneY, corridor(ranks.get(from.id) + 1), corridor(ranks.get(to.id))) }));
  return firstClean(from, to, obstacles, candidates) || { fromSide: side, toSide: side };
}

/** Out through the column gutter, along the lane, back up: never across a box. */
function sweepVia(from, to, side, laneY, legOut, legIn) {
  const down = side === 'bottom' ? 1 : -1;
  const fy = (side === 'bottom' ? from.y + from.h : from.y) + down * JOG;
  const ty = (side === 'bottom' ? to.y + to.h : to.y) + down * JOG;
  return [[from.x + from.w / 2, fy], [legOut, fy], [legOut, laneY],
    [legIn, laneY], [legIn, ty], [to.x + to.w / 2, ty]];
}

/** Lanes in the reserved band, rotated per link so the sweeps fan out. */
function laneYs(nodes, frame, side, seed) {
  const bottom = side === 'bottom';
  const limit = bottom ? frame.canvas.y + frame.canvas.h - GEO.linkGap : frame.canvas.y + GEO.linkGap;
  const edge = bottom
    ? Math.max(...nodes.map((n) => n.y + n.h)) + LANE_GAP
    : Math.min(...nodes.map((n) => n.y)) - LANE_GAP;
  const lanes = [];
  for (let y = edge; bottom ? y <= limit : y >= limit; y += bottom ? LANE_STEP : -LANE_STEP) lanes.push(y);
  if (!lanes.length) lanes.push(limit);
  const offset = ((seed % lanes.length) + lanes.length) % lanes.length;
  return [...lanes.slice(offset), ...lanes.slice(0, offset)];
}

/** The first hint that survives a real routing pass, or nothing. */
const firstClean = (from, to, obstacles, specs) =>
  specs.find((spec) => route(rectOf(from), rectOf(to), spec, obstacles).clean) || null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
