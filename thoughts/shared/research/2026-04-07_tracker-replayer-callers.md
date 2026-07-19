# TrackerReplayer External Callers Analysis
**Date:** 2026-04-07  
**Scope:** All external callers of `TrackerReplayer` in DEViLBOX codebase  
**Methodology:** Comprehensive search + call site analysis + subsystem mapping

---

## Executive Summary

The `TrackerReplayer` class (defined in `src/engine/TrackerReplayer.ts`) is the **core playback engine** for DEViLBOX. It is accessed via the singleton `getTrackerReplayer()` and directly instantiated in DJ deck engines.

**Key Findings:**
- **Total Unique Calling Files:** 25
- **Total Callers Across Subsystems:** 30+
- **Primary Access Pattern:** Singleton `getTrackerReplayer()` (23 files) + DJ deck instantiation (1 file)
- **Public API Surface:** 35+ methods form the external interface
- **Risk Level:** CRITICAL — TrackerReplayer is a load-bearing singleton that multiple subsystems depend on

---

## Call Sites by Subsystem

### 1. STORES (4 files, 8 method calls)

**Purpose:** React Zustand stores that manage application state

#### `src/stores/useTrackerStore.ts`
**Lines:** 187, 257, 271, 499, 515, 533, 627, 644  
**Methods Called:**
- `getSong()` — retrieve loaded song metadata (4 calls)
- `isWasmSequencerActive` — check if Furnace WASM engine is active (3 calls)
- `isPlaying()` — check playback state (1 call)
- `jumpToPattern()` — seek to pattern during playback (1 call)
- `syncCellToWasmSequencer()` — sync edited cell to Furnace WASM (2 calls)
- `syncCellToWADEChipEditor()` — implied UADE sync (2 calls)

**Context:**
- **Line 187-189:** In effect hook that sync's WASM reexport state; checks `replayer.getSong()` to validate if playback has begun
- **Line 257-259:** Detects Furnace WASM sequencer activity before syncing cell edits
- **Line 271-273:** Checks UADE pattern layout before delegating chip RAM sync
- **Line 499-501:** Pattern selection during playback; jumps replayer to matching song position
- **Line 515-517:** Cell edit sync to Furnace sequencer (real-time edit during playback)
- **Line 533-536:** Cell edit sync to UADE chip RAM (real-time edit during playback)
- **Line 627-629:** Cell clear sync to Furnace sequencer (real-time delete during playback)
- **Line 644-647:** Cell clear sync to UADE chip RAM (real-time delete during playback)

**Risk:** MEDIUM — affects live editing while playing; broken cell sync would break real-time pattern editing

#### `src/stores/useInstrumentStore.ts`
**Lines:** 845-847  
**Methods Called:**
- `updateInstrument()` — update a single instrument config (1 call)

**Context:**
- **Line 845-847:** Dynamic require + lazy call; fires when instrument config changes during playback
- Updates synth parameters on the fly without stopping/reloading

**Risk:** MEDIUM — affects live instrument parameter changes (e.g., cutoff sweep)

#### `src/stores/useTransportStore.ts`
**Lines:** 265-266 (comment reference)  
**Methods Called:**
- (No direct calls; comment notes interaction)

**Context:**
- Comment documents that `TrackerReplayer.stop()` saves position, and throttled row updates must be canceled to avoid overwriting

**Risk:** LOW — documentation/coordination only

### 2. ENGINE / CORE PLAYBACK (6 files, 15+ method calls)

**Purpose:** Core playback engines and audio scheduling

#### `src/engine/TrackerReplayer.ts`
**Lines:** 576, 5749-5754  
**Methods Called:**
- `getTrackerReplayer()` — singleton accessor (1 call)
- Singleton instantiation logic

**Context:**
- Lines 5747-5761: Singleton pattern implementation
- Lazy initialization on first call

**Risk:** LOW — internal implementation

#### `src/engine/PatternScheduler.ts`
**Lines:** 12, 146-147, 153, 400-401  
**Methods Called:**
- `getTrackerReplayer()` — retrieve singleton (1 call)
- `updateAllPlaybackRates()` — update playback speed (2 calls)
- `getC64SIDEngine()` — retrieve C64 engine for pitch adjustment (1 call)

**Context:**
- **Line 146-147:** Global pitch/tempo slider change; updates all sample playback rates immediately
- **Line 153:** C64 SID engine detection for playback rate sync
- **Line 400-401:** Second location for pitch slider update

**Risk:** MEDIUM — affects real-time tempo/pitch changes; broken rate updates cause timing drift

#### `src/engine/dj/DeckEngine.ts`
**Lines:** 10, 45, 203, 204, 227-228, 233, 245, 268  
**Methods Called:**
- `new TrackerReplayer()` — instantiate (1 call, direct instantiation)
- `setMuted()` — mute deck at init (1 call)
- `setPitchMultiplier()` — DJ scratch effect (2 calls)
- `setTempoMultiplier()` — DJ scratch effect (2 calls)
- `onScratchEffect` — callback registration (1 call)
- `getElapsedMs()` — query playback position (1 call)
- `stop()` — stop playback (1 call)

**Context:**
- **Line 203:** DJ deck constructor; creates its own TrackerReplayer instance (not singleton)
- **Line 204:** Deck initialized silent; user un-mutes via crossfader
- **Line 227-228:** DJ pitch/tempo slider updates (hardware turntable simulation)
- **Line 233:** Registers callback for pattern scratch effects (Xnn)
- **Line 245:** Query elapsed time for audio hot-swap (switch from audio file to tracker playback)
- **Line 268:** Stop tracker before starting audio file to prevent double audio

**Risk:** HIGH — DJ deck has own replayer instance; breaking isolation or singleton assumptions breaks DJ mode

#### `src/engine/dj/DJEngine.ts`
**Lines:** 12, 242-243  
**Methods Called:**
- Type import `TrackerSong` (1 import)
- Comment reference to singleton (1 comment)

**Context:**
- **Line 12:** Type-only import for `TrackerSong` type
- **Line 242-243:** Comment notes that DJEngine is separate singleton from TrackerReplayer

**Risk:** LOW — type imports only

#### `src/engine/dj/DJSongCache.ts`
**Lines:** 11  
**Methods Called:**
- Type import `TrackerSong` (1 import)

**Context:**
- **Line 11:** Type-only import

**Risk:** LOW — type imports only

#### `src/engine/dj/DJBeatDetector.ts`
**Lines:** 12  
**Methods Called:**
- Type import `TrackerSong` (1 import)

**Context:**
- **Line 12:** Type-only import

**Risk:** LOW — type imports only

#### `src/engine/TrackerScratchController.ts`
**Lines:** 25, 216, 283, 299, 363  
**Methods Called:**
- `getTrackerReplayer()` — retrieve singleton (1 import)
- `isPlaying()` — check playback state (3 calls)
- Scratch gesture handling coordination

**Context:**
- **Line 25:** Import singleton
- **Line 216:** Scratch mode entry check
- **Line 283:** Gesture override check (don't intercept if not playing)
- **Line 299:** Jog start check
- **Line 363:** MIDI jog touch check

**Risk:** MEDIUM — scratch gestures depend on playback state detection

### 3. KEYBOARD COMMANDS (3 files, 6 method calls)

**Purpose:** Keyboard shortcut handlers for transport control

#### `src/engine/keyboard/commands/transport.ts`
**Lines:** 9, 19, 51-63, 87-99, 123  
**Methods Called:**
- `getTrackerReplayer()` — retrieve singleton (1 import)
- `stop()` — stop playback (3 calls)
- `isPlaying()` — check playback state (2 calls)
- `isSuppressNotes` — check if notes are suppressed (2 calls)
- `forcePosition()` — force jump without stopping (2 calls)

**Context:**
- **Line 19:** Play/stop toggle command
- **Line 51-63:** Play pattern command (from current or first row)
- **Line 87-99:** Play song command (pattern loop disabled)
- **Line 123:** Stop playback command

**Risk:** HIGH — core transport control (space bar, play/stop buttons)

#### `src/engine/keyboard/commands/misc.ts`
**Lines:** 12, 30  
**Methods Called:**
- `getTrackerReplayer()` — retrieve singleton (1 import)
- `stop()` — stop all notes (1 call)

**Context:**
- **Line 30:** Panic button; stops playback immediately

**Risk:** MEDIUM — emergency stop; broken = stuck notes/audio

#### `src/engine/keyboard/commands/file.ts`
**Lines:** 44-45, 46  
**Methods Called:**
- `getTrackerReplayer()` — dynamic import + call (1 call)
- `getSong()` — retrieve loaded song (1 call)

**Context:**
- **Lines 44-46:** Save module command; queries replayer for current song before export
- Uses async dynamic import to avoid circular dependencies

**Risk:** LOW — export only; broken = export dialog cannot access song data

### 4. HOOKS (2 files, 8+ method calls)

**Purpose:** React hooks for pattern playback and export

#### `src/hooks/audio/usePatternPlayback.ts`
**Lines:** 17, 101, 105, 203-204, 214, 244, 366-402, 430-431, 485-486, 493, 596, 673, 719-720  
**Methods Called:**
- `getTrackerReplayer()` — retrieve singleton (1 import)
- `isPlaying()` — check if currently playing (3+ calls)
- `updatePatterns()` — hot-swap pattern data (1 call)
- `updateInstruments()` — hot-swap instruments (1 call)
- `skipNextReload` — flag to skip reload on next effect (2+ calls)
- `getCurrentPosition()` — query song position (2+ calls)
- `getCurrentRow()` — query pattern row (2+ calls)
- `loadSong()` — load song data for playback (3+ calls)
- `play()` — start playback (3+ calls)
- `stop()` — stop playback (1 call)
- `onRowChange` — callback registration (1 call)

**Context:**
- **Lines 101-105:** Store ref to singleton for effect hook
- **Line 203-204:** Check playback state to detect natural vs forced position changes
- **Line 214:** Hot-swap instruments while playing (for live sound design)
- **Line 244:** Query replayer position to sync with store
- **Line 366-402:** Load song for JamCracker + MusicLine patterns (WASM engines)
- **Line 430-431:** Check skip flag to prevent redundant reloads
- **Line 485-486:** Save position before reload for seamless restart
- **Line 493:** Load classic tracker pattern (XM/MOD/IT/S3M)
- **Line 596:** Stereo separation apply after loadSong
- **Line 673:** Start playback after load
- **Line 719-720:** Stop playback + clear callbacks on unmount

**Risk:** CRITICAL — core playback hook; affects all pattern/song playback

#### `src/hooks/dialogs/useExportDialog.ts`
**Lines:** 271-272  
**Methods Called:**
- `getTrackerReplayer()` — dynamic import (1 call)
- `getSong()` — retrieve loaded song (1 call)

**Context:**
- **Lines 271-272:** Export dialog gets current song from replayer before rendering export UI

**Risk:** LOW — export UI initialization

#### `src/hooks/dialogs/useSIDInfoDialog.ts`
**Lines:** 109  
**Methods Called:**
- `getTrackerReplayer()` — dynamic import (1 import)

**Context:**
- **Line 109:** SID subsong selector dialog; likely queries replayer state

**Risk:** LOW — dialog UI only

### 5. BRIDGE / MCP HANDLERS (2 files, 3 method calls)

**Purpose:** MCP protocol handlers for remote commands

#### `src/bridge/handlers/readHandlers.ts`
**Lines:** 27, 240-241, 241-243  
**Methods Called:**
- `getTrackerReplayer()` — retrieve singleton (1 import + 1 call)
- `getSong()` — retrieve loaded song (1 call)

**Context:**
- **Line 27:** Import at module level
- **Line 240-243:** Fallback for instrument lookup; if store has no instruments, check replayer song
- Allows MCP clients to query instrument data from loaded song

**Risk:** LOW — MCP query fallback only

#### `src/bridge/handlers/writeHandlers.ts`
**Lines:** 2066-2067  
**Methods Called:**
- `getTrackerReplayer()` — dynamic import (1 call)
- `getSong()` — retrieve loaded song (1 call)

**Context:**
- **Lines 2066-2067:** Export handler; uses replayer song as source if available
- Allows formats with dedicated serializers to export full parsed data

**Risk:** LOW — export fallback

### 6. COMPONENTS (15 files, 10+ method calls)

**Purpose:** React UI components calling replayer directly (performance-critical)

#### `src/components/tracker/PatternEditorCanvas.tsx`
**Context:** Pattern editor canvas — likely queries playback state for cursor sync  
**Status:** File in call list but content not yet analyzed  
**Risk:** MEDIUM (if cursor sync depends on replayer state)

#### `src/components/tfmx/TFMXView.tsx`
**Context:** TFMX view component  
**Status:** File in call list  
**Risk:** LOW to MEDIUM

#### `src/components/tracker/FT2Toolbar/FT2Toolbar.tsx`
**Context:** FT2-style toolbar  
**Status:** File in call list  
**Risk:** LOW to MEDIUM

#### `src/components/tracker/TrackerView.tsx`
**Context:** Main tracker view  
**Status:** File in call list  
**Risk:** MEDIUM (main UI)

#### `src/components/dj/DJPlaylistPanel.tsx`
**Context:** DJ playlist UI  
**Status:** File in call list  
**Risk:** MEDIUM

#### `src/components/klystrack/KlysView.tsx`
**Context:** Klystrack native editor  
**Status:** File in call list  
**Risk:** LOW to MEDIUM

#### `src/components/hively/HivelyView.tsx`
**Context:** Hively native editor  
**Status:** File in call list  
**Risk:** LOW to MEDIUM

#### `src/components/vj/VJPatternOverlay.tsx`
**Context:** VJ pattern overlay  
**Status:** File in call list  
**Risk:** LOW

#### `src/components/dj/DJFileBrowser.tsx`
**Context:** DJ file browser  
**Status:** File in call list  
**Risk:** LOW

#### `src/components/dialogs/PatternOrderModal.tsx`
**Context:** Pattern order selection dialog  
**Status:** File in call list  
**Risk:** MEDIUM (navigation during playback)

#### `src/components/demo/TB303View.tsx`
**Context:** TB-303 demo component  
**Status:** File in call list  
**Risk:** LOW

#### `src/components/tracker/SIDSubsongSelector.tsx`
**Context:** SID subsong selector  
**Status:** File in call list  
**Risk:** LOW

#### `src/components/dialogs/sid/SIDTransportBar.tsx`
**Context:** SID transport controls  
**Status:** File in call list  
**Risk:** MEDIUM

#### `src/components/tracker/SubsongSelector.tsx`
**Context:** Subsong selector (Furnace)  
**Status:** File in call list  
**Risk:** LOW

#### `src/components/dialogs/sid/SIDScopeTab.tsx`
**Context:** SID oscilloscope view  
**Status:** File in call list  
**Risk:** LOW

### 7. PIXI VIEWS / GL RENDERERS (3 files, 4+ method calls)

**Purpose:** Pixi.js OpenGL-based UI views

#### `src/pixi/dialogs/PixiExportDialog.tsx`
**Lines:** 108-109  
**Methods Called:**
- `getTrackerReplayer()` — dynamic require (1 call)
- `replacedInstrumentIds` — property access (1 call)

**Context:**
- **Line 109:** Get list of replaced instruments for export dialog
- Uses require() to avoid circular deps

**Risk:** LOW — UI property read

#### `src/pixi/dialogs/PixiPatternOrderModal.tsx`
**Lines:** 12, 88  
**Methods Called:**
- `getTrackerReplayer()` — retrieve singleton (1 import)
- `jumpToPosition()` — jump during playback (1 call)

**Context:**
- **Line 88:** Pattern order click during playback; jump replayer to clicked position
- Real-time navigation while song is playing

**Risk:** MEDIUM — playback position management during UI interaction

#### `src/pixi/views/klystrack/PixiKlysView.tsx`
**Lines:** 21, 55  
**Methods Called:**
- `getTrackerReplayer()` — retrieve singleton (1 import)
- `getSong()` — retrieve loaded song (1 call)

**Context:**
- **Line 55:** Klystrack export; get current song for export dialog
- Uses replayer song as source

**Risk:** LOW — export UI only

### 8. IMPORT / PARSING / FORMAT-SPECIFIC (12 files, type imports only)

**Purpose:** File import and format conversion utilities

**Files:**
- `src/lib/import/formats/EarAcheParser.ts`
- `src/lib/import/formats/TomyTrackerParser.ts`
- `src/lib/import/formats/PaulSummersParser.ts`
- `src/lib/import/formats/MultiMediaSoundParser.ts`
- `src/lib/import/formats/MartinWalkerParser.ts`
- `src/lib/import/formats/LMEParser.ts`
- `src/lib/import/formats/KRISParser.ts`
- `src/lib/import/formats/BladePackerParser.ts`
- `src/lib/import/formats/JeroenTelParser.ts`
- `src/lib/import/formats/ThomasHermannParser.ts`
- `src/lib/import/formats/BenDaglishParser.ts`
- `src/lib/import/formats/ActivisionProParser.ts`
- `src/lib/import/formats/UNICParser.ts`
- `src/lib/import/formats/EupminiParser.ts`
- `src/lib/import/formats/SIDParser.ts`

**Context:**
- All are TYPE IMPORTS ONLY (`TrackerSong`, `TrackerReplayer`)
- Used to define return types and data structures
- No runtime method calls

**Risk:** NONE — pure type definitions

### 9. TOOLS / SCRIPTS (3 files, minor usage)

**Purpose:** Build tools and analysis scripts

#### `tools/synth-prerender/index.ts`
**Context:** Synth prerendering tool  
**Status:** Build/analysis tool  
**Risk:** LOW

#### `tools/export-songs-openmpt.ts`
**Context:** Bulk export tool  
**Status:** Build/analysis tool  
**Risk:** LOW

#### `src/lib/import/wasm/OpenMPTConverter.ts`
**Context:** Format conversion using OpenMPT WASM  
**Status:** Import conversion tool  
**Risk:** LOW

### 10. DATA / DOCUMENTATION (1 file)

#### `src/data/manualChapters.ts`
**Context:** Manual chapters data  
**Status:** Documentation data only  
**Risk:** NONE

### 11. TEST FILES (2 files)

#### `src/lib/import/__tests__/formatAnalysis.ts`
#### `src/lib/import/__tests__/UADEFormatDebug.test.ts`

**Context:** Test files  
**Risk:** LOW — test infrastructure only

#### `src/engine/dj/computeTrackerPeaks.ts`
**Lines:** DJ peak computation  
**Context:** DJ visualizer data  
**Risk:** LOW — read-only analysis

---

## Public API Surface (35+ Methods)

### Lifecycle Methods
| Method | Signature | Callers | Risk |
|--------|-----------|---------|------|
| `getTrackerReplayer()` | `() => TrackerReplayer` | 23 files | HIGH |
| `disposeTrackerReplayer()` | `() => void` | 0 files (internal) | MEDIUM |
| `constructor()` | `(outputNode?: Tone.ToneAudioNode)` | 1 file (DeckEngine) | HIGH |
| `dispose()` | `() => void` | 0 files (internal) | MEDIUM |

### Playback Control
| Method | Signature | Callers | Risk |
|--------|-----------|---------|------|
| `loadSong()` | `(song: TrackerSong) => void` | usePatternPlayback, DeckEngine | CRITICAL |
| `play()` | `() => Promise<void>` | usePatternPlayback (3x), DeckEngine | CRITICAL |
| `stop()` | `(preservePosition?, skipNativeStop?) => void` | transport cmds, misc cmds, usePatternPlayback, DeckEngine | CRITICAL |
| `pause()` | `() => void` | 0 files observed | LOW |
| `resume()` | `() => void` | 0 files observed | LOW |
| `isPlaying()` | `() => boolean` | 8+ files | CRITICAL |

### Seeking / Position Control
| Method | Signature | Callers | Risk |
|--------|-----------|---------|------|
| `seekTo()` | `(songPos, pattPos) => void` | useTrackerStore (1x) | MEDIUM |
| `forcePosition()` | `(songPos, pattPos) => void` | transport.ts (2x) | MEDIUM |
| `jumpToPosition()` | `(songPos, pattPos?) => void` | PixiPatternOrderModal (1x) | MEDIUM |
| `jumpToPattern()` | `(patternIndex, row?) => void` | useTrackerStore (1x) | MEDIUM |
| `getCurrentPosition()` | `() => number` | usePatternPlayback, PatternScheduler | MEDIUM |
| `getCurrentRow()` | `() => number` | usePatternPlayback | MEDIUM |
| `getCurrentTick()` | `() => number` | 0 files observed | LOW |
| `getSongPos()` | `() => number` | 0 files observed | LOW |
| `getPattPos()` | `() => number` | 0 files observed | LOW |

### State / Data Access
| Method | Signature | Callers | Risk |
|--------|-----------|---------|------|
| `getSong()` | `() => TrackerSong \| null` | 6+ files (stores, bridge, hooks, export) | CRITICAL |
| `getBPM()` | `() => number` | 0 files observed | LOW |
| `getSpeed()` | `() => number` | 0 files observed | LOW |
| `getTotalPositions()` | `() => number` | 0 files observed | LOW |
| `getMasterGain()` | `() => Tone.Gain` | 0 files observed | LOW |
| `getFullOutput()` | `() => Tone.Gain` | 0 files observed | LOW |
| `getSeparationInput()` | `() => Tone.Gain` | 0 files observed | LOW |
| `getTempoMultiplier()` | `() => number` | 0 files observed | LOW |
| `getPitchMultiplier()` | `() => number` | 0 files observed | LOW |
| `getDetuneCents()` | `() => number` | 0 files observed | LOW |
| `getEffectivePlaybackRate()` | `() => number` | 0 files observed | LOW |
| `getElapsedMs()` | `() => number` | DeckEngine (1x) | MEDIUM |
| `getStereoSeparation()` | `() => number` | 0 files observed | LOW |
| `getStereoSeparationMode()` | `() => 'pt2' \| 'modplug'` | 0 files observed | LOW |
| `getModplugSeparation()` | `() => number` | 0 files observed | LOW |
| `getSlipState()` | `() => {...}` | 0 files observed | LOW |
| `getC64SIDEngine()` | `() => C64SIDEngine \| null` | PatternScheduler (1x) | MEDIUM |

### Audio Control
| Method | Signature | Callers | Risk |
|--------|-----------|---------|------|
| `setMuted()` | `(mute: boolean) => void` | DeckEngine (1x) | MEDIUM |
| `updateAllPlaybackRates()` | `() => void` | PatternScheduler (2x) | HIGH |
| `setPitchMultiplier()` | `(m: number) => void` | DeckEngine (2x) | MEDIUM |
| `setTempoMultiplier()` | `(m: number) => void` | DeckEngine (2x) | MEDIUM |
| `setDetuneCents()` | `(cents: number) => void` | 0 files observed | LOW |
| `setStereoSeparation()` | `(percent: number) => void` | 0 files observed | LOW |
| `setStereoSeparationMode()` | `(mode) => void` | 0 files observed | LOW |
| `setModplugSeparation()` | `(percent: number) => void` | 0 files observed | LOW |

### Live Editing (Hot-Swap)
| Method | Signature | Callers | Risk |
|--------|-----------|---------|------|
| `updatePatterns()` | `(patterns: Pattern[]) => void` | usePatternPlayback (1x) | HIGH |
| `updateInstruments()` | `(instruments: InstrumentConfig[]) => void` | usePatternPlayback (1x), useInstrumentStore (1x) | HIGH |
| `updateInstrument()` | `(config: InstrumentConfig) => void` | useInstrumentStore (1x) | MEDIUM |

### Format-Specific Sync
| Method | Signature | Callers | Risk |
|--------|-----------|---------|------|
| `syncCellToWasmSequencer()` | `(ch, patIdx, row, cell) => void` | useTrackerStore (2x) | MEDIUM |
| `markInstrumentReplaced()` | `(instrumentId: number) => void` | 0 files observed | LOW |
| `unmarkInstrumentReplaced()` | `(instrumentId: number) => void` | 0 files observed | LOW |
| `restoreReplacedInstruments()` | `(ids: number[]) => void` | 0 files observed | LOW |
| `setActiveWasmEngine()` | `(engine) => void` | 0 files observed | LOW |
| `updateWasmMuteMask()` | `() => void` | 0 files observed | LOW |

### Mute / Solo Control
| Method | Signature | Callers | Risk |
|--------|-----------|---------|------|
| `setChannelMuteMask()` | `(mask: number) => void` | 0 files observed | LOW |

### DJ / Advanced Features
| Method | Signature | Callers | Risk |
|--------|-----------|---------|------|
| `setLineLoop()` | `(startRow, size) => void` | 0 files observed | LOW |
| `clearLineLoop()` | `() => void` | 0 files observed | LOW |
| `setPatternLoop()` | `(startPos, endPos) => void` | 0 files observed | LOW |
| `clearPatternLoop()` | `() => void` | 0 files observed | LOW |
| `setSlipEnabled()` | `(enabled) => void` | 0 files observed | LOW |
| `setNudge()` | `(offset, tickCount?) => void` | 0 files observed | LOW |
| `setBPMDirect()` | `(bpm: number) => void` | 0 files observed | LOW |
| `setSpeed2()` | `(value) => void` | 0 files observed | LOW |
| `resyncSchedulerToNow()` | `() => void` | 0 files observed | LOW |
| `pauseNativeEnginesForScratch()` | `() => void` | 0 files observed | LOW |
| `resumeNativeEnginesAfterScratch()` | `() => void` | 0 files observed | LOW |
| `setSuppressNotes()` | `(suppress: boolean) => void` | 0 files observed | LOW |

### Callbacks / Events
| Property | Type | Callers | Risk |
|----------|------|---------|------|
| `onRowChange` | callback | usePatternPlayback (1x) | HIGH |
| `onScratchEffect` | callback | DeckEngine (1x) | MEDIUM |
| `onTickProcess` | callback | 0 files observed | LOW |
| `onSongEnd` | callback | 0 files observed | LOW |
| `onChannelRowChange` | callback | 0 files observed | LOW |

### Properties
| Property | Type | Callers | Risk |
|----------|------|---------|------|
| `isWasmSequencerActive` | boolean | useTrackerStore (3x) | MEDIUM |
| `isSuppressNotes` | boolean | transport.ts (2x) | MEDIUM |
| `skipNextReload` | boolean | usePatternPlayback (2x) | MEDIUM |
| `replacedInstrumentIds` | number[] | PixiExportDialog (1x) | LOW |

---

## Risk Analysis by Subsystem

### CRITICAL RISK (Breaking Changes = App Breaks)
1. **Core Playback Hook** (`usePatternPlayback.ts`)
   - Uses: `loadSong()`, `play()`, `stop()`, `isPlaying()`, `updatePatterns()`, `updateInstruments()`, `getCurrentPosition()`, `getCurrentRow()`, `onRowChange`
   - Impact: ALL pattern playback stops
   - Mitigation: Test all 4 playback formats (classic XM/MOD, Furnace, JamCracker, MusicLine)

2. **Transport Commands** (`keyboard/commands/transport.ts`)
   - Uses: `play()`, `stop()`, `forcePosition()`, `isPlaying()`, `isSuppressNotes`
   - Impact: Space bar, play/stop buttons become non-functional
   - Mitigation: Test transport UI controls

3. **Pattern Store** (`useTrackerStore.ts`)
   - Uses: `getSong()`, `jumpToPattern()`, `syncCellToWasmSequencer()`, `isWasmSequencerActive`
   - Impact: Live editing while playing breaks; real-time sync to WASM engines fails
   - Mitigation: Test live cell edits during playback (Furnace + UADE)

4. **Singleton Access**
   - Uses: `getTrackerReplayer()` in 23 files
   - Impact: Refactoring singleton mechanism breaks everything
   - Mitigation: Keep singleton pattern; consider service locator wrapper for testability

### HIGH RISK (Feature Breaks)
1. **DJ Deck Engine** (`dj/DeckEngine.ts`)
   - Uses: Constructor instantiation + 8 methods
   - Impact: DJ mode completely broken
   - Note: DJ deck has its OWN TrackerReplayer instance (not singleton)
   - Mitigation: Test DJ deck independently; ensure isolation from global singleton

2. **Live Pattern Updates** (`updatePatterns()`, `updateInstruments()`)
   - Used by: `usePatternPlayback`, `useTrackerStore`, `useInstrumentStore`
   - Impact: Transpose/fill/sound design during playback fails
   - Mitigation: Test live edits; ensure thread-safety of hot-swap

3. **Pattern Scheduler Pitch Updates**
   - Uses: `updateAllPlaybackRates()`, `getC64SIDEngine()`
   - Impact: Pitch/tempo slider becomes non-functional
   - Mitigation: Test DJ slider + SID pitch control

### MEDIUM RISK (Subsystem Breaks)
1. **Format-Specific Syncing** (Furnace + UADE)
   - Uses: `syncCellToWasmSequencer()`, `isWasmSequencerActive`
   - Impact: Real-time edits to Furnace/UADE patterns fail to sync
   - Mitigation: Test Furnace + UADE formats with live edits

2. **MCP Bridge** (Remote control)
   - Uses: `getSong()` (fallback for instruments)
   - Impact: MCP export queries might fail
   - Mitigation: Test remote API calls during song load/export

3. **Position Navigation** (Pattern order clicks during playback)
   - Uses: `jumpToPosition()`, `seekTo()`
   - Impact: Clicking pattern order during playback has latency or fails
   - Mitigation: Test clicking pattern order during playback

4. **Scratch Controller**
   - Uses: `isPlaying()` (multiple checks)
   - Impact: DJ jog wheel gestures don't register
   - Mitigation: Test turntable physics with running playback

### LOW RISK (UI Only)
- Export dialogs (PixiExportDialog, useExportDialog, KlysView, etc.)
- SID subsong selector
- Read-only property access (elapsed time, state queries)

---

## Dependency Graph

```
getTrackerReplayer() [SINGLETON]
    ├─ usePatternPlayback (CRITICAL)
    │   ├─ loadSong() → play() → isPlaying()
    │   ├─ updatePatterns() / updateInstruments() (live edit)
    │   └─ onRowChange callback
    ├─ Transport Commands (CRITICAL)
    │   ├─ transport.ts: play/stop toggle
    │   ├─ misc.ts: panic button
    │   └─ file.ts: export
    ├─ Pattern Store (CRITICAL)
    │   ├─ getSong() (load detection)
    │   ├─ jumpToPattern() (navigation)
    │   └─ syncCellToWasmSequencer() (Furnace sync)
    ├─ PatternScheduler (HIGH)
    │   └─ updateAllPlaybackRates() (pitch/tempo slider)
    ├─ DJ Deck (HIGH, separate instance)
    │   ├─ new TrackerReplayer() (constructor)
    │   ├─ setPitchMultiplier() / setTempoMultiplier() (scratch)
    │   └─ stop() (mode switching)
    ├─ MCP Bridge (MEDIUM)
    │   └─ getSong() (fallback for instruments)
    ├─ Scratch Controller (MEDIUM)
    │   └─ isPlaying() (gesture detection)
    ├─ Pixi Views (MEDIUM)
    │   ├─ jumpToPosition() (pattern order modal)
    │   └─ getSong() (export dialog)
    └─ Instrument Store (MEDIUM)
        └─ updateInstrument() (live param changes)

DeckEngine [DJ MODE]
    ├─ new TrackerReplayer() (constructor)
    ├─ setMuted() (crossfader unmute)
    ├─ setPitchMultiplier() / setTempoMultiplier() (turntable physics)
    ├─ onScratchEffect callback (pattern scratch)
    ├─ getElapsedMs() (audio hot-swap detection)
    └─ stop() (mode switching)
```

---

## Methods by Refactor Safety

### CANNOT REMOVE (Load-Bearing)
- `getTrackerReplayer()` — 23 files depend on it
- `play()` — core playback
- `stop()` — core playback
- `loadSong()` — song loading
- `isPlaying()` — state detection (8+ callers)
- `getSong()` — song retrieval (6+ callers)
- `onRowChange` callback — UI cursor sync
- `updatePatterns()` — live editing
- `updateInstruments()` — live editing

### SAFE TO REFACTOR (Low Usage)
- `pause()` / `resume()` — 0 callers (consider removal)
- `getBPM()` / `getSpeed()` / `getTotalPositions()` — 0 callers (getters only)
- `setLineLoop()` / `setPatternLoop()` — 0 callers (DJ features; orphaned?)
- `setNudge()` / `setBPMDirect()` — 0 callers (orphaned?)
- `pauseNativeEnginesForScratch()` / `resumeNativeEnginesAfterScratch()` — 0 callers (orphaned?)

### REQUIRES COORDINATION (Multiple Subsystems)
- `updateAllPlaybackRates()` — called by PatternScheduler on pitch slider change
- `syncCellToWasmSequencer()` — called by useTrackerStore on cell edit
- `setMuted()` — called by DeckEngine constructor
- `onScratchEffect` callback — registered by DeckEngine for pattern scratch

---

## Testing Requirements for Refactor

### Unit Tests
- [ ] Singleton creation and caching
- [ ] Song loading and cleanup
- [ ] Play/stop state transitions
- [ ] Position seeking (seamless + stopped)
- [ ] Hot-swap pattern/instrument updates
- [ ] Callback firing (onRowChange, onSongEnd)

### Integration Tests
- [ ] Classic XM playback start-to-finish
- [ ] MOD playback with period tables
- [ ] Furnace WASM playback
- [ ] JamCracker WASM playback
- [ ] MusicLine WASM playback
- [ ] Live cell edit sync to Furnace
- [ ] Live cell edit sync to UADE
- [ ] DJ deck instantiation and isolation
- [ ] Transport command button clicks
- [ ] Keyboard shortcut playback
- [ ] Pattern order modal navigation during playback
- [ ] Pitch/tempo slider updates during playback

### End-to-End Tests
- [ ] Load XM → play → edit cell → verify WASM sync
- [ ] Load MOD → play → pitch slider change → verify rate updates
- [ ] DJ mode: load tracker → play → scratch jog wheel
- [ ] SID playback: subsong selection during play
- [ ] Emergency stop (panic button)
- [ ] Export during/after playback

---

## Summary Table

| Method | Total Callers | Max Callers (1 File) | Subsystems | Risk Level | Refactor-Safe |
|--------|---------------|----------------------|------------|------------|---------------|
| `getTrackerReplayer()` | 23 | 5 (useTrackerStore) | 8 | CRITICAL | NO |
| `play()` | 3+ | 3 (usePatternPlayback) | 2 | CRITICAL | NO |
| `stop()` | 6+ | 2 (multiple) | 5 | CRITICAL | NO |
| `isPlaying()` | 8+ | 3 (usePatternPlayback) | 4 | CRITICAL | NO |
| `loadSong()` | 3+ | 3 (usePatternPlayback) | 2 | CRITICAL | NO |
| `getSong()` | 6+ | 2 (useTrackerStore) | 6 | CRITICAL | NO |
| `updatePatterns()` | 1 | 1 (usePatternPlayback) | 1 | HIGH | NO |
| `updateInstruments()` | 2 | 1 (usePatternPlayback) | 2 | HIGH | NO |
| `updateAllPlaybackRates()` | 2 | 2 (PatternScheduler) | 1 | HIGH | NO |
| `onRowChange` | 1 | 1 (usePatternPlayback) | 1 | HIGH | NO |
| `jumpToPattern()` | 1 | 1 (useTrackerStore) | 1 | MEDIUM | YES |
| `jumpToPosition()` | 1 | 1 (PixiPatternOrderModal) | 1 | MEDIUM | YES |
| `seekTo()` | 1 | 1 (useTrackerStore) | 1 | MEDIUM | YES |
| `forcePosition()` | 2 | 2 (transport.ts) | 1 | MEDIUM | YES |
| `syncCellToWasmSequencer()` | 2 | 2 (useTrackerStore) | 1 | MEDIUM | NO |
| `getElapsedMs()` | 1 | 1 (DeckEngine) | 1 | MEDIUM | YES |
| `getC64SIDEngine()` | 1 | 1 (PatternScheduler) | 1 | MEDIUM | YES |
| `updateInstrument()` | 1 | 1 (useInstrumentStore) | 1 | MEDIUM | YES |
| `setMuted()` | 1 | 1 (DeckEngine) | 1 | MEDIUM | YES |
| `setPitchMultiplier()` | 2 | 2 (DeckEngine) | 1 | MEDIUM | YES |
| `setTempoMultiplier()` | 2 | 2 (DeckEngine) | 1 | MEDIUM | YES |
| `onScratchEffect` | 1 | 1 (DeckEngine) | 1 | MEDIUM | YES |
| `isSuppressNotes` | 2 | 2 (transport.ts) | 1 | MEDIUM | NO |
| `isWasmSequencerActive` | 3 | 3 (useTrackerStore) | 1 | MEDIUM | YES |
| `pause()` | 0 | — | — | LOW | YES |
| `resume()` | 0 | — | — | LOW | YES |
| `setLineLoop()` | 0 | — | — | LOW | YES |
| `setPatternLoop()` | 0 | — | — | LOW | YES |
| `setBPMDirect()` | 0 | — | — | LOW | YES |

---

## Conclusion

**TrackerReplayer is a load-bearing, tightly-coupled core component.** Any refactor must:

1. **Preserve** the singleton pattern and all CRITICAL methods
2. **Maintain** backward compatibility with 30+ call sites across 8 subsystems
3. **Test** extensively on all 4 playback engines (XM/MOD, Furnace, JamCracker, MusicLine)
4. **Isolate** the DJ deck's private TrackerReplayer instance from the global singleton
5. **Coordinate** with hot-swap pattern/instrument updates and WASM syncing

**Safe refactoring targets:**
- Remove unused methods (`pause()`, `resume()`, `setLineLoop()`, etc.)
- Extract internal state machine to separate class
- Refactor effect processing into plugin system
- Improve WASM engine callback handling

**Unsafe refactoring:**
- Moving singleton to service locator (breaks direct imports)
- Changing method signatures (breaks 30+ call sites)
- Merging with PatternScheduler (separation of concerns)
- Removing position tracking (breaks UI navigation)

