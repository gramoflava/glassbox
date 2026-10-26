# Agent rules

## Design
- Built on gramof design: `../gramofdesign` (github.com/gramoflava/gramofdesign). Read its README before any visual/UX change. Vendored `gramofdesign/` = deploy copy, never edit.
- Order: gramof has it → use it. Reusable → add to gramofdesign, `../gramofdesign/check.py --sync`. Site-only → build here from tokens; new values = `--gb-*` tokens.
- No raw sizes/weights/durations/colours in rules. Don't restyle shared components; scope to site classes.
- Before commit: `../gramofdesign/check.py .` → all clear.

## Site
- App shell from gramof components; site CSS = layout + canvas only.
- No owned drifts.
