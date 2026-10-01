# When a gate fails

A non-zero exit is never success. Read the gate that failed, fix the cause it names, and
rerun the same `finalize` command. Do not work around a gate.

## schema

| Message | What to do |
|---|---|
| `is not a field this schema defines` | It suggests the nearest real field. Field names are exact. |
| `is N characters, the limit is M` | Shorten the text. The limit exists because the box is that wide. |
| `names no declared node` / `no declared layer` | A typo in an id, or a node you meant to add. The message lists what is declared. |
| `duplicates …id` | Two things share an id. Ids are unique within their list. |
| `a step can only light a link that has one` | Give the links `id`s. |
| `a gate with fewer than two outgoing links` | A `gate` that cannot branch is an `action`. |
| `no state is marked "initial"` | A lifecycle needs an entry point, and an exit (`terminal` or `error`). |
| `names a file that does not exist` | A `sources` entry is wrong, or `--repo-root` points at the wrong checkout. |
| `is N lines of comment and no code` | The range is a docstring. `file.py:1-30` is the usual culprit — cite the definition instead. |
| `is N% code` (warning) | Mostly prose. Tighten the range onto the body of the function. |

## geometry

| Message | What to do |
|---|---|
| `overlaps nodes[x]` | Two nodes claim the same column on the same layer. Give one a different `col`, or `span` is too wide. |
| `falls outside the drawing area` | Too many columns for the canvas, or a `pos` override. Raise `meta.width`, or drop a column. |
| `the label or sublabel is clipped` | The text does not fit the computed box. Shorten it, raise `span`, or reduce how many columns share the row. Never widen by hand with `size`. |
| `the text is taller than its box` | A two-line sublabel in a short rail. Shorten the sublabel or use fewer layers. |
| `is drawn through a node it does not connect` | Set `fromSide`/`toSide` to send it round, or reorder the columns so the route is natural. `via` is the last resort. |
| `does not fit N lines in the caption` | The `lede` is too long. Cut it; the number it quotes is roughly what fits. |
| `the value is clipped in its chip` | A note's `v` needs more than two lines. Shorten it or split it into two notes. |
| `the chips are Npx tall and only Mpx fit` | Too many notes, or they are too long. Six is the maximum and four is usually better. |

## browser

| Message | What to do |
|---|---|
| `script: …` or `console: …` | A real error in the rendered page. If it mentions `NaN`, a layout produced a non-finite coordinate — that is a bug in the skill, not the candidate. |
| `text-overflow: … overruns its box` | The exact measurement, where the static estimate was optimistic. Shorten the text. |
| `step N lights no node and no link` | The step's `nodes` and `links` are both empty, or every id in them is wrong. |
| `expanding a citation hid the panel holding it` | A viewer bug in the skill, not the candidate. Report it. |
| `the citation opened no code` / `marks no cited line` | The snippet was embedded but did not render. Check the source names a line range, not just a file. |
| `the theme toggle did not change the background` | A page-level styling failure; report it rather than working around it. |
| `N pulses are drawn but none of them move` | The page is in its reduced-motion state. Usually the system setting; the gate overrides it, so seeing this means the override itself broke. |
| `N links are lit but none of them draw a pulse` | The motion class never reached the page. A viewer bug in the skill — report it. |
| `N SVG elements carry a CSS filter` | WebKit will not paint it. Draw the effect as geometry instead. A skill bug — report it. |
| `the node/rail rectangle has no rx attribute` | A corner radius set in CSS squares off in WebKit. A skill bug — report it. |
| `an active node draws no halo` | The highlight has no visible presence. A skill bug — report it. |
| `Playwright is not resolvable` | `npm i -D playwright && npx playwright install chromium`, or pass `--no-browser` and say the gate was skipped. |

## Warnings

Warnings never fail a run, and all of them are worth a second look.

- **`label "x" sits on top of nodes[y]`** — there was nowhere clear to put it. Shorten the
  label, or accept it.
- **`N of M links need three or more bends`** — the column order probably does not match the
  order things are reached in. Reordering usually removes most of the bends.
- **`N pairs of links cross`** — fine in small numbers; past a handful, reorder.
- **`N boxes are nearly square`** — a sublabel is wrapping inside a narrow column. The page
  has already been widened as far as it will go, so shorten the sublabel or use fewer
  columns.
- **`N boxes are only Npx wide`** — too many columns for the canvas. The message gives you
  the `meta.width` to use. Narrow boxes shrink the label font and read badly on a projector.
- **`x is connected to nothing`** — usually a missing link rather than an isolated component.
- **`one step is not a walkthrough`** — either drop `steps` or write the whole sequence.

## "It looks right in Chrome but not in Safari"

Three different causes, in the order they are worth checking.

1. **No glow, square corners.** Two WebKit differences that produce no error at all: it will
   not paint a CSS `filter` on an SVG element, and it does not implement `rx` as a CSS
   property. Both are now asserted by the `portability` check on every build. If you see
   this, the file was produced before those checks existed — rerun `finalize` on its
   candidate.
2. **Nothing moves.** The operating system's **reduce motion** setting, which Safari honours
   strictly. Press `M` in the viewer, or add `#motion=on` to the link. Low Power Mode throttles
   animation too, and a toggle cannot help with that one.
3. **Something else.** The gate runs both engines and reports how far apart they drew the
   same frame (`cross-engine: ... differ by N of 255`). On a healthy build that number is
   well under 1. A larger number is worth investigating even when the gate passed.

## Repair discipline

Fix the cause, not the symptom. Widening a box with `size` to silence a clipping error, or
adding `via` points to silence a routing error, makes the diagram worse and the next change
harder. Both of those exist for geometry the engine genuinely cannot find, which is rare.
