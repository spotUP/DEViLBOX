---
date: 2026-07-16
topic: suntronic-phase4-gateB-offline-native-mix
tags: [suntronic, phase4, native-playback, uade-oracle, fidelity]
status: final
---

# SunTronic Phase 4 — Gate B.1: offline native mix + fidelity report

## Task

Phase 4 = full native SunTronic playback (no UADE at runtime; UADE = offline
oracle only). Gate A (UADE per-voice oracle) done previously. This session:
Gate B, reordered to build the OFFLINE native mix FIRST (measurable against the
oracle) before any worklet/engine plumbing — measure before wrapping code around
possibly-wrong audio.

## Done this session

- **Shipped code (additive, both byte-exact regressions still pass):**
  `SunTronicPlayer.tick()` voice entries now also carry `outVolume` ($15
  post-envelope Paula gain — the golden compares $0c, not this) and `instrOff`
  (active synth record offset, -1 = none/inert/sampled). `src/engine/suntronic/
  SunTronicPlayer.ts` interface `SunPlayerTick` + the `tick()` return map.
- **`tools/suntronic-re/native-mix.ts`** (new, offline deliverable): drives the
  byte-exact player timeline → `renderSynthTick` timbre → Paula wavetable
  resampler, one mono buffer per voice, mixes 0+3→L / 1+2→R. Exposes
  `renderSunTronicNative(name)` + `voiceFidelity()` (median best-lag windowed
  correlation) + per-voice `VoiceInfo` diagnostics. CLI prints the fidelity
  report and dumps per-voice WAVs.

## Measured findings (the point of Gate B.1)

| song | voice | synthType | fidelity | note |
|------|-------|-----------|----------|------|
| gliders | v1/v2/v3 | 2 | **0.79–0.85** | type-2 exact port VALIDATED vs real audio |
| gliders | v0 | 6 (lead) | — | **SILENT**: wave1Off out of range |
| ballblaser | v0/v3 | 2 | **0.47** | same type, lower — 2nd-order gap |
| ballblaser | v1/v2 | — | idle 5% | oracle also silent, fine |

1. **Plumbing works end-to-end offline** and is measurable per-voice vs Gate A.
2. **Type-2 timbre is essentially correct** (0.79–0.85). First real-audio
   confirmation of the SunTronicSynthVoice type-0/2 "exact" claim.
3. **Top Gate C blocker — t6 wave-data resolution.** gliders lead off5490 (t6):
   `wave1Off=0x3a98`=15000 points PAST every loaded hunk (only 2 hunks: code
   436B + data 8776B, no 3rd). `w2Off=0xff00ff20`, `arpLen=1066` — these t6
   records use a different field layout/source than the in-h1 t6 records
   (off5670/5814/5850/5958 have valid 128-byte wave1). UADE renders off5490 as
   the LOUDEST voice, so the data exists somewhere the parser isn't slicing.
4. **Metric lesson:** whole-song GLOBAL correlation is meaningless — native and
   UADE Paula drift ~340–390 samples in absolute phase over ~2.5s even when the
   per-frame waveform is byte-correct (short-window corr was 0.76–0.95 while the
   global was 0.30). `voiceFidelity()` windowed best-lag is the right metric;
   locked into Gate E.

## Critical references

- Plan (updated Gate B/C/E): `thoughts/shared/plans/2026-07-16-suntronic-phase4-native-playback.md`
- Oracle (Gate A): `tools/suntronic-re/audio-oracle.ts` — `renderUADEPerVoice`
- Offline mix (Gate B.1): `tools/suntronic-re/native-mix.ts`
- Timbre gen: `src/engine/suntronic/SunTronicSynthVoice.ts` (renderSynthTick;
  type 6 = default/renderSmooth CALC14 kernel)
- Player: `src/engine/suntronic/SunTronicPlayer.ts` (tick output +215-460)
- Score/instrument decode: `src/lib/import/formats/SunTronicV13.ts`
  (decodeSunSynthInstrument 549; wave1Off = record+0x1a; synthType = record+0x23)

## Known approximation carried forward

native-mix regenerates the timbre buffer ONCE per 1024 bucket; the replayer
regenerates per player-step (twice on a double-position bucket → arp advances
twice). Second-order for arpLen≤1 (gliders off6066 arpLen=1) but must be fixed
for arp-driven timbres (probably part of the ballblaser 0.47 gap).

## State / constraints

- Only shipped change = the additive tick fields. Type-check clean; both
  byte-exact timeline regressions pass. NOT committed (Phase 4 not authorized for
  commit; disclose + await go-ahead).
- public/uade untouched (oracle is read-only via uadeRenderCore); sha1
  cc3a153/520744b intact.
- No baked schedules/tables.

## Gate C.0 — RESOLVED (2026-07-16): type-6 wave is GENERATED, not stored

The loaded eagleplayer (NOT DP_Suntronic.s — that reference is wrong for the
runtime player) dispatches MEGAEFFECTS via a **jump table @0x26c5c indexed by
synthType*2** (a6=0x264dc; handler = a6 + signed word). Common entry @0x26be4:
`d6 = wwl*2-1` (buffer len-1), `A4 = record+0x12` (arp table), `d0 =
arpTable[$12(a0)]` (the coefficient), output buffer `a2 = voice+0x3a +
[a6+0xa70]`. Each synthType has a DISTINCT handler — the earlier "types≥4 all
CALC13/14" assumption was wrong:

| type | handler | behaviour |
|------|---------|-----------|
| 0 | 0x26c6a | CALC1 linear morph (interp wave1→wave2 by d0/128) |
| 1 | 0x26c8a | pulse / PRNG-noise (d0=-1 → mid-square >>4 ^0xac91) |
| 2 | 0x26d72 | splice: `A3=rec+0x1a`, `A4=rec+0x1e`, copy d0 from A3 then rest A4 |
| 3 | 0x26d96 | resample: `A3=rec+0x1a`, 0x8000/(d0+k) rate |
| 4 | 0x26df4 | (integrator variant — the existing `renderSmooth` calc14) |
| 5 | 0x26f2e | **stored wave**: `A2=rec+0x1a` deref (pointer!) + d0 offset |
| 6 | 0x26e6c | **generated damped resonator** (below) |

**Type-6 handler @0x26e6c — damped harmonic oscillator, NO stored samples.**
`record+0x1a` for type 6 is a **signed-16 sweep delta**, not a pointer (hence
un-reloc'd, reads zeros — the old "wave1Off=0x3a98=15000 past hunk" was actually
`p1c=15000`, a sweep delta). Fields: `+0x1a` s16 sweep delta A, `+0x1c` s16
sweep delta B, `+0x1e` u8 damping amp, `+0x1f` u8 counter target, `+0x20` u8
sweep scale, `+0x22` u8 wwl, `+0x23` u8 type. Kernel (byte-exact transcription):

```
per generation (byteLen = wwl*2):
  cnt=$2a; if cnt>=0 { cnt++; if cnt>=rec[0x1f] cnt=-1 }
  delta = cnt>=0 ? s16(rec[0x1a]) : s16(rec[0x1c])
  phase = (phase + delta) & 0xffff                 ; $28
  sw = ((abs(phase)*rec[0x20])>>8) & 0xffff
  d2hi = (sw * byteLen) >> 16                       ; mulu.w uses low16
  seg2 = (byteLen>>1) + d2hi - 1  ;  seg1 = (byteLen-1) - seg2 - 1
  d1f=arp+0x20 ; spring = 0xfffe0/d1f - arp*0x26            ; d2
  damp = ((0x7fff - spring)*rec[0x1e]) >> 8                 ; d3
  y=0xf00; v=0
  seg1+1 samples: v=(damp*v)>>15; v+=(spring*(0xf100-y))>>15; y+=v; out=(y>>7)&0xff
  seg2+1 samples: same but target 0xf00
```
`(x)>>15` = `swap ; rol.l #1` idiom (low word of 32-bit product rotated).

**Validation** (`tools/suntronic-re/probe-t6-brute.ts`, gliders lead voice-0):
brute-forcing the generation phase per captured buffer + reading `$a70(a6)` to
pick the just-written double-buffer half, the kernel reproduces the live chip-RAM
play buffer **byte-exact: 16/16 fully-written buffers = 128/128 bytes**. The
seg-length formula (seg1+seg2=128 always) is CORRECT — the earlier "35 bytes"
reading was a double-buffer/sub-tick artifact (I was reading the wrong half /
mid-DMA-fill; `$a70` toggles 0/0x80 and MEGAEFFECTS runs less often than a
128-sample render chunk). The disasm confirms both dbra loops total byteLen.

**Gate C — DONE (2026-07-16).** `case 6` added to `SunTronicSynthVoice.ts`
(`renderType6`, exported), with persistent `resonPhase`/`resonCnt` voice state
(voice+0x28/0x2a). Regression `sunTronicSynthVoice.test.ts` "type 6 resonator"
pins the 128-byte golden (in test:ci glob, fails on revert). Native mix: gliders
lead voice-0 went **SILENT → active=100%, nPeak=0.750, fidelity=0.530**. The
remaining 0.53 gap is NOT the kernel — it's the native-mix per-bucket regen
approximation (type-6 sweeps its buffer EVERY tick, but native-mix regenerates
once per 1024 bucket) + note-on phase alignment + voice gain; those are Gate
B.2/E integration items, not timbre math.

**Arp latch note (for the timeline port):** the generator uses the arp value
latched at note/tick start; the probe read arpIdx post-advance and saw an
off-by-one (read 126, generation used 127). `renderSynthTick` already reads
`arpTable[arpIndex]` BEFORE advancing, so the existing ordering is correct.

## Gate C — type-5 DONE (2026-07-16, follow-up session)

**type-5 was BROKEN** — it fell through to the `default`/`renderSmooth`
integrator instead of playing its stored sample. Disassembled handler
`@0x26f2e` (loaded eagleplayer, A6=0x264dc):

```
movea.l $1a(a1),a2      ; a2 = *(record+0x1a) — deref pointer to sample
lsl.w #1,d0 ; ext.l d0  ; d0 = 2*arp
adda.l  d0,a2           ; a2 += 2*arp  (arp scans the sample as a BYTE offset)
move.l  a2,$16(a0)      ; play ptr = a2 (points INTO the sample — NO regen)
move.b  $22(a1),d1 ; move.w d1,$1e(a0)   ; length = record+0x22 words
```

So **type-5: `out[i] = sample[2*arp + i]`**, sample = `deref(rec+0x1a)`. Unlike
type-6 (where rec+0x1a is an s16 sweep delta), here it IS a pointer to a longer
scannable PCM buffer.

**Impl (additive, wave1 untouched → round-trip preserved):** added
`sampleData: Int8Array` + `sampleZero: number` to `SunSynthInstrument`
(`SunTronicV13.ts`) — the h1 window around `wave1Off` sized to cover the global
arp range `[-2,127]` with a pre-window guard; `sampleZero` maps arp=0 to its byte
index. `SunTronicConfig` got optional `sampleData?/sampleZero?`; the metadata
mirror in `SunTronicPlayer.decodeSynthAt` and 4 test inst-builders got the fields.
Then `case 5` in `SunTronicSynthVoice.ts`:
```
const base = inst.sampleZero + 2 * d1;   // d1 = latched arp
for (let i = 0; i < byteLen; i++) { const k = base + i;
  out[i] = k >= 0 && k < src.length ? ((src[k] << 24) >> 24) : 0; }
```

**Verified 3 ways:** (1) disasm (unambiguous); (2) file-side set-membership —
`tools/suntronic-re/verify-t5-all.ts` sweeps 85 corpus songs, captures the live
UADE chip-RAM play buffers, checks every type-5 record's `h1[wave1Off+2*arp]`
window against the captured set: **189/228 windows byte-exact, 0 contradictions**;
(3) the p5 wave-buffer oracle now attributes type-5 matches (`5:6`). Regression
"type 5 stored sample" in `sunTronicSynthVoice.test.ts` (analgestic2 rec 0x15c0,
arp=3 window golden `7f…818181818181`, in test:ci glob, fails on revert → default
renderSmooth integrator differs).

**Fidelity note:** type-5 is NOT a dominant voice in gliders/ballblaser/analgestic2
first-10s (those 4-voice mixes are type-6/type-2/Gate-D-sampled), so the
`native-mix.ts` per-voice numbers are unchanged — type-5 correctness is proven at
the buffer level, not in the dominant-mix fidelity report. All 22 SunTronic engine
tests pass; type-check clean. NOT committed.

Throwaway probes cleaned up; `verify-t5-all.ts` + `probe-t6-brute.ts` kept as
kernel evidence.

## ballblaser type-2 0.47 gap — DIAGNOSED (2026-07-16, follow-up session)

**Not a timbre bug — accumulated phase drift.** Two changes + a decisive
measurement chain:

1. **native-mix now regenerates on the VBLANK grid, not the 1024-bucket.**
   `native-mix.ts` render loop restructured sample-outer with a free-running
   882.759-sample vblank clock (`VBLANK = 1024*25/29`); each vblank rewrites every
   active voice's play buffer (`renderSynthTick`, advancing arp), Paula keeps
   streaming the last buffer between frames. This is the physically correct model
   (MEGAEFFECTS runs once per ~50 Hz frame) and supersedes the frozen-timbre
   once-per-bucket approximation. Effect: gliders type-6 v0 0.530→0.568; byte-exact
   STATIC-arp type-2 (gliders arp=[0]) unchanged; ballblaser swept type-2 ~flat.

2. **Root-cause probe.** Dominant type-2 arp tables: gliders off6066 `arpLen=1
   arp=[0]` (STATIC splice → frozen wave), ballblaser off5458 `arpLen=62
   arp=[32,33,34,…]` (splice point D1=arp SWEEPS every frame). Per-window fidelity
   oscillates 0.12-0.87 with recurring highs (0.87) → the timbre math is RIGHT when
   aligned. Waveform dump at a low window railed the best-lag at ±640 → alignment
   lag exceeds the search window. maxLag sweep is decisive: 640→1500→3000→6000
   lifts EVERY voice monotonically — ballblaser t2 v0 0.50→0.70, v3 0.44→0.73;
   gliders t2 →0.95-0.99, t6 →0.82. The gap is accumulated PHASE DRIFT past the
   640-sample window, not a spectral difference.

3. **Why ballblaser drifts and gliders doesn't:** gliders type-2 has a static
   splice (phase tracks tight, <640 drift); ballblaser sweeps the splice, so each
   frame's content-shift interacts with the continuous Paula read pointer slightly
   differently in native vs UADE. Bit-exact tracking of that needs a cycle-accurate
   Paula-DMA / buffer-swap model — the same deferred Gate-2 scheduler port.

**Did NOT widen the metric's maxLag to inflate the number** — that would mask the
real Paula-DMA mismatch (a "tolerate" band-aid). The honest result: timbre kernels
byte-exact; whole-song swept-type-2 phase-lock is Gate E (scheduler port). All 39
SunTronic engine tests green; type-check clean. NOT committed. Throwaway probes
removed; `native-mix.ts` change kept.

## Next steps (ordered)

1. **Gate C — COMPLETE.** All timbre types verified: 0/2 byte-exact unit tests,
   1 noise-oracle, 3 ox.src byte-exact golden (renderType3 @0x26d96 CALC10-12,
   p5 oracle ox.src 3:2 / final-mega.src 3:3, 0 contradictions; regression forces
   arpTable=[61] → d1=61, mutation-tested fails-on-revert), 4 smooth-oracle,
   5 analgestic2 golden, 6 gliders golden. ballblaser type-2 0.47 gap diagnosed as
   phase-drift (Gate E, not timbre). 40 SunTronic engine tests green.
3. Gate D — sampled instruments (instrOff=-1 voices; companion .x/.instr/.ss).
4. Gate B.2 — worklet/engine/registry plumbing (once timbres are audible).
5. Gate E — whole-song fidelity lock (voiceFidelity threshold) + default flip.
