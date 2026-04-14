---
name: Sidechain source per-channel routing — DONE
description: Sidechain effects now use WASM isolation system for per-channel source selection
type: project
---

Sidechain source dropdown now works for WASM engines (libopenmpt/Furnace/Hively/UADE).

**Implementation (2026-04-13):**
- `ChannelRoutedEffectsManager` gained sidechain tap API: `addSidechainTap()`, `removeSidechainTap()`, `_allocateSidechainSlot()`
- Isolation slots are allocated for sidechain taps, isolated audio routed back to master mix (so source channel stays audible)
- `wireMasterSidechain()` tries isolation system first (WASM modes), falls back to Tone.js channel outputs (sampler mode)
- Circular import deadlock fixed via `registerSidechainResolver()` pattern — ToneEngine registers callbacks at init
- Sidechain taps survive `ChannelRoutedEffectsManager.rebuild()` via `sidechainConsumers` map

**Bugs fixed in audit:**
- SidechainGate `range` parameter: UI sent dB (-80..0) but setter clamped to 0..1 — added dB→linear conversion
- `selfRouteGain` not disposed in all 3 sidechain effects — memory leak fixed
- Vite HMR disabled (EMFILE) — repo too large for file watchers, documented in vite.config.ts
