---
date: 2026-04-07
topic: tracker-replayer-audit
tags: [research, openmpt-core-engine, refactor, audit, synthesis]
status: final
---

# TrackerReplayer Audit & Refactor Plan

**Goal:** Replace DEViLBOX's 5,761-line TrackerReplayer with libopenmpt as the canonical playback engine for MOD/XM/IT/S3M, reducing the TS replayer to a thin coordinator while preserving every feature.

**Source spec:** `docs/superpowers/specs/2026-04-06-openmpt-core-engine-design.md`

**Detailed sub-reports:**
- `2026-04-07_tracker-replayer-state-audit.md` — 86 instance variables in 24 buckets
- `2026-04-07_tracker-replayer-method-catalog.md` — ~120 methods in 13 responsibility buckets
- `2026-04-07_tracker-replayer-callers.md` — 25 calling files, 35+ public API methods
- `2026-04-07_tracker-replayer-format-paths.md` — 30+ engine integration patterns

This document **synthesizes** the four sub-reports into a sized, executable refactor plan.

---

## Executive Summary

### Reality vs Spec

| | Spec optimistic | Reality (audit) |
|---|---|---|
| Current size | "5,700 lines" | **5,761 lines, ~120 methods, 86 state vars** |
| Target coordinator size | "~500 lines" | **~1,000–1,500 lines realistic** (after preserving load-bearing parts) |
| Lines deletable | "~5,200" | **~1,500–2,000 if libopenmpt becomes canonical for MOD/XM/IT/S3M** |
| Engines in scope | "1 (libopenmpt)" | **30+ via NativeEngineRouting registry** |
| Mutually-exclusive playback paths | not mentioned | **3 (WASM sequencer / libopenmpt / TS scheduler)** |
| Subsystems calling TrackerReplayer | not mentioned | **8 subsystems, 25 files, 35+ public methods** |

**Key finding:** The spec underestimates how much of TrackerReplayer is **engine-agnostic infrastructure** (display state ring buffer, hybrid notes, mute mask forwarding, automation capture sync, audio routing, DJ features). These can't be deleted because they serve all 30+ formats, not just libopenmpt.

The realistic deletion target is **the TS effect-processing path** (~1,500–2,000 lines): tick scheduling, period tables, vibrato/portamento/arpeggio handlers, XM envelope interpolation, FT2 quirks. That code only matters when the TS scheduler is the active playback path, which already only happens for non-libopenmpt formats — and many of those formats already use WASM engines with `_suppressNotes` set.

### Recommended approach

**Five sized phases**, each independently shippable, each preserving full feature parity. Estimated 5–8 sessions total.

---

## Architecture (current state)

```
                      ┌─────────────────────────┐
                      │     TrackerReplayer     │
                      │   (5,761 lines)         │
                      └─────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
  ┌────────────┐         ┌────────────┐          ┌────────────┐
  │  WASM seq  │         │ libopenmpt │          │ TS scheduler│
  │  (Furnace) │         │  worklet   │          │  (other)    │
  └────────────┘         └────────────┘          └────────────┘
   - chip dispatch       - native MOD/XM         - tick processing
   - INS2 upload         - effect processing      - effect handlers
   - cmd log             - per-frame audio        - period tables
                                                   - groove templates
                                                   - hybrid notes path

                Each path is MUTUALLY EXCLUSIVE.
                 Selected via early returns in play().

                ┌──────────────────────────────┐
                │ NativeEngineRouting registry │
                │ (~30 WASM engines)           │
                └──────────────────────────────┘
                  Position callbacks → TrackerReplayer
                  fireHybridNotesForRow() per row
                  Mute/solo forwarded to active engine
```

### The three playback paths

1. **WASM Sequencer (Furnace)** — `useWasmSequencer = true`
   - Furnace's chip dispatcher runs in the AudioWorklet
   - TrackerReplayer becomes a position-tracker + UI sync only
   - Owns chip lifecycle (create/destroy/sample upload/INS2 upload)
   - **Cannot be replaced by libopenmpt** — different format domain

2. **libopenmpt** — `useLibopenmptPlayback = true`
   - libopenmpt worklet renders audio for MOD/XM/IT/S3M
   - TrackerReplayer is position-tracker + hybrid note dispatch + mute forwarding
   - Already does 90% of what the spec wants — just needs the surrounding TS effect code deleted
   - **This is the refactor target.**

3. **TS Scheduler** — neither flag set
   - The original BassoonTracker-style scheduler
   - Tick processing, period tables, effect handlers
   - Used as fallback for formats with no WASM engine, AND formats whose WASM engines suppress notes (UADE, Hively, MusicLine, Klystrack, etc. — though for those, `_suppressNotes` blocks note triggers, but the rest of the scheduler still runs for position/groove/automation)
   - **Eligible for deletion** once all formats either route through libopenmpt OR have their own WASM engine with full position callbacks

---

## What's Load-Bearing (must stay)

These serve ALL formats and cannot be removed regardless of which playback path is active:

| Subsystem | LOC est | Why |
|---|---|---|
| **Display state ring buffer** | ~150 | 256-entry circular buffer for audio-synced UI scrolling. Drives the pattern editor's smooth scroll. Used by every format. |
| **Hybrid note system** | ~120 | `_suppressNotes`, `_replacedInstruments`, `fireHybridNotesForRow()`. Lets synth instruments fire via ToneEngine when a WASM engine drives playback. Used by libopenmpt + UADE + Hively + MusicLine. |
| **Mute/solo dispatch** | ~80 | `setChannelMuteMask()`, `updateWasmMuteMask()`. Forwards mute mask to whichever WASM engine is active. Wires to `useMixerStore`. |
| **Audio routing** | ~100 | `masterGain`, `separationNode`, stereo separation modes (pt2 / ModPlug). Universal output chain. |
| **Automation capture sync** | ~50 | Polls Paula register log (UADE) and command log (Furnace) every 100ms, decodes, pushes to capture store. |
| **DJ features** | ~400 | Scratch buffer, slip mode, line loop, pattern loop, channel mute mask, tempo/pitch multipliers, deck detune. Used by DJ deck instances (separate from main replayer). |
| **Lifecycle** | ~150 | Constructor, dispose, loadSong, stop. Singleton + per-deck replicas. |
| **Position tracking** | ~80 | `songPos`, `pattPos`, `currentTick`, query methods (`getCurrentPosition`, `getCurrentRow`, `isPlaying`, `getSong`). External API surface. |
| **Pause/resume dispatch** | ~50 | Engine-agnostic — checks active playback mode, dispatches to right engine. |
| **NativeEngineRouting integration** | ~150 | `startNativeEngines`, `stopNativeEngines`, registry-driven engine lifecycle for 25+ engines. |
| **Format-specific engine integration** | ~600 | libopenmpt setup/cleanup, Furnace sequencer setup/cleanup, UADE Paula log + TFMX timing table + deferred capture, Hively, MusicLine, C64 SID. Each has its own quirks. |

**Subtotal: ~1,930 lines load-bearing.** This is your floor for the coordinator.

---

## What's Eligible for Deletion

| Subsystem | LOC est | Conditions to delete |
|---|---|---|
| **Effect processing** | ~800 | Vibrato, tremolo, portamento, arpeggio, retrigger, volume slides, panning slides, glissando, FT2 quirks. Only used by TS scheduler. **Deletable when no format relies on the TS scheduler for note rendering.** |
| **Period/note conversion** | ~150 | MOD/XM period tables, linear vs Amiga periods, finetune math. Only used by TS scheduler effect handlers. |
| **XM envelope interpolation** | ~100 | Volume + panning envelope interpolation per tick. Only used by TS scheduler. |
| **Sample buffer cache** | ~150 | TS scheduler's sample preload + cache. ToneEngine has its own. Deletable when TS scheduler doesn't render notes. |
| **Instrument map building** | ~80 | TS scheduler's runtime instrument lookup. Replaced by direct ToneEngine lookups. |
| **Groove template handling** | ~100 | Groove ticks/swing offsets applied per row in TS scheduler. **Could be moved to a hook that injects timing into ToneEngine note triggers** (preserves the feature without needing a TS scheduler). |
| **Per-channel independent sequencing** | ~120 | MusicLine-specific multi-tracker layout. Only used in TS scheduler. **Could be moved to MusicLineEngine.** |
| **Pattern break/jump/delay** | ~100 | TS scheduler's MOD effect Bxx/Dxx/EE handling. Only used when TS scheduler is the rendering path. |

**Subtotal: ~1,600 lines eligible for deletion** if/when the TS scheduler can be retired as a note-rendering path.

### Important caveat

The TS scheduler is currently still used by some formats (e.g., legacy MOD playback fallback when libopenmpt fails to load, certain native parsers without WASM engines). Before deleting, we need to confirm:

1. All MOD/XM/IT/S3M files load through libopenmpt successfully (no fallback ever needed)
2. All non-libopenmpt formats have WASM engines that fully drive position via callbacks
3. Groove templates can be applied via ToneEngine note timing injection (not TS scheduler offsets)
4. MusicLine's per-channel independent sequencing can be handled inside MusicLineEngine

**Deletion is gated on items 1-4 being verified.** That's a risk to plan around.

---

## External API Surface (must preserve)

From the callers report — these methods are called from outside the class and form the public contract:

### Critical (high blast radius if removed)
| Method | Callers | Subsystems |
|---|---|---|
| `getTrackerReplayer()` | 23 files | Singleton accessor |
| `play()` | 3+ | transport keyboard cmds, hooks, MCP bridge |
| `stop(preservePosition?)` | 6+ | transport, loadSong path, MCP bridge |
| `isPlaying()` | 8+ | transport store, RAF loops, hooks |
| `loadSong(song, instrumentsMap)` | 3+ | loadSongFile pipeline |
| `getSong()` | 6+ | UADE chip RAM editor, automation capture, instrument lookups |
| `seekTo(songPos, pattPos)` | several | transport, jumpToPattern, position list |
| `pause()` / `resume()` | transport keyboard cmds | |

### Important (medium blast radius)
| Method | Callers | Notes |
|---|---|---|
| `setChannelMuteMask(mask)` | useMixerStore | All format mute/solo |
| `updatePatterns(patterns)` | useTrackerStore | Live pattern editing during playback |
| `updateInstruments(instrumentsMap)` | useInstrumentStore | Live instrument config updates |
| `markInstrumentReplaced(id)` / `unmarkInstrumentReplaced(id)` | useInstrumentStore | Hybrid note routing |
| `restoreReplacedInstruments(ids[])` | dbx loader | |
| `syncCellToWasmSequencer(...)` | useTrackerStore | Furnace WASM live edit |
| `getMasterGain()` / `getSeparationInput()` / `getFullOutput()` | DJ deck routing, ToneEngine wiring | |
| `setBPM(bpm, fromUser?)` | transport store, knob handlers | |
| `setSpeed(speed)` | transport store | |
| `getStateAtTime(time)` | RAF render loop | Audio-synced display state |
| `getCurrentPosition()` / `getCurrentRow()` | UI components | |
| `onRowChange = (fn)` / `onSongEnd = (fn)` | hooks/usePatternPlayback | Event subscription |

### Lower-priority API
| Method | Notes |
|---|---|
| `setTempoMultiplier(m)` / `setPitchMultiplier(m)` / `setDetuneCents(c)` | DJ deck features |
| `setStereoSeparation(percent)` / `setStereoSeparationMode(mode)` | UI knob |
| `setSlipEnabled` / `getSlipState` | DJ slip mode |
| `pauseNativeEnginesForScratch` / `resumeNativeEnginesAfterScratch` | scratch controller |
| `setSuppressNotes(b)` | hybrid playback flag |

### Apparently unused (verified by caller scan)
- `setLineLoop()` / `clearLineLoop()` — 0 callers
- `setPatternLoop()` / `clearPatternLoop()` — 0 callers
- `setBPMDirect()` — 0 callers
- `setNudge(offset, tickCount)` — 0 callers

**These can be removed in Phase 1 with zero risk.**

---

## State Variables (highlight)

The state audit found **86 instance variables across 24 buckets**. The full breakdown is in the state audit report. Key buckets for the refactor decision:

| Bucket | Vars | Status in coordinator |
|---|---|---|
| Song data + accessor | 2 | **Stays** |
| Position tracking (songPos, pattPos, currentTick) | 3 | **Stays** |
| Playback state (playing, generation counters) | 4 | **Stays** |
| Tempo/speed control | 4 | **Stays** (but `currentTick` semantics simplify when TS scheduler is gone) |
| Groove system | 5 | **Stays** if groove can be applied via ToneEngine note injection; otherwise becomes the reason TS scheduler can't fully die |
| Global pitch (DJ deck) | 3 | **Stays** (DJ feature) |
| Pattern break/jump/delay flags | 6 | **Deletable** when TS scheduler is gone |
| Per-channel independent sequencing | 4 | **Moves to MusicLineEngine** |
| Linear vs XM periods | 2 | **Deletable** with effect processing |
| Audio routing | 6 | **Stays** |
| DJ features | 16 | **Stays** (used by deck replicas) |
| Scheduler/timing (look-ahead, scheduleQueue, timer) | 6 | **Deletable** when TS scheduler is gone |
| Display state ring buffer | 5 | **Stays** |
| Sample/instrument caching | 5 | **Deletable** with TS scheduler note rendering (ToneEngine has its own) |
| Hybrid playback | 3 | **Stays** |
| Note suppression (SonicArranger track length, _playGeneration) | 2 | **Stays** |
| WASM sequencer flags | 2 | **Stays** |
| libopenmpt flag | 1 | **Stays** |
| Native engine refs + subscriptions | 10 | **Stays** |
| Callbacks | 5 | **Stays** |
| Cached transport state, muted | 2 | **Stays** |
| Meter callbacks | 2 | **Stays** |

**Estimated state-variable retention: ~60 of 86 (70%) stay in the coordinator.**

---

## Phased Refactor Plan

Each phase is independently shippable, type-checks pass, regression-verified.

### Phase 1: Quick wins + safety net (1 session)

**Goal:** Remove definitively dead code and add a regression test harness before any structural changes.

- [ ] Delete unused public methods: `setLineLoop`, `clearLineLoop`, `setPatternLoop`, `clearPatternLoop`, `setBPMDirect`, `setNudge` — 0 callers, verified
- [ ] Add a script: `tools/playback-smoke-test.ts` that loads each format type via `load_modland`/`load_hvsc`/local files, plays for 3 seconds, captures `getStateAtTime()` output and audio level, asserts non-silent
- [ ] Document the 35-method public API surface in `src/engine/TrackerReplayer.ts` as a JSDoc comment block at the top of the class
- [ ] Add `@deprecated` markers to methods we plan to delete in later phases (Phase 5 won't be a surprise)
- [ ] Type-check passes

**Risk:** Zero.
**LOC change:** −150
**Output:** Smoke test that catches regressions in subsequent phases

### Phase 2: Soundlib as document model (1–2 sessions)

**Goal:** Make `OpenMPTEditBridge` the primary edit path for libopenmpt formats. No file deletion yet.

- [ ] In `useTrackerStore.setCell()` and `setCells()`: when format is MOD/XM/IT/S3M and libopenmpt is loaded, call `OpenMPTEditBridge.setCell()` FIRST, then update store
- [ ] Hot-reload triggers move from "fallback" to "primary": every commit dirty the bridge, every play() drains it
- [ ] `loadSong()` for libopenmpt formats: load into soundlib first, then derive `TrackerSong` from soundlib reads (currently it's the other way around)
- [ ] Keep the current TrackerSong-as-source-of-truth path for non-libopenmpt formats
- [ ] Add `OpenMPTSoundlib.readPatternCell` / `readSample` / `readInstrument` if missing
- [ ] Type-check passes
- [ ] Smoke test passes for MOD/XM/IT/S3M
- [ ] Manual: live-edit a cell during playback → next pattern repeat should reflect the edit

**Risk:** Medium. Only affects libopenmpt formats. Other formats unchanged.
**LOC change:** ~+100 (new sync paths) / −0 (no deletion yet)
**Output:** Soundlib is the canonical model for libopenmpt formats

### Phase 3: Extract Coordinator class (2 sessions)

**Goal:** Pull engine-agnostic infrastructure into a new `PlaybackCoordinator` class. TrackerReplayer becomes a thin wrapper that delegates to it.

Create `src/engine/PlaybackCoordinator.ts` containing:

```typescript
export class PlaybackCoordinator {
  // Position tracking
  songPos = 0
  pattPos = 0
  playing = false
  
  // Active engine (set by TrackerReplayer when starting a format-specific engine)
  activeWasmEngine: WASMEngine | null = null
  
  // Hybrid playback
  suppressNotes = false
  replacedInstruments = new Set<number>()
  
  // Display state ring buffer (the entire 256-entry mechanism + getStateAtTime)
  queueDisplayState(time, row, pat, pos, tick, dur)
  getStateAtTime(time): DisplayState | null
  
  // Hybrid note dispatch
  fireHybridNotesForRow(time): void
  
  // Mute/solo
  setChannelMuteMask(mask): void
  updateWasmMuteMask(): void
  
  // Automation capture sync (the 100ms polling loop)
  startCaptureSync(songId): void
  stopCaptureSync(): void
  
  // Callbacks
  onRowChange: ((row, pattern, position) => void) | null
  onSongEnd: (() => void) | null
}
```

- [ ] TrackerReplayer instantiates a `PlaybackCoordinator` and forwards all the load-bearing methods to it
- [ ] All format-specific code (libopenmpt setup, Furnace setup, UADE setup, etc.) stays in TrackerReplayer for now
- [ ] External API of TrackerReplayer is unchanged (callers don't notice)
- [ ] Type-check passes
- [ ] Smoke test passes for ALL formats
- [ ] Manual: hybrid notes still work, mute/solo still work, scrolling still smooth

**Risk:** Medium. Touches the heart of the playback system but no behavior change — just relocation.
**LOC change:** ~+800 (new file) / −800 (moved out of TrackerReplayer)
**Output:** Engine-agnostic infrastructure in its own class, ready to be the "coordinator" of the spec

### Phase 4: Migrate format-specific code into engine modules (2 sessions)

**Goal:** Move format-specific setup code OUT of TrackerReplayer into the respective engine modules.

For each engine:

- [ ] **libopenmpt**: Move `mptEngine.loadTune` + `setStereoSeparation` + `onPosition` callback wiring into `LibopenmptEngine.startWithCoordinator(coordinator, song)`. TrackerReplayer just calls that.
- [ ] **Furnace WASM Seq**: Move chip lifecycle + sample upload + INS2 upload + serialization + onSeqPosition wiring into `FurnaceDispatchEngine.startWithCoordinator(coordinator, song)`. TrackerReplayer just calls that.
- [ ] **UADE**: Move CIA tick math + Paula log polling + deferred pattern reconstruction + TFMX timing table into `UADEEngine.startWithCoordinator(coordinator, song)`.
- [ ] **Hively**: Move into `HivelyEngine.startWithCoordinator(...)`.
- [ ] **MusicLine**: Move into `MusicLineEngine.startWithCoordinator(...)` — including per-channel independent sequencing if possible.
- [ ] **NativeEngineRouting registry engines**: Already centralized in `startNativeEngines` — minimal change.

After this phase, `TrackerReplayer.play()` becomes:
```typescript
play() {
  if (this.song.furnaceNative) return FurnaceDispatchEngine.startWithCoordinator(this.coordinator, this.song)
  if (this.song.libopenmptFileData) return LibopenmptEngine.startWithCoordinator(this.coordinator, this.song)
  // ... etc
  return this.coordinator.startTSScheduler(this.song)  // fallback, will be deleted in Phase 5
}
```

- [ ] Type-check passes
- [ ] Smoke test passes for ALL formats
- [ ] Manual: every format still plays correctly

**Risk:** Medium-High. Lots of moving pieces. Test each engine's path individually.
**LOC change:** TrackerReplayer drops by ~1,500 lines; engine files grow correspondingly. **Net change: 0** but TrackerReplayer is now ~3,500 lines.
**Output:** TrackerReplayer is now a thin dispatcher

### Phase 5: Delete TS scheduler (1–2 sessions)

**Goal:** Now that no format relies on TS scheduler for note rendering, delete it.

Pre-conditions to verify:
- [ ] All MOD/XM/IT/S3M formats route through libopenmpt successfully
- [ ] No format relies on TS scheduler for note triggering (verify with smoke test by setting `_suppressNotes` for ALL formats and confirming playback)
- [ ] Groove templates work via ToneEngine note timing injection (or moved to a coordinator method)
- [ ] MusicLine's per-channel sequencing is handled inside MusicLineEngine

Then delete:
- [ ] All effect processing methods (~22 methods, ~800 lines)
- [ ] Period/note conversion tables (~150 lines)
- [ ] XM envelope interpolation (~100 lines)
- [ ] Sample buffer cache (~150 lines)
- [ ] Pattern break/jump/delay flags + handlers (~100 lines)
- [ ] Per-channel independent sequencing state + methods (~120 lines)
- [ ] `startScheduler` / `tick` / look-ahead state (~200 lines)
- [ ] Sample/instrument cache state (~50 lines)
- [ ] All the related state variables identified in Phase 3

- [ ] Type-check passes
- [ ] Smoke test passes for ALL formats
- [ ] Manual: full feature regression test (instrument replacement, mute/solo, DJ scratch, save/load .dbx, export, etc.)

**Risk:** High. This is the actual breaking change. Roll back instantly if anything fails.
**LOC change:** −1,500 to −2,000
**Output:** TrackerReplayer is now ~1,500–2,000 lines, matching the spec's intent

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Format playback breaks during Phase 3 (extraction) | Medium | Smoke test from Phase 1; per-format manual checks |
| libopenmpt fallback path needed for some MOD/XM file | Medium | Phase 5 only proceeds after verifying ALL test files load |
| Groove templates can't apply without TS scheduler | Medium | Move to ToneEngine note injection in Phase 4; verify before Phase 5 |
| MusicLine's per-channel sequencing too tangled to extract | Low-Medium | Audit MusicLineEngine in Phase 4 first; decide if it's feasible |
| External callers of soon-to-be-deleted methods | Low | Caller report identifies them all; mark `@deprecated` in Phase 1 |
| DJ deck replicas break (separate state) | Low | DJ deck tests in smoke suite |
| WASM rebuild blocked Phase 1 of original spec | N/A | This plan does NOT require channel state API. Hybrid notes work via pattern data lookup (current path) |

---

## What this plan does NOT do

**Out of scope intentionally:**
- The original Phase 1 (libopenmpt channel state C API) is NOT in this plan. It's an optional improvement, not a precondition. Hybrid notes work fine via the existing pattern-data lookup approach. We can come back to it later if we want processed pitch/volume in hybrid notes.
- Format consolidation (move OKT/MED/DIGI from UADE to libopenmpt) is also NOT in this plan. That's its own audit and per-format risk assessment. Save for after the core refactor lands.
- Furnace stays on its own dispatcher. The spec is correct about that.

---

## Sized estimate

| Phase | Sessions | Risk | LOC change | Net TR size |
|---|---|---|---|---|
| 1. Quick wins + smoke test | 1 | Zero | −150 | 5,611 |
| 2. Soundlib as document model | 1–2 | Medium | +100 | 5,711 |
| 3. Extract Coordinator | 2 | Medium | 0 (relocate) | 4,900 |
| 4. Format code → engine modules | 2 | Med-High | 0 (relocate) | 3,400 |
| 5. Delete TS scheduler | 1–2 | High | −1,800 | 1,600 |
| **Total** | **7–9 sessions** | | **−1,850** | **1,600** (vs current 5,761) |

**Endstate:** TrackerReplayer is ~1,600 lines — a thin format-dispatching wrapper around `PlaybackCoordinator`. The original spec's "~500 lines" target is unrealistic but the spirit is preserved: no more sequencing, no more effect processing, just dispatch + lifecycle.

---

## Recommendations

1. **Start with Phase 1 next session.** Quick wins, no risk, sets up the smoke test that protects all subsequent phases.
2. **Phase 2 is independently valuable** even if we never do 3-5. Soundlib-as-document fixes the "two sources of truth" confusion that already exists.
3. **Phase 3 is the inflection point.** Once the Coordinator class exists, the rest is mechanical relocation.
4. **Phase 5 can be deferred indefinitely.** The TS scheduler isn't actively hurting anything — it just bloats the file. Don't delete it until you have a strong reason and a passing smoke test.
5. **Don't merge phases.** Each phase should be a clean commit (or short series). Easy rollback if something goes sideways.

---

## Open questions for the user

Before starting Phase 1, please confirm or decide:

1. **Are you OK with the realistic sizing (~1,600 lines target) vs the spec's optimistic ~500?**
2. **Do you want to keep the DJ features in the same class, or extract them to a `DJDeckController`?** They're ~400 lines and currently coupled to the replayer for tempo/pitch math.
3. **Is groove template behavior critical enough to block Phase 5 if it doesn't translate cleanly to ToneEngine note injection?**
4. **Smoke test scope:** which formats absolutely must keep working? (MOD/XM/IT/S3M obviously; also Furnace, UADE FC, Hively, MusicLine?)
5. **Phase ordering:** start with Phase 1 next session, or do you want to push back on any of the assumptions first?

---

**Status:** Audit complete. Ready to execute Phase 1 on user confirmation.
