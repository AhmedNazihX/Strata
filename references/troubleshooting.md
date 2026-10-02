# When a gate fails

A non-zero exit is never success. Every message names the cause and a fix; this page is for
when the fix is not obvious. Iterate with `validate`, then run `finalize` once. Do not work
around a gate.

## schema

| Message | What to do |
|---|---|
| `is not a field this schema defines` | It suggests the nearest real field. Field names are exact. |
| `is N characters, the limit is M` | Shorten the text. The limit exists because the box is that wide. |
| `names no declared node` / `no declared layer` | A typo in an id, or a node you meant to add. The message lists what is declared. |
| `a step can only light a link that has one` | Give the links `id`s. |
| `a gate with fewer than two outgoing links` | A `gate` that cannot branch is an `action`. |
| `no state is marked "initial"` | A lifecycle needs an entry point, and an exit (`terminal` or `error`). |
| `names a file that does not exist` | A wrong `sources` path, or `--repo-root` points at the wrong checkout. |
| `… and no code` / `starts inside a docstring` / `is documentation, not code` | The citation lands on prose. Move it onto the implementation; a line comment just above the code is fine. See `repository-evidence.md`, Citations. |
| `outside the repository` / `holds secrets by its kind` | Citations are embedded in a page made to be shared, so they stay inside the checkout and never name `.env`, key or certificate files. Cite the code that reads them. |

## geometry

| Message | What to do |
|---|---|
| `overlaps nodes[x]` | Two nodes claim the same column on the same layer. Give one a different `col`, or narrow a `span`. |
| `falls outside the drawing area` / `runs outside the drawing area` | The page has grown to its limit (2200 × 1600) or a `pos` override misplaced a node. Drop a column, a rail or some messages. |
| `the label or sublabel is clipped` | The page has already widened as far as it will. Shorten the text or use fewer columns. Never widen by hand with `size`. |
| `the text is taller than its box` | A two-line sublabel in a short rail. Shorten it or use fewer layers. |
| `is drawn through a node` / `runs alongside nodes[x]` | The route has to squeeze past a box it does not connect. Reorder the columns so the two ends are adjacent or aligned; a hub linking to siblings three columns away usually wants its own rail. `fromSide`/`toSide` next, `via` last. |
| `runs on the same track as links[y]` | The gutter between them has no free lane. Reorder the columns so the two lines part, or move one end. |
| A label message — across a line, nearer another line, over a label or box text | The label would name the wrong thing. Shorten it, or drop it: a label with nowhere clear is left off automatically, with a warning. |
| `neither horizontal nor vertical` | Without `via`, a skill bug — report it. With `via`, give each point an x or a y in common with its neighbour. |
| `does not fit N lines in the caption` / `clipped in its chip` / `chips are Npx tall` | The step's `lede` or `notes` are too long. Cut them; four notes is usually better than six. |

## browser

| Message | What to do |
|---|---|
| `script: …` / `console: …` | A real error in the page. If it mentions `NaN`, a layout produced a non-finite coordinate: a skill bug, not yours. |
| `text-overflow: … overruns its box` | The exact measurement where the static estimate was optimistic. Shorten the text. |
| `step N lights no node and no link` | The step's `nodes` and `links` are empty, or every id in them is wrong. |
| `the citation opened no code` / `marks no cited line` | The source needs a line range, not just a file. |
| Any message about filters, `rx`, halos, pulses, the theme or the panel | A skill bug, not the candidate. Report it rather than working around it. |
| `Playwright is not resolvable` | `npm i -D playwright && npx playwright install chromium webkit`, or pass `--no-browser` and say the gate was skipped. |

## Warnings worth acting on

- **A label left off** — keep it by shortening it, or move what it says into the link's `detail`.
- **Links needing three or more bends, or many crossings** — the column order does not match
  the order things are reached in. Reordering removes most of them.
- **`points backwards`** (workflow) — a hand-written `col` disagrees with the flow. Leave it out.
- **`N of M links cite no code`** (with `--repo-root`) — cite the call that makes each link,
  or say in its `detail` why there is none; a `detail` answers the warning and the reader sees it.
- **`connected to nothing`** — usually a missing link, not an isolated component.
- **A note `repeats the lede`** — replace it with what the reader cannot see: a number, a
  reason, a consequence. Or drop it; two good notes beat six that restate.

## "It looks right in Chrome but not in Safari"

1. **No glow, square corners**: WebKit paints no CSS `filter` on SVG and ignores `rx` set in
   CSS. Both are asserted on every build, so a file showing this predates those checks —
   rerun `finalize` on its candidate.
2. **Nothing moves**: the system's reduce-motion setting, which Safari honours strictly.
   Press `M`, or add `#motion=on`. Low Power Mode throttles animation too.
3. **Something else**: the receipt reports how far apart the two engines drew the same
   frame (`differ by N of 255`). Healthy builds are well under 1.

## Repair discipline

Fix the cause, not the symptom. Widening a box with `size` to silence a clipping error, or
adding `via` points to silence a routing error, makes the diagram worse and the next change
harder. Both exist for geometry the engine genuinely cannot find, which is rare.
