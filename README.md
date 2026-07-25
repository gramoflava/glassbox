# glassbox — structured prompt builder

Draw the boxes, get valid JSON. A single-page tool for composing structured
prompts for **Ideogram 4.0**, **FLUX.2**, **Krea 2 (BBox)** and a general JSON
schema — without typing braces and without guessing what `0.62, 0.31` looks like.

Live at [glassbox.gramoflava.xyz](https://glassbox.gramoflava.xyz). Runs entirely
in your browser and has no backend. The interface loads its typefaces from
Google Fonts; prompts, boxes, saved works and backdrop images never leave your
device.

## The two problems it solves

**You can't picture coordinates.** So you don't write them. You drag rectangles
on a frame at the right aspect ratio, optionally over a reference image, and the
numbers are derived from what you drew.

**Hand-edited JSON breaks.** So you never edit it. The JSON pane is read-only.
The only ways in are *Paste* (validated — a malformed paste changes nothing) and
*Open*. The only ways out are *Copy* and *Save*. There is no state in which the
document is syntactically invalid.

## Not every target takes boxes

This is the part worth knowing before you start.

| Target | Regions | Coordinates |
| --- | --- | --- |
| General JSON | numeric | Normalized 0–1, `[x, y, w, h]`. Lossless — use it as your archive format. |
| Ideogram 4.0 | numeric | **`[y_min, x_min, y_max, x_max]`** on a 0–1000 grid. Row-first — *documented*. |
| Krea 2 · BBox | numeric | 0–1000 grid, axis order **switchable**, defaults to x-first — *not documented*. |
| FLUX.2 | prose | None. Placement is described in words. |

**Ideogram and Krea use the same envelope with transposed axes.** Both accept
`high_level_description` + `compositional_deconstruction.elements[]`, each element
carrying `type`, `bbox`, `desc` (and `text` for text elements). But Ideogram is
row-first and Krea is x-first, so the same four numbers describe two different
rectangles. A document can look completely valid and be silently transposed —
which is exactly the kind of thing you can only catch by *seeing* it, which is
what the canvas is for.

Krea's envelope also carries a top-level `aspect_ratio`; Ideogram's does not
(there it's a separate API parameter). That key is the quickest way to tell two
otherwise identical-looking documents apart. Draw Things emits the Krea-flavoured
shape.

### Krea's axis order is genuinely unsettled

Ideogram documents its order. **Krea does not** — its own guidance is prose
prompting, and the bbox JSON is a community convention wrapped around Ideogram's
envelope, read by a text encoder that treats regions as guidance rather than
strict masks. There is no spec to be right about.

So it's a setting, not a constant. Open the **Target** section in the right panel
and switch the coordinate order between x-first and row-first. Your boxes don't
move — only the numbers written out change. Generate once each way and keep
whichever lands; the choice is remembered per target.

FLUX.2 reads a *description*, not a coordinate list. So for that target glassbox
converts each rectangle into placement wording:

```
box at x 0.05, y 0.35, w 0.22, h 0.30, marked foreground
  ↓
"placement": "far left, vertically centred, small, foreground"
```

Same canvas, same document, different renderings. Switching targets never destroys
work — fields the new target has no home for are struck through in the panel and
simply wait there until you switch back.

## Your labels stay yours

A region in the exported JSON is an anonymous box, which means a canvas full of
them tells you nothing at a glance. So each box also carries a **label** and a
**colour** from a fixed 33-swatch palette (grey by default). The blue one is the
wolf, the brown one is the moose.

These live in the app only:

- **stripped** from every Copy and every export, for every target;
- **not expected** on Paste — pasted JSON never needs them;
- **kept** on Paste where a pasted box lands on roughly the same spot as an
  existing one (IoU > 0.35), so a round trip through a generator doesn't cost
  you your annotations;
- **preserved** in saved works, which is the whole reason to save.

## Usage

1. **Target** — pick the generator, top left. This drives every field name.
2. **Frame** — pick the aspect ratio. The canvas resizes to match.
3. **Backdrop…** — optionally load a reference image, or drop one onto the
   canvas. Read locally, never uploaded, never stored.
4. **Drag on the canvas** to draw a box. Drag it to move, corners to resize,
   Backspace to delete.
5. **Right panel** — accordion sections for the scene, then one row per box with
   its label, colour, description, element type, weight and depth. Set a box's
   type to *Rendered text* to emit an Ideogram/Krea `text` element with the
   literal copy to draw.
6. **Copy JSON** — target-shaped, private layer removed.
7. **Save** — a named slot in this browser, or a `.glassbox.json` file on disk.

Keyboard: `⌘S` save, `⌘O` open, `⌘⇧C` copy, `⌘⇧V` paste, `Backspace` delete the
selected box, `Esc` deselect.

## Pasting something no descriptor knows

A descriptor only understands the shape it was written for, and real JSON
arrives from tools nobody has described yet — different names, different
nesting. So paste is deliberately tolerant:

1. The selected target reads it first. It knows its own shape best.
2. If that finds nothing, a **structural scan** walks the whole tree looking for
   anything box-shaped — any array of objects carrying a four-number `bbox`,
   `box`, `rect`, `bounds` or `coords`, at any depth — and matches scene text
   against a list of aliases (`high_level_description`, `desc`, `prompt`, …).
3. Whatever it concludes is **shown to you before anything is replaced**: how
   many boxes, where in the tree they came from, how the coordinates were read,
   and any keys being passed through untouched.

Values that fit inside 0–1000 are read as that grid, since it's the documented
convention for both Ideogram and Krea. Larger values are treated as pixels and
normalized against a frame inferred from the boxes and the declared aspect ratio,
with the inferred size reported.

**Corner vs. width/height** is decided from the whole set, not one box. Reading
corners as width and height inflates the frame far past the largest coordinate
present — that's the tell, and the reason is stated in plain words. Axis order
can't be inferred that way, so all three readings are offered as buttons; switch
between them and watch the canvas until the layout matches what you meant.

An unrecognisable document is refused with an explanation. A paste never
silently produces an empty canvas.

## Correcting a schema

The Ideogram and Krea descriptors are built from their published schemas. A few
fields remain marked `assumed` — Krea's style keys in particular, since its
documented envelope is only `aspect_ratio` + `high_level_description` +
`compositional_deconstruction`. Assumed fields carry a dotted underline in the
panel so a guessed field name can't quietly reach a generator.

When you find a discrepancy, fix it in [`targets.js`](targets.js). Every target is
one declarative object — field names, coordinate convention, and the functions
that convert to and from the canonical document. Nothing in `app.js` knows the
name of any field. To correct a name, edit the descriptor. To support a new
model, add one object to the `TARGETS` array. If a generator turns out to use a
different axis order, change `bboxFormat` between `'xywh'`, `'xyxy'` and
`'yxyx'` — that one word is the entire change. `grid: 1000` switches a target
between a normalized 0–1000 grid and plain 0–1 coordinates.

Coordinate conventions are **declared, not guessed**, for any target that has a
descriptor: `[0.1, 0.1, 0.5, 0.5]` is a valid rectangle under all three orders,
and picking wrong silently moves — or transposes — your boxes. Inference happens
only in the structural scan, where there is nothing to declare, and there it
always shows its reasoning and offers all three readings to switch between.

## Storage and privacy

No backend, analytics or cookies. Aside from loading the interface typefaces,
everything lives in this browser's `localStorage`; project data uses the
`glassbox.` prefix:

- saved works (including labels and colours),
- an autosaved draft of the current canvas,
- your last-used target. The shared family theme uses the `theme` key.

Backdrop images are read with `FileReader` and never persisted. **Data → Erase
everything** reports the exact size and removes all of it.

> A note on the original spec: this was meant to be session-storage-only. Named
> slots were chosen instead, which means work now survives closing the tab. That
> is persistent browser state — deliberate, and the reason the erase button
> exists.

## Theme

Follows the system light/dark setting by default. The three-segment switch in
the app bar offers Light / Auto / Dark and remembers the choice.

## Files

| File | |
| --- | --- |
| `index.html` | Structure and dialogs |
| `gramofdesign/` | Shared tokens, components, icons and theme switch |
| `styles.css` | Canvas and inspector layout specific to glassbox |
| `targets.js` | **Target descriptors — the file you edit** |
| `app.js` | Canvas, inspector, storage |

No build step, no dependencies. Open `index.html` directly from disk if you
prefer; classic scripts are used specifically so `file://` works.

## Licence

MIT.
