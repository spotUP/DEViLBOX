---
date: 2026-11-15
author: spot (session devilbox-5f)
status: draft, owner decisions pending
topic: Export DEViLBOX SNES songs to Terrific Audio Driver for use in a SNES game
---

# SNES export via Terrific Audio Driver (TAD)

## Goal

A friend needs SNES music for a game. DEViLBOX exports a SNES song (Furnace SNES chip) as a
Terrific Audio Driver project plus the compiled audio data and assembler includes that drop
into a SNES game. Owner and friend compose in DEViLBOX; this plan builds the pipeline only.

Done = a real SNES `.fur` from `public/data/songs/furnace/snes/` exports from the Export dialog
to a zip that (a) `tad-compiler check` accepts, (b) plays in a SNES emulator through the
friend's game or the TAD example, and (c) sounds like DEViLBOX playback to the owner's ear.

## Facts (research 2026-11-15)

Upstream: github.com/undisbeliever/terrific-audio-driver, v0.4.2. Driver zlib, compiler and
GUI MIT (Marcus Rowe). Full notes: session scratchpad `tad/tad-research.md` (copy key parts
here before the scratchpad goes).

- Project = JSON (`.terrificaudio`): `brr_samples` (WAV or BRR source, loop point, pitch
  range, envelope string `"adsr a d s r"` / `"gain F127"`), `songs[{name, source}]`,
  `sound_effects`. Instruments are declared in each song's MML: `@id sample [adsr|gain]`.
- Songs are MML only, 8 channels A-H. No tracker/Furnace/MIDI import exists upstream.
  Tick = Timer/8000 s, `#Timer 64..256`. Echo via `#EchoLength`, `#FirFilter`, `#EchoFeedback`.
- Samples: mono 8/16-bit WAV, TAD encodes BRR itself.
- Compiler crate depends on brr, serde, serde_json, relative-path; driver is assembled by the
  pure-Rust `spc700asm` in `build.rs`. Only WASM blocker in the `compiler` crate:
  `std::fs` in `samples.rs` (works under emscripten MEMFS).
- CLI `tad-compiler`: `common`, `song`, `song2spc`, `check`, `{ca65,64tass,asar,pv}-export`
  and `-enums`. `check` reports audio RAM overflow; `song`/loader do not.
- Game side: dev includes TAD API files (ca65 / 64tass / asar / pvsneslib) plus our .bin,
  the generated asm with `.incbin` + `LoadAudioData`, and the enums include.
- Audio RAM 64 KB; song max 0xD000; echo buffer EchoLength/16*2048 bytes at top of RAM.

DEViLBOX side (agent B, 2026-11-15):
- SNES chip preset `src/constants/systemPresets.ts:466` (id `snes`, 8 PCM channels).
- Loaded .fur: patterns via `FurnaceToSong.ts` subsongToPatterns; samples in
  `useFormatStore.furnaceSamples` (`FurnaceModuleSample`: data, rate, depth, loopStart,
  loopEnd, loopMode); native data `useFormatStore.furnaceNative` (`src/types/tracker.ts:583`).
- Instrument SNES fields: `FurnaceSNESConfig` (`src/types/instrument/furnace.ts:209`) at
  `instrument.furnace.chipConfig.snes`; sample link via `furnace.amiga` (initSample, noteMap).
- SNES effects: `FurnaceEffectRouter.ts:1287-1330` (0x11 noise, 0x12 echo per channel, 0x13
  pitch mod, 0x14 invert, 0x15/0x16 gain, 0x18-0x1C echo, 0x1D noise freq, 0x20-0x23 ADSR,
  0x30-0x37 FIR).
- Timing: subsong speed1/speed2/hz/virtualTempoN/D/grooves (`FurnaceToSong.ts:297-315`).
- Model-based exporter pattern: `exportAsXM` (`src/lib/export/XMExporter.ts:31`), returns file
  plus warnings. Browser tool runner pattern: `src/lib/export/xgm/xgmtoolWasm.ts` (MEMFS +
  callMain, no logic). Rust in repo: `oidos-wasm/`.
- Unverified: whether `FurnaceModuleSample.data` can be BRR (depth 9) rather than PCM.

## Architecture

```
furnaceNative + patterns + instruments + furnaceSamples   (single source)
   -> src/lib/export/tad/tadSongWriter.ts   (TS: MML text, project JSON, WAV bytes, warnings)
   -> tad-compiler.wasm (upstream Rust CLI, emscripten, MEMFS, via tadCompilerWasm.ts
      copied from xgmtoolWasm.ts)                            check / common / song2spc / *-export
   -> zip: project/ (editable in TAD GUI) + build/ (bin, asm, enums) + preview/*.spc + README
```

The MML writer is a format writer (like XMExporter), not a player. Playback preview of the
result uses the existing GME SPC path in the app. No TypeScript port of TAD code.

## Phases

P0 Compiler to WASM. Vendor TAD v0.4.2 source into `tad-wasm/` (pinned, zlib/MIT notices
kept). Build `tad-compiler` for `wasm32-unknown-emscripten` through buildq; output to
`public/tad/`. Golden test: upstream `examples/example-project.terrificaudio` compiled in node
gives the same bytes as the native CLI. Staleness guard like the XGM template.

P1 Notes and instruments. Writer for: subsong 0, order list unrolled with MML loops, notes,
note off/cut, instrument select, volume, pan, tempo (Furnace hz/speed to `#Timer` and tick
lengths), song loop point, WAV export of each used sample with loop, per-instrument
ADSR/GAIN. Test: each SNES .fur in the corpus passes `check`; unsupported things become
warnings, never silent drops.

P2 Effects. Furnace pitch slides, portamento, vibrato, arpeggio, volume slide, and the SNES
set (echo enable/delay/volume/feedback/FIR, noise, pitch mod, invert, gain, ADSR changes) to
TAD MML commands. Each unmapped effect is a listed warning with row and channel.

P3 Export dialog entry `SNES (Terrific Audio Driver)` in `useExportDialog.ts`, zip bundle,
audio RAM report (bytes used / free, from `check`), SPC preview playable in app.

P4 Owner test: preview .spc in app vs original, then the build files in the friend's game or
the TAD example ROM in an external emulator (no in-app emulator, per hardware-ROM decision).

## Open decisions (owner)

See ledger thoughts/spot/2026-11-15-snes-tad-export.md; answers are written below when given.

### Owner answers 2026-11-15
- Assembler: ship all four (ca65, 64tass, asar, pvsneslib) exports in the zip.
- Toolchain: install Rust target wasm32-unknown-emscripten; reuse xgmtool MEMFS/callMain loader.
- Sound effects: songs AND SFX now. Needs a design step (how a DEViLBOX pattern/instrument is
  marked as an SFX) before P1 closes. Added as P1b.
- Song set: multi-song set now. One TAD project from several .fur files/subsongs with shared
  samples and an audio RAM budget across songs. Added to P3.
- SFX marking (P1b): a subsong named `sfx:<name>` becomes one TAD sound effect from its one
  used channel. No schema change; preview with the normal player. Export validation lists each
  `sfx:` subsong with channel, TAD length and dropped effects. Design notes:
  thoughts/spot/2026-11-15-snes-tad-sfx-design.md. Effect map for P2:
  thoughts/spot/2026-11-15-snes-tad-effect-map.md.

## TAD reference facts (copied from scratchpad research, 2026-11-15)
- BRR file: length 9n or 9n+2 (2-byte LE loop offset header, multiple of 9, <= len-9). Last
  block must have END flag, no earlier block END. Loop flag from last block header.
- MML instrument `@<id> <sample_name> [adsr a d sl sr | gain v]`; ADSR max a15 d7 sl7 sr31.
  Gain prefixes F (0-127), D, E, I, B (0-31), raw (0-255). Channel lines `A @1 l4 o4 v16`.
- Notes `c%20` = 20 ticks; `r` rest (key-off); `^` tie; `&` slur; note id 0 = c0, A4 = 57.
  `#Timer 64..256`, tick = Timer/8000 s.
- Sample entry: `{"name","source":{"type":"wav","source":"samples/x.wav","evaluator":"default",
  "loop_point":N,"loop_filter":"filter_1","dupe_block_hack":2},"ignore_gaussian_overflow":false,
  "pitches":{"type":"octave","frequency":F,"first_octave":a,"last_octave":b},"envelope":"adsr 12 1 1 16"}`.
- WAV mono 8/16-bit, length and loop multiple of 16. Audio RAM 64 KB.
- Pitch: TAD frequency = (tuning * 2^(-9/12)) * 32000 / c4Rate (sample at c4Rate plays C-4).

## Writer design (P1)
- Input: native data, subsong index, instruments (FurnaceConfig by index), samples. Output
  {mml, brr_samples entries, sample files, warnings}. Project builder dedupes samples (P3);
  `sfx:` subsongs go to the SFX file (P1b).
- Tempo: rate = hz*virtualTempoN/virtualTempoD; `#Timer round(8000/rate)` clamped 64..256 with
  warning. Rows alternate speed1/speed2; warn on speedPattern/grooves/speed effects.
- Unroll order list; 0Bxx jump (loop `L` at target if visited, else stop), 0Dxx break; default
  loop to start.
- Note held until next note/off; off/release -> `r`; `@` per instrument; vol -> `V`; pan `p`.
- Instrument envelope: useEnv -> `adsr a d s r`; gainMode 0 -> `gain F<g&127>`, 4 D, 5 E, 6 I,
  7 B (rate g&31).
- Samples: PCM -> mono 16-bit WAV padded to multiple of 16, loop aligned (warn), cut at
  loopEnd; BRR (depth 9) -> .brr with flags fixed.
- Unsupported effects -> warnings with row/channel.
