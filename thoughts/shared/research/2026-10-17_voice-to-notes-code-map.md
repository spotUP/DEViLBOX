# Voice to Notes code map (2026-10-17)

Research only, no code changed. Describes what IS. Looked at: src/components/tracker/{VoiceToNotesPanel,VoiceSetupWizard,TrackerView,EditorControlsBar}.tsx, src/lib/voice/*, src/hooks/audio/useVoiceRecorder.ts, src/stores/useVoicePreviewStore.ts, src/bridge/{MCPBridge.ts,handlers/voiceHandlers.ts}, server/src/mcp/mcpServer.ts, the two test files named below. Not read in full: basicPitchModel.ts, liveWindow.ts, drumSynth.ts, the lib/voice tests.

## 1. VoiceToNotesPanel.tsx (582 lines)

Exports: `VoiceToNotesPanelProps` (line 60: `onClose`, test seam `model?: PitchModel`, test seam `deps?: VoiceRecorderDeps`) and `VoiceToNotesPanel` (131). Local, not exported: `Finetune` (70, extends PitchSettings with transpose, swing, minLengthRows, latencyNudgeMs, keySnapOn, keyTonic, keyScale), `DEFAULT_FINETUNE` (82), `COUNT_IN_BEATS = 4` (94), `VoiceMode = 'melody'|'drums'` (96), `DRUM_NOTE_OPTIONS` (101, MIDI 24..84), `NoteRoll` SVG component (106).

### useState (lines 136-155, 190, 193)
- `fine` Finetune (136): all knobs, Snap to key. Data that shapes output; plain component state today.
- `mode` (137): UI only (which view).
- `hits` DrumHit[] (138): DATA of the current drum take (classified hits). No raw audio kept.
- `trainClass` (139): UI only (training select).
- `trainingTake` DrumClass|null (140): UI/session flag, "this recording is a labelled training take".
- `samples` TrainingSample[] (141): DATA, initial from loadSamples(); persisted by saveSamples in handleStop.
- `training` TrainingResult|null (142): DATA, initial from loadTrainingResult().
- `drumMap` (143): DATA, initial defaultDrumMap(instruments); replaced by commit's playable map.
- `deviceId` (144): UI/preference, not persisted.
- `channelIndex` (145): target, init from cursor.
- `startRow` (146): target, set at record start and on take reuse.
- `output` PitchModelOutput|null (147): DATA, model output of the melody take.
- `analysing` (148): UI.  `takeSeconds` (149): data about take.
- `calibratedMs` (150): DATA mirrored from localStorage (getStoredLatencyMs).  `calibrating` (151): UI.
- `takes` (152): mirror of module-level takeHistory (listTakes).  `activeTakeId` (153): UI.
- `levelCheck` (154): UI flag, "this recording is a level test, discard".
- `wizardOpen` (155): UI, init shouldOpenVoiceSetup().
- `pending` (190): derived-ish flag, set true by an effect on any of output/hits/fine/quantise/channelIndex/startRow/mode (191), false after commit.
- `autoCommit` (193): one-shot flag set when a take ends (a05cc9fc4).
No useRef in the panel (the recorder hook holds the refs). useMemo: `quantise` (180), `finalNotes` (196), `preview` (349).

### Store reads
useTransportStore bpm/speed (158-159); useTrackerStore channelCount, rowCount of current pattern (160-161); useInstrumentStore instruments, currentInstrumentId, setCurrentInstrument (162-167); `instrumentId = currentTargetInstrument(...)` (166). useVoicePreviewStore.setPreview written by effects at 359-360 (preview cleared on unmount).

### Handlers
- `patch` (176): setFine one key.
- `handleRecord` (206): clear output/hits, startRow = cursor row, `recorder.start({deviceId, countInBeats: 4, beatSeconds: 60/bpm, livePreview: !drums})`.
- `handleRecordTraining(drum)` (219): sets trainingTake, `recorder.start` with countIn 0, livePreview false.
- `handleCheckLevel` (225): levelCheck=true, recorder.start countIn 0.
- `handleCloseWizard` (230): markVoiceSetupSeen, close.
- `handleTrain(all)` (235): trainAndEvaluate, setTraining, saveTrainingResult.
- `handleClearTraining` (241): clearTraining, reset samples/training.
- `handleStop` (247): `recorder.stop()` returns the Float32Array take. Branches: level check (discard); labelled training (samplesFromTake, saveSamples, handleTrain; warns "No hit heard"); drums (detectHits with modelClassifier(training.model) if training.useModel else classifyByRules; setAutoCommit); melody (model.evaluate(take), addTake, listTakes, setAutoCommit; notify.error on failure). The raw take is a local variable and is dropped after this function (see 4).
- `handleCommit` (289): drums -> `commitDrumHits(hits, drumMap, quantise, target)` then setDrumMap(result.drumMap); melody -> `commitVoiceNotes(finalNotes, quantise, target)` then setInstrumentId(result.instrumentId). Warns when null, setPending(false), notify.success.
- Auto-commit effect (305-312): when autoCommit && pending && !analysing, calls handleCommit if there are hits/notes.
- `handleCalibrate` (319): backend.getStream, `measureLoopbackLatencyMs(backend.createCapture(stream))`, storeLatencyMs, setCalibratedMs.
- `handleUseTake(take)` (338): reload an earlier take's output.
Inline: Mode/Mic/Channel/Instrument selects; per-class instrument and note selects updating drumMap (457-470); Record/Stop buttons; Clear training; Commit button (571).

### Children rendered
`Button`, `Knob` (swing, latency in drums; Onset, Sustain, Min Length, Lowest, Highest, Transpose, Swing, Min Rows, Latency in melody; props label/value/min/max/step/onChange/size, some unit/bipolar/title), `Toggle` ("Snap to key"), `CustomSelect`, `NoteRoll {notes, seconds}`, `VoiceLevelMeter {level}` (imported from VoiceSetupWizard), `VoiceSetupWizard` (393-407, props listed in 2). Root is `<aside data-testid="voice-to-notes-panel" class="w-72 ...">` (376): a fixed 288 px side column.

Store/hook candidates: samples/training/drumMap/hits/output/takeSeconds/fine/channelIndex/startRow/calibratedMs and the record-intent flags (trainingTake, levelCheck) are data or session state living in the component; mode, trainClass, wizardOpen, analysing, calibrating, deviceId, activeTakeId, pending are UI only. Only the ghost preview already goes through a store.

## 2. VoiceSetupWizard.tsx (193 lines)

Exports `VoiceLevelMeter {level}` (line 22) and `VoiceSetupWizard`; `VoiceSetupWizardProps` (45): isOpen, onClose, level, recording, trainingTake, error, onCheckLevel, onStop, calibratedMs, calibrating, onCalibrate, samples, training, onRecordTraining. Only state: `stepIndex` (useState, ~line 81). It owns no recording logic: all handlers are the panel's.
Steps (STEPS, 33): `microphone` (hint, level meter, Test microphone / Stop test -> onCheckLevel / onStop), `latency` (Calibrate latency button -> onCalibrate, shows `{calibratedMs} ms measured`, testid voice-setup-latency), `drums` (per DRUM_CLASSES row: label, `countsByClass(samples)`, Record -> onRecordTraining(drum) or Stop when trainingTake===drum; meter while recording; hint cites MIN_SAMPLES_PER_CLASS), `result` (latency, `describeTraining(training)`, testid voice-setup-result). Testids `voice-setup-step-<step>`, `voice-setup-train-<drum>`.
Chrome: `Modal size="md" closeOnEnter={false}`, ModalHeader "Voice to Notes setup" with "Step n of 4", ModalFooter Back / Next / Finish. Back/Next/close stop an active recording via onStop and reset stepIndex on close.
Opened from the panel only: `wizardOpen` initial value `shouldOpenVoiceSetup()` (first use, localStorage SETUP_SEEN_KEY) and the Wand2 "Setup wizard" button (385). Closed through `handleCloseWizard` -> `markVoiceSetupSeen`.
Note: drum training is a single step with all four classes at once; "Skip this step" is only text. No per-class progress gating, no accuracy preview besides the result line.

## 3. Entry chain

User: toolbar button "Voice" with Mic icon in `EditorControlsBar.tsx:365-375` (props `showVoicePanel`, `onToggleVoicePanel`, lines 58-59, 74-75; title "Record your voice and turn it into notes") -> `TrackerView.tsx:228` `const [voicePanelOpen, setVoicePanelOpen] = useState(false)`; toggle passed at 478-479; renders `{voicePanelOpen && <VoiceToNotesPanel onClose={() => setVoicePanelOpen(false)} />}` at 547 (side column beside the grid). No menu item, command or keyboard shortcut found (grep of src for VoiceToNotes, voice_to_notes, showVoicePanel found only these files).
MCP `voice_to_notes` does NOT open the panel. Chain: `server/src/mcp/mcpServer.ts:1623` tool (params path/url/channel/row/instrumentId/transpose/keyTonic/keyScale/mode/drumMap; reads `path` and base64s it, 1641) -> `callBrowser('voice_to_notes')` -> `src/bridge/MCPBridge.ts:437` `voice_to_notes: (p) => voiceToNotes(p)` (import 203) -> `src/bridge/handlers/voiceHandlers.ts:51` `voiceToNotes(params, deps)`: decodes to 22050 Hz mono, then drums: `defaultDrumMap`, per-class override, `detectHits(samples, loadActiveClassifier())`, `commitDrumHits`; melody: `deps.model.evaluate`, `shapeNotes`, `commitVoiceNotes`. It duplicates a small part of the panel's pipeline and uses quantise swing 0, `getStoredLatencyMs('')`. `get_voice_state` (MCPBridge 414) is unrelated (voice allocation).

## 4. Voice lib (src/lib/voice, src/hooks/audio)

- `hooks/audio/useVoiceRecorder.ts`: `useVoiceRecorder(model, pitchSettings, deps)` (37) returns `{phase, level, error, devices, liveNotes, start, stop, refreshDevices}` (123); `stop(): Float32Array | null` (107) "22050 Hz mono". `StartOptions` (28): deviceId, countInBeats, beatSeconds, onTakeStart, livePreview. `RecorderPhase` 'idle'|'countIn'|'recording' (14). `VoiceRecorderDeps` (16): getStream, createCapture, listDevices; `defaultVoiceRecorderDeps` (22).
- `voiceRecorder.ts`: class `VoiceRecorder` (40), accumulates `blocks: Float32Array[]`; `snapshot()` (~87 in hook use) and `stop()` return `concatBlocks` (28). So the full raw take IS available as Float32Array at stop, and in the hook it is only returned once to the caller; nothing stores it. `micCapture.ts`: `getMicStream` (8), `createMicCapture` (20).
- `drumHits.ts`: `DRUM_CLASSES = ['kick','snare','hat','clap']` (13), `DrumClass`, `DRUM_CLASS_LABELS` (16), `HitFeatures` (23: low, mid, high, decay, zcr, bursts), `DrumHit` (36: timeSeconds, drum, strength, features), `HitClassifier` (45), `detectOnsets` (83), `hitFeatures(samples, onsetSample, sr)` (157), `classifyByRules` (208), `featureVector` (216), `detectHits(samples, classify = classifyByRules, sampleRate)` (221).
- `drumModel.ts`: `TrainingSample {drum, features}` (18) (features only, no audio), `DrumModel {mean, std, centroids}` (23), `MIN_SAMPLES_PER_CLASS = 3` (30), `trainModel` (38), `classifyWithModel` (63), `modelClassifier` (79), `splitSamples` (84), `accuracy` (96), `countsByClass` (101), `TrainingResult {model, modelAccuracy, rulesAccuracy, heldOut, useModel}` (107), `trainAndEvaluate(samples)` (117, null until 2 classes have 3 samples), `describeTraining` (136), keys `devilbox.voice.drumSamples.v1`/`drumModel.v1` (147-148), `loadSamples` (150), `saveSamples` (161), `loadTrainingResult` (169), `saveTrainingResult` (180), `clearTraining` (189), `loadActiveClassifier` (195), `samplesFromTake(take, drum)` (201: every detected hit in the take is labelled `drum`).
- `drumToNotes.ts`: `DrumTarget {instrumentId, midi}`, `DrumMap` (15-21), `DEFAULT_DRUM_NOTES` (24), `NEW_808_INSTRUMENT = 0` (37), `defaultDrumMap` (46), `quantiseHits` (63), `usedDrumClasses` (81), `commitDrumHits(hits, map, quantise, target)` (90).
- Melody: `pitchNotes.ts` (`VoiceNote` 20, `PitchModelOutput` 28, `PitchSettings` 40, `DEFAULT_PITCH_SETTINGS` 54, `toMonophonic` 71, `mergeSplitNotes` 89, `modelOutputToNotes` 118, `transposeNotes` 153, `PITCH_SAMPLE_RATE` 18); `basicPitchModel.ts` (`basicPitchModel`, `PitchModel`); `voiceToNotes.ts` (`NoteShaping` 21, `shapeNotes` 29, `commitVoiceNotes` 39); `quantise.ts` (`QuantiseSettings` 8, `QuantisedNote` 23, `rowSeconds` 36, `quantiseNotes` 60); `scaleSnap.ts` (`SCALES`, `ScaleName`, `TONIC_NAMES`, `snapMidiToKey` 38, `snapNotesToKey` 48); `voicing.ts` (`voiceGateLevel` 45, `spanRms` 53, `yinHz` 59, `spanF0Midi` 100, `octaveFromAudio` 128); `liveWindow.ts` (`previewStep`, `LIVE_HOP_SECONDS`, live preview used by the hook); `writeToPattern.ts` (`takeCells` 55, `applyNotesToPattern` 76, `writeNotesToPattern` 95, `NOTE_OFF` 16, `WriteTarget` 18, `WriteResult` 30); `takePreview.ts` (`melodyPreview` 23, `drumPreview` 33); `takeHistory.ts` (`Take {id, output, seconds, recordedAt}` 10, `MAX_TAKES = 8`, `listTakes` 21, `addTake` 25, `clearTakes` 31; module-level array, melody only, stores model output not audio).
- `latencyCalibration.ts`: `getStoredLatencyMs` 48, `hasStoredLatency` 54, `shouldOpenVoiceSetup` 61, `markVoiceSetupSeen` 70, `storeLatencyMs` 78, `measureLoopbackLatencyMs` 96, `detectClickOnset` 20, keys at 12 and 58.
- Others present: `drumSynth.ts` (test helpers `synthHit`, `synthTake`), `micCapture.ts`, `scaleSnap.ts`.

## 5. Stores/hooks for voice

Only `src/stores/useVoicePreviewStore.ts` (zustand: `preview`, `setPreview`; holds ghost-note snapshot) and `src/hooks/audio/useVoiceRecorder.ts`. No voice store for takes, training, settings or wizard state; that all lives in the panel and module-level singletons (takeHistory) and localStorage (drumModel, latencyCalibration).

## 6. Tests

`src/components/tracker/__tests__/voiceToNotesPanel.test.tsx`: mocks nothing with vi.mock; uses seams `model` (SineReadingModel counting `calls`, derives pitch from zero crossings) and `deps` (`fakeMic()` capture whose `feed()` pushes synthetic audio; getStream returns `{}`), with real stores (resetStore on tracker, instrument), `synthTake`/`synthHit` from drumSynth. Drives the real `<VoiceToNotesPanel>` through clicks (Record, Stop, Mode select) then asserts the tracker pattern cells. Sentinels: `model.calls` (0 for drums), undo stack length +1 with description "Voice to Notes", written rows/notes/instrument ids, `tr808Voices()` list, testids `drum-map-<drum>`, `voice-ghost-note`, `voice-calibrated-latency`, `drum-training-status`, `voice-setup-*`. Tests (line): 127 Record then Stop puts the sung notes on the grid as one undo step, without a Commit click; 197 Snap to key (C# to C); 208 Calibrate latency 100 ms loopback moves notes one row earlier; 248 writes with the song's current instrument after the mount-time one is deleted; 272 keeps earlier takes and re-commits one; 278 a take lands on the grid when it ends and Commit re-writes after a change; 292 Drums mode kick+snare end as TR-808 cells as one undo step without pitch model; 331 trained model (kick sound called snare) replaces rules; 376 beatbox into a playable current instrument adds TR-808 voices; 414 wizard opens on first use and walks mic, latency, drum training, result; 472 stays closed once seen and opens from the Setup wizard button. (Ghost-preview and a few others may exist between these; I only listed `it(` lines, the grep showed 11.)
`src/bridge/handlers/__tests__/voiceToNotesHandler.test.ts`: 52 writes detected note at cursor, snapped, one undo step; 65 raw pitch without key / url via fetcher / no source is error; 73 drums mode detects kick and snare, no pitch model.
`src/lib/voice/__tests__/`: drumHits, drumModel, drumToNotes, voiceCore, voiceInstruments test files (names not enumerated).

## 7. 808 mapping (66c198764) and auto-land (a05cc9fc4), keep in the rework

- `drumToNotes.ts`: `defaultDrumMap` (46, never the current instrument; 808 voice if present, else name hint, else `NEW_808_INSTRUMENT`), `commitDrumHits` (90, calls `playableDrumMap` then writes).
- `voiceInstruments.ts`: `DRUM_808_VOICE` (22), `DRUM_808_MIDI = 60` (30), `isPlayable` (35), `drum808Instrument(drum)` (80, find or create the TR808 instrument), `silentDrumClasses` (95), `drumMapAsWritten` (103, used by the preview), `playableDrumMap` (113), plus d799e0d9a `currentTargetInstrument` (65) and `playableMelodyInstrument` (71, Voice Lead). Panel uses `NEW_808_INSTRUMENT` option label "TR-808 <Drum> (added on commit)" (`drumInstrumentOptions`, panel 376-ish) and `setDrumMap(result.drumMap)` after commit.
- Auto-land: panel state `autoCommit` (193), set in `handleStop` for drums and melody, consumed by the effect at ~305-312 that waits for `pending` and `!analysing` then calls `handleCommit`.

## Open questions
- Whether other places (command registry, shortcuts file, menu config) open the panel was only checked by grepping src for VoiceToNotes/showVoicePanel; no hit found, unverified for string-keyed command ids.
- No raw take is retained anywhere after `handleStop`; confirm that is wanted before a wizard that replays or re-trains from audio. TrainingSample stores features only.
- `basicPitchModel.ts`, `liveWindow.ts`, and the lib tests were not read.
- Line numbers for a few panel items (drumInstrumentOptions, auto-commit effect, wizard stepIndex) are approximate (+-3).
