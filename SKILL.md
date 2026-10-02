---
name: strata
description: Create narrated architecture, workflow, sequence, data-flow and lifecycle diagrams as one self-contained interactive HTML file — layered, animated, theme-switchable, exportable to PNG and SVG. The author writes typed JSON and a CLI computes the layout, so coordinates are never guessed. Use when asked to diagram or visualise a system, a service architecture, a request path, a process or runbook, an API call sequence, a data pipeline or lineage, a state machine, or to turn a repository into an explorable map; also for converting Mermaid flowchart, sequenceDiagram or stateDiagram input into something presentable.
license: MIT
metadata:
  version: "1.0"
---

# Strata

A diagram is a claim about how something works. This skill makes that claim checkable:
you write typed JSON, a CLI computes the layout, and four gates run before anything is
called finished. **You never write HTML and you never place coordinates.**

## Running it

The CLI lives beside this file, at `bin/strata.mjs`. **Resolve it relative to this skill's
own directory** — it works the same whether the skill is installed for your user
(`~/.claude/skills/strata/`) or inside a project (`<repo>/.claude/skills/strata/`):

```
node <this-skill-dir>/bin/strata.mjs <command> ...
```

If `strata` is on the PATH, use that instead. `strata doctor` confirms which install is
answering. Every example below writes `strata`; substitute the path form when it is not on
the PATH.

## The fast path

1. **Pick a type** from the router below. One question decides it: what is the reader
   meant to learn?
2. **Read one example and the authoring reference** — `examples/<type>.mjs` and
   `references/authoring.md` — in a single batch. Examples teach shape, never facts: use
   fresh ids, your own wording, your own structure.
3. **Write the candidate JSON** straight through. Do not plan coordinates in prose, do not
   build a smaller diagram first, do not validate a stub. Give it a `layers` list, a `nodes`
   list with `layer` and `col` (in a `workflow`, leave `col` out unless you are pinning a
   node: the flow places the rest), a `links` list where every link has an `id`, and —
   unless the user asked for a still diagram — a `steps` walkthrough.
4. **Run one command.** Keep the candidate unchanged while it runs.

   ```
   strata finalize candidate.json
   ```

   For a diagram that describes real code, include the evidence on the first draft:
   `--repo-root <path>` checks every `sources` entry against the checkout.

5. **A non-zero exit is never success.** Read the failing gate, fix the cause it names, and
   rerun the same command. `references/troubleshooting.md` has every message and its fix.
6. **For a diagram of real code, have it reviewed before handing it over.** A reviewer agent
   in a fresh context checks every node, link and label against the code and hunts for
   connections the diagram leaves out (`references/repository-evidence.md`, step 7). The
   gates cannot do this: they prove the diagram is legible, not that it is true.

Unless the user names a location, put each request in its own folder
`.strata/<type>-<slug>/` with `candidate.json` and the HTML beside it, and set
`meta.output` to that HTML's name. A later request gets a new folder, so earlier versions
survive.

## Type router

| Type | The reader learns | Layers are |
|---|---|---|
| `architecture` | which tier a component lives in and what talks to what | tiers, as horizontal rails |
| `workflow` | what happens in what order and where it branches | optional swimlanes |
| `sequence` | who calls whom, in what order, down a time axis | participants, as columns |
| `dataflow` | where data comes from, what changes it, who consumes it | pipeline stages, as columns |
| `lifecycle` | what states a thing can be in and what moves it | optional groups |

Ambiguous between `architecture` and `workflow`? Ask whether the boxes are *things* or
*steps*. Between `workflow` and `lifecycle`? A workflow is done once; a lifecycle is where
something sits.

## Mermaid input

Read it for topology and meaning, then author fresh Strata JSON. Do not transliterate
its styling. `flowchart`/`graph` → `workflow`, or `architecture` when the boxes are
components. `sequenceDiagram` → `sequence`. `stateDiagram` → `lifecycle`.

## The gates

`finalize` runs these in order and stops at the first failure.

| Gate | What it proves |
|---|---|
| schema | shape, limits, every reference resolves, and with `--repo-root` that every cited file and line exists **and holds actual code rather than only a docstring** |
| geometry | on the computed layout — boxes, lines and labels alike: no overlapping boxes; no box, line point or label outside the canvas; every segment horizontal or vertical; no connector drawn through — or within 10px alongside — a node it does not touch; no two unrelated connectors on one track; every label within 48px of its own line, nearer it than any other, and clear of other lines, labels and box text; no clipped label; no caption that does not fit |
| render | one self-contained HTML written |
| browser | the file loaded in real Chromium **and WebKit**: no script error, every text run measured inside its box, every step lights something and says something, a citation opens its code, the pulses actually move, the theme toggle works, and nothing relies on a CSS feature WebKit will not paint |

The browser gate needs Playwright resolvable from the working directory or beside the skill,
and runs **both Chromium and WebKit** — Safari and Chrome disagree often enough that passing
in one proves nothing about the other. `doctor` says what is available; the receipt names the
engines that actually ran and any that did not. Restrict it with `--browsers chromium`.

If Playwright is missing, either install it
(`npm i -D playwright && npx playwright install chromium webkit`) or pass `--no-browser` —
which reports the gate as **skipped**, not passed, and leaves clipped text and script errors
unverified. Say so when you hand the file over.

Warnings (`~`) never fail a run. They are worth acting on: a label sitting on a node, links
that need three bends, crossings, a node connected to nothing.

## Other commands

```
validate candidate.json        schema and geometry only, no file written
render   candidate.json        write the HTML, skip the browser gate
check    diagram.html          run the browser gate against a file that exists
demo     <dir>                 write and render one example of each type
schema   <dir>                 emit the five JSON Schemas for editor autocomplete
doctor                         what this install can do
```

## What the reader gets

One HTML file with no build step and no server. Dark and light themes on a button or `T`,
and animation on a button or `M`. Arrow keys, space, `1`–`9` and the step bars drive the
walkthrough; it also autoplays.
Clicking a node with a `detail` or `sources` opens it. When the diagram was built with
`--repo-root`, each citation in that panel is a button: clicking it opens the actual code,
with the cited lines marked in green. The code is embedded in the file, so it still works
for someone who does not have the repository. Copy to clipboard, PNG at 2×, and vector SVG
from the toolbar. Deep links: `#step=4`, `#theme=light`, `#motion=on`, `#node=<id>`.

**Animation follows the system's reduced-motion setting by default**, so a diagram can look
alive in one browser and still in another on the same machine. The `M` button overrides it
for that document and remembers the choice.

The only network reference is the web-font stylesheet; offline the page falls back to a
local stack and still reads correctly. `references/style.md` describes the style language
and the levers you have over it.

## Honesty

- Report the gates as they came back. Never describe a skipped gate as passed, and never
  claim you looked at the rendered diagram unless you opened it.
- `sources` entries are checked, and their code embedded, only when `--repo-root` is passed.
  Without it the citations are unverified and open nothing — say so.
- **Passing every gate means the diagram is legible and its citations resolve. It does not
  mean the diagram is complete or correct.** Say which of the two you checked, and whether a
  reviewer looked for missing connections.
- Cite the implementation, never `file.py:1-30`. That range is the module docstring, and a
  citation made of prose is not evidence. The gate fails it.
- A diagram of real code is traced from the code. `references/repository-evidence.md` is
  the procedure; the short version is that every claim in the diagram should be something
  you read, not something the stack implies.
