---
date: 2026-10-08
topic: Auto DJ baseline lock (plan Gate A) - the behaviour recorded before the world-class plan changed it, and how regressions are detected
tags: [dj, auto-dj, baseline, gate-a]
status: final
---

# Auto DJ baseline (Gate A)

Companion to `thoughts/shared/research/2026-10-08_auto-dj-how-it-works.md` (the full description with the file:line appendix). This file records the numbers the plan's Gate A asks for, as they were at commit `92b5dd4f5`, and names the test that freezes them. Everything below is by static reading of the code plus the probes in `src/engine/dj/__tests__/autoDJBaseline.test.ts`.

| Gate A item | Baseline behaviour (before the plan) | Where |
|---|---|---|
| A1.1 playlist order | Auto DJ plays the playlist top to bottom (or shuffled), wrapping at the end | DJAutoDJ.ts computeNextIndex |
| A1.2 Smart Sort | On enable the playlist is physically re-sorted (greedy nearest neighbour: 0.8 x bpm diff squared, Camelot -20/-12/-12/-5/+50, 60 x energy diff squared) and saved over the user's order; legacy order of the 15-track corpus frozen in the baseline test | DJPlaylistSort.ts, DJActions.ts enableAutoDJ |
| A1.3 deck transitions | outgoing deck stopped, decks swap, preload begins immediately | DJAutoDJ.ts completeTransition |
| A1.4 preload | fixed 60 s lead time (or unknown duration, or frozen position > 6 s); pre-render to WAV; 10 retries with 5 s..60 s backoff | DJAutoDJ.ts PRELOAD_LEAD_TIME_SEC |
| A1.5 transition lengths | user setting 2/4/8/16/32 bars for every transition; echo-out fixed at 4 bars; skip = max(4, bars x beats / 2) beats | DJAutoDJ.ts triggerTransition |
| A1.6 crossfader | quadratic ease-in-out over bars x beats, 16 ms ticks, equal-power law | DJQuantizedFX.ts crossfaderSweep, DJMixerEngine.ts |
| A1.7 tempo matching | incoming pitched to the outgoing BPM (direct / half / double, smallest shift), clamped +-4 semitones | DJAutoSync.ts syncBPMToOther |
| A1.8 pitch | the one pitch path DJActions.setDeckPitch (fixed 2026-10-08); key lock never set by Auto DJ | DJActions.ts, DeckEngine.ts |
| A1.9 key | whole-track key, confidence stored but unused; "Unknown" scores as a clash | DJKeyUtils.ts keyCompatibility |
| A1.10 filter transitions | outgoing HPF 0 to -0.6 over 75 % of the fade then snapped to -1; filter-build: incoming HPF -0.8 to 0 | DJQuantizedFX.ts |
| A1.11 bass swap | crossfader to 0.5, outgoing low EQ -12 dB at the midpoint, then complete; incoming bass untouched | DJQuantizedFX.ts bassSwapTransition |
| A1.12 echo-out | crossfader snaps to incoming, outgoing volume decays (1-p)^2 over 16 beats; no delay effect | DJQuantizedFX.ts echoOutTransition |
| A1.13 failure recovery | 45 s transition timeout, crossfader stuck 10 polls, incoming silent 10 s; 10 preload failures disable | DJAutoDJ.ts pollLoop |
| A1.14 shuffle | Fisher-Yates permutation excluding the current track | DJAutoDJ.ts generateShuffleOrder |
| A1.15 auto pause | pause stops the poll and force-completes a running transition; an externally paused deck is resumed | DJAutoDJ.ts pause, pollLoop |
| A1.16 transition timing | trigger when remaining <= bars x beats x 60 / BPM; then wait for the next downbeat; chord deferral up to min(5, 15 % of the fade) polls | DJAutoDJ.ts |
| A1.17 humanization | 0..30 ms late-only jitter after the quantised boundary | DJQuantizedFX.ts scheduleQuantized |
| A1.18 analysis values | bpm, bpmConfidence, beats, downbeats (every N-th beat from beat 0), key, keyConfidence, 3-band peaks, rmsDb, peakDb, genre energy = (rmsDb + 60) / 60 | dj-analysis.worker.ts |

## Corpus (A2)

`src/engine/dj/autodj/testing/corpus.ts`: 15 synthetic arrangements with ground truth (beats, downbeats, section starts, keys), one per plan item A2.1-A2.15, rendered deterministically and analysed through the real extended analysis and DJTrackAnalysis builder. Tracker material (A2.11) carries a matching TrackerSong.

## Regression detection (A3)

- `autoDJBaseline.test.ts` freezes the legacy Smart Sort order of the corpus and the legacy transition-type rules (bass-swap / echo-out / filter-build / crossfade thresholds), the poll and preload constants and the bar options. A change to any of them fails the test and must be a deliberate decision.
- Transition logs: `src/engine/dj/autodj/decisionLog.ts` (ring buffer, MCP-readable).
- Regression playback: `DJSetSimulator` (plan Gates S and V) runs the real session controller over the corpus with virtual time.
