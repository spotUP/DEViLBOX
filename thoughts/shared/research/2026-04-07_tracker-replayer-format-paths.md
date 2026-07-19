---
date: 2026-04-07
topic: tracker-replayer-format-paths
tags: [research, openmpt-core-engine, refactor, audit]
status: final
---

# DEViLBOX Format-Specific Integration Map for OpenMPT-as-Core-Engine Refactor

**Research Date:** 2026-04-07
**Analysis Target:** TrackerReplayer.ts (5761 lines)
**Scope:** All WASM engine integration points and format-specific code paths

## Executive Summary

TrackerReplayer acts as a **unified dispatch layer** for 30+ playback engines. The architecture uses:

1. **Native Engine Registry** (NativeEngineRouting.ts): Declarative descriptors for ~30 WASM engines
2. **Hybrid Playback Path**: When an engine suppresses notes, replaced instruments fire via ToneEngine
3. **Three Mutually-Exclusive Playback Modes**:
   - WASM Sequencer (Furnace .fur via FurnaceDispatchEngine)
   - libopenmpt Worklet (MOD, XM, IT, S3M via LibopenmptEngine)
   - TypeScript Scheduler (all other formats + fallback)
4. **Format-Specific Position Tracking**: Each engine has its own position update callback pattern
5. **Automation Capture**: Paula register logging (UADE) and command logging (Furnace)

---

## Part 1: State Variables & Lifecycle

### Core Playback State Variables

```typescript
// Playback modes (mutually exclusive)
private useWasmSequencer = false;           // Furnace WASM sequencer active
private useLibopenmptPlayback = false;      // libopenmpt worklet active
private playing = false;                    // Global playback flag

// Format detection & pattern access
private accessor = new PatternAccessor();   // Switches between classic/furnace/hively patterns
private song: TrackerSong | null = null;   // Current song (holds format-specific data)

// Note suppression (WASM engines suppress TS scheduler notes)
private _suppressNotes = false;                          // True when WASM engine drives playback
private _replacedInstruments = new Set<number>();       // Synth instruments playing via ToneEngine during suppression
private _activeWasmEngine: { setMuteMask(mask: number): void } | null = null;
```

### Format-Specific Engine References

```typescript
// Native engines with position callbacks
private hivelyEngine: HivelyEngine | null = null;
private c64SidEngine: C64SIDEngine | null = null;
private _hvlPositionUnsub: (() => void) | null = null;     // Hively position unsubscriber
private _mlPositionUnsub: (() => void) | null = null;      // MusicLine position unsubscriber
private _uadePositionUnsub: (() => void) | null = null;    // UADE position unsubscriber

// Engine-specific intervals
private _uadePaulaLogInterval: number | null = null;       // Paula register logging (UADE only)
private _furnaceCmdLogUnsub: (() => void) | null = null;   // Command log (Furnace sequencer)
private _tfmxChannelUnsub: (() => void) | null = null;     // TFMX channel data callback

// WASM sequencer (Furnace)
private _seqPositionUnsub: (() => void) | null = null;     // Sequencer position callback
```

### Audio Routing & Muting

```typescript
private masterGain: Tone.Gain;
private separationNode: StereoSeparationNode;
private routedNativeEngines: Set<string> = new Set();      // Tracks which engines are audio-routed
private _muted = false;                                     // DJ mode: audio off, visuals on
private channelMuteMask = 0xFFFF;                          // Per-deck channel mute (DJ mode)
```

---

## Part 2: Format-Specific Integration Patterns

### 1. libopenmpt (MOD, XM, IT, S3M, +80 others)

**Location in TrackerReplayer:**
- Initialization: Lines 2020-2129 (play() method)
- Cleanup: Lines 2189-2202 (stop() method)
- Pause: Lines 2303-2307
- Resume: Lines 2326-2331
- Seek: Lines 5511-5518

**State Variables:**
- `useLibopenmptPlayback` (line 553): Boolean flag when active
- `_activeWasmEngine`: Set to mptEngine for mute mask updates (line 2105)

**Could Move to Coordinator?**
- ✅ Engine startup (ready → loadTune → setSeparation → hooks)
- ✅ Position callback (queueDisplayState + fireHybridNotes)
- ❌ Seek implementation (worklet-specific seekTo)
- ✅ Cleanup (hook removal + stop)

### 2. Furnace WASM Sequencer (.fur with 80+ chip types)

**Location:**
- Initialization: Lines 1854-2016 (play() method)
- Cleanup: Lines 2173-2187 (stop() method)
- Pause: Lines 2295-2300
- Resume: Lines 2317-2322

**Format-Specific Quirks:**
- Chip management: Creates/destroys chips per song (lines 1891-1915)
- Sample pre-upload: Re-uploads module samples (BRR/ADPCM) on every play (lines 1917-1931)
- Audio routing: Connects to synthBus via shared gain node (lines 1933-1947)
- Instrument pre-upload: Uploads INS2 instruments to WASM table before sequencing (lines 1949-1964)
- Position updates: ~60fps from worklet
- Command logging: Captures all dispatch commands for automation (lines 1994-2004)
- No hybrid notes: Furnace sequencer runs standalone; no ToneEngine integration

**Early Return:** If Furnace sequencer loads successfully, play() returns immediately (line 2010), skipping TS scheduler and libopenmpt paths.

### 3. UADE (88 Amiga formats: FC, TFMX, JamCracker, etc.)

**Location:**
- Initialization: Lines 1657-1760 (play() method, via startNativeEngines)
- Paula logging: Lines 1701-1720
- Deferred capture: Lines 1723-1759
- TFMX timing table: Lines 1762-1801
- Cleanup: Lines 2228-2237 (stop() method)

**Format-Specific Quirks:**
- Position source: CIA tick count (not sample-based) — requires `uadeFirstTick` calibration
- Pattern reconstruction: For SKIP_SCAN formats, patterns are deferred from 15-second playback snapshot
- Paula logging: Polls every 100ms; decodes register writes to automation capture
- TFMX special case: Uses timing table (pre-computed jiffies → row) + onChannelData callback

### 4. Hively (HVL, AHX)

**Location:**
- Initialization: Lines 1610-1632 (play() method, via startNativeEngines)
- Cleanup: Lines 2215-2220 (stop() method)

**Format-Specific Quirks:**
- Position update rate: ~15fps from WASM engine
- Stereo mode: Loaded from `song.hivelyMeta?.stereoMode` (0=center, 1-4=increasing separation)
- Stereo separation default: Derived from stereo mode: `(stereoMode * 25) or 50`
- Hybrid notes: Calls `fireHybridNotesForRow()` from position callback
- Pause/Resume Support: `supportsResume=true` in registry

### 5. MusicLine

**Location:**
- Initialization: Lines 1634-1653 (play() method, via startNativeEngines)
- Cleanup: Lines 2222-2226 (stop() method)

**Format-Specific Quirks:**
- Callback name: Uses `onPosition()` not `onPositionUpdate()` (line 1638)
- Per-channel tracking: Update may include `channelRows[]` and `channelPositions[]` for independent sequencing
- Pause/Resume Support: `supportsResume=false`

### 6. C64 SID

**Location:**
- Storage: Lines 565, 590, 1590
- Initialization: NativeEngineRouting lines 690-708
- Cleanup: Line 2212

**Format-Specific Quirks:**
- Instance-based: Creates new C64SIDEngine per song (not singleton)
- Subsong support: Switches via `setSubsong(index)`
- No position callback: Uses silence detection (SilenceDetector) to stop on loop

### 7. Klystrack, JamCracker, Future Composer, PreTracker (and 20+ others via registry)

All follow the same pattern via **NativeEngineRouting.ts** registry:

**Engine Registry Entries:**

| Engine | Key | synthType | suppressNotes | formats | loadMethod | supportsResume | needsDirectRouting |
|--------|-----|-----------|---------------|---------|------------|----------------|--------------------|
| Klystrack | Klystrack | KlysSynth | true | ['KT'] | loadSong | true | false |
| JamCracker | JamCracker | JamCrackerSynth | true | ['JamCracker'] | loadTune | false | false |
| FutureComposer | FuturePlayer | FuturePlayerSynth | true | ['FuturePlayer'] | loadTune | true | false |
| PreTracker | PreTracker | PreTrackerSynth | true | ['PreTracker'] | loadTune | false | true |
| MusicAssembler | MusicAssembler | MusicAssemblerSynth | true | null | loadTune | false | true |
| Hippel | Hippel | HippelSynth | true | ['Hippel'] | loadTune | false | true |
| Sonix | Sonix | SonixSynth | true | ['Sonix'] | loadTune | false | true |
| PxTone | Pxtone | PxtoneSynth | true | ['PxTone'] | loadTune | false | true |
| Organya | Organya | OrganyaSynth | true | ['Organya'] | loadTune | false | true |
| EUP | Eupmini | EupminiSynth | true | ['EUP'] | loadTune | false | true |
| IXS | Ixalance | IxalanceSynth | true | ['IXS'] | loadTune | false | true |
| Psycle | Cpsycle | CpsycleSynth | true | ['Psycle'] | loadTune | false | true |
| SC68 | Sc68 | Sc68Synth | true | null | loadTune | false | true |
| ZXTune | Zxtune | ZxtuneSynth | true | ['ZXTune'] | loadTune | false | true |
| PumaTracker | PumaTracker | PumaTrackerSynth | true | ['PumaTracker'] | loadTune | false | true |
| Art of Noise | ArtOfNoise | ArtOfNoiseSynth | true | ['AON'] | loadTune | false | true |
| TFMX | TFMXModule | TFMXModuleSynth | true | ['TFMX'] | loadTune | false | true |
| MusicLine | MusicLine | MusicLineSynth | true | null | loadSong | false | true |

---

## Part 3: Shared vs Format-Specific Functionality

### SHARED ACROSS ALL FORMATS (Load-Bearing)

1. **Note Suppression & Hybrid Playback** (Lines 523-856, 891-974)
   - `_suppressNotes` flag, `_replacedInstruments` set, `fireHybridNotesForRow()`
   - All WASM engines that suppress notes call `fireHybridNotesForRow()` from position callbacks

2. **Display State Queueing** (Lines 476-481, 2624-2634)
   - 256-entry circular buffer, audio-synced
   - Called from ALL position callbacks

3. **Audio Routing** (Lines 605-623, 642-646)
   - Universal output chain: `masterGain → separationNode → outputTone → speaker`

4. **Mute/Solo/Pan Control** (Lines 636-886)
   - `setMuted()`, `updateWasmMuteMask()`

5. **Pause/Resume** (Lines 2287-2338)
   - Per-engine dispatch based on `useWasmSequencer`, `useLibopenmptPlayback`, `routedNativeEngines`

6. **Automation Capture Sync** (Lines 1824-1834, 2243-2248)
   - 100ms polling interval, generic decode/push to capture store

### FORMAT-SPECIFIC (Load-Bearing per Engine)

**libopenmpt-Specific:**
- Audio routing to separationNode (line 2057)
- Stereo separation application (pt2 vs ModPlug)
- Position callback throttling
- Seek synchronization via `seekTo()` (lines 5511-5518)
- Pause/resume state forwarding

**Furnace WASM Sequencer-Specific:**
- Chip creation/destruction logic
- Module sample upload
- Instrument INS2 pre-upload
- Song serialization & upload
- Command logging for automation

**UADE-Specific:**
- CIA tick-based position computation
- Pattern reconstruction from snapshots
- Paula register polling & decoding
- TFMX timing table + jiffy calculation
- Deferred pattern capture setup

**Hively-Specific:**
- Stereo mode parsing from hivelyMeta
- Position throttling to ~15fps
- Stereo separation defaults

**MusicLine-Specific:**
- Per-channel track table support
- `onPosition` callback (not `onPositionUpdate`)
- `channelRows[]` and `channelPositions[]` tracking

---

## Part 4: Early Return Points (Mutual Exclusion)

```
play() → audioContext ready
       ↓
  startNativeEngines()  (UADE, Hively, MusicLine, all registry engines)
       ↓
  [FURNACE PATH]                [libopenmpt PATH]                [TS SCHEDULER PATH]
  if (furnaceNative)            if (libopenmptFileData)           else
    uploadFurnaceToSequencer()    await LibopenmptEngine.ready()    startScheduler()
    seqPlay()                     mptEngine.loadTune()
    return ✓  ← EXITS            mptEngine.onPosition = ...
               PLAY()             mptEngine.play()
                                  return ✓  ← EXITS PLAY()
                                            (hybrid notes via callback)
                                            (no TS scheduler)
                                                    
                                                    (WASM engines already started)
                                                    (hybrid notes via callbacks)
                                                    (TS scheduler handles rate)
```

**Critical:** Only ONE of these three paths executes per `play()`. If Furnace sequencer loads, TS scheduler never starts (line 2010). If libopenmpt loads, TS scheduler never starts (line 2123).

---

## Part 5: Seek Behavior Across Formats

```typescript
seekTo(songPos, pattPos): void {
  if (!playing) { /* full stop + restart */ }
  
  if (playing) {
    this.songPos = songPos;
    this.pattPos = pattPos;
    this.currentTick = 0;
    
    // libopenmpt: forward to worklet
    if (useLibopenmptPlayback) {
      mptEngine.seekTo(songPos, pattPos);
      return;  ← early exit
    }
    
    // SunVox: must stop (runs independently)
    // TS scheduler: jumpTo next tick
    // Per-channel seek (MusicLine): reset all channel counters
    
    // Per-channel independent sequencing
    if (song.channelTrackTables) {
      for (let ch = 0; ch < channelTickCounters.length; ch++) {
        channelSongPos[ch] = songPos;
        channelPattPos[ch] = pattPos;
        channelTickCounters[ch] = 0;
      }
    }
  }
}
```

**Load-Bearing Detail:** UADE, Hively, MusicLine, WASM sequencer do NOT handle seek. Position sync happens via callbacks only. Seek is a TS scheduler + per-channel operation.

---

## Part 6: Integration Coordination Table

| Engine | Lines | State Vars | Position Callback | Hybrid Notes? | Pause Support | Seek Handling | Audio Routing |
|---|---|---|---|---|---|---|---|
| **libopenmpt** | 2020-2129 | useLibopenmptPlayback, _activeWasmEngine | onPosition callback | ✓ fireHybridNotesForRow | ✓ pause/resume | ✓ seekTo forwarded | Separation node |
| **Furnace Seq** | 1854-2016 | useWasmSequencer, _seqPositionUnsub | onSeqPosition callback | ✗ (standalone) | ✓ seqStop/seqPlay | ✗ (N/A) | Shared gain node |
| **UADE** | 1657-1760 | _uadePositionUnsub, _uadePaulaLogInterval | onPositionUpdate + CIA math | ✓ fireHybridNotesForRow | ✓ pauseNativeEngines | ✗ (via TS scheduler) | Separation node |
| **UADE (TFMX)** | 1762-1801 | _tfmxChannelUnsub | onChannelData + timing table | ✓ via WASM position store | ✗ | ✗ (via TS scheduler) | Separation node |
| **Hively** | 1610-1632 | hivelyEngine, _hvlPositionUnsub | onPositionUpdate (~15fps) | ✓ fireHybridNotesForRow | ✓ pause/resume | ✗ (via TS scheduler) | Separation node |
| **MusicLine** | 1634-1653 | _mlPositionUnsub | onPosition (per-channel) | ✓ fireHybridNotesForRow | ✗ | ✓ via channel track tables | Separation node |
| **C64 SID** | 690-708 | c64SidEngine | ✗ (silence detection) | N/A (standalone) | ✗ | N/A | Synth bus |
| **Registry (25+)** | 86-437 | None (singleton registry) | onPositionUpdate or onPosition | ✓ generic (via WASM position store) | Varies per engine | ✗ (via TS scheduler) | Direct or separation |

---

## Part 7: Refactor Load-Bearing Patterns

### What MUST Stay in TrackerReplayer:

1. **Early Return Logic** (mutually-exclusive paths)
   - Tests whether furnaceNative, libopenmptFileData, or TS scheduler should run
   - Cannot move to coordinator (format-specific)

2. **Hybrid Note System**
   - `_suppressNotes` flag + `_replacedInstruments` set
   - `fireHybridNotesForRow()` from callbacks
   - Cannot move without major refactor (engine-agnostic but deeply coupled)

3. **Display State Queueing** (audio-synced scrolling)
   - Ring buffer + `getStateAtTime()`
   - Cannot move (requires continuous Tone.now() synchronization)

4. **Pause/Resume Dispatch** (engine-agnostic)
   - Checks `useWasmSequencer`, `useLibopenmptPlayback`, `routedNativeEngines`
   - Could move if engines expose uniform pause/resume API

5. **Seek Coordination** (TS scheduler + per-channel state)
   - libopenmpt seeks via `seekTo()`
   - UADE/Hively/MusicLine seek via TS scheduler position reset
   - Cannot move without engine API unification

### What COULD Move to Coordinator:

1. **Engine Startup** (generic path)
   - `await engine.ready() → loadTune/loadSong() → pre-create synth → play()`
   - Could be coordinator's job if it wraps `startNativeEngines()`

2. **Audio Routing** (generic)
   - Connect `instance.output` to separation/master
   - Direct routing logic already in NativeEngineRouting

3. **Position Callback Setup** (generic wrapper)
   - Subscribe to engine callbacks + wire to WASM position store or display state
   - Pattern identical across engines (could template)

4. **Engine Cleanup** (generic)
   - Unsubscribe callbacks, clear state, stop engine
   - Pattern identical (could template)

5. **Automation Capture** (generic sync loop)
   - Poll, decode, push to capture store
   - Engine-specific only in decode function

---

## Part 8: Critical Design Decisions

### 1. Why Three Mutually-Exclusive Paths?

- **WASM Sequencer**: Furnace chipseq lives in AudioWorklet; TS scheduler would race it
- **libopenmpt**: Renders audio internally; TS scheduler would create double notes
- **TS Scheduler**: All other formats + fallback; coordinates position via callbacks

Each path is optimal for its engine: Furnace gets deterministic chip dispatch, libopenmpt gets proper tempo warping, others get replayable position tracking.

### 2. Why Hybrid Playback?

Some instruments are synths (not samples); when an engine suppresses notes, those synths still need to trigger. Solution: Keep `_suppressNotes` + `_replacedInstruments`, fire via ToneEngine from position callbacks.

### 3. Why Per-Engine Position Callbacks?

- libopenmpt: ~344/sec sample-based
- Furnace: ~60fps worklet-based
- UADE: CIA ticks (sample-count independent)
- TFMX: timing table (pre-computed jiffies)
- Hively: ~15fps WASM

Each is optimal for its engine's clock source. Cannot unify without losing sync precision.

### 4. Why NativeEngineRouting Registry?

30+ engines follow identical lifecycle: `ready → loadTune/loadSong → position hooks → play → stop`. Registry avoids 30 if/else blocks in play/stop. Each descriptor is self-documenting (`suppressNotes`, `supportsPause`, etc.).

---

## Part 9: Refactor Recommendations

### Preserve:
- Early return logic (format detection)
- Hybrid playback system (`_suppressNotes`, `fireHybridNotesForRow`)
- Display state queueing (ring buffer)
- Seek dispatch (libopenmpt vs TS scheduler)

### Extract to Coordinator:
- Engine startup wrapper (template over NativeEngineRouting)
- Position callback subscription (generic throttle + queueDisplayState)
- Cleanup unsubscriber (for all callbacks)
- Audio routing coordination (after getLoadArgs)

### Unify at API Level:
- All engines expose uniform pause/resume (or don't claim support in registry)
- All engines' position callbacks use consistent shape `{ row, position, ... }`
- All engines' output is GainNode (already the case)

---

## Summary

**TrackerReplayer is the authoritative dispatcher for all 30+ playback engines.** The three mutually-exclusive paths (WASM sequencer, libopenmpt, TS scheduler) are load-bearing and cannot be simplified without losing format-specific optimizations. Hybrid playback (suppression + replaced instruments) is essential for integrating synth instruments with WASM engines.

The registry in NativeEngineRouting.ts captures the declarative pattern that 25+ engines follow, but the refactor must preserve TrackerReplayer's position callback dispatch, display state queueing, and seek coordination logic.

**Estimated refactoring complexity: Medium-High** — the three paths and position callback system are well-separated, but hybrid playback and seek coordination introduce tight coupling that requires careful API design.
