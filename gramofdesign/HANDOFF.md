# Handoff — adopting gramof design in the five repos

Give a coding agent **one repo per session**, in the order below. Each section is
self-contained: point the agent at that repo plus this folder and paste the task.

Order matters — whois is the smallest and proves the wiring; novaos is last
because it is the only expressive-tier consumer.

**Shared preamble** (paste at the top of every task):

> The design system lives in `gramofdesign/` (`gramof.css`, `theme.js`, `icons/`,
> `README.md`). Read `gramofdesign/README.md` first — the nine rules in it are
> binding. Copy the folder into this repo (do not symlink or CDN it). Do not
> invent tokens: if a value you need is not in `gramof.css`, add it there as a
> token and use it, so the other four repos inherit it.
> Preserve all existing behaviour and data flow. This is a re-skin plus two
> feature rules (paired export, stats table) — not a rewrite.
> Verify in light, auto and dark, at 1440px, 900px and 390px, before and after.

---

## 1. whois

Smallest surface. Do this one first to shake out the wiring.

- Copy in `gramofdesign/`. Add the no-flash snippet, the Google Fonts link
  (Inter + Outfit + JetBrains Mono) and `gramof.css` to `<head>`;
  `<script defer src="gramofdesign/theme.js">`.
- Set `<html lang="en" data-accent="whois">`.
- **Delete** the entire inline `<style>` block from `index.html`. Every token in
  it (`--bg`, `--bg-card`, `--accent`, `--shadow-*`, `--radius*`, all four theme
  ramps) is already in `gramof.css` — the file is the origin of them.
- **Delete** the inline theme-toggle IIFE. `theme.js` replaces it, same
  `localStorage` key (`theme`), same three states. Swap `.theme-pill` /
  `.theme-btn` markup for `.segmented.segmented--icon` with the sun / A / moon
  SVGs from the README (keep `aria-label` and `title` on each segment).
- Map the remaining classes: `.project-card` → `.glass`, `.tag` stays (it is in
  the system verbatim), `.section-title` → `h2`, footer links keep their inline
  GitHub/LinkedIn SVGs.
- Keep the Ko-fi floater; restyle it from `--glass` / `--line` / `--shadow-md`.
- The eight `index-*.html` variants are dead ends — leave them alone or delete
  them, your call, but do not port the system into them.

## 2. grainofrain

Two real code changes here, not just CSS.

- Copy in `gramofdesign/`; `data-accent="grainofrain"`.
- Replace the token blocks at the top of `styles.css` (`:root` and the
  `prefers-color-scheme` override) with a `gramof.css` link. Keep the
  project-specific layout rules below them (`#workspace`, `#charts`, the
  golden-ratio `flex: 1.618`, `.chart-card` sizing) and rewrite their colour and
  radius literals as tokens.
- **`js/charts.js` must stop reading `prefers-color-scheme`.** Right now
  `isDark` drives `axisLabelColor`, `tooltipBg`, `tooltipBorder`, `tooltipText`,
  so charts desync the moment someone picks Light or Dark manually. Replace with
  a helper that reads the live tokens:

  ```js
  const css = (name) => getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim();
  // axisLabelColor: css('--chart-axis-label')
  // tooltipBg:      css('--tooltip-bg')
  // tooltipBorder:  css('--tooltip-line')
  // tooltipText:    css('--tooltip-text')
  // grid:           css('--chart-grid')
  ```

  `theme.js` fires a `themechange` event on `document` — listen for it and call
  the existing chart re-render. Also listen for the `matchMedia` change so
  `auto` still tracks the system. Leave the hardcoded series colours
  (`#EF5350`, `#0D47A1`, `#1E88E5`, `#616161`, the 8-colour categorical list)
  exactly as they are — they are the system's chart palette.
- **The stats panel is the point of this app.** Rebuild `js/stats.js`'s output
  on `.stats` / `.stats__head` / `.stats__row` / `.stats__label` /
  `.stats__value` / `.stats__note`, setting `--stats-cols` to the entity count.
  All 16 metrics, same labels, same tooltips, same formatters — no metric may be
  dropped or reordered. Header cells get `.is-c1/.is-c2/.is-c3` instead of the
  current `COLOR_NAMES` classes. The panel must scroll (`.inspector` already
  does); do not shrink the table to avoid scrolling.
- Chart export: wherever a chart can be downloaded, add copy-to-clipboard beside
  it using `.btn-pair`, copy first (see §6).
- `icons/` here is the source of truth for the family's Tabler set — when you
  add icons, add them to `gramofdesign/icons/` too.

## 3. glassbox

- Copy in `gramofdesign/`; `data-accent="glassbox"`.
- `styles.css` header comment says tokens follow hexports — that contract is now
  `gramof.css`. Delete `:root`, the `prefers-color-scheme` block, and both
  `[data-theme=...]` blocks. `theme.js` sets `.theme-light` / `.theme-dark` on
  `<html>`, **not** `data-theme` — update `app.js`'s theme button accordingly, or
  better, delete it and use the three-segment icon pill.
- Class mapping, mostly one-to-one: `.toolbar` → `.appbar`, `.sep` →
  `.appbar__sep`, `.spacer` → `.appbar__spacer`, `.main` → `.workspace`,
  `.inspector` stays, `details.acc` → `.acc` (identical structure), `.count`
  stays, `.btn.primary` → `.btn--primary`, `.btn.quiet` → `.btn--quiet`,
  `.btn.danger` → `.btn--danger`, `#toast` → `.toast.is-shown` / `.is-error`,
  `dialog` rules → delete (the system styles `dialog`).
- Keep everything about the canvas: `.box`, `.box-label`, `.handle`, `.thirds`,
  the `--box-color` custom property, the 11-colour palette grid. Point the
  palette at `--chart-1 … --chart-8` so box colours and chart colours are one
  palette.
- On phones: `.inspector--sheet` for the box inspector, `.tabbar` with
  Canvas / Boxes / JSON / Data, `.scroller` for the frame + add + delete row.

## 4. hexports

The least polished today, so it gains the most.

- Copy in `gramofdesign/`; `data-accent="hexports"`.
- Delete the whole inline `<style>` token section. Restructure the page onto the
  shell: `.app` > `.appbar` + `.workspace` > `.stage` + `.inspector`. Today the
  sidebar is `order: 2` under the content — on desktop it becomes the right
  inspector column; the mobile stacking it currently has is what the
  `max-width: 900px` breakpoint already does.
- Replace the bare `button {}` element styling with `.btn` / `.btn--primary` —
  right now every button is accent-filled, which is why the page reads noisy.
  One primary action per bar.
- `.stat-card` → `.stat` (`.stat__label` / `.stat__value` / `.stat__delta`).
  Four headline figures max; anything denser goes in a `.stats` table.
- The canvas tooltip should use `--tooltip-bg` / `--tooltip-line` /
  `--tooltip-text`, not its own `rgba(0,0,0,0.85)` pair. On phones, replace the
  hover tooltip with a pinned readout row under the chart — there is no hover.
- Export PNG must be joined by Copy PNG (see §6).

## 5. novaos

The only expressive-tier consumer. Least to change, most to be careful with.

- Copy in `gramofdesign/`; `<html data-accent="novaos" data-tier="expressive">`.
- `css/nova-theme.css`: delete the `:root` token block and the light-mode
  `@media` override. Keep `--color-app-*`, `--color-wc-*` and the app-specific
  gradients — those are novaos's own vocabulary, not family tokens.
- Replace the hand-rolled `#nova-background` / `.blob` / `.stars-overlay` markup
  with `.cosmos` + three `.cosmos__blob`. The mask, the 20s drift and the
  light-mode opacity drop are already in the system. Keep the starfield if you
  want it — it is novaos-only, so leave it in `nova-theme.css`.
- `nova-window.css`, `nova-layout.css`, `nova-effects.css` and the whole
  window-manager stay. Only swap colour, radius, blur and shadow literals for
  tokens; the expressive tier supplies blur 56 and radius 20 automatically.
- `design_handbook/assets/icons.js`: keep the geometric set for **app marks
  only** (Files, Calculator, Codex, 2048, Scores…). Every UI affordance —
  close, chevrons, settings, add, delete — becomes a Tabler icon from
  `gramofdesign/icons/`. The `'settings'` gear in icons.js is currently used as
  a UI icon; move it to Tabler.
- `gemini-blackhole.svg` is the brand mark. Use it (or a 4-ring static reduction
  of it) in the title bar and boot screen. Do not redraw it.
- On phones, infinite panning is not viable: one window at a time, dock becomes
  `.tabbar`. This is a genuine behaviour change in `window-manager.js` — gate it
  on a media query and keep the desktop path untouched.
- Update `design_handbook/` to point at `gramofdesign/` as the source of truth
  for colour, type, spacing and components, and keep only what is novaos-specific
  (animation curves, window physics, app marks).

---

## 6. Cross-cutting: paired export (rule 8)

Do this in the same session as each repo, not as a separate pass.

Find every download affordance — grainofrain chart export, hexports Export PNG,
glassbox `.glassbox.json` download, any `<a download>` or canvas `toBlob` save —
and give each a copy-to-clipboard sibling in a `.btn-pair`, **copy first**.

```js
async function copyCanvasToClipboard(canvas) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
```

Notes: `ClipboardItem` needs a secure context and a user gesture; Safari wants
the `write()` called synchronously from the handler with a promise as the value.
Where the payload is text (glassbox JSON), `navigator.clipboard.writeText` is
enough — glassbox already does this for Copy JSON, so follow that pattern.
On failure, show the existing toast with `.is-error`. If the API is missing,
hide the copy button rather than showing one that fails.

## 7. Cross-cutting: finish the icon set

`gramofdesign/icons/` currently holds only the seven icons grainofrain shipped.
Add the rest of the set the designs use, from Tabler (MIT), 24 grid, stroke
1.5, `currentColor`, no hardcoded stroke colour: `plus`, `trash`, `x`,
`sun`, `moon`, `adjustments-x`, `list`, `database`, `chart-line`, `calendar`,
`trending-up`, `braces`, `crop`. One file per icon, named after the Tabler icon.
Nothing in any repo may inline an icon that is not in this folder.

## Definition of done, per repo

- No `:root` token block, no `prefers-color-scheme` colour block, and no
  per-project theme-toggle script remains outside `gramofdesign/`.
- Light / auto / dark all correct, and charts follow the *manual* switch.
- 1440 / 900 / 390 all usable; nothing tappable under 44px on touch.
- Every download has a copy sibling.
- No icon inlined that is not in `gramofdesign/icons/`.
- No colour, radius, blur or shadow literal outside `gramof.css` except the
  documented per-project exceptions (novaos app marks, chart series colours).
