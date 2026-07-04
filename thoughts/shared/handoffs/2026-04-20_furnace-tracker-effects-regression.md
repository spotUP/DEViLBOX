---
date: 2026-04-20
topic: furnace-tracker-effects-regression
tags: [handoff, furnace, tracker-effects, vibrato, wasm, sequencer]
status: draft
---

# Session Handoff — Furnace Tracker-Effect Regression

## Task(s)

User reports that Furnace tracker effects (vibrato 4xy and "etc etc") sound
"totally off" during .fur playback. Lock-step command comparison still passes
100% on 15 chip categories (per `memory/MEMORY.md` Furnace notes), so the
sequencer emits the correct dispatch commands — the regression is in the audio
produced by those commands, not in the command stream.

This handoff is for the audio-level investigation. Explicitly NOT about the
gain-staging work from this session (see below — already shipped).

## Gain-Staging Work (Already Shipped, Not the Effects Regression)

During this session I investigated the handoff's Task #30 (Furnace gain audit).
That work is complete and in main:

- **Commit**: `a702fcef9` — `fix(scope): flush per-channel oscilloscope on stop`
  (merged as PR #28). The scope-pollution fix was the headline, but the commit
  also bundled the two Furnace gain-staging fixes below.
- **Root cause A — signal duplication**: every `FurnaceDispatchSynth`
  constructor called `sharedGain.connect(this.output)`. With 23 instruments on
  a multi-chip Genesis song, `buildInstrumentEffectChain` then connected each
  `this.output` → synthBus, summing the shared worklet output 23 times. Fix:
  remove that connect — `this.output` stays as a silent stub; the engine's
  `routeNativeEngineOutput` provides the sole audio path to synthBus.
- **Root cause B — double compensation**: `setVolumeOffset` wrote
  `sharedGain.gain.value = pow(10, volumeOffsetDb/20)` on a node shared across
  every instrument on the engine. "Last-writer-wins" produced nondeterministic
  gain (+7 dB for OPN, up to +37 dB for MMC5) on top of the worklet's POST_AMP
  — double-compensation with upstream Furnace. Fix: `setVolumeOffset` is now a
  documented no-op for this engine; POST_AMP is the sole loudness layer.
- **Measured impact on Genesis "All Good Times" (13 ch, master = 0 dB)**:
  - Before: `peakMax 43.89`, `rmsAvg 11.25` (~+33 dBFS)
  - After: `peakMax ~5.2`, `rmsAvg ~1.3` (~-4 dBFS — natural multi-chip level)
- **Verification**: flow 06 gate (`tools/ui-smoke/ui-smoke.test.ts`, line 99)
  still passes on vibe_zone.fur (AY, peak 0.05 @ master -18 dB, internal ~0.4).

## The Actual Regression (What Needs Investigation)

**Symptom**: vibrato and other tracker effects sound "totally off" on .fur
playback. User emphasised this is NOT related to the dub bus or the gain fix.

**What's ruled out**:
- Sequencer command stream — lock-step passes 100% on 15 chip categories.
- Gain/routing layer — my fixes cleaned it up, effects regression was present
  before and after. User confirmed.
- WASM staleness vs sources — `public/furnace-dispatch/FurnaceDispatch.wasm`
  was built 2026-03-23; all `furnace-wasm/common/*.cpp` are older than that
  binary. No stale-build gap.

**Leading hypotheses** (ordered by likelihood):
1. **Tick cadence / timing drift in the worklet.** `FurnaceDispatch.worklet.js`
   hardcodes `this.tickRate = 60.0` and derives `samplesPerTick = sampleRate /
   tickRate`. Many Furnace songs target PAL (50 Hz) or use custom tick rates
   set via the `setRate` command. If the worklet never picks up a song's
   requested rate, effects like vibrato (which are tick-driven) run at the
   wrong speed. Needs: grep for `setRate`/`tickRate` message handlers and
   trace the path from .fur import → worklet.
2. **Chip emulator register-write timing inside WASM.** Memory notes mention
   16-bit fractional ADSR + direction-tracking LFO were restored in
   `macroInt.cpp` during the 1:1 audit. If any register-write ordering drifted
   for vibrato/arp/slide, audio would be wrong even when dispatch commands
   are bit-identical (because the chip simulator consumes commands into its
   internal state machine, which can desync).
3. **TS-side FurnaceEffectRouter interference.** Memory says this router is
   for live/real-time effects, not .fur playback. If it's accidentally firing
   during .fur playback, it would double-process effects on top of the WASM
   sequencer's own processing.

## Critical References

- `public/furnace-dispatch/FurnaceDispatch.worklet.js` — process loop + tick
  accumulator. Line ~1034 onward is the per-block render; line ~1069
  recomputes `samplesPerTick`. Check for `setRate` / `setTickRate` message
  handler (grep turned up nothing in the worklet — that's suspicious if
  upstream Furnace songs expect it).
- `furnace-wasm/common/FurnaceSequencer.cpp` (3008 lines) — WASM sequencer
  that handles ALL effect processing for .fur playback. Effect-number →
  dispatch-command mapping lives here.
- `src/engine/furnace-dispatch/FurnaceEffectRouter.ts` — TS effect router for
  live editing; should NOT be active during .fur playback.
- `third-party/furnace-master/src/engine/playback.cpp` — upstream reference
  for per-tick effect processing.
- `tools/furnace-audit/` — lock-step harness:
  - `render-devilbox.ts` — headless WASM renderer with `--cmdlog`
  - `compare-cmds.ts` — command-level diff
- `/Users/spot/Code/Reference Code/furnace-master/build-headless/furnace` —
  upstream CLI for WAV reference rendering.

## Recent Changes (this session, already shipped)

- `a702fcef9` — gain-staging fixes (bundled in scope PR #28). No uncommitted
  code from this session remains.
- Working tree dirty state (`DubDeckStrip.tsx`, `DubBus.ts`, `useDubStore.ts`,
  `useAudioStore.ts`, `main.tsx`, etc.) is leftover from the 2026-04-20
  dub-studio-demo session and is NOT mine.

## Learnings / Gotchas

- **Lock-step ≠ audio equality.** Command stream matching upstream 1:1 proves
  the sequencer is correct, but the chip emulator can still produce wrong
  audio if register-write timing, tick cadence, or internal state progression
  differ. For this regression, compare *rendered audio* against upstream
  Furnace CLI output, not just commands.
- **Lock-step debugging rule from CLAUDE.md still applies** for the WASM
  sequencer/dispatch boundary. For audio-level validation, the rule is
  inverted — lock-step won't help here.
- **HMR is not reliable for AudioWorklets / engine singletons.** Always hard
  reload (Cmd+Shift+R) after editing worklet or engine code.
- **The `_toneEngine` global is your friend.** `window._toneEngine` +
  `.nativeEngineRouting.get('FurnaceDispatchEngine')` gives live state of the
  sharedGain value, destination count, and worklet class. Use
  `mcp__chrome-devtools__evaluate_script` for inline introspection without
  having to add logging in the code.

## Artifacts

- Handoff (this file).
- Previous session handoff: `thoughts/shared/handoffs/2026-04-20_dub-studio-demo-session.md`
- Already-merged PR #28 (`a702fcef9` + merge `5aec37b25`).

## Next Steps

1. **Pick a minimal repro song.** Something with obvious vibrato (e.g. a GB
   or NES demo with `04xx` on a single sustained note). Single-chip to avoid
   multi-chip confounders. Candidates in `third-party/furnace-master/demos/`.
2. **A/B the audio.** Render the same song through:
   (a) DEViLBOX headless — `npx tsx tools/furnace-audit/render-devilbox.ts
   <song> out-devilbox.wav`
   (b) Upstream — `"/Users/spot/Code/Reference Code/furnace-master/build-headless/furnace"
   -output out-upstream.wav -loops 0 <song>`
   Compare with a waveform viewer / spectrogram. Focus on the effected notes.
3. **If audio differs where commands match**: the bug is in the chip
   emulator's consumption of the commands. Inspect the affected chip's
   platform `.cpp` in `third-party/furnace-master/src/engine/platform/` vs
   register-write timing in our wrapper. Check for uninitialized bool
   pattern (`memory/furnace_uninit_bool_pattern.md`).
4. **If tick cadence is wrong**: check the worklet's `tickRate` against the
   song's requested rate. The worklet hardcodes 60 Hz; songs may set 50 Hz
   or custom. Either add a message handler for `setTickRate` or read it from
   the song header during `createChip`.
5. **If effects only break on certain chips**: narrow with a test matrix
   (`tools/furnace-audit/` harness) and compare per-chip.
6. **Do NOT roll the gain fix back** to investigate this — they are
   independent. The clipping was real, the effect regression is separate.

## Other Notes

- User flagged "All Good Times" (Genesis) as having its own issues unrelated
  to the gain fix — don't use it as a repro for effects regression.
- The flow 06 gate (`peakMax < 4`) passes for single-chip songs now but
  multi-chip Genesis can legitimately hit ~5. If that gate starts failing
  again for legitimate reasons, raise the threshold rather than adding
  downstream gain attenuation (which would break upstream 1:1).
