---
date: 2026-04-06
topic: v2-synth-byte-mapping
tags: [v2, synth, audit, wasm]
status: draft
---

# Handoff: V2 Synth Byte Mapping Issues

## Status: Partially Working

The V2 Farbrausch synth produces audio but presets don't sound correct. NoteOff works. The core issue is the V2Config → binary patch byte conversion.

## What Works
- WASM loads and initializes
- NoteOn produces audio (with init patch)
- NoteOff releases (allNotesOff on mono path)
- Presets DO change the patch data (different bytes sent)
- Store routing fixed: `updateComplexSynthParameters` instead of no-op `updateV2Parameters`
- Fetch paths fixed: `/v2/V2Synth.wasm` not `/V2Synth.wasm`
- oscsync byte alignment fixed (was shifting all subsequent bytes by 1)

## What's Broken
- Presets sound wrong or silent
- `toUnsigned` conversion is overcorrecting — V2Config mixes raw byte values (0-127) with signed values (-64 to +63) for transpose/detune
- WASM still has debug printf spam (needs rebuild to remove)

## Root Cause
`v2ConfigToInstrument()` in `src/types/v2Instrument.ts` uses `toUnsigned(v + 64)` for transpose/detune. But V2Config presets use MIXED conventions:
- `mode`, `color`, `level`, `cutoff`, `resonance` = raw 0-127 bytes
- `transpose`, `detune` = signed -64 to +63 (needs +64 offset)

The `toUnsigned` function currently adds +64 to ALL values, which is wrong for raw bytes. Need to determine exactly which fields are signed vs raw.

## Fix Strategy
1. Compare each preset's `v2ConfigToBytes` output byte-by-byte against `v2initsnd` (the factory default in `v2-synth-wasm/src/sounddef.h:203`)
2. Identify which V2Config fields need +64 offset and which don't
3. Fix `toUnsigned` to only apply to truly signed fields
4. Rebuild WASM to remove debug prints from `v2synth_wasm.cpp` and `synth_core.cpp`

## Key Files
- `src/types/v2Instrument.ts` — `v2ConfigToBytes()`, `v2ConfigToInstrument()`, `DEFAULT_V2_INSTRUMENT`
- `src/types/instrument/defaults.ts` — `DEFAULT_V2` (V2Config format)
- `src/constants/v2Presets.ts` — preset definitions
- `src/engine/v2/V2Synth.ts` — `applyConfig()`, `_applyV2Config()`
- `v2-synth-wasm/src/v2synth_wasm.cpp` — WASM bridge
- `v2-synth-wasm/src/sounddef.h:203` — `v2initsnd` reference bytes
- `v2-synth-wasm/src/synth_core.cpp` — V2Sound struct layout
