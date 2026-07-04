---
date: 2026-04-14
topic: instrument-editor-wasm-wiring-complete
tags: [editor, wasm, setInstrumentParam, nostalgicplayer, worklet]
status: final
---

# Instrument Editor WASM Wiring — Complete

## What Was Done

Wired ALL NostalgicPlayer format instrument editors to push live parameter
changes to their WASM engines. Previously only 2 formats (SteveTurner,
Sawteeth) had this wiring.

### Phase 1-2: Controls → Engine wiring (21 editors)
Added `engine.setInstrumentParam()` calls to all controls components.
Each editor now pushes numeric param changes alongside the existing
config-object `onChange` flow.

Committed in `4db90cca4` (prior session).

### Phase 3: New WasmParamEditor descriptors
- FredReplayer (31 params: ADSR, vibrato, pulse, blend, arpeggio)
- GMC (4 params), SoundFX (4 params), Voodoo (4 params)
- Added synth types: GmcWasmSynth, SoundFxWasmSynth, VoodooWasmSynth
- Added ENGINE_MAP entries in WasmParamEditorWrapper

### Phase 4: Synth worklet handlers
Added `setInstrumentParam` message handlers to 5 older synth-pattern
worklets that used numeric `_xxx_set_param()` APIs:
- HippelCoSo, RobHubbard, SidMon1, Fred, FC
Each maps string param names → numeric paramIds → normalizes values

### Phase 5: MusicLine worklet handler
Added `setInstrumentParam` handler mapping 40+ param names to byte
offsets, calling existing `ml_write_inst_u8/u16` WASM functions.

### Phase 6: C code + WASM rebuilds
- **Symphonie**: Added `sym_set_instrument_param()` to wrapper.c,
  rebuilt WASM, added worklet handler
- **TFMX**: Added `tfmx_set_instrument_param()` for VolModSeq/SndModSeq
  byte editing, rebuilt WASM, added worklet handler, added TFMXSynth.ts method

### Engine methods added
Added `setInstrumentParam()` to 8 engine files that lacked it:
Fred, OctaMED, SidMon1, HippelCoSo, RobHubbard, FuturePlayer, Symphonie, FC

## Commits
- `4db90cca4` — wire existing instrument editors to WASM param APIs
- `965fb7570` — complete instrument param editing for all WASM replayer formats

## What's Left
- GMC, SoundFX, Voodoo need full parser/routing/type integration before
  their WasmParamEditor descriptors are reachable (engines exist, synth
  types added, but parsers don't assign those synth types yet)
- OctaMED synth WASM has no set_param API at all (only set_instrument for
  loading instrument blobs) — would need C code to add
- Gig April 18 — soak test still needed
