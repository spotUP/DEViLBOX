---
name: GL UI quality bar
description: User expects pixel-perfect DOM parity — half-measures and "close enough" are not acceptable
type: feedback
---

The user expects the GL/Pixi UI to be PIXEL PERFECT with the DOM UI. "Close enough" is not acceptable.

**Why:** Multiple rounds of feedback where changes were made that looked OK in code but rendered poorly. The user had to screenshot and point out every difference. Agents produced code that compiled but didn't render correctly because of missing layout props, wrong font sizes, wrong spacing.

**How to apply:**
- Always read the DOM CSS values (padding, gap, fontSize, borderRadius) and convert to exact pixel equivalents
- Always add `layout={{}}` to every pixiBitmapText and PixiIcon
- Always test visually — code that compiles is not the same as code that renders correctly
- Don't use `Div`/`Txt` layout helpers without verifying they render — they may not participate in Yoga
- When the user says "it looks like shit" — take it seriously, read the DOM source, and match every value
