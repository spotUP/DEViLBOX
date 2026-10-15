---
date: 2026-10-15
topic: Record your voice and turn it into notes (melody) and drum hits (beatbox) in the patterns
tags: [voice, audio-to-midi, basic-pitch, beatbox, pattern-editor, plan]
status: draft
---

# Voice to Notes - plan

## Owner decisions (2026-10-15)

- Modes: **melody** (monophonic notes) and **beatbox drums**.
- Workflow: **both**: a live preview while recording, which is then fine-tuned in a review step before writing.
- Detector: **neural model from the start**.
- UI home: a **panel next to the pattern editor** (record, live preview on the target channel, Finetune, Commit).
- Drum targets: a **mapping table** of detected hit types to instruments the owner picks.
- Model shipping: **bundled in the repo, loaded on first use**.
- Beatbox classifier (O1): **rule-based spectral classifier first** to get going, then a **user-trainable model** from the owner's own guided recordings.
- Raw take (O5): **notes only**, the take is discarded after Commit.

## What exists (reuse, do not rebuild)

Searched `thoughts/`, `docs/`, `src/`, `package.json`, `public/` (grep for audio-to-midi, basic-pitch, getUserMedia, onnxruntime):

| Piece | Where | State |
|---|---|---|
| Audio-to-MIDI of a SAMPLE with Spotify Basic Pitch (TF.js CNN, Apache-2.0) | `src/components/instruments/AudioToMidiModal.tsx` (782 lines), opened from `SampleEditor.tsx` / `useSampleEditorState.ts` | works on a loaded AudioBuffer, inserts a new pattern; settings `onsetThreshold`, `frameThreshold`, `minNoteLengthMs`, `minMidiNote`, `maxMidiNote`, `rowsPerBeat`; resamples to 22050 Hz mono |
| Model files | `/basic-pitch/model.json` + `group1-shard1of1.bin` (also in `node_modules/@spotify/basic-pitch/model`) | already served |
| ONNX in the browser | `onnxruntime-web` ^1.23.2, `public/models/ced/model.onnx` (83 MB CED classifier), `essentia.js` | available for a drum-hit classifier |
| Microphone capture | `getUserMedia` in `DubDeckStrip.tsx`, `DJVocoderControl.tsx`, `HeadphoneSetupDialog.tsx` | taps only, no recorder with count-in |
| Pattern write path | `useTrackerStore` (the modal's `insert pattern` code is the starting point), `midiToXMNote` in `lib/xmConversions.ts` | note naming per format is the single `lib/amiga/periodNotes.ts` + `xmConversions` path |

There was no plan for this before today.

## Problem

Entering a melody or a drum groove means clicking cells. Humming or beatboxing is faster and more musical. Today a voice can reach the patterns only by recording a sample elsewhere and running the sample-editor modal by hand, with no count-in, no live feedback and no drums.

Invariant to establish: **a take recorded against the playing song lands on the pattern grid at the right rows, in the right pitch, as one undoable edit**, and the user sees what was detected before it is written.

## Levels the fix could live at

1. Extend `AudioToMidiModal` in place. Rejected: it is a 782-line component mixing UI, model loading, note extraction and pattern insertion; a live path and a drum path would pile onto it.
2. **Extract a pure core, then build the panel on it (chosen).** `voice/` modules: capture (worklet recorder), pitch (Basic Pitch frames -> notes, shared with the sample modal), drums (hit detector + classifier), quantise (notes and hits -> rows), write (rows -> pattern cells through the store). `AudioToMidiModal` is re-pointed at the same core, so there is one note-extraction path, not two.
3. Server-side transcription. Rejected: offline use, privacy, latency.

## Design

```
mic -> RecorderWorklet (ring buffer, 22050 Hz mono tap + full-rate take)
        |-> live path: sliding window (~1.5 s hop 0.25 s) -> BasicPitch frames -> note candidates -> LivePreview (ghost notes on the target channel)
        '-> take ends: full BasicPitch pass over the whole take (more accurate than the live windows)
                -> notes[]  --+                       onset detector + hit classifier (ONNX) -> hits[]
                               v                                          v
                        quantise(bpm, speed, rowsPerBeat, swing, strength) -> rows
                               v
                  FinetunePanel: threshold sliders, min length, range, quantise strength, transpose, key snap, drum map
                               v
                         commit -> one undo step through the pattern store
```

- Count-in and monitoring: a metronome in the headphones, the song optionally playing (the take is aligned to the song position at record start, with a latency compensation measured once with the existing headphone setup dialog's loopback pattern).
- Live preview is advisory: shown as ghost notes, never written until Commit. Final notes come from the full-take pass.
- Melody: Basic Pitch polyphonic output reduced to **monophonic** by the highest-confidence line (a "chords" switch can keep several channels later).
- Beatbox: onset detection (spectral flux) + a small classifier over a 60 ms window (kick / snare / closed hat / open hat / clap / tom / other). First choice: a compact ONNX model through `onnxruntime-web` already in the app; features from essentia.js. The model must be trained or found: **open question O1**.
- Drum map: a table `hit type -> instrument` (defaults guessed from instrument names such as "kick", "snare"), written to the channel(s) chosen in the panel. Hits snap to rows like notes.
- Format notation: the writer asks the format layer for the cell encoding (note number, XM/MOD period notation, FT2 note numbers, effect column untouched), one function, reused from the existing import code.

## Open questions (to resolve before building)

- O1 DECIDED: rule-based classifier first (low/mid/high energy ratios, decay, zero-crossing rate), then guided user training (about 3 minutes of kick/snare/hat/clap takes) producing a small per-user model stored locally.
- O2 Latency compensation: measure once per device (loopback) or let the user nudge.
- O3 Overdub and multiple takes: keep the last N takes per project?
- O4 Tuning: snap to the song's key / scale? Default off, optional lock.
- O5 DECIDED: notes only; no sample instrument is kept.

## Checklist (IDs; ticked in the open as executed)

Phase V0 - research (no feature code)
- [ ] VN-0.1 Read `AudioToMidiModal.tsx` fully; list what moves into the pure core and what stays UI.
- [ ] VN-0.2 Decide O1 (drum classifier source) with a small experiment: 3 candidate approaches measured on recorded beatbox clips the owner provides.
- [ ] VN-0.3 Measure Basic Pitch accuracy on 10 sung and hummed clips (cents error, note count, onset error in ms); pick default thresholds.

Phase V1 - pure core
- [ ] VN-1.1 `voice/pitchNotes.ts`: frames to monophonic notes (extracted from the modal), tests with synthetic sine sequences and recorded fixtures.
- [ ] VN-1.2 `voice/quantise.ts`: notes/hits to rows (bpm, speed, ticks per row, swing, strength, min length), property tests (monotonic rows, no overlaps, length conservation).
- [ ] VN-1.3 `voice/writeToPattern.ts`: rows to cells through the store as one undo step; per-format note encoding.
- [ ] VN-1.4 Re-point `AudioToMidiModal` at the core (no behaviour change; its existing behaviour is the regression test).

Phase V2 - capture
- [ ] VN-2.1 `RecorderWorklet` + `useVoiceRecorder` (permission, device pick, level meter, count-in, metronome, song-position alignment).
- [ ] VN-2.2 Latency calibration (O2).

Phase V3 - melody panel
- [ ] VN-3.1 Panel next to the pattern editor: record, stop, live ghost notes, Finetune controls, Commit.
- [ ] VN-3.2 Live preview from sliding windows; the final pass replaces it at take end.

Phase V4 - beatbox
- [ ] VN-4.1 Onset detector + rule-based hit classifier + tests on clips.
- [ ] VN-4.3 Guided user training: record labelled takes, train a small per-user classifier (browser, local storage), swap it in over the rules when accuracy is higher on a held-out split.
- [ ] VN-4.2 Drum map UI + writer.

Phase V5 - polish
- [ ] VN-5.1 Key/scale snap (O4), takes list (O3), MCP tool `voice_to_notes` for headless testing.

## Verification

Automated: pure-function tests; a reachability test that drives the PANEL'S commit button on a synthetic take (a generated sine melody played into the recorder through a fake MediaStream) and asserts the pattern cells and one undo entry; the sample modal's existing flow unchanged. Manual (owner, LOCAL `http://localhost:5174`): hum a 4-note phrase against the metronome, see ghost notes while recording, Commit; PASS = the pattern holds the same notes at the right rows; then a beatbox bar, PASS = kicks/snares/hats land on the mapped instruments.

## Out of scope for now

Polyphonic/chord transcription into several channels, lyrics, auto-harmonising, cloud models.
