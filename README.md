# glassbox — structured prompt builder

Draw the composition, edit each element in a focused dialog, and get compact
JSON for **DrawThings Ideogram 4.0**.

Live at [glassbox.gramoflava.xyz](https://glassbox.gramoflava.xyz). It runs
entirely in the browser and has no backend. Prompts, boxes, saved works and
backdrop images never leave the device.

## DrawThings contract

Glassbox deliberately exposes only the mode that has been tested in DrawThings.
It follows the public DrawThings Ideogram 4.0 expander and the Ideogram system
prompt embedded there:

- `bbox` is optional and uses `[y_min, x_min, y_max, x_max]`;
- both axes are normalized from 0 to 1000, with the origin at top-left;
- `obj` elements contain `type`, optional `bbox`, then `desc`;
- `text` elements contain `type`, optional `bbox`, required `text`, then `desc`;
- JSON is serialized compactly on one line.

Image Size is the actual DrawThings output resolution. Entering it reduces
width:height by their greatest common divisor and synchronizes `aspect_ratio`,
matching DrawThings itself (`1280×960` becomes `4:3`, `1856×1472` becomes
`29:23`). The bbox grid remains 0–1000 regardless of resolution. Loading a
backdrop fills Image Size and synchronizes the ratio when no size has been set.

Malformed raw expansion output is rejected instead of being guessed into a
second coordinate convention.

Primary references:

- [DrawThings Ideogram 4 system prompt](https://github.com/drawthingsai/draw-things-community/blob/main/Libraries/PromptJSONExpansion/Sources/Ideogram4MagicPrompt.swift)
- [DrawThings prompt expander](https://github.com/drawthingsai/draw-things-community/blob/main/Libraries/PromptJSONExpansion/Sources/Ideogram4PromptJSONExpander.swift)
- [Ideogram 4 prompting guide](https://github.com/ideogram-oss/ideogram4/blob/main/docs/prompting.md)

## Interface

- The right panel manages the prompt settings and the list of elements.
- Clicking a settings card or element opens a roomy editor for long text and
  related controls.
- Labels and colours are private navigation aids. Empty labels are not drawn on
  the canvas and neither value is included in generated JSON.
- Image Size synchronizes the aspect ratio; the ratio also accepts presets and
  custom values such as `32:17`.
- Placement boxes are optional per element.
- The Plain JSON view is read-only and compact, matching model prompt
  serialization; copy and download keep bounding-box arrays inline.
- Paste JSON validates strictly against DrawThings Ideogram 4.0 before replacing
  the current work.
- Save updates the currently opened browser slot; Save as… creates another.
- Clear canvas resets the current prompt, elements and backdrop without deleting
  saved works or changing the image size and frame ratio.
- A backdrop is local-only, removable, and its opacity can be adjusted.

On desktop, draw, move and resize rectangles directly on the canvas. On mobile,
the canvas is a preview and selector: adding an element creates a centred region,
and its exact Left, Top, Width and Height percentages are edited in the element
dialog. Touch dragging is disabled to avoid fighting page gestures.

Keyboard: `⌘S` save, `⌘O` open, `⌘⇧C` copy, `⌘⇧V` paste, `Backspace` delete the
selected box, `Esc` deselect.

## Strict paste

Paste accepts only the verified DrawThings structure. Invalid bbox values,
foreign fields, missing text content and wrong key order are rejected before
the document changes.

## Storage and privacy

There is no backend, analytics or project-data cookie. Work lives in the
browser’s `localStorage` under the `glassbox.` prefix:

- saved works, including private labels and colours;
- an autosaved draft;
- the current format identifier.

Backdrop images are read locally and are not persisted. Data → Erase everything
reports the stored size before removing it.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | structure and dialogs |
| `gramofdesign/` | shared tokens, components, icons and theme switch |
| `styles.css` | canvas, inspector and responsive layout |
| `targets.js` | strict target descriptors and coordinate conversion |
| `app.js` | canvas, editors, validation and storage |
