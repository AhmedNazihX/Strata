# Diagramming real code

A diagram of a system you have read is worth something. A diagram of a system you assumed
is worse than none, because it is confidently wrong and it looks the same.

## The procedure

1. **Find the entry points first.** The route table, the CLI commands, the graph
   definition, the worker's subscribe call. These are the nodes; everything else is detail
   hanging off them.
2. **Trace one real path end to end** before drawing anything. Follow a request, a message
   or a job from where it arrives to where it stops. That path becomes the spine of the
   diagram and usually the first half of the walkthrough.
3. **Draw only what you opened.** If the diagram says the API writes to Redis, you should be
   able to name the file. A dependency in `package.json` is evidence the library is
   installed, not evidence of where it is used.
4. **Sweep each box's outbound dependencies.** "Draw only what you opened" stops invented
   arrows; it does nothing about missing ones, and a missing arrow is the commoner error.
   For every node, list what its code actually reaches — database reads and writes,
   storage, every HTTP client, every model call, every tool it binds — by searching its
   module and the functions it calls, not by remembering. Each one becomes a link, or a
   line in that node's `detail` saying why it is left out. A node whose code calls a
   model and has no link to the model provider is the shape this step exists to catch.
5. **Cite as you go**, with `sources` on the nodes that carry a non-obvious claim **and on
   every link** — the line that makes the call, the query that writes the row. A link is a
   claim too, and `--repo-root` warns about every link that cites nothing.
6. **Run `finalize` with `--repo-root`.** Every citation is checked: the file exists, and
   the line range is inside it. A citation that does not resolve fails the run.
7. **Have it reviewed in a fresh context.** The gates prove the diagram is legible and its
   citations resolve; they cannot prove it is complete or that a label is true. Hand the
   candidate and the repository to a reviewer agent that did not write it, asking it to
   check every node, link and label against the code and to look for connections the code
   makes that the diagram does not show. Fix what it finds and run `finalize` again.

## The `sources` format

```jsonc
"sources": ["src/agent/graph.py:510-551", "src/routers/bids.py:88", "infra/compose.yaml"]
```

Repository-relative, with an optional `:line` or `:start-end`. Nodes and links take the
same field. A link's citations are shown on the panel of the node it leaves, under the
name of the node it reaches, so the reader opens the box to see the evidence for its
arrows.

With `--repo-root`, the cited lines are **read at render time and embedded in the HTML**.
Clicking a citation in the viewer opens the real code with the cited range marked in green
and four lines of context either side. The reader does not need the repository, a network
connection, or a link to GitHub — the evidence travels with the claim.

## Cite the code, not the prose about it

**`file.py:1-30` is almost always wrong.** The top of a file is its module docstring, so that
range lands on a description of the behaviour rather than the behaviour. It reads as evidence
and is not: it proves somebody wrote a docstring.

Cite the definition the claim rests on — `def upload_document` at 316-354, not
`documents.py:1-30`. Where a function carries a long docstring of its own, cite the body:
the four lines that build the `Send` list, not the fifteen explaining why.

The schema gate **fails** a range containing no code at all — imports do not count as code
— and a range that starts or ends inside a docstring or block comment, which is what a
range one line off looks like. It refuses documentation files outright, and warns when
under 40% of the non-blank lines are code. All of it is measured per language, so a
comment is whatever that language says a comment is.

Citations are embedded in the page, so they must resolve inside the checkout (symlinks
included), and never name a file that holds secrets by its kind (`.env`, keys,
certificates).

Cite a range you would actually want someone to read. A one-line citation opens nine lines
of context and reads well; a forty-line citation fills the panel with green and proves
nothing in particular. If a claim needs forty lines to support it, it is probably two
claims on two nodes.

Record what you traced in `meta.repository`:

```jsonc
"repository": { "url": "https://github.com/owner/repo", "ref": "9f1a1cf" }
```

A diagram without a ref is a diagram of a moving target. The header prints both.

## Labels are claims

- **A sublabel that lists things lists all of them.** "bids, documents, chat, tenders" over
  a module with eight routers says the other four do not exist. List them all, name the
  count ("eight routers"), or say what the list is a sample of.
- **A label that names one effect of a call names the effect that matters.** An arrow
  labelled "embed" that also carries a model call hides the call.
- **A layer in an architecture diagram is a runtime boundary.** Splitting one process into
  two rails reads as two deployables. If the split is for readability, say so in both
  rails' notes ("same process").

## What to leave out

Everything the reader can get from the file tree. The value of the diagram is the parts that
are *not* obvious: which call is synchronous, where a human has to intervene, which store is
the system of record, what happens on the failure branch. If a node's sublabel could be
guessed from its name, spend that line on something else.

## Honesty when you hand it over

Without `--repo-root`, citations are unverified and open nothing in the viewer — say so. If you could not trace something
and inferred it, either leave it out or mark it in the node's `detail`. The gates check that
the diagram is well-formed and legible; only you can check that it is true.
