---
date: 2026-06-24
topic: cinter4-format-and-synth
tags: [cinter, amiga, format, synth, export, instrument-editor]
status: final
---

# Cinter 4 — format, synth model, and DEViLBOX integration plan

Research for tasks: binary-compatible export (#2) and 1:1 instrument editor (#3).
Reference source (cached): `/private/tmp/cinter-src/` — `README.txt`,
`convert/CinterConvert.py`, `cinter/src/engine.rs`, `gui/src/app.rs`,
`player/Cinter4.S`, `examples/*.mod`. Upstream: github.com/askeksa/Cinter.

## What Cinter is

A two-oscillator phase-modulation softsynth for Amiga 4k intros. Authoring
pipeline is **MOD-based**:

1. Cinter GUI creates a sample; its 12 params are encoded into the **sample name**.
2. Compose in ProTracker (MOD) using those named samples (+ optional raw samples).
3. `CinterConvert.py` turns the MOD into a **songdata binary** (+ raw sample blob).
4. The Amiga intro links `Cinter4.S` + the songdata; `CinterInit` regenerates the
   PCM on the Amiga at runtime from the stored params.

The `.cinter4` file DEViLBOX imports **is that songdata binary** (the compiled
output), not the editable source. The editable source is the MOD (params live in
sample names). This is the crux for export.

## Architecture decision (confirmed with user)

- **Keep** the `.cinter4` songdata importer — first-class way to load existing /
  precompiled Cinter songs (decode → patterns + instruments + WASM playback).
- **Author/edit** Cinter songs on DEViLBOX's existing MOD model (DEViLBOX is 100%
  MOD-compatible via OpenMPT). A "Cinter instrument" is a synth instrument whose
  12 params encode into the sample name; DEViLBOX synthesizes the PCM in-app
  (we already have the synth: WASM `CinterMakeInstruments`, and `engine.rs`).
- **Export** = port `CinterConvert.py`'s MOD→songdata logic onto DEViLBOX's
  tracker/effect model (do NOT hand-roll the music-stream encoder). All the
  effect semantics (porta 1/2/3, vibrato, arpeggio, retrig, notedelay, volume
  slides, per-row→per-tick expansion) are exactly what CinterConvert does from a
  MOD, and DEViLBOX already implements MOD effects.

## Songdata binary format (big-endian) — VERIFIED against test-automatic.cinter4

```
insts_data:
  [if raw] int16  -rawCount
           rawHeaders: rawCount × [u16 length, u16 replength]
  int16   genCount-1                       (68k dbra convention)
  genInstruments: genCount × 11×u16        (see "instrument record" below)
music header:
  u16  trackSize            = len(notes_data)/4 = bytes per channel track
  u16  instTableLen         = bytes of note-ID table
note-ID table (instTableLen bytes):
  N × [u8 noteMin, u8 range, u16 marker]   (marker==0 ⇒ new-instrument boundary)
  + trailing int16 loop offset = (restart - musiclength + 1)*2
notes_data (4 × trackSize bytes):
  4 channel tracks written in order [3,2,1,0]; one u16 event word per 50Hz tick
```

`numTicks = trackSize/2`. Event word at `musicData + block*trackSize + t*2`,
where file `block = 3 - displayChannel` (= Paula channel = MOD channel).

### Event word encoding (from CinterConvert.py export-notes section)

- **bit15=1 trigger:** `0x8000 | (vol<<9) | noteId`; vol 0-63 (64→63),
  noteId 9-bit index into the note-ID table → (instrument, semitone, sampleoffset).
- **bit15=0, low-byte bit7≠bit6 ⇒ absolute period:** `(0x80|note)|(dvol<<9)`;
  `note` = direct period-table index (porta target / arpeggio / note change on a
  held sample). dvol is a volume *delta*.
- **bit15=0, bit7==bit6 ⇒ relative slide:** `(dper<<0)|(dvol<<9)`; per-tick
  portamento (dper 9-bit signed &511, constraint bit7==bit6) + volume delta.

Note-ID walk (replayer & decode): `inst=-1; for entry: if marker==0 inst++;
if id<range return {semitone: noteMin+id, inst}; id-=range`.

Period table (index 0 = 856): `856,808,762,720,678,640,604,570,538,508,480,453,
428,...,113` (36 entries). DEViLBOX row note = `37 + index` (XM; period 856 = C3).

## Instrument record (11×u16) and the 12 user params

Packed order: `length, replength, mpitch, mod, bpitch, attack, dist, decay,
mpitchdecay, moddecay, bpitchdecay`. The per-sample synthesis data is **generated
at runtime**, not stored — so each generated instrument is exactly 22 bytes.

12 user params (editor-facing). Domains: idx 0-7 ∈ [0,100], idx 8-11 ∈ [0,10].
Sample-name encoding: `"1"` + eight 2-digit fields (100→"XX") + four 1-digit
fields (10→"X") = 21 chars. Leading char digit ⇒ v4, else v3.

| idx | name | word | forward transform |
|----|------|------|-------------------|
| 0 | attack | attack | `65536 − ⌊10000/(1+p²)⌋` (&0xFFFF) |
| 1 | decay | decay | `⌊10000/(1+p²)⌋` |
| 2 | mpitch | mpitch | pitchfun |
| 3 | mpitchdecay | mpitchdecay | decayfun |
| 4 | bpitch | bpitch | pitchfun |
| 5 | bpitchdecay | bpitchdecay | decayfun |
| 6 | mod | mod | raw p |
| 7 | moddecay | moddecay | decayfun |
| 8/9/10/11 | mdist/bdist/vpower/fdist | dist | `(p8<<12)|(p9<<8)|(p10<<4)|p11` |

- **pitchfun** v4: `p==0→0; p<5→8<<p; else round(256·2^((p−5)/12))`.  v3: `p·512`.
- **decayfun** v4: `v=p/50−1; round(exp(0.0008v+0.1v⁷)·65536)&0xFFFF`.
  v3: `round(exp(−0.000002·p²)·65536)&0xFFFF`.
- attack/decay(env), mod, dist are version-independent.

Editor display text (engine.rs get_parameter_text_and_label): attack/decay →
`32767/envfun + 1 samples` or "infinite"; pitch → octaves/semitones; decays →
`word/65536` (5 dp); dist → p; vpower → p+1.

## Implemented so far

`src/lib/import/formats/cinter4Params.ts` — version-aware bidirectional model:
`cinter4ParamsToWords` / `cinter4WordsToParams`, `cinter4ParamsToSampleName` /
`cinter4SampleNameToParams`, `cinter4DetectVersion` (by exact pitch match),
`cinter4ParamDisplay`. **Validated:** forward transforms are byte-exact vs the
reference Python for all 101 param values (only p=100 attack differs, and there
my 16-bit mask 0 is the correct stored value). Names round-trip 14/14. Pitch /
attack / mod / dist round-trip exactly on the example file.

`src/lib/import/formats/Cinter4Parser.ts` — decodes songdata into editable rows
(triggers + absolute-period notes; relative slides deferred), 64-row patterns +
order list, all 18 instruments (raw+gen) with global indices, speed=1 (1 row =
1 tick → display tracks WASM playback).

## Known limitations / gotchas

- **Version & exact params are NOT recoverable from songdata alone** — they live
  in MOD sample names. Decay words in the examples are ±1-16 off the current
  formula because they were compiled by older converter releases (README version
  history: pitch/decay fixes 2015→2019). Round-trip of pre-existing songdata is
  therefore best-effort; authoring/export from the MOD model is exact.
- Cinter 3 and 4 instruments coexist in one song (test-automatic has both).
- `note==64` volume plays as 63. Finetune must be 0. Repeat only at sample end.
- 512 note-ID limit per song (sum of tone ranges per instrument/sampleoffset).

## Next steps

- #3 Instrument editor: 12 params with the display text above, normalized or
  integer sliders (resolution 0.01 for 0-7, 0.1 for 8-11), live PCM regen via the
  WASM synth. Needs browser verification.
- #2 Export: port CinterConvert.py MOD→songdata onto DEViLBOX patterns; validate
  byte-identical against `CinterConvert.py examples/*.mod`. Use cinter4Params for
  the instrument records + sample names.
- #1 Preset ripping: extract instruments (params) from example songs → editor
  preset picker. The 9 example MODs are at `/private/tmp/cinter-src/examples/`.
```
