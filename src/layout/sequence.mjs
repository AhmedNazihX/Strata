/**
 * Sequence layout: participants are vertical columns, time runs down the page.
 *
 * The reading is "who calls whom, in what order". So the x axis carries no
 * meaning beyond identity — each participant owns one column, its nodes are the
 * header boxes at the top of it, and a dashed lifeline drops from under them to
 * the floor of the canvas. The y axis is the whole story: message i sits one row
 * below message i-1, in document order, so a reader's eye falling down the page
 * is reading the call order. That is why messages plan their own geometry here
 * rather than being routed — a router would find a prettier path and destroy the
 * one invariant the diagram exists to show.
 */

import { columnBands, computeFrame } from './frame.mjs';
import { bandLabel, lifeline } from './marks.mjs';
import { finishScene } from './scene.mjs';

const COLUMN = { gap: 20, minWidth: 132, maxWidth: 260 };
const HEADER_H = 58;           // one participant header box
const HEADER_GAP = 14;         // between stacked headers in the same column
const LIFELINE_GAP = 20;       // header block down to the top of the lifeline
const FIRST_ROW_OFFSET = 34;   // lifeline top down to the first message
const MIN_ROW_H = 26;          // below this two messages read as one
const MAX_ROW_H = 64;          // above this the rows stop reading as a sequence
const SELF_LOOP_W = 34;        // how far a self-call steps off its own lifeline
const SELF_LOOP_RATIO = 0.6;   // self-loop depth, as a fraction of the row
const BOTTOM_PAD = MAX_ROW_H * SELF_LOOP_RATIO + 10; // room for a self-call on the last row
const SAME_LIFELINE = 0.5;     // px below which two lifelines are the same one
const CAPTION_BLOCK = 30;      // column caption above the header boxes

export function layout(doc) {
  const frame = computeFrame(doc);
  const bands = columnBands(frame, doc.layers, {
    ...COLUMN,
    headroom: CAPTION_BLOCK + headerBlockHeight(doc) + LIFELINE_GAP,
  });
  const bandById = new Map(bands.map((b) => [b.id, b]));

  const nodes = placeNodes(doc, bands, bandById, frame.canvas.y + CAPTION_BLOCK);
  const lifelineTop = bands[0].contentY;
  const canvasBottom = frame.canvas.y + frame.canvas.h;
  const marks = bands.flatMap((b) => [
    bandLabel(b.x, frame.canvas.y + 13, b.w, b.name, b.note || '', b.accent),
    lifeline(b.cx, b.contentY, canvasBottom, b.accent),
  ]);

  const links = placeMessages(doc, nodes, bandById, bands, frame, lifelineTop);

  return finishScene({
    doc: { ...doc, links },   // a copy: the input document is never written to
    frame,
    layers: bands,
    nodes,
    marks,
  });
}

/** Tallest header stack on the page — every column reserves the same headroom. */
function headerBlockHeight(doc) {
  const perParticipant = new Map();
  for (const node of doc.nodes) {
    perParticipant.set(node.layer, (perParticipant.get(node.layer) ?? 0) + 1);
  }
  const deepest = Math.max(1, ...perParticipant.values());
  return deepest * HEADER_H + (deepest - 1) * HEADER_GAP;
}

/**
 * Header boxes, stacked down each column in declaration order.
 *
 * The common case is one node per participant, in which case the stack is one
 * box deep and every column's header sits on the same baseline.
 */
function placeNodes(doc, bands, bandById, canvasY) {
  const rowOf = new Map();
  return doc.nodes.map((node) => {
    const band = bandById.get(node.layer) || bands[0];
    const row = rowOf.get(band.id) ?? 0;
    rowOf.set(band.id, row + 1);
    return {
      ...node,
      x: node.pos ? node.pos[0] : band.x,
      y: node.pos ? node.pos[1] : canvasY + row * (HEADER_H + HEADER_GAP),
      w: node.size ? node.size[0] : band.w,
      h: node.size ? node.size[1] : HEADER_H,
      bandId: band.id,
    };
  });
}

/**
 * One row per link, in document order, each carrying its own polyline.
 *
 * A message rides the lifelines of the participants it connects rather than the
 * edges of their header boxes, so a `pos` override on a header moves the box
 * without tearing the column's messages off their axis.
 */
function placeMessages(doc, nodes, bandById, bands, frame, lifelineTop) {
  const links = doc.links || [];
  const row = messageRow(frame, lifelineTop, links.length);
  const lifelineX = lifelineXById(nodes, bandById, bands);

  return links.map((link, i) => {
    const x1 = lifelineX.get(link.from);
    const x2 = lifelineX.get(link.to);
    // An unresolvable endpoint is finishScene's to drop, not ours to invent.
    if (x1 === undefined || x2 === undefined) return link;

    const y = row.firstY + i * row.height;
    return Math.abs(x1 - x2) < SAME_LIFELINE
      ? selfMessage(link, x1, y, row.height, frame)
      : straightMessage(link, x1, x2, y);
  });
}

/** Every node's x on the time axis: the centre of its participant's column. */
function lifelineXById(nodes, bandById, bands) {
  return new Map(nodes.map((node) => [node.id, (bandById.get(node.layer) || bands[0]).cx]));
}

/**
 * Row pitch. Rows are spread to fill the canvas up to the maximum, and squeezed
 * toward the minimum when there are many. Past that the stack is allowed to run
 * long: the geometry checker says so out loud, which is better than silently
 * folding two messages onto one line.
 */
function messageRow(frame, lifelineTop, count) {
  const firstY = lifelineTop + FIRST_ROW_OFFSET;
  const span = frame.canvas.y + frame.canvas.h - BOTTOM_PAD - firstY;
  const height = count > 1 ? clamp(span / (count - 1), MIN_ROW_H, MAX_ROW_H) : MAX_ROW_H;
  return { firstY, height };
}

/** A plain call, return, async or error: one horizontal run between two lifelines. */
function straightMessage(link, x1, x2, y) {
  const rightwards = x2 > x1;
  return {
    ...link,
    points: [[x1, y], [x2, y]],
    fromSide: rightwards ? 'right' : 'left',
    toSide: rightwards ? 'left' : 'right',
  };
}

/**
 * A self-call: a small rectangular loop off the participant's own lifeline,
 * stepping right unless that would leave the canvas, in which case left.
 */
function selfMessage(link, x, y, rowHeight, frame) {
  const canvasRight = frame.canvas.x + frame.canvas.w;
  const direction = x + SELF_LOOP_W <= canvasRight ? 1 : -1;
  const edge = x + SELF_LOOP_W * direction;
  const depth = rowHeight * SELF_LOOP_RATIO;
  const side = direction === 1 ? 'right' : 'left';
  return {
    ...link,
    points: [[x, y], [edge, y], [edge, y + depth], [x, y + depth]],
    fromSide: side,
    toSide: side,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
