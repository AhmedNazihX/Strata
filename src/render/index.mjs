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

export const LAYOUTS = { architecture, workflow, sequence, dataflow, lifecycle };

/* A column narrower than this cannot hold a sublabel without wrapping it, and a
   wrapped sublabel in a narrow column is what turns a node into a square. */
const MIN_COLUMN = 142;
const MAX_AUTO_WIDTH = 2200;

export function buildScene(doc) {
  const engine = LAYOUTS[doc.diagram_type];
  if (!engine) throw new Error(`no layout engine for diagram_type "${doc.diagram_type}"`);

  const normalized = normalize(doc);
  const first = engine(normalized);
  const widened = widenIfCramped(normalized, first);
  return widened ? engine(widened) : first;
}

/**
 * Lay out once, look at what the columns actually came out as, and if they are
 * too narrow give the page more width and lay out again. The author asked for a
 * number of columns, not for a canvas size, so the canvas is the thing to move.
 */
function widenIfCramped(doc, scene) {
  const automatic = scene.nodes.filter((node) => !node.size);
  if (!automatic.length) return null;

  const narrowest = Math.min(...automatic.map((node) => node.w));
  if (narrowest >= MIN_COLUMN) return null;

  const needed = doc.meta.width * (MIN_COLUMN / narrowest);
  const target = Math.min(MAX_AUTO_WIDTH, Math.round(needed / 10) * 10);
  if (target <= doc.meta.width) return null;

  return { ...doc, meta: { ...doc.meta, width: target } };
}

export function render(doc, options = {}) {
  return renderHtml(buildScene(doc), options);
}
