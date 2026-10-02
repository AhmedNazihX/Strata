# The style language

The look is fixed on purpose: a diagram made this week should sit beside one made last
month without reconciliation. What follows is what you get, and the few levers you have.

## Ground and colour

An ink ground (`#0D1016`) with a warm signal colour (`#FFB765`) reserved for one thing:
whatever is active right now. A link that is carrying the current step is amber and has a
pulse travelling along it; everything else is grey and dim. That contrast is the whole
reading mechanism, which is why nothing else in the palette is allowed to be warm.

Layers get accents from a fixed eight-colour ramp in declaration order — blue, teal, amber,
violet, green, rose, gold, cyan. A node wears its layer's accent on its border and its
sublabel, so colour means "which tier", never "how important".

Every colour is a CSS custom property, so the light theme is the same diagram with a
different palette rather than a second design. Both are contrast-checked.

## Type

Fraunces for the title and step headings — a serif, because a page of monospace boxes needs
one thing that is not technical. IBM Plex Sans for prose. IBM Plex Mono for every node
label, layer name and library name, because those are identifiers and should look like it.

A node label shrinks through 13px → 12 → 11 → 10 before it is ever truncated, and a sublabel
wraps to two lines before it is ever cut. If the gate reports clipping, the text is genuinely
too long for the space — shorten it, or give the node more columns.

## Shape

Boxes are landscape, at least 2:1 wherever the text allows, and they **fill their lane** with
a consistent 7px inset rather than floating inside it — a lane much taller than its box reads
as empty space rather than as a lane. Where a lane leaves more room than that, the box grows
to take it, stopping at the point where it would stop being landscape. A box that approaches square reads as a card rather than a step
in a flow, so the layout widens the page before it lets that happen, and the geometry gate
warns when it could not.

## Motion

A live link carries **one spark per straight run, all of them moving at once**. A single dot
walking the whole route leaves most of it empty most of the time; a dot on every leg lights
the entire path simultaneously, which is what makes it read as flow rather than as a
decorated line. Each spark takes about 1.6 seconds, slowed on a long run so it never darts.

An active node wears a crisp accent ring that **thickens and thins** rather than fading, with
a real bloom behind it. Lit, not merely coloured. Both stop on `Pause`, and both respect
`prefers-reduced-motion`. `meta.motion: "off"` keeps the highlighting and drops the movement
— the right choice for a diagram that will be read rather than presented.

The page also honours `prefers-reduced-motion`, which is set from the operating system, so
the same file can animate in one browser and sit still in another on the same machine. An
active node keeps a static glow either way, so a reduced-motion reader loses the movement
rather than the signal, and the `M` button overrides the preference for that document.

## Evidence

A cited node's panel shows the real code, cited lines on a green band with a green rule down
the left edge. Green appears nowhere else in the system, so it means exactly one thing:
*this is the part of the source the claim rests on*.

## Saying what the colours mean

A diagram that encodes meaning in colour and shape has to explain itself on the page. Where
there are no layers to colour by — a lifecycle, a workflow without lanes — the diagram writes
its own legend from the kinds actually present: entry, working, waiting, **exit · finished**
and **exit · failed**. Each swatch is the node in miniature, same border and corners, so
"rounded ends mark an exit" is shown rather than asserted.

An author-supplied `legend` always wins; a layered diagram gets none, because the rail labels
already name what the colours mean.

## Two rules the engines force on us

Both were learned by shipping a diagram that looked right in Chrome and arrived in Safari
broken, with no error anywhere.

- **No CSS `filter` on an SVG element.** WebKit reports the filter in its computed style and
  then paints nothing, so every glow silently disappears. An SVG `<filter>` referenced by the
  `filter` attribute *does* paint — but its `flood-color` cannot be `currentColor`, which
  WebKit also ignores. So there is one filter per accent, its flood colour read from a custom
  property so it still follows the theme.
- **Corner radii are attributes, never CSS.** WebKit does not implement `rx` as a CSS
  property, so a radius set in the stylesheet squares off every box.

The browser gate asserts both on every build, in every engine it can start.

## Levers

`meta.theme`, `meta.motion`, `meta.autoplay`, `meta.stepSeconds`, `meta.width`,
`meta.height`, and a layer's `accent`. That is the list. There is no mechanism for a custom
font or an arbitrary colour, and that is deliberate: the constraint is what makes a set of
these diagrams look like a set.

## What a viewer can do

Pause stops the walkthrough advancing; it does not freeze the diagram, because a presenter
who pauses to talk about a step still wants that step's flow moving. `M` is the control for
motion.

Switch theme (button or `T`), turn the animation on or off (button or `M`), step through (arrows, space, `1`–`9`, the bars), open a node
that carries a `detail` or `sources`, copy the diagram as PNG, download PNG at 2× or SVG.
Deep links `#step=`, `#theme=` and `#node=` survive being pasted into a ticket.

Export inlines the web fonts when the network allows and falls back to the local stack when
it does not. The SVG keeps the font names, so it opens correctly in a vector editor.
