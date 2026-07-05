---
date: 2026-07-06
topic: sonix-functional-editor
tags: [sonix, instrument-editor, wasm, synth]
status: draft
---

# Sonix functional instrument editor — design

## Goal

Rebuild `SonixControls` so it replicates the **functionality** of the Aegis SONIX V2.0
instrument editor, using DEViLBOX's existing synth-editor template (design tokens,
`@components/controls/Knob`, `@components/controls/Toggle`, drawable canvases) — **not**
the retro Amiga chrome. Every Aegis control must be backed by a real Sonix `.instr`
field; where the format has a field we don't yet parse, extend the WASM parser rather
than fabricating or faking values.

Live editing must reach the running WASM song immediately (the knob-edit routing fixed in
commit 710d0fe4e is the delivery path: `updateInstrument` → `SonixSynth.applyConfig` →
`SonixEngine.setSynthParams` → worklet → WASM setters).

## Ground truth (measured)

Fixture `public/data/songs/sonix-smus/ACE II/Instruments/Ace2-2.instr`, header
`"Synthesis"`, 502 bytes (0x1F6). Authoritative disk offsets are in `sonix_io.c` (the asm
is symbol-less; its runtime offsets differ from disk by an inconsistent delta). Three
128-byte signed tables exist: `wave`@0x44, `envTable`@0xC4, and a **third table @0x144**
that is currently unparsed.

## Control → field mapping (final)

| Section | Control | Field | Range | Status |
|---|---|---|---|---|
| Amplitude | Vol | `baseVol` @0x1CC | 0–255 | have |
| | EG On/Off | `envLoopMode` @0x1DE (−1=off) | −1..127 | have |
| | LFO | — | — | **omitted — no field in this format version** |
| Freq | Port | `slideRate` @0x1D2 | 0–4095 | have |
| | LFO | `envPitchScale` @0x1D4 | 0–4095 | have |
| Filter | Freq | `filterBase` @0x1D6 (XOR 0xFF) | 0–63 | have |
| | EG | `filterEnvSens` @0x1DA | 0–4095 | have |
| | LFO | `filterRange` @0x1D8 | 0–4095 | have |
| LFO | Speed | `envScanRate` @0x1DC | 0–4095 | have |
| | Sync (Off/Once/On) | `envLoopMode` @0x1DE (3-state) | −1/0/≥1 | have |
| | Delay | `envDelayInit` @0x1E0 | 0–255 | have |
| Phase | Speed | `c2` @0x1E2 | 0–4095 | have |
| | Depth | `c4` @0x1E4 | 0–4095 | have |
| Amplitude | Env→Volume | `envVolScale` @0x1D0 | 0–4095 | have (surfaced) |
| Wave | +2nd / +3rd / Amt | *canvas action* — bakes harmonic into `wave[128]` | — | client-side, no field |
| Waveform | Oscillator | `wave[128]` @0x44 | i8 | have |
| | **LFO** | **`lfoWave[128]` @0x144** | i8 | **GAP 1** |
| | Filter Env | `envTable[128]` @0xC4 | i8 | have |
| Envelope Gen | **Levels 1–4** | **`egLevels[4]` @0x1E6** | u16 (obs 0–255) | **GAP 2** |
| | **Rates 1–4** | **`egRates[4]` @0x1EE** | u16 bit-packed | **GAP 2** |

`envLoopMode` legitimately backs both "Amplitude EG On/Off" and "LFO Sync"; expose it once
(in LFO · Sync as a 3-state control) and mirror its state read-only in Amplitude.

## Gaps to close (both real fields)

### GAP 1 — LFO waveform table @0x144
- `sonix_io.c`: read 128 signed bytes at `instr_data + 0x144` (mirror the 0x44 `wave` read),
  guarded on `instr_size >= 0x1C4`.
- `sonix.c`: add `synth_lfo_wave[64][128]` storage + `sonix_song_set_synth_lfo_wave`.
- `sonix_harness.c`: export `_sonix_synth_set_lfo_wave` + `_sonix_synth_get_lfo_wave`.
- Decide whether `lfoWave` affects playback. Per the C port, the third table is not
  consumed today. **Scope decision: expose it as editable/round-trippable, but do NOT wire
  new DSP** — matching current playback semantics. Documented as data-faithful, not a new
  sound path. (Avoids speculative audio changes — house rule.)

### GAP 2 — Envelope Generator 4 Levels + 4 Rates
- Already parsed into `ss_port_target[4]` / `ss_port_speed[4]` (`sonix.c:127`) and drives
  the 4-stage envelope (`sonix.c:2110-2145`). Only exposure is missing.
- `sonix_harness.c`: export `_sonix_synth_get_eg_level(i,j)` / `_get_eg_rate(i,j)` and
  `_set_eg_level(i,j,v)` / `_set_eg_rate(i,j,v)`.
- Rates are bit-packed (bits 0–4 base, bits 5–7 shift). Editor edits the **raw u16** with a
  readout of the decoded step; no lossy re-encode.

## Worklet + engine plumbing

- `Sonix.worklet.js` `postSynthParams()`: add `lfoWave` (readInt8Array @ getter),
  `egLevels` (4× get_eg_level), `egRates` (4× get_eg_rate).
- `applySynthParams(p)`: write `lfoWave` (writeInt8Array), and 4× set_eg_level / set_eg_rate.
- `SonixEngine.ts` `SonixSynthParams`: add `lfoWave: number[]`, `egLevels: number[]`,
  `egRates: number[]`.
- Rebuild WASM (`cd sonix-wasm/build && emmake make` → `cp Sonix.{js,wasm} public/sonix/`).

## UI — SonixControls (DEViLBOX template)

Sections in Aegis order, each a design-token panel (`bg-dark-bgSecondary`,
`text-[10px] font-mono` labels). Continuous controls use `Knob` with `configRef` pattern;
On/Off uses `Toggle`; Sync uses a 3-segment `CustomSelect`/segmented control.

- **Waveform** (top, prominent): 3 tabs — Oscillator / LFO / Filter Env — each a drawable
  128-point `ByteCanvas` (freehand pointer draw, writes the corresponding i8 table). Ok
  (commit) / Undo (revert to pre-edit snapshot) buttons per Aegis. Below Oscillator:
  **+2nd / +3rd** buttons and an **Amt** knob — additive-harmonic bake into `wave[128]`.
- **Amplitude**: Vol, Env→Volume knobs; EG On/Off read-only mirror of Sync.
- **Freq**: Port, LFO(Pitch) knobs.
- **Filter**: Freq, EG, LFO knobs.
- **LFO**: Speed, Delay knobs; Sync 3-state (Off/Once/On).
- **Phase**: Speed, Depth knobs.
- **Envelope Generator**: Levels 1–4, Rates 1–4 (8 knobs) with decoded-step readout on Rates.

Every control's `onChange` → `updateInstrument(id, {parameters:{sonixIndex, sonix:next}})`,
reusing the existing configRef handler. No new store branch needed (710d0fe4e routes it).

## 486-byte variant fix

`sonix_io.c` currently gates the entire 0x1CC block on `instr_size >= 0x1F6`, so 486-byte
(0x1E6) synths parse none of base_vol/filter/env/EG. Replace the single gate with per-field
size checks so smaller synths round-trip their available fields (EG block absent below 0x1F6
is fine — leave `egLevels/egRates` empty then).

## Testing

- **WASM parse (native harness)**: extend `tools/sonix-audit` — assert `lfoWave` reads 128
  bytes from a 502-byte fixture, and `egLevels/egRates` match the raw file u16s at
  0x1E6/0x1EE. Fails before the parse/getters exist.
- **Round-trip**: `SonixSynthParams` → worklet apply → getters read back identical
  lfoWave/egLevels/egRates (in-node WASM or native harness).
- **Store routing** already covered by `sonixSynthLiveEdit.test.ts`; extend to assert an
  egLevels edit reaches applyConfig.
- **Harmonic bake (pure fn)**: extract `addHarmonic(wave, n, amt)` and unit-test it
  (2nd/3rd partial added at amt, clamped to i8) — no WASM needed.
- **Type-check** must pass (`npm run type-check`).

## Out of scope
- Amplitude · LFO (no backing field this format version).
- New DSP for the LFO table (data-faithful only).
- P7 native `.instr` export/round-trip to disk (separate follow-up).
- Faithful retro chrome (explicitly declined — use the DEViLBOX template).
