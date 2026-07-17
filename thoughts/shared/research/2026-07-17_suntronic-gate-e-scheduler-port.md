---
date: 2026-07-17
topic: suntronic-gate-e-cycle-accurate-paula-dma-scheduler-port
tags: [suntronic, native-playback, paula, dma, scheduler, gate-e, phase-drift, oracle]
status: final
verdict: port NOT warranted — Phase-0 probe negative + prior ear A/B rejected
---

## PHASE-0 VERDICT (2026-07-17) — PORT NOT WARRANTED

Ran `probe-resampler-phase.ts` (SONG=ready→ballblaser+analgestic2, maxLag 640).
The buffer-swap-latch + φ-alignment mechanism this doc proposed as the port's
core is **dead**: not only does it fail the ≥0.90 gate, the SHIPPED flat/bucket
model **beats every variant**.

| song | voice | SHIPPED | best φ/latch variant |
|------|-------|---------|----------------------|
| ballblaser | v0 | **0.65** | 0.52 (φ=352) |
| ballblaser | v3 | **0.57** | 0.46 (φ=352 imm) |
| analgestic2 | v0 | 0.62 | 0.64 (φ=640) |
| analgestic2 | v1 | 0.24 | 0.22 |
| analgestic2 | v3 | 0.60 | 0.66 (φ=640) |

Max across all variants ~0.66 — nowhere near 0.90. Per this doc's own Phase-0
gate ("if it doesn't lift, the model is still wrong"), the cycle-accurate-latch
abstraction does NOT close the gap. A full per-cycle scheduler is unproven to do
better and would be a multi-session Gate on a metric already judged **inaudible
by ear** (`project_suntronic_native_meter_blindspot`: 2026-07-17 ear A/B
native≈UADE → port rejected).

**Decision: Gate-E CLOSED. Do not port.** The native default ships as-is. If ever
revisited, the timbre-vs-timing split itself needs re-examination first — the
latch model is refuted, not just untuned. The research below stands as the record
of what was investigated and why the port was declined.

---


# SunTronic Gate-E: cycle-accurate Paula-DMA scheduler port — research

Documentary research for the ONLY remaining SunTronic native-playback gap:
sub-frame phase drift on swept-timbre voices. Phase 1 (research) only — no code.
Decision + plan phase gated on user go-ahead.

## Problem statement (invariant violated)

The native renderer replays the module on **two quantized clocks** and a
**point-sampler with per-frame phase reset**. UADE (the oracle) replays on a
**cycle-accurate per-DMA-word clock** carrying **fractional output timing**. On
voices whose timbre sweeps every frame (type-2 splice whose D1=arp slides,
type-6 resonator sweep), the native voice accumulates a sub-frame offset vs the
oracle. The **timbre kernel math is proven byte-exact** (`sunTronicSynthVoice.test.ts`,
per-buffer 128/128) — the gap is purely *which swept buffer plays at which output
sample*, i.e. **scheduling, not spectrum**.

Diagnostic that proves this (not a guess): `ready-lagsweep.ts` sweeps the xcorr
`maxLag` over {640..20000}; fidelity climbs **monotonically** (v2 0.583→0.959,
v3 0.587→0.966) — the content matches at wide lag, only the *timing* slides.
A real timbre bug would stay low at all lags.

## Current native architecture (what IS)

### Two clocks — SunTronicNativeRender.ts / SunTronicPlayer.ts
- **BUCKET = 1024 samples** (`SunTronicNativeRender.ts:52`). Notes/period latch
  here: `if (this.pos % BUCKET === 0) deriveBucket()` (`:279`), which calls
  `player.tick()` (`:213`) and recomputes per-voice `vInc`/`vGain`/`vActive`.
- **VBLANK = (1024*25)/29 = 882.759 samples** (`:103`). Synth timbre buffer
  regen (`renderSynthTick`) fires here: `vblankNow = pos >= nextVblank;
  nextVblank += VBLANK` (`:280-281`, regen at `:320-321`). Matches MEGAEFFECTS
  rewriting each voice's play buffer once per ~50 Hz PAL frame.
- Design forbids collapsing them (`:155-160`).

### Double-position clock — SunTronicPlayer.ts:546-565
`tick()` fires one base `stepAll()` per bucket + one EXTRA `stepAll()` at bucket
`round(doubleK * di)` where `di = ciaTick/(audioTick − ciaTick) = 882.759/141.241
= 6.25` (`:557`). Approximates the async second interrupt (note fetch) that runs
on a *different* clock than EFFECTS. No hardcoded table — the double buckets fall
out of the one fire-period constant. Landed note-timeline byte-exact:
gliders 0/316, ballblaser 1/316 (`sunTronicGlidersTimeline.test.ts`,
`sunTronicBallblaserTimeline.test.ts`). Commit `c86b6fff5` (read-order fix on top).

### Resampler phase — SunTronicNativeRender.ts
- `vInc[v] = PAULA_CLOCK_PAL / period / NATIVE_SAMPLE_RATE` = `3546895 / period /
  44100` (`:249`), computed **once per bucket**.
- Synth phase advance + wrap (`:329-331`):
  `phase += vInc; if (phase >= byteLen) phase -= byteLen * Math.floor(phase/byteLen)`.
- Phase **reset to 0 on note-on/retrig** (`:243`).

### Three drift sources identified in the current code
1. **Per-frame phase reset** — resampler phase is not carried across the buffer
   swap the way Paula continues its DMA pointer; the swept buffer restarts phase
   accounting each regen.
2. **Period applied at 1024-bucket granularity** — a note/period change that the
   real CIA applies mid-bucket is deferred to the next bucket boundary, so up to
   ~1023 samples of the swept voice play at the stale rate.
3. **VBLANK = 882.759 is irrational in binary float** — `nextVblank += VBLANK`
   accumulates FP error over a song (small, but nonzero and monotone).

## Prior art — Gate-2 double-position clock (the closest port)

- Commit `c86b6fff5` + the two-clock discovery
  (`thoughts/shared/handoffs/2026-07-14_suntronic-two-clock-discovery.md`).
- **Key fact for Gate-E**: the SunTronic player interrupt is **CIA-A Timer A
  underflow** (`uade_wasm_on_cia_a_tick`, `cia.c:156`), NOT vblank. CIA clock =
  PAL E-clock 709.379 kHz = `SOUNDTICKS_PAL 3546895 / 5`. EFFECTS/vibrato runs
  50 Hz vblank; note fetch runs the module-tempo CIA-B timer (~43 Hz, genuinely
  async, ratio ≈ 1.16). The double-position clock approximates that async pair.
- **Measured fidelity ladder** (byte-exact note-timeline metric):
  single-clock gliders 101/316 → two-clock CIA accum 3/316 → double-position
  0/316; ballblaser 139 → 11 → 1.
- **Explicitly deferred to Gate-E**: cycle-accurate phase/rate drift on swept
  voices. Three cheap fixes measured-dead: φ-alignment (±0.05), Paula-DMA
  wrap-latch alone (±0.01), DC/metric artifact (no lift). Every constant-rate
  accumulator floors at 14/632; even a cheating joint-greedy 4-voice oracle
  floors at 11 — the residual is genuine UADE CIA-interrupt jitter, not a
  TS-side tunable.
- Prior planning docs to fold in:
  `thoughts/shared/research/2026-07-15_uade-cia-scheduler.md` (C-source anatomy),
  `thoughts/shared/plans/2026-07-16-suntronic-resampler-phase-port.md`
  (Gate-E phase-port plan + Phase-2a verdict: DMA scheduler is the survivor).

## UADE reference model (the target to match)

UADE = shipped `public/uade/UADE.js` + `.wasm`, loaded by the oracle tooling
(`tools/uade-audit/uadeRenderCore.ts:22-122`; per-file fresh instance).
Per-voice separation is **buffer-based** (`uade_ch_buf`, all 4 channels captured
every render), NOT mute-based (`audio.c:42-43`).

The cycle-accurate machinery to port (WinUAE-derived):
- **hsync-driven DMA word fetch** — `custom.c:1291-1304`: the voice sample
  pointer advances one word per DMA slot on the horizontal-sync grid.
- **per-driven byte emission** — `audio.c:423-510`: AUDxPER (period `$20`)
  drives byte-by-byte emission from the fetched word.
- **fractional output timing carried in `next_sample_evtime`** —
  `audio.c:686-688`: sub-sample fractional evtime is preserved across output
  samples, so voices never accumulate phase offset.
- Paula period → rate: PAL clock 3546895 Hz / period = voice sample rate (same
  `PAULA_CLOCK_PAL` the native `vInc` already uses).

### Oracle probes already built (decisive for the plan)
- **`tools/suntronic-re/ready-lagsweep.ts:15-19`** — maxLag sweep; monotone climb
  = phase drift (warrants the port). Already run; confirms drift.
- **`probe-resampler-phase.ts:66-149`** — the Gate-E discriminator. Drives the
  byte-exact player on the raw 882.759 grid (`player.stepVblankOnce()`), sweeps
  initial vblank φ ∈ {0,352,640} × {immediate, WRAP-LATCH}, reports
  `voiceFidelity(maxLag:640)`. Tests whether a Paula-DMA buffer-swap-at-loop-
  boundary latch lifts the hard voices to ≥0.90.
- **`p5-wavebuffer-oracle.ts`** — Paula write-log ring
  (`_uade_wasm_enable_paula_log`/`get_paula_log`, 512 entries, `entry.c:912-923`)
  → reconstructs AUDxLC:LEN, reads the real chip-RAM wave buffer = timbre ground
  truth.
- **`p9a-period-oracle.ts`** — `_uade_wasm_arm_capture_pc` (`entry.c:1236`) locks
  onto voice[0] at the EFFECTS PC, reads Paula `$20`/`$08`/`$0C`/`$14` per
  882-frame tick = the sub-bucket period timeline the scheduler needs.
- Tools need `TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/<x>.ts`;
  env `SONG=ready SECS=14`.

## Abstraction analysis — which level the fix lives at

| Level | Candidate | Verdict |
|-------|-----------|---------|
| Data format | change buffer layout | N/A — kernel byte-exact |
| Presentation | resampler filter (sinc vs point) | Not the root — point-sample matches at wide lag |
| Parameter | φ-align / wrap-latch tuning | **Measured dead** (±0.05 / ±0.01) |
| **Algorithm (scheduler)** | **per-DMA-word clock + fractional evtime carry + period applied at sub-bucket CIA offsets + buffer-swap-at-loop-boundary latch** | **ROOT** |

Red-flag check: no "damp/mask/clamp" here — the survivor is a genuine
abstraction upgrade (quantized dual clock → cycle-accurate single evtime
timeline), matching UADE's actual model. The current point-sampler with
per-frame phase reset and two quantized clocks is the abstraction mismatch that
produces the drift.

## Open questions for the plan phase

1. **Clock unit**: port to per-DMA-word (hsync grid) or per-E-clock-cycle? UADE
   uses evtime; the native side is sample-driven. Cheapest faithful unit likely
   = advance a fractional `evtime` accumulator per output sample, fetch/swap the
   voice buffer when evtime crosses the DMA-word boundary (no phase reset).
2. **Where period lands mid-bucket**: does `player.tick()` need to expose the
   exact sub-bucket CIA offset of each period write (via `p9a-period-oracle`
   timeline), or can the double-position schedule already place it?
3. **Buffer-swap latch**: `probe-resampler-phase.ts` must first confirm the
   wrap-latch (swap deferred to loop boundary) actually lifts v2/v3 ≥0.90 BEFORE
   committing the port — Phase 0 gate. If it doesn't, the model is still wrong.
4. **Whole-song lock metric**: define the Gate-E success bar (e.g. all voices
   `voiceFidelity(maxLag:640) ≥ 0.90` on ready + ballblaser + analgestic2) and
   wire a fails-on-revert golden.
5. **Scope**: single or multi-session? Prior art says its own Gate. Estimate
   after the Phase-0 probe verdict.

## Recommendation

Do NOT jump to the port. **Phase 0 = run `probe-resampler-phase.ts` and confirm
the buffer-swap-at-loop-boundary latch (no phase reset, fractional evtime carry)
lifts the swept voices to ≥0.90 on a single voice first.** That one measurement
decides whether the cycle-accurate scheduler is the right abstraction before any
scheduler code is written — cheapest discriminator, matches the "measure before
coding" protocol. If it lifts, write the plan; if not, the timbre-vs-timing
split needs re-examination.

## Artifacts
- Current arch map + prior-art + UADE model: this doc (synthesized from 3
  parallel investigators, 2026-07-17).
- Prior: `research/2026-07-15_uade-cia-scheduler.md`,
  `plans/2026-07-16-suntronic-resampler-phase-port.md`,
  `handoffs/2026-07-14_suntronic-two-clock-discovery.md`,
  `handoffs/2026-07-17_suntronic-retrigger-fix-and-scheduler-port.md`.
</content>
