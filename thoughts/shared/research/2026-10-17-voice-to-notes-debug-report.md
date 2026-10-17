---
date: 2026-10-17
topic: Voice to Notes owner report - debug report before fixes
status: fixes in progress (ledger: thoughts/spot/todos.md, VNR items)
---

# Voice to Notes owner report: debug report

Owner report: (1) notes come out wrong, (2) no live preview while recording,
(3) committed notes have no playable instrument, (4) no wizard / training UI.

## 1. Notes come out wrong

Measured on three real hummed takes (12 s, 20 s, 20 s) through the real
capture path (`getMicStream` + `createMicCapture` + `VoiceRecorder`, 22050 Hz)
in real Chrome. Oracle: YIN (window 2048, threshold 0.12) on each note's span,
plus span RMS.

| Take | mono notes | voiced notes correct (<= 0.65 st) | phantom notes | octave errors | same-pitch splits |
|------|-----------|------------------------------------|---------------|---------------|-------------------|
| 1    | 17        | 8 of 9                             | 8             | 1             | -                 |
| 2    | 24        | 15 of 16                           | 8             | 1             | 4 pairs           |
| 3    | 23        | 12 of 13                           | 10            | 1             | 2 pairs           |

Findings:

- **Phantom notes (the main defect, 26 of 64 notes).** Every phantom sits in a
  silent gap. Span RMS 0.004-0.015; every real note 0.028-0.34. The take's
  10th-percentile frame RMS (the noise floor) is 0.0032-0.0037. The phantoms
  are not model hallucinations: autocorrelation finds a real periodic
  component at ~65 Hz (MIDI 36) in the room / mic noise floor, and Basic Pitch
  transcribes it. Basic Pitch amplitude cannot separate them (phantoms 0.28-0.52,
  real notes 0.29-0.71). Invariant violated: a note is emitted only where the
  take carries a voice. Root level: note extraction (`pitchNotes.ts`) never
  looks at input energy. Fix: an energy gate in the single extraction path
  relative to the take's own noise floor: drop a note whose span RMS is below
  min(6 x p10 frame RMS, 0.25 x p95 frame RMS). On the three takes the gate is
  0.019 / 0.022 / 0.020 and drops every phantom and no real note.
- **Octave errors (1 per take, always the same sung pitch).** The singer's
  ~233 Hz (A#3, MIDI 58) reads as MIDI 46 in all three takes. Poly output
  holds both 46 and 58; `toMonophonic` keeps 46 because its amplitude is
  higher (0.65 vs 0.47). The model's frames, contours and onsets give no cue
  (frames 0.67 / 0.47 in take 3, 0.43 / 0.51 in take 1). Only the audio's
  fundamental decides it. Fix: octave correction from a YIN f0 estimate on the
  note span, keeping Basic Pitch's pitch class and taking the octave from the
  audio when YIN is confident. The existing YIN lives only in
  `public/autotune/AutoTune.worklet.js` (plain JS worklet, not importable);
  `SampleSpectrum.harmonicity` was measured and is not usable (it reported an
  octave-up error on a note YIN read correctly).
- **Held notes split into same-pitch repeats** (gap <= 12 ms). Each repeat
  retriggers in the tracker. Fix: merge same-pitch neighbours whose gap is at
  most 2 annotation frames (23 ms).
- Semitone drift splits (61 then 60, 66 then 65) are the singer's real pitch
  (YIN agrees) and stay.
- The owner's take 3 reference was "C D E F G A B"; the audio's own f0 reads
  A#3 F3 E3 G#3 C#4/C4 F#4/F4, so the take does not contain the reference
  scale. Accuracy is therefore judged against the audio oracle, not the
  reference.

## 2. No live preview

The live preview code runs (1.5 s window every 0.25 s) but its notes are only
shown as a text list in the panel; nothing reaches the pattern editor, and
errors in the live pass are swallowed in `useVoiceRecorder`. Root: there is no
preview channel from the panel to the pattern renderer. Fix: a
`previewCells` worker message modelled on the existing `dragOver` message,
drawn dimmed in the GL renderer and the 2D renderer on the target channel,
never written to the pattern store.

## 3. Committed notes have no instrument

`writeToPattern.resolveInstruments` creates missing instruments with
`createInstrument()` and no config: an empty Sampler with no sample, which is
silent. The melody target defaults to the current instrument, which may also
be an empty Sampler. Drums map classes by instrument-name hints with MIDI
36/38/42/39. Fix: a playable predicate; melody falls back to a "Voice Lead"
from a factory lead preset (owner decision); drums map each class to a TR808
instrument (existing one with the same io808Type, else created from
`TR808_PRESETS`) at note C-4 (MIDI 60, native pitch for the io808 pitch
multiplier).

## 4. No wizard / training UI

Latency calibration and per-class drum training exist as library code but the
panel shows them only as small inline controls the owner did not find. Fix: a
setup wizard Modal (input level, latency calibration, guided per-class
beatbox training, train and result), opened automatically on first use when
no calibration is stored, and reopenable from the panel.
