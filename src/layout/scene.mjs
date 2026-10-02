/**
 * Scene assembly shared by every layout engine.
 *
 * A layout engine is responsible for placing layers and nodes. Everything after
 * that — fitting text, routing links, placing link labels, collecting the
 * narration — happens here, once, so the five diagram types cannot drift apart
 * in how they look or how they are checked.
 */

import { GEO, TYPE } from '../render/tokens.mjs';
import { fitNodeText, textBaselines } from './boxes.mjs';
import { measureText } from './measure.mjs';
import { longestRun, pathD, polylineLength, rectOf, route } from './route.mjs';

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
  const links = (doc.links || []).map((link) => buildLink(link, byId, obstacles, frame));

  // Labels are placed after every route is known, one at a time, each one
  // treating the labels already down as obstacles. Placing them independently
  // is how "2nd opinion" and "extract, score" ended up printed on top of each
  // other, which reads as neither.
  const taken = [];
  for (const link of links) {
    if (!link || !link.label) continue;
    link.labelAt = placeLabel(link.label, link.points, obstacles, frame, taken);
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

function buildLink(link, byId, obstacles, frame) {
  const from = byId.get(link.from);
  const to = byId.get(link.to);
  if (!from || !to) return null;

  // A layout that plans its own geometry — a sequence message sitting on a
  // time axis, a lifecycle back-edge sweeping around a cycle — hands the
  // polyline over directly rather than asking the router to rediscover it.
  const routed = Array.isArray(link.points) && link.points.length >= 2
    ? { points: link.points, sides: [link.fromSide || 'right', link.toSide || 'left'], clean: true }
    : route(rectOf(from), rectOf(to), link, obstacles);
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

const LABEL_SLIDES = [0.5, 0.38, 0.62, 0.26, 0.74];
const LABEL_PAD = 3;      // how far a label sits off the line it belongs to
const LABEL_CLEAR = 1;    // clearance demanded of a node box — a hair, not a margin
const PAGE_INSET = 6;

/**
 * Put the label on the clearest run the path offers.
 *
 * Runs are tried longest first, and on each one the label slides along and
 * flips to the other side until it clears every box. Only if nothing on the
 * whole path is clear does it settle for the least-bad position — a label
 * printed over a component reads as belonging to it, which is worse than a
 * label sitting slightly off-centre on a shorter leg.
 */
function placeLabel(text, points, obstacles, frame, taken = []) {
  const w = measureText(text, { size: TYPE.linkLabel }) + 12;
  const h = TYPE.linkLabel + 8;
  const runs = segmentsOf(points).sort((a, b) => b.length - a.length);

  let best = null;
  let bestCost = Infinity;

  for (const run of runs) {
    for (const t of LABEL_SLIDES) {
      const at = lerp(run, t);
      for (const box of candidatesAt(at, run, w, h, obstacles)) {
        // Two labels on top of each other are unreadable; a label touching a
        // box is merely untidy. Weight accordingly.
        const cost = overlapArea(box, obstacles) + overlapArea(box, taken) * 3;
        if (cost === 0) return clampToPage(box, frame);
        if (cost < bestCost) { bestCost = cost; best = box; }
      }
    }
  }
  return best ? clampToPage(best, frame) : null;
}

/** A label box as a plain rect, for use as an obstacle. */
function rectOfLabel(label) {
  return { x: label.x - label.w / 2, y: label.y, w: label.w, h: label.h };
}

/* A label that leaves the page is worse than one slightly off its line. */
function clampToPage(box, frame) {
  if (!frame) return box;
  const half = box.w / 2;
  const minX = PAGE_INSET + half;
  const maxX = frame.width - PAGE_INSET - half;
  const minY = PAGE_INSET;
  const maxY = frame.height - PAGE_INSET - box.h;
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
