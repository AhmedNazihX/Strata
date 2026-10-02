/**
 * The links leaving each node that have something to show: code they cite, or
 * a detail explaining them.
 *
 * A link has no panel of its own — it is a thin line, not a click target — so
 * what it has to say is shown on the panel of the node it leaves, under the
 * name of the node it reaches. One function, because the SVG (which nodes
 * open) and the viewer data (what they show) must agree on the answer.
 */

/** @returns {Map<string, {to: string, label: string, sources: string[], detail?: string}[]>} */
export function citedLinksByNode(scene) {
  const labelOf = new Map(scene.nodes.map((n) => [n.id, n.label]));
  const out = new Map();
  for (const link of scene.links) {
    const sources = link.sources || [];
    if (!sources.length && !link.detail) continue;
    const entry = {
      to: labelOf.get(link.to) || link.to,
      label: link.label || '',
      sources,
      ...(link.detail ? { detail: link.detail } : {}),
    };
    out.set(link.from, [...(out.get(link.from) || []), entry]);
  }
  return out;
}
