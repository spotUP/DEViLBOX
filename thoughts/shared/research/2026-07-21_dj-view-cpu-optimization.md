---
date: 2026-07-21
topic: dj-view-cpu-optimization
tags: [performance, dj, rendering, raf, react-rerenders]
status: in-progress
---

# DJ view CPU optimization — diagnosis + plan

User report: "the DJ view is killing the CPU, it's not usable like this." Diagnosed by
two static-analysis investigations (animation loops + store re-render triggers). Not yet
live-profiled (app was killed for machine load) — verify each fix by profiling before
claiming done.

## Root causes

### A. Too many always-on 60fps loops (24 simultaneous, 2 decks playing)

**Unconditional (run at 60fps even when stopped / empty / tab hidden):**
- `DeckVinylView.tsx:129` ×2 — full 250px canvas clear+redraw (28 grooves+label+marker), no gate
- `DeckCssTurntable.tsx:177` ×2 — DOM transforms, reads store every frame (:157)
- `MixerMaster.tsx:71` ×1 — **3 setState per frame** → re-renders master strip 60×/s  ← FIXED
- `DJOscilloscope.tsx:93` ×1 — full canvas redraw
- `DeckBeatPhase.tsx:47` ×2 — rAF; already change-gated on beat index (cheap-ish) but ungated on visibility

**Worker loops (off main thread but still CPU):**
- `dj-waveform.worker.ts:134` ×2 — always rendering
- `dj-overview.worker.ts:143` ×2 — always rendering
- `dj-turntable.worker.ts:117` ×2 — gated on isPlaying||dirty (OK)

**Playback-gated (OK-ish):** `DeckScopes.tsx:178` ×12 (6/deck) via `useVisualizationAnimation(60, isPlaying)`.

Two turntable renderers exist (`DeckVinylView` + `DeckCssTurntable`) — confirm only ONE is
mounted per deck; if both mount, that's 2× wasted.

### B. Per-frame store writes → React re-render storm (20×/s)

`useDeckStateSync.ts` writes the reactive Zustand store every 50 ms:
- `:61` setDeckState({ audioPosition, elapsedMs, durationMs, songPos, pattPos })
- `:92` setDeckState({ elapsedMs, effectiveBPM })
- `:115` setDeckState({ songPos, pattPos, scratchVelocity, scratchFaderGain })

Components with `useShallow` bundles that include these re-render 20×/s:
- `DeckTrackInfo.tsx:28` — `elapsedMs` → time/BPM/genre subtree
- `MixerChannelStrip.tsx:36` — `scratchFaderGain` → fader/CUT/trim subtree
- `DeckTransport.tsx:20` — `effectiveBPM` → play button/BPM subtree

(Investigator also flagged `CamelotWheel` as subscribing to per-frame BPM — INCORRECT; it
subscribes only to `musicalKey`/`seratoKey`/`analysisState`, none per-frame. Not an offender.)

Correct patterns already in use (copy these): `MixerVUMeter.tsx:44` reads level imperatively
in the anim callback (no store); `DeckAudioWaveform.tsx:94` narrow selector + posts to worker.

## Fix plan (priority order)

1. **[DONE] MixerMaster** — pause on `document.hidden`, throttle ~30fps, only setState on
   ≥0.25 dB change. Kills the worst unconditional re-render storm. `MixerMaster.tsx`.
2. **Shared gated rAF hook** — `useRafLoop(cb, active)` that pauses on `document.hidden` and
   when `!active`. Retrofit the unconditional canvas loops (DeckVinylView, DJOscilloscope,
   DeckBeatPhase) with `active = isPlaying || interacting`. Render once on stop, then idle.
   Biggest remaining main-thread win.
3. **Workers** — gate `dj-waveform` / `dj-overview` render loops on `isPlaying || dirty` and
   post a `visibilitychange`-driven pause message; don't redraw a static waveform every frame.
4. **Kill per-frame store writes for playhead** — move `elapsedMs`/`audioPosition` out of the
   reactive store into a ref/imperative channel (or a dedicated non-React store slice); have
   `DeckTrackInfo` read time on its own throttled (~4fps) tick. Removes the 20×/s subtree
   re-renders. Narrow `MixerChannelStrip`/`DeckTransport` selectors off the per-frame fields.
5. **Confirm single turntable renderer** per deck; lazy-mount the non-visible visualizer.
6. **React.memo** the leaf display components that take stable props once #4 lands.

## Verification (per fix)
- Chrome DevTools Performance: record 5 s idle in DJ view (nothing playing) → main-thread
  should be ~idle after #1–#3 (currently pegged by ungated loops).
- Record 5 s with 2 decks playing → frame time budget; React DevTools "highlight re-renders"
  should show DeckTrackInfo/strip NOT flashing 20×/s after #4.
- MCP: `get_frame_stats` / `get_gpu_stats` before/after.

## Status (updated same day)

Shipped (type-check clean, hot-reloaded, NOT yet profiled live):
- MixerMaster — hidden-gate + setState only on ≥0.25 dB change; 60 fps polling KEPT
  (user requirement: visualizers stay 60 fps — a 30 fps throttle was tried and reverted).
- DeckVinylView — hidden-gate + skip canvas redraw when platter angle unchanged
  (change-gate, so seek-while-paused still updates; spinning = full 60 fps).
- DeckCssTurntable — hidden-gate + change-gated DOM writes (angle 0.01°, arm 0.005°).
- DJOscilloscope — hidden-gate + silence-gate (strided peak scan; flat line drawn once).
- DeckBeatPhase — hidden-gate.
- Re-render storm: selector-level quantization to display resolution —
  DeckTrackInfo (elapsedMs→1 s, BPM→0.1), DeckTransport (BPM→0.1),
  MixerChannelStrip (scratchFaderGain→1 %). 20×/s → only-on-visible-change.

Corrections to the diagnosis:
- dj-waveform/dj-overview workers were ALREADY dirty-gated (`if (dirty) renderFrame()`able)
  — investigator over-claimed; left alone.
- CamelotWheel was wrongly flagged (subscribes only to keys, not per-frame fields).

Design rule adopted: never drop frames that differ; only skip pixel-identical frames
(stationary platter, silent scope, hidden tab). Visualizers stay 60 fps while animating.

Remaining (need live profiling before/after):
- Verify with get_frame_stats + DevTools Performance (blocked on single clean tab for MCP).
- Possibly: getComputedStyle per rendered frame in renderVinyl (cache theme colors).
- Confirm single turntable renderer mounted per deck (DeckVinylView vs DeckCssTurntable).
- DeckScopes ×12 has no visibility gate (only isPlaying).
Nothing committed.
