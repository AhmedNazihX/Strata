/**
 * Document to HTML: normalise, lay out, render.
 */

import { layout as architecture } from '../layout/architecture.mjs';
import { layout as workflow } from '../layout/workflow.mjs';
import { layout as sequence } from '../layout/sequence.mjs';
import { layout as dataflow } from '../layout/dataflow.mjs';
import { layout as lifecycle } from '../layout/lifecycle.mjs';
import { normalize } from '../schema/normalize.mjs';
import { renderHtml } from './shell.mjs';
import { GEO } from './tokens.mjs';

export const LAYOUTS = { architecture, workflow, sequence, dataflow, lifecycle };

/* A column narrower than this cannot hold a sublabel without wrapping it, and a
   wrapped sublabel in a narrow column is what turns a node into a square. */
const MIN_COLUMN = 142;
const MAX_AUTO_WIDTH = 2200;
const MAX_AUTO_HEIGHT = 1600;
/* Clipped text is fixed by width a step at a time, because how much a wrapped
   sublabel needs is only known once it has been laid out again. */
const CLIPPED_STEP = 1.12;
const MAX_WIDEN_ATTEMPTS = 4;
/* Growing the canvas re-centres the rails, so one step can land short. */
const MAX_GROW_ATTEMPTS = 4;

export function buildScene(doc) {
  const engine = LAYOUTS[doc.diagram_type];
  if (!engine) throw new Error(`no layout engine for diagram_type "${doc.diagram_type}"`);

  let current = normalize(doc);
  let scene = engine(current);
  for (let attempt = 0; attempt < MAX_WIDEN_ATTEMPTS; attempt += 1) {
    const widened = widenIfCramped(current, scene);
    if (!widened) break;
    current = widened;
    scene = engine(current);
  }
  for (let attempt = 0; attempt < MAX_GROW_ATTEMPTS; attempt += 1) {
    const grown = growIfClipped(current, scene);
    if (!grown) break;
    current = grown;
    scene = engine(current);
  }
  return scene;
}

/**
 * The same move on the other axis. Rails have a minimum height, so a document
 * with many of them can need more canvas than the page gives it; the author
 * asked for the rails, not for a page height, so the page is what grows.
 */
function growIfClipped(doc, scene) {
  const { canvas } = scene.frame;
  const bottom = Math.max(
    ...scene.nodes.map((node) => node.y + node.h),
    ...(scene.layers || []).map((layer) => layer.y + layer.h),
    // Lines and their labels are drawn too. A sequence's messages are links,
    // not nodes, and a sweep loops below the last rail.
    ...scene.links.flatMap((link) => link.points.map(([, y]) => y + GEO.linkGap)),
    ...scene.links.filter((link) => link.labelAt).map((link) => link.labelAt.y + link.labelAt.h),
  );
  const overflow = bottom - (canvas.y + canvas.h);
  if (!(overflow > 0.5)) return null;

  const target = Math.min(MAX_AUTO_HEIGHT, Math.ceil((doc.meta.height + overflow) / 10) * 10);
  if (target <= doc.meta.height) return null;
  return { ...doc, meta: { ...doc.meta, height: target } };
}

/**
 * Lay out once, look at what the columns actually came out as, and if they are
 * too narrow — or a label in one of them is clipped — give the page more width
 * and lay out again. The author asked for a
 * number of columns, not for a canvas size, so the canvas is the thing to move.
 */
function widenIfCramped(doc, scene) {
  const automatic = scene.nodes.filter((node) => !node.size);
  if (!automatic.length) return null;

  const narrowest = Math.min(...automatic.map((node) => node.w));
  const clipped = automatic.some((node) => node.fit.truncated);
  if (narrowest >= MIN_COLUMN && !clipped) return null;

  const needed = Math.max(
    narrowest < MIN_COLUMN ? doc.meta.width * (MIN_COLUMN / narrowest) : 0,
    clipped ? doc.meta.width * CLIPPED_STEP : 0,
  );
  const target = Math.min(MAX_AUTO_WIDTH, Math.round(needed / 10) * 10);
  if (target <= doc.meta.width) return null;

  return { ...doc, meta: { ...doc.meta, width: target } };
}

export function render(doc, options = {}) {
  return renderHtml(buildScene(doc), options);
}
