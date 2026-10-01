/**
 * Architecture layout: horizontal layer rails, nodes on a shared column grid.
 *
 * This is the reference layout. A reader scans top to bottom to see which tier
 * a thing lives in, and left to right to follow the order it is reached in, so
 * the column grid is shared across every rail — a node in column 3 of the API
 * rail sits directly under column 3 of the browser rail.
 */

import { computeFrame, columnGrid, railBands } from './frame.mjs';
import { finishScene } from './scene.mjs';

const IMPLICIT_LAYER = { id: '__all', name: 'SYSTEM', note: '', accent: 'blue', index: 0 };

export function layout(doc) {
  const frame = computeFrame(doc);
  const declared = doc.layers.length ? doc.layers : [IMPLICIT_LAYER];
  const bands = railBands(frame, declared, { minHeight: 58 });
  const bandById = new Map(bands.map((b) => [b.id, b]));

  const cols = doc.nodes.reduce((max, n) => Math.max(max, n.col + n.span), 1);
  const reference = bands[0];
  const grid = columnGrid(reference.contentX, reference.contentW, cols);

  const nodes = doc.nodes.map((node) => {
    const band = bandById.get(node.layer) || reference;
    const slot = grid.at(node.col, node.span);
    return {
      ...node,
      x: node.pos ? node.pos[0] : slot.x,
      y: node.pos ? node.pos[1] : band.y,
      w: node.size ? node.size[0] : slot.w,
      h: node.size ? node.size[1] : band.h,
      bandId: band.id,
    };
  });

  return finishScene({
    doc,
    frame,
    layers: doc.layers.length ? bands : [],
    nodes,
    marks: [],
  });
}
