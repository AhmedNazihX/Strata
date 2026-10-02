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
- **In a `workflow`, leave `col` out unless you mean to pin a node.** The flow places each
  step one column after the step that leads to it. A `col` you write is honoured exactly, so
  one that disagrees with the flow draws a step before the one it follows (the gate warns
  "points backwards"). Pin only to line a lane up under a node in another lane.
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
connector and cannot wrap, so keep it to two or three words. It is optional: the engine
places it only where it unmistakably names its own line, and leaves it off with a warning
when there is no such place — often the box it points at already says it.

`detail` and `sources` (the same `path:start-end` entries as a node) are shown on the
panel of the node the link leaves. In a diagram traced from code every link should cite
the code that makes the connection, or say in `detail` why there is none.

`fromSide`, `toSide` and `via` exist for a route the engine gets wrong. Reach for them after
a geometry failure, not before.

## steps

Steps are what makes this a walkthrough rather than a picture, and they are where most of
the value is. Omit them entirely for a still diagram; two or more turns on the caption panel
and the controls.

- **`nodes`** is the list of node ids to light. `["*"]` lights everything — good for an
  opening overview.
- **`links`** is the list of link ids to light and animate.
- **`lede`** is the explanation, up to seven lines (about 700 characters). Give the reader
  three things the boxes cannot: **what happens** in this step, **why it is built that
  way**, and **what would go wrong otherwise**. "The API writes the order before it answers"
  is the first; "inside the same transaction as the stock change, so a crash between them
  cannot sell an item twice" is the second and third, and it is the part a reader keeps.
  The geometry gate measures what fits.
- **`notes`** are up to six chips beside the lede. `k` names the point, `v` makes it in one
  or two lines. A note must say something neither the boxes nor the lede already say — a
  number, a limit, a reason, a consequence, a failure mode. "Retries are keyed on the order
  id, so a timeout cannot charge twice" earns its place; "Payments: authorises and
  captures" beside a box labelled exactly that does not. The gate warns about a note that
  repeats the lede. Two good notes beat six that restate.

A good walkthrough opens with one overview step, then follows one path end to end. Ten or
eleven steps is a comfortable talk; past twenty it is two diagrams.

## legend

An optional list of `{ label, note, accent, shape }` printed above the caption. `shape` is
`box` or `pill` and should match how those nodes are drawn.

**You rarely need to write one.** A lifecycle, or a workflow without lanes, generates its own
from the kinds on the page — naming the entry, the working states, and telling a finished exit
apart from a failed one. Supply your own only when you want to say something the kinds do not.

## Limits worth knowing before you write

**The page sizes itself.** It widens (up to 2200px) when columns come out under about 142px
or a label is clipped, and grows taller (up to 1600px) when rails, lines or labels need the
room, so you never compute a width or height. A page much wider than 1600 scales down on a
screen, though: past about eight columns, shorter sublabels or fewer columns beat a wider
canvas.

**What the geometry gate measures.** Columns and rails sit 40px apart, room for three links
side by side. It fails a link within 10px alongside a box it does not connect (drawn, that
reads as touching), two links with no box in common on one track (they read as one line),
and a drawn label more than 48px from its own line, nearer another line, or printed across
another line, another label or a box's text.

`label` 40 characters, `sublabel` 64, link `label` 28, layer `name` 24, step `title` 60,
`lede` 440, note `k` 40 and `v` 180. Eighty nodes, 160 links, ten layers, 24 steps. These
are guards, not targets — the geometry gate measures what actually fits, which is usually
less.
