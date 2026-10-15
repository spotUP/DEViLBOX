---
date: 2026-10-15
topic: klystrack (klystron) instrument model, original editor layout, and how DEViLBOX holds and saves it
tags: [klystrack, klystron, instrument-editor, wasm, research]
status: final
---

# klystrack instrument model

Ledger: `thoughts/spot/todos.md` KLYS-INSTRUMENT-EDITOR. Plan: `thoughts/shared/plans/2026-10-15-klystrack-instrument-editor.md`.

Sources read:

- Engine (what DEViLBOX runs): `klystrack-wasm/common/` (klystron, `MUS_VERSION 27`, `music.h:36`).
- Original editor GUI: `/Users/spot/Code/Reference/Reference Code/klystrack-master/src/` (klystrack 1.7.7, `src/version`). Its `klystron/` submodule directory is empty, so the engine reference is our `klystrack-wasm/common` copy. The GUI files are CRLF + ISO-8859; plain `grep` reads them as binary (use `LC_ALL=C grep -a`).
  - `src/view.c` `instrument_view` (line 1073) and `instrument_view2` (line 1226): the two instrument panels, labels and grouping.
  - `src/view.c` `program_view` (line 815): the program list.
  - `src/event.c` `instrument_add_param` (line 88): every field's edit range (`clamp(...)`) and every bit toggle (`flipbit(...)`).
  - `src/event.c` `edit_program_event` (line 1665): program-step keys.
  - `src/event.h` lines 73-140: the `P_*` parameter list (65 instrument controls after `P_INSTRUMENT`).
  - `src/command.c` lines 36-98: the instruction table (name, mnemonic, mask, range) for program commands.
  - `src/diskop.c` line 286: how the original saves program steps.
- Line numbers below for `KlysWrapper.c` were read on 2026-10-15 while KLYS-CONFORM was editing the same file (it moved by ~56 lines during this research); cite by function name.

## 1. The MusInstrument struct

`music.h:47-73`. 35 members; with `adsr` and `fm_adsr` expanded to their four bytes, 41 scalar values, plus `program[32]` and `name[33]`.

Constants: `ENVELOPE_SCALE 2` (`cyddefs.h:36`), `CYD_WAVE_MAX_ENTRIES 128` (`:47`), `CYD_MAX_FX_CHANNELS 8` (`:51`), `CYD_CUTOFF_MAX 2048` (`:59`), `CYD_NUM_LFSR 16` (`cyd.h:134`), `FREQ_TAB_SIZE 96`, `MIDDLE_C 48` (`freqs.h:31-32`), `MUS_PROG_LEN 32` (`music.h:33`), `MUS_INSTRUMENT_NAME_LEN 32` (`:39`), `MAX_VOLUME 128`.

"When" column: **next note** = copied into the channel by `mus_trigger_instrument_internal` (`music.c:1133`); **live** = read from `chn->instrument` every tick, so an edit is heard on the playing note. Both are klystron's own semantics; the original editor behaves the same.

Range column = the original editor's clamp in `event.c instrument_add_param`, which is the authority for the editor's limits.

| # | C field (type) | Range (editor clamp) | Meaning (source) | When | GUI label / panel | Wrapper paramId |
|---|---|---|---|---|---|---|
| 1 | `flags` (Uint32) | bit set, see 1a | `MUS_INST_*` behaviour bits | mixed | (bits) | 4 |
| 2 | `cydflags` (Uint32) | bit set, see 1b | `CYD_CHN_*` oscillator/routing bits, copied to `cydchn->flags` (`music.c:1161`) | next note | (bits) | 5 |
| 3-6 | `adsr.a/d/s/r` (Uint8 each) | a,d,r 0-63 (`32*ENVELOPE_SCALE-1`), s 0-31 | amplitude envelope; files below v26 are scaled x2 on load (`music.c` `mus_load_instrument_RW`) | next note | ATK DEC SUS REL / view 1 | 0-3 |
| 7 | `sync_source` (Uint8) | 0xFF = self, 0-31 (stepped as -1..31) | hard-sync source channel (`music.h:51` comment "0xff == self"; `music.c:1192`) | next note | SYNC SRC / view 1 | 22 |
| 8 | `ring_mod` (Uint8) | 0xFF = self, 0-31 | ring-modulation source channel (`music.c:1193`) | next note | RING MOD SRC / view 1 | 21 |
| 9 | `pw` (Uint16) | 0-0x7FF (step 16) | pulse width; applied on note when `MUS_INST_SET_PW` (`music.c` trigger) | next note | PUL + value / view 1 | 9 |
| 10 | `volume` (Uint8) | 0-255 ("255 = ~2x boost", `event.c`) | instrument volume; read per tick in `update_volumes` (`music.c:172`) | live | VOL / view 1 | 10 |
| 11 | `program[32]` (Uint16 each) | command words, see 1d | the instrument program (macro) | live | program_view | `klys_set_instrument_program_step` |
| 12 | `prog_period` (Uint8) | 0-255 | ticks per program step; 0 = program off (`music.c:1152`) | next note | P.PRD / view 2 | 11 |
| 13 | `vibrato_speed` (Uint8) | 0-255 | vibrato rate (`music.c:1362`) | live | VIB.S / view 2 | 12 |
| 14 | `vibrato_depth` (Uint8) | 0-255 | vibrato depth (`music.c:1361`) | live | VIB.D / view 2 | 13 |
| 15 | `slide_speed` (Uint8) | 0-255 | portamento speed for pattern slides (`music.c:1501`) | live | SLIDE / view 1 | 8 |
| 16 | `pwm_speed` (Uint8) | 0-255 | PWM rate (`music.c:1120`) | live | PWM.S / view 2 | 14 |
| 17 | `pwm_depth` (Uint8) | 0-255 | PWM depth (`music.c:1121`) | live | PWM.D / view 2 | 15 |
| 18 | `base_note` (Uint8) | 0-95 | note that plays at C-4 (`MIDDLE_C`); with LOCK_NOTE the fixed note (`music.c:1171-1177`) | next note | BASE / view 1 | 6 |
| 19 | `cutoff` (Uint16) | 0-2047 (step 16) | filter cutoff, applied on note when `MUS_INST_SET_CUTOFF` | next note | CUT / view 1 | 16 |
| 20 | `resonance` (Uint8) | 0-3 | filter resonance | next note | RES / view 1 | 17 |
| 21 | `flttype` (Uint8) | 0-2: LP, HP, BP (`cyd.h:74-80`, `FLT_TYPES 3`) | filter type | next note | TYPE / view 1 | 18 |
| 22 | `ym_env_shape` (Uint8) | 0-3 | buzz envelope shape; bits `CYD_YM_ENV_ATT=1`, `CYD_YM_ENV_ALT=2`, CONT always set (`cyd.h:178-180`) | next note | SHAPE / view 1 | 31 |
| 23 | `buzz_offset` (Sint16) | high byte = semitones -99..99, low byte = fine (signed) | buzz detune; GUI edits the two halves separately (`event.c` P_BUZZ_SEMI / P_BUZZ_FINE) | next note | DETUNE + FINE / view 1 | 20 |
| 24 | `fx_bus` (Uint8) | 0-7 | effects bus the channel feeds when FX bit is on (`music.c:1164`) | next note | FXBUS / view 2 | 19 |
| 25 | `vib_shape` (Uint8) | 0-4 `MUS_SHAPE_*` (`music.h:316-324`): sine, ramp up, ramp down, random, square | vibrato waveform | live | VIB.SH / view 2 | 32 |
| 26 | `vib_delay` (Uint8) | 0-255 | ticks before vibrato reaches depth (`music.c:1185,1361`) | next note | V.DEL / view 2 | 33 |
| 27 | `pwm_shape` (Uint8) | 0-4 `MUS_SHAPE_*` | PWM waveform | live | PWM.SH / view 2 | 34 |
| 28 | `name` (char[33]) | 32 chars | instrument name | n/a | instrument_name_view | `klys_set_instrument_name` |
| 29 | `wavetable_entry` (Uint8) | 0-127 | wavetable slot played when WAVE is on (`music.c:1247`) | next note | WAVE + value / view 1 | 23 |
| 30 | `lfsr_type` (Uint8) | 0-15 | POKEY-style LFSR selector; bit 3 picks 9-bit vs 17-bit poly, bits 0-1 the tap set (`cyd.c` `run_lfsrs`, line ~407 and ~491) | next note | POKEY + value / view 1 | 35 |
| 31 | `finetune` (Sint8) | -128..127 | added to the note in 1/256 semitone (`music.c:1180`) | next note | value next to BASE / view 1 | 7 |
| 32 | `fm_flags` (Uint32) | bit set, see 1c | FM modulator flags | next note | (bit) | 36 |
| 33 | `fm_modulation` (Uint8) | 0-127 | modulator level (sets `fm->adsr.volume`, `music.c:1281`) | next note | VOL (FM) / view 2 | 24 |
| 34 | `fm_feedback` (Uint8) | 0-7 | modulator self-feedback (`cydfm.h` "0-7") | next note | FEEDBACK / view 2 | 25 |
| 35 | `fm_wave` (Uint8) | 0-127 | modulator wavetable slot when FM WAVE bit set (`music.c:1255-1257`) | next note | WAVE + value (FM) / view 2 | 37 |
| 36 | `fm_harmonic` (Uint8) | high nibble carrier multiplier 0-15, low nibble modulator multiplier 0-15 | FM frequency ratio (`event.c` P_FM_HARMONIC_CARRIER/_MODULATOR) | next note | MUL (two values) / view 2 | 26 |
| 37-40 | `fm_adsr.a/d/s/r` (Uint8) | a,d,r 0-63, s 0-31 | modulator envelope | next note | ATK DEC SUS REL (FM) / view 2 | 27-30 |
| 41 | `fm_attack_start` (Uint8) | 0-31 | modulator envelope start level | next note | E.START / view 2 | 38 |

Defaults for a new instrument: `mus_get_default_instrument` (`music.c:1984`): flags DRUM|SET_PW|SET_CUTOFF, pw 0x600, cydflags TRIANGLE, adsr a 2 d 24, volume 128, base note 48, prog_period 2, cutoff 2047, slide 0x80, vibrato speed/depth 0x20, every program step `MUS_FX_NOP` (0xFFFE).

### 1a. `flags` bits (`music.h:75-89`)

| Bit | Name | Engine use | GUI |
|---|---|---|---|
| 1 | `MUS_INST_PROG_SPEED_ABSOLUTE` | **not read anywhere in music.c** | not shown |
| 2 | `MUS_INST_DRUM` | first tick plays noise, then the instrument waveform (`music.c:1166`, `:1319`) | DRUM |
| 4 | `MUS_INST_INVERT_VIBRATO_BIT` | vibrato on unless the pattern's vibrato bit is set (`music.c:1397`) | VIB |
| 8 | `MUS_INST_LOCK_NOTE` | always play `base_note` (`music.c:1171`) | L (next to BASE) |
| 16 | `MUS_INST_SET_PW` | load `pw` on note | SET PW |
| 32 | `MUS_INST_SET_CUTOFF` | load `cutoff`/`resonance` on note | SET CUT |
| 64 | `MUS_INST_YM_BUZZ` | buzz on: sets `CYD_CHN_ENABLE_YM_ENV`, shape, offset (`music.c:1225-1235`) | BUZZ |
| 128 | `MUS_INST_RELATIVE_VOLUME` | instrument volume scales the pattern volume (`music.c:1545`) | RELATIVE |
| 256 | `MUS_INST_QUARTER_FREQ` | quarter frequency (`music.c:1180`) | 1/4TH |
| 512 | `MUS_INST_WAVE_LOCK_NOTE` | wavetable plays at its own base note (`music.c:249`) | L (next to WAVE) |
| 1024 | `MUS_INST_NO_PROG_RESTART` | program keeps running on a new note | NO RESTART |
| 2048 | `MUS_INST_MULTIOSC` | all 3 sub-oscillators follow the arpeggio (`music.c:219,271`) | MULTIOSC |

### 1b. `cydflags` bits (`cyd.h:82-100`)

User bits (GUI label): NOISE 1 (NOI), PULSE 2 (PUL), TRIANGLE 4 (TRI), SAW 8 (SAW), SYNC 16 (SYNC), KEY_SYNC 64 (KSYNC, also resets PWM phase, `music.c` trigger), METAL 128 (METAL), RING_MODULATION 256 (RING MOD), FILTER 512 (FILTER), FX 1024 (FX), WAVE 4096 (WAVE), WAVE_OVERRIDE_ENV 8192 (OENV), LFSR 16384 (POKEY), FM 32768 (FM). 14 bits.

Engine-managed, not shown by the GUI: GATE 32 (set on note-on / release), YM_ENV 2048 (derived from `MUS_INST_YM_BUZZ` at trigger, `music.c:1228/1235`).

### 1c. `fm_flags` bits (`cyd.h:102-108`)

`CYD_FM_ENABLE_WAVE` (4096) is the only bit `cydfm.c` reads (`cydfm.c:23`) and the only one the GUI shows (FM WAVE). `CYD_FM_ENABLE_TRIANGLE/PULSE/SAW` are declared but have no reader.

### 1d. Program command set

32 steps of 16 bits. Execution: `mus_exec_prog_tick` (`music.c:983`), commands through `do_command` (`music.c:358`). Bit 15 (0x8000) on a non-`0xFxxx` word = "run the next step on the same tick" (the GUI draws `|` vs a dot; `music.c:1044`, `:1073`; Space toggles it, `event.c edit_program_event`). `.` writes `MUS_FX_NOP`; Insert/Delete shift the list and fill with NOP. A free step is `MUS_FX_NOP` (0xFFFE), **not 0**: 0x0000 is "Arp +0".

Instruction table (`command.c:36-98`, mask in brackets): PrgEnd FFFF, Nop FFFE, Goto FFxx [ff00], Begin (loop label) FDxx, Loop FExx (count), Arp 00xx (relative note, F0/F1 = external arp 1/2) [7f00], AbsArp 40xx (0-95), ExtArp 10xx, PortUp 01xx, PortDn 02xx, PortUpC 05xx, PortDnC 06xx, Delay 0EDx, Vibrato 04xx, Slide 03xx, PortUpST 11xx, PortDnST 12xx, CutoffUp 21xx, CutoffDn 22xx, Cutoff 29xx, CutoffAHX 2Cxx, Resonance 2Ax (0-3), FltType 2Bx (0-2), PWDn 07xx, PWUp 08xx, PW 09xx, Volume 0Cxx, GlobFade 1Axx, GlobVol 1Dxx, ChnVol 1Cxx, Waveform 0Bxx (`MUS_FX_WAVE_*` bits, `music.h:91-99`), Wavetable 3Bxx, SetFxBus 1Bxx, SetRingSrc 7Bxx, SetSyncSrc 7Axx, SetDnSmp 1Exx, Speed 0Fxx, Rate 1Fxx, PatLoop 0Dxx, PatSkip 2Dxx, Release 7Cxx, Restart 7Dxx, VolFade 0Axx, VolUpFine 0EBx, VolDnFine 0EAx, PortUpFine 0E1x, PortDnFine 0E2x, NoteCut 0ECx, Retrig 0E9x, WaveOffs 5xxx [7000], SetPan 18xx, PanLeft 17xx, PanRight 19xx, BuzzUp 31xx, BuzzDn 32xx, BuzzShape 3Fx (0-3), BuzzFine 39xx, CutFine 6xxx [7000], BuzzSemi 3Axx, FMMod 33xx, FMFB 34x, Mult 35xx, FMWave 36xx. 63 rows; command words for the enum are `music.h:232-298`.

The GUI's program list shows per step: playing marker, hex word (`%04X`, bit 15 masked off unless the word is `0xFxxx`), chain marker, and a decoded description (note name for Arp/AbsArp, `EXTn` for F0/F1, else the instruction name) (`view.c program_view`).

## 2. How the original editor groups and labels the fields

`instrument_view` (left panel, `view.c:1073-1224`), separators in order:

1. BASE note + finetune + L (lock note); DRUM; KSYNC; VIB (invert vibrato); SET PW; SET CUT; SLIDE.
2. PUL + pulse width; SAW; TRI; NOI; METAL; POKEY + LFSR type; 1/4TH.
3. WAVE + entry; OENV; L (wave lock note).
4. VOL; RELATIVE; ATK; DEC; SUS; REL.
5. BUZZ; DETUNE (semitones); SHAPE; FINE.
6. SYNC; SRC; RING MOD; SRC.
7. FILTER; TYPE (LP/HP/BP); CUT; RES.

`instrument_view2` (right panel, `view.c:1226-1297`): FX; FXBUS; VIB.S; VIB.D; VIB.SH; V.DEL; PWM.S; PWM.D; PWM.SH; P.PRD; NO RESTART; MULTIOSC; separator; FM; VOL (modulator level); FEEDBACK; MUL carrier + modulator; ATK; DEC; SUS; REL; E.START; WAVE + entry.

Program list: own panel (`program_view`). Instrument list + name: `instrument_list`, `instrument_name_view`. 65 controls in total (`event.h:74-138`), all mapped in the plan.

## 3. How DEViLBOX holds klystrack instruments today

- **Parser** `src/lib/import/formats/KlysParser.ts` `parseKlystrack`: reads only the song header; builds `InstrumentConfig`s `{ id: i + 1, name: '', synthType: 'KlysSynth' }` and stub `klysNative.instruments` with placeholder values (e.g. `adsr.s: 127`, `cutoff: 255`, `program: []`) that the engine later replaces. KLYS-CONFORM is editing this file.
- **Native model** `useFormatStore.klysNative: KlysNativeData` (`src/stores/useFormatStore.ts:64`), instrument type `KlysNativeInstrument` (`src/types/tracker.ts:731-769`, nested `fm` object). Persisted in a project save by `getNativeEngineMetaForExport` (`src/lib/export/exporters.ts:139`).
- **Engine read-back**: the worklet calls `klys_get_instrument_data` per instrument (`public/klystrack/Klystrack.worklet.js:344-410`) and posts `songData` with a **flat** shape (`fmFlags`, `fmModulation`...; `KlysEngine.ts` `KlysSongData`).
- **Two writers of `klysNative` from `songData`, with different shapes**:
  1. `KlysView.tsx` `onSongData` (lines ~68-97) nests the FM fields into `fm`.
  2. `wasmEngineRegistry.ts` Klystrack `onStarted` (lines ~155-177) stores the flat engine objects as-is (no `fm`).
  Whichever runs last wins; after (2), `inst.fm` is undefined and the current editor's `inst.fm.flags` would throw. (Code reading only; not reproduced live.)
- **Editor today** `src/components/klystrack/KlysInstrumentEditor.tsx` (355 lines), mounted only from KlysView's in-view Inst button, which KLYS-CONFORM is removing. In the shared instrument panel, `KlysSynth` maps to `'wasm-info'` (`UnifiedInstrumentEditor.tsx:221`), i.e. an info card, no editor. Defects in the current editor:
  - raw `<input type="range">`, `type="number"`, `type="checkbox"`, inline `<button>`: all off the control allowlist; no `Knob`, no `paramKey`.
  - wrong ranges: ADSR max 32 (true 63/31), volume max 128 (255), pw max 4095 (2047), cutoff max 4095 (2047), FM feedback max 15 (7), FM modulation max 255 (127), FM attack start max 255 (31), FX bus max 3 (7), LFSR type max 255 (15), YM shape max 15 (3), buzz offset -128..127 (Sint16, semitone + fine halves), harmonic as one 0-255 value (two nibbles).
  - `KLYS_FILTER_TYPES` has a fourth `'LP+HP'` that the engine does not have (`klysParams.ts`).
  - shows GATE and YM_ENV (engine-managed) and the three dead FM waveform bits as editable checkboxes.
  - pads the program with 0 and counts `p !== 0` as used: 0 is "Arp +0"; empty is 0xFFFE.
  - labels like "Vib Spd", "Sync Src", "Prog Period", "Oscillator (CYD_CHN_*)": abbreviations and C names in the UI.
- **Params table** `src/engine/klystrack/klysParams.ts`: `KLYS_PARAM_IDS` (field -> wrapper paramId 0-38) is correct against `klys_set_instrument_param`; bit tables and filter list as above.
- **KlysSynth** `src/engine/klystrack/KlysSynth.ts`: `set(param, v)` writes **instrument 0** always and does not touch the store (so MIDI-driven edits are lost on save and hit the wrong instrument). `triggerAttack` calls `keyOnWholeSongPlayer` (key plays nothing, owner list K3).
- **MIDI map** `KLYSTRACK_NKS_PARAMETERS` (`src/midi/performance/remainingParameterMaps.ts:332`) ids `klystrack.attack` etc.; no explicit route, so `parameterRouter.routeParameterToEngine` falls back to `sendDirectToSynth(id, '<short>')` -> `KlysSynth.set`.

## 4. WASM wrapper: what can be set live

Exports (`klystrack-wasm/common/KlysWrapper.c`, all `EMSCRIPTEN_KEEPALIVE`, listed in `CMakeLists.txt EXPORTED_FUNCTIONS`): init/load/free/decode/pause/stop; getters for position, speed, rate, channels, note-start counts, channel levels, channel tap (new, KLYS-CONFORM), song length, instruments, patterns, pattern length, title, instrument name, loop point, master volume, flags, pattern data, sequence data, instrument data, track status, is-playing; `klys_save_song`; setters `klys_set_pattern_step`, `klys_set_sequence_entry`, `klys_set_instrument_param`, `klys_set_instrument_name`, `klys_set_channel_gain`, `klys_set_instrument_program_step`.

`klys_set_instrument_param(idx, paramId, value)` covers **every** scalar member: ids 0-3 adsr, 4 flags, 5 cydflags, 6 base_note, 7 finetune, 8 slide_speed, 9 pw, 10 volume, 11 prog_period, 12-15 vibrato/pwm speed+depth, 16 cutoff, 17 resonance, 18 flttype, 19 fx_bus, 20 buzz_offset, 21 ring_mod, 22 sync_source, 23 wavetable_entry, 24 fm_modulation, 25 fm_feedback, 26 fm_harmonic, 27-30 fm_adsr, 31 ym_env_shape, 32 vib_shape, 33 vib_delay, 34 pwm_shape, 35 lfsr_type, 36 fm_flags, 37 fm_wave, 38 fm_attack_start. Name and program steps have their own setters. **No instrument field lacks a setter.** The setters do not clamp; ranges must be enforced on the TypeScript side.

Missing for a proper editor (none is a field setter):

| Need | Missing export |
|---|---|
| Restore a saved project's edited instruments into a freshly loaded song (one call per instrument instead of 41) | `klys_set_instrument_data(idx, buf, len)`, inverse of `klys_get_instrument_data` |
| Wavetable picker labels (`song->wavetable_names`, `music.c:2484-2510`) and which slots hold samples | `klys_get_num_wavetables()`, `klys_get_wavetable_name(i)`, `klys_get_wavetable_info(i, out)` (samples, loop, base note) |
| Hear the instrument while editing (original: `play_the_jams` -> `mus_trigger_instrument`, `event.c:564`) | `klys_preview_note_on(inst, note)`, `klys_preview_note_off()` on a channel the song does not use (`cyd_init` reserves `CYD_MAX_CHANNELS` = 32, `klys_init`) |
| Playing-step marker in the program list (original reads `channel.program_tick`) | `klys_get_channel_program(out, maxCh)` (instrument index, program_tick, program-running flag per channel) |

## 5. Save path (.kt round trip)

`KlysExporter.exportAsKlystrack` -> `KlysEngine.serializeSong()` -> worklet `_klys_save_song` -> `save_instrument` writes every member in loader order (`music.c mus_load_instrument_RW`, v27 layout; `fm_attack_start` before `fm_wave` matches the loader). Falls back to the original bytes when no engine instance exists. Edits therefore reach the file only if they reached the WASM.

Defect: `save_instrument` writes `progsteps` = last step **not equal to 0**; the reference writes last step **not equal to `MUS_FX_NOP`** (`diskop.c:286-288`). Effects: every instrument saves all 32 steps (unused NOPs included, larger file than klystrack writes), and a program whose trailing steps are `0x0000` (Arp +0) loses them, which reload as NOP. Exporter round-trip ratchet: `src/lib/export/__tests__/exporterRoundtrip.ratchet.json` entry "KT (KlysExporter)".

Project save/restore: the project stores `klysFileData` (original bytes) and `klysNative`. On reopen the original bytes load into the WASM and the `songData` writers overwrite `klysNative.instruments` with the file's values, so instrument edits made before the project save come back as the original values (code reading; not reproduced live).

## 6. Test infrastructure available

- `src/engine/__tests__/workletHarness.ts` (`startWorklet('klystrack', 'Klystrack', klysTransform)`, `songBuffer`, `stereoOutputs`) drives the real Klystrack worklet + WASM in vitest; used by `klystrackHeaderMatchesTheEngine.test.ts` and `klystrackFollowsTheEngine.test.tsx`.
- `@testing-library/react` + happy-dom; `Knob` renders `role="slider"` with `aria-label` = label and handles ArrowUp/ArrowDown (`Knob.tsx` `handleKeyDown`).
- Fixture: `public/data/songs/klystrack/Ocean Loader III.kt`.
- `test:ci` is an explicit file list in `package.json`; no klystrack test is in it today (checked by grepping the script text for `klystrack`).
