# Authoring a candidate

Every diagram is the same four things — layers, nodes, links and an optional narration.
What changes per type is the vocabulary and how the layout reads them.

```jsonc
{
  "schema_version": 1,
  "diagram_type": "architecture",
  "meta": { "title": "...", "output": "diagram.html" },
  "layers": [ { "id": "ui", "name": "BROWSER", "note": "what this tier is for" } ],
  "nodes":  [ { "id": "app", "layer": "ui", "col": 0, "label": "Storefront", "sublabel": "product pages" } ],
  "links":  [ { "id": "l1", "from": "app", "to": "api", "label": "HTTPS" } ],
  "steps":  [ { "title": "...", "lede": "...", "nodes": ["app"], "links": ["l1"], "notes": [] } ]
}
```

## meta

`title` and `output` are required; `output` is a relative `.html` path. The rest have
defaults worth knowing: `theme` (`dark`), `motion` (`on`), `autoplay` (`true`),
`stepSeconds` (`8`), `width` (`1600`), `height` (`900`). Widen the canvas with `width`
before you start shrinking labels. `repository: { url, ref }` prints provenance in the
header — use it whenever the diagram describes real code.

## layers

Required for `architecture`, `dataflow` and `sequence`; optional for `workflow` (swimlanes)
and `lifecycle` (groups). Order is the reading order: top to bottom for rails, left to right
for columns. Accents come from a fixed ramp in declaration order; set `accent` only to
override. `name` is a short all-caps noun. `note` is the one line that says what the layer
is *for* — it is the most-read text on the page after the title, so write it properly.

Five rails read at presentation distance. Past six, ask whether two of them are the same
tier.

## nodes

`id` and `label` are required. `layer` is required wherever layers are.

- **`col` is the column, and it is shared across every rail.** A node at `col: 3` sits
  directly under the `col: 3` node of the rail above it, which is what makes a reader's eye
  travel down a request path. Leave `col` out and nodes fill left to right in declaration
  order — fine for a simple row, wrong as soon as two rails should line up.
- **In a `workflow`, leave `col` out unless you mean to pin a node.** There the flow itself
  places each step: a node with no `col` goes one column after the step that leads to it.
  Every `col` you do write is honoured exactly, so a written `col` that disagrees with the
  flow draws a step before the one it follows; the gate warns that the link "points
  backwards". Pin a column only to line a lane up under a node in another lane.
- **`span`** widens a node across several columns. Use it for something that genuinely
  covers a range, not to fit a long label.
- **`kind`** picks the vocabulary for the type (`service`, `store`, `queue`, `external`,
  `gate`, `wait`, `terminal`, …). It is semantic, not decorative.
- **`sublabel`** is the second line inside the box: what the thing *is*, in four or five
  words. **`tag`** is a tiny corner marker for a port, a version, a flag.
- **`detail`** and **`sources`** make the node clickable in the viewer. With `--repo-root`
  each source becomes a button that opens the real code with the cited lines in green, so
  prefer a tight range over a whole function.
- **`pos` and `size`** override the computed layout. You should almost never need them; if
  you reach for them twice in one diagram, the column assignment is wrong instead.

Per-type exceptions: in `dataflow`, `col` selects the **row** within a stage, because the
horizontal axis is already spent on stages. In `lifecycle`, `col` is ignored — rank from the
initial state owns the column.

## links

`from` and `to` are required. **Give every link an `id`** — a step can only light a link
that has one, and a diagnostic can only name one.

`variant` carries meaning per type (`dashed`, `async`, `security`, `yes`, `no`, `retry`,
`return`, `stream`, `cdc`, `failure`, …) and the renderer styles it. `label` sits on the
connector and cannot wrap, so keep it to two or three words — between two adjacent boxes
there are only 40px of gutter, and a label longer than that gets lifted clear of the row.
A label must read as naming its own line: the gate fails one that is more than 48px from
it, nearer another line, printed across another line or label, or over a box's text. When
a label has no such place, drop it — a label is optional, and the box it points at often
already says it. A line's `detail` is shown on the panel of the node it leaves.

`sources` takes the same `path:start-end` entries as a node, for the code that makes the
connection. In a diagram traced from code every link should have them; see
`repository-evidence.md`.

`fromSide`, `toSide` and `via` exist for a route the engine gets wrong. Reach for them after
a geometry failure, not before.

## steps

Steps are what makes this a walkthrough rather than a picture, and they are where most of
the value is. Omit them entirely for a still diagram; two or more turns on the caption panel
and the controls.

- **`nodes`** is the list of node ids to light. `["*"]` lights everything — good for an
  opening overview.
- **`links`** is the list of link ids to light and animate.
- **`lede`** is two or three sentences. Say what happens and *why it is that way* — the
  mechanism a reader cannot infer from the boxes. About 420 characters fit; the geometry
  gate measures the real number and tells you if you are over.
- **`notes`** are up to six chips, each a `k` (a library, a component, a decision) and a `v`
  (what it is for, one or two lines). This is where a reader learns what a thing actually
  does. Write them as claims, not labels: "Holds no state of its own, so any instance can
  answer any request" beats "the API server".

A good walkthrough opens with one overview step, then follows one path end to end. Ten or
eleven steps is a comfortable talk; past twenty it is two diagrams.

## legend

An optional list of `{ label, note, accent, shape }` printed above the caption. `shape` is
`box` or `pill` and should match how those nodes are drawn.

**You rarely need to write one.** A lifecycle, or a workflow without lanes, generates its own
from the kinds on the page — naming the entry, the working states, and telling a finished exit
apart from a failed one. Supply your own only when you want to say something the kinds do not.

## Limits worth knowing before you write

**Columns and the canvas.** The tool lays out once, looks at how wide the columns actually
came out, and widens the page itself (up to 2200px) if they are under about 142px or any
label is clipped — a narrower column wraps the sublabel, and a wrapped sublabel in a narrow
column is what turns a node into a square. It grows the page's height the same way (up to
1600px) when the rails need more room than the canvas has. Boxes are then held to at least
2:1 landscape wherever the text allows it.

Columns and rails sit 40px apart: room for up to three links to pass between them, 6px from
each other and 11px clear of the boxes. Links are routed one at a time, each taking a lane
the earlier ones left free, so two unrelated links do not ride one track. A link closer
than 10px to a box it does not connect fails the geometry gate, because at that distance it
is drawn as touching the box; so does a link sharing a track with an unrelated one, because
the two then read as a single line.

So you do not have to compute a width or a height. But a page much wider than 1600 scales down further
to fit a screen, so if you find yourself past about eight columns, the cheaper fix is usually
shorter sublabels or fewer columns rather than a wider canvas.

`label` 40 characters, `sublabel` 64, link `label` 28, layer `name` 24, step `title` 60,
`lede` 440, note `k` 40 and `v` 180. Eighty nodes, 160 links, ten layers, 24 steps. These
are guards, not targets — the geometry gate measures what actually fits, which is usually
less.
