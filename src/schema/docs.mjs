/**
 * The five document schemas.
 *
 * They are deliberately one shape with five dialects rather than five models:
 * every diagram is layers, nodes, links and an optional narrated step sequence.
 * What changes per type is the vocabulary (which node kinds and link variants
 * mean something) and whether layers are required. One shape means one
 * renderer, one validator and one mental model for the author.
 */

import { arr, bool, enumOf, int, lit, num, obj, ref, str, tuple } from './kit.mjs';

export const DIAGRAM_TYPES = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'];

/** Node vocabulary per diagram type. The first entry is the fallback. */
export const NODE_KINDS = {
  architecture: ['service', 'ui', 'store', 'queue', 'compute', 'edge', 'security', 'external'],
  workflow: ['action', 'start', 'gate', 'parallel', 'wait', 'end'],
  sequence: ['service', 'actor', 'store', 'external'],
  dataflow: ['transform', 'source', 'ingest', 'store', 'serve', 'consumer'],
  lifecycle: ['active', 'initial', 'waiting', 'terminal', 'error'],
};

/** Link vocabulary per diagram type. */
export const LINK_VARIANTS = {
  architecture: ['solid', 'dashed', 'emphasis', 'security', 'async'],
  workflow: ['next', 'yes', 'no', 'retry', 'escalate'],
  sequence: ['call', 'return', 'async', 'error', 'self'],
  dataflow: ['batch', 'stream', 'cdc', 'derived'],
  lifecycle: ['transition', 'retry', 'timeout', 'failure'],
};

/** Layers are mandatory for the types whose whole reading is "which tier". */
export const LAYERS_REQUIRED = {
  architecture: true, dataflow: true, sequence: true, workflow: false, lifecycle: false,
};

/** What a layer is called in each dialect, for error messages and docs. */
export const LAYER_NOUN = {
  architecture: 'layer', workflow: 'lane', sequence: 'participant',
  dataflow: 'stage', lifecycle: 'group',
};

const ACCENTS = ['blue', 'teal', 'amber', 'violet', 'green', 'rose', 'gold', 'cyan'];
const SIDES = ['top', 'bottom', 'left', 'right'];

const point = () => tuple([num(), num()]);
const size = () => tuple([num({ min: 40 }), num({ min: 28 })]);

const sourceRef = str({
  max: 160,
  pattern: '^[^\\s:][^:]*(:\\d+(-\\d+)?)?$',
  describe: 'A repo-relative path, optionally with :line or :start-end. Checked against --repo-root.',
});

const meta = obj({
  title: str({ min: 1, max: 72 }),
  subtitle: str({ max: 120 }),
  output: str({ min: 1, max: 240, pattern: '^[^/\\\\][^\\\\]*\\.html$', describe: 'Relative path of the HTML to write.' }),
  theme: enumOf(['dark', 'light'], { describe: 'Opening theme. The viewer can switch either way.' }),
  motion: enumOf(['on', 'off'], { describe: 'Travelling pulses on active links. "off" still highlights.' }),
  autoplay: bool({ describe: 'Advance through the steps unattended on load.' }),
  stepSeconds: num({ min: 3, max: 30 }),
  width: num({ min: 900, max: 2600 }),
  height: num({ min: 600, max: 1800 }),
  repository: obj({
    url: str({ max: 240 }),
    ref: str({ max: 80, describe: 'Commit or tag the diagram was traced at.' }),
  }, { required: [] }),
}, { required: ['title', 'output'] });

const layer = obj({
  id: ref('layers'),
  name: str({ min: 1, max: 24, why: 'the layer label column is 164px wide' }),
  note: str({ max: 64, why: 'the note wraps to two lines under the name' }),
  accent: enumOf(ACCENTS, { describe: 'Defaults to the ramp position.' }),
}, { required: ['id', 'name'] });

function nodeSpec(type) {
  return obj({
    id: ref('nodes'),
    layer: ref('layers'),
    label: str({ min: 1, max: 40, why: 'a node box clips longer text' }),
    sublabel: str({ max: 64, why: 'the sublabel wraps to two lines inside the box' }),
    tag: str({ max: 24 }),
    kind: enumOf(NODE_KINDS[type]),
    col: int({ min: 0, max: 48, describe: 'Column on the layer. Leave it out and placement follows declaration order.' }),
    span: int({ min: 1, max: 12, describe: 'How many columns the box covers.' }),
    pos: point(),
    size: size(),
    detail: str({ max: 400, describe: 'Shown when a viewer opens the node.' }),
    sources: arr(sourceRef, { max: 12 }),
  }, { required: ['id', 'label'] });
}

function linkSpec(type) {
  return obj({
    id: ref('links'),
    from: ref('nodes'),
    to: ref('nodes'),
    label: str({ max: 28, why: 'a link label sits on the run and cannot wrap' }),
    variant: enumOf(LINK_VARIANTS[type]),
    fromSide: enumOf(SIDES),
    toSide: enumOf(SIDES),
    via: arr(point(), { max: 8, describe: 'Explicit bends. Only for a route the engine cannot find.' }),
    detail: str({ max: 400 }),
    sources: arr(sourceRef, { max: 6, describe: 'The code that makes this connection. Shown on the panel of the node it leaves.' }),
  }, { required: ['from', 'to'] });
}

const note = obj({
  k: str({ min: 1, max: 40, why: 'the key is one mono line in a caption chip' }),
  v: str({ min: 1, max: 180, why: 'the value wraps to two lines in a caption chip' }),
}, { required: ['k', 'v'] });

const step = obj({
  title: str({ min: 1, max: 60 }),
  lede: str({ min: 1, max: 700, why: 'the caption column is 640px wide and seven lines tall' }),
  nodes: arr(str({ pattern: '^(\\*|[a-z0-9][a-z0-9_-]{0,47})$' }), { max: 64, describe: 'Node ids to light up, or ["*"] for all.' }),
  links: arr(ref('links'), { max: 64 }),
  notes: arr(note, { max: 6, why: 'the chip grid is two columns by three rows' }),
}, { required: ['title', 'lede'] });

const legendEntry = obj({
  label: str({ min: 1, max: 40 }),
  note: str({ max: 90 }),
  accent: enumOf(ACCENTS),
  shape: enumOf(['box', 'pill'], { describe: 'The swatch shape, matching how those nodes are drawn.' }),
}, { required: ['label'] });

export function documentSpec(type) {
  return obj({
    schema_version: lit(1),
    diagram_type: lit(type),
    meta,
    layers: arr(layer, { max: 10, why: 'more than ten rails stops reading as layers' }),
    nodes: arr(nodeSpec(type), { min: 1, max: 80 }),
    links: arr(linkSpec(type), { max: 160 }),
    steps: arr(step, { max: 24, why: 'a walkthrough longer than this is two diagrams' }),
    legend: arr(legendEntry, { max: 8 }),
  }, { required: ['schema_version', 'diagram_type', 'meta', 'nodes'] });
}

export const SPECS = Object.fromEntries(DIAGRAM_TYPES.map((t) => [t, documentSpec(t)]));
