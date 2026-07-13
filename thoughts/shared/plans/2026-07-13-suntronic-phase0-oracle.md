---
date: 2026-07-13
topic: suntronic-phase0-oracle
tags: [suntronic, uade, oracle, native-engine, gate]
status: draft
---

# SunTronic Phase 0 — close the two Phase-4 gates with a UADE oracle

## Why this phase exists

Native SunTronic song playback (Phase 4 = drive the tracker grid through native
SunTronicSynth voices, no UADE audio) is explicitly GATED by the design decision
in `research/2026-07-13_suntronic-full-engine.md:163-164`. Shipping Phase 4 now
would trade correct-but-UADE playback for approximate-native — a band-aid. Two
gates are open:

- **Gate 1 — timbre correctness.** All 5 MEGAEFFECTS synthesis types are coded
  in `src/engine/suntronic/SunTronicSynthVoice.ts`, but only types 0/2 are pinned
  exact. Types 1/3/else were ported from the Andy Silva replayer source and never
  validated. The live voice buffer is still **approximated by `wave1`**
  (`SunTronicSynthVoice.ts:141`). No oracle test exists.
- **Gate 2 — note-row timing model.** `SunTronicParser.ts:468-470` applies the
  0x8C rows/position command **this-voice-only**; the real 0x8C broadcasts to all
  voices at its playback tick. Cross-voice timing is not simulated. The grid is a
  display approximation, not a playback-accurate timeline.

Phase 0 builds a UADE **oracle** that closes both gates. Only then is Phase 4
safe. This is the "measure before coding" step for the native-song effort.

## The oracle toolkit (all exports CONFIRMED in `uade-wasm/build.sh:182`)

- `uade_wasm_read_memory(addr, out, len)` — read Amiga chip RAM via UAE banking
  (`entry.c:716`). Reads the real per-tick synth wave buffer at voice+0x26.
- `uade_wasm_read_channel_samples(ch0,ch1,ch2,ch3, maxFrames)` — per-voice Paula
  audio tap after a render (`entry.c:769`). Direct single-voice isolation, no
  L/R-panning trick, no muting needed. Channels 0+3 = left, 1+2 = right.
- Paula write log: `uade_wasm_enable_paula_log(1)`, `uade_wasm_get_paula_log(out,
  maxEntries)` (`entry.c:862/879`). Entry = 12 bytes
  `{channel:u8, reg:u8, value:u16, source_addr:u32, tick:u32}` (`paula_log.h:20-28`).
  `source_addr` = chip addr the sample DMA read from; `tick` = replayer tick.
- `uade_wasm_mute_channels(mask)` (`entry.c:756`) — bits 0-3, 1=active.
- Render harness already exists: `tools/suntronic-re/suntronicLib.ts`
  (`renderWithCompanions`, `parseHunks`, `loadInstrCompanions`, `rms`) over
  `tools/uade-audit/uadeRenderCore.ts`.

Calling arbitrary exports: they are `_`-prefixed on the Emscripten module
(`mod._uade_wasm_read_memory(...)`). Buffers via `mod._malloc`/`_free`, read back
through `mod.HEAPU8`/`HEAPF32` (refresh heap after malloc — see
`suntronicLib.ts:refreshHeap`).

## Native side under test (the thing the oracle validates)

- `src/engine/suntronic/SunTronicSynthVoice.ts` — MEGAEFFECTS wavetable buffer
  generator (the 5 timbre types + arp step + PRNG). `wave1`-approximation at :141.
- `src/engine/suntronic/SunTronicVoiceRenderer.ts` — `renderSunSynthPreview()`
  composes MEGAEFFECTS + EFFECTS (envelopes, period) into a Paula wavetable voice.
- Decoded synth records: `SunTronicV13.ts` synth-record field map
  (research doc §"Synth/sampled record layout").

---

## Probe P5 — wave-buffer memory oracle (closes Gate 1) [BUILD FIRST]

`tools/suntronic-re/p5-wavebuffer-oracle.ts`.

Decisive because it compares the RAW synth wave buffer, independent of pitch /
resampling / mixing — it directly measures the MEGAEFFECTS output the native code
approximates.

1. Render `mule.src` with companions, paula-log enabled, ~1-2s.
2. From the paula log, for each voice, collect the AUDxLC (location) + AUDxLEN
   writes → the chip address + length of that voice's active wave buffer at each
   tick. (Location reg pair per channel; see Paula reg map. voice+0x26 buffer is
   what the synth types write and DMA plays.)
3. At a chosen tick for a voice playing a known synth instrument (synth[0..4] of
   mule.src, whose records are in the research §layout table), `read_memory` the
   buffer bytes = **UADE ground truth**.
4. Run the native MEGAEFFECTS (`SunTronicSynthVoice`) for the same synth record +
   the same arp-index / tick state, producing the native buffer.
5. Diff. Report per-timbre-type match (types 0/2 must stay exact; 1/3/else are the
   ones under test; the `wave1`-approx at :141 is the suspect).

Exit: a per-type match table. Any type that diffs → fix `SunTronicSynthVoice.ts`
for that type, re-run until byte-exact (or documented-close with reason).
Regression: promote the probe's comparison into
`src/engine/suntronic/__tests__/sunTronicWaveBufferOracle.test.ts` (test:ci),
reading a small committed golden captured from UADE (buffer bytes + the input
synth-record + tick state), so CI validates the native synthesis without needing
the wasm at test time. Fails-on-revert: restore the `wave1`-approx → test fails.

## Probe P6 — note-row timing oracle (closes Gate 2)

`tools/suntronic-re/p6-noterow-oracle.ts`.

1. Render `mule.src`, paula-log enabled, full song length.
2. Per voice, the sequence of AUDxPER (period) + DMACON (DMA on/off) writes with
   their `tick` = the true note-onset timeline. The gap between successive note
   onsets per voice = the real rows-per-position, and a 0x8C write's effect
   appears simultaneously across ALL voices' next onsets = the broadcast proof.
3. Compare against `walkV13Voice`'s emitted per-voice row counts
   (`SunTronicParser.ts:472-530`). Report the divergence per position.
4. Correct the parser's row model: make 0x8C mutate a shared `rowsPerPos` applied
   to all voices at the broadcasting tick (not this-voice-only). Re-run until the
   reconstructed timeline matches UADE within one tick.

Exit: parser grid timeline matches the paula-log onset timeline. Regression:
`sunTronicNoteRowModel.test.ts` (test:ci) asserting a committed golden onset
table (voice, tick, period) reproduces from the parser. Fails-on-revert.

## Phase 0 exit criteria

- [ ] P5: native MEGAEFFECTS byte-matches UADE chip-RAM wave buffer for all 5
      timbre types on mule.src synth[0..4] (or documented-close). `wave1`-approx
      replaced with the real per-type buffer.
- [ ] P6: parser row timeline matches UADE paula-log onset timeline within 1 tick
      across mule.src; 0x8C broadcasts to all voices.
- [ ] Two regression tests in test:ci, both fails-on-revert.
- [ ] `npm run type-check` + `npm run test:ci` green.
- [ ] Only after both: Phase 4 (native grid playback) is un-gated. Update
      `research/2026-07-13_suntronic-full-engine.md:163-164` to record the gates
      closed.

MANUAL: listen to one native-vs-UADE single-voice render pair (via
`read_channel_samples` audio tap) to confirm the timbre is audibly identical.

## Paula-log ABI (confirmed, ready for the probe)

Entry = 12 bytes little-endian: `channel:u8, reg:u8, value:u16, source_addr:u32,
tick:u32` (`paula_log.h:20-28`). `reg` values (`paula_log.h:15-20`):

- `0` LCH — AUDxLC high word; `1` LCL — low word → combine to the 32-bit sample
  (wave-buffer) chip address for that channel. **This is the voice+0x26 buffer
  address to `read_memory`.**
- `2` LEN — length in words; `3` PER — period (pitch); `4` VOL — volume 0-64;
  `5` DAT — data word.

Log-write call sites: `third-party/uade-3.05/src/audio.c:713-816`.

## P5 RESULT (2026-07-13 — oracle built, first type closed)

`tools/suntronic-re/p5-wavebuffer-oracle.ts` is BUILT and working:

- Mechanism proven: per-1-tick chunked render + drain the Paula log + track
  per-channel AUDxLC:LEN + `read_memory` each tick = ground-truth per-tick wave
  buffers (the synth rewrites the same chip buffer in place every tick, so a
  single post-render read is NOT enough — must snapshot per tick).
- It enumerates the native `renderSynthTick` output across a full arp cycle and
  diffs against the captured UADE buffer set.
- **Caught an inverted type-2 (CALC7) splice**: native put the head from wave2 and
  the tail from wave1; UADE proves head=wave1, tail=wave2. Fixed
  `SunTronicSynthVoice.ts` case 2 → native now reproduces **all 11** of mule.src's
  type-2 wave buffers byte-exact (0→11).
- Regression: `src/engine/suntronic/__tests__/sunTronicWaveBufferOracle.test.ts`
  + committed golden `sunTronicWaveBufferOracle.golden.json` (11 UADE buffers).
  wasm-free at test time; fails-on-revert (swap the splice roles back → fail).
- Tail-indexing (`w2[D1..]` vs `w2[0..]`) is oracle-confirmed for mule's DC waves
  and structurally preserved from the original splice; the one non-DC type-2 in
  the corpus (gliders.src) is not triggered in-window, so it can't disambiguate.
  Left as `w2[D1..]` (seamless-splice reading, matches the CALC7 "copy-splice"
  name). Revisit if a non-DC type-2 witness surfaces.

REMAINING Gate-1 types on mule.src: 1 (PRNG noise — needs seed/state alignment),
4 and 5 (else-branch `renderSmooth` — the `wave1`-approx feedback suspect). These
did NOT match (339 unmatched = the type-1 noise voice, inherently random). Each is
its own analysis unit. Gate 1 is PARTIALLY closed (type-2 done).

## Resume pointer (2026-07-13 — where P5 build stopped)

Research COMPLETE. Next action = write `tools/suntronic-re/p5-wavebuffer-oracle.ts`:
self-contained (mirror `renderToSamples` load flow in `uadeRenderCore.ts:147-207`,
reuse `loadUADEModule`/`addCompanions`/`loadInstrCompanions` from `suntronicLib.ts`),
insert `mod._uade_wasm_enable_paula_log(1)` after `_uade_wasm_load`, render ~1s,
then `mod._uade_wasm_get_paula_log(outPtr, maxEntries)` → parse 12-byte entries →
per channel reconstruct LCH:LCL buffer address + LEN, then `mod._uade_wasm_read_memory`
that address → the UADE ground-truth wave buffer. First milestone: just DUMP the
log + print buffer bytes (prove the mechanism), THEN add the native MEGAEFFECTS
comparison. All extra exports are `_`-prefixed on the module; cast to `any` for
the ones not in `UADEModule` (same as `suntronicLib.ts` does for
`_uade_wasm_add_extra_file`).

## Decisions (no open questions)

1. **Memory oracle (read_memory of voice+0x26) is the primary Gate-1 measurement**,
   not audio. Rationale: it isolates synthesis from pitch/resample/mix, so a diff
   points straight at the timbre code. The per-channel audio tap is the MANUAL
   sanity confirm only.
2. **Goldens are committed, captured-from-UADE artifacts** (buffer bytes + input
   state), so CI never needs the wasm. Precedent: `src/generated/` + golden
   re-derivation tests (sunTronicV13Template).
3. **Phase 0 is a hard gate on Phase 4** — do not write native-song-playback code
   until both regressions are green. (User decision 2026-07-13.)
4. One probe per work unit; P5 first (Gate 1 is the deeper unknown — the
   `wave1`-approx is a known-wrong shortcut).
