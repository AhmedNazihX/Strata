/**
 * Fill in everything the author was allowed to leave out, so every layout
 * engine downstream sees a complete document and never has to guess.
 */

import { GEO, accentFor, kindAccent } from '../render/tokens.mjs';
import { autoLegend } from '../render/legend.mjs';
import { LINK_VARIANTS, NODE_KINDS } from './docs.mjs';

const DEFAULT_STEP_SECONDS = 8;

export function normalize(input) {
  const doc = structuredClone(input);
  const type = doc.diagram_type;

  doc.meta = {
    theme: 'dark',
    motion: 'on',
    autoplay: true,
    stepSeconds: DEFAULT_STEP_SECONDS,
    width: GEO.pageW,
    height: GEO.pageH,
    subtitle: '',
    ...doc.meta,
  };

  doc.layers = (doc.layers || []).map((layer, index) => ({
    note: '',
    ...layer,
    index,
    accent: accentFor(index, layer.accent),
  }));

  const layerById = new Map(doc.layers.map((l) => [l.id, l]));
  const nextCol = new Map();

  doc.nodes = (doc.nodes || []).map((node, index) => {
    const layerId = node.layer || doc.layers[0]?.id;
    const layer = layerById.get(layerId);
    const assigned = nextCol.get(layerId) ?? 0;
    const span = node.span ?? 1;
    const col = node.col ?? assigned;
    nextCol.set(layerId, col + span);

    return {
      sublabel: '',
      tag: '',
      detail: '',
      sources: [],
      ...node,
      index,
      layer: layerId,
      kind: node.kind || NODE_KINDS[type][0],
      col,
      // Recorded because `col` has just been filled in for every node, and a
      // layout that honours the author's columns cannot tell them apart from
      // the defaults afterwards.
      colGiven: Number.isInteger(node.col),
      span,
      accent: layer ? layer.accent : (kindAccent(type, node.kind || NODE_KINDS[type][0]) ?? accentFor(index)),
      layerIndex: layer ? layer.index : 0,
    };
  });

  doc.links = (doc.links || []).map((link, index) => ({
    label: '',
    detail: '',
    sources: [],
    ...link,
    index,
    id: link.id || `link-${index + 1}`,
    variant: link.variant || LINK_VARIANTS[type][0],
  }));

  doc.steps = (doc.steps || []).map((step, index) => ({
    ...step,
    index,
    nodes: step.nodes || [],
    links: step.links || [],
    notes: step.notes || [],
  }));

  const legend = (doc.legend || []).length ? doc.legend : autoLegend(doc);
  doc.legend = legend.map((entry, index) => ({
    note: '',
    shape: 'box',
    ...entry,
    accent: entry.accent || accentFor(index),
  }));

  return doc;
}
