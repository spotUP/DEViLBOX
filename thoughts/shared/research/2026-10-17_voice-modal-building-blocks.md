# Voice to Notes modal: existing building blocks (2026-10-17)

Research only. Paths relative to src/ unless noted.

## 1. Modal API

components/ui/Modal.tsx props (lines 20-45): isOpen, onClose, children, onConfirm, confirmDisabled, theme ('modern'|'retro'), size ('sm'|'md'|'lg'|'xl'|'2xl'|'fullscreen', line 31), backdropOpacity ('light'|'medium'|'dark'), rounded, closeOnBackdropClick (default true), closeOnEscape (default true), closeOnEnter (default true; with no onConfirm Enter closes), animation ('fade'|'slide'|'scale'), className. Sizes map (207-218): sm max-w-sm, md max-w-md, lg max-w-2xl, xl max-w-4xl, 2xl max-w-6xl, fullscreen "w-full h-full". Non-fullscreen adds "shadow-xl max-h-[90vh] overflow-hidden" (line 245); the container is "flex flex-col". Modal has NO body wrapper: children are laid out directly in the flex column, so the caller must make its own body "flex-1 min-h-0 overflow-auto" for scrolling. Focus trap, focus restore, capture-phase keydown at 67-178. A Modal-level 'maximised' size does not exist; "fullscreen" is the nearest, and "2xl" (1152px) is the widest bounded size. VoiceSetupWizard passes closeOnEnter={false} (VoiceSetupWizard.tsx:90).

ModalHeader.tsx (69 lines): title, subtitle, icon (ReactNode, tinted text-accent-primary), onClose, theme, showCloseButton, className. Uses lucide X.
ModalFooter.tsx (38 lines): children, theme, align ('left'|'center'|'right'|'between').

Large modals: components/dj/DJPlaylistModal.tsx:2988 (size="fullscreen" closeOnEscape closeOnBackdropClick={false}); components/midi/MIDIMapperModal.tsx:323 (size="2xl", opened by uiStore modalOpen === 'midi-mapper', line 156); also components/dj/DJAutoDJPanel.tsx:591 (2xl).

## 2. Waveform drawing

Best candidate: utils/audio/drawSampleWaveform.ts, export `drawSampleWaveform(ctx, width, height, opts: WaveformDrawOptions)` (line 86). Used by components/instruments/SampleEditor.tsx:47. Input is an AudioBuffer (opts.audioBuffer, null allowed) with a 0-1 view window (viewStart, viewEnd). Options (lines 10-48): selectionStart/End, loopEnabled/loopStart/loopEnd/loopType, playbackPosition (0-1, 0 = off; playhead drawn in COLORS.playback at ~423), granularPosition, activeDrag, slices [{id,startFrame,endFrame,confidence}] with selectedSliceId (purple slice markers/labels), offsetMarkers (hex 9xx ticks, 385), showSpectrum, simplified + viewportRect (minimap). So markers: slice markers (frame positions) are the closest fit for onset markers; regions: selection and loop. Colours: it reads CSS vars via getComputedStyle(ctx.canvas) for bg, grid, centre line, muted text (95-101) with hardcoded fallbacks, but waveform red '#ef4444', selection blue, playhead '#fbbf24', slice purple are hardcoded in a COLORS constant (54-74). Note it reads '--color-accent-primary' whereas tailwind uses '--color-accent' (tailwind.config.js:72): possible mismatch, unverified at runtime. A take would need wrapping as an AudioBuffer (new AudioBuffer / ctx.createBuffer from the recorder Float32Array). Not a component: the caller owns the canvas, DPR sizing and redraw.

Others:
- components/dj/DeckAudioWaveform.tsx (333 lines): export DeckAudioWaveform, prop deckId only, driven by DJ stores and workers/dj-waveform.worker.ts peaks; reads --color-bg etc. at 29-34. Not reusable for arbitrary data.
- components/instruments/shared/WaveformThumbnail.tsx: WaveformThumbnail, data number[] + maxValue or a synth type name; width/height/color/style bar|line; hardcoded '#06b6d4' and bg '#11131a'. No markers.
- components/instruments/shared/WaveformLineCanvas.tsx: WaveformLineCanvas {data:number[], width, height, color, label?, maxSamples?}; hardcoded '#0a0a0a'. No markers.
- components/visualization/SamplePlaybackCursor.tsx: overlay cursor component (instrumentId, waveformWidth, displayStart/End, loopStart/End, totalSamples, cursorColor default '#fbbf24'); tied to instrument playback.
- components/visualization/Oscilloscope.tsx, InstrumentOscilloscope.tsx, ChannelWaveforms.tsx: live analyser scopes, not static takes.
- components/instruments/editors/wavetable/DrawCanvas.tsx (+ waveformMath/waveformOps.ts): wavetable single-cycle drawing editor.
- lib/jamcracker/waveformDraw.ts, lib/suntronic/waveDraw.ts, components/musicline/MusicLineWaveformVisualizer.tsx: format-specific.
- components/instruments/BeatSlicerPanel.tsx and SampleEditor.tsx show the slice/onset pattern in use.
- components/tracker/waveformVuLevel.ts: VU level helper, not drawing.
Voice side: lib/voice/takeHistory.ts:10 Take = {id, output: PitchModelOutput, seconds, recordedAt}; it keeps the model output, not raw audio. The raw Float32Array comes from recorder.stop() in VoiceToNotesPanel.tsx:248, so the wizard must keep that array to draw it.

## 3. Step wizards

No shared Wizard/Stepper in components/ui (ls checked; index.ts exports only BottomSheet, SwipeablePanel, TouchTarget, ScrollLockContainer, LongPressContextMenu, VirtualKeyboard, Button, useHoverTooltip). Wizards each hand-roll:
- components/tracker/VoiceSetupWizard.tsx: const STEPS = ['microphone','latency','drums','result'] (30), stepIndex state (74), go(delta) clamps and stops recording (83-86), Modal size="md" (90), ModalHeader subtitle "Step N of M: title" (93), data-testid per step (96), ModalFooter align="between" with Back (ghost, disabled at 0) and Next/Finish (primary) at 177-190. The best pattern to copy.
- components/ai/AISetupWizard.tsx:36 (step state string union; Back/Next buttons 141-147); components/dialogs/MIDIControllerWizard.tsx:36 (WizardStep union); components/dialogs/NewSongWizard.tsx; components/drumpad/PadSetupWizard.tsx; components/dialogs/NKSSetupWizard.tsx, USBSIDWizard.tsx; components/dj/HeadphoneSetupDialog.tsx.

## 4. Meters, badges, controls

- Level meter: `VoiceLevelMeter({level})` exported from components/tracker/VoiceSetupWizard.tsx:24 (h-1 bg-dark-bgTertiary track, bg-accent-success fill, width level*300%). Already shared by the panel and wizard. No ProgressBar, Meter or Badge components found in ui, controls or common (grep for export const ProgressBar|Meter|LevelMeter|Badge returned nothing).
- Button (components/ui/Button.tsx:8-26): variant 'primary'|'default'|'ghost'|'icon'|'ft2'|'danger'|'compact'; size 'sm'|'md'|'lg'|'icon'; color 'default'|'red'|'green'|'yellow'|'blue'|'purple'|'cyan'|'amber'; fullWidth; loading; icon ReactNode; iconPosition 'left'|'right'.
- Toggle (components/controls/Toggle.tsx:9): label, value:boolean, onChange, color?, tone?, size 'sm'|'md', hideLabel, disabled, title.
- Knob (components/controls/Knob.tsx:21): size 'xs'|'sm'|'md'|'lg'; needs paramKey for MIDI (see docs/CONTROL_PATTERNS.md).
- CustomSelect (components/common/CustomSelect.tsx:26): value, onChange(value), options SelectOptions (SelectOption {value,label} or groups), plus others not listed. Also Fader.tsx, Switch3Way.tsx, ui/TabStrip.tsx, ui/WaveformSelector.tsx exist.
- Badges are inline text-[9px] font-mono spans per CLAUDE.md.

## 5. Opening modals

Two patterns.
(a) Global store: stores/useUIStore.ts, fields modalOpen: string|null and modalData (67-68), actions openModal(id, data?) / closeModal() (159-160, impl 410-419). Full chain example: components/midi/MIDIToolbarDropdown.tsx:252 `useUIStore.getState().openModal('midi-mapper')` -> MIDIMapperModal.tsx:156 `isOpen = modalOpen === 'midi-mapper'` -> mounted always in App.tsx:1340 `<MIDIMapperModal />`. Toggle form: StudioView.tsx:214 checks modalOpen === 'masterFx' then closeModal/openModal. Other small stores exist: usePatternMatchModal.ts, useModlandContributionModal.ts, useRomDialogStore.ts.
(b) Local state, which is what Voice to Notes uses today: components/tracker/TrackerView.tsx:228 `voicePanelOpen`, passed as showVoicePanel/onToggleVoicePanel (478-479) to the toolbar, rendered at 547 `{voicePanelOpen && <VoiceToNotesPanel onClose=.../>}`. VoiceToNotesPanel owns the wizard's open flag (VoiceToNotesPanel.tsx:155) and renders VoiceSetupWizard at 393. No keyboard shortcut for it found (grep "oice" in TrackerView and FT2Toolbar shows only the toggle). A maximised modal could be mounted from the panel like the wizard, or moved to a uiStore id.

## 6. Icons

lucide-react confirmed. VoiceToNotesPanel.tsx:10: Mic, Square, Check, X, Loader2, Timer, Wand2. VoiceSetupWizard.tsx:9: Mic, Square, Timer. ModalHeader uses X.

## 7. Tailwind tokens

tailwind.config.js:54-77 defines dark.{bg,bgSecondary,bgTertiary,bgHover,bgActive,border,borderLight}, text.{primary,secondary?,muted} (secondary not seen in the lines read, only primary at 65 and muted at 67; CLAUDE.md lists it), accent.{primary,secondary,highlight,warning,error,success}, each via tone('--color-...'): --color-bg, -bg-secondary, -bg-tertiary, -bg-hover, -bg-active, -border, -border-light, -text, -text-muted, -accent, -accent-secondary, -accent-highlight, -warning, -error, -success. Canvas-side: no shared helper. Existing ad hoc readers: getComputedStyle(canvas).getPropertyValue('--color-...') in utils/audio/drawSampleWaveform.ts:95-101 and components/dj/DeckAudioWaveform.tsx:29-34; lib/deckIdentity.ts:46 has a resolveColor('var(--color-bg)') helper (not read in detail). A new canvas should reuse one of these rather than add a third.

## Open questions
- Does a Modal body scroll pattern exist that should be copied (DJPlaylistModal uses its own scrollContainerRef, line 1231)?
- Is '--color-accent-primary' (drawSampleWaveform.ts:101) actually defined? tailwind uses '--color-accent'. Check theme CSS.
- Is lib/deckIdentity.ts resolveColor exported and generic enough as the canvas token helper?
- Should drawSampleWaveform get a token-based waveform colour option, since COLORS.waveform is hardcoded red?
- Does the recorder keep the raw Float32Array after stop, or only the PitchModelOutput?

Looked in: src/components/{ui,controls,common,tracker,dj,instruments,visualization,midi,dialogs,ai}, src/utils/audio, src/lib/voice, src/stores/useUIStore.ts, tailwind.config.js, App.tsx. About 25 tool calls; not exhaustive for shortcuts.
