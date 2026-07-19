# TrackerReplayer State Audit — Complete Instance Variable Analysis

**Document**: `2026-04-07_tracker-replayer-state-audit.md`  
**File Analyzed**: `/Users/spot/Code/DEViLBOX/src/engine/TrackerReplayer.ts` (5,761 lines)  
**Purpose**: Comprehensive audit of all instance variables for refactor planning  
**Date**: 2026-04-07

---

## Executive Summary

TrackerReplayer is a **singleton tick-based tracker playback engine** (5,761 lines) that manages playback for 188+ audio formats (MOD, XM, IT, S3M, HVL, SID, UADE, WASM engines, etc.). The class uses a **BassoonTracker-style continuous timeline** that processes ticks at fixed intervals without ever resetting, enabling long playback without cumulative drift.

**Key architectural patterns**:
- **Singleton**: Created once via `getTrackerReplayer()`, persists across song loads
- **Hybrid playback**: Supports both ToneEngine (Tone.js synths/samples) AND native WASM engines (libopenmpt, UADE, Hively, SID, etc.) in parallel
- **Per-channel audio routing**: Each channel has pre-allocated Tone.js player pool, gain, pan, mute nodes
- **Ring buffer for display state**: Audio-synced UI updates without O(n) shifting
- **DJ mode**: Isolated replica for deck-based playback with independent tempo/pitch multipliers
- **Format-specific accessor**: Handles Furnace native data, Hively native data, and classic pattern arrays uniformly

---

## Part 1: Class Instantiation & Singleton Pattern

### Constructor Details

```typescript
// Line 599-625: Constructor signature
constructor(outputNode?: Tone.ToneAudioNode)
```

**Parameters**:
- `outputNode` (optional): External audio node for DJ deck routing. If omitted, connects to ToneEngine's masterInput.

**Initialization in constructor**:
```
1. this.masterGain = new Tone.Gain(1)                    // Master volume node
2. this.separationNode = new StereoSeparationNode()      // Stereo separation post-mix
3. Chain: masterGain → separationNode → outputNode (or ToneEngine.masterInput)
4. Sets isDJDeck = true if outputNode provided
5. Handles AudioContext mismatch with deferred connection (500ms timeout)
```

### Singleton Management (Lines 5745-5761)

```typescript
let instance: TrackerReplayer | null = null;

export function getTrackerReplayer(): TrackerReplayer {
  if (!instance) {
    instance = new TrackerReplayer();
  }
  return instance;
}

export function disposeTrackerReplayer(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
```

**Instantiation patterns in codebase**:
- Always via `getTrackerReplayer()` (singleton pattern)
- Never `new TrackerReplayer()` directly (except within singleton getter)
- Created automatically on first access (lazy initialization)
- Disposed via `disposeTrackerReplayer()` or indirectly via `instance.dispose()`
- DJ decks: `new TrackerReplayer(outputNode)` called by DeckEngine (separate instances)

**Callers** (30+ files):
- `/bridge/handlers/readHandlers.ts`
- `/bridge/handlers/writeHandlers.ts`
- `/pixi/dialogs/PixiExportDialog.tsx`
- `/pixi/dialogs/PixiPatternOrderModal.tsx`
- `/pixi/views/tracker/PixiPatternEditor.tsx`
- `/components/views/usePatternPlayback.ts`
- And 24+ more UI components

---

## Part 2: Instance Variables — Complete Catalog

All variables grouped into logical buckets for refactor analysis.

---

### **BUCKET 1: Song Data & Format Metadata**

#### 1.1 `song: TrackerSong | null` (Line 405)
- **Type**: `TrackerSong | null`
- **Default**: `null`
- **Set by**:
  - `loadSong()` line 1192: `this.song = song`
  - `stop()` line (implicit): cleared when disposing song
- **Read by**:
  - `processTick()` line 2429: guard against `!this.song`
  - `play()` line 1519: guard `if (!this.song) return`
  - `getStateAtTime()`: reads from song state
  - `fireHybridNotesForRow()` line 892: reads song data for hybrid playback
  - Throughout effect handlers for accessing pattern/instrument data
- **Lifecycle**:
  - `null` on init
  - Set when `loadSong(song)` called (user loads a file)
  - Persists across `play()/stop()` cycles
  - Cleared on song load (stop first, then load new)
  - Disposed via `dispose()` method (cleanup)
- **Purpose**: Root reference to the loaded module/song data — patterns, instruments, song positions, format-specific metadata

#### 1.2 `accessor: PatternAccessor` (Line 407)
- **Type**: `PatternAccessor` (new instance per TrackerReplayer)
- **Default**: `new PatternAccessor()`
- **Set by**:
  - `loadSong()` lines 1196-1201:
    ```typescript
    if (song.furnaceNative) {
      this.accessor.setFurnace(song.furnaceNative, song.patterns, song.songPositions);
    } else if (song.hivelyNative) {
      this.accessor.setHively(song.hivelyNative, song.patterns, song.songPositions);
    } else {
      this.accessor.setClassic(song.patterns, song.songPositions);
    }
    ```
- **Read by**:
  - `processTick()` line 2477: `const useNativeAccessor = this.accessor.getMode() !== 'classic'`
  - `processTick()` line 2509: `row = this.accessor.getRow(this.songPos, this.pattPos, ch)`
  - `processTickPerChannel()`: per-channel sequencing reads via accessor
  - `syncCellToWasmSequencer()` line 985: detects if WASM sequencer active
- **Lifecycle**:
  - Created in constructor
  - Re-configured on each song load (selects format dispatcher)
  - Persists across play/stop cycles
  - Disposed (implicitly) when song changes
- **Purpose**: Format-agnostic pattern data accessor. Abstracts three data sources:
  1. Furnace native data (FUR files with embedded instrument macros)
  2. Hively native data (HVL/AHX with native sound patterns)
  3. Classic pattern array (MOD/XM/IT/S3M post-parse)

---

### **BUCKET 2: Position Tracking**

#### 2.1 `songPos: number` (Line 417)
- **Type**: `number`
- **Default**: `0`
- **Set by**:
  - `loadSong()` line 1311: `this.songPos = 0`
  - `advanceRow()` line 5372+: increments/wraps position
  - `seekTo()` / `forcePosition()` / `jumpToPosition()`: direct assignment
  - `play()` lines 1621, 1643, 1689: updated from native engine callbacks (Hively, MusicLine, UADE)
  - Pattern breaks (Bxx effect): `pBreakFlag` triggers position jump
- **Read by**:
  - `processTick()` line 2478: `const patternNum = this.song.songPositions[this.songPos]`
  - `getStateAtTime()`: returns current position to UI
  - All position-tracking callbacks
  - DJ mode: slip tracking (ghost position)
- **Lifecycle**:
  - Reset to 0 on song load
  - Advances during playback via row advancement logic
  - Stays fixed during pause
  - Can be jumped via effects (Bxx, Dxx) or UI commands
- **Purpose**: Current index in the global song order (song.songPositions array)

#### 2.2 `pattPos: number` (Line 418)
- **Type**: `number`
- **Default**: `0`
- **Set by**:
  - `loadSong()` line 1312: `this.pattPos = 0`
  - `advanceRow()` line 5372+: increments/wraps within pattern length
  - Pattern jumps (effect D00): `pBreakPos` + `pBreakFlag`
  - `seekTo()` / `forcePosition()` / `jumpToPosition()`: direct assignment
  - Native engine callbacks: updated from WASM position updates
- **Read by**:
  - `processTick()` line 2485: `this.queueDisplayState(safeTime, this.pattPos, patternNum, this.songPos, 0, ...)`
  - Pattern data access: `pattern.channels[ch].rows[this.pattPos]`
  - Effect handlers requiring row context
- **Lifecycle**:
  - Reset to 0 on song load
  - Advances with each row (tick counter overflow)
  - Wraps to 0 when reaching pattern length
  - Can jump via pattern break effects
- **Purpose**: Current row index within the active pattern

#### 2.3 `currentTick: number` (Line 419)
- **Type**: `number`
- **Default**: `0` (range: 0 to speed-1)
- **Set by**:
  - `loadSong()` line 1313: `this.currentTick = 0`
  - `processTick()` line 2596: `this.currentTick++`
  - `processTick()` line 2598: `this.currentTick = 0` (wrap on speed overflow)
  - `forcePosition()` line 676: reset to 0
- **Read by**:
  - `processTick()` line 2448: `const readNewNote = this.currentTick === 0 && this.pattDelTime2 === 0`
  - Effect processing: different behavior on tick 0 vs. continuation ticks
  - Envelope/macro processing: tick delta calculations
- **Lifecycle**:
  - Reset to 0 on song load
  - Increments from 0 to speed-1 every tick in the scheduler
  - Wraps to 0, triggering row advance
  - Stays at 0 when paused
- **Purpose**: Current tick within the active row (0 = row start, 1..speed-1 = effect continuation ticks)

---

### **BUCKET 3: Playback State & Control**

#### 3.1 `playing: boolean` (Line 414)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `play()` line 1805: `this.playing = true`
  - `stop()` line 2260: `this.playing = false`
  - `pause()` line 2287: `this.playing = false` (stops scheduler without resetting position)
  - `forcePosition()` line 693: `this.playing = true` (warm restart)
- **Read by**:
  - `startScheduler()` line 2350: guard scheduler tick execution
  - `processTick()` line 2429: guard against processing when not playing
  - All native engine callbacks: gate position updates
  - `getStateAtTime()`: determine if actively reading display state
- **Lifecycle**:
  - `false` initially
  - Set to `true` when `play()` completes and scheduler starts
  - Set to `false` when `stop()` or `pause()` called
  - Remains `false` if audio context fails to start
- **Purpose**: Master playback enable flag — controls scheduler execution and position tracking

#### 3.2 `_songEndFiredThisBatch: boolean` (Line 416)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `startScheduler()` line 2351: `this._songEndFiredThisBatch = false` (reset per scheduler tick)
  - `advanceRow()` line 5372+: sets to `true` when song loops
- **Read by**:
  - `advanceRow()`: prevents duplicate "song end" callbacks in same scheduler batch
- **Lifecycle**:
  - Reset to `false` every 15ms scheduler tick
  - Set to `true` when song reaches end and loops
  - Prevents firing `onSongEnd` callback multiple times per scheduler batch
- **Purpose**: Debounce flag — prevents song-end callback from firing multiple times in a single scheduler interval

#### 3.3 `_hasPlayedOnce: boolean` (Line 667)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `play()` line (implicit): never explicitly set, but used to gate warm restart logic
  - `loadSong()` line 1177: `this._hasPlayedOnce = false` (reset on new song)
  - `play()` (implicit): should be set after audio infra setup, but currently missing setter
- **Read by**:
  - `forcePosition()` line 692: `if (!this.playing && this.song && this._hasPlayedOnce)` — enables warm restart
- **Lifecycle**:
  - `false` on song load
  - Should be set `true` after first successful `play()` (missing in code)
  - Used to differentiate cold start (first play) from warm restart (re-position)
- **Purpose**: Gate warm-restart path. If audio is already initialized from a previous play(), re-positioning can skip the slow async setup.
- **NOTE**: Missing setter — currently always `false`, so warm restart always goes through slow path. **Potential bug/TODO**.

#### 3.4 `skipNextReload: boolean` (Line 664)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `forcePosition()` line 679: `this.skipNextReload = true` (after position change)
  - React effect `usePatternPlayback()`: sets to `false` after reading it
- **Read by**:
  - `usePatternPlayback()` effect: checks before calling `stop()/play()` cycle
- **Lifecycle**:
  - `false` normally
  - Set to `true` by `forcePosition()` to prevent React effect from re-triggering
  - Read once by effect, then reset to `false`
  - Guards against unwanted stop/restart when position is changed internally
- **Purpose**: React effect guard — prevents unnecessary scheduler restart when position changed programmatically

---

### **BUCKET 4: Tempo & Speed Control**

#### 4.1 `speed: number` (Line 420)
- **Type**: `number`
- **Default**: `6` (ticks per row)
- **Set by**:
  - `loadSong()` line 1314: `this.speed = song.initialSpeed`
  - `processTick()` line 2603: `this.speed = this.activeGroove[this.groovePos]` (groove cycling)
  - `processTick()` line 2608, 2611: alternates between `speed1` and `speed2` (Furnace mode)
  - Effect Fxx handler: `setSpeed(value)` (changes ticks per row)
- **Read by**:
  - `processTick()` line 2465: `const rowDuration = tickInterval * this.speed`
  - `processTick()` line 2597: `if (this.currentTick >= this.speed)` — determines row advancement
  - Groove offset calculation: row duration depends on current speed
  - Automation: fractional row = `pattPos + (currentTick / speed)`
- **Lifecycle**:
  - Initialized from `song.initialSpeed` on load
  - Changes dynamically during playback via Fxx effect or groove cycling
  - Persists across play/stop (only reset on song load)
  - In Furnace speed2 mode, alternates each row
  - In groove mode, cycles through groove table
- **Purpose**: Ticks per row — controls how many ticks occur before advancing to the next row (fundamental playback tempo parameter)

#### 4.2 `bpm: number` (Line 421)
- **Type**: `number`
- **Default**: `125`
- **Set by**:
  - `loadSong()` line 1315: `this.bpm = song.initialBPM`
  - `startScheduler()` line 2372: synced from `useTransportStore.getState().bpm` (UI changes)
  - `setBPMDirect()` line 752: direct assignment (DJ mode)
  - Effect Txx handler: can modify BPM
- **Read by**:
  - `startScheduler()` line 2388: `const effectiveBPM = (this.bpm + this.nudgeOffset) * this.tempoMultiplier`
  - `processTick()` line 2460: `const tickInterval = 2.5 / this.bpm`
  - Scheduler tick interval calculation: `2.5 / effectiveBPM`
- **Lifecycle**:
  - Loaded from song metadata on load
  - Synced from transport store every scheduler tick (15ms)
  - Can be modified by Txx effect during playback
  - DJ mode: can nudge with `setNudge()`
  - Persists across play/stop cycles (reset only on load)
- **Purpose**: Beats per minute — controls tempo. Tick interval in seconds = `2.5 / BPM`. Fundamental timing parameter.

#### 4.3 `speed2: number | null` (Line 440)
- **Type**: `number | null`
- **Default**: `null` (no speed alternation)
- **Set by**:
  - `loadSong()` lines 1350-1356:
    ```typescript
    if (song.speed2 !== undefined && song.speed2 !== song.initialSpeed) {
      this.speed2 = song.speed2;
      this.speedAB = false;
    } else {
      this.speed2 = null;
      this.speedAB = false;
    }
    ```
  - Furnace format feature: allows alternating between two speeds each row
- **Read by**:
  - `processTick()` line 2606: `else if (this.speed2 !== null)` — determines alternation logic
- **Lifecycle**:
  - `null` if song has no speed2 or speed2 == initialSpeed
  - Set to song.speed2 value if Furnace speed alternation enabled
  - Persists across play/stop cycles
  - Reset on song load
- **Purpose**: Furnace speed alternation: optional second speed value. If present and != initialSpeed, playback alternates between `speed` and `speed2` each row.

#### 4.4 `speedAB: boolean` (Line 441)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `loadSong()` lines 1352, 1355: reset to `false`
  - `processTick()` lines 2607, 2609: toggles when advancing rows in speed2 mode
    ```typescript
    if (this.speedAB) {
      this.speed = this.speed2;
      this.speedAB = false;  // Next row uses speed1
    } else {
      this.speed = this.song!.initialSpeed;
      this.speedAB = true;   // Next row uses speed2
    }
    ```
- **Read by**:
  - `processTick()` line 2607: `if (this.speedAB)` — determines which speed to use next
- **Lifecycle**:
  - Reset to `false` on song load (start with speed1)
  - Toggles every row when speed2 alternation active
  - Stays `false` if speed2 is null
- **Purpose**: Furnace speed alternation toggle: `false` = use speed1 next, `true` = use speed2 next.

---

### **BUCKET 5: Groove System (Furnace Variable Tick Rates)**

#### 5.1 `activeGroove: number[] | null` (Line 444)
- **Type**: `number[] | null`
- **Default**: `null` (no groove active)
- **Set by**:
  - `loadSong()` line 1360: `this.activeGroove = null`
  - Effect 09xx handler (Furnace grooves): activates groove table from `song.grooves`
  - Groove select dialog: loads from `GROOVE_MAP`
- **Read by**:
  - `processTick()` line 2601: `if (this.activeGroove !== null)` — determines if cycling through groove
  - `processTick()` line 2603: `this.groovePos = (this.groovePos + 1) % this.activeGroove.length`
  - `processTick()` line 2603: `this.speed = this.activeGroove[this.groovePos]`
- **Lifecycle**:
  - `null` on load (no groove by default)
  - Activated by 09xx effect (Furnace) or UI selection
  - When active, replaces speed2 alternation (mutually exclusive)
  - Persists until another groove selected or effect disables
  - Reset to `null` on song load
- **Purpose**: Furnace groove: array of tick counts per row. Each row uses a different tick count from the table, cycling through the array.

#### 5.2 `groovePos: number` (Line 445)
- **Type**: `number`
- **Default**: `0`
- **Set by**:
  - `loadSong()` line 1361: `this.groovePos = 0`
  - `processTick()` line 2602: `this.groovePos = (this.groovePos + 1) % this.activeGroove.length`
- **Read by**:
  - `processTick()` line 2603: `this.speed = this.activeGroove[this.groovePos]`
- **Lifecycle**:
  - `0` on song load
  - Increments (wrapping) every row when groove is active
  - Reset to `0` on song load
- **Purpose**: Current index into the active groove table. Every row, the current position's tick count is used as `speed`.

#### 5.3 `lastGrooveTemplateId: string` (Line 1511)
- **Type**: `string`
- **Default**: `'straight'`
- **Set by**:
  - `startScheduler()` line 2365: `this.lastGrooveTemplateId = transportState.grooveTemplateId`
- **Read by**:
  - `startScheduler()` line 2359: `if (transportState.grooveTemplateId !== this.lastGrooveTemplateId ...)` — detects template change
- **Lifecycle**:
  - Initialized to `'straight'` (no groove)
  - Updated every scheduler tick (15ms) if changed in transport store
  - Used for change detection only
- **Purpose**: Cache of current groove template ID for detecting UI changes

#### 5.4 `lastSwingAmount: number` (Line 1512)
- **Type**: `number`
- **Default**: `100`
- **Set by**:
  - `startScheduler()` line 2366: `this.lastSwingAmount = transportState.swing`
- **Read by**:
  - `startScheduler()` line 2360: `if (...transportState.swing !== this.lastSwingAmount ...)` — detects swing change
- **Lifecycle**:
  - Initialized to `100` (no swing)
  - Updated every scheduler tick (15ms) if changed in transport store
- **Purpose**: Cache of swing amount for change detection

#### 5.5 `lastGrooveSteps: number` (Line 1513)
- **Type**: `number`
- **Default**: `2`
- **Set by**:
  - `startScheduler()` line 2367: `this.lastGrooveSteps = transportState.grooveSteps`
- **Read by**:
  - `startScheduler()` line 2361: `if (...transportState.grooveSteps !== this.lastGrooveSteps ...)` — detects steps change
- **Lifecycle**:
  - Initialized to `2`
  - Updated every scheduler tick (15ms) if changed in transport store
- **Purpose**: Cache of groove steps for change detection

---

### **BUCKET 6: Global Pitch Control (Wxx Effect)**

#### 6.1 `globalPitchTarget: number` (Line 431)
- **Type**: `number` (range: -12 to +12 semitones)
- **Default**: `0`
- **Set by**:
  - `loadSong()` line 1325: `this.globalPitchTarget = 0`
  - Effect Wxx handler: sets target semitones from effect parameter
- **Read by**:
  - `doGlobalPitchSlide()` line 4067+: slides current toward target
- **Lifecycle**:
  - Reset to `0` on song load
  - Set by Wxx effect during playback
  - Persists across play/stop cycles
- **Purpose**: Target pitch in semitones for Wxx DJ pitch-shift effect

#### 6.2 `globalPitchCurrent: number` (Line 432)
- **Type**: `number` (range: -12 to +12 semitones)
- **Default**: `0`
- **Set by**:
  - `loadSong()` line 1325: `this.globalPitchCurrent = 0`
  - `doGlobalPitchSlide()` line 4067+: increments toward target
  - Also synced to ToneEngine for display: `setGlobalDetune()`
- **Read by**:
  - `doGlobalPitchSlide()`: slides from current toward target
  - Display/UI: reads to show current pitch offset
- **Lifecycle**:
  - Reset to `0` on song load
  - Slides incrementally toward target each tick
  - Persists across play/stop cycles
  - Reset on song load
- **Purpose**: Current pitch offset (smoothly slides toward `globalPitchTarget` via Wxx effect)

#### 6.3 `globalPitchSlideSpeed: number` (Line 433)
- **Type**: `number` (semitones per tick)
- **Default**: `0.5`
- **Set by**:
  - Initialized in field declaration
  - Not modified after initialization
- **Read by**:
  - `doGlobalPitchSlide()`: step size for pitch sliding
- **Lifecycle**:
  - Constant: `0.5` semitones/tick
  - Fixed throughout playback
- **Purpose**: Fixed speed for Wxx pitch sliding — how many semitones per tick to slide toward target

---

### **BUCKET 7: Pattern Break & Jump Control**

#### 7.1 `pBreakPos: number` (Line 455)
- **Type**: `number`
- **Default**: `0`
- **Set by**:
  - `loadSong()` line 1318: `this.pBreakPos = 0`
  - Pattern break effect (Dxx): sets row where next pattern will start
- **Read by**:
  - `advanceRow()` line 5372+: applied when `pBreakFlag` is true
- **Lifecycle**:
  - Reset to `0` on song load
  - Set by Dxx effect during playback
  - Applied at row boundary (next pattern), then cleared
- **Purpose**: Row number where the next pattern will jump to (Dxx effect)

#### 7.2 `pBreakFlag: boolean` (Line 456)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `loadSong()` line 1317: `this.pBreakFlag = false`
  - Dxx effect handler: sets flag when pattern break command issued
- **Read by**:
  - `advanceRow()` line 5372+: checks if jump to pBreakPos should occur
- **Lifecycle**:
  - `false` normally
  - Set to `true` by Dxx effect
  - Applied at row boundary, then cleared
- **Purpose**: Pattern break flag — indicates a pattern break effect was encountered, jump will happen at row boundary

#### 7.3 `posJumpFlag: boolean` (Line 457)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `loadSong()` line 1319: `this.posJumpFlag = false`
  - Bxx effect handler: sets flag when position jump command issued
- **Read by**:
  - `advanceRow()` line 5372+: checks if jump to new song position should occur
- **Lifecycle**:
  - `false` normally
  - Set to `true` by Bxx effect
  - Applied at row boundary, then cleared
- **Purpose**: Position jump flag — indicates a song-position jump effect was encountered

---

### **BUCKET 8: Pattern Delay (Tick Skipping)**

#### 8.1 `patternDelay: number` (Line 458)
- **Type**: `number` (ticks to skip)
- **Default**: `0`
- **Set by**:
  - `loadSong()` line 1320: `this.patternDelay = 0`
  - Legacy MOD pattern delay effect (EEx in MOD): decrements ticks
- **Read by**:
  - `processTick()` line 2440: `if (!this.useXMPeriods && this.patternDelay > 0)` — skips tick
- **Lifecycle**:
  - `0` normally
  - Set by EEx effect (MOD only, not XM)
  - Decrements each tick until reaching 0
  - Only used when `useXMPeriods == false` (MOD format)
- **Purpose**: Legacy MOD pattern delay: number of ticks to skip (EEx effect)

#### 8.2 `pattDelTime: number` (Line 460)
- **Type**: `number` (delay time)
- **Default**: `0`
- **Set by**:
  - `loadSong()` line 1321: `this.pattDelTime = 0`
  - FT2 pattern delay effect (EEx in XM): set on tick 0
- **Read by**:
  - `advanceRow()` line 5372+: copied to `pattDelTime2` at row boundary
- **Lifecycle**:
  - `0` normally
  - Set by EEx effect on tick 0
  - Copied to `pattDelTime2` at row boundary
  - Then reset to `0`
- **Purpose**: FT2 pattern delay staging: set by EEx effect, copied to active delay at row boundary

#### 8.3 `pattDelTime2: number` (Line 461)
- **Type**: `number` (active delay counter)
- **Default**: `0`
- **Set by**:
  - `loadSong()` line 1322: `this.pattDelTime2 = 0`
  - `advanceRow()` line 5372+: `this.pattDelTime2 = this.pattDelTime` (copy from staging)
  - `advanceRow()` line 5372+: decrements each row while > 0
- **Read by**:
  - `processTick()` line 2448: `const readNewNote = this.currentTick === 0 && this.pattDelTime2 === 0`
  - Determines if new notes should be read (if > 0, row is repeated without new notes)
- **Lifecycle**:
  - `0` normally
  - Copied from `pattDelTime` at row boundary
  - Decremented each row while > 0
  - When `> 0`, row repeats without reading new notes
- **Purpose**: FT2 pattern delay active counter: while > 0, row is repeated (effects continue, no new notes)

---

### **BUCKET 9: Per-Channel Independent Sequencing (MusicLine Editor)**

#### 9.1 `channelTickCounters: number[]` (Line 449)
- **Type**: `number[]` (empty or length = numChannels)
- **Default**: `[]`
- **Set by**:
  - `loadSong()` lines 1366-1374:
    ```typescript
    if (song.channelTrackTables) {
      const n = song.numChannels;
      this.channelTickCounters = Array.from({ length: n }, () => 0);
    } else {
      this.channelTickCounters = [];
    }
    ```
  - `processTickPerChannel()` line 5255+: increments per-channel ticks
- **Read by**:
  - `processTickPerChannel()`: determines if row should advance for channel
- **Lifecycle**:
  - Empty array for classic format playback
  - Initialized as zero-filled array when song has `channelTrackTables` (MusicLine)
  - Persists across play/stop cycles
  - Reset on song load
- **Purpose**: Per-channel tick counter (0 .. effectiveSpeed-1) for MusicLine-style per-channel sequencing

#### 9.2 `channelPattPos: number[]` (Line 450)
- **Type**: `number[]` (empty or length = numChannels)
- **Default**: `[]`
- **Set by**:
  - `loadSong()` lines 1367-1374: initialized as zero-filled array
  - `processTickPerChannel()` line 5255+: incremented/reset per-channel
- **Read by**:
  - `processTickPerChannel()`: accesses pattern data for channel
- **Lifecycle**:
  - Empty array for classic playback
  - Initialized when MusicLine format detected
  - Reset on song load
- **Purpose**: Per-channel row position within current pattern (MusicLine format)

#### 9.3 `channelSongPos: number[]` (Line 451)
- **Type**: `number[]` (empty or length = numChannels)
- **Default**: `[]`
- **Set by**:
  - `loadSong()` lines 1368-1374: initialized as zero-filled array
  - `processTickPerChannel()` line 5255+: incremented per-channel into its track table
- **Read by**:
  - `processTickPerChannel()`: indexes into `song.channelTrackTables[ch][pos]`
- **Lifecycle**:
  - Empty array for classic playback
  - Initialized when MusicLine format detected
  - Reset on song load
- **Purpose**: Per-channel index into its track table (MusicLine: each channel has independent song sequence)

#### 9.4 `channelGrooveToggle: boolean[]` (Line 452)
- **Type**: `boolean[]` (empty or length = numChannels)
- **Default**: `[]`
- **Set by**:
  - `loadSong()` lines 1369-1374: initialized as false-filled array
  - `processTickPerChannel()` line 5255+: toggled per-channel
- **Read by**:
  - `processTickPerChannel()`: determines which speed to use (groove alternation)
- **Lifecycle**:
  - Empty array for classic playback
  - Initialized when MusicLine format detected
  - Reset on song load
- **Purpose**: Per-channel groove phase toggle (MusicLine: alternates between channelSpeeds[ch] and channelGrooves[ch])

---

### **BUCKET 10: Global Volume Control**

#### 10.1 `globalVolume: number` (Line 422)
- **Type**: `number` (range: 0-64)
- **Default**: `64`
- **Set by**:
  - `loadSong()` line 1316: `this.globalVolume = 64`
  - Effect Gxx handler: sets global volume (0-64)
- **Read by**:
  - Effect processing: scales all channel volumes by globalVolume/64
  - Volume envelope calculations: combined with envelope output
- **Lifecycle**:
  - Reset to `64` on song load (despite effects setting to 0, load resets)
  - Modified by Gxx effect during playback
  - Persists across play/stop cycles
- **Purpose**: Global master volume 0-64. All channel output is scaled by this factor.

---

### **BUCKET 11: Format-Specific Period Mode**

#### 11.1 `linearPeriods: boolean` (Line 426)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `loadSong()` line 1308: `this.linearPeriods = song.linearPeriods ?? (song.format === 'XM')`
- **Read by**:
  - Period-to-Hz conversion: determines which formula to use
  - Note-to-period conversion: affects how semitone offsets are calculated
- **Lifecycle**:
  - Set on song load based on format (XM defaults to true, MOD defaults to false)
  - Persists across play/stop cycles
  - Reset on song load
- **Purpose**: XM frequency mode flag: `true` = linear periods (most XMs), `false` = Amiga periods (MOD)

#### 11.2 `useXMPeriods: boolean` (Line 428)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `loadSong()` line 1307: `this.useXMPeriods = song.format === 'XM' || song.format === 'IT' || song.format === 'S3M'`
- **Read by**:
  - Period calculation: uses note numbers (0-96) instead of periods
  - Effect processing: different semantics for pitch-related effects
  - `processTick()` line 2440: `if (!this.useXMPeriods && this.patternDelay > 0)` — legacy MOD pattern delay only
- **Lifecycle**:
  - Set on song load based on format (XM/IT/S3M = true, all others = false)
  - Persists across play/stop cycles
  - Reset on song load
- **Purpose**: Period system selector: `true` = use FT2 note numbers, `false` = use Amiga periods

---

### **BUCKET 12: Audio Routing (Master & Channels)**

#### 12.1 `masterGain: Tone.Gain` (Line 466)
- **Type**: `Tone.Gain`
- **Default**: `new Tone.Gain(1)` (line 602)
- **Set by**:
  - Constructor line 602: created as `new Tone.Gain(1)`
  - `loadSong()` lines 1272-1281: recreated if AudioContext changed
  - `dispose()`: disposed and nullified
- **Read by**:
  - All channel creation: `muteGain.connect(this.masterGain)`
  - `getMasterGain()`: exposed for external routing (DJ mixer)
  - `setMuted()`: gain value set to 0 or 1
  - Master effect chain: input node
- **Lifecycle**:
  - Created in constructor
  - Persists across play/stop cycles
  - Recreated if AudioContext context mismatch detected during song load
  - Disposed in `dispose()`
- **Purpose**: Master output gain node. All channel audio routes through this. Used for global muting and DJ routing.

#### 12.2 `separationNode: StereoSeparationNode` (Line 468)
- **Type**: `StereoSeparationNode` (readonly)
- **Default**: `new StereoSeparationNode()` (line 603)
- **Set by**:
  - Constructor line 603: created
  - `loadSong()` lines 1273, 1275: recreated if AudioContext changed (replaces via type cast)
  - `dispose()`: disposed
- **Read by**:
  - Channel creation: pan nodes connect to separation input
  - `getSeparationInput()`: exposed for external native engine routing
  - `getFullOutput()`: exposes output for global muting
  - `setStereoSeparationMode()`: sets mode (pt2 vs modplug algorithm)
- **Lifecycle**:
  - Created in constructor
  - Persists across play/stop cycles
  - Recreated if AudioContext mismatch
  - Disposed in `dispose()`
- **Purpose**: Stereo separation post-mix node. Implements PT2-clone or ModPlug hard-panning algorithms.

#### 12.3 `stereoMode: 'pt2' | 'modplug'` (Line 469)
- **Type**: `'pt2' | 'modplug'`
- **Default**: `'pt2'`
- **Set by**:
  - `setStereoSeparationMode()` line 1084: changes algorithm
- **Read by**:
  - `setStereoSeparationMode()`: determines how separation is applied
  - Channel pan calculation: pt2 mode scales pan per-channel; modplug uses post-mix
  - `applyChannelPan()` line 1392: `this.stereoMode === 'pt2'`
- **Lifecycle**:
  - Initialized to `'pt2'` (ProTracker-clone algorithm)
  - Can be switched via `setStereoSeparationMode()`
  - Persists across play/stop cycles
- **Purpose**: Stereo separation algorithm selector

#### 12.4 `modplugSeparation: number` (Line 470)
- **Type**: `number` (0-100, percentage)
- **Default**: `0`
- **Set by**:
  - Not explicitly set in provided code excerpt
  - Assumed set by `setStereoSeparationMode()` when switching to modplug
- **Read by**:
  - `setStereoSeparationMode()` line 1094: `this.separationNode.setSeparation(this.modplugSeparation)`
- **Lifecycle**:
  - Initialized to `0` (no separation)
  - Set when modplug mode activated
  - Persists across play/stop cycles
- **Purpose**: ModPlug stereo separation strength (0-100) for post-mix mid-side decomposition

#### 12.5 `stereoSeparation: number` (Line 584)
- **Type**: `number` (0-100)
- **Default**: `100`
- **Set by**:
  - `loadSong()` lines 1295-1303:
    ```typescript
    if (song.format === 'MOD' || song.format === 'AHX' || song.format === 'FC') {
      this.stereoSeparation = 20;      // Amiga LRRL with narrowing
    } else if (song.format === 'HVL') {
      this.stereoSeparation = song.hivelyMeta?.stereoMode ? ... : 50;
    } else {
      this.stereoSeparation = 100;      // Full separation
    }
    ```
  - `setStereoSeparation()` line 1067: direct assignment (0-100 range)
- **Read by**:
  - `setStereoSeparation()`: stores and applies to all channels
  - `applyChannelPan()` line 1393: `basePan * (this.stereoSeparation / 100)`
  - `getStereoSeparation()`: exposes to UI
- **Lifecycle**:
  - Set to format-specific default on song load
  - Can be changed via `setStereoSeparation()`
  - Persists across play/stop cycles
  - Reset on song load
- **Purpose**: Stereo separation percentage (0-100). Controls how wide the pan positions are. 0 = mono, 100 = full hard-pan.

#### 12.6 `channels: ChannelState[]` (Line 463)
- **Type**: `ChannelState[]` (array of per-channel state)
- **Default**: `[]`
- **Set by**:
  - `loadSong()` lines 1285-1288:
    ```typescript
    this.channels = [];
    for (let i = 0; i < song.numChannels; i++) {
      this.channels.push(this.createChannel(i, song.numChannels));
    }
    ```
  - Each element created by `createChannel()`
- **Read by**:
  - All effect processing: accesses `this.channels[ch]`
  - `processTick()` line 2505: iterates channels
  - `stopChannel()`: stops audio on a channel
- **Lifecycle**:
  - Disposed on song load (line 1242-1248)
  - Recreated with new song data
  - Persists across play/stop cycles
- **Purpose**: Array of per-channel playback state (per-channel effect memory, audio nodes, note state)

---

### **BUCKET 13: DJ Mode Features**

#### 13.1 `isDJDeck: boolean` (Line 514)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - Constructor line 608: `this.isDJDeck = true` (if outputNode provided)
  - Never changed after construction
- **Read by**:
  - `processTick()` line 2494: `if (!this.isDJDeck)` — gates ToneEngine mute sync
  - `loadSong()` line 1333: `if (!this.isDJDeck)` — gates global effect sync
  - Multiple places: determines isolation from global state
- **Lifecycle**:
  - Set in constructor (immutable after)
  - `true` for DJ deck instances, `false` for singleton tracker
  - Never changes
- **Purpose**: Flag indicating this is a DJ deck (isolated audio routing and state)

#### 13.2 `tempoMultiplier: number` (Line 515)
- **Type**: `number` (multiplier, typical range 0.25-1.5 for speed change)
- **Default**: `1.0`
- **Set by**:
  - `loadSong()` line 1327: `this.tempoMultiplier = 1.0`
  - `setTempoMultiplier()` line 1003: `this.tempoMultiplier = m`
- **Read by**:
  - `startScheduler()` line 2388: `const effectiveBPM = (this.bpm + this.nudgeOffset) * this.tempoMultiplier`
  - Scheduler tick interval: scales all timing by this factor
- **Lifecycle**:
  - Reset to `1.0` on song load
  - Set by `setTempoMultiplier()` (DJ mode)
  - Scales all tick intervals, effectively speeding up/slowing down playback
  - Persists across play/stop cycles
- **Purpose**: DJ mode: scheduler BPM multiplier (from pitch slider). Scales tempo without changing ToneEngine globals.

#### 13.3 `pitchMultiplier: number` (Line 516)
- **Type**: `number` (multiplier, typical range 0.25-1.5 for pitch change)
- **Default**: `1.0`
- **Set by**:
  - `loadSong()` line 1328: `this.pitchMultiplier = 1.0`
  - `setPitchMultiplier()` line 1013: `this.pitchMultiplier = m; this.updateAllPlaybackRates()`
- **Read by**:
  - `updateAllPlaybackRates()`: multiplies all sample playback rates
- **Lifecycle**:
  - Reset to `1.0` on song load
  - Set by `setPitchMultiplier()` (DJ mode)
  - Calls `updateAllPlaybackRates()` to apply immediately
  - Persists across play/stop cycles
- **Purpose**: DJ mode: sample playback rate multiplier. Affects sample playback speed independently of synth tempo.

#### 13.4 `deckDetuneCents: number` (Line 517)
- **Type**: `number` (cents, range -1200 to +1200 typically)
- **Default**: `0`
- **Set by**:
  - `loadSong()` line 1329: `this.deckDetuneCents = 0`
  - `setDetuneCents()` line 1036: `this.deckDetuneCents = cents`
- **Read by**:
  - Synth parameter mapping: detune parameter for synths
  - `getDetuneCents()`: exposes to UI
- **Lifecycle**:
  - Reset to `0` on song load
  - Set by `setDetuneCents()` (DJ mode)
  - Persists across play/stop cycles
- **Purpose**: DJ mode: per-deck synth detune in cents. Isolated from global state.

#### 13.5 `nudgeOffset: number` (Line 501)
- **Type**: `number` (BPM offset in beats)
- **Default**: `0`
- **Set by**:
  - `setNudge()` line 758: `this.nudgeOffset = offset; this.nudgeTicksRemaining = tickCount`
- **Read by**:
  - `startScheduler()` line 2388: `const effectiveBPM = (this.bpm + this.nudgeOffset) * this.tempoMultiplier`
- **Lifecycle**:
  - `0` normally
  - Set by `setNudge()` with auto-reset counter
  - Applied to BPM for next tick interval
  - Auto-resets to `0` after `nudgeTicksRemaining` ticks
- **Purpose**: DJ mode: temporary BPM offset for beat matching nudge

#### 13.6 `nudgeTicksRemaining: number` (Line 502)
- **Type**: `number` (ticks before nudge expires)
- **Default**: `0`
- **Set by**:
  - `setNudge()` line 759: `this.nudgeTicksRemaining = tickCount`
  - Should be decremented in scheduler (pattern not visible)
- **Read by**:
  - Scheduler: checks for auto-reset
- **Lifecycle**:
  - `0` normally
  - Set by `setNudge()` with tick count
  - Decrements in scheduler loop
  - Auto-resets `nudgeOffset` to `0` when reaching 0
- **Purpose**: DJ mode: counter for nudge auto-reset. Nudge expires after this many ticks.

#### 13.7 `lineLoopStart: number` (Line 503)
- **Type**: `number` (row index, -1 = off)
- **Default**: `-1`
- **Set by**:
  - `setLineLoop()` line 764: `this.lineLoopStart = startRow`
  - `clearLineLoop()` line 777: `this.lineLoopStart = -1`
- **Read by**:
  - Row advancement: checks for line loop wrapping
  - `getSlipState()`: exposes state to UI
- **Lifecycle**:
  - `-1` (off) normally
  - Set by `setLineLoop()` to start row
  - Applied at row boundary when line loop active
  - Cleared by `clearLineLoop()`
- **Purpose**: DJ mode: line-level loop start row (within current pattern)

#### 13.8 `lineLoopEnd: number` (Line 504)
- **Type**: `number` (row index, -1 = off)
- **Default**: `-1`
- **Set by**:
  - `setLineLoop()` line 765: `this.lineLoopEnd = startRow + size - 1`
  - `clearLineLoop()` line 778: `this.lineLoopEnd = -1`
- **Read by**:
  - Row advancement: checks for line loop wrapping
- **Lifecycle**:
  - `-1` (off) normally
  - Set by `setLineLoop()` to end row
  - Applied at row boundary when line loop active
  - Cleared by `clearLineLoop()`
- **Purpose**: DJ mode: line-level loop end row (within current pattern)

#### 13.9 `lineLoopActive: boolean` (Line 505)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `setLineLoop()` line 766: `this.lineLoopActive = true`
  - `clearLineLoop()` line 776: `this.lineLoopActive = false`
- **Read by**:
  - Row advancement: determines if line loop should wrap
- **Lifecycle**:
  - `false` normally
  - Set to `true` by `setLineLoop()`
  - Set to `false` by `clearLineLoop()`
- **Purpose**: DJ mode: flag indicating line loop is active

#### 13.10 `patternLoopStartPos: number` (Line 506)
- **Type**: `number` (song position, -1 = off)
- **Default**: `-1`
- **Set by**:
  - `setPatternLoop()` line 787: `this.patternLoopStartPos = startPos`
  - `clearPatternLoop()` line 799: `this.patternLoopStartPos = -1`
- **Read by**:
  - Song position advancement: checks for pattern loop wrapping
- **Lifecycle**:
  - `-1` (off) normally
  - Set by `setPatternLoop()` to start position
  - Applied at position boundary when pattern loop active
  - Cleared by `clearPatternLoop()`
- **Purpose**: DJ mode: pattern-level loop start song position

#### 13.11 `patternLoopEndPos: number` (Line 507)
- **Type**: `number` (song position, -1 = off)
- **Default**: `-1`
- **Set by**:
  - `setPatternLoop()` line 788: `this.patternLoopEndPos = endPos`
  - `clearPatternLoop()` line 800: `this.patternLoopEndPos = -1`
- **Read by**:
  - Song position advancement: checks for pattern loop wrapping
- **Lifecycle**:
  - `-1` (off) normally
  - Set by `setPatternLoop()` to end position
  - Applied at position boundary when pattern loop active
  - Cleared by `clearPatternLoop()`
- **Purpose**: DJ mode: pattern-level loop end song position

#### 13.12 `patternLoopActive: boolean` (Line 508)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `setPatternLoop()` line 789: `this.patternLoopActive = true`
  - `clearPatternLoop()` line 798: `this.patternLoopActive = false`
- **Read by**:
  - Song position advancement: determines if pattern loop should wrap
- **Lifecycle**:
  - `false` normally
  - Set to `true` by `setPatternLoop()`
  - Set to `false` by `clearPatternLoop()`
- **Purpose**: DJ mode: flag indicating pattern loop is active

#### 13.13 `slipEnabled: boolean` (Line 509)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `setSlipEnabled()` line 808: `this.slipEnabled = enabled`
  - When enabled, saves current position: `slipSongPos`, `slipPattPos`
- **Read by**:
  - `setLineLoop()` line 768: saves position when line loop set
  - `clearLineLoop()` line 780: jumps to slip position when cleared
  - `setPatternLoop()` line 790: saves position when pattern loop set
  - `clearPatternLoop()` line 802: jumps to slip position when cleared
- **Lifecycle**:
  - `false` normally
  - Toggled by `setSlipEnabled()`
  - When enabled, ghost position is saved and restored when loop cleared
  - Persists across play/stop cycles
- **Purpose**: DJ mode: slip mode — when enabled, clearing a loop returns to the original "slip" position instead of staying at loop boundary

#### 13.14 `slipSongPos: number` (Line 510)
- **Type**: `number`
- **Default**: `0`
- **Set by**:
  - `setSlipEnabled()` line 810: `this.slipSongPos = this.songPos` (save on enable)
  - `setLineLoop()` line 769: `this.slipSongPos = this.songPos` (save when line loop set)
  - `setPatternLoop()` line 791: `this.slipSongPos = this.songPos` (save when pattern loop set)
- **Read by**:
  - `clearLineLoop()` line 781: `this.seekTo(this.slipSongPos, this.slipPattPos)`
  - `clearPatternLoop()` line 802: `this.seekTo(this.slipSongPos, this.slipPattPos)`
  - `getSlipState()`: exposes state to UI
- **Lifecycle**:
  - `0` initially
  - Saved when slip mode enabled or loop is set
  - Used to restore position when loop cleared
  - Persists across play/stop cycles
- **Purpose**: DJ mode: ghost song position — saved when slip mode active, restored when loop cleared

#### 13.15 `slipPattPos: number` (Line 511)
- **Type**: `number`
- **Default**: `0` (implicit from field declaration)
- **Set by**:
  - `setSlipEnabled()` line 810: (pattern pos saved implicitly)
  - `setLineLoop()` line 770: (pattern pos saved)
  - `setPatternLoop()` line 792: (pattern pos saved)
- **Read by**:
  - Loop clear functions: restored via `seekTo()`
  - `getSlipState()`: exposes state to UI
- **Lifecycle**:
  - `0` initially
  - Saved when slip mode enabled or loop is set
  - Restored when loop cleared
  - Persists across play/stop cycles
- **Purpose**: DJ mode: ghost pattern row position — saved when slip mode active, restored when loop cleared

#### 13.16 `channelMuteMask: number` (Line 558)
- **Type**: `number` (32-bit mask: bit N = 1 means enabled)
- **Default**: `0xFFFF` (all 16 channels enabled)
- **Set by**:
  - `setChannelMuteMask()` line 1051: `this.channelMuteMask = mask`
- **Read by**:
  - Channel gain nodes: checks mask before allowing audio
  - `updateWasmMuteMask()`: applies to WASM engine
- **Lifecycle**:
  - All channels enabled on init
  - Set by `setChannelMuteMask()` (DJ mode)
  - Persists across play/stop cycles
  - Not reset on song load (deck isolation)
- **Purpose**: DJ mode: per-deck channel mute mask. Bit N = 1 means channel N enabled, 0 means muted.

---

### **BUCKET 14: Scheduler & Timing**

#### 14.1 `scheduleAheadTime: number` (Line 1507)
- **Type**: `number` (seconds)
- **Default**: `0.25`
- **Set by**:
  - Field declaration (constant)
- **Read by**:
  - `startScheduler()` line 2353: `const scheduleUntil = Tone.now() + this.scheduleAheadTime`
- **Lifecycle**:
  - Constant: `0.25` seconds
  - Fixed throughout playback
- **Purpose**: Look-ahead buffer size (250ms). Ticks within this window are scheduled in advance.

#### 14.2 `schedulerInterval: number` (Line 1508)
- **Type**: `number` (seconds)
- **Default**: `0.010` (10ms)
- **Set by**:
  - Field declaration (constant)
- **Read by**:
  - `startScheduler()` line 2396: `setInterval(schedulerTick, this.schedulerInterval * 1000)`
- **Lifecycle**:
  - Constant: `0.010` seconds (10ms interval)
  - Fixed throughout playback
- **Purpose**: Scheduler polling interval. Fills look-ahead buffer every 10ms.

#### 14.3 `nextScheduleTime: number` (Line 1509)
- **Type**: `number` (Web Audio timestamp)
- **Default**: `0`
- **Set by**:
  - `startScheduler()` line 2345: `this.nextScheduleTime = Tone.now() + 0.02`
  - `forcePosition()` line 677: `this.nextScheduleTime = Tone.now()`
  - `startScheduler()` line 2390: `this.nextScheduleTime += tickInterval` (accumulates per tick)
- **Read by**:
  - `startScheduler()` line 2380: `while (this.nextScheduleTime < scheduleUntil && this.playing)`
- **Lifecycle**:
  - Initialized to `Tone.now() + 0.02` when scheduler starts
  - Continuously accumulates by `tickInterval` each tick
  - Never resets (BassoonTracker pattern: continuous timeline)
  - Can be re-synced to `Tone.now()` via `resyncSchedulerToNow()`
- **Purpose**: Continuous timeline for tick scheduling. Never resets, preventing cumulative drift.

#### 14.4 `schedulerTimerId: ReturnType<typeof setInterval> | null` (Line 1516)
- **Type**: `ReturnType<typeof setInterval> | null` (interval ID or null)
- **Default**: `null`
- **Set by**:
  - `startScheduler()` line 2396: `this.schedulerTimerId = setInterval(schedulerTick, ...)`
  - `stop()` line 2262: `clearInterval(this.schedulerTimerId)` + set to null (implicit)
- **Read by**:
  - `stop()`: cleared to stop scheduler
- **Lifecycle**:
  - `null` initially
  - Set when scheduler starts
  - Cleared when playback stops
  - Only one active interval at a time
- **Purpose**: Handle for the scheduler setInterval. Used to clear scheduler when stopping.

#### 14.5 `totalRowsProcessed: number` (Line 436)
- **Type**: `number` (cumulative count)
- **Default**: `0`
- **Set by**:
  - `startScheduler()` line 2346: reset to `0` when starting
  - `advanceRow()` line 5372+: incremented each row
- **Read by**:
  - Diagnostic/timing analysis
- **Lifecycle**:
  - Reset to `0` when scheduler starts
  - Increments every row during playback
  - Accumulates across play/stop cycles until next song load
- **Purpose**: Diagnostic counter — tracks total rows processed for timing analysis

#### 14.6 `totalTicksProcessed: number` (Line 437)
- **Type**: `number` (cumulative count)
- **Default**: `0`
- **Set by**:
  - `startScheduler()` line 2347: reset to `0` when starting
  - `processTick()` line 2431: `this.totalTicksProcessed++`
- **Read by**:
  - Diagnostic/timing analysis
- **Lifecycle**:
  - Reset to `0` when scheduler starts
  - Increments every tick processed
  - Accumulates across play/stop cycles until next song load
- **Purpose**: Diagnostic counter — tracks total ticks processed for timing drift analysis

---

### **BUCKET 15: Display State Ring Buffer (Audio-Synced UI)**

#### 15.1 `stateRing: DisplayState[]` (Line 477)
- **Type**: `DisplayState[]` (pre-allocated array of 256 DisplayState objects)
- **Default**: Pre-allocated with 256 objects:
  ```typescript
  Array.from({ length: 256 }, () => ({ time: 0, row: 0, pattern: 0, position: 0, tick: 0, duration: 0 }))
  ```
- **Set by**:
  - Constructor line 477: allocated
  - `queueDisplayState()` line 2625: modifies object at head index
- **Read by**:
  - `getStateAtTime()` line 2648: reads from tail, dequeues on audio time advancement
  - Display/UI: consumed to synchronize pattern editor with playback audio
- **Lifecycle**:
  - Allocated once in constructor (fixed 256 elements)
  - Reused as ring buffer (never freed or reallocated)
  - Persists across play/stop cycles
- **Purpose**: Ring buffer of display states. Avoids O(n) array shifting. Each element represents a point in time when the display should update.

#### 15.2 `stateRingHead: number` (Line 478)
- **Type**: `number` (index, 0-255)
- **Default**: `0`
- **Set by**:
  - `queueDisplayState()` line 2642: increments wrapping: `(this.stateRingHead + 1) % this.stateRing.length`
  - `clearStateQueue()` line 2688: reset to `0`
- **Read by**:
  - `queueDisplayState()` line 2625: `const s = this.stateRing[this.stateRingHead]`
- **Lifecycle**:
  - `0` initially
  - Increments (wrapping) each time a state is queued
  - Reset to `0` when state queue cleared (on stop/pause)
- **Purpose**: Write index for ring buffer — points to next free slot

#### 15.3 `stateRingTail: number` (Line 479)
- **Type**: `number` (index, 0-255)
- **Default**: `0`
- **Set by**:
  - `getStateAtTime()` line 2666: increments when dequeuing: `(this.stateRingTail + 1) % this.stateRing.length`
  - `clearStateQueue()` line 2689: reset to `0`
- **Read by**:
  - `getStateAtTime()` line 2660: `const s = this.stateRing[this.stateRingTail]`
- **Lifecycle**:
  - `0` initially
  - Increments (wrapping) each time a state is dequeued
  - Reset to `0` when queue cleared
- **Purpose**: Read index for ring buffer — points to next state to dequeue

#### 15.4 `stateRingCount: number` (Line 480)
- **Type**: `number` (count of items in ring, 0-256)
- **Default**: `0`
- **Set by**:
  - `queueDisplayState()` line 2643: increments (capped at 256)
  - `getStateAtTime()` line 2667: decrements on dequeue
  - `clearStateQueue()` line 2690: reset to `0`
- **Read by**:
  - `getStateAtTime()` line 2659: gate dequeue if count > 0
  - `queueDisplayState()` line 2640: prevent over-filling
- **Lifecycle**:
  - `0` initially (empty ring)
  - Increments as states queued, decrements as dequeued
  - Capped at 256 (max ring size)
  - Reset to `0` when queue cleared
- **Purpose**: Item count in ring buffer. Used to determine if queue is empty and prevent overflow.

#### 15.5 `lastDequeuedState: DisplayState | null` (Line 481)
- **Type**: `DisplayState | null`
- **Default**: `null`
- **Set by**:
  - `getStateAtTime()` line 2664: `this.lastDequeuedState = dequeued`
  - `clearStateQueue()` line 2696: `this.lastDequeuedState = null`
  - `forcePosition()` line 696: reset to `null`
- **Read by**:
  - UI components: read last dequeued state to determine current display row
- **Lifecycle**:
  - `null` initially
  - Updated each time a state is dequeued (every time display updates)
  - Persists across play/stop cycles
  - Reset when queue cleared or position forced
- **Purpose**: Cache of last dequeued state for UI consumption. Avoids re-reading the ring buffer.

---

### **BUCKET 16: Sample & Instrument Caching**

#### 16.1 `bufferCache: Map<number, Tone.ToneAudioBuffer>` (Line 485)
- **Type**: `Map<number, Tone.ToneAudioBuffer>`
- **Default**: `new Map()`
- **Set by**:
  - `loadSong()` line 1204: `this.bufferCache.clear()`
  - `triggerNote()` line 4637+: populates cache when decoding sample
- **Read by**:
  - `triggerNote()`: checks cache before decoding
- **Lifecycle**:
  - Cleared on song load
  - Populated lazily on first note trigger per instrument
  - Caches ToneAudioBuffer wrappers to avoid re-wrapping same decoded buffer
  - Persists across play/stop cycles until song changes
- **Purpose**: Cache of ToneAudioBuffer wrappers (avoids redundant re-wrapping of decoded audio buffers)

#### 16.2 `multiSampleBufferCache: Map<string, AudioBuffer>` (Line 487)
- **Type**: `Map<string, AudioBuffer>`
- **Default**: `new Map()`
- **Set by**:
  - `loadSong()` line 1205: `this.multiSampleBufferCache.clear()`
  - Sample decoding: populates cache with decoded multi-sample buffers
- **Read by**:
  - Note triggering: checks cache before decoding
- **Lifecycle**:
  - Cleared on song load
  - Populated lazily during playback
  - Caches decoded AudioBuffer objects for multi-sample instruments
  - Persists until song changes
- **Purpose**: Cache of decoded multi-sample AudioBuffers (keyed by "instId:sampleIdx")

#### 16.3 `instrumentMap: Map<number, InstrumentConfig>` (Line 492)
- **Type**: `Map<number, InstrumentConfig>`
- **Default**: `new Map()`
- **Set by**:
  - `loadSong()` line 1207: `this.instrumentMap = new Map(song.instruments.map(i => [i.id, i]))`
  - `updateInstrument()` line 733: updates a single instrument config
- **Read by**:
  - All note triggering: `const config = this.instrumentMap.get(instId)`
  - Effect handlers requiring instrument data
  - `fireHybridNotesForRow()` line 918: gets config for release
- **Lifecycle**:
  - Initialized on song load from song.instruments
  - Can be updated via `updateInstrument()` (user edits instrument)
  - Persists across play/stop cycles
  - Reset on song load
- **Purpose**: Fast instrument lookup by ID (avoids linear scan of song.instruments array)

#### 16.4 `_warnedOnce?: Set<string>` (Line 488)
- **Type**: `Set<string> | undefined`
- **Default**: `undefined`
- **Set by**:
  - `loadSong()` line 1193: `this._warnedOnce = undefined`
  - Warnings during playback: add to set to prevent duplicate warns
- **Read by**:
  - Warning checks: `if (!this._warnedOnce?.has(...))` before logging
- **Lifecycle**:
  - `undefined` on song load
  - Lazily initialized as Set on first warning
  - Accumulates warnings during song playback
  - Reset on song load
- **Purpose**: Deduplicate console warnings (warn once per song, not per tick)

#### 16.5 `_warnedMissingInstruments?: Set<number>` (Line 489)
- **Type**: `Set<number> | undefined`
- **Default**: `undefined`
- **Set by**:
  - `loadSong()` line 1206: `this._warnedMissingInstruments = undefined`
  - Warning logging: tracks which instrument IDs have been warned about
- **Read by**:
  - Missing instrument checks: `if (!this._warnedMissingInstruments?.has(instId))`
- **Lifecycle**:
  - `undefined` on song load
  - Lazily initialized when missing instrument encountered
  - Tracks IDs of warned instruments
  - Reset on song load
- **Purpose**: Deduplicate warnings for missing instruments (warn once per ID per song)

---

### **BUCKET 17: Hybrid Playback (WASM + ToneEngine)**

#### 17.1 `_suppressNotes: boolean` (Line 523)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `play()` line 1539: reset to `false`
  - `play()` line 1589: set to `true` if WASM engine started
  - `setSuppressNotes()` line 830: direct assignment
  - `forcePosition()` line 694: set to `false` (warm restart)
- **Read by**:
  - `processTick()` line 2490: `if (!this._suppressNotes)` — gates row/effect processing
  - `fireHybridNotesForRow()` line 892: checks if hybrid playback active
  - Scratch pattern detection
- **Lifecycle**:
  - `false` on load/play start
  - Set to `true` when WASM engine drives playback (libopenmpt, UADE, Hively, SID, etc.)
  - Row/effect processing skipped when true (sequencer still advances for visual)
  - Can be toggled by `setSuppressNotes()` for DJ scratches
  - Reset on `forcePosition()` (warm restart)
- **Purpose**: Flag indicating WASM engine is handling playback. When true, TS sequencer advances but doesn't fire notes (WASM does).

#### 17.2 `_replacedInstruments: Set<number>` (Line 528)
- **Type**: `Set<number>`
- **Default**: `new Set()`
- **Set by**:
  - `loadSong()` line 1178: `this._replacedInstruments.clear()`
  - `play()` lines 1814-1817: populates from instrument store (non-Sampler/Player)
  - `markInstrumentReplaced()` line 836: adds to set
  - `restoreReplacedInstruments()` line 857: restores from saved state
- **Read by**:
  - `fireHybridNotesForRow()` line 892: checks if inst is replaced
  - `updateWasmMuteMask()` line 877: determines which channels to mute in WASM
  - `markInstrumentReplaced()` / `unmarkInstrumentReplaced()` / `hasReplacedInstruments` / `replacedInstrumentIds` accessors
- **Lifecycle**:
  - Cleared on song load
  - Populated at play() start from instrument store
  - Can be added to dynamically via `markInstrumentReplaced()`
  - Persists across play/stop cycles
  - Important: NOT cleared on play(), only on loadSong()
- **Purpose**: Set of instrument IDs that are replaced with ToneEngine synths (during hybrid playback, these fire via ToneEngine while WASM handles samples/drums)

#### 17.3 `_activeWasmEngine: { setMuteMask(mask: number): void } | null` (Line 533)
- **Type**: `{ setMuteMask(mask: number): void } | null`
- **Default**: `null`
- **Set by**:
  - `loadSong()` line 1179: `this._activeWasmEngine = null`
  - `play()` lines 1593-1607: set to active WASM engine if it supports `setMuteMask()`
  - `setActiveWasmEngine()` line 863: direct assignment
- **Read by**:
  - `updateWasmMuteMask()` line 870: calls `setMuteMask()` on engine
- **Lifecycle**:
  - `null` initially and on song load
  - Set during `play()` when WASM engine starts
  - Used to apply hybrid playback mute mask (channels with replaced instruments)
  - Cleared on song load
- **Purpose**: Reference to active WASM engine for dynamic mute mask updates. Used to silence WASM channels that have replaced synths.

---

### **BUCKET 18: Note Suppression Features**

#### 18.1 `_saTrackLen: number` (Line 537)
- **Type**: `number` (rows)
- **Default**: `0`
- **Set by**:
  - Effect 0x9 handler (SonicArranger): sets dynamic track length
- **Read by**:
  - Pattern length calculation: overrides normal pattern.length
- **Lifecycle**:
  - `0` on load
  - Set by effect 0x9 during playback
  - Reset to `0` on row advance (per-row override)
  - Effect-driven, not user-controlled
- **Purpose**: SonicArranger: dynamic track length override (effect 0x9). Allows per-row pattern length changes.

#### 18.2 `_playGeneration: number` (Line 543)
- **Type**: `number` (generation counter)
- **Default**: `0`
- **Set by**:
  - `play()` line 1536: incremented each time `play()` called
  - `stop()` line 2170: incremented to invalidate async play()
- **Read by**:
  - Async `play()` line 1545, 1548, 1557, etc.: checks `if (gen !== this._playGeneration) return`
- **Lifecycle**:
  - Incremented at start of each `play()` call
  - Also incremented by `stop()` to cancel in-flight async continuations
  - Used to detect stale async play() calls (if another play/stop happened while awaiting)
- **Purpose**: Generation counter — aborts stale async play() continuations. Prevents orphaned schedulers if user rapidly clicks play/stop.

---

### **BUCKET 19: WASM Sequencer (Furnace Native Playback)**

#### 19.1 `useWasmSequencer: boolean` (Line 548)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `play()` (implicit): set based on format (Furnace native formats)
  - Effect handling: may enable/disable
- **Read by**:
  - `syncCellToWasmSequencer()` line 985: gate WASM synth cell updates
  - Pattern edit sync: determines if edits go to WASM sequencer
- **Lifecycle**:
  - `false` for classic formats (MOD/XM/IT/S3M)
  - `true` for Furnace formats that use WASM sequencer for playback
  - Set during `play()` if Furnace WASM sequencer active
  - Persists across play/stop cycles
- **Purpose**: Flag indicating WASM sequencer drives playback (Furnace native). TS scheduler does not run; position updates come from worklet.

#### 19.2 `_seqPositionUnsub: (() => void) | null` (Line 549)
- **Type**: `(() => void) | null`
- **Default**: `null`
- **Set by**:
  - `play()` (implicit): subscription to WASM sequencer position updates
  - `stop()`: unsubscribes (calls `_seqPositionUnsub()`)
- **Read by**:
  - `stop()` line (implicit): unsubscribe callback
- **Lifecycle**:
  - `null` normally
  - Set when WASM sequencer position subscription established
  - Called (unsubscribed) on stop
  - Reset to `null` after unsubscribe
- **Purpose**: Unsubscribe callback for WASM sequencer position updates. Used to clean up listener on stop.

---

### **BUCKET 20: libopenmpt Playback Mode**

#### 20.1 `useLibopenmptPlayback: boolean` (Line 553)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `play()` (implicit): set if song has `libopenmptFileData`
  - Format detection: MOD/XM/IT/S3M via libopenmpt
- **Read by**:
  - `forcePosition()` line 682: if true, forwards position to libopenmpt engine
  - `stop()` line 2193: if true, stops libopenmpt playback
  - Effect processing: some effects may behave differently in libopenmpt mode
- **Lifecycle**:
  - `false` for non-libopenmpt formats
  - `true` when libopenmpt handles playback (MOD/XM/IT/S3M via soundlib)
  - Set during `play()` if libopenmptFileData present
  - Persists across play/stop cycles
- **Purpose**: Flag indicating libopenmpt AudioWorklet drives playback. TS scheduler is minimal; position sync comes from libopenmpt worklet.

---

### **BUCKET 21: Native Engine References & Subscriptions**

#### 21.1 `c64SidEngine: C64SIDEngine | null` (Line 565)
- **Type**: `C64SIDEngine | null`
- **Default**: `null`
- **Set by**:
  - `play()` line 1590: `this.c64SidEngine = result.c64SidEngine`
  - `stop()` line 2212: `this.c64SidEngine = stopNativeEngines(...)`
  - `loadSong()` (implicit): cleared when song changes
- **Read by**:
  - `getC64SIDEngine()` line 576: exposes engine for subsong switching
- **Lifecycle**:
  - `null` on load
  - Set when SID engine starts in `play()`
  - Cleared on `stop()` or song change
  - Used to access SID-specific features (subsong selection)
- **Purpose**: Reference to active C64 SID WASM engine. Exposed for subsong switching and diagnostics.

#### 21.2 `hivelyEngine: HivelyEngine | null` (Line 566)
- **Type**: `HivelyEngine | null`
- **Default**: `null`
- **Set by**:
  - `play()` line 1613: `this.hivelyEngine = result.hivelyEngine`
  - `stop()` (implicit): cleared when engines stopped
- **Read by**:
  - Position subscription setup in `play()` line 1616
- **Lifecycle**:
  - `null` normally
  - Set when Hively engine active in `play()`
  - Used to subscribe to position updates
  - Cleared on stop
- **Purpose**: Reference to active Hively WASM engine. Used for position tracking subscriptions.

#### 21.3 `_hvlPositionUnsub: (() => void) | null` (Line 567)
- **Type**: `(() => void) | null`
- **Default**: `null`
- **Set by**:
  - `play()` line 1616: `this._hvlPositionUnsub = this.hivelyEngine.onPositionUpdate(...)`
  - `stop()` (implicit): called to unsubscribe
- **Read by**:
  - `stop()`: unsubscribe callback
- **Lifecycle**:
  - `null` normally
  - Set when Hively position subscription created
  - Called on stop to clean up
  - Reset to `null` after unsubscribe
- **Purpose**: Unsubscribe callback for Hively position updates. Used to clean up listener on stop.

#### 21.4 `_mlPositionUnsub: (() => void) | null` (Line 568)
- **Type**: `(() => void) | null`
- **Default**: `null`
- **Set by**:
  - `play()` line 1638: `this._mlPositionUnsub = result.musicLineEngine.onPosition(...)`
  - `stop()` (implicit): called to unsubscribe
- **Read by**:
  - `stop()`: unsubscribe callback
- **Lifecycle**:
  - `null` normally
  - Set when MusicLine position subscription created
  - Called on stop to clean up
  - Reset to `null` after unsubscribe
- **Purpose**: Unsubscribe callback for MusicLine position updates. Used to clean up listener on stop.

#### 21.5 `_uadePositionUnsub: (() => void) | null` (Line 569)
- **Type**: `(() => void) | null`
- **Default**: `null`
- **Set by**:
  - `play()` line 1663: `this._uadePositionUnsub = result.uadeEngine.onPositionUpdate(...)`
  - `stop()` (implicit): called to unsubscribe
- **Read by**:
  - `stop()`: unsubscribe callback
- **Lifecycle**:
  - `null` normally
  - Set when UADE position subscription created
  - Called on stop to clean up
  - Reset to `null` after unsubscribe
- **Purpose**: Unsubscribe callback for UADE position updates. Used to clean up listener on stop.

#### 21.6 `_uadePaulaLogInterval: number | null` (Line 570)
- **Type**: `number | null` (setInterval ID)
- **Default**: `null`
- **Set by**:
  - `play()` line 1703: `this._uadePaulaLogInterval = window.setInterval(...)`
  - `stop()` (implicit): cleared
- **Read by**:
  - `stop()`: interval cleared
- **Lifecycle**:
  - `null` normally
  - Set when UADE Paula register logging enabled
  - Cleared on stop
- **Purpose**: Handle for Paula register logging interval (10x/sec). Used to capture automation data from UADE.

#### 21.7 `_furnaceCmdLogUnsub: (() => void) | null` (Line 571)
- **Type**: `(() => void) | null`
- **Default**: `null`
- **Set by**:
  - `play()` (implicit): set if Furnace command logging subscribed
  - `stop()` (implicit): called to unsubscribe
- **Read by**:
  - `stop()`: unsubscribe callback
- **Lifecycle**:
  - `null` normally
  - Set when Furnace command logging subscription created
  - Called on stop to clean up
  - Reset to `null` after unsubscribe
- **Purpose**: Unsubscribe callback for Furnace command logging (automation capture)

#### 21.8 `_captureSyncInterval: number | null` (Line 572)
- **Type**: `number | null` (setInterval ID)
- **Default**: `null`
- **Set by**:
  - `play()` (implicit): set if automation capture syncing enabled
  - `stop()` (implicit): cleared
- **Read by**:
  - `stop()`: interval cleared
- **Lifecycle**:
  - `null` normally
  - Set when capture sync interval established
  - Cleared on stop
- **Purpose**: Handle for automation capture sync interval. Used to periodically sync captured automation data.

#### 21.9 `_tfmxChannelUnsub: (() => void) | null` (Line 573)
- **Type**: `(() => void) | null`
- **Default**: `null`
- **Set by**:
  - `play()` line 1767: `this._tfmxChannelUnsub = result.uadeEngine.onChannelData(...)`
  - `stop()` (implicit): called to unsubscribe
- **Read by**:
  - `stop()`: unsubscribe callback
- **Lifecycle**:
  - `null` normally
  - Set when TFMX channel data subscription created
  - Called on stop to clean up
  - Reset to `null` after unsubscribe
- **Purpose**: Unsubscribe callback for TFMX channel data updates (position tracking). Used to clean up listener on stop.

#### 21.10 `routedNativeEngines: Set<string>` (Line 587)
- **Type**: `Set<string>` (engine names: "uade", "hively", etc.)
- **Default**: `new Set()`
- **Set by**:
  - `play()` line (implicit): populated by `startNativeEngines()` with routed engines
  - `loadSong()` line 1186: `restoreNativeRouting(this.routedNativeEngines)` (cleanup)
- **Read by**:
  - Pause/resume: `pauseNativeEngines(this.routedNativeEngines)`
  - Cleanup: `restoreNativeRouting(this.routedNativeEngines)`
- **Lifecycle**:
  - Empty on load
  - Populated when native engines routed to separation chain
  - Used to track which engines need cleanup
  - Cleared on song change
- **Purpose**: Track which native WASM engines were rerouted to the separation chain (for cleanup on song change)

---

### **BUCKET 22: Callbacks & Event Handlers**

#### 22.1 `onRowChange: ((row: number, pattern: number, position: number) => void) | null` (Line 495)
- **Type**: Function callback or null
- **Default**: `null`
- **Set by**:
  - `loadSong()` line 1344: `this.onRowChange = null` (clear on new song)
  - External callers: set callback before playing
- **Read by**:
  - Multiple row-change points: `if (this.onRowChange)` calls it
- **Lifecycle**:
  - Set to null on song load
  - Set by external code before playing (e.g., UI row highlight)
  - Called whenever row advances
  - Reset on song load
- **Purpose**: Optional callback fired when row advances (for UI synchronization)

#### 22.2 `onChannelRowChange: ((channelRows: number[]) => void) | null` (Line 496)
- **Type**: Function callback or null
- **Default**: `null`
- **Set by**:
  - `loadSong()` line 1345: `this.onChannelRowChange = null`
  - External callers: set before playing
- **Read by**:
  - Per-channel row advance (MusicLine format)
- **Lifecycle**:
  - Set to null on song load
  - Set by external code before playing
  - Called when per-channel rows change
  - Reset on song load
- **Purpose**: Optional callback fired when per-channel rows advance (MusicLine format, for UI display)

#### 22.3 `onSongEnd: (() => void) | null` (Line 497)
- **Type**: Function callback or null
- **Default**: `null`
- **Set by**:
  - `loadSong()` line 1346: `this.onSongEnd = null`
  - External callers: set before playing
- **Read by**:
  - `advanceRow()` line 5372+: called when song loops
- **Lifecycle**:
  - Set to null on song load
  - Set by external code before playing
  - Called when song reaches end and loops
  - Reset on song load
  - Debounced: `_songEndFiredThisBatch` prevents duplicate calls per scheduler batch
- **Purpose**: Optional callback fired when song completes one loop

#### 22.4 `onTickProcess: ((tick: number, row: number) => void) | null` (Line 498)
- **Type**: Function callback or null
- **Default**: `null`
- **Set by**:
  - `loadSong()` line 1347: `this.onTickProcess = null`
  - External callers: set before playing
- **Read by**:
  - `processTick()` line 2591: `if (this.onTickProcess) this.onTickProcess(...)`
- **Lifecycle**:
  - Set to null on song load
  - Set by external code for tick-by-tick UI updates
  - Called every tick
  - Reset on song load
- **Purpose**: Optional callback fired every tick (for detailed UI updates, VU meters, etc.)

#### 22.5 `onScratchEffect?: (param: number) => void` (Line 597)
- **Type**: Optional callback function
- **Default**: `undefined`
- **Set by**:
  - External DeckEngine code (optional setup)
- **Read by**:
  - Scratch effect handler (Xnn): `if (this.onScratchEffect)` calls it
- **Lifecycle**:
  - `undefined` normally
  - Set by DeckEngine if scratch effects need handling
  - Called when scratch effect encountered
  - Optional (not always set)
- **Purpose**: Optional callback for DJ scratch effect commands (Xnn effect)

#### 22.6 `meterCallbacks: (() => void)[] | null` (Line 561)
- **Type**: `(() => void)[] | null`
- **Default**: `null`
- **Set by**:
  - `processTick()` line 2568: lazily allocated as array of 64 callbacks
  - Each callback triggers a channel meter update
- **Read by**:
  - `processTick()` line 2585: `Tone.Draw.schedule(this.meterCallbacks[ch], safeTime)`
- **Lifecycle**:
  - `null` initially
  - Allocated on first call to `processTick()` when `_suppressNotes` is true
  - Reused for all subsequent ticks
  - Provides VU meter triggers for native engine formats
- **Purpose**: Pre-allocated VU meter callback array (one per channel). Used to trigger meter updates during native engine playback.

---

### **BUCKET 23: State Caching**

#### 23.1 `_cachedTransportState: ReturnType<typeof useTransportStore.getState> | null` (Line 411)
- **Type**: Transport store state object or null
- **Default**: `null`
- **Set by**:
  - `startScheduler()` line 2356: `this._cachedTransportState = transportState` (every scheduler tick)
  - `processTick()` line 2452: used from cache if available
- **Read by**:
  - `processTick()` line 2452: `const transportState = this._cachedTransportState ?? useTransportStore.getState()`
  - Effect processing: reads groove/swing from cache
- **Lifecycle**:
  - `null` initially
  - Updated every scheduler tick (15ms)
  - Reused in processTick() to avoid multiple getState() calls
  - Reduces store lookup overhead
- **Purpose**: PERF optimization — cache transport state once per scheduler interval to avoid repeated store access in processTick()

#### 23.2 `_muted: boolean` (Line 590)
- **Type**: `boolean`
- **Default**: `false`
- **Set by**:
  - `setMuted()` line 638: `this._muted = mute`
- **Read by**:
  - `play()` line 1584: passed to `startNativeEngines()`
  - `resumeNativeEnginesAfterScratch()` line 1032: passed to resume function
- **Lifecycle**:
  - `false` initially
  - Set by `setMuted()` (DJ mode or UI mute button)
  - Persists across play/stop cycles
  - Not reset on song load (deck isolation or global state)
- **Purpose**: Global mute flag. When true, audio output is silenced (masterGain.gain = 0).

---

### **BUCKET 24: Meter & Metering Data**

#### 24.1 `meterStaging: Float64Array` (Line 562)
- **Type**: `Float64Array` (64 elements, one per channel)
- **Default**: `new Float64Array(64)` (all zeros)
- **Set by**:
  - `processTick()` line 2569: reallocated on meter callback initialization
  - `processTick()` line 2584: `this.meterStaging[ch] = vol` (volume values for channels with notes)
- **Read by**:
  - `processTick()` line 2573: `Tone.Draw.schedule(this.meterCallbacks[ch], ...)` with stored value
- **Lifecycle**:
  - Allocated in constructor/first use
  - Populated each tick (in `processTick()`) with channel volumes
  - Consumed by meter callbacks
  - Reused for all ticks
- **Purpose**: Staging buffer for VU meter levels — holds volume values for 64 channels, consumed by meter callback

---

## Summary Table: All Instance Variables

| Variable | Type | Default | Category | Purpose |
|----------|------|---------|----------|---------|
| `song` | `TrackerSong \| null` | `null` | Song Data | Loaded module/song data |
| `accessor` | `PatternAccessor` | `new PatternAccessor()` | Song Data | Format-agnostic pattern accessor |
| `songPos` | `number` | `0` | Position | Current song position index |
| `pattPos` | `number` | `0` | Position | Current pattern row index |
| `currentTick` | `number` | `0` | Position | Current tick within row |
| `playing` | `boolean` | `false` | Playback | Master playback enable flag |
| `_songEndFiredThisBatch` | `boolean` | `false` | Playback | Debounce flag for song-end callback |
| `_hasPlayedOnce` | `boolean` | `false` | Playback | Gate warm restart (missing setter) |
| `skipNextReload` | `boolean` | `false` | Playback | React effect guard |
| `speed` | `number` | `6` | Tempo | Ticks per row |
| `bpm` | `number` | `125` | Tempo | Beats per minute |
| `speed2` | `number \| null` | `null` | Tempo | Furnace alternate speed (speed2) |
| `speedAB` | `boolean` | `false` | Tempo | Furnace speed toggle (speed1 vs speed2) |
| `activeGroove` | `number[] \| null` | `null` | Groove | Active groove tick counts array |
| `groovePos` | `number` | `0` | Groove | Current groove position |
| `lastGrooveTemplateId` | `string` | `'straight'` | Groove | Cached groove template ID |
| `lastSwingAmount` | `number` | `100` | Groove | Cached swing amount |
| `lastGrooveSteps` | `number` | `2` | Groove | Cached groove steps |
| `globalPitchTarget` | `number` | `0` | Global Pitch | Wxx target semitones |
| `globalPitchCurrent` | `number` | `0` | Global Pitch | Wxx current semitones (sliding) |
| `globalPitchSlideSpeed` | `number` | `0.5` | Global Pitch | Wxx slide speed (semitones/tick) |
| `pBreakPos` | `number` | `0` | Pattern Break | Dxx row position |
| `pBreakFlag` | `boolean` | `false` | Pattern Break | Dxx break flag |
| `posJumpFlag` | `boolean` | `false` | Pattern Break | Bxx jump flag |
| `patternDelay` | `number` | `0` | Pattern Delay | MOD legacy pattern delay (EEx) |
| `pattDelTime` | `number` | `0` | Pattern Delay | FT2 pattern delay staging (EEx) |
| `pattDelTime2` | `number` | `0` | Pattern Delay | FT2 pattern delay active counter |
| `channelTickCounters` | `number[]` | `[]` | Per-Channel Seq | MusicLine per-channel tick counter |
| `channelPattPos` | `number[]` | `[]` | Per-Channel Seq | MusicLine per-channel row position |
| `channelSongPos` | `number[]` | `[]` | Per-Channel Seq | MusicLine per-channel song position |
| `channelGrooveToggle` | `boolean[]` | `[]` | Per-Channel Seq | MusicLine per-channel groove toggle |
| `globalVolume` | `number` | `64` | Global Volume | Master volume (0-64) |
| `linearPeriods` | `boolean` | `false` | Format | XM linear periods flag |
| `useXMPeriods` | `boolean` | `false` | Format | FT2 note number system flag |
| `masterGain` | `Tone.Gain` | `new Tone.Gain(1)` | Audio Routing | Master output gain node |
| `separationNode` | `StereoSeparationNode` | `new StereoSeparationNode()` | Audio Routing | Stereo separation post-mix node |
| `stereoMode` | `'pt2' \| 'modplug'` | `'pt2'` | Audio Routing | Stereo separation algorithm |
| `modplugSeparation` | `number` | `0` | Audio Routing | ModPlug separation strength (%) |
| `stereoSeparation` | `number` | `100` | Audio Routing | Stereo separation % (0-100) |
| `channels` | `ChannelState[]` | `[]` | Audio Routing | Per-channel playback state array |
| `isDJDeck` | `boolean` | `false` | DJ Mode | Flag: DJ deck instance |
| `tempoMultiplier` | `number` | `1.0` | DJ Mode | Scheduler BPM multiplier (DJ pitch) |
| `pitchMultiplier` | `number` | `1.0` | DJ Mode | Sample playback rate multiplier |
| `deckDetuneCents` | `number` | `0` | DJ Mode | Per-deck synth detune (cents) |
| `nudgeOffset` | `number` | `0` | DJ Mode | Temporary BPM offset (nudge) |
| `nudgeTicksRemaining` | `number` | `0` | DJ Mode | Nudge auto-reset counter |
| `lineLoopStart` | `number` | `-1` | DJ Mode | Line loop start row |
| `lineLoopEnd` | `number` | `-1` | DJ Mode | Line loop end row |
| `lineLoopActive` | `boolean` | `false` | DJ Mode | Line loop active flag |
| `patternLoopStartPos` | `number` | `-1` | DJ Mode | Pattern loop start position |
| `patternLoopEndPos` | `number` | `-1` | DJ Mode | Pattern loop end position |
| `patternLoopActive` | `boolean` | `false` | DJ Mode | Pattern loop active flag |
| `slipEnabled` | `boolean` | `false` | DJ Mode | Slip mode flag |
| `slipSongPos` | `number` | `0` | DJ Mode | Slip ghost song position |
| `slipPattPos` | `number` | `0` | DJ Mode | Slip ghost pattern row position |
| `channelMuteMask` | `number` | `0xFFFF` | DJ Mode | Per-deck channel mute mask |
| `scheduleAheadTime` | `number` | `0.25` | Scheduler | Look-ahead buffer (seconds) |
| `schedulerInterval` | `number` | `0.010` | Scheduler | Scheduler tick interval (10ms) |
| `nextScheduleTime` | `number` | `0` | Scheduler | Continuous timeline (never resets) |
| `schedulerTimerId` | `number \| null` | `null` | Scheduler | Interval handle (setInterval ID) |
| `totalRowsProcessed` | `number` | `0` | Scheduler | Diagnostic row counter |
| `totalTicksProcessed` | `number` | `0` | Scheduler | Diagnostic tick counter |
| `stateRing` | `DisplayState[]` | Pre-allocated 256 | Display Ring | Audio-synced UI state ring buffer |
| `stateRingHead` | `number` | `0` | Display Ring | Write index (ring buffer) |
| `stateRingTail` | `number` | `0` | Display Ring | Read index (ring buffer) |
| `stateRingCount` | `number` | `0` | Display Ring | Item count in ring (0-256) |
| `lastDequeuedState` | `DisplayState \| null` | `null` | Display Ring | Last dequeued state cache |
| `bufferCache` | `Map<number, Tone.ToneAudioBuffer>` | `new Map()` | Caching | ToneAudioBuffer wrapper cache |
| `multiSampleBufferCache` | `Map<string, AudioBuffer>` | `new Map()` | Caching | Decoded multi-sample buffer cache |
| `instrumentMap` | `Map<number, InstrumentConfig>` | `new Map()` | Caching | Instrument lookup map (by ID) |
| `_warnedOnce` | `Set<string> \| undefined` | `undefined` | Caching | Deduplicate warning set |
| `_warnedMissingInstruments` | `Set<number> \| undefined` | `undefined` | Caching | Missing instrument warning set |
| `_suppressNotes` | `boolean` | `false` | Hybrid Playback | WASM engine suppresses TS notes |
| `_replacedInstruments` | `Set<number>` | `new Set()` | Hybrid Playback | Synth replacement instrument set |
| `_activeWasmEngine` | Engine ref \| null | `null` | Hybrid Playback | Active WASM engine mute reference |
| `_saTrackLen` | `number` | `0` | Format Features | SonicArranger dynamic track length |
| `_playGeneration` | `number` | `0` | Async Control | Generation counter (stale call detection) |
| `useWasmSequencer` | `boolean` | `false` | WASM Sequencer | WASM drives playback (Furnace native) |
| `_seqPositionUnsub` | Function \| null | `null` | WASM Sequencer | Position subscription unsubscribe |
| `useLibopenmptPlayback` | `boolean` | `false` | libopenmpt | libopenmpt AudioWorklet drives playback |
| `c64SidEngine` | Engine ref \| null | `null` | Native Engines | Active C64 SID engine |
| `hivelyEngine` | Engine ref \| null | `null` | Native Engines | Active Hively engine |
| `_hvlPositionUnsub` | Function \| null | `null` | Native Engines | Hively position unsub |
| `_mlPositionUnsub` | Function \| null | `null` | Native Engines | MusicLine position unsub |
| `_uadePositionUnsub` | Function \| null | `null` | Native Engines | UADE position unsub |
| `_uadePaulaLogInterval` | `number \| null` | `null` | Native Engines | Paula register logging interval |
| `_furnaceCmdLogUnsub` | Function \| null | `null` | Native Engines | Furnace command logging unsub |
| `_captureSyncInterval` | `number \| null` | `null` | Native Engines | Capture sync interval handle |
| `_tfmxChannelUnsub` | Function \| null | `null` | Native Engines | TFMX channel data unsub |
| `routedNativeEngines` | `Set<string>` | `new Set()` | Native Engines | Track routed native engines |
| `onRowChange` | Function \| null | `null` | Callbacks | Row change callback |
| `onChannelRowChange` | Function \| null | `null` | Callbacks | Per-channel row change callback |
| `onSongEnd` | Function \| null | `null` | Callbacks | Song end callback |
| `onTickProcess` | Function \| null | `null` | Callbacks | Tick process callback |
| `onScratchEffect` | Function \| undefined | `undefined` | Callbacks | DJ scratch effect callback (optional) |
| `_cachedTransportState` | State obj \| null | `null` | State Cache | Cached transport store state |
| `_muted` | `boolean` | `false` | Mute State | Global mute flag |
| `meterCallbacks` | Function[] \| null | `null` | Metering | VU meter callback array |
| `meterStaging` | `Float64Array` | `new Float64Array(64)` | Metering | VU meter staging buffer |

---

## Key Insights for Refactor

### 1. **Singleton Architecture**
- Single instance per process (plus optional DJ deck replicas)
- Persists across song loads
- State relationships between song/sequencer/effects are tightly coupled
- `_replacedInstruments` deliberately NOT cleared on `play()` — persists across play/stop

### 2. **Hybrid Playback Complexity**
- Three independent playback modes active simultaneously:
  1. **TS Scheduler**: Row/effect processing via `processTick()`
  2. **Native WASM Engines**: libopenmpt, UADE, Hively, SID, JamCracker, etc.
  3. **ToneEngine Synths**: Tone.js-based replicas for "replaced instruments"
- Flag `_suppressNotes` gates TS scheduler when WASM handles playback
- `fireHybridNotesForRow()` driven by WASM position callbacks, not parallel scheduler
- **Muting**: channels with replaced instruments muted in WASM to prevent doubling

### 3. **Per-Format Dispatch**
- `useXMPeriods` / `linearPeriods` / `useWasmSequencer` / `useLibopenmptPlayback` control format-specific paths
- Each format has different effect semantics, period systems, timing models
- Pattern access abstracted via `accessor` (Furnace native, Hively native, or classic)

### 4. **DJ Mode Isolation**
- Separate instances (not singleton) with independent:
  - `tempoMultiplier` / `pitchMultiplier` / `deckDetuneCents`
  - `channelMuteMask` (per-deck muting)
  - `lineLoopStart/End` + `patternLoopStartPos/End` + slip mode
  - All NOT reset on song load (deck state persists)
- `isDJDeck` flag gates global state syncs (e.g., ToneEngine mute, Wxx effect)

### 5. **Ring Buffer for Display State**
- Pre-allocated 256 `DisplayState` objects, circular with head/tail indices
- O(1) enqueue/dequeue, no array shifting
- Audio-synced UI updates without latency

### 6. **Asynchronous Play() with Generation Counter**
- `_playGeneration` incremented at start of `play()` and on `stop()`
- In-flight async continuations check `gen !== this._playGeneration` to abort stale calls
- Prevents orphaned schedulers if user rapidly clicks play/stop
- Currently bypasses `_hasPlayedOnce` warm restart (missing setter, likely TODO)

### 7. **Continuous Timeline (No Reset)**
- `nextScheduleTime` is a continuous accumulator, never resets
- BassoonTracker pattern: prevents cumulative drift across long playback
- Pattern breaks, jumps, row advances: none touch the timeline
- All tick intervals calculated from `nextScheduleTime`

### 8. **Callback Cleanup**
- Multiple unsubscribe callbacks for native engines (`_hvlPositionUnsub`, `_uadePositionUnsub`, etc.)
- Interval handles for logging/sync (`_uadePaulaLogInterval`, `_captureSyncInterval`)
- All cleaned up on `stop()` to prevent memory leaks

### 9. **State Reset Lifecycle**
- **Song Load** (`loadSong()`):
  - Resets: position, BPM, speed, tick, global volume, groove, speed2, all channels, buffers
  - Clears: callbacks, native engines, WASM subscriptions, warnings, replaced instruments
  - **Does NOT reset**: DJ mode state (isolates from global, persists across songs)
  
- **Play Start** (`play()`):
  - Resets: `_suppressNotes`, `_playGeneration`, generation counter
  - **Does NOT reset**: `_replacedInstruments` (persists across play/stop cycles)
  - Sets up: native engines, subscriptions, muting, hybrid playback

- **Stop/Pause**:
  - Sets `playing = false`
  - Clears: scheduler, all subscriptions, intervals
  - **Preserves**: position (unless `stop(true)` called), song data

### 10. **Critical Missing Setter**
- `_hasPlayedOnce` never explicitly set to `true` — warm restart always goes through slow async path
- Should be set after audio infra setup in `play()` completes

---

## Recommendations for Refactor

1. **Split Playback Modes**: Extract WASM sequencer logic, libopenmpt logic, and TS scheduler into separate, composable classes
2. **Isolate DJ Deck State**: Separate instance variables that persist across song loads from core sequencer state
3. **Clarify Lifecycle**: Document which variables are reset on song load, play/stop, and never changed
4. **Fix `_hasPlayedOnce`**: Add setter to enable warm restart optimization
5. **Simplify Hybrid Playback**: Current `_suppressNotes` + `fireHybridNotesForRow()` model is complex; consider callback-driven architecture
6. **Decouple Audio Routing**: Separate master gain/separation logic from playback timing
7. **Per-Format State**: Consider format-specific state objects rather than format flags throughout the class
8. **Ring Buffer**: Keep as-is; very efficient
9. **Native Engine Subscriptions**: Centralize subscription/unsubscription logic (currently scattered in `play()`/`stop()`)
10. **Caching Strategy**: Instrument map and buffers are well-designed; document cache invalidation rules

