---
name: No duplicated logic between views
description: Views (DOM/Pixi/3D) must be dumb renderers — all logic in shared hooks/actions/engine. NEVER duplicate logic across rendering modes.
type: feedback
---

Views are DUMB RENDERERS. All logic lives in shared hooks, engine methods, or action functions.

**Why:** On 2026-03-23, a full audit found ~33,500 lines of duplicated logic across DOM, Pixi, and 3D views. On 2026-03-24, all 6 dialog pairs and 6 view pairs were deduped into 12 shared hooks (`src/hooks/dialogs/` and `src/hooks/views/`). The Pixi DJ transport gained spinDown + quantize. Three Pixi libopenmpt bugs were fixed. Pixi ArrangementView gained automation lane playback. Handoff: `thoughts/shared/handoffs/2026-03-24_view-dialog-dedup-complete.md`.

**How to apply:**
- NEVER call `getDJEngine()` from a view component — use a shared hook or action function
- NEVER call `store.getState().set*()` from a view component — use a shared action
- NEVER instantiate engine objects (TurntablePhysics, etc.) in views — engine owns them
- NEVER implement play/pause/scratch/transport logic in views — DeckEngine owns this
- Before adding any feature to one view, extract it to shared code so ALL views get it
- When modifying view code, search for duplicates in other views FIRST
- If you find duplicated logic, extract to shared code BEFORE making changes
