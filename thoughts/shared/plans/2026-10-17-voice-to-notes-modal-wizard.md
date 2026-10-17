---
date: 2026-10-17
topic: Voice to Notes modal, training wizard, effect commands, forgiving quantise
status: in progress
ledger: thoughts/spot/todos.md VNR-12, VNR-13, VNR-14, VNR-15
research:
  - thoughts/shared/research/2026-10-17_voice-modal-building-blocks.md
  - thoughts/shared/research/2026-10-17_voice-to-notes-code-map.md
---

# Voice to Notes: maximised modal, voice-training wizard, effects, forgiving quantise

## Owner asks (verbatim)

- VNR-12: "the recording training take really needs to be improved we need audio waveforms drawing etc and the whole audio to note stuff needs to open in a modal"
- VNR-13: "the training needs to be a wizard that teaches devilbox to recognize the users voice"
- VNR-14: "the voice to note needs to be greatly enhanced with support for all the tracker effect commands"
- VNR-15: "it needs better quantizing for sloppy humans like me who cant keep it tight when humming"

## What exists (file:line)

- Panel: `src/components/tracker/VoiceToNotesPanel.tsx` (582 lines). An `<aside data-testid="voice-to-notes-panel" class="w-72 ...">` side panel. All state is `useState` inside it: `fine` (Finetune = PitchSettings + transpose/swing/minLengthRows/latencyNudgeMs/keySnap*), mode, hits, trainClass, trainingTake, samples, training, drumMap, deviceId, channelIndex, startRow, output, analysing, takeSeconds, calibratedMs, calibrating, takes, activeTakeId, levelCheck, wizardOpen, pending, autoCommit. `handleStop` (line 247) gets the raw `Float32Array` from `recorder.stop()` and drops it after analysis (melody keeps it inside `PitchModelOutput.audio`, drums keep nothing). `handleCommit` (line 288) calls `commitDrumHits` / `commitVoiceNotes`.
- Entry chain: `EditorControlsBar.tsx:363-376` inline `<button>` "Voice" (Mic icon) toggles `TrackerView.tsx:228 voicePanelOpen`; `TrackerView.tsx:547` renders the panel. No store involvement.
- Wizard: `src/components/tracker/VoiceSetupWizard.tsx`, STEPS `['microphone','latency','drums','result']`, `Modal size="md"`, testids `voice-setup-step-<step>`, `voice-setup-train-<drum>`, `voice-setup-latency`, `voice-setup-result`; props level/recording/trainingTake/error/onCheckLevel/onStop/calibratedMs/calibrating/onCalibrate/samples/training/onRecordTraining. Exports `VoiceLevelMeter`.
- Recorder: `src/hooks/audio/useVoiceRecorder.ts:37` `useVoiceRecorder(model, pitchSettings, deps)`; `stop()` returns the 22050 Hz mono take once.
- Voice lib (`src/lib/voice/`): `pitchNotes.ts` (`PitchModelOutput {frames,onsets,contours,audio?}`, `VoiceNote`, `PitchSettings`), `quantise.ts` (`QuantiseSettings {bpm,speed,swing,minLengthRows,latencyNudgeMs}`, `rowSeconds`, private `rowTime`/`nearestRow`, `quantiseNotes` -> `QuantisedNote {row,lengthRows,midi,velocity,instrumentId?,noteOff?}`), `writeToPattern.ts` (`TakeCell {note,instrument,volume}`, `takeCells`, `applyNotesToPattern`, `writeNotesToPattern` via `useTrackerStore.bulkBlockEdit('Voice to Notes')`, `velocityToVolume`), `drumHits.ts` (`DRUM_CLASSES`, `DrumHit {timeSeconds,drum,strength,features}`, `detectHits`, `classifyByRules`), `drumModel.ts` (features-only `TrainingSample`, `samplesFromTake`, `trainAndEvaluate`, localStorage persistence), `drumToNotes.ts` (`DrumMap`, `quantiseHits`, `commitDrumHits`), `voicing.ts` (`yinHz(audio,start,sr)`, `spanF0Midi`, `spanRms`), `scaleSnap.ts`, `voiceToNotes.ts` (`shapeNotes`, `commitVoiceNotes`), `takeHistory.ts` (module-level `Take {id,output,seconds,recordedAt}`, MAX_TAKES 8), `latencyCalibration.ts`.
- Only voice store: `src/stores/useVoicePreviewStore.ts` (live preview notes).
- Waveform: `src/utils/audio/drawSampleWaveform.ts` `drawSampleWaveform(ctx, width, height, opts: WaveformDrawOptions)`; takes an `AudioBuffer`, draws `slices [{id,startFrame,endFrame,confidence?}]` as markers, `playbackPosition`, `viewStart/viewEnd`. Colours: CSS vars `--color-bg`, `--color-bg-secondary`, `--color-border`, `--color-text-muted`, `--color-text-subtle`, `--color-accent-primary` (fallback `#10b981`); `COLORS.waveform` is a hardcoded `#ef4444`. `src/index.css:53` defines `--color-accent` only; `--color-accent-primary` is referenced in index.css (494, 869) but never defined, so the fallback is what renders today.
- Modal: `src/components/ui/Modal.tsx` sizes `sm|md|lg|xl|2xl|fullscreen`; the container is `flex flex-col outline-none`, non-fullscreen adds `max-h-[90vh] overflow-hidden`; no body wrapper, the caller supplies `flex-1 min-h-0 overflow-auto`. `ModalHeader {title,subtitle,icon,onClose}`, `ModalFooter {align}`. Renders `role="dialog"` (line 257).
- Effects: `TrackerCell` (`src/types/tracker.ts:72`) has `effTyp/eff`, `effTyp2/eff2`, optional 3..8. Notation per channel: `src/lib/tracker/effectNotation.ts` `effectNotationOf(meta)` -> `'tracker'` (FT2 one-glyph ids, 0x00-0x23) or `'furnace'` (two hex digits). Format caps: `src/lib/import/formatConstraints.ts` `getFormatConstraints(format).maxEffectCols` (MOD/S3M/OKT/DIGI/YM/SAP/AY = 1, the rest 2); `supportedEffects` is `null` for every format (nothing restricts the effect id set). FT2 effect ids used by the engine: 0 arpeggio, 1 porta up, 2 porta down, 3 tone porta, 4 vibrato, 0xA volume slide, 0xC set volume, 0xE extended (E9x retrigger, EDx note delay), 0x1B (R) multi retrigger. Furnace: 00 arpeggio, 01/02 slide, 03 tone porta, 04 vibrato, 0A volume slide, 0C retrigger, ED note delay. `useTrackerStore` reads the song format from `song.patterns[0]?.importMetadata?.sourceFormat`.
- Tests: `src/components/tracker/__tests__/voiceToNotesPanel.test.tsx` renders `<VoiceToNotesPanel onClose model deps />` with real stores, `SineReadingModel` and `fakeMic()`; `src/bridge/handlers/__tests__/voiceToNotesHandler.test.ts` covers the MCP `voice_to_notes` handler.

## Problem

1. The panel is 288 px wide. A take is a blind recording: no waveform, no hit markers, no way to see why a hit was missed (VNR-16 showed the owner could not tell a quiet take from a broken detector).
2. Training is three buttons in a side panel. The wizard has one combined "drums" step and no melody step, so it never learns the singer's range or confirms each class was heard.
3. The writer knows only note, instrument and volume. Glides, wobble, fast alternation and flams in the take are thrown away.
4. Quantise is all-or-nothing nearest-row snapping. A late hum lands on the next row with no way to soften it, and the owner never sees how far off each note was.
5. The raw drum take is not kept anywhere, so nothing can draw it or re-analyse it after a knob change.

## Levels

- Data: the raw take and everything derived from it must live in one store (root cause of 1, 2, 5).
- Algorithm: quantise strength/tolerance, effect detection from pitch and loudness contours (3, 4).
- Presentation: fullscreen Modal, waveform canvas, wizard steps, timing table (1, 2, 4).

## Design

### Store: `src/stores/useVoiceStore.ts` (new, zustand)

Single source of truth for take, analysis, training and settings. The modal and the wizard only render it.

```ts
export interface VoiceTake { id: number; audio: Float32Array; sampleRate: 22050; seconds: number; recordedAt: number; }
export interface VoiceState {
  mode: 'melody' | 'drums';
  fine: Finetune;                      // moved from the panel, plus quantise strength/tolerance and effects toggles
  take: VoiceTake | null;              // the take on screen
  takes: VoiceTake[];                  // newest first, MAX_TAKES 8 (replaces takeHistory.ts)
  output: PitchModelOutput | null;     // melody analysis of `take`
  hits: DrumHit[];                     // drum analysis of `take`
  samples: TrainingSample[]; training: TrainingResult | null;   // persisted via drumModel.ts as today
  drumMap: DrumMap; deviceId: string; channelIndex: number; startRow: number; instrumentId: number;
  calibratedMs: number;
  setMode, patchFine, setTake(take), useTake(id), setOutput, setHits, setSamples, setTraining, setDrumMap, ...
}
```

`takeHistory.ts` is deleted; its `MAX_TAKES` moves to the store. `Take.output` is no longer stored: the output is recomputed from the take's audio on `useTake` (the model call is async and already shows the "Analysing" state).

### Modal: `VoiceToNotesPanel.tsx` becomes a fullscreen `Modal`

Same component name and file (the entry chain and tests keep their names); new prop `isOpen`. Root: `<Modal isOpen size="fullscreen" closeOnEnter={false} className="..." >` with `<ModalHeader title="Voice to Notes" icon={<Mic/>} onClose>`, body `<div className="flex-1 min-h-0 flex gap-2 p-2">`:

- Left column (`w-80 shrink-0 overflow-y-auto`): Mode, Microphone, Target channel, Instrument, drum map, Finetune knobs, Key, Quantise (Strength, Tolerance, Swing, Latency), Effects toggles (Volume, Slides, Vibrato, Arpeggio, Flams).
- Centre (`flex-1 min-w-0 flex flex-col gap-2`): `VoiceTakeWaveform` (canvas, fills the width, 160 px tall), then `NoteRoll` (melody) or hit list (drums), then the timing table (`data-testid="voice-timing"`): one row per note or hit, columns Row, Heard (ms), Written (ms), Off by (ms, signed, negative = early), Effect (the effect cell text, e.g. `ED2`).
- Right column (`w-56`): takes list, training status, "Setup wizard" button, "Calibrate latency".
- `ModalFooter align="between"`: left Record/Stop + phase + `VoiceLevelMeter`; right Commit (primary) and Close (ghost).

`data-testid="voice-to-notes-panel"` moves to the modal body wrapper so every existing test query still resolves. `TrackerView.tsx:547` renders `<VoiceToNotesPanel isOpen={voicePanelOpen} onClose=...>` always (the Modal returns null when closed) and the aside slot is removed. `EditorControlsBar.tsx:363-376` keeps its button (it is the toolbar's own button style, shared with its siblings; not in scope).

### Waveform: `src/components/tracker/VoiceTakeWaveform.tsx` (new)

Props `{ audio: Float32Array | null; sampleRate: number; markers: WaveformMarker[]; rows?: { rowSeconds: number; swing: number }; playhead?: number }` with `WaveformMarker { id: string; timeSeconds: number; endSeconds?: number; label: string; kind: 'hit' | 'note' | 'grid' | 'snapped' }`. Wraps the audio once in an `AudioBuffer` (`new AudioBuffer({ length, sampleRate, numberOfChannels: 1 })`, `copyToChannel`) inside `useMemo` keyed on the `Float32Array` identity (referential stability across redraws is the reason), draws with `drawSampleWaveform` passing `slices` built from hit/note markers (`startFrame = timeSeconds * sampleRate`), then overlays the grid rows (thin lines at `rowTime(r)`) and the snapped-position ticks itself with `ctx` after the base draw. Redraws on resize via `ResizeObserver` and on prop change. `drawSampleWaveform` gets one new optional field `colors?: Partial<{ waveform: string; accent: string }>`; `VoiceTakeWaveform` passes `waveform: var(--color-accent)` and `accent: var(--color-text-primary)` read with `getComputedStyle(document.documentElement)` (the defined tokens; `--color-accent-primary` stays as the function's default lookup so other callers do not change). In jsdom `AudioBuffer` is undefined: the component renders an empty `<canvas data-testid="voice-take-waveform" data-markers={markers.length}>` when `typeof AudioBuffer === 'undefined'` or `audio` is null; tests assert `data-markers`.

### Wizard: extend `VoiceSetupWizard.tsx`

STEPS become `['microphone', 'latency', 'kick', 'snare', 'hat', 'clap', 'melody', 'result']` (one step per drum class, then a melody step). Each drum step: instruction text ("Say 'boom' eight times, one per beat"), the Record button (`voice-setup-train-<drum>`, existing testid), `VoiceTakeWaveform` of the step's take with the detected hits as markers, "Heard N hits" line, Retake. The take and hits per step come from the store (`trainingTake: { drum, audio, hits } | null`, `samplesByClass`). Next is disabled until the class has at least `MIN_SAMPLES_PER_CLASS` samples. Melody step: "Sing eight notes up a scale", records with the pitch model, shows the waveform with note markers, derives `fine.minMidiNote`/`maxMidiNote` (lowest detected - 3, highest + 3) and `fine.transpose` (0, unless the median is below MIDI 48, then +12) and writes them to the store on Next. Result step: `trainAndEvaluate` summary as today plus the melody range. Modal size goes `md` -> `xl` so the waveform fits. The wizard opens over the Voice modal (nested Modal, same as `wizardOpen` today) and still auto-opens on first use via `shouldOpenVoiceSetup`.

### Quantise: `quantise.ts`

`QuantiseSettings` gains `strength: number` (0..1, default 1) and `toleranceRows: number` (0..0.5, default 0.1). `rowTime` and `nearestRow` are exported. New pure `quantiseTime(t, s): { row: number; offsetRows: number; heardSeconds: number; writtenSeconds: number }`:

```ts
const row = nearestRow(t, rs, swing);
const off = (t - rowTime(row, rs, swing)) / rs;              // signed, in rows, |off| <= ~0.5
const kept = Math.abs(off) <= s.toleranceRows ? 0 : off * (1 - s.strength);   // inside tolerance = on the grid
return { row, offsetRows: kept, heardSeconds: t, writtenSeconds: rowTime(row, rs, swing) + kept * rs };
```

`QuantisedNote` gains `offsetRows: number` (0 when fully snapped) and `heardSeconds: number`. `quantiseNotes` and `quantiseHits` use `quantiseTime`. A positive `offsetRows` becomes a note-delay effect in the writer (see below); a negative one is written on the row (the format cannot play a note early; the timing table shows the heard time so the owner sees it). The timing table reads `heardSeconds` and `writtenSeconds`.

### Effects: `src/lib/voice/voiceEffects.ts` (new, pure)

The single table of effect commands the writer may emit, keyed by notation:

```ts
export type VoiceEffectKind = 'arpeggio' | 'portaUp' | 'portaDown' | 'tonePorta' | 'vibrato' | 'volumeSlide' | 'retrigger' | 'noteDelay';
export interface EffectCommand { effTyp: number; eff: number; }
export interface VoiceEffectSet { encode(kind: VoiceEffectKind, param: number): EffectCommand | null; maxColumns: number; }
export function voiceEffectSet(notation: EffectNotation, maxEffectCols: number): VoiceEffectSet
```

Tracker notation: arpeggio `{0x0, xy}`, portaUp `{0x1, xx}`, portaDown `{0x2, xx}`, tonePorta `{0x3, xx}`, vibrato `{0x4, xy}`, volumeSlide `{0xA, xy}`, retrigger `{0xE, 0x90 | x}`, noteDelay `{0xE, 0xD0 | x}`. Furnace notation: `{0x00, xy}`, `{0x01, xx}`, `{0x02, xx}`, `{0x03, xx}`, `{0x04, xy}`, `{0x0A, xy}`, retrigger `{0x0C, xx}`, noteDelay `{0xED, xx}`. The writer resolves the set from the target song: `effectNotationOf(pattern.importMetadata)` and `getFormatConstraints(sourceFormat ?? 'XM').maxEffectCols`. With one effect column, the writer keeps the first command by priority noteDelay > tonePorta > retrigger > vibrato > arpeggio > volumeSlide.

Detection, `src/lib/voice/noteEffects.ts` (new, pure), runs on the quantised notes plus the take audio and returns `NoteEffect[]` per note (`{ noteIndex, kind, param, rowOffset }`), gated by `fine.effects.{volume,slides,vibrato,arpeggio,flams}`:

- Pitch contour: for each note, `yinHz` every 10 ms over the note's span (`voicing.ts`), converted to MIDI, median-filtered over 5 points.
- Slides (`tonePorta`): the contour's last 60 ms median differs from the first 60 ms median by >= 1 semitone and the move is monotonic (80 % of successive deltas share the sign). The note is written at the start pitch; a second cell on the row where the contour reaches the end pitch carries the end note with `3xx`, `xx = clamp(round(semitones * 16 / (speed * rowsSpanned)), 1, 0xFF)` (FT2 tone portamento moves `xx/16` semitones per tick).
- Vibrato: contour minus its linear trend oscillates with >= 3 zero crossings, peak deviation 0.25..2 semitones, rate 3..9 Hz. `4xy`: `x = clamp(round(rateHz * 64 / ticksPerSecond), 1, 15)` where `ticksPerSecond = bpm / 2.5` (FT2 advances the 64-step vibrato table `x` positions per tick), `y = clamp(round(depthSemitones * 16 / 2), 1, 15)` (depth `y/16` semitones at full table swing).
- Arpeggio: three or more consecutive notes each shorter than one row and all starting within the same row window, alternating between 2-3 distinct pitches: written as one note (the lowest) with `0xy`, `x` = second pitch - lowest, `y` = third pitch - lowest (0 when only two), both clamped to 0..15.
- Volume slide: `spanRms` per row over a note longer than 2 rows; a monotone drop >= 6 dB from the first to the last row gives `A0y` on every row after the first, `y = clamp(round(volumeDrop / (rows * (speed - 1))), 1, 15)` (FT2 slides `y` volume units per tick, `speed - 1` ticks per row); a rise >= 6 dB gives `Ax0`.
- Flams (drums only, `drumToNotes.ts`): two hits of the same class closer than one row: the first is written with retrigger `E9x`, `x = clamp(round(delta / tickSeconds), 1, 15)` (tracker) or `0Cxx` (Furnace); the second hit is dropped.
- Note delay: any note or hit with `offsetRows > 0` gets `EDx`, `x = clamp(round(offsetRows * speed), 1, speed - 1)` (Furnace `EDxx`).

`TakeCell` gains `effects: EffectCommand[]`; `takeCells` fills `effTyp/eff` and `effTyp2/eff2` from it (capped by `maxColumns`); `applyNotesToPattern` writes them. `commitVoiceNotes` / `commitDrumHits` compute the effects with the take audio and pass them through.

### Reachability test

One test in `voiceToNotesPanel.test.tsx`, through the real entry: it mounts `<VoiceToNotesPanel isOpen onClose model deps />`, clicks Record then Stop with a `SineReadingModel` whose take contains a glide, a wobble and one late note, and asserts (a) the `role="dialog"` is on screen with the waveform `data-markers` equal to the note count, (b) `useTrackerStore` pattern cells carry the note plus `effTyp 3` (slide), `effTyp 4` (vibrato) and `effTyp 0xE` with `eff 0xD?` (delay) on the rows the plan's formulas give, (c) a sentinel: `writeNotesToPattern` is spied and seen once. Pure functions (`quantiseTime`, `noteEffects`, `voiceEffectSet`) get their own unit tests in `src/lib/voice/__tests__/`. The TrackerView/EditorControlsBar chain is unchanged (one prop added) and has no jsdom test today (WebGL worker); the owner's LOCAL test covers that click.

## Decisions (resolving every research open question)

- Modal body scroll: the caller wraps the body in `flex-1 min-h-0` and gives each column its own `overflow-y-auto`; the Modal provides none.
- `--color-accent-primary` is undefined in `index.css`; the waveform reads `--color-accent` and `--color-text-primary` through the new `colors` option. `drawSampleWaveform` keeps its own lookups so other callers are untouched.
- `deckIdentity.resolveColor` stays in the DJ code; the Voice waveform reads CSS variables directly like `drawSampleWaveform` does.
- The raw take is retained in `useVoiceStore` (`take.audio`, and `takes[]` with audio, 8 deep, ~7 MB worst case) for both modes; `takeHistory.ts` is removed.
- The wizard stays a nested Modal (owner rule: extend `VoiceSetupWizard`, no second wizard; nested Modal already works today).
- Effect sets are chosen by channel notation and format effect-column count only; `supportedEffects` is null everywhere so no narrower set exists to consult.
- Negative timing offsets are shown, not written (no tracker plays a note before its row).
- Phase E deviations: the notation comes from `channelMeta` (`effectNotationOf`) and the column count from `getFormatConstraints(sourceFormat).maxEffectCols`; effects travel as a per-note `effects: VoiceEffect[]` with a `rowOffset` and an optional `midi` (the tone-portamento target note, repeated on every slide row so a one-column channel still reaches it); arpeggio folds notes before quantising; vibrato is written on every row of the note; the volume slide uses rows 1..lengthRows-1; the contour is read once per melody take at 20 ms (never for drum takes); the MCP handler detects with every effect on; the Effects column shows tracker notation whatever the channel; a note delay is written only from the offset the strength leaves (none at strength 1).
- Contour smoothing is an outlier-only despike (a probe more than 3 semitones from its 5-neighbour median is replaced), not a 5-point median: the median flattened a 5 Hz vibrato to half its depth. The remaining depth loss is the YIN probe's averaging over its difference span (`yinProbeSeconds`, 79 ms at 22050 Hz); measured 0.94 / 0.86 / 0.77 / 0.67 / 0.57 at 3..7 Hz against sinc 0.91 / 0.85 / 0.77 / 0.67 / 0.57, so the depth is divided by that sinc. The vibrato rate is the period between the first and last interpolated line crossing (the crossing count over the whole note was 15 % off on a 0.6 s note).

## Checklist

Phase A, store (VS):
- [ ] VS-1 `src/stores/useVoiceStore.ts`: state and actions above; `patchFine`, `setTake` (pushes into `takes`, caps 8), `useTake(id)`.
- [ ] VS-2 Delete `src/lib/voice/takeHistory.ts`; move `MAX_TAKES` to the store; update imports.
- [ ] VS-3 Panel reads/writes the store for every former `useState` listed in "What exists"; `handleStop` stores the raw take for both modes.
- [ ] VS-4 Unit test `src/stores/__tests__/useVoiceStore.test.ts`: take cap 8, `useTake` restores audio, `patchFine` keeps other fields.

Phase B, modal and waveform (VM):
- [ ] VM-1 `drawSampleWaveform.ts`: `colors` option.
- [ ] VM-2 `VoiceTakeWaveform.tsx` per design (AudioBuffer wrap, slices, grid and snapped overlay, ResizeObserver, jsdom fallback with `data-markers`).
- [ ] VM-3 `VoiceToNotesPanel.tsx` is a fullscreen Modal with the three-column body and footer; `isOpen` prop; testid preserved.
- [ ] VM-4 `TrackerView.tsx`: render the modal with `isOpen={voicePanelOpen}`, drop the aside slot.
- [ ] VM-5 Timing table (`voice-timing`) from `heardSeconds`/`writtenSeconds`/effects.
- [ ] VM-6 Existing panel tests pass against the modal (queries unchanged; add `isOpen`).

Phase C, wizard (VW):
- [ ] VW-1 STEPS per design; per-class drum steps with waveform, hit count, Retake, Next gate.
- [ ] VW-2 Melody step: record, note markers, range and transpose written to `fine` on Next.
- [ ] VW-3 Result step shows training summary and melody range; Modal size `xl`.
- [ ] VW-4 Wizard tests: per-class gate, melody range write (extend the existing 'Voice to Notes setup wizard' describe).

Phase D, quantise (VQ):
- [x] VQ-1 `quantise.ts`: `strength`, `toleranceRows`, exported `rowTime`/`nearestRow`, `quantiseTime`, `offsetRows`/`heardSeconds` on `QuantisedNote`; `quantiseNotes` uses it.
- [x] VQ-2 `drumToNotes.ts` `quantiseHits` uses `quantiseTime`.
- [x] VQ-3 Knobs Strength and Tolerance in the modal (Knob, `size="sm"`), stored in `fine`.
- [x] VQ-4 Unit test `src/lib/voice/__tests__/quantise.test.ts`: strength 1 snaps, strength 0 keeps the offset, tolerance zeroes small offsets, swing-aware grid times.

Phase E, effects (VE):
- [x] VE-1 `voiceEffects.ts`: `voiceEffectSet` table for both notations, column cap and priority.
- [x] VE-2 `noteEffects.ts`: contour, slides, vibrato, arpeggio, volume slide, note delay per the formulas.
- [x] VE-3 `drumToNotes.ts`: flam detection -> retrigger; note delay from offset.
- [x] VE-4 `writeToPattern.ts`: `TakeCell.effects`, `takeCells` and `applyNotesToPattern` write effect columns; writer resolves the effect set from the target pattern's notation and format.
- [x] VE-5 `voiceToNotes.ts` / `drumToNotes.ts` commit paths pass audio and effects through; effects toggles in `fine`.
- [x] VE-6 Unit tests `src/lib/voice/__tests__/noteEffects.test.ts` and `voiceEffects.test.ts`: each detector on a synthetic contour; one-column cap keeps the priority command; Furnace codes.

Phase F, reachability and close-out (VR):
- [ ] VR-1 Reachability test per design (dialog, markers, effect cells, sentinel).
- [ ] VR-2 `npm run type-check` clean.
- [ ] VR-3 Affected tests only: `npx vitest run src/lib/voice src/stores/__tests__/useVoiceStore.test.ts src/components/tracker/__tests__/voiceToNotesPanel.test.tsx src/bridge/handlers/__tests__/voiceToNotesHandler.test.ts`.
- [ ] VR-4 Commit by path per phase; push; tick VNR-12..15 in `thoughts/spot/todos.md`; update the handoff.

## Verification

Automated: VS-4, VQ-4, VE-6, VR-1, VR-2, VR-3.

Manual (owner, LOCAL `http://localhost:5174`): open the tracker, click Voice in the editor toolbar. PASS: a fullscreen dialog opens with the settings column, an empty waveform and the footer Record button. Record a hummed phrase with one glide and one wobble, Stop. PASS: the waveform shows the take with one marker per note, the timing table lists each note's heard and written time, the pattern gets the notes plus a `3xx` on the glide and a `4xy` on the wobble. Open Setup wizard. PASS: one step per drum class with its own waveform after recording, a melody step that sets Lowest/Highest, and the result step.

## Success criteria per phase

- A: the panel behaves as before with its state in the store; the raw drum take is in `useVoiceStore.getState().take`.
- B: the modal replaces the aside; the waveform shows one marker per hit/note; old tests pass.
- C: every drum class has its own step with a waveform; the melody step writes the range.
- D: a 30 % late note with strength 0.5 is written with half its offset as note delay; the table shows both times.
- E: slide, vibrato, arpeggio, volume slide, flam and delay each appear in the effect columns of a synthetic take, in both notations, capped by the format's column count.
- F: one test proves the chain from Record to pattern cells with effects; type-check clean; commits pushed; ledger ticked.

## Out of scope

- Restyling the toolbar Voice button (shared toolbar style).
- MCP `voice_to_notes` handler effect support (separate ask; it reuses the writer once VE-4 lands, nothing else changes).
- Persisting takes across reloads.
