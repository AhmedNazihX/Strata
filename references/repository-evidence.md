# Diagramming real code

A diagram of a system you have read is worth something. A diagram of a system you assumed
is worse than none, because it is confidently wrong and it looks the same.

## The procedure

Steps 1–4 apply in both modes. **Without code mapping** (the user chose the faster mode),
skip step 5 and the Citations section — write no `sources` and do not pass `--repo-root` —
and skip step 6 unless the user asks for a review. Still draw only what you opened: the
speed comes from not pinning line ranges, not from tracing less.

1. **Find the entry points first.** The route table, the CLI commands, the graph
   definition, the worker's subscribe call. These are the nodes; everything else is detail
   hanging off them.
2. **Trace one real path end to end** before drawing anything. Follow a request, a message
   or a job from where it arrives to where it stops. That path becomes the spine of the
   diagram and usually the first half of the walkthrough.
3. **Draw only what you opened.** If the diagram says the API writes to Redis, you should be
   able to name the file. A dependency in `package.json` proves the library is installed,
   not where it is used.
4. **Sweep each box's outbound dependencies.** Drawing only what you opened stops invented
   arrows, not missing ones, and a missing arrow is the commoner error. For every node, list
   what its code actually reaches — database reads and writes, storage, every HTTP client,
   every model call, every tool it binds — by searching its module and what it calls, not
   by remembering. Each becomes a link, or a line in that node's `detail` saying why it is
   left out. A node whose code calls a model and has no link to the model provider is the
   shape this step exists to catch.
5. **Cite as you go**, on every node with a non-obvious claim **and on every link**: the
   line that makes the call, the query that writes the row. Pass `--repo-root` from the
   first `validate`, so every citation is checked as you write it.
6. **Have it reviewed in a fresh context.** The gates prove the diagram is legible and its
   citations resolve, not that it is complete or that a label is true. Hand the candidate
   and the repository to a reviewer agent that did not write it, asking it to check every
   node, link and label against the code and to look for connections the code makes that
   the diagram does not show. Fix what it finds and run `finalize` again.

## Citations

```jsonc
"sources": ["src/agent/graph.py:510-551", "src/routers/bids.py:88", "infra/compose.yaml"]
```

Repository-relative, with an optional `:line` or `:start-end`, on nodes and links alike.
With `--repo-root` the cited lines are embedded in the HTML, so a reader opens the real
code — cited range marked, four lines of context either side — without the repository.
A link's citations appear on the panel of the node it leaves. Record what you traced in
`meta.repository: { "url": "…", "ref": "9f1a1cf" }`; a diagram without a ref describes a
moving target.

**Cite the code, not the prose about it.** `file.py:1-30` is almost always the module
docstring: it proves somebody described the behaviour, not that it is there. Cite the
definition, and where a function opens with a long docstring, the body under it. The gate
fails a range with no code in it (imports do not count), one that starts or ends inside a
docstring or block comment (a range a line off), any documentation file, a path that
leaves the checkout, and files that hold secrets by their kind (`.env`, keys,
certificates). A one-line citation opens nine lines of context and reads well; if a claim
needs forty lines of support, it is probably two claims on two nodes.

## Labels are claims

- **A sublabel that lists things lists all of them.** "bids, documents, chat, tenders" over
  a module with eight routers says the other four do not exist. List them all, give the
  count, or say what the list is a sample of.
- **A label that names one effect of a call names the effect that matters.** An arrow
  labelled "embed" that also carries a model call hides the call.
- **A layer in an architecture diagram is a runtime boundary.** Splitting one process into
  two rails reads as two deployables; if the split is for readability, say "same process"
  in both rails' notes.

## What to leave out

Everything the reader can get from the file tree. The value is in what is *not* obvious:
which call is synchronous, where a human has to intervene, which store is the system of
record, what happens on the failure branch. If a sublabel could be guessed from the node's
name, spend that line on something else. If you could not trace something, leave it out or
say so in that node's `detail`.
