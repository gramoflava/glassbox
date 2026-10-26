# gramof design

Playbook for gramoflava sites: tokens, components, rules, tools. Site-agnostic; sites vendor it as `gramofdesign/`. No build, no dependencies.

## Decision order

1. gramof has it → use as is.
2. Missing, reusable → add here, `./check.py --sync`.
3. Unique to one site → build there from tokens; new values become site tokens (`--<site>-…`).
4. Site must break a rule → site owns it: `.gramof.json` + its `AGENTS.md`.

Products (gramof.us) are not family sites — see Products.

## Identity

`lava` = the person (lowercase). `gramoflava` = lava's namespace ("gram of lava"), not a persona.

## Files

| File | Purpose |
|---|---|
| `gramof.css` | tokens + components |
| `theme.js` | light/auto/dark, `localStorage.theme` |
| `tools.js` | site tools + Ko-fi panel |
| `icons/` | Tabler UI icons (24 grid, 1.5 stroke, `currentColor`) |
| `marks/` | site marks |
| `fonts/` | self-hosted font option |
| `favicons.sh` | mark → favicon set |
| `check.py` | drift check / sync |
| `sites.txt` | family register |

## Install

```html
<html lang="en" data-accent="<product>">
<head>
  <meta name="color-scheme" content="light dark">
  <script>(function(){var t=null;try{t=localStorage.getItem('theme');}catch(e){}if(t==='light')document.documentElement.classList.add('theme-light');else if(t==='dark')document.documentElement.classList.add('theme-dark');})();</script>
  <link rel="icon" href="favicon.ico" sizes="32x32">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@400;500&amp;family=Outfit:wght@400;500;600&amp;display=swap">
  <link rel="stylesheet" href="gramofdesign/gramof.css">
  <link rel="stylesheet" href="site.css">
  <script defer src="gramofdesign/tools.js"></script>
  <script defer src="gramofdesign/theme.js"></script>
</head>
```

- Fonts: that Google link verbatim, or `gramofdesign/fonts/fonts.css` (no third-party requests). Nothing else; no `@font-face` in sites.
- `data-accent` = product hue. New product: one line in each of the three accent blocks (light, auto-dark, dark).
- On accent fills: `--text-on-accent`. On fixed palette/chart fills: `--text-on-color`.

## Tokens

Raw values only in token definitions; rules read tokens.

| Kind | Tokens |
|---|---|
| Family | `--font-sans` Inter · `--font-display` Outfit (headings, wordmarks) · `--font-mono` JetBrains Mono |
| Size | `--text-2xs` 10 · `xs` 11 · `sm` 12 · `md` 14 (base) · `lg` 16 · `xl` 20 · `2xl` 26 · `3xl` 34 · `--text-display` (one hero per landing page) |
| Weight | `--weight-regular` 400 · `-medium` 500 · `-semibold` 600 (max) |
| Leading | `--leading-tight` 1.2 · `--leading-body` 1.55 |
| Space | `--space-1` 4 · `2` 8 · `3` 10 · `4` 16 · `5` 20 · `6` 24 · `8` 32 · `10` 40 · `12` 48 |
| Radius | `--radius-none` · `xs` 4 · `sm` 7 · `md` 11 · `lg` 16 · `xl` 22 · `pill` |
| Motion | `--dur-fast` 120 · `--dur-base` 200 · `--ease-out` · `--ease-smooth` · `--ease-spring` |
| Glass | `--glass[-hover/-active]` · `--glass-edge` · `--blur-panel` · `--blur-bar` |
| Colour | `--bg` `--surface` `--surface-sunk` `--line[-strong]` `--text[-secondary/-muted]` `--accent[-hover/-soft/-mid/-ring]` `--danger` `--warn` `--success` |
| Data | `--chart-1…8`, chart axis/grid/tooltip, `--palette-*` (theme-agnostic) |

`em`/`%` on top of a token are fine.

## Site tools

Top-right chrome, every family site: theme switch · Ko-fi · whois. Rendered by `tools.js` (load before `theme.js`):

```html
<div class="site-tools" data-site-tools></div>                                   <!-- in an appbar -->
<div class="site-tools site-tools--glass site-tools--float" data-site-tools></div> <!-- no appbar -->
```

Options (space-separated): `no-whois` (whois itself), `no-kofi` (products; anywhere a tip jar is out of place).

Ko-fi: support for lava's work. Button opens an embedded `ko-fi.com/gramoflava` widget; iframe loads on first open only; closes on ×, Escape, outside click; focus returns. Any `[data-kofi]` element opens the same panel. One entry point per chrome; no floating coffee buttons, no other tip services.

Do not restyle shared components; scope site CSS to site classes (an `#id button` rule outranks every gramof class).

## Rules

1. One accent per product; everything else shared.
2. Glass for chrome only; cards inside are `.solid`; no glass on glass.
3. 14 px base, 4 px grid, 10 px workspace gap. Hit targets ≥ 30 px desktop, ≥ 44 px touch.
4. UI icons: Tabler only. Sites may draw app marks, never UI icons. No emoji icons.
5. Theme switch = three-segment pill (sun/A/moon) via site tools. Auto = no stored preference. Keep `aria-label` + `title`.
6. Motion 120–200 ms via `--dur-*`; longer = owned drift.
7. Charts read tokens, never `prefers-color-scheme`.
8. Copy + download together (`.btn-pair`, copy first).
9. Headline numbers in `.stat` cards (2–4); full readout in `.stats`.
10. Tokens, not values. Weights ≤ 600. One family per role, canonical source.
11. One mark per product (spec below); favicons only via `favicons.sh`; the three head lines.
12. Vendored `gramofdesign/` is a copy; change here, `./check.py --sync`.
13. Index `<title>` = product name (lowercase, as accent); other pages `<page> · <product>`. Index has description + `og:title`, `og:description`, `og:url`.
14. Never block zoom. Pin third-party scripts to exact versions. Repos: `.DS_Store` ignored, README, Unlicense.
15. `./check.py` all clear before deploy. Unchecked rules are guidelines; checked rules are law.

## Tiers

- **Standard** (default): static accent wash, blur 40, radius 16 (cards 11).
- **Expressive** (`data-tier="expressive"`): for a site whose identity is motion/depth. Blur 56, radius 20, deeper glass, stronger `--text-muted`, `--dur-slow` 380. Only this tier mounts `.cosmos`:

```html
<div class="cosmos"><div class="cosmos__blob cosmos__blob--1"></div><div class="cosmos__blob cosmos__blob--2"></div><div class="cosmos__blob cosmos__blob--3"></div></div>
```

## Marks

`marks/<product>.svg`, edited only here; sites copy.

- `viewBox="0 0 32 32"`, no width/height; `<title>` (product name) first.
- Then `<rect width="32" height="32" rx="8" fill="<light --accent>">`; no opacity/stroke.
- White glyph in the 24 px live area (Tabler: `translate(4 4)`), stroke 1.5–2. Tabler glyph preferred.
- Never: gradients, filters, masks, patterns, `<image>`, data URIs, `<style>`, `currentColor`, external refs, `<metadata>`, XML prolog, outline marks.
- Exceptions: `GLYPH_EXTRA` in `check.py`, reason in the register.

## Favicons

Site root: `favicon.svg` (mark verbatim), `favicon.ico` (one 32 px frame), `apple-touch-icon.png` (180, opaque, full-bleed — transparent corners get a light plate in Safari). Head: the three lines in Install.

```sh
./favicons.sh marks/<site>.svg ../<site> [--manifest]   # --manifest: android-chrome 192/512, installable sites only
```

ICO `sizes="32x32"` exact (wider lists make browsers prefer the bitmap). No other PNG favicons, `mask-icon`, `-precomposed`, or metadata. Safari caches icons in `~/Library/Safari/Favicon Cache`.

## Owned drifts

```json
{ "owns": { "<rule-id>": "<reason>" } }
```

`.gramof.json` at site root; same drift explained in the site's `AGENTS.md`. Owned rules are reported, not checked; unknown id or empty reason fails. Prefer a site token over owning a rule.

| Id | Checks |
|---|---|
| `fonts` | canonical font source only |
| `weights` | `font-weight` via `--weight-*` |
| `type-scale` | `font-size` via tokens/relative units |
| `motion` | durations via tokens |
| `colour` | no literal colours outside token definitions |
| `element-rules` | no bare/`#id` form-control rules; no `#id` restyling of shared components |
| `viewport-zoom` | zoom not blocked |
| `cdn` | exact-version third-party scripts |
| `meta` | titles, description, Open Graph |

## Products (gramof.us)

Not family: not in `sites.txt`, not checked, own design language, platform first (current Mac apps: native macOS, Liquid Glass). Rules live in each product's `AGENTS.md`. A product page may borrow tokens, components, site tools (`no-kofi`), `fonts/`, the favicon standard. Vendored copies stay exact: `./check.py --sync-only <dir>`.

## Check

```sh
./check.py                 # sites.txt + marks
./check.py ../lens         # one site
./check.py --sync          # refresh vendored copies, then check
./check.py --sync-only d   # refresh one copy (products), no check
./check.py --rules         # ownable rule ids
```

Optional pre-commit in a site repo: `printf '#!/bin/sh\nexec ../gramofdesign/check.py .\n' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`

- Design-system change: edit here → `--sync` → commit sites.
- Mark change: edit mark → `favicons.sh` → `--sync`.
- New site: accent (3 blocks) → mark → vendor → `data-accent` → `favicons.sh` → `AGENTS.md` (gramof first) → `sites.txt` → all clear.

## Components

```html
<div class="app">
  <header class="appbar">
    <span class="brand">…</span><span class="appbar__sep"></span>
    <button class="btn">Open</button><button class="btn btn--primary">Copy JSON</button>
    <span class="appbar__spacer"></span>
    <div class="site-tools" data-site-tools></div>
  </header>
  <div class="workspace"><main class="stage">…</main><aside class="inspector">…</aside></div>
</div>

<div class="field"><label for="x">City</label><input type="text" id="x"></div>
<label class="switch"><input type="checkbox"><span class="switch__track"></span><span class="switch__label">Label</span></label>
<label class="check"><input type="checkbox"><span class="check__box"></span>Grid</label>
<label class="check check--radio"><input type="radio" name="u"><span class="check__box"></span>Celsius</label>
<details class="acc" open><summary>Title <span class="count">3</span></summary><div class="acc__body">…</div></details>
<div class="btn-pair"><button type="button">Copy PNG</button><button type="button">Download PNG</button></div>
<svg class="icon" viewBox="0 0 24 24"><path d="M12 5l0 14"/><path d="M5 12l14 0"/></svg>
```

Surfaces `.glass` `.solid` `.sunk` · Buttons `.btn` `--primary` `--quiet` `--danger` `--icon` · Fields: gramof styles them; sites add layout only · Theme switch: never hand-written, `tools.js` renders it.

## Register

| Site | Accent | Mark | Tier | Owns |
|---|---|---|---|---|
| whois | `#2563eb` | Tabler `user-filled` ("this is lava") | standard | — |
| grainofrain | `#0d7d74` | Tabler `droplet` | standard | — |
| glassbox | `#6d3ce0` | box in a box | standard | — |
| hexports | `#c2410c` | Tabler `chart-line` | standard | — |
| lens | `#64748b` | Tabler `aperture` | standard + `editorial.css` | — |
| novaos | `#4f46e5` | star in tilted orbit + pink moon `#f9a8d4` | expressive | `viewport-zoom`, `motion`, `colour` |

Provenance: tokens/pill/`.tag` whois · glass/expressive/cosmos novaos · charts/icons/`.stats` grainofrain · shell/inspector/dialogs/toast glassbox · stat cards/toolbar hexports · self-hosted fonts WordLantern.

Licence: [Unlicense](LICENSE); Tabler (MIT) and fonts (OFL) in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
