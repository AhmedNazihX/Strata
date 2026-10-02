/**
 * Scene assembly shared by every layout engine.
 *
 * A layout engine is responsible for placing layers and nodes. Everything after
 * that — fitting text, routing links, placing link labels, collecting the
 * narration — happens here, once, so the five diagram types cannot drift apart
 * in how they look or how they are checked.
 */

import { GEO, TYPE } from '../render/tokens.mjs';
import { fitNodeText, textBaselines, textBox } from './boxes.mjs';
import { measureText } from './measure.mjs';
import { longestRun, pathD, polylineLength, rectOf, route, tracksOf } from './route.mjs';

/* A box should read as holding its text, not as a room the text sits in.
   Below this fraction a box looks empty, which is how a lane with one node
   ends up drawing a tall portrait rectangle around two short lines. */
const TARGET_FILL = 0.55;
const BOX_MIN_H = 48;
/* The house shape is a landscape box. A node that approaches square reads as a
   card rather than as a step in a flow, which is the single thing that most
   separates a diagram that looks designed from one that looks generated. */
const MIN_ASPECT = 2.0;
/* Breathing room between a box and the edge of its lane. */
const LANE_INSET = 7;

export function finishScene({ doc, frame, layers, nodes, marks = [], axis = null }) {
  const placed = nodes.map((node) => {
    const sized = shrinkToContent(node);
    const fit = fitNodeText(sized, sized.w, sized.h);
    return {
      ...sized,
      fit,
      baselines: textBaselines(fit, sized.y, sized.h),
    };
  });

  const byId = new Map(placed.map((n) => [n.id, n]));
  const obstacles = placed.map(rectOf);
  // Each link is routed seeing the tracks already taken, so two unrelated
  // links in one gutter take separate lanes. Links with fixed geometry go
  // first — they cannot move, so the ones that can must route around them —
  // and the output keeps declaration order.
  const tracks = [];
  const declared = doc.links || [];
  const fixed = (link) => (Array.isArray(link.via) && link.via.length > 0)
    || (Array.isArray(link.points) && link.points.length >= 2);
  const order = [...declared.keys()].sort((a, b) => Number(fixed(declared[b])) - Number(fixed(declared[a])));
  const builtAt = new Map();
  for (const i of order) {
    const built = buildLink(declared[i], byId, obstacles, tracks);
    if (built) tracks.push(...tracksOf(built.points, [built.from, built.to]));
    builtAt.set(i, built);
  }
  const links = declared.map((_, i) => builtAt.get(i));

  // Labels are placed after every route is known, one at a time, each one
  // treating the labels already down as obstacles. Placing them independently
  // is how "2nd opinion" and "extract, score" ended up printed on top of each
  // other, which reads as neither.
  const taken = [];
  const texts = placed.map(textBox);
  const routed = links.filter(Boolean);
  for (const link of routed) {
    if (!link.label) continue;
    const others = routed.filter((other) => other !== link).map((other) => other.points);
    link.labelAt = placeLabel(link.label, link.points, { obstacles, frame, taken, others, texts });
    if (link.labelAt) taken.push(rectOfLabel(link.labelAt));
  }

  return {
    type: doc.diagram_type,
    meta: doc.meta,
    frame,
    layers,
    nodes: placed,
    links: links.filter(Boolean),
    marks,
    axis,
    steps: doc.steps || [],
    legend: doc.legend || [],
  };
}

/**
 * Shrink an over-tall box down to what its text needs, keeping its centre so
 * the row still reads as a row. Only ever shrinks, and never touches a box
 * whose size the author set explicitly.
 */
function shrinkToContent(node) {
  if (node.size) return node;
  const fit = fitNodeText(node, node.w, node.h);
  const content = Math.max(BOX_MIN_H, Math.round(fit.contentHeight / TARGET_FILL));
  const landscape = Math.max(BOX_MIN_H, Math.round(node.w / MIN_ASPECT));
  const lane = Math.max(BOX_MIN_H, node.h - LANE_INSET * 2);

  // Fill the lane where that still looks right: landscape, and holding its
  // text. A square box is a blemish; a truncated label is a lie.
  const roomy = Math.max(content, lane);
  const height = landscape < roomy && !fitNodeText(node, node.w, landscape).truncated
    ? landscape
    : roomy;

  if (height >= node.h) return node;
  return { ...node, y: node.y + (node.h - height) / 2, h: height };
}

function buildLink(link, byId, obstacles, tracks) {
  const from = byId.get(link.from);
  const to = byId.get(link.to);
  if (!from || !to) return null;

  // A layout that plans its own geometry — a sequence message sitting on a
  // time axis, a lifecycle back-edge sweeping around a cycle — hands the
  // polyline over directly rather than asking the router to rediscover it.
  const routed = Array.isArray(link.points) && link.points.length >= 2
    ? { points: link.points, sides: [link.fromSide || 'right', link.toSide || 'left'], clean: true }
    : route(rectOf(from), rectOf(to), link, obstacles, tracks);
  const run = longestRun(routed.points);
  const length = polylineLength(routed.points);

  return {
    ...link,
    points: routed.points,
    sides: routed.sides,
    clean: routed.clean,
    d: pathD(routed.points),
    length,
    accent: from.accent,
    label: link.label || '',
    labelAt: null,   // placed in a second pass, once every route is known
  };
}

const LABEL_SLIDES = [0.5, 0.38, 0.62, 0.26, 0.74, 0.14, 0.86];
const LABEL_PAD = 3;      // how far a label sits off the line it belongs to
const LABEL_CLEAR = 1;    // clearance demanded of a node box — a hair, not a margin
const PAGE_INSET = 6;
/* Furthest a label may sit from its own line and still read as naming it.
   Lifting a label clear of a row of boxes, for a short connector between
   neighbours, lands it about this far away; anything further names nothing. */
export const LABEL_REACH = 48;
/* Costs, in square px of overlap they are worth. A label on another line
   names that line; on another label, both are unreadable; on a box, untidy. */
const COST_ON_OTHER_LINE = 4000;
const COST_ON_BOX_TEXT = 4000;
const LABEL_OVERLAP_WEIGHT = 3;
const DISTANCE_WEIGHT = 4;

/**
 * Put the label where it unmistakably names its own line.
 *
 * Every run, slide and side is tried, each candidate is clamped to the
 * canvas *before* it is judged — clamping afterwards is how labels piled up
 * on each other at the page edge — and a candidate is only eligible when it
 * is within `LABEL_REACH` of its own line and closer to it than to any other.
 * Among those, the cheapest wins: on another line costs most, then another
 * label, then a box, then distance. No eligible candidate means no label,
 * which the geometry gate reports rather than drawing one that misleads.
 */
function placeLabel(text, points, { obstacles, frame, taken = [], others = [], texts = [] }) {
  const w = measureText(text, { size: TYPE.linkLabel }) + 12;
  const h = TYPE.linkLabel + 8;

  let best = null;
  let bestCost = Infinity;
  for (const run of segmentsOf(points)) {
    for (const t of LABEL_SLIDES) {
      for (const raw of candidatesAt(lerp(run, t), run, w, h, obstacles)) {
        const box = clampToCanvas(raw, frame);
        const rect = rectOfLabel(box);
        const own = pathDistance(rect, points);
        if (own > LABEL_REACH) continue;
        const nearestOther = Math.min(Infinity, ...others.map((other) => pathDistance(rect, other)));
        if (nearestOther < own) continue;
        const onText = texts.some((t) => rect.x < t.x + t.w && t.x < rect.x + rect.w && rect.y < t.y + t.h && t.y < rect.y + rect.h);
        const cost = (nearestOther === 0 ? COST_ON_OTHER_LINE : 0)
          + (onText ? COST_ON_BOX_TEXT : 0)
          + overlapArea(box, taken) * LABEL_OVERLAP_WEIGHT
          + overlapArea(box, obstacles)
          + own * DISTANCE_WEIGHT;
        if (cost < bestCost) { bestCost = cost; best = box; }
      }
    }
  }
  return best;
}

/** Shortest distance from a rect to any segment of a polyline; 0 when touching. */
export function pathDistance(rect, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const dx = Math.max(rect.x - Math.max(ax, bx), 0, Math.min(ax, bx) - (rect.x + rect.w));
    const dy = Math.max(rect.y - Math.max(ay, by), 0, Math.min(ay, by) - (rect.y + rect.h));
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

/** A label box as a plain rect, for use as an obstacle. */
export function rectOfLabel(label) {
  return { x: label.x - label.w / 2, y: label.y, w: label.w, h: label.h };
}

/* A label is part of the drawing, so it stays on the canvas the gate checks. */
function clampToCanvas(box, frame) {
  if (!frame) return box;
  const area = frame.canvas || { x: 0, y: 0, w: frame.width, h: frame.height };
  const half = box.w / 2;
  const minX = area.x + PAGE_INSET + half;
  const maxX = area.x + area.w - PAGE_INSET - half;
  const minY = area.y + PAGE_INSET;
  const maxY = area.y + area.h - PAGE_INSET - box.h;
  return {
    ...box,
    x: Math.min(Math.max(box.x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(box.y, minY), Math.max(minY, maxY)),
  };
}

/**
 * Positions to try at one point on a run: beside the line first, then clear of
 * the row or column entirely. Two adjacent boxes leave a gap far narrower than
 * any label, so the escape — lifting it just above the row at the gap — is the
 * only placement that exists for a short connector between neighbours.
 */
function candidatesAt(at, run, w, h, obstacles) {
  const beside = [1, -1].map((flip) => (run.horizontal
    ? { x: at[0], y: at[1] + flip * (h / 2 + LABEL_PAD) - h / 2, w, h, anchor: 'middle' }
    : { x: at[0] + flip * (w / 2 + 8), y: at[1] - h / 2, w, h, anchor: 'middle' }));

  const near = obstacles.filter((r) => (run.horizontal
    ? at[0] > r.x - w && at[0] < r.x + r.w + w && at[1] >= r.y - h && at[1] <= r.y + r.h + h
    : at[1] > r.y - h && at[1] < r.y + r.h + h && at[0] >= r.x - w && at[0] <= r.x + r.w + w));
  if (!near.length) return beside;

  const escapes = run.horizontal
    ? [
      { x: at[0], y: Math.min(...near.map((r) => r.y)) - h - 4, w, h, anchor: 'middle' },
      { x: at[0], y: Math.max(...near.map((r) => r.y + r.h)) + 4, w, h, anchor: 'middle' },
    ]
    : [
      { x: Math.min(...near.map((r) => r.x)) - w / 2 - 6, y: at[1] - h / 2, w, h, anchor: 'middle' },
      { x: Math.max(...near.map((r) => r.x + r.w)) + w / 2 + 6, y: at[1] - h / 2, w, h, anchor: 'middle' },
    ];
  return beside.concat(escapes);
}

function segmentsOf(points) {
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    out.push({
      0: a, 1: b, a, b,
      length: Math.hypot(b[0] - a[0], b[1] - a[1]),
      horizontal: Math.abs(a[1] - b[1]) < 0.5,
    });
  }
  return out;
}

function lerp(run, t) {
  return [run.a[0] + (run.b[0] - run.a[0]) * t, run.a[1] + (run.b[1] - run.a[1]) * t];
}

/** Total area the label would cover of any node box, in square px. */
function overlapArea(box, obstacles) {
  const left = box.x - box.w / 2 - LABEL_CLEAR;
  const top = box.y - LABEL_CLEAR;
  const right = left + box.w + LABEL_CLEAR * 2;
  const bottom = top + box.h + LABEL_CLEAR * 2;
  let area = 0;
  for (const r of obstacles) {
    const dx = Math.min(right, r.x + r.w) - Math.max(left, r.x);
    const dy = Math.min(bottom, r.y + r.h) - Math.max(top, r.y);
    if (dx > 0 && dy > 0) area += dx * dy;
  }
  return area;
}

/** Links a step lights up, resolved to ids the renderer can toggle. */
export function stepActivation(scene) {
  const allNodeIds = scene.nodes.map((n) => n.id);
  return scene.steps.map((step) => ({
    title: step.title,
    lede: step.lede,
    notes: step.notes || [],
    nodes: (step.nodes || []).includes('*') ? allNodeIds : (step.nodes || []),
    links: step.links || [],
  }));
}

/** A rail or column band tall enough for its own label. */
export function bandLabelFits(band, gutter = GEO.gutter) {
  return measureText(band.name, { font: 'mono', size: TYPE.railName, weight: 500 }) <= gutter - 30;
}
