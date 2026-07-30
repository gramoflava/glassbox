# gramof design

One design language for the gramoflava family: **whois**, **grainofrain**, **glassbox**,
**hexports**, **novaos** — and whatever comes next.

Drop-in, no build step, no package or runtime dependencies.

## Identity

**lava** is the person. Use lowercase `lava` when copy, documentation, or an
assistant refers to the creator directly.

**gramoflava** is lava's public namespace: the longer handle exists because
`lava` is often unavailable or four-character names are not accepted. Read it
literally as **gram of lava** — a small piece of lava. The products in this
family are pieces of lava's work, not a separate persona called gramoflava.

Product marks may express this relationship without changing the shared UI icon
rules. `whois` uses Tabler's `user-filled` silhouette on its blue accent
squircle: it means “this is lava.” Brand marks live in `marks/`; interface
actions still use the Tabler set in `icons/`.

`hexports` uses Tabler's `chart-line` on its orange accent squircle: the mark
describes local health time-series exploration without introducing a separate
visual vocabulary.

## Files

| File | What it is |
|---|---|
| `gramof.css` | All tokens + components. The whole system. |
| `theme.js` | Light / auto / dark switch, persisted in `localStorage`. |
| `icons/` | Tabler icon sources (24 grid, stroke 1.5, `currentColor`). |
| `marks/` | Product brand marks; not UI affordances. |
| `THIRD_PARTY_NOTICES.md` | Attribution and licences for bundled third-party assets. |

## Install

```html
<head>
  <meta name="color-scheme" content="light dark">

  <!-- 1. no-flash: apply the stored theme before the first paint -->
  <script>
    (function () {
      var t = null;
      try { t = localStorage.getItem('theme'); } catch (e) {}
      if (t === 'light') document.documentElement.classList.add('theme-light');
      else if (t === 'dark') document.documentElement.classList.add('theme-dark');
    })();
  </script>

  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@400;500&amp;family=Outfit:wght@400;500;600&amp;display=swap">
  <link rel="stylesheet" href="gramofdesign/gramof.css">
  <script defer src="gramofdesign/theme.js"></script>
</head>

<html lang="en" data-accent="grainofrain">
```

`data-accent` picks the product hue: `whois` `grainofrain` `glassbox` `hexports` `novaos`.
Omit it and you get the whois blue. Add a new product by adding one pair of lines to the
accent block in `gramof.css`.

## The rules

1. **One accent hue per product.** Everything else is shared. All hues sit at matched
   lightness and chroma, so no component needs a per-product exception.
2. **Glass is for chrome, not content.** The top bar and the side inspector are glass.
   Cards *inside* them are `.solid`. Never stack glass on glass.
3. **14 px base, 4 px grid, 10 px workspace gap.** One density across all five.
   Hit targets ≥ 30 px on desktop, ≥ 44 px on touch.
4. **Tabler icons only**, 1.5 stroke, `currentColor`, from `icons/`. novaos keeps its
   custom geometric set for *app marks* only — never for UI affordances.
5. **The theme switch is always the three-segment pill**: sun / A / moon, top right.
   Add `.segmented--icon`; drop it for the word form on wide content pages.
   Auto means "no stored preference", not "system dark". Always keep `aria-label`
   and `title` on each segment — the icons carry no text.
6. **Motion is 120–200 ms.** The only exception is the expressive tier.
7. **Charts read from tokens**, never from `prefers-color-scheme` directly — otherwise
   they desync from the manual switch.
8. **Copy and download always travel together.** Anywhere an image can be
   downloaded, it can also be copied to the clipboard (`.btn-pair`, copy first).
   Never ship a download action alone.
9. **Numbers belong in a stats table, not only in cards.** `.stat` cards are for
   2–4 headline figures; `.stats` is the full dense readout, in the inspector.

## Two tiers

**Standard** — whois, grainofrain, glassbox, hexports. Static two-lobe accent wash derived
from `--accent`, glass chrome, blur 40, radius 16 (cards 11), 10 px gaps.

**Expressive** — novaos only. Set `data-tier="expressive"` on `<html>`. Same tokens,
raised: blur 56, radius 20, deeper glass, and the animated cosmos backdrop, which
switches the static wash off:

```html
<body>
  <div class="cosmos">
    <div class="cosmos__blob cosmos__blob--1"></div>
    <div class="cosmos__blob cosmos__blob--2"></div>
    <div class="cosmos__blob cosmos__blob--3"></div>
  </div>
  …
</body>
```

No other project mounts `.cosmos`.

## Component cheatsheet

```html
<!-- app shell -->
<div class="app">
  <header class="appbar">
    <span class="brand">…</span>
    <span class="appbar__sep"></span>
    <button class="btn">Open</button>
    <button class="btn btn--primary">Copy JSON</button>
    <span class="appbar__spacer"></span>
    <!-- theme switch: sun / A / moon -->
    <div class="segmented segmented--icon" role="group" aria-label="Color theme" data-theme-switch>
      <button class="segmented__btn" data-theme="light" aria-label="Light" title="Light">
        <svg viewBox="0 0 24 24"><path d="M14.828 14.828a4 4 0 1 0 -5.656 -5.656a4 4 0 0 0 5.656 5.656z"/><path d="M6.343 17.657l-1.414 1.414"/><path d="M6.343 6.343l-1.414 -1.414"/><path d="M17.657 6.343l1.414 -1.414"/><path d="M17.657 17.657l1.414 1.414"/><path d="M12 20v2"/><path d="M12 2v2"/><path d="M20 12h2"/><path d="M2 12h2"/></svg>
      </button>
      <button class="segmented__btn" data-theme="auto" aria-label="Auto" title="Auto"><span>A</span></button>
      <button class="segmented__btn" data-theme="dark" aria-label="Dark" title="Dark">
        <svg viewBox="0 0 24 24"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/></svg>
      </button>
    </div>
  </header>
  <div class="workspace">
    <main class="stage">…</main>
    <aside class="inspector">…</aside>
  </div>
</div>

<!-- switch -->
<label class="switch">
  <input type="checkbox" checked>
  <span class="switch__track"></span>
  <span class="switch__label">Climate normals</span>
</label>

<!-- checkbox / radio -->
<label class="check"><input type="checkbox" checked><span class="check__box"></span>Grid</label>
<label class="check check--radio"><input type="radio" name="u" checked><span class="check__box"></span>Celsius</label>

<!-- disclosure -->
<details class="acc" open>
  <summary>Range &amp; smoothing <span class="count">3</span></summary>
  <div class="acc__body">…</div>
</details>

<!-- icon -->
<svg class="icon" viewBox="0 0 24 24"><path d="M12 5l0 14"/><path d="M5 12l14 0"/></svg>
```

Surfaces: `.glass` (chrome) · `.solid` (content card) · `.sunk` (recessed field)
Buttons: `.btn` · `.btn--primary` · `.btn--quiet` · `.btn--danger` · `.btn--icon`

## Provenance

Nothing here is invented from scratch:

- **Token ramp, theme pill, `.tag`** — whois
- **Outfit on headings, deep glass, accent wash** — chosen direction 1b
- **Glass surfaces, expressive tier, cosmos** — novaos
- **Chart palette, axis/grid/tooltip tokens, Tabler icons** — grainofrain
- **App shell, accordion inspector, dialogs, toast** — glassbox
- **Stats table (`.stats`), 16-metric readout** — grainofrain `js/stats.js`
- **Stat cards, dense toolbar** — hexports

## Licence

The original design-system code and marks use the repository’s
[Unlicense](LICENSE). Icons derived from Tabler Icons retain their MIT notice in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
