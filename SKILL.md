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

The CLI lives beside this file, at `bin/strata.mjs`. Resolve it relative to this skill's
own directory, which works whether the skill is installed for the user
(`~/.claude/skills/strata/`) or inside a project (`<repo>/.claude/skills/strata/`):

```
node <this-skill-dir>/bin/strata.mjs <command> ...
```

If `strata` is on the PATH, use that instead; `strata doctor` says which install answers.
Examples below write `strata`.

## The fast path

0. **For a diagram of real code, ask first whether the user wants code mapping** — each
   node and link citing the lines it rests on, embedded so a click opens the code. Ask once,
   before reading the repository, with a single question (AskUserQuestion where available):
   *with code mapping* (slower: exact line citations, `--repo-root` checks, a reviewer
   agent) or *without* (faster: the same tracing, no citations). Skip the question when the
   user already said, or when the diagram is not of a repository. The choice sets the
   **mode** used in steps 2, 4 and 6 and in `references/repository-evidence.md`.
1. **Pick a type** from the router below. One question decides it: what is the reader
   meant to learn?
2. **Read one example and the authoring reference** — `examples/<type>.mjs` and
   `references/authoring.md` — in a single batch. For a diagram of real code, also
   `references/repository-evidence.md`. Examples teach shape, never facts: use fresh ids,
   your own wording, your own structure. Without code mapping, skip the Citations section
   of that reference; the tracing rules still apply.
3. **Write the candidate JSON** straight through. Do not plan coordinates in prose or
   validate a stub. Give it `layers`, `nodes` (with `layer`, and `col` except in a
   `workflow`), `links` that all have an `id`, and — unless the user asked for a still
   diagram — a `steps` walkthrough whose ledes explain *why*, not only *what*.
4. **Iterate with `validate`.** It runs the schema and geometry gates in about a tenth of a
   second and writes nothing. Fix what it names and rerun until it exits 0. For a diagram
   of real code **with code mapping**, pass `--repo-root <path>` from the first run so every
   citation is checked. Without it, write no `sources`, omit `--repo-root`, and ignore the
   "links cite no code" warning.

   ```
   strata validate candidate.json --repo-root <path>
   ```

5. **Then run `finalize` once.** It repeats those gates, renders the HTML and runs the
   browser gate, which takes several seconds. A non-zero exit is never success: fix the
   cause and rerun. Every failure message says what to do; `references/troubleshooting.md`
   covers the rare cases it does not.
6. **For a diagram of real code with code mapping, have it reviewed before handing it
   over.** A reviewer agent in a fresh context checks every node, link and label against the
   code and looks for connections the diagram leaves out (`references/repository-evidence.md`,
   step 6). Without code mapping, skip the review and offer it when you hand the diagram
   over.

Unless the user names a location, put each request in its own folder
`.strata/<type>-<slug>/` with `candidate.json` and the HTML beside it, and set
`meta.output` to that HTML's name, so earlier versions survive.

## Type router

| Type | The reader learns | Layers are |
|---|---|---|
| `architecture` | which tier a component lives in and what talks to what | tiers, as horizontal rails |
| `workflow` | what happens in what order and where it branches | optional swimlanes |
| `sequence` | who calls whom, in what order, down a time axis | participants, as columns |
| `dataflow` | where data comes from, what changes it, who consumes it | pipeline stages, as columns |
| `lifecycle` | what states a thing can be in and what moves it | optional groups |

Boxes that are *things* make an architecture; boxes that are *steps* make a workflow. A
workflow is done once; a lifecycle is where something sits.

**Mermaid input:** read it for topology and meaning, then author fresh Strata JSON without
its styling. `flowchart`/`graph` → `workflow` (or `architecture` when the boxes are
components), `sequenceDiagram` → `sequence`, `stateDiagram` → `lifecycle`.

## The gates

| Gate | What it proves |
|---|---|
| schema | shape, limits and references; with `--repo-root`, every citation resolves inside the checkout and lands on code, not prose |
| geometry | on the computed layout: nothing overlaps, clips or leaves the canvas; lines keep clear of boxes and of each other; every drawn label reads as naming its own line (the numbers are in `authoring.md`, under Limits) |
| render | one self-contained HTML written |
| browser | the page in real **Chromium and WebKit**: no script error, text inside its boxes, every step lights something, citations open their code, pulses move, the theme toggles, nothing WebKit will not paint |

The browser gate needs Playwright, from the working directory or beside the skill; `doctor`
says what is available, and the receipt names the engines that ran. If it is missing,
install it (`npm i -D playwright && npx playwright install chromium webkit`) or pass
`--no-browser`, which reports the gate as **skipped**, not passed — say so.

Warnings (`~`) never fail a run, but read them: a label left off, a label resting on a box,
crossings, a node connected to nothing, a link that cites no code.

## Other commands

```
render   candidate.json        write the HTML, skip the browser gate
check    diagram.html          run the browser gate against a file that exists
demo     <dir>                 write and render one example of each type
schema   <dir>                 emit the five JSON Schemas for editor autocomplete
doctor                         what this install can do
```

## What the reader gets

One HTML file with no build step or server. Themes on `T`, animation on `M` (it follows the
system's reduced-motion setting until overridden); arrow keys, space, `1`–`9` and the step
bars drive the walkthrough, which also autoplays. Clicking a node with a `detail` or
`sources` opens its panel, which also lists the links leaving it; with `--repo-root` each
citation opens the embedded code with the cited lines marked. Copy, PNG at 2× and SVG are
on the toolbar. Deep links: `#step=4`, `#theme=light`, `#motion=on`, `#node=<id>`. The only
network reference is the web-font stylesheet. `references/style.md` covers the style levers.

## Honesty

- Report the gates as they came back. A skipped gate is not a passed one, and do not claim
  you looked at the rendered page unless you opened it.
- Citations are checked and embedded only with `--repo-root`; without it, say they are
  unverified. A diagram built without code mapping has none: say so, and that nodes open
  no code.
- **Passing every gate means the diagram is legible and its citations resolve, not that it
  is complete or correct.** Say whether a reviewer looked for missing connections.
- A diagram of real code is traced from the code: every claim is something you read, not
  something the stack implies (`references/repository-evidence.md`).
