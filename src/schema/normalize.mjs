/**
 * Fill in everything the author was allowed to leave out, so every layout
 * engine downstream sees a complete document and never has to guess.
 */

import { GEO, accentFor } from '../render/tokens.mjs';
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
      span,
      accent: layer ? layer.accent : accentFor(index),
      layerIndex: layer ? layer.index : 0,
    };
  });

  doc.links = (doc.links || []).map((link, index) => ({
    label: '',
    detail: '',
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

  doc.legend = (doc.legend || []).map((entry, index) => ({
    note: '',
    ...entry,
    accent: accentFor(index, entry.accent),
  }));

  return doc;
}
