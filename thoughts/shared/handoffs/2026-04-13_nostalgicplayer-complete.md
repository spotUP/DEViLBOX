---
date: 2026-04-13
topic: nostalgicplayer-ports-complete
tags: [port, nostalgicplayer, wasm, edit-api, presets]
status: final
---

# NostalgicPlayer C Ports — Complete Session Handoff

## What Was Built

### 23 standalone C/WASM replayers
All NostalgicPlayer Amiga format players ported from C# to C:
- Sonic Arranger, SoundMon, Digital Mugician, David Whittaker
- Sound Control, Delta Music 1+2, Voodoo Supreme, Game Music Creator
- SoundFx, Oktalyzer, InStereo! 1+2, Future Composer, Fred Editor
- Quadra Composer, Ron Klaren, Actionamics, Activision Pro
- Synthesis, Digital Sound Studio, Sound Factory, Face The Music

Stats: ~35K lines C, ~500KB total WASM, all 22 pass native audio tests.

### Per-channel render + oscilloscope
All 23 formats have `*_render_multi()` for per-channel mono output.
Worklets send `oscData` messages with Int16 waveforms per channel.

### Full edit APIs
Every format has:
- `get_cell` / `set_cell` — pattern data access
- `get_instrument_param` / `set_instrument_param` — format-specific named params
- `get_instrument_name`, `get_instrument_count`
- `export` — returns original file data

### Live editing pipeline
Pattern editor → useTrackerStore.setCell() → detects active NP engine →
Engine.setCell() → worklet postMessage → WASM _XX_set_cell()

### 200+ synth presets
13 preset files covering all synth-capable formats:
sonicArranger, soundMon, inStereo1, inStereo2, synthesis, digitalMugician,
fredEditor, soundFactory, voodooSupreme, ronKlaren, actionamics,
deltaMusic1, deltaMusic2

### Parser wiring
All format parsers set dedicated `*FileData` fields.
`withFallback.ts` skips UADE injection for all 23 formats.
`usePatternPlayback.ts` passes all fileData to `loadSong`.
`NativeEngineRouting.ts` has entries for all 23 formats.

## Remaining Work

### Not yet done:
1. **Format-specific instrument editor UI components** (DOM + Pixi) — each format
   needs a panel showing its unique instrument parameters with knobs/sliders
2. **Export integration** — hook `sa_export()` etc. into exporters.ts for Save/Download
3. **Binary accuracy verification** — compare waveform output against NostalgicPlayer C#
4. **Formats still on UADE** — Rob Hubbard, Core Design, Startrekker AM (no C# source)
5. **SoundFx SO31** — no test files found (all .sfx are SONG variant)

### Known issues:
- SoundFactory: some .psf files infinite-loop (safety counter workaround)
- Fred Editor: 1/4 test files (fuzzball-title) had converter variant issue (fixed)
- Sonic Arranger: 4EFA sub-format falls through to UADE (correct behavior)

## Key Files
- C sources: `*-wasm/src/*.{h,c}` (23 directories)
- Build scripts: `*-wasm/build.sh` (23 scripts)
- Worklets: `public/*/Name.worklet.js` (23 worklets)
- Engines: `src/engine/*/NameEngine.ts` (23 engines)
- Synth stubs: `src/engine/*/NameSynth.ts` (23 stubs)
- Presets: `src/constants/presets/nostalgicplayer/*.ts` (13 files)
- Routing: `src/engine/replayer/NativeEngineRouting.ts`
- Store: `src/stores/useFormatStore.ts` (23 fileData fields)
- Playback: `src/hooks/audio/usePatternPlayback.ts` (23 fields wired)
- Edit hook: `src/stores/useTrackerStore.ts` (NP engine edit sync block)
- Fallback: `src/lib/import/parsers/withFallback.ts` (23 format check)
