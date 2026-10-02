/**
 * A legend the diagram writes for itself.
 *
 * Where colour and shape carry meaning, the page has to say what the meaning
 * is. A reader should not have to infer that a rounded end marks an exit, or
 * that green and rose are two different kinds of ending. Only the dialects
 * where colour encodes *kind* get one — in a layered diagram the rail labels
 * already name what the colours mean.
 */

import { kindAccent } from './tokens.mjs';

const EXIT_KINDS = new Set(['terminal', 'error', 'end']);

/** label, note and shape per kind, in the order a reader meets them. */
const MEANINGS = {
  lifecycle: [
    ['initial', 'entry', 'where it starts'],
    ['active', 'working', 'something is running'],
    ['waiting', 'waiting', 'nothing runs until something external happens'],
    ['terminal', 'exit · finished', 'it stopped here, as intended'],
    ['error', 'exit · failed', 'it stopped here, with an error'],
  ],
  workflow: [
    ['start', 'start', 'where the process begins'],
    ['action', 'step', 'work that happens'],
    ['gate', 'decision', 'the path branches here'],
    ['parallel', 'fan-out', 'several things at once'],
    ['wait', 'waiting', 'paused until something else happens'],
    ['end', 'exit', 'the process is over'],
  ],
};

/**
 * @returns {{label, note, accent, shape}[]} empty when the document already has
 * a legend, has layers to colour by, or is a type without kind colouring.
 */
export function autoLegend(doc) {
  if ((doc.legend || []).length) return [];
  if ((doc.layers || []).length) return [];

  const meanings = MEANINGS[doc.diagram_type];
  if (!meanings) return [];

  const present = new Set((doc.nodes || []).map((n) => n.kind));
  return meanings
    .filter(([kind]) => present.has(kind))
    .map(([kind, label, note]) => ({
      label,
      note,
      accent: kindAccent(doc.diagram_type, kind),
      shape: EXIT_KINDS.has(kind) ? 'pill' : 'box',
    }));
}
