---
date: 2026-10-15
topic: klystrack instrument editor built from the klystron sources (KLYS-INSTRUMENT-EDITOR)
tags: [klystrack, instrument-editor, wasm, plan]
status: implemented
---

# Klystrack instrument editor

Research: `thoughts/shared/research/2026-10-15_klystrack-instrument-model.md` (field table, original GUI layout, wrapper exports, save path). Ledger: `thoughts/spot/todos.md` KLYS-INSTRUMENT-EDITOR.

**Starts after KLYS-CONFORM lands.** That task is editing `KlysView.tsx`, `KlysParser.ts`, `KlysEngine.ts`, `NativeEngineRouting.ts`, `KlysWrapper.c`, `cyd.c`, `CMakeLists.txt`. Before P1, re-read those files and re-check every line reference below; cite by function name.

## Done means

From the shared instrument panel, a klystrack instrument opens a full editor that shows all 65 controls of klystrack's own instrument panels plus the 32-step program. An edit is heard on the next note (or immediately, for fields the engine reads every tick). It survives `.kt` save and reload, and a project save and reopen. One test drives this through `UnifiedInstrumentEditor` -> the real worklet -> `klys_save_song` -> reload.

## Decisions (made; not to be re-litigated)

1. **House pattern.**
   - Editor shape: `SonixControls.tsx`. Registered through `getEditorMode` (`UnifiedInstrumentEditor.tsx`) plus a lazy block in `SynthTypeDispatcher.tsx`. Takes `instrument: InstrumentConfig`. Uses only `Knob` / `Toggle` / `CustomSelect` / `Button` / `SectionLabel`, the `configRef` pattern, and token classes.
   - Edit path: `src/components/hively/hivelyEdit.ts`, which is ONE write path. A `useFormatStore` action holds the native model and its undo stack, and an edit module pushes the same change to the engine.
   - Hively's own `HivelyControls.tsx` is not the reference: it hard-codes hex colours, uses inline `<button>` and `type="number"`, and writes an `InstrumentConfig` copy instead of the native model.
2. **Source of truth: `useFormatStore.klysNative.instruments`.** `klys_save_song` serialises the WASM song, so every edit is written to the store and the engine in the same call. Nothing else writes instrument fields.
3. **Program table: create the ONE shared table editor** `src/components/instruments/shared/InstrumentTableEditor.tsx`, a thin wrapper over `PatternEditorCanvas` format mode.
   - Its API matches what the 8 `ARP_COLUMN` copies need (audit row 8): `columns`, `rows`, `label`, `playingRow?`, `onCellChange`, `height`. That task migrates them with no API change.
   - Klystrack is its first user. `SequenceEditor` (bar chart) does not fit 16-bit command words.
   - Migrating the 8 copies stays its own ledger item (DUP-AUDIT row 8); this plan does not touch them.
4. **Instrument index = `InstrumentConfig.id - 1`.** This is the parser's own numbering. It lives in ONE helper, `klysInstrumentIndex()` / `klysInstrumentId()`, and the parser uses it too.
5. **Edits are heard on the next note**, except the fields klystron reads every tick (volume, vibrato, PWM, slide, program; marked "live" in the research table). This is klystron's own behaviour and klystrack's editor works the same way. No forced retrigger.
6. **Ranges come from the original editor's clamps** (`event.c instrument_add_param`), not from the C types. The wrapper setters do not clamp, so the TypeScript field table clamps.

### Owner decisions with the default this plan uses (veto any before P4)

- **Layout.** Three columns on wide screens: left = klystrack `instrument_view` groups, middle = `instrument_view2` groups, right = the program table at full height. Below the 1200 px panel width they stack in the same order. No tabs, every control visible at once (memory: maximized editors only).
- **Hearing the instrument.** A key on a klystrack instrument previews that instrument on channel 31, which no song uses, through the new `klys_preview_note_on/off`. It never starts or stops the song, so owner rule K3 still holds. This replaces today's "a key plays nothing" notice for Klystrack only. `wholeSongSynthKeys.test.ts` is updated to assert "previews, does not play the song".
- **Out of scope, filed as follow-up ledger items:**
  - KLYS-WAVETABLE-EDITOR: sample data. It is song-level in klystrack's separate Wavetable tab (`src/view/wavetableview.c`).
  - KLYS-INSTRUMENT-FILES: `.ki` load/save (`instrument_disk_view`).
  - KLYS-INSTRUMENT-SLOTS: adding instruments beyond the file's `num_instruments`.

## Field -> control map (all 41 values + program + name; 65 GUI controls)

paramKey = `klystrack.<nksId>`. The existing NKS ids (`remainingParameterMaps.ts:332`) are kept where they exist (marked *). New continuous fields get `klystrack.<fieldKey>`. Toggles and selects take no paramKey: they are not continuous MIDI targets.

| Group (section label) | Control (full English label) | Field / bit | Control type, range | paramKey |
|---|---|---|---|---|
| Pitch | Base Note | `base_note` | Knob 0-95, value shown as note name (C-0..B-7) | `klystrack.baseNote` |
| Pitch | Fine Tune | `finetune` | Knob -128..127 | `klystrack.finetune`* |
| Pitch | Lock Note | flags 8 | Toggle | - |
| Pitch | Drum | flags 2 | Toggle | - |
| Pitch | Key Sync | cydflags 64 | Toggle | - |
| Pitch | Invert Vibrato | flags 4 | Toggle | - |
| Pitch | Set Pulse Width on Note | flags 16 | Toggle | - |
| Pitch | Set Cutoff on Note | flags 32 | Toggle | - |
| Pitch | Slide Speed | `slide_speed` | Knob 0-255 | `klystrack.slideSpeed`* |
| Oscillator | Pulse | cydflags 2 | Toggle | - |
| Oscillator | Pulse Width | `pw` | Knob 0-2047 | `klystrack.pulseWidth`* |
| Oscillator | Saw | cydflags 8 | Toggle | - |
| Oscillator | Triangle | cydflags 4 | Toggle | - |
| Oscillator | Noise | cydflags 1 | Toggle | - |
| Oscillator | Metallic Noise | cydflags 128 | Toggle | - |
| Oscillator | POKEY Noise | cydflags 16384 | Toggle | - |
| Oscillator | POKEY Noise Type | `lfsr_type` | CustomSelect 0-15 (shown as numbers 0-15; klystrack names none) | - |
| Oscillator | Quarter Frequency | flags 256 | Toggle | - |
| Oscillator | Multiple Oscillators | flags 2048 | Toggle | - |
| Wavetable | Wavetable | cydflags 4096 | Toggle | - |
| Wavetable | Wavetable Entry | `wavetable_entry` | CustomSelect 0-127, label `NN name` from `klys_get_wavetable_name`; empty slots marked "(empty)" | - |
| Wavetable | Wave Overrides Envelope | cydflags 8192 | Toggle | - |
| Wavetable | Wave Keeps Its Own Pitch | flags 512 | Toggle | - |
| Volume | Volume | `volume` | Knob 0-255 | `klystrack.volume`* |
| Volume | Relative Volume | flags 128 | Toggle | - |
| Volume | Attack / Decay / Sustain / Release | `adsr.a/d/s/r` | 4 Knobs: 0-63 / 0-63 / 0-31 / 0-63, plus `EnvelopeVisualization mode="linear"` | `klystrack.attack/decay/sustain/release`* |
| Buzz | Buzz | flags 64 | Toggle | - |
| Buzz | Buzz Semitones | `buzz_offset` high byte | Knob -99..99 | `klystrack.buzzSemitones` |
| Buzz | Buzz Fine Tune | `buzz_offset` low byte | Knob -128..127 | `klystrack.buzzFine` |
| Buzz | Buzz Shape | `ym_env_shape` | CustomSelect: Saw Down, Saw Up, Triangle Down, Triangle Up (bits ATT=1, ALT=2, `cyd.h:178-180`) | - |
| Sync and Ring | Hard Sync | cydflags 16 | Toggle | - |
| Sync and Ring | Sync Source | `sync_source` | CustomSelect: Own Channel (0xFF), Channel 1-32 | - |
| Sync and Ring | Ring Modulation | cydflags 256 | Toggle | - |
| Sync and Ring | Ring Source | `ring_mod` | CustomSelect: Own Channel (0xFF), Channel 1-32 | - |
| Filter | Filter | cydflags 512 | Toggle | - |
| Filter | Filter Type | `flttype` | CustomSelect: Low Pass, High Pass, Band Pass | - |
| Filter | Cutoff | `cutoff` | Knob 0-2047 | `klystrack.cutoff`* |
| Filter | Resonance | `resonance` | Knob 0-3 | `klystrack.resonance`* |
| Effects | Effects | cydflags 1024 | Toggle | - |
| Effects | Effects Bus | `fx_bus` | CustomSelect 0-7 ("Bus 1".."Bus 8") | - |
| Vibrato | Speed / Depth / Delay | `vibrato_speed`, `vibrato_depth`, `vib_delay` | Knobs 0-255 | `klystrack.vibratoSpeed`*, `.vibratoDepth`*, `.vibratoDelay` |
| Vibrato | Shape | `vib_shape` | CustomSelect: Sine, Ramp Up, Ramp Down, Random, Square | - |
| Pulse Width Modulation | Speed / Depth | `pwm_speed`, `pwm_depth` | Knobs 0-255 | `klystrack.pwmSpeed`*, `.pwmDepth`* |
| Pulse Width Modulation | Shape | `pwm_shape` | CustomSelect (5 shapes) | - |
| Program | Program Period | `prog_period` | Knob 0-255 (0 = program off) | `klystrack.programPeriod` |
| Program | No Program Restart | flags 1024 | Toggle | - |
| Program | Program (32 steps) | `program[]` | InstrumentTableEditor, columns Command (hex 4), Chain (`|`/`.`), Meaning (read-only text) | - |
| Frequency Modulation | Frequency Modulation | cydflags 32768 | Toggle | - |
| Frequency Modulation | Modulator Volume | `fm_modulation` | Knob 0-127 | `klystrack.fmMod`* |
| Frequency Modulation | Feedback | `fm_feedback` | Knob 0-7 | `klystrack.fmFeedback`* |
| Frequency Modulation | Carrier Multiplier / Modulator Multiplier | `fm_harmonic` high / low nibble | 2 Knobs 0-15 | `klystrack.fmCarrierMultiplier`, `.fmModulatorMultiplier` |
| Frequency Modulation | Modulator Attack / Decay / Sustain / Release | `fm_adsr.*` | 4 Knobs 0-63/0-63/0-31/0-63, plus EnvelopeVisualization | `klystrack.fmAttack/fmDecay/fmSustain/fmRelease` |
| Frequency Modulation | Modulator Envelope Start | `fm_attack_start` | Knob 0-31 | `klystrack.fmEnvelopeStart` |
| Frequency Modulation | Modulator Wavetable | fm_flags 4096 | Toggle | - |
| Frequency Modulation | Modulator Wavetable Entry | `fm_wave` | CustomSelect 0-127 (same list as Wavetable Entry) | - |
| Header | Name | `name` | `EditorHeader` name field (32 chars), also written to `InstrumentConfig.name` | - |

**Exemptions** (preserved verbatim through the word, not shown):

- flags bit 1 `MUS_INST_PROG_SPEED_ABSOLUTE`: nothing in `music.c` reads it, and the original editor does not show it.
- cydflags 32 GATE and 2048 YM_ENV: the engine sets them at note-on and release (`music.c:1228/1235`), and the original does not show them.
- fm_flags 2/4/8: no reader in `cydfm.c`, and the original does not show them.

A bit toggle writes `word ^ bit` on the current word, so the exempt bits ride along unchanged.

## Component tree

```
SynthTypeDispatcher (editorMode 'klystrack')
  EditorHeader (name, viz)
  KlysControls  (src/components/instruments/controls/KlysControls.tsx)
    KlysPitchSection / Oscillator / Wavetable / Volume+Envelope / Buzz / SyncRing / Filter   (left column)
    KlysEffects / Vibrato / PulseWidthModulation / ProgramSettings / FrequencyModulation       (middle column)
    KlysProgramEditor -> InstrumentTableEditor (shared) -> PatternEditorCanvas (format mode)   (right column)
      KlysProgramCommandHelp (command list from klysProgramCommands, read-only)
```

The sections are plain functions inside `KlysControls.tsx`, one file, the same way `SonixControls` does it. They take `inst`, `edit` and the field table.

## Phases

Checklist IDs KIE-x.y. Running counts are reported in the ledger.

### P1: field table + one edit path (M)

- **KIE-1.1** `git mv src/engine/klystrack/klysParams.ts src/engine/klystrack/klysInstrumentFields.ts`, then rewrite it:
  - `KLYS_FIELDS: Record<KlysFieldKey, { paramId; min; max; label; group; nksId? ; get(inst); set(inst, v) }>` for every row above. Buzz semitones/fine and the two multipliers are derived fields that read and write their halves of the packed byte.
  - `KLYS_FLAG_BITS` for flags, cydflags and fm_flags: user bits only, with full labels.
  - `KLYS_EXEMPT_BITS`.
  - `KLYS_FILTER_TYPES` (3 entries), `KLYS_SHAPES` (5), `KLYS_BUZZ_SHAPES` (4).
  - `klysInstrumentIndex(id)` / `klysInstrumentId(index)`.
  - `KLYS_EMPTY_STEP = 0xFFFE`.
  - Update importers of `klysParams` (grep).
- **KIE-1.2** `useFormatStore`: add actions `setKlysInstrument(index, patch: Partial<KlysNativeInstrument>)` (immer), `undoKlysInstrument()`, `redoKlysInstrument()`, plus `klysInstrumentUndoStack` / `klysInstrumentRedoStack` that store `{index, before, after}`. These mirror `setHivelyTrackStep` / `undoHivelyTrackStep`.
- **KIE-1.3** New `src/components/klystrack/klysInstrumentEdit.ts`, the ONE write path:
  - `editKlysField(index, key, value)`, `toggleKlysBit(index, word, bit)`, `editKlysProgramStep(index, step, word)`, `insertKlysProgramStep / deleteKlysProgramStep(index, step)` (shift and NOP-fill, like `edit_program_event`), `renameKlysInstrument(index, name)`, `undoKlysInstrumentEdit()`, `redoKlysInstrumentEdit()`.
  - Each edit clamps through `KLYS_FIELDS`, then writes the store through KIE-1.2, then sends `setInstrumentParam` / `setInstrumentProgramStep` / `setInstrumentName` to `KlysEngine` (only when `KlysEngine.hasInstance()`).
  - A rename also calls `useInstrumentStore.updateInstrument(klysInstrumentId(index), { name })`.
  - Store writes are coalesced to one per animation frame. The engine send is immediate (CONTROL_PATTERNS: rAF-batched store write).
- **KIE-1.4** One `songData` writer.
  - New `src/engine/klystrack/klysSongData.ts`: `klysSongDataToNative(data)` nests the FM fields; `applyKlysSongData(data)` writes `klysNative` and copies each instrument name into its `InstrumentConfig.name` (an empty name stays empty).
  - `KlysView.tsx` `onSongData` and `wasmEngineRegistry.ts` Klystrack `onStarted` both call it, and the second shape disappears.
- **KIE-1.5** `KlysSynth`:
  - The constructor takes the instrument id; `InstrumentFactory.ts` (the `new KlysSynth()` line) passes `config.id`.
  - `set(param, normalized)` looks up `KLYS_FIELDS` by `nksId`, denormalises with the field's min/max, and calls `editKlysField(klysInstrumentIndex(id), ...)`. The hard-coded instrument 0 and the private paramId table go away.
- **KIE-1.6** `KLYSTRACK_NKS_PARAMETERS` is generated from `KLYS_FIELDS` entries that carry `nksId`. The 16 existing ids and their page/index stay; new ids are appended on page 2 onward.

### P2: WASM additions, save fix, rebuild (M)

- **KIE-2.1** `KlysWrapper.c`: in `save_instrument`, count `progsteps` against `MUS_FX_NOP`, not 0. This matches `diskop.c:286-288`.
- **KIE-2.2** `KlysWrapper.c` new exports:
  - `klys_set_instrument_data(int idx, const void *buf, int len)`: exact inverse of the `klys_get_instrument_data` layout. It writes every member except the program when `len` is short.
  - `klys_get_num_wavetables(void)`, `klys_get_wavetable_name(int i)`, `klys_get_wavetable_info(int i, void *out)` (samples u32, loop_begin u32, loop_end u32, base_note u16, flags u32).
  - `klys_preview_note_on(int inst, int note)`: channel 31 = `CYD_MAX_CHANNELS-1`, via `mus_trigger_instrument`. Returns 0 when no song or when `num_channels > 31`.
  - `klys_preview_note_off(void)`: `mus_release` on channel 31.
  - `klys_get_channel_program(void *out, int maxCh)`: per channel u8 instrument index (0xFF none), u8 program_tick, u8 running flag. Instrument index = `chn->instrument - g_song.instrument`.
  - Add all of them to `CMakeLists.txt EXPORTED_FUNCTIONS`.
- **KIE-2.3** Rebuild: `cd klystrack-wasm/build && emcmake cmake .. && emmake make`. Output goes to `public/klystrack/Klystrack.js/.wasm`; commit both.
- **KIE-2.4** `public/klystrack/Klystrack.worklet.js`:
  - New messages: `setInstrumentData`, `previewNoteOn`, `previewNoteOff`, `watchProgram` (on/off).
  - While watched, post `programStatus` with the existing position report.
  - `songData` gains `wavetables: [{name, samples, loopBegin, loopEnd, baseNote}]`.
- **KIE-2.5** `KlysEngine.ts`: `setInstrumentData`, `previewNoteOn/Off`, `subscribeProgramStatus(cb)` (sends `watchProgram` on first and last subscriber); `KlysSongData` gains `wavetables`. `KlysNativeData` gains `wavetables`.
- **KIE-2.6** `KlysSynth.triggerAttack/triggerRelease` call `previewNoteOn/Off` with the synth's instrument index (owner default above). `releaseAll` keeps stopping the song and also calls `previewNoteOff`.

### P3: shared table editor + klystrack program adapter (M)

- **KIE-3.1** `format-editor-types.ts` `ColumnDef` gains `readOnly?: boolean`. `formatKeyboard.ts` and paste skip read-only columns, and the cursor still lands on them.
- **KIE-3.2** New `src/components/instruments/shared/InstrumentTableEditor.tsx` (export it from `instruments/shared/index.ts`):
  - Props: `label`, `columns`, `rows: FormatCell[]`, `playingRow?: number`, `onCellChange: OnCellChange`, `onInsertRow?`, `onDeleteRow?`, `height?`.
  - Renders one non-pattern `FormatChannel` through `PatternEditorCanvas` with `hideVUMeters`, `formatCurrentRow = playingRow ?? 0`, `formatIsPlaying = playingRow !== undefined`.
  - Colours are token CSS variables only (`var(--color-...)`); no hex.
- **KIE-3.3** New `src/engine/klystrack/klysProgramCommands.ts`: the 63-row instruction table ported from `command.c:36-98` (word, mask, name, mnemonic, min, max) and `describeKlysStep(word, baseNote)`, which returns the original's display: note name for Arp/AbsArp, `External Arpeggio 1/2` for F0/F1, else the instruction name with its argument. Names are written as full English (`Portamento Up (semitones)`).
- **KIE-3.4** New `src/components/klystrack/klysProgramAdapter.ts`:
  - `KLYS_PROGRAM_COLUMNS(baseNote)`: `cmd` hex 4, `emptyValue 0xFFFE`, formatter = word with bit 15 masked unless `0xFxxx`; `chain` ctrl 0/1; `meaning` readOnly, charWidth 28.
  - `klysProgramToRows(program)`.
  - `klysProgramCellChange(index)`: typing `cmd` keeps the current chain bit; `chain` toggles 0x8000; `.` writes NOP. Both go through `editKlysProgramStep`.

### P4: KlysControls + registration (L)

- **KIE-4.1** (REVISED 2026-10-15, owner: "use our established synth layouts UI for the klys synth"). The controls are the house declarative layout, rendered by the shared `DOMSynthPanel`, not hand-built sections.
  - New `src/constants/synthLayouts/klystrack.ts`: `buildKlystrackLayout(wavetables)` returns a `SynthPanelLayout` (`configKey: 'klys'`), generated from `KLYS_FIELDS` (knob/select per field, label, min/max) and `KLYS_FLAG_BITS` (one toggle per user bit), grouped into sections in the order of klystrack's `instrument_view` then `instrument_view2`. `KLYSTRACK_LAYOUT = buildKlystrackLayout([])` is registered in `SYNTH_LAYOUTS` as `KlysSynth`.
  - New pure adapter in `src/components/klystrack/klysLayoutAdapter.ts`: `klysLayoutValues(inst)` (flat record: field keys + one boolean per flag bit key) and `applyKlysLayoutChange(index, before, after)` (diffs the two records and calls `editKlysField` / `toggleKlysBit` for each changed key; nothing else writes).
  - `git mv src/components/klystrack/KlysInstrumentEditor.tsx src/components/instruments/controls/KlysControls.tsx` and rewrite it as glue only: `DOMSynthPanel` with `layout = buildKlystrackLayout(klysNative.wavetables)`, `config = { klys: klysLayoutValues(inst) }`, `onChange = u => applyKlysLayoutChange(index, values, u.klys)` (configRef pattern), followed by the program section (KIE-4.2). Same shape as the DX7 block in `SynthTypeDispatcher.tsx` (`getSynthLayout('DX7')` + `DOMSynthPanel`).
  - The earlier "three columns, sections inside KlysControls" layout is superseded: `DOMSynthPanel` lays the sections out; the program table sits below it at full width.
- **KIE-4.2** Program section: `InstrumentTableEditor` + `klysProgramAdapter`, with `playingRow` taken from `subscribeProgramStatus` (first channel playing this instrument with its program running). Buttons (design-system `Button`): Insert Step, Delete Step, Undo, Redo. Below it, `KlysProgramCommandHelp` lists the command table.
- **KIE-4.3** Wavetable and Modulator Wavetable Entry selects get their options from `klysNative.wavetables` through `buildKlystrackLayout(wavetables)`.
- **KIE-4.4** Registration:
  - `SynthTypeDispatcher.tsx`: add `'klystrack'` to `EditorMode`, add a lazy `KlysControls` import, and add a block like `'sonix'` (EditorHeader + Suspense).
  - `UnifiedInstrumentEditor.tsx`: `if (synthType === 'KlysSynth') return 'klystrack';` replaces `'wasm-info'`.
- **KIE-4.5** `EditorHeader` name edits for `KlysSynth` go through `renameKlysInstrument`. The Klys block passes an `onChange` that intercepts `name`.

### P5: project save and reopen keeps instrument edits (S)

- **KIE-5.1** `KlysNativeData` gains `instrumentsFrom: 'stub' | 'engine' | 'edited'`.
  - The parser sets `'stub'`, `applyKlysSongData` sets `'engine'`, and every `klysInstrumentEdit` write sets `'edited'`.
  - It is persisted with `klysNative` (already in `getNativeEngineMetaForExport`).
- **KIE-5.2** `applyKlysSongData`: when the store holds `'edited'` instruments (a reopened project), keep them, send `setInstrumentData` for each, and do not overwrite. Otherwise behave as KIE-1.4.
- **KIE-5.3** If the persisted-project schema version key covers `klysNative`, add a migration in `src/lib/persistence/migrations/`: a missing `instrumentsFrom` reads as `'engine'`.

### P6: verification (S)

- **KIE-6.1** `npm run type-check`, `npm run lint` (touched files).
- **KIE-6.2** Add every new test file to `test:ci` in `package.json`.
- **KIE-6.3** Ledger + research status `final`/`implemented`; follow-up ledger items filed (KLYS-WAVETABLE-EDITOR, KLYS-INSTRUMENT-FILES, KLYS-INSTRUMENT-SLOTS, DUP-AUDIT row 8 now points at `InstrumentTableEditor`).

## Tests

Each test is named after the symptom and must fail on the pre-change code (revert-and-run before commit). Real song: `public/data/songs/klystrack/Ocean Loader III.kt`. Real worklet through `src/engine/__tests__/workletHarness.ts`.

| ID | File | Proves | Fails before because |
|---|---|---|---|
| T1 (P1) | `src/components/klystrack/__tests__/klysInstrumentEditClampsAndReachesTheEngine.test.ts` | `editKlysField` clamps to the original editor's ranges (cutoff 2047, ADSR 63/31, volume 255, feedback 7), writes the store once per frame, sends exactly one `setInstrumentParam` with the right paramId; bit toggles keep exempt bits; rename reaches `InstrumentConfig.name`; undo/redo restore store + engine | no edit module; old editor allowed cutoff 4095 |
| T2 (P1) | `src/engine/__tests__/klystrackSongDataHasOneShape.test.ts` | both songData paths produce `fm`-nested instruments (worklet songData through `applyKlysSongData`) | registry wrote the flat shape |
| T3 (P1) | `src/engine/__tests__/klystrackMidiKnobEditsTheSelectedInstrument.test.ts` | `KlysSynth(id=3).set('cutoff', 0.5)` edits instrument index 2 in store and engine | hard-coded instrument 0, store untouched |
| T4 (P2) | `src/engine/__tests__/klystrackProgramArpZeroSurvivesSave.test.ts` | real worklet: set program `[0x0C40, 0x0000, 0x0000, NOP...]`, save, reload: steps 1-2 still 0x0000; saved program length = 3 | trimming counted against 0 |
| T5 (P2) | same harness, `klystrackInstrumentDataRoundTrips.test.ts` | `setInstrumentData(get(i))` with every field changed reads back identical; preview note-on makes channel 31 audible (stereoOutputs RMS > 0) while song stopped and does not change song position | exports missing |
| T6 (P3) | `src/components/klystrack/__tests__/klysProgramAdapterShowsKlystracksProgram.test.ts` | NOP shows empty, `0x8xxx` shows chain, Arp row shows `base + n` note name, typing a command keeps chain, read-only column ignores keys | no adapter / readOnly |
| **R1 reachability (P4)** | `src/components/instruments/__tests__/klystrackInstrumentEditorReachesTheSave.test.tsx` | Render `UnifiedInstrumentEditor` with the `KlysSynth` instrument id 2 and `klysNative` from the real worklet's songData. A `KlysEngine` instance's `sendMessage` forwards to the harness worklet. Sentinel: `KlysControls` render count >= 1. Press ArrowUp on slider "Cutoff" N times and the worklet log holds N `setInstrumentParam {idx:1, paramId:16}` messages, toggle "Filter", type one program step. Then `serializeSong` -> load the bytes into a fresh worklet -> instrument 1 cutoff = original + N*step, FILTER bit flipped, program step equals the typed word | editor mode was `wasm-info`; no path existed |
| T7 (P5) | `src/engine/__tests__/klystrackReopenedProjectKeepsInstrumentEdits.test.ts` | store with `instrumentsFrom:'edited'` + original file bytes -> `applyKlysSongData` keeps the edit and the worklet's instrument data matches it | songData overwrote the edit |
| T8 (P2) | update `src/engine/__tests__/wholeSongSynthKeys.test.ts` | Klystrack key previews (`previewNoteOn`), never `play`/`stop` | notice-only behaviour |

Behaviour that lives in one place is tested there. R1 is the only test that goes through the route.

## Verification

**Automated** (run only these, not the full suite):

- `npm run type-check`
- `npx vitest run` on T1-T8 and R1
- `npm run lint` on touched files
- the exporter round-trip harness `KT` row (`src/lib/export/__tests__/exporterRoundtrip.harness.test.ts -t KT`): ratchet must not drop

**Manual** (owner, LOCAL `http://localhost:5174`, `npm run dev`):

1. Load `Ocean Loader III.kt`.
2. Select an instrument in the instrument list. The panel shows the three-column klystrack editor, not an info card.
3. Play the song and turn Cutoff on an instrument with Filter on. Next notes change, nothing glitches.
4. Press keys with the editor open. The instrument sounds alone and the song does not start.
5. Edit a program step. The playing-step marker moves while that instrument plays.
6. Save as `.kt`, reload it. The edits are there.
7. Save the project, reload the page, restore. The edits are there.
8. Stop playback.

PASS = all eight. FAIL looks like an info card, a song start on keypress, or edits gone after reload.

## Success criteria per phase

- P1: T1-T3 green and red on revert; type-check clean; no `klysParams` importers left.
- P2: Klystrack.wasm rebuilt from committed sources; T4, T5, T8 green; the KT ratchet is unchanged or better.
- P3: T6 green; `InstrumentTableEditor` has zero hex colours (`grep '#[0-9a-fA-F]\{3,6\}'` empty).
- P4: `klysLayoutAdapter` test (every changed layout key reaches exactly one `editKlysField`/`toggleKlysBit`; red on revert). R1 green and red with the `'klystrack'` editor mode reverted to `'wasm-info'`. All 65 controls and the program table are present: R1 counts sliders + switches + selects against `KLYS_FIELDS` + `KLYS_FLAG_BITS`.
- P5: T7 green.
- P6: every test is in `test:ci`; ledger ticked 27 of 27 (KIE-1.1 .. KIE-6.3).

## Owner decisions 2026-10-15
- Layout: 3 columns on wide screens (left panel, right panel, program table full height), stacked on narrow, no tabs - APPROVED.
- Audition: key plays the selected klystrack instrument on spare channel 31, never starts/stops the song - APPROVED.
