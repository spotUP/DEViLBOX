---
date: 2026-10-17
topic: Voice to Notes engine rework - SwiftF0 pitch tracker, own note segmenter, trained drum classifier with wizard calibration
status: planned, waiting on owner measurement (Phase M)
ledger: thoughts/spot/todos.md VNR-17, VNR-18, VNR-19, VNR-20, VNR-21, VNR-22, VNR-25
research:
  - thoughts/shared/research/2026-10-17_voice-to-midi-projects.md (sections "What Basic Pitch does wrong for humming", "Recommended", "Open items resolved (2026-10-17)")
  - thoughts/spot/2026-10-17_voice-to-notes-modal-wizard.md ("Status 2026-10-17")
  - thoughts/shared/plans/2026-10-17-voice-to-notes-modal-wizard.md (previous plan, shipped)
---

# Voice to Notes engine: SwiftF0 + own segmenter, trained drums + wizard calibration

## Owner asks (verbatim)

- VNR-17: "i recorded two notes ooo eeee oooo eee oooo eeee with my voice now but i get a lot of extra wrong notes"
- VNR-18: "it stops recording audio to notes before i stop and it's not very accurate yet"
- VNR-19: "i think we need to improve the training sessoins a lot, per kick snare hitat etc" (failures named: missed hits, wrong class after training, wizard flow)
- VNR-22: "the training only has options for drums not melody"
- VNR-25: "its still very inaccuraate... the preview wave looks like its more correct than the notes in the pattern"

Owner decisions (2026-10-17, AskUserQuestion): SwiftF0 plus our own segmenter for melody (VNR-20); keep `detectOnsets`, replace the rule classifier with a small trained classifier using the wizard's per-class takes as per-user calibration (VNR-21); melody wizard step calibrates vocal range and octave (VNR-22). Basic Pitch stays for the sample editor Audio to MIDI only.

## What exists (file:line)

Melody path (Basic Pitch on TF.js, NOT ONNX):
- `src/lib/voice/basicPitchModel.ts:5` imports `@spotify/basic-pitch`; `:8` `MODEL_URL='/basic-pitch/model.json'`; `:11` `PitchModel.evaluate(samples /*22050 mono*/, onProgress?) => Promise<PitchModelOutput>`; `:44` `resampleToMono22050`; `:54` `basicPitchModel`.
- `src/lib/voice/pitchNotes.ts:31` `PitchModelOutput {frames,onsets,contours,audio?}`; `:43` `PitchSettings {onsetThreshold,frameThreshold,minNoteLengthMs,minMidiNote,maxMidiNote}`; `:57` `DEFAULT_PITCH_SETTINGS`; `:93` `melodyRange`; `:109` `toMonophonic`; `:127` `mergeSplitNotes`; `:156` `modelOutputToNotes(out, settings, monophonic)`; `:175-183` voice gate and `octaveFromAudio` only on the monophonic branch.
- `src/lib/voice/voiceToNotes.ts:31` `shapeNotes(output, NoteShaping)` = `modelOutputToNotes(...,true)` + `transposeNotes` + `snapNotesToKey`; `:42` `commitVoiceNotes`.
- `src/lib/voice/liveWindow.ts:8` 1.5 s window, `:9` `LIVE_HOP_SECONDS` 0.25, `:32` `previewStep(take, previous, model, settings)`, `:40` `model.evaluate`, `:41` `modelOutputToNotes(out, settings, true)`; no transpose or key snap on the live path (one reason the preview and the pattern disagree, VNR-25).
- `src/lib/voice/noteEffects.ts:92` `takeContour(audio, sr)` runs YIN (`voicing.ts yinHz`) every 20 ms; consumers `VoiceToNotesPanel.tsx:421`, `voiceHandlers.ts:107`, `noteEffects.test.ts:42`.
- `src/stores/useVoiceStore.ts:39` `Finetune extends PitchSettings` (+ transpose, swing, minLengthRows, latencyNudgeMs, keySnap*, strength, toleranceRows, effects); `:55` `DEFAULT_FINETUNE`; `fine` is NOT persisted (no migration needed for it). `samples: TrainingSample[]` (`:95`) and `training` (`:96`) are persisted through drumModel.ts keys.
- Callers of the pitch model: `VoiceToNotesPanel.tsx:154` (prop `model = basicPitchModel`), `:326` full-take `model.evaluate(audio)`; `useVoiceRecorder.ts:98` live `previewStep`; `voiceHandlers.ts:31, :88`. `AudioToMidiModal.tsx:16-17, :280` calls `modelOutputToNotes(output, settings, false)` (polyphonic branch only).
- ONNX in the repo: `src/workers/instrument-classifier.worker.ts:21` `import * as ort from 'onnxruntime-web/wasm'`, `:50` `wasmPaths`, `:55` `numThreads = 1`, `:106` `InferenceSession.create(new Uint8Array(buf), {executionProviders:['wasm']})`; `src/utils/audio/NeuralEnhancerWorker.ts:6-39` a second inline copy. No shared helper.

Recording:
- `public/worklets/voice-recorder.worklet.js` posts every 128-sample block. `src/lib/voice/micCapture.ts:25-50` AudioContext at `PITCH_SAMPLE_RATE` 22050; `stop()` disconnects and closes immediately. `src/lib/voice/voiceRecorder.ts:41, :83` accumulate blocks; `:98` `stop()` concatenates with no flush, so blocks still queued in the worklet port are dropped (milliseconds, not seconds). `useVoiceRecorder.ts:90` live interval 250 ms with a `busyRef` skip; `:112-121` stop. No take-length cap anywhere.

Drums:
- `src/lib/voice/drumHits.ts:98` `detectOnsets(samples, sr=22050, s=DEFAULT_ONSET_SETTINGS)`; `:201` `hitFeatures` -> `{low, mid, high, decay, zcr, bursts}`; `:252` `classifyByRules` (hard thresholds); `:260` `featureVector` (6 values); `:265` `detectHits(samples, classify=classifyByRules, sr)`.
- `src/lib/voice/drumModel.ts:18` `TrainingSample {drum, features}`; `:23` `DrumModel {mean,std,centroids}` (z-scored nearest centroid); `:30` `MIN_SAMPLES_PER_CLASS` 3; `:117` `trainAndEvaluate` -> `{model, modelAccuracy, rulesAccuracy, heldOut, useModel}`, null until 2 classes have 3 samples; `useModel` only when the model beats the rules on held-out hits; `:147-148` keys `devilbox.voice.drumSamples.v1`, `devilbox.voice.drumModel.v1`; `:195` `loadActiveClassifier`; `:201` `samplesFromTake` labels every rule-detected hit with the step's class.
- Panel `:308` draws wizard markers with plain `detectHits(audio)` (rules); `:319` analysis uses the model only when `useModel`.
- Wizard `src/components/tracker/VoiceSetupWizard.tsx:35` STEPS microphone, latency, kick, snare, hat, clap, melody, result; `:48-51` prompts ask for eight hits; `:149-152` Next blocked while recording, while a drum step has fewer than 3 samples, or while the melody step has no range; `:247-258` melody step derives Lowest/Highest from the take via `melodyRange`; `:161` `onMelodyRange`.

Measurement tool: `src/bridge/handlers/voiceHandlers.ts:153` `getVoiceTake()` (MCPBridge `:438`, server `server/src/mcp/mcpServer.ts:1649`) returns seconds, samples, gateDb, voicedFrom, voicedTo, envelopeDb (0.1 s), notes, lastNoteEnd, hits, takes, training (with confusion), fine.

Reachability test: `src/components/tracker/__tests__/voiceToNotesPanel.test.tsx:60` `SineReadingModel` injected through the panel's `model` prop (sentinel `model.calls`), fake mic `deps`; asserts C-4/E-4/G-4 from row 0, one undo step, late take on row 0, drum hits on row 0, key snap, latency calibration.

SwiftF0 facts (research, verified from source): MIT; 14,386 parameters; `swift_f0/model.onnx` 135,090 bytes; input `audio` float32 [1, N] at 16 kHz, `fmin`, `fmax` float32 scalars; outputs `pitch` (Hz) and `confidence` per 256-sample hop (16 ms, 62.5 fps); STFT is inside the graph; range 46.875-2093.75 Hz; voiced at confidence >= 0.5; about 10 frames (176 ms) lookahead. `segment_notes` is an exact dynamic program (algorithm copied in the research doc, section "segment_notes algorithm").

AVP (zenodo 3250230): CC BY 4.0, 229.6 MB zip, 4 classes (kick, snare, closed hat, open hat), 28 amateur performers, MacBook built-in mic. No clap.

## Root causes being fixed

1. Extra notes on vowel changes (VNR-17, VNR-25): Basic Pitch is a polyphonic decoder; a vowel change moves formant energy, which it reads as new onsets and harmonic-neighbour notes. `toMonophonic`/`mergeSplitNotes`/`octaveFromAudio` repair symptoms after the decode. Invariant violated: one voice gives one pitch per instant, and a note boundary is a pitch change or a silence, never a timbre change. Fix level: the decoder (frame F0 tracker plus a contour segmenter), not more post-filters.
2. Preview and pattern disagree (VNR-25): the live path calls `modelOutputToNotes` without transpose/key snap while the commit path goes through `shapeNotes`. Invariant: one shaping function for preview and commit.
3. Wrong drum class after training (VNR-19/21): nearest centroid on 6 hand features, used only when it beats hand rules on a tiny held-out split; wizard markers ignore the model. Invariant: once a class has the user's samples, that class is decided by the user's samples.
4. Missed hits (VNR-19): one fixed onset threshold for every voice and mic. The wizard knows the expected count (eight per step) and never uses it. Invariant: the wizard calibrates the onset detector to the user, the same way it calibrates latency.
5. Wizard flow (VNR-19): Next needs 3 detected hits per class; missed hits (4) block it. Exact blocked step is measured in Phase M.
6. Take ends early (VNR-18): not located; measured in Phase M.

## Design

### Pitch tracker: `src/lib/voice/swiftF0.ts` (new) + `src/workers/swift-f0.worker.ts` (new)

```ts
// src/lib/voice/pitchTrack.ts (new, pure types + helpers)
export const TRACK_SAMPLE_RATE = 16000;
export const TRACK_HOP = 256;                       // 16 ms
export const TRACK_HOP_SECONDS = TRACK_HOP / TRACK_SAMPLE_RATE;
export interface F0Track {
  /** Hz per frame; 0 where the model gives no pitch. */
  hz: Float32Array;
  /** 0..1 per frame. */
  confidence: Float32Array;
  /** dB loudness per frame, from the 22050 Hz take (RMS over the hop). */
  loudnessDb: Float32Array;
  hopSeconds: number;
}
export interface PitchTracker {
  track(samples22050: Float32Array, range?: { fminHz: number; fmaxHz: number }): Promise<F0Track>;
}
```

- `public/models/swift-f0/model.onnx` vendored (135,090 bytes, from the raw URL in the research doc) with `public/models/swift-f0/LICENSE` (MIT text, copyright line from the repo).
- Shared ORT helper `src/lib/onnx/ortSession.ts` (new): `configureOrtWasm()` (wasmPaths `/onnx-wasm/`, `numThreads = 1`) and `createWasmSession(url)` (fetch, `InferenceSession.create(Uint8Array, {executionProviders:['wasm']})`). `instrument-classifier.worker.ts` and `NeuralEnhancerWorker.ts` switch to it (their own inline setup removed; the classifier keeps its API_URL-derived wasm path by passing it as an argument).
- Worker `swift-f0.worker.ts`: lazy session, message `{id, audio16k, fmin, fmax}` -> `{id, hz, confidence}` (transferable buffers).
- `swiftF0.ts` exports `swiftF0Tracker: PitchTracker`: resamples 22050 -> 16000 with an `OfflineAudioContext` (the same mechanism as `resampleToMono22050`), posts to the worker, computes `loudnessDb` per hop from the 22050 take, returns `F0Track`. Range defaults to the model's 46.875-2093.75 Hz.

### Segmenter: `src/lib/voice/segmentNotes.ts` (new, pure)

Port of SwiftF0 `segment_notes` (exact DP, steps 1-7 of the research doc), extended with what Voice to Notes needs:

```ts
export interface SegmentSettings {
  /** SwiftF0 pitch_hold_ms: a one-semitone change must last this long to split. */
  pitchHoldMs: number;          // 80
  /** Frames below this confidence count as unvoiced. */
  voicingThreshold: number;     // 0.5
  minNoteLengthMs: number;      // 90 (kept from DEFAULT_PITCH_SETTINGS)
  minMidiNote: number;          // 21
  maxMidiNote: number;          // 108
}
export function segmentNotes(track: F0Track, s: SegmentSettings): VoiceNote[];
```

- Steps 1-7 as in music.py (beta = pitchHoldMs / 16 ms; unvoiced = -ln(c/(1-c)), c clipped 0.01..0.99, confidence below `voicingThreshold` treated as w = 0; quiet = max(0, min(L,R) - level - 3.01 dB) with L/R the loudness peaks within 64 ms each side; offpitch = w * min(|m - mu|, 2); candidates = distinct frame pitches rounded to 0.01 semitone).
- After the DP: note MIDI = floor(mu + 0.5); drop notes shorter than `minNoteLengthMs` or outside `minMidiNote..maxMidiNote`; `amplitude` = note's mean linear loudness normalised to the take's loudest note (VoiceNote needs it for volume); `pitchMidi` stays the integer note, `startTimeSeconds`/`durationSeconds` from frames.
- Complexity: candidates K (distinct cents, capped by de-duplication to at most 1 per cent of the range used) x frames T. A 60 s take is 3,750 frames; K is bounded by the voiced range (about 2,400 cents over two octaves); 9 M steps in a typed-array loop, measured in SG-5 (budget: under 50 ms for 60 s on the owner's Mac). If it exceeds the budget, candidates are quantised to 10 cents (SwiftF0 itself is 95 log steps, so 10 cents loses no model precision); decided by the measurement, recorded in this plan.

### Melody path wiring

- `PitchModelOutput` and Basic Pitch leave the voice path. A take stores `{ audio, track: F0Track }` (melody) in `useVoiceStore` instead of `output`.
- `Finetune` stops extending `PitchSettings`; it extends `SegmentSettings` (onset/frame thresholds disappear from the voice UI; knobs become Pitch Hold (ms) and Voicing). `DEFAULT_PITCH_SETTINGS` stays for `AudioToMidiModal` only.
- `shapeNotes(track, NoteShaping)` = `segmentNotes` + `transposeNotes` + `snapNotesToKey`. `previewStep(take, previous, tracker, shaping)` calls `tracker.track(window)` and `shapeNotes` (fixes root cause 2: one shaping function).
- `noteEffects.ts`: `contourFromTrack(track): TakeContour` replaces the YIN `takeContour` (voiced frames only, MIDI from Hz, same 5-point despike). `yinHz`, `spanF0Midi`, `octaveFromAudio`, `voiceGateLevel` are deleted from `voicing.ts` when no caller remains (expected: none after this phase; verified by tsc and grep in WC-8).
- `pitchNotes.ts`: the monophonic branch of `modelOutputToNotes` (gate, `toMonophonic`, octave fix) is deleted; the function keeps the polyphonic path for `AudioToMidiModal`.
- Panel prop `model` becomes `tracker: PitchTracker = swiftF0Tracker`; `useVoiceRecorder(tracker, shaping, deps)`; `voiceHandlers.ts` deps `tracker`.
- `get_voice_take` adds `track: { frames, hopSeconds, voicedFrames, medianConfidence, perNote: [{start, end, midi, meanHz, meanConfidence}] }` (no per-frame dump; per-frame arrays only with `{frames: true}` argument for one take) so measurements read the decoder input.

### Melody range (VNR-22)

- Wizard melody step records through the tracker, derives Lowest/Highest from `segmentNotes` (existing `melodyRange` on VoiceNote[]), writes `minMidiNote = lowest - 3`, `maxMidiNote = highest + 3` (unchanged rule from the shipped plan) and from them `fminHz = midiToHz(minMidiNote)`, `fmaxHz = midiToHz(maxMidiNote)` passed to every `tracker.track` call. The tracker cannot then report an octave outside the singer's range, which replaces the octave guess.

### Drums (VNR-21)

- Features v2: `hitFeatures` adds 8 log-spaced band energies (60 Hz-10 kHz) over the first 60 ms after the onset, spectral centroid, spectral flatness, and attack time; `featureVector` returns the 6 old values plus these 11 (17 values). One FFT per hit (reuse `src/lib/voice` or the repo's existing FFT helper; WD-1 searches and names it).
- Classifier: `knnClassifier(samples, k=3)` on z-scored feature vectors (z-score from the union of user and prior samples). Per class, the user's samples replace the prior for that class; classes the user did not train use the AVP prior; `classifyByRules` is deleted (no caller left: wizard markers, `samplesFromTake`, panel and handler all go through the active classifier).
- AVP prior: `tools/voice/build-avp-prior.ts` (offline, run once by the implementer, not at build time) downloads AVP_Dataset.zip into the session scratchpad, runs `detectOnsets` + `hitFeatures` v2 on each file, maps kick -> kick, snare -> snare, closed and open hat -> hat, keeps 60 samples per class spread across performers, writes `src/lib/voice/data/avpPrior.json` (about 180 x 17 numbers). Attribution: `src/lib/voice/data/AVP_NOTICE.md` (CC BY 4.0, authors, DOI). No clap prior.
- `TrainingResult` keeps the held-out report (accuracy, confusion) for the result step and `get_voice_take`; `useModel` is removed: the trained classifier always runs.
- Onset calibration: `calibrateOnsets(takes: {audio, expected: 8}[]) => OnsetSettings` (pure): searches the detector's threshold (and minimum gap) so each wizard take yields its expected count, picks the median setting across takes; stored with the training (`devilbox.voice.drumModel.v2`), used by `detectHits` everywhere. Wizard step: after a take, "Heard N of 8"; when N != 8, the step re-runs detection with the calibrated setting before asking for a retake.
- Storage: keys move to `devilbox.voice.drumSamples.v2` / `devilbox.voice.drumModel.v2`. Migration `src/lib/persistence/migrations/voiceDrumsV2.ts`: v1 samples carry 6-feature vectors without audio, so they cannot be upgraded; the migration removes the v1 keys and marks setup as needed so `shouldOpenVoiceSetup` opens the wizard once, with the message "Drum training was reset for the new detector. Please record the drum steps again."
- Wizard flow: the Next gate counts samples from the calibrated detector. Exact flow fixes are set by Phase M's measurement (which step blocked, with what count); recorded in this plan before Phase WF starts.

### Take end (VNR-18)

- Known defect fixed regardless: `voiceRecorder.stop()` drops worklet blocks still in flight. Fix: the worklet answers a `'flush'` message with `'flushed'` after its last block; `micCapture.stop()` becomes async, posts `'flush'`, awaits `'flushed'` (timeout 200 ms), then disconnects and closes. `VoiceRecorder.stop()` becomes `Promise<Float32Array>`.
- The owner's "stops before I stop" is seconds, not milliseconds, so the flush is not expected to be the whole cause. Phase M compares `seconds`, `voicedTo`, `lastNoteEnd` and the owner's stop time; the root cause and its fix are written into this plan before Phase TE starts.

### Reachability test

One test in `voiceToNotesPanel.test.tsx`: `FakeTracker` (injected via the `tracker` prop, sentinel `tracker.calls`) returns an `F0Track` built from the fake mic take: alternating two pitches (A3 220 Hz, C#4 277 Hz) for "ooo eee oooo eee oooo eeee" with a timbre change simulated as confidence dips to 0.6 and loudness dips of 2 dB inside each note (not a split per the 3.01 dB quiet rule) and a 60 ms unvoiced gap between notes. Record, Stop through the modal: pattern gets exactly 6 notes A-3, C#4, A-3, C#4, A-3, C#4 from row 0, one undo step; `tracker.calls >= 1`; the ghost preview shows the same 6 notes (proves preview and commit share `shapeNotes`). The existing panel tests switch from `SineReadingModel` to a `SineReadingTracker` (zero-crossing Hz per hop); their assertions stay unchanged.

Drum reachability: same file, existing drum test extended: wizard trains kick and snare from fake takes whose features differ, then a Stop in drum mode writes the trained classes (sentinel: the kNN classifier's call counter exported for tests).

## Checklist

Phase M - owner measurement (before any code)
- [ ] M-1 Owner reconnects Claude Code MCP (`/mcp`) so `get_voice_take` is in the tool list (the tool exists in `server/src/mcp/mcpServer.ts:1649`; this session's list predates it).
- [ ] M-2 Owner records one melody take "ooo eeee oooo eee oooo eeee" (two alternating pitches, Stop by hand) on http://localhost:5174, noting roughly how long they sang. Read with `get_voice_take`: seconds, voicedTo, lastNoteEnd, notes. Record: note count vs 6, pitches, and the take-end gap (VNR-18) in "Measurements" below.
- [ ] M-3 Owner runs the Setup wizard drum steps (kick, snare, hat, clap, eight each). Read with `get_voice_take`: hits per step, training confusion. Record: hits found per step vs 8, which step blocked Next and why, confusion matrix.
- [ ] M-4 Write the VNR-18 root cause and the wizard-flow fixes into this plan (sections "Take end" and "Drums"), turning TE-2 and WF-2 into exact items.

Phase A - SwiftF0 tracker
- [x] SA-1 Vendor `public/models/swift-f0/model.onnx` (135,090 bytes, size checked) and `LICENSE`.
- [x] SA-2 `src/lib/onnx/ortSession.ts`; `instrument-classifier.worker.ts` and `NeuralEnhancerWorker.ts` use it.
- [x] SA-3 `src/lib/voice/pitchTrack.ts` types and constants; `src/workers/swift-f0.worker.ts`; `src/lib/voice/swiftF0.ts` (`swiftF0Tracker`, resample, loudness).
- [x] SA-4 Browser check through MCP: `evaluate_script` runs `swiftF0Tracker.track` on a 220 Hz sine (2 s); median Hz within 1 % of 220, confidence > 0.9; time per 1.5 s window recorded (budget under 40 ms so the 250 ms live hop holds).
  - Done 2026-10-17, real Chrome: median 219.02 Hz (0.45 % low), median confidence 0.962 (min 0.959), loudness -9.03 dB for a 0.5 sine; first call 1217 ms including model load; 1.5 s window 24-32 ms.
  - SA-3 deviations: loudness is computed from the 16 kHz audio inside the worker, the same as core.py; resampling to 16 kHz uses `resampleTo16k` from `CedMelSpectrogram.ts` in the worker (reuse, no second resampler). deploy.yml fetches model.onnx and LICENSE pinned to swift-f0 commit d1ba77f and checks 135,090 bytes.

Phase B - segmenter
- [ ] SG-1 `src/lib/voice/segmentNotes.ts` per design.
- [ ] SG-2 Parity fixture: run SwiftF0 Python (`pip install swift-f0` in the scratchpad venv) on two WAVs synthesised by a script (alternating 220/277 Hz with vowel-like harmonic swap; a glide), save `{track, notes}` JSON to `src/lib/voice/__tests__/fixtures/swiftf0-parity/`; test asserts our DP returns the same note boundaries (frame-exact) and MIDI numbers.
- [ ] SG-3 Unit tests: vowel change at one pitch is one note; a one-semitone step held 64 ms does not split, held 96 ms does; a 60 ms unvoiced gap splits same-pitch notes; quiet dip under 3.01 dB does not split; range and min length filters.
- [ ] SG-4 `amplitude` from loudness; test: louder note has higher amplitude.
- [ ] SG-5 Timing: 60 s synthetic track under 50 ms in vitest (measured, number recorded here); 10-cent candidate quantisation only if over budget.

Phase C - melody wiring
- [ ] WC-1 `useVoiceStore`: take holds `track`; `Finetune extends SegmentSettings`; defaults.
- [ ] WC-2 `shapeNotes(track, shaping)`; `commitVoiceNotes` unchanged downstream.
- [ ] WC-3 `liveWindow.previewStep` uses the tracker and `shapeNotes`; `useVoiceRecorder(tracker, ...)`.
- [ ] WC-4 Panel: `tracker` prop, full-take `tracker.track`, knobs Pitch Hold and Voicing replace Onset/Frame (Knob, `size="sm"`, full-English labels).
- [ ] WC-5 `noteEffects.contourFromTrack`; panel and handler use it; `noteEffects.test.ts` builds contours from tracks.
- [ ] WC-6 `voiceHandlers.ts`: `voice_to_notes` and `get_voice_take` on the tracker; `get_voice_take` track summary (+ `frames: true` option); server tool description updated.
- [ ] WC-7 `pitchNotes.ts`: monophonic branch removed; `AudioToMidiModal` unchanged and its tests green.
- [ ] WC-8 Delete unused `voicing.ts` exports (verified from tsc unused-export errors and a grep of callers), `basicPitchModel` no longer imported under `src/lib/voice` except by `AudioToMidiModal`'s path.

Phase D - melody range (VNR-22)
- [ ] MR-1 Wizard melody step on the tracker; range writes `minMidiNote`/`maxMidiNote`.
- [ ] MR-2 `fminHz`/`fmaxHz` from the range passed to every `tracker.track` call (panel, live, handler).
- [ ] MR-3 Test: a take sung an octave below the range's middle with a tracker that reports both octaves returns the in-range octave.

Phase E - drums
- [ ] WD-1 Features v2 in `drumHits.ts` (reuse the repo's FFT helper; name it here); `featureVector` 17 values; unit test per feature on synthetic clicks/noise bursts.
- [ ] WD-2 `tools/voice/build-avp-prior.ts`; generated `avpPrior.json` + `AVP_NOTICE.md`; prior class balance printed and recorded here.
- [ ] WD-3 `knnClassifier`; user samples replace the prior per class; `classifyByRules` and `useModel` deleted; all callers on the active classifier.
- [ ] WD-4 `calibrateOnsets` + storage v2 + migration `voiceDrumsV2.ts` (unit test: v1 keys removed, setup flagged).
- [ ] WD-5 Wizard: markers and counts from the calibrated detector and active classifier; "Heard N of 8".
- [ ] WD-6 Unit tests: kNN on separable synthetic features 100 %; prior used for an untrained class; calibration finds 8 of 8 on a quiet synthetic take where the default finds fewer.

Phase WF - wizard flow
- [ ] WF-1 Next gate counts calibrated-detector samples.
- [ ] WF-2 Fixes from M-3 (written in at M-4).
- [ ] WF-3 Wizard test covers the blocked-step case measured in M-3.

Phase TE - take end (VNR-18)
- [ ] TE-1 Worklet flush handshake; async `stop()` through `micCapture`, `VoiceRecorder`, `useVoiceRecorder`, panel; test: blocks posted after stop is called are in the take.
- [ ] TE-2 Root-cause fix from M-2 (written in at M-4), with a regression test.

Phase R - reachability and validation
- [ ] VR-1 Reachability test per design (FakeTracker, 6 notes, preview equals pattern, sentinel); drum reachability with the kNN sentinel.
- [ ] VR-2 `npm run type-check` clean.
- [ ] VR-3 Affected tests only: `npx vitest run src/lib/voice src/stores/__tests__/useVoiceStore.test.ts src/components/tracker/__tests__/voiceToNotesPanel.test.tsx src/bridge/handlers/__tests__/voiceToNotesHandler.test.ts src/components/instruments` (no full suite).
- [ ] VR-4 Owner re-records the M-2 phrase and the M-3 wizard session; `get_voice_take` numbers recorded next to the Phase M numbers (note count, pitches, take-end gap, hits per step, held-out accuracy).
- [ ] VR-5 Commit by path per phase; one push at the end; tick VNR-17..22, VNR-25 in `thoughts/spot/todos.md`; handoff updated.

## Measurements

(Filled in at Phase M and VR-4. Drum rows: wizard session not recorded yet; stored training is older: kick 6, snare 1, hat 0, clap 0 samples, rules confusion kick: 3 kick, 3 snare.)

| What | Before (Basic Pitch, rules) | After |
|------|------------------------------|-------|
| ooo/eee take: notes found (expected 6) | 11 (take 1, 2026-10-17 17:38, 5.60 s). Envelope shows 6 sung phrases: 0.2-0.65, 0.8-1.25, 1.5-1.95, 2.1-2.6, 2.8-3.25, 3.4-3.9 s, dips -33 to -43 dB between them. Phrases 1, 2 and 5 split into 3, 3 and 2 notes; every extra note is 104-174 ms and 1 semitone from its neighbour. | |
| ooo/eee take: wrong pitches | Phrase pitches (majority) E-3 52, F-3 53, E-3, F-3, E-3, F-3: alternation is right if the owner sang a semitone apart (owner to confirm the interval). Extras are 51 and 52/53 neighbours, the "extra wrong notes" of VNR-17. | |
| Take end gap: owner stop vs `seconds` vs `lastNoteEnd` | Not reproduced: take is 5.60 s, singing ends 3.9 s, lastNoteEnd 3.949, 1.6 s of silence recorded after the last note. The take holds the whole performance this time; VNR-18 needs a take where the owner sees it happen. | |
| Wizard hits found per step (expected 8) | | |
| Wizard held-out accuracy / confusion | | |

## Verification

Automated (per phase, affected only): `npm run type-check`; the vitest paths in VR-3; SA-4 and SG-5 timing numbers.
Manual (owner, LOCAL http://localhost:5174, hard reload, click once): M-2, M-3 before; VR-4 after.

## Success criteria per phase

- A: tracker returns 220 Hz +/- 1 % on a sine in real Chrome; window time under 40 ms.
- B: parity with SwiftF0 Python frame-exact on both fixtures; SG-3 cases pass; 60 s under 50 ms.
- C: no Basic Pitch call on the voice path (sentinel: `basicPitchModel` not imported by any voice module); preview and pattern identical in VR-1.
- D: out-of-range octave never returned (MR-3).
- E: kNN 100 % on separable synthetic set; calibration 8 of 8 on the quiet take.
- R: owner take gives 6 notes with the two right pitches; wizard steps each hear 8 of 8; held-out accuracy at least 90 % on the owner's session; take end within 0.1 s of the owner's stop.

## Out of scope

- Basic Pitch in `AudioToMidiModal` (stays as is).
- Phoneme-aware splitting (same pitch, different syllable, no gap): the DP keeps it as one note, which is the asked behaviour for "ooo eee".
- Training a neural drum model; the kNN plus AVP prior is the chosen classifier.
