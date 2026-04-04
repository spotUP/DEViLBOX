---
name: Pixi layout props mandatory
description: Every pixiBitmapText, PixiIcon, and pixiSprite in flex containers MUST have layout={{}} or they break flex centering
type: feedback
---

Every `pixiBitmapText`, `PixiIcon`, and `pixiSprite` that participates in a Yoga flex layout MUST have `layout={{}}`.
Without it, Yoga doesn't track the element's size and flex centering, spacing, and alignment all break.

**Why:** Spent hours debugging overlapping text, garbled chips, and icon offsets in the Add Instrument dialog. All 17 elements were missing `layout={{}}`. This caused: text overlapping, cards not flowing, icons floating above text.

**How to apply:** When writing ANY Pixi component that uses flex layout (`flexDirection`, `alignItems`, `justifyContent`, `gap`), ensure EVERY child has `layout={{}}` at minimum. Sprites need `layout={{ width: X, height: Y, flexShrink: 0 }}`.
