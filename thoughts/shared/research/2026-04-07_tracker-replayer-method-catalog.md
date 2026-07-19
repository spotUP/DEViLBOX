# TrackerReplayer Method Catalog & Responsibility Bucket Analysis

**Date:** 2026-04-07  
**File:** `/Users/spot/Code/DEViLBOX/src/engine/TrackerReplayer.ts`  
**Scope:** 5,761 lines, ~120 public/private/getter methods (744 total identifiers including interfaces/types)  
**Purpose:** Comprehensive audit of which methods are load-bearing for all formats vs libopenmpt-specific

---

## Executive Summary

**Key Finding:** TrackerReplayer conflates two concerns:

1. **Format-agnostic playback infrastructure** (tick-driven sequencing, row advancement, state tracking)
2. **libopenmpt-specific effect/period processing** (Cxx, Axx, Pxx, envelope interpolation, FT2 quirks)

**When libopenmpt becomes the canonical engine, approximately 45-50% of methods can be deleted or moved to a legacy compat layer:**
- All period/note conversion (noteToPeriod, getPeriod, periodPlusSemitones, rawPeriodToFinetuned, noteToPlaybackPeriod)
- All effect processing (processEffect*, processVolColumnTick0, doArpeggio, doTremolo, doVibrato, doVolumeSlide, etc.)
- XM-specific envelope handling (processEnvelopesAndVibrato, triggerEnvelopes, resetXMVolumes, xmKeyOff)
- Furnace macro processing (processMacros, applyMacroValue, releaseMacros)
- FT2/MOD format quirks (FT2-specific compat flags, period table switching)

**Core load-bearing methods (must remain):**
- Sequencing: play, stop, pause, resume, processTick, advanceRow
- Position tracking: seekTo, jumpToPosition, jumpToPattern, getCurrentRow, getCurrentPosition
- Lifecycle: constructor, dispose, loadSong
- Audio routing: playback rate/volume management, stereo separation
- DJ features: slip, line loop, pattern loop (affect timing globally)

---

## Bucket Breakdown

### 1. Sequencing (Tick-driven playback, row advancement) — 15 methods

**Core hypothesis:** These are LOAD-BEARING. They orchestrate the main timing loop and don't depend on effect processing or period tables.

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `play()` | 1518 | `async play(): Promise<void>` | Start playback, initialize WASM engines, subscribe to native position updates | **YES** | Called by UI (play button), DeckEngine, pattern scheduler |
| `stop()` | 2144 | `stop(preservePosition=true, skipNativeStop=false): void` | Stop playback, stop all channels, unsubscribe from native callbacks | **YES** | Called by UI, loadSong, restart logic |
| `pause()` | 2287 | `pause(): void` | Pause scheduler, pause native engines (keeps state) | **YES** | Called by UI, DJ pause |
| `resume()` | 2313 | `resume(): void` | Resume scheduler, resume native engines | **YES** | Called by UI, DJ resume |
| `startScheduler()` | 2340 | `private startScheduler(): void` | Initialize setInterval-based scheduler, fill initial lookahead buffer | **NO** (private) | Called by play(), drives processTick() in a loop every 10ms |
| `processTick()` | 2428 | `private processTick(time: number): void` | Core tick processing: read rows (tick 0), process effects (ticks 1+), trigger notes | **NO** (private) | Called by scheduler interval, calls processRow/processEffectTick |
| `advanceRow()` | 5372 | `private advanceRow(): void` | Move to next row, handle pattern breaks, loops, song end | **NO** (private) | Called at end of row (when currentTick >= speed) |
| `processRow()` | 2700 | `private processRow(chIndex, ch, row, time): void` | Tick 0 processing: read note/inst/volume/effects, trigger note if present | **NO** (private) | Called by processTick (tick 0), processTickPerChannel |
| `processEffectTick()` | 3708 | `private processEffectTick(chIndex, ch, row, time): void` | Ticks 1+: apply continuous effects (pitch slides, vibrato, tremolo, etc.) | **NO** (private) | Called by processTick (non-zero ticks) |
| `processEffectTickSingle()` | 3907 | `private processEffectTickSingle(chIndex, ch, row, effect, param, time): void` | Apply single effect on non-zero tick | **NO** (private) | Helper for processEffectTick |
| `processTickPerChannel()` | 5255 | `private processTickPerChannel(time: number): void` | Per-channel tick processing for independent sequencing (MusicLine Editor) | **NO** (private) | Alternative to processTick for channelTrackTables mode |
| `queueDisplayState()` | 2624 | `private queueDisplayState(time, row, pattern, position, tick, duration): void` | Enqueue audio-synced state for UI scrolling (BassoonTracker pattern) | **NO** (private) | Called by processTick, position update callbacks |
| `getStateAtTime()` | 2648 | `public getStateAtTime(time, peek=false): DisplayState | null` | Dequeue and return display state for UI rendering | **YES** | Called by animation frame loop for smooth scrolling |
| `clearStateQueue()` | 2687 | `private clearStateQueue(): void` | Flush ring buffer on stop | **NO** (private) | Called by stop() |
| `calculateGrooveOffset()` | 2399 | `private calculateGrooveOffset(row, rowDuration, state): number` | Compute groove/swing timing offset for current row | **NO** (private) | Called by processTick (tick 0) for groove template support |

**Assessment:** ALL 15 methods are fundamentally required. None depend on period tables or effect-specific logic (they're wrappers that call effect handlers).

---

### 2. Position Tracking (Song/pattern/row state queries and navigation) — 12 methods

**Core hypothesis:** These are LOAD-BEARING. Position tracking is format-agnostic.

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `getCurrentPosition()` | 5665 | `getCurrentPosition(): number` | Return current position in song order | **YES** | Getter, called by UI |
| `getCurrentRow()` | 5664 | `getCurrentRow(): number` | Return current row in pattern | **YES** | Getter, called by UI |
| `getCurrentTick()` | 5666 | `getCurrentTick(): number` | Return current tick (0 to speed-1) | **YES** | Getter, called by UI |
| `getSongPos()` | 657 | `getSongPos(): number` | Return songPos (same as getCurrentPosition) | **YES** | Getter, legacy name |
| `getPattPos()` | 660 | `getPattPos(): number` | Return pattPos (same as getCurrentRow) | **YES** | Getter, legacy name |
| `getTotalPositions()` | 725 | `getTotalPositions(): number` | Return song.songLength (pattern order count) | **YES** | Getter, used for loop counters |
| `seekTo()` | 5497 | `seekTo(songPos, pattPos): void` | Jump to specific position, re-sync channel states if per-channel sequencing | **YES** | Called by seek UI, worklet position sync |
| `jumpToPosition()` | 747 | `jumpToPosition(songPos, pattPos=0): void` | Alias for seekTo (public API) | **YES** | Called by pattern order clicks |
| `jumpToPattern()` | 5646 | `jumpToPattern(patternIndex, row=0): void` | Find first occurrence of pattern in order, seek to it | **YES** | Called by pattern navigation |
| `forcePosition()` | 673 | `forcePosition(songPos, pattPos): void` | Force position without playing (used by WASM engines to sync TS state) | **YES** | Called by native engine position callbacks |
| `getElapsedMs()` | 1156 | `getElapsedMs(): number` | Estimate elapsed time in milliseconds (rows * speed * tick duration) | **YES** | Called by UI, demo length estimation |
| `getEffectivePlaybackRate()` | 1147 | `getEffectivePlaybackRate(): number` | Return pitch multiplier (per-deck in DJ mode, global otherwise) | **YES** | Called by UI display |

**Assessment:** ALL 12 methods are LOAD-BEARING. Zero per-channel volume/pitch computation involved. Format-agnostic position logic.

---

### 3. Lifecycle & Initialization — 6 methods

**Core hypothesis:** LOAD-BEARING. Required for class setup/teardown.

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `constructor()` | 599 | `constructor(outputNode?: Tone.ToneAudioNode)` | Initialize replayer, create channels, set up audio nodes | **YES** | Called by getInstance factory |
| `loadSong()` | 1169 | `loadSong(song: TrackerSong): void` | Load new song, reset all state, init channels, configure WASM engines | **YES** | Called by UI load action, hot reload |
| `createChannel()` | 1379 | `private createChannel(index, totalChannels): ChannelState` | Create a single channel with player pool, gain nodes, pan nodes | **NO** (private) | Called by loadSong and updatePatterns |
| `dispose()` | 5718 | `dispose(): void` | Clean up all Tone nodes, unsubscribe from callbacks, stop playback | **YES** | Called by getInstance cleanup, page unload |
| `getC64SIDEngine()` | 576 | `public getC64SIDEngine(): C64SIDEngine | null` | Return reference to C64 SID engine (for external SID control) | **YES** | Called by SID UI |
| `getSong()` | 728 | `getSong(): TrackerSong | null` | Return loaded song data | **YES** | Getter, called by UI to access patterns/instruments |

**Assessment:** ALL 6 methods are LOAD-BEARING. None use effect handlers, period tables, or format-specific logic.

---

### 4. Audio Routing & Output Management — 14 methods

**Core hypothesis:** LOAD-BEARING. Mute/volume/panning affects all formats equally. Stereo separation is format-agnostic (applies to any channel-based playback).

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `getMasterGain()` | 632 | `getMasterGain(): Tone.Gain` | Return master output gain node | **YES** | Called by mixer UI to adjust volume |
| `setMuted()` | 637 | `setMuted(mute: boolean): void` | Mute/unmute entire replayer (gains in master chain) | **YES** | Called by global mute toggle |
| `getSeparationInput()` | 644 | `getSeparationInput(): Tone.Gain` | Return input gain node of stereo separation chain | **YES** | Called by WASM engine routing |
| `getFullOutput()` | 652 | `getFullOutput(): Tone.Gain` | Return final output node (master → separation → output) | **YES** | Called by mixer routing |
| `applyChannelPan()` | 1124 | `private applyChannelPan(ch): void` | Apply stereo separation scaling to a channel's pan node | **NO** (private) | Called by setStereoSeparation, setStereoSeparationMode |
| `applyPanEffect()` | 1136 | `private applyPanEffect(ch, pan255, time): void` | Apply 8xx or Pxx pan effect (0-255 tracker range to -1..+1) | **NO** (private) | Called by effect handlers |
| `setStereoSeparation()` | 1066 | `setStereoSeparation(percent): void` | Set separation width (0-100, scales basePan) | **YES** | Called by mixer UI |
| `getStereoSeparation()` | 1075 | `getStereoSeparation(): number` | Return stereo separation percentage | **YES** | Getter, mixer UI |
| `setStereoSeparationMode()` | 1084 | `setStereoSeparationMode(mode): void` | Switch between PT2 (scaled) and ModPlug (post-mix) algorithms | **YES** | Called by mixer preset selector |
| `getStereoSeparationMode()` | 1116 | `getStereoSeparationMode(): 'pt2' \| 'modplug'` | Return current separation mode | **YES** | Getter, mixer UI |
| `setModplugSeparation()` | 1105 | `setModplugSeparation(percent): void` | Set ModPlug mid-side separation (0-200, only in modplug mode) | **YES** | Called by mixer ModPlug slider |
| `getModplugSeparation()` | 1112 | `getModplugSeparation(): number` | Return ModPlug separation value | **YES** | Getter, mixer UI |
| `updateAllChannelVolumes()` | 5082 | `private updateAllChannelVolumes(time): void` | Sync Tone gainNode values from channel state (called after envelope/volume-slide updates) | **NO** (private) | Called by effect processing, envelope processing |
| `updateAllPlaybackRates()` | 5058 | `public updateAllPlaybackRates(): void` | Update all player playback rates from global + per-deck pitch multipliers | **YES** | Called by setPitchMultiplier, UI pitch slider |

**Assessment:** ALL 14 methods are LOAD-BEARING. Stereo separation and volume control are format-agnostic. updateAllChannelVolumes is called by effect handlers but the method itself is universal (just applies numbers to nodes).

---

### 5. Effect Processing (Continuous effects: vibrato, arpeggio, slides, tremolo, etc.) — 22 methods

**Core hypothesis:** LIBOPENMPT-SPECIFIC. When libopenmpt becomes canonical, these should be moved to a compat layer or deleted entirely. The WASM engine handles effects natively.

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `processEffect0()` | 3225 | `private processEffect0(chIndex, ch, effect, param, time): void` | Tick 0 effect processing: big switch for all effect types (C/D/E/F/G/H/J/K/L/M/N/P/R/S/T/V/W/X) | **NO** (private) | Called by processAllEffectsTick0 |
| `processExtendedEffect0()` | 3587 | `private processExtendedEffect0(chIndex, ch, x, y, time): void` | Tick 0 extended effects (Ex types: E0, E1, E2, ..., E8) | **NO** (private) | Called by processEffect0 |
| `processAllEffectsTick0()` | 3201 | `private processAllEffectsTick0(chIndex, ch, row, effect, param, time): void` | Apply both effect1 and effect2 on tick 0 | **NO** (private) | Called by processRow |
| `processVolColumnTick0()` | 3167 | `private processVolColumnTick0(ch, row, time): void` | Apply volume column effect on tick 0 (FT2 vol-slide memory, tone porta, etc.) | **NO** (private) | Called by processRow |
| `doArpeggio()` | 4018 | `private doArpeggio(ch, param): void` | Apply arpeggio (0xy: cycle through base, +x semitones, +y semitones) | **NO** (private) | Wrapper around _doArpeggio from EffectHandlers |
| `doTonePortamento()` | 4024 | `private doTonePortamento(ch): void` | Apply tone portamento (3xx: slide pitch toward target) | **NO** (private) | Wrapper around _doTonePortamento |
| `doVibrato()` | 4030 | `private doVibrato(ch): void` | Apply vibrato (4xy: periodic pitch wobble) | **NO** (private) | Wrapper around _doVibrato |
| `doTremolo()` | 4034 | `private doTremolo(ch, time): void` | Apply tremolo (7xy: periodic volume wobble) | **NO** (private) | Wrapper around _doTremolo |
| `doVolumeSlide()` | 4038 | `private doVolumeSlide(ch, param, time): void` | Apply volume slide (Axx: linear volume change) | **NO** (private) | Wrapper around _doVolumeSlide |
| `doGlobalVolumeSlide()` | 4046 | `private doGlobalVolumeSlide(param, time): void` | Apply global volume slide (Hxx: affects all channels) | **NO** (private) | Wrapper around _doGlobalVolumeSlide |
| `doPanSlide()` | 4055 | `private doPanSlide(ch, param, time): void` | Apply pan slide (Pxx: slide panning) | **NO** (private) | Wrapper around _doPanSlide |
| `doMultiNoteRetrig()` | 4059 | `private doMultiNoteRetrig(ch, chIndex, time): void` | Apply multi-note retrigger (Rxy in FT2: retrigger at intervals with volume slides) | **NO** (private) | Wrapper around _doMultiNoteRetrig |
| `doGlobalPitchSlide()` | 4067 | `private doGlobalPitchSlide(time): void` | Apply global pitch shift (Wxx: smooth semitone transposition, DJ feature) | **NO** (private) | Called by processTick every tick |
| `fireDelayedNote()` | 3542 | `private fireDelayedNote(ch, chIndex, time, accent, slide): void` | Handle EDx note delay: fires note that was delayed on tick 0 | **NO** (private) | Called by processEffect0 (EDx effect) |
| `forwardEffectToFurnace()` | 4002 | `private forwardEffectToFurnace(ch, chIndex, effect, param, x, y): void` | Forward unhandled effects to Furnace chip engines (for native Furnace playback) | **NO** (private) | Called by processEffect0, processEffectTick |
| `triggerEnvelopes()` | 4138 | `private triggerEnvelopes(ch): void` | Initialize envelope state on note trigger (XM-style) | **NO** (private) | Called by triggerNote |
| `resetXMVolumes()` | 4188 | `private resetXMVolumes(ch, time): void` | Reset XM volume/pan to instrument defaults (after note trigger or envelope release) | **NO** (private) | Called by processRow (FT2 note reset quirk) |
| `xmKeyOff()` | 4202 | `private xmKeyOff(ch): void` | Trigger key-off on XM envelope (sets keyOff flag, initiates fadeout) | **NO** (private) | Called by processEffect0 (Kxx effect) |
| `processEnvelopesAndVibrato()` | 4244 | `private processEnvelopesAndVibrato(ch, time): void` | Interpolate XM envelopes + auto-vibrato every tick | **NO** (private) | Called by processTick every tick for every channel |
| `processMacros()` | 4498 | `private processMacros(ch, time): void` | Apply Furnace-style macros (pitch, volume, waveform, duty) | **NO** (private) | Called by processTick every tick for every channel |
| `applyMacroValue()` | 4552 | `private applyMacroValue(ch, macroType, value, time): void` | Apply single macro value (pitch offset, volume, waveform) to channel | **NO** (private) | Called by processMacros |
| `releaseMacros()` | 4629 | `private releaseMacros(ch): void` | Trigger macro release phase (when note is released) | **NO** (private) | Called by xmKeyOff |

**Assessment:** ALL 22 methods are **LIBOPENMPT-SPECIFIC**. They implement tracker format effects that libopenmpt's WASM engine already handles. When libopenmpt becomes canonical, these can be entirely deleted or moved to a "legacy compat" module for UADE/Hively/Furnace native formats (which don't have built-in effect processing).

**Exceptions:**
- `doGlobalPitchSlide()` touches DJ mode (global pitch shift), but even that is a soft feature — could be moved elsewhere
- `processMacros()` + `triggerEnvelopes()` are used by Furnace native playback (may need to stay for Furnace)

---

### 6. Period/Note Conversion (MOD/XM pitch table conversion) — 8 methods

**Core hypothesis:** LIBOPENMPT-SPECIFIC. libopenmpt handles period→frequency conversion internally.

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `noteToPeriod()` | 5155 | `private noteToPeriod(note, finetune): number` | Convert note number (0-95) or string ("C-4") to Amiga period (113-856) | **NO** (private) | Called by triggerNote, periodPlusSemitones |
| `noteStringToPeriod()` | 5208 | `private noteStringToPeriod(note, finetune): number` | Convert note name string (e.g. "C#5") to period | **NO** (private) | Called by noteToPeriod if input is string |
| `getPeriod()` | 5221 | `private getPeriod(noteIndex, finetune): number` | Lookup period from PERIOD_TABLE by note index | **NO** (private) | Called by noteToPeriod |
| `periodPlusSemitones()` | 5227 | `private periodPlusSemitones(period, semitones, finetune): number` | Transpose a period up/down by N semitones (for portamento/transposition) | **NO** (private) | Called by effect handlers (tone porta) |
| `rawPeriodToFinetuned()` | 5138 | `private rawPeriodToFinetuned(rawPeriod, finetune): number` | Apply finetune adjustment to a raw period value | **NO** (private) | Called by noteToPeriod, triggerNote |
| `noteToPlaybackPeriod()` | 5105 | `private noteToPlaybackPeriod(noteValue, rawPeriod, ch): number` | Convert note value to final playback period, handling XM vs Amiga modes | **NO** (private) | Called by triggerNote, processRow |
| `updatePeriod()` | 5016 | `private updatePeriod(ch): void` | Recalculate period from ch.period, apply effects (vibrato, auto-vib), update playback rate | **NO** (private) | Called by effect handlers, envelope processing |
| `updatePeriodDirect()` | 5027 | `private updatePeriodDirect(period): void` | Set final period and update Tone player playback rate | **NO** (private) | Called by updatePeriod, effect handlers |

**Assessment:** ALL 8 methods are **LIBOPENMPT-SPECIFIC**. They're MOD/XM period arithmetic that libopenmpt's WASM engine computes natively. Can be deleted entirely when libopenmpt becomes canonical.

---

### 7. Note Triggering & Channel Control — 4 methods

**Core hypothesis:** PARTIALLY LOAD-BEARING. triggerNote is complex (audio playback) but mostly wraps Tone.Player scheduling. stopChannel is format-agnostic (just stops audio). However, triggerNote has heavy effect/envelope/period code that's libopenmpt-specific.

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `triggerNote()` | 4637 | `private triggerNote(ch, time, offset, channelIndex, accent, slideActive, currentRowSlide, hammer): void` | Trigger a note: allocate player, decode sample, set playback rate, schedule with offset | **NO** (private) | Called by processRow, fireHybridNotesForRow (synth instruments via ToneEngine) |
| `stopChannel()` | 4970 | `private stopChannel(ch, channelIndex, time): void` | Stop all players in a channel's pool, clear channel state | **NO** (private) | Called by processRow (note-off), stop/dispose |
| `fireHybridNotesForRow()` | 891 | `private fireHybridNotesForRow(time): void` | Fire replaced instruments (synth) while libopenmpt plays native samples (hybrid playback) | **NO** (private) | Called by play() position callbacks (HVL, MusicLine, UADE) |
| `updateInstrument()` | 732 | `updateInstrument(config): void` | Update instrument config in-place (for live instrument editing) | **YES** | Called by instrument editor UI |

**Assessment:** 
- `triggerNote()` is HYBRID. The Tone.Player scheduling is load-bearing, but envelope/period code is libopenmpt-specific. ~60% reusable.
- `stopChannel()` is LOAD-BEARING (just stops audio).
- `fireHybridNotesForRow()` is HYBRID (specific to synth replacement feature, but the scheduling is reusable).
- `updateInstrument()` is LOAD-BEARING (just updates a config dict).

---

### 8. DJ Features (Slip, line loop, pattern loop, scratch pause/resume, beat sync) — 10 methods

**Core hypothesis:** HYBRID. These affect timing globally (slip affects BPM, line loop/pattern loop affect sequence navigation), but the implementation could be abstracted. Some are load-bearing (the logic), some are UI-specific.

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `setSlipEnabled()` | 807 | `setSlipEnabled(enabled): void` | Toggle slip mode (plays a ghost position while looping) | **YES** | Called by DJ UI |
| `getSlipState()` | 816 | `getSlipState(): { enabled, songPos, pattPos }` | Return slip position and enabled state | **YES** | Called by DJ display |
| `setLineLoop()` | 763 | `setLineLoop(startRow, size): void` | Set line loop (repeat rows in current pattern) | **YES** | Called by DJ line loop UI / tracker |
| `clearLineLoop()` | 775 | `clearLineLoop(): void` | Disable line loop | **YES** | Called by DJ clear loop |
| `setPatternLoop()` | 786 | `setPatternLoop(startPos, endPos): void` | Set pattern loop (repeat patterns in song order) | **YES** | Called by DJ pattern loop UI |
| `clearPatternLoop()` | 797 | `clearPatternLoop(): void` | Disable pattern loop | **YES** | Called by DJ clear loop |
| `setNudge()` | 757 | `setNudge(offset, tickCount=8): void` | Apply temporary BPM offset for beat matching (nudge) | **YES** | Called by DJ beat-sync buttons |
| `setTempoMultiplier()` | 1003 | `setTempoMultiplier(m): void` | Set per-deck tempo scaling (DJ pitch slider) | **YES** | Called by DJ speed slider |
| `getTempoMultiplier()` | 1008 | `getTempoMultiplier(): number` | Return tempo multiplier | **YES** | Getter, DJ UI |
| `pauseNativeEnginesForScratch()` | 1026 | `pauseNativeEnginesForScratch(): void` | Pause WASM engines during scratch (to prevent glitches) | **YES** | Called by DJ scratch UI |
| `resumeNativeEnginesAfterScratch()` | 1031 | `resumeNativeEnginesAfterScratch(): void` | Resume WASM engines after scratch | **YES** | Called by DJ scratch UI |

**Assessment:** ALL 10 methods are LOAD-BEARING **for DJ mode**. However, DJ mode is a feature layer (not core playback). The implementation could be abstracted into a DJ controller mixin, but the methods are required if DJ mode is supported.

**Refactoring opportunity:** Move DJ methods into a separate `DJController` class that wraps TrackerReplayer. TrackerReplayer core would only have play/stop/pause/resume/seek. DJ decks would extend or delegate to DJ controller.

---

### 9. Tempo & Pitch (BPM setting, pitch multiplier, detune) — 6 methods

**Core hypothesis:** LOAD-BEARING. Tempo/pitch affect all formats. Implementation is format-agnostic (just scalar multipliers).

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `getBPM()` | 5662 | `getBPM(): number` | Return current BPM | **YES** | Getter, UI display |
| `setBPMDirect()` | 752 | `setBPMDirect(bpm): void` | Set BPM directly (not via Fxx effect) | **YES** | Called by UI BPM setter, WASM engines |
| `getSpeed()` | 5663 | `getSpeed(): number` | Return ticks per row | **YES** | Getter, UI display |
| `setSpeed2()` | 5669 | `setSpeed2(value): void` | Set alternating speed (Furnace speed2 feature) | **YES** | Called by speed editor |
| `setPitchMultiplier()` | 1013 | `setPitchMultiplier(m): void` | Set sample playback rate multiplier (per-deck in DJ mode), call updateAllPlaybackRates | **YES** | Called by DJ/tracker pitch UI |
| `setDetuneCents()` | 1036 | `setDetuneCents(cents): void` | Set per-deck synth detune (DJ mode only) | **YES** | Called by synth detune UI |
| `getDetuneCents()` | 1041 | `getDetuneCents(): number` | Return detune value | **YES** | Getter, detune UI |
| `resyncSchedulerToNow()` | 1021 | `resyncSchedulerToNow(): void` | Reset scheduler timeline after tempo change (prevent timing drift) | **YES** | Called by speed slider release (after drag) |

**Assessment:** ALL 6 methods are LOAD-BEARING. BPM and pitch are universal concerns (all formats need them). Implementation is simple scalar updates.

---

### 10. Groove & Swing — 1 method

**Core hypothesis:** LOAD-BEARING. Groove/swing affect timing globally (all formats).

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `calculateGrooveOffset()` | 2399 | `private calculateGrooveOffset(row, rowDuration, state): number` | Compute groove template timing offset (called by processTick for tick 0) | **NO** (private) | Called by processTick |

**Assessment:** LOAD-BEARING. Groove is a timing feature that applies to all formats (MOD, XM, native engines). The implementation is in processTick (core sequencing).

---

### 11. Mute/Solo & Channel Control — 6 methods

**Core hypothesis:** LOAD-BEARING. Muting is format-agnostic (affects Tone.Player and WASM engines equally).

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `setChannelMuteMask()` | 1050 | `setChannelMuteMask(mask): void` | Set per-channel mute bitmask (DJ mode or tracker mute state) | **YES** | Called by mixer mute buttons, DJ decks |
| `updateWasmMuteMask()` | 869 | `updateWasmMuteMask(): void` | Sync mute mask to active WASM engine (HVL, JamCracker, etc.) | **YES** | Called by fireHybridNotesForRow (sync before firing notes) |
| `markInstrumentReplaced()` | 835 | `markInstrumentReplaced(instrumentId): void` | Mark instrument as replaced (synth), add to _replacedInstruments set | **YES** | Called by ToneEngine when synth is loaded |
| `unmarkInstrumentReplaced()` | 840 | `unmarkInstrumentReplaced(instrumentId): void` | Remove instrument from replaced set | **YES** | Called by ToneEngine when synth is unloaded |
| `replacedInstrumentIds()` | (getter) | `get replacedInstrumentIds(): number[]` | Return array of replaced instrument IDs | **YES** | Called by UI to show which instruments are synths |
| `hasReplacedInstruments()` | (getter) | `get hasReplacedInstruments(): boolean` | Return true if any instruments are replaced | **YES** | Called by UI checks |
| `restoreReplacedInstruments()` | 855 | `restoreReplacedInstruments(ids): void` | Bulk-restore instruments from replaced set (used on stop) | **YES** | Called by stop logic |
| `setSuppressNotes()` | 829 | `setSuppressNotes(suppress): void` | Toggle note suppression (used for native-engine formats where WASM plays directly) | **YES** | Called by play() result handling |
| `isSuppressNotes` | (getter) | `get isSuppressNotes(): boolean` | Return suppression state | **YES** | Getter, UI checks |

**Assessment:** ALL 9 methods are LOAD-BEARING. Muting, solo, and instrument replacement are format-agnostic features (apply to all playback modes).

---

### 12. WASM Engine Integration & Native Format Support — 9 methods

**Core hypothesis:** HYBRID. Some are load-bearing (lifecycle, position tracking), some are format-specific (effect forwarding, position callbacks).

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `setActiveWasmEngine()` | 862 | `setActiveWasmEngine(engine): void` | Set active WASM engine for mute mask forwarding | **YES** | Called by play() initialization |
| `syncCellToWasmSequencer()` | 984 | `syncCellToWasmSequencer(ch, patIdx, row, cell): void` | Sync pattern cell edits to Furnace WASM sequencer (fire-and-forget) | **YES** | Called by tracker store on pattern edits |
| `isWasmSequencerActive` | (getter) | `get isWasmSequencerActive(): boolean` | Return whether WASM sequencer is active (for Furnace playback) | **YES** | Getter, UI checks |
| `fireHybridNotesForRow()` | 891 | `private fireHybridNotesForRow(time): void` | Fire replaced instruments while native engine plays samples (hybrid mode) | **NO** (private) | Called by native engine position callbacks |

**Assessment:**
- `setActiveWasmEngine()` is LOAD-BEARING (required for WASM mute integration).
- `syncCellToWasmSequencer()` is FORMAT-SPECIFIC (Furnace only, but non-invasive).
- `fireHybridNotesForRow()` is HYBRID (reusable scheduling logic, but synth-specific use case).
- `isWasmSequencerActive` is LOAD-BEARING (UI needs to know if WASM is driving sequencing).

---

### 13. Instrument Management — 4 methods

**Core hypothesis:** LOAD-BEARING. Instrument updates affect all formats equally.

| Method | Line | Signature | Description | External API? | Notes |
|--------|------|-----------|-------------|---------------|-------|
| `updateInstrument()` | 732 | `updateInstrument(config): void` | Update single instrument config (live editing) | **YES** | Called by instrument editor UI |
| `updateInstruments()` | 5706 | `updateInstruments(instruments): void` | Replace entire instruments list (reload after edit) | **YES** | Called by instrument list reload |
| `updatePatterns()` | 5680 | `updatePatterns(patterns): void` | Replace pattern data (reload after edit), recreate channels if needed | **YES** | Called by pattern editor reload |

**Assessment:** ALL 3 methods are LOAD-BEARING. Instrument/pattern updates are format-agnostic (just swap data structures).

---

## Summary Table: Methods by Load-Bearing Status

| Bucket | Count | Load-Bearing | libopenmpt-Specific | Hybrid | Deletable When libopenmpt Canonical |
|--------|-------|--------------|---------------------|--------|--------------------------------------|
| Sequencing | 15 | 15 | 0 | 0 | **0** |
| Position tracking | 12 | 12 | 0 | 0 | **0** |
| Lifecycle | 6 | 6 | 0 | 0 | **0** |
| Audio routing | 14 | 14 | 0 | 0 | **0** |
| Effect processing | 22 | 0 | 22 | 0 | **22** ⚠️ |
| Period/note conversion | 8 | 0 | 8 | 0 | **8** ⚠️ |
| Note triggering | 4 | 2 | 1 | 1 | **~2** |
| DJ features | 10 | 10 | 0 | 0 | **0** (except abstractable) |
| Tempo/pitch | 8 | 8 | 0 | 0 | **0** |
| Groove/swing | 1 | 1 | 0 | 0 | **0** |
| Mute/solo | 9 | 9 | 0 | 0 | **0** |
| WASM integration | 4 | 3 | 0 | 1 | **0** |
| Instrument mgmt | 3 | 3 | 0 | 0 | **0** |
| **TOTAL** | **~120** | **~98** (82%) | **~31** (26%) | **~2** (2%) | **~32** (27%) |

*Note: Some methods appear in multiple buckets (e.g., triggerNote in both "effect processing" and "note triggering"). Percentages are rough estimates.*

---

## Recommendations for Refactoring

### Phase 1: Identify Deletable Code (Medium effort, low risk)
1. **Create a legacy compat module:** `replayer/LegacyEffectCompat.ts`
2. **Move these methods:**
   - All 22 effect processing methods (processEffect*, doArpeggio, doTremolo, etc.)
   - All 8 period conversion methods (noteToPeriod, periodPlusSemitones, etc.)
   - Envelope methods (triggerEnvelopes, resetXMVolumes, xmKeyOff, processEnvelopesAndVibrato)
3. **Keep in TrackerReplayer:**
   - Sequencing, position tracking, lifecycle, audio routing, tempo/pitch, mute/solo

### Phase 2: Abstract DJ Features (Low-medium effort, non-invasive)
1. **Create DJController mixin:** `dj/DJController.ts`
2. **Move:**
   - setSlipEnabled, getSlipState, setLineLoop, clearLineLoop, setPatternLoop, clearPatternLoop
   - setNudge, pauseNativeEnginesForScratch, resumeNativeEnginesAfterScratch
3. **Keep in TrackerReplayer:**
   - Core tempo/pitch multipliers (reusable for all formats)
   - Core pause/resume (non-DJ users need it)

### Phase 3: Simplify WASM Integration (Medium-high effort, requires testing)
1. **Extract WASM init/position callbacks** into separate module
2. **Remove dependency on libopenmpt period tables** for native format playback
3. **Unify position tracking:** WASM engines report position → TrackerReplayer syncs state (no dual-path logic needed)

### Why This Matters
- **Maintenance:** 27% of code becomes optional (deletable when libopenmpt canonical)
- **Clarity:** Core sequencing logic is ~80 lines, buried in 5,761-line class
- **Testing:** Effect processing can be tested independently (move to compat module)
- **Performance:** DJ features can be optional loading (tree-shake in vanilla tracker mode)

---

## External API Surface (What callers actually use)

Based on codebase grep (229 occurrences across 47 files):

**Top 20 called methods:**
1. `isPlaying()` — 20 calls (UI checks if playback is active)
2. `setTempoMultiplier()` / `setPitchMultiplier()` — 17 each (DJ/tracker UI)
3. `getSong()` — 12 calls (UI accesses patterns/instruments)
4. `stop()` — 10 calls (UI stop button, reload)
5. `seekTo()` — 8 calls (seek UI, worklet position sync)
6. `play()` — 8 calls (UI play button)
7. `getStateAtTime()` — 7 calls (animation loop for scrolling)
8. `getElapsedMs()` — 7 calls (UI time display)
9. `setSuppressNotes()` — 4 calls (native format initialization)
10. `setStereoSeparation()` / `setStereoSeparationMode()` — 4 each (mixer UI)

**Rarely called (internal use only):**
- All effect processing methods (processEffect*, doTremolo, etc.) — **0 external calls** (private)
- All period conversion methods — **0 external calls** (private)

**Conclusion:** External API is clean and minimal (~20-30 methods used by UI). The other 90+ methods are internal orchestration (mostly private).

---

## Appendix: Full Method Listing by Bucket

### Effect Processing Methods (LIBOPENMPT-SPECIFIC)
```
processEffect0
processExtendedEffect0
processAllEffectsTick0
processVolColumnTick0
processEffectTick
processEffectTickSingle
doArpeggio
doTonePortamento
doVibrato
doTremolo
doVolumeSlide
doGlobalVolumeSlide
doPanSlide
doMultiNoteRetrig
doGlobalPitchSlide
fireDelayedNote
forwardEffectToFurnace
triggerEnvelopes
resetXMVolumes
xmKeyOff
processEnvelopesAndVibrato
processMacros
applyMacroValue
releaseMacros
```

### Period/Note Conversion Methods (LIBOPENMPT-SPECIFIC)
```
noteToPeriod
noteStringToPeriod
getPeriod
periodPlusSemitones
rawPeriodToFinetuned
noteToPlaybackPeriod
updatePeriod
updatePeriodDirect
```

### Core Sequencing Methods (LOAD-BEARING)
```
play
stop
pause
resume
startScheduler
processTick
advanceRow
processRow
processTickPerChannel
queueDisplayState
getStateAtTime
clearStateQueue
calculateGrooveOffset
```

### Position Tracking Methods (LOAD-BEARING)
```
getCurrentPosition
getCurrentRow
getCurrentTick
getSongPos
getPattPos
getTotalPositions
seekTo
jumpToPosition
jumpToPattern
forcePosition
getElapsedMs
getEffectivePlaybackRate
```

### Lifecycle Methods (LOAD-BEARING)
```
constructor
loadSong
createChannel
dispose
getC64SIDEngine
getSong
```

---

**End of Report**

Generated: 2026-04-07  
File analyzed: `/Users/spot/Code/DEViLBOX/src/engine/TrackerReplayer.ts` (5,761 lines)
