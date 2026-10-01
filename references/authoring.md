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
there are only about twenty pixels of gutter, and a label longer than that gets lifted clear
of the row, which reads less well.

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

An optional list of `{ label, note, accent }` printed above the caption. Use it when the
accents carry meaning the layer names do not already give.

## Limits worth knowing before you write

**Columns and the canvas.** The tool lays out once, looks at how wide the columns actually
came out, and widens the page itself (up to 2200px) if they are under about 142px — a
narrower column wraps the sublabel, and a wrapped sublabel in a narrow column is what turns
a node into a square. Boxes are then held to at least 2:1 landscape wherever the text allows
it.

So you do not have to compute a width. But a page much wider than 1600 scales down further
to fit a screen, so if you find yourself past about eight columns, the cheaper fix is usually
shorter sublabels or fewer columns rather than a wider canvas.

`label` 40 characters, `sublabel` 64, link `label` 28, layer `name` 24, step `title` 60,
`lede` 440, note `k` 40 and `v` 180. Eighty nodes, 160 links, ten layers, 24 steps. These
are guards, not targets — the geometry gate measures what actually fits, which is usually
less.
