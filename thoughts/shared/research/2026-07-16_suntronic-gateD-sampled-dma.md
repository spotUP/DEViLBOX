---
date: 2026-07-16
topic: suntronic-gateD-sampled-instrument-dma
tags: [suntronic, phase4, native-playback, sampled, paula-dma]
status: final
---

# Gate D research — SunTronic sampled-instrument DMA (type-B voices)

Documentary. No code written. Goal: understand why a sampled (type-B) voice
renders SILENT in native playback, and what the native path must source
(sample ptr, period, volume, loop) to render it. Witness: analgestic2 voice 2.

## Root cause (TWO gaps, not one)

`SunTronicPlayer.selectInstrument` (SunTronicPlayer.ts:227) returns `null` for a
type-B (bit6-clear) select — only the type-A synth table is modelled. Two
consequences, both must be fixed:

1. **No sample buffer.** `v.instr = null`, so `tick()` emits `instrOff = -1`
   (line 499) and native-mix has nothing to render for the voice.
2. **No period/volume.** `stepEffects` bails at line 368 (`if (!inst) return`)
   — so a type-B voice never computes period, out-volume, vibrato, or advances
   its envelopes. Period/volume freeze at their last value.

The disasm proves EFFECTS is SHARED between synth and sampled voices, so gap 2
is real: the real replayer runs the full EFFECTS for a sampled voice.

## RE oracle: DP_Suntronic.s (Andy Silva DeliPlayer)

`docs/formats/Replayers/DeliPlayers/AndySilva/DP_Suntronic.s`

### GNN8 = type-B sampled note-on (line 568)

```
GNN8    SUBQ.B  #1,D0            ; sel-1 → 0-based index
        move.l  inst2(pc),A2     ; base of sampled table
        MULU    #$001C,D1        ; stride 0x1c
        LEA     (A2,D1.W),A3     ; A3 = record
        MOVE.L  A3,4(A0)         ; voice+4 = record ptr (same slot as synth!)
        CLR.L   $000E(A0)        ; clear arp index/phase
        CLR.B   $0014(A0)        ; flags = 0  → ACTIVE (not negative)
        CLR.L   $0022(A0)        ; clear vibrato accumulator
        MOVE.L  $0012(A3),$0016(A0)  ; sample data ptr  → voice+0x16
        MOVE.W  $0016(A3),$001A(A0)  ; length words     → voice+0x1a
        MOVE.W  $0018(A3),$001C(A0)  ; loopStart words  → voice+0x1c
        MOVE.W  $001A(A3),$001E(A0)  ; loopLen words    → voice+0x1e
```

Key: `$14 = 0` (not `0x80`), so EFFECTS does NOT branch to EFF5 — full EFFECTS
runs for the sampled voice. `4(A0)` (record ptr) occupies the SAME voice slot as
a synth record, and EFFECTS reads env/vib from it identically.

### EFFECTS reads the record front the same way for both types (line 415)

`A1 = 4(A0) = record`. EFFECTS reads:
- `(A1)`   = record+0x00 → vol-env data ptr (`envelopeOff`)
- `4(A1)`  = record+0x04 → vol-env length  (loop compare, line 486)
- `6(A1)`  = record+0x06 → vol-env loop     (line 488)
- `8(A1)`  = record+0x08 → vibDepth table ptr (line 436)
- `$C(A1)` = record+0x0c → vib length (line 493)
- `$E(A1)` = record+0x0e → vib loop  (line 495)
- `$10(A1)`= record+0x10 → vib speed (added to $22, line 489)

This is BYTE-IDENTICAL to the synth record front decoded by
`decodeSunSynthInstrument` (SunTronicV13.ts:588-596): volEnvOff@0, volEnvLen@4,
volEnvLoop@6, freqEnvOff(vibDepth)@8, freqEnvLen@C, freqEnvLoop@E,
freqEnvSpeed@10. => A sampled voice can reuse the synth env/vib decode verbatim.

## Sampled record layout (0x1c bytes) — confirmed by disasm + values

| off   | field            | parser (SunTronicV13.ts:796-803) |
|-------|------------------|----------------------------------|
| 0x00  | vol-env ptr      | `envelopeOff` ✓                  |
| 0x04  | vol-env len      | (not yet decoded)                |
| 0x06  | vol-env loop     | (not yet decoded)                |
| 0x08  | vibDepth ptr     | (not yet decoded)                |
| 0x0c  | vib len          | (not yet decoded)                |
| 0x0e  | vib loop         | (not yet decoded)                |
| 0x10  | vib speed        | (not yet decoded)                |
| 0x12  | sample data ptr* | `slotIndex` (u32, on-disk = slot)|
| 0x16  | length words     | `lengthWords` ✓                  |
| 0x18  | loopStart words  | `loopStartWords` ✓               |
| 0x1a  | loopLen words    | `loopLenWords` ✓                 |

*On disk `$12` holds a small slot index (0,1,2 for analgestic2). The replayer's
file-open init pokes the loaded sample address over it before play (classic
Amiga pattern). Native path uses the slot index directly to look up the
companion PCM.

Parser currently decodes only envelopeOff/slotIndex/length/loopStart/loopLen —
NOT the env-len/loop/vibDepth/vib params EFFECTS needs. Gate D must decode the
full front (reuse synth logic).

## Sample data source — companion files, raw s8 PCM

`slotIndex` → `score.instrumentNames[slotIndex]` → companion file → raw signed
8-bit Amiga PCM (the ENTIRE file is the sample, size = lengthWords*2).

analgestic2 verified:
- slot 0 = `perc1.x` = 4724 bytes = 2362 words; loopStart 0, loopLen 1 (one-shot)
- slot 1 = `perc2.x` = 5620 bytes = 2810 words; one-shot
- slot 2 = `bio`     = 5876 bytes = 2938 words; loopStart 0, loopLen 2938 (full loop)

loopLen 1 word = one-shot (Amiga idiom: 2-byte silent loop tail). loopLen ≥
lengthWords = loop the whole sample.

Companion loading already exists:
- App file-nav: `sunTronicCompanionPaths(buf)` (SunTronicV13.ts:299) →
  `sunTronicSampleDir(buf) + name`, consumed at useFileNavigation.ts:174.
- RE harness: `loadInstrCompanions()` / `addCompanions()` (suntronicLib.ts:53).

Neither path currently delivers PCM to `SunTronicPlayer` — that wiring is new.

## Native render model

Sampled voices are NOT wavetable-generated (MEGAEFFECTS jump-table @0x26c5c is
synth-only). They are played by Paula DMA directly from voice fields:
- ptr    = voice+0x16 (sample data)
- length = voice+0x1a
- loop    = voice+0x1c (start) / voice+0x1e (len)
- period = voice+0x20 (from EFFECTS, note→period, same as synth)
- volume = voice+0x15 (outVolume, from EFFECTS vol-env)

native-mix already has a Paula resampler (phase accumulator + period→increment).
The sampled render = feed the companion PCM as the voice buffer with loop
metadata (wrap into [loopStart, loopStart+loopLen) after the first pass) instead
of a per-vblank regenerated synth tick. One-shot (loopLen==1) stops after the
first pass (silence past length).

## Gate D scope (plan input — NOT yet implemented)

1. **Parser** (SunTronicV13.ts): decode the sampled record's full env/vib front
   (offsets 0x04-0x11) into the `SunSampledInstrument` — reuse the synth
   volEnv/vibDepth slice logic. Add resolved `sampleData` companion binding
   (or leave PCM lookup to the player via slotIndex + instrumentNames).
2. **Companion PCM → player**: deliver the per-slot raw PCM to `SunTronicPlayer`
   (constructor input or score field). Map slotIndex → instrumentNames[slot] →
   bytes.
3. **selectInstrument** (SunTronicPlayer.ts:227): for bit6-clear, build a
   sampled descriptor (env/vib block + sample buffer + loop) instead of null,
   set v.instr so stepEffects runs the full EFFECTS.
4. **stepEffects**: no change needed for period/vol (shared) — but confirm the
   sampled descriptor exposes volEnv/vibDepth arrays so lines 373/379 index
   real tables.
5. **tick()**: emit a sample reference (slot id or a `sampled` flag +
   loopStart/loopLen) so native-mix picks the sampled render path.
6. **Render** (SunTronicSynthVoice / native-mix): add a sampled voice path =
   resample the PCM buffer at Paula period with loop wrap.

## Verification (Gate D exit)

- Oracle: p5 wave-buffer / audio-oracle already captures analgestic2's UADE
  chip-RAM play buffers. Attribute voice 2's buffer as the perc/bio sample slice
  at the played period; assert native-rendered sampled voice matches (buffer or
  windowed-fidelity).
- Regression: analgestic2 voice 2 native output non-silent AND matches the
  companion PCM slice (fails-on-revert in test:ci).
- Witness metric: analgestic2 v2 oPeak 0.246 (currently native-silent) → native
  peak > 0 and voiceFidelity above threshold vs oracle.

## Open questions for the plan phase

- Does the sampled voice's period path need the same arp/`drin` table indexing
  as synth (EFFECTS line 450 `SUB.B (A3,D5.W),D1`)? GNN8 clears $0E (arp
  index/phase) but the sampled record's $0E-$0F are vib len/loop, not arp — the
  arp select `$000E(A0)` (voice) is a different field cleared by GNN8. Confirm
  the sampled voice uses arp=0 (no arp) so period = plain note→period.
- Loop semantics when loopLen==1: confirm one-shot (stop) vs 2-byte silent loop
  in the resampler — audible difference is nil but affects tail length.
