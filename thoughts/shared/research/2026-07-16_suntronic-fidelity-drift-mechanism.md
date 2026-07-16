---
date: 2026-07-16
topic: suntronic-fidelity-drift-mechanism
tags: [suntronic, gate-e, fidelity, paula, resampler, phase-drift]
status: final
---

# SunTronic Gate E — the whole-song fidelity drift is resampler period-update granularity, NOT the 0/0 control-timeline scheduler port

## Why this doc exists

Gate E (whole-song native fidelity lock + default engine-pref flip `uade`→`native`)
was framed as blocked on "the cycle-accurate Paula-DMA scheduler port". Corpus
fidelity measurement + a 3-way code/RE investigation shows that framing conflates
**two independent problems**. The one that actually gates the flip is smaller and
different from the deferred 0/0 port.

## Measurement that started this (probe-corpus-fidelity.ts)

Windowed best-lag correlation (native vs UADE per-voice oracle), maxLag 640,
6 s window, 8-song smoke:

- 0/8 flip-ready (minFid ≥ 0.90).
- Weakest active-voice fidelity dominated by phase, not timbre.

Decisive discriminator — escalate maxLag on analgestic2 (Gate-C byte-exact golden):

```
v0  maxLag[640 1500 3000 6000 12000] = 0.69  0.74  0.82  0.82  0.85
v2  maxLag[640 1500 3000 6000 12000] = 0.07  0.13  0.20  0.18  0.23
v3  maxLag[640 1500 3000 6000 12000] = 0.69  0.75  0.82  0.83  0.84
```

- **v0/v3 (synth voices): monotonic lift → phase drift, timbre correct.**
- **v2 (sampled voice): no recovery → genuine content mismatch (separate — see §5).**

## Three clocks — do not conflate them

| Clock | Rate | What it drives | Status |
|---|---|---|---|
| Golden/position latch ("bucket") | **exactly 1024 samples** (measured: gliders 661/661, ballblaser 330/330 inter-fire gaps = 1024) | note/position/instrument reads, per-bucket latched voice state | shipped byte-exact |
| EFFECTS/vibrato ("vblank") | **~880.57 samples** (~50 Hz; `VBLANK = 1024*25/29 = 882.759`) | `$20` period + `$24` vibrato advances *within* a bucket via the double-position clock | shipped, 1/632 residual on the discrete timeline |
| Paula audio resampler phase | continuous, `inc = PAULA_CLOCK_PAL / period / 44100` | per-voice waveform read pointer → the actual audio samples | **drifts — this doc** |

The 2026-07-15 CIA-jitter hypothesis was **falsified**: UADE's note-handler fires
on a constant 1024-sample grid, no sub-sample jitter
(`thoughts/shared/research/2026-07-15_uade-cia-scheduler.md` §9 CORRECTION,
`probe-fullsong-fires.ts`).

## The fidelity drift mechanism (root cause)

`SunTronicNativeRender.ts`:

- `deriveBucket()` (line 148) calls `player.tick()` **once per 1024-sample bucket**
  and sets `this.vInc[v] = PAULA_CLOCK_PAL / vd.period / NATIVE_SAMPLE_RATE`
  (line 177) from the **bucket-latched** period.
- `renderInto` (line 205) recomputes nothing about period between bucket
  boundaries. `vInc[v]` is held constant for all 1024 samples of the bucket.
- But UADE/Paula changes period on the **~880-sample vblank cadence** (the
  EFFECTS/vibrato clock), i.e. **mid-bucket**. The player already computes those
  sub-bucket vibrato advances internally (double-position clock), but `tick()`
  exposes only the final bucket-latched period.

Consequence: for any voice whose period moves under vibrato/`$20`, the native
resampler advances its read phase with a **stale period for up to ~142 samples per
bucket**, and the error accumulates as whole-song sample-phase drift. This exactly
predicts the observed pattern:

- **gliders** (static arp/period): no mid-bucket period change → no drift →
  byte-exact.
- **ballblaser / analgestic2 synth voices** (sweeping vibrato): mid-bucket period
  changes never applied until the next bucket → monotonic phase drift, recoverable
  only by widening maxLag.

This is the correct **level**: the mismatch is in the **resampler's period-update
granularity** (bucket vs vblank), not in the byte-exact player, not in the timbre
kernels (Gate C, byte-exact golden), and not maskable in the worklet.

## Why this is NOT the deferred 0/0 scheduler port

The authorized "cycle-accurate scheduler port" (handoff
`2026-07-15_suntronic-gate2-scheduler-port-authorized.md`) chases the last
**1/632 discrete-event residual** on the *control timeline* — the exact bucket at
which vibrato double-steps (gliders wants it at bucket 13, ballblaser at 12; one
deterministic constant can't satisfy both). Its audio-DMA hypothesis is about
*which interrupt drives the note clock*.

That work removes a single mis-timed cell in the discrete event stream. It does
**not** touch the resampler's period-update granularity, so it will **not** move
the fidelity numbers. The fidelity gate and the 0/0 gate are orthogonal:

- Fidelity flip gate → **resampler applies period on the vblank sub-grid** (this doc).
- 0/0 timeline gate → last 1/632 double-position constant (deferred, separate).

## Proposed fix abstraction (for the plan, not yet built)

Make the resampler update `vInc[v]` on the **vblank sub-grid** using the player's
**per-vblank** period, instead of once per 1024 bucket.

Dependency: `player.tick()` must expose the per-voice period **trajectory within a
bucket** (the sequence of period values at each vblank advance the double-position
clock already computes), e.g. return per voice an ordered list
`{ sampleOffsetInBucket, period }[]`. `renderInto` then re-derives `vInc[v]` when
`pos` crosses each sub-event offset (it already computes `vblankNow` at line 206).

Two sub-questions the plan must answer:
1. Does the double-position clock's internal vibrato advance already produce the
   exact per-vblank period UADE writes, or only the bucket-latched endpoint? (Read
   `SunTronicPlayer.ts` tick()/stepAll() lines 487–555.)
2. Sampled voices (type-B) also read at a period-driven rate — same fix applies to
   their `vInc`.

## Decisive experiment (run FIRST in the plan, before the real port)

Cheap validation that period-update granularity is the whole story:

1. In a **probe** (not production), render ballblaser/analgestic2 with `vInc`
   recomputed at every vblank from a **linearly-interpolated** period between
   consecutive bucket-latched periods (crude stand-in for the true per-vblank
   value).
2. Re-measure `voiceFidelity` at maxLag 640.
3. **Predicted:** ballblaser v0/v3 and analgestic2 v0/v3 jump substantially at
   maxLag 640 (drift shrinks below the window). If they do, the mechanism is
   confirmed and the real fix (exact per-vblank period) does at least as well.
   If they don't, phase drift has another source and the plan reassesses.

## Sampled-voice mismatch (v2) — separate residual (§5)

analgestic2 v2 (sampled slot) does **not** recover with maxLag (0.07→0.23). That is
content, not phase. Candidates: native sampled resampler wrong, or the oracle's
per-voice isolation for that channel (memory: "oracle muddled"). The UADE-oracle
investigation found the per-channel capture is clean at the WASM boundary
(`_uade_wasm_read_channel_samples` samples each Paula channel independently), so the
mismatch is more likely native-side sampled render. Track as Gate-D whole-song lock,
**after** the synth-voice phase clock is trustworthy (can't judge a sampled voice's
phase while the reference synth voices are drifting).

## Key constants (verbatim, for the plan)

- `PAULA_CLOCK_PAL = 3546895` (SunTronicVoiceRenderer.ts:40)
- `NATIVE_SAMPLE_RATE = 44100`, `BUCKET = 1024`, `VBLANK = 1024*25/29 = 882.759`
- resampler inc: `PAULA_CLOCK_PAL / period / 44100` (SunTronicNativeRender.ts:177)
- UADE Paula phaseInc reference: `PAL_CLOCK / (2 * period * sampleRate)`
- double-position ratio `di = 882.759/(1024-882.759) = 6.25`; doubles at
  `round(k*6.25)` buckets
- per-song vblank phase φ_v: gliders 355, ballblaser 881 samples (init-cycle state,
  not yet score-derivable — only matters for the 0/0 timeline gate, not fidelity)

## Artifacts

- `tools/suntronic-re/probe-corpus-fidelity.ts` — corpus fidelity buckets (new, uncommitted).
- `tools/suntronic-re/native-mix.ts` — `voiceFidelity` windowed best-lag metric.
- `tools/suntronic-re/audio-oracle.ts` — `renderUADEPerVoice` (ground truth).
- `src/engine/suntronic/SunTronicNativeRender.ts` — the resampler to fix.
- `src/engine/suntronic/SunTronicPlayer.ts` — double-position clock (must expose sub-bucket period).

## Next step

Run the decisive experiment (interpolated per-vblank period probe). If confirmed,
write the plan: expose per-vblank period from the player → resampler applies it on
the vblank sub-grid → re-measure corpus fidelity → set flip threshold + regression.

---

## UPDATE 2026-07-16 — decisive experiment RUN (probe-fidelity-ceiling.ts)

The committed vblank single-clock fix (`stepVblank`) was measured INERT on corpus
fidelity, so before building the port we ran the ceiling discriminator: escalate
maxLag and watch whether synth-voice fidelity climbs toward 1.0 (phase) or
plateaus <0.90 (timbre). Result (8 s window):

```
ballblaser  v0  maxLag[640 1500 3000 6000 12000 24000 48000] = 0.49 0.49 0.60 0.67 0.76 0.82 0.80
ballblaser  v3  = 0.43 0.48 0.57 0.71 0.75 0.83 0.85   (still climbing at 48000)
analgestic2 v0  = 0.60 0.71 0.79 0.85 0.87 0.88 0.93   PHASE — recoverable to flip threshold
analgestic2 v3  = 0.60 0.73 0.80 0.85 0.88 0.88 0.93   PHASE — recoverable
analgestic2 v1  = breaks down (dead/near-silent voice — separate)
analgestic2 v2  = 0.06→0.26  (sampled slot — Gate-D content, separate)
```

**Verdict: synth voices are PURE PHASE DRIFT, NOT timbre-capped.** analgestic2
v0/v3 reach 0.93 once ~48000 samples (~1.1 s) of lag are allowed — the timbre is
correct, the resampler read-pointer accumulates ~1 s of phase over 8 s.

### Two facts that pin the mechanism

1. **The period trajectory EXISTS and is byte-exact at bucket granularity.**
   `SunTronicPlayer.stepAll()` (line 487) rewrites `v.period` in `stepEffects`
   ($24 vibrato) on every step; `tick()` runs 1–2 `stepAll` per 1024 bucket
   (double-position clock). The ballblaser golden timeline is 1/316 → the
   *discrete per-bucket* period sequence matches UADE. So the drift is NOT wrong
   period values and NOT wrong stepAll rate (bucket path and vblank path have the
   same 1.16 stepAll/bucket average — that is exactly why `stepVblank` was inert).

2. **The drift is sub-bucket resampler PHASE.** Both native and UADE update
   period only at discrete steps, but the native resampler applies the
   bucket-latched (or vblank-latched) period as a flat `vInc` across the whole
   interval and starts its vblank grid at `pos=0`, whereas UADE's Paula begins its
   vibrato phase at the per-song offset φ_v (gliders 355, ballblaser 881 samples)
   and advances period on the true CIA sub-grid. A constant φ_v offset alone would
   be killed by best-lag; the *accumulation* to ~1 s means the sub-bucket period
   application points drift out of step with UADE's over the song.

### Why `stepVblank` (committed) is right-rate but wrong-granularity

It advances the player once per 882.759-sample vblank and latches ONE period per
step — same average rate as the old bucket path, so ~inert. The real fix must
apply, within each render step, the period that is current at each UADE vblank
boundary **at the correct sample offset (φ_v-phased)**, not one flat latched value.

### Port is CONFIRMED worth building (user authorized full port 2026-07-16)

Target: analgestic2 already reaches 0.93 with phase compensation → the phase port
can cross the 0.90 flip threshold for synth voices. ballblaser needs the most
(still climbing at 48000) → it is the hardest synth-voice case and the port's
gate. Sampled voices (v2) + dead voices (v1) are tracked SEPARATELY (Gate-D
content), after the synth phase clock is trustworthy.

Plan: `thoughts/shared/plans/2026-07-16-suntronic-resampler-phase-port.md`.

---

## UPDATE 2026-07-16 (later) — ok-2-class pulse songs are a SECOND, distinct gap; the CALC3 kernel is CONFIRMED byte-correct by disasm

The phase-drift conclusion above was measured on analgestic2/ballblaser (vibrato
synth voices). Testing **ok-2** — 4×type-1 always-latched pulse instruments —
exposes a *different* failure that phase-recovery does NOT explain:

```
probe-fidelity-ceiling.ts ok-2 (8s) — voiceFidelity vs maxLag[640..48000]:
  v0 -0.13 … -0.07   v1 -0.12 … -0.03   v2 0.01 … 0.28   v3 -0.16 … -0.00
  ALL flat/negative at maxLag 48000 → NOT phase drift (which recovers, cf analgestic2→0.93).
```

### What was ruled OUT (do not re-chase)

- **The CALC3 pulse kernel is NOT wrong.** Dumped the loaded replayer bytes at
  `0x26c80–0x26dc0` (UADE `_uade_wasm_read_memory` after 4 render chunks) and
  hand-disassembled the positive-arp pulse loop `0x26cc8–0x26ce4`:
  `D1=0x80-arp` (coeff); `D0=ext.w(source[last])` (seed); loop
  `D2=ext.w(*A3++); D2-=D0; D2=MULS.W D1,D2; ASR.W #7,D2; D0+=D2; *A2++=D0.b`.
  This is **byte-identical** to `SunTronicSynthVoice.ts renderType1` CALC3
  (`asrW7` word-truncates before the shift, matching `MULS.W`+`ASR.W`). Kernel
  confirmed. The `0x80-d1` coefficient is correct (NOT the `~66` I mis-measured
  from misaligned chunk snapshots).
- **Chunk-granularity per-tick probes are INVALID for the pulse.** A probe that
  pairs consecutive 882-sample render-chunk `loc` snapshots as prev→cur feedback
  (`_p7t1`, deleted) matches ~0 ticks — but that is a **capture artifact**, not a
  kernel bug: the pulse fires on the **1024 bucket** clock (not the 882 chunk),
  and the feedback source is not index-aligned to the previous `loc` (see next).

### The actual ok-2 mechanism (candidate root cause, not yet fixed)

Disasm of the pulse **setup** `0x26c8e–0x26ca8` shows the feedback source pointer
is **not** the previous output buffer read index-aligned. It is:

```
A3 = A2                       ; MOVEA.L A2,A3
ph = $a70(A6)                 ; per-voice phase/pitch accumulator
A3 = A3 - ph                  ; SUBA.L D1,A3
t  = ph - 0x80                ; SUBI.L #$80,D1 ; BPL
if t < 0: t = 0x100           ; MOVE.L #$100,D1
A3 = A3 + t                   ; ADDA.L D1,A3
  => ph>=0x80: A3 = A2 - 0x80
     ph< 0x80: A3 = A2 + (0x100 - ph)
```

So the latched pulse reads its feedback source from a buffer **offset from the
output by a pitch-dependent ±0x80/0x100 amount** (a rotating buffer pool in the
A6 workspace), and `renderType1` currently feeds `state.playBuffer` (the plain
immediately-previous output) with no such offset. That unmodeled source-pointer
selection is the likely ok-2 content gap.

### Status / next (needs its own research+plan, NOT a one-turn fix)

- ok-2-class (always-latched pulse) fidelity is a **separate gate** from the
  vibrato phase-drift port. Both are real; both need the multi-session RE cycle.
- To fix ok-2 correctly: PC-trigger capture at the pulse loop (e.g. `0x26cca`
  post-dispatch, both latched+unlatched paths — p8c's `0x26cc0` arm only catches
  the unlatched path, hence its `0/0` on ok-2), read A2 **and** A3 buffers +
  `$a70(A6)`, confirm `calc3(bufAt(A3)) == bufAt(A2)` byte-exact, then model the
  A6 buffer-pool source select in `renderType1`/the voice state.
- Independent, already-landed win this session: the Paula voice **gain 4×
  over-scale** bug (`paulaVoiceSample = byte*vol/32768`, was `/8192`), committed
  `c8c0efb4f` with fails-on-revert regression — that clipped every voice mix and
  is orthogonal to both fidelity gates.
