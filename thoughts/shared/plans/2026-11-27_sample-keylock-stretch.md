---
date: 2026-11-27
author: spot
status: implemented (awaiting owner ear check)
ledger: SAMPLE-KEYLOCK-STRETCH (thoughts/spot/todos.md)
---

# Sample editor: speed change with key lock (time-stretch, pitch kept)

## Goal

The sample editor changes a sample's speed (length) without changing its pitch,
using the same stretcher as the DJ Key Lock. One stretch path in the app.

## Where the stretcher lives

- Worklet files: `public/signalsmith-stretch/` (Signalsmith Stretch 1.3.2, MIT,
  vendored unmodified; `DeckKeyLock.worklet.js` = idle shim + upstream build).
- Main-thread loader + config: `src/engine/dj/DeckKeyLock.ts`
  (`DeckKeyLock.loadModule(ctx)`, `STRETCH_CONFIG` 80 ms blocks / 20 ms interval /
  split computation, `TONALITY_HZ` 20 kHz). Commit 4b0cb6941.

## How it runs offline

The upstream processor has a buffer-playback mode besides the live-input mode
the DJ deck uses: `addBuffers([ch0, ch1...])` stores the audio inside the node,
and `schedule({ active, rate, semitones })` plays it back at `rate` with its own
time-stretch (output time t reads input time t * rate, latency compensated by
the processor). So an offline stretch is:

1. `new OfflineAudioContext(channels, round(length * factor), sampleRate)`.
2. `DeckKeyLock.loadModule(ctx)` (same worklet module, same factory).
3. Node with `numberOfInputs: 0` (no live input -> buffer mode),
   `outputChannelCount: [channels]`.
4. `configure(STRETCH_CONFIG)`, `addBuffers(channelData)`,
   `schedule({ active: true, rate: 1 / factor, semitones: 0, tonalityHz })`.
5. `startRendering()` -> the stretched AudioBuffer.

Code: `src/lib/audio/stretchKeepPitch.ts` (`stretchKeepPitch`, `keepPitchSchedule`).
`DeckKeyLock.moduleLoads` becomes a WeakMap so per-call offline contexts are not
kept alive.

## One stretch path

Beat Sync's "Time-stretch" method used its own WSOLA (`timeStretchToFit` in
`src/lib/audio/BeatSyncProcessor.ts`) - a second stretcher. It now calls
`stretchKeepPitch`; the WSOLA code is deleted.

## UI entry

Sample editor tool row, next to Resample: a `Stretch` button opens a Modal with
a `Speed` Knob (25-400 %, 100 % = unchanged; length = 100 / speed) and a
`Keep Pitch` Toggle. Keep Pitch on -> `stretchKeepPitch`; off -> plain resample
of the length (pitch follows speed, `WaveformProcessor.resample` path via the
same rate math). Design-system components only (Modal, Button, Knob, Toggle).

## Undo + buffer replace

`doStretch(speedPercent, keepPitch)` in `useSampleEditorState` is a sibling of
`doResample`: `pushUndo('Stretch')`, replace the buffer, `onPersistBuffer`.

## Loop points scale with length

The editor's loop view is 0-1 over the buffer. After a stretch the same 0-1
positions are the right ones, but the sample stores frames. `onPersistBuffer`
takes an optional loop view and writes it through `viewLoopToSample` against
the NEW buffer (the conversion `handleBufferProcessed` already uses), so frames
scale with length. Undo/redo restore the loop through the same argument; before,
the separate loop write was overwritten by the persist call's stale sample copy.

## Test

`src/lib/audio/__tests__/stretchKeepPitch.test.ts`: drives the exact worklet
files in Node (tools/keylock/workletHost) with `STRETCH_CONFIG` +
`keepPitchSchedule(1.5)` on a 440 Hz sine; length x1.5, zero-crossing rate
within 2 % of the source.
