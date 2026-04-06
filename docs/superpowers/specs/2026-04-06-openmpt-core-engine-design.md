# OpenMPT as Core Engine — Design Spec

## Summary

Replace DEViLBOX's 5,700-line TypeScript replayer with libopenmpt as the core playback engine for all PC tracker formats. The TS replayer becomes a thin coordinator (~500 lines) that receives position + channel state from WASM engines and manages UI, synth hybrid notes, mute/solo, DJ features, and automation.

Zero feature loss. Gains: NNA, sustain loops, 20+ additional formats, reference-quality effect processing.

## Goals

1. **Accuracy**: libopenmpt is the reference implementation for MOD/XM/IT/S3M. Effect processing, Amiga quirks, period tables — all handled by the C++ engine maintained by 100+ contributors.
2. **Format support**: libopenmpt handles 56+ formats natively. Consolidate UADE formats where libopenmpt covers them (OKT, MED, DIGI, etc.).
3. **Simplicity**: One sequencer per format (the WASM engine), one coordinator for all formats. No dual-scheduler, no hybrid tick processing, no timing sync issues.
4. **Zero regression**: Every feature from the current TS replayer (TB-303, groove, DJ scratch, automation, hybrid synth notes) is preserved or improved.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  OpenMPT Soundlib (CSoundFile WASM)                 │
│  THE DOCUMENT — single source of truth              │
│  Pattern data, samples, instruments, order list     │
│  All edits go here: setPatternCell, setSampleData   │
└─────────────┬───────────────────────────────────────┘
              │ serialize()
              ▼
┌─────────────────────────────────────────────────────┐
│  libopenmpt AudioWorklet (chiptune3.worklet.js)     │
│  PLAYBACK — renders audio, processes effects        │
│  Exposes: position, channel state (note, volume,    │
│  period, panning, instrument) per render frame      │
└─────────────┬───────────────────────────────────────┘
              │ onPosition + channelState callbacks
              ▼
┌─────────────────────────────────────────────────────┐
│  Coordinator (replaces TrackerReplayer)              │
│  ~500 lines — NO sequencing, NO effect processing   │
│  - fireHybridNotesForRow() for replaced instruments │
│  - Applies PROCESSED pitch/volume from channel state│
│  - Mute/solo forwarding to active WASM engine       │
│  - VU meter dispatch                                │
│  - Pattern editor cursor sync                       │
│  - DJ scratch buffer, crossfade, beat sync          │
│  - Automation capture                               │
│  - Groove template application (ToneEngine notes)   │
└─────────────────────────────────────────────────────┘
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
  ToneEngine  UI     Stores
  (synths)  (editor) (transport, mixer)
```

### Other WASM engines (unchanged)

| Engine | Formats | Change |
|--------|---------|--------|
| Furnace WASM | 80+ chip types (.fur) | None — keeps its own dispatcher |
| UADE | ~68 Amiga formats (formats libopenmpt can't handle) | Reduced from ~88 — ~20 formats move to libopenmpt |
| Hively | .hvl, .ahx | None — keeps WASM engine |
| Klystrack | .kt | None — keeps WASM engine |
| C64 SID | .sid | None — keeps DeepSID engines |
| MusicLine | .ml | None — keeps WASM engine |
| 20+ other WASM engines | Various exotic formats | None — all feed the coordinator via position callbacks |

All engines feed the same coordinator interface. The coordinator doesn't care which engine is active — it just reacts to position updates and channel state.

## Component 1: Modified libopenmpt WASM — Channel State Export

### What to expose

The libopenmpt C API already has internal per-channel state in `CSoundFile::m_PlayState.Chn[]`. We need to expose these via new C API functions added to a thin wrapper:

```c
// New exports added to the libopenmpt WASM build
EMSCRIPTEN_KEEPALIVE int openmpt_channel_get_note(openmpt_module* mod, int ch);
EMSCRIPTEN_KEEPALIVE int openmpt_channel_get_instrument(openmpt_module* mod, int ch);
EMSCRIPTEN_KEEPALIVE int openmpt_channel_get_volume(openmpt_module* mod, int ch);
EMSCRIPTEN_KEEPALIVE double openmpt_channel_get_frequency(openmpt_module* mod, int ch);
EMSCRIPTEN_KEEPALIVE int openmpt_channel_get_panning(openmpt_module* mod, int ch);
EMSCRIPTEN_KEEPALIVE int openmpt_channel_get_active(openmpt_module* mod, int ch);
```

These read from the internal `ModChannel` struct after effect processing, so they reflect the ACTUAL playing state — not the raw pattern data.

### Worklet integration

The chiptune3 worklet already extracts per-channel VU levels per frame. Extend it to also extract channel state on each new row:

```javascript
// In process(), after detecting row change:
if (currentRow !== lastRow) {
  const channelState = [];
  for (let ch = 0; ch < this.channels; ch++) {
    channelState.push({
      note: libopenmpt._openmpt_channel_get_note(this.modulePtr, ch),
      instrument: libopenmpt._openmpt_channel_get_instrument(this.modulePtr, ch),
      volume: libopenmpt._openmpt_channel_get_volume(this.modulePtr, ch),
      frequency: libopenmpt._openmpt_channel_get_frequency(this.modulePtr, ch),
      panning: libopenmpt._openmpt_channel_get_panning(this.modulePtr, ch),
      active: libopenmpt._openmpt_channel_get_active(this.modulePtr, ch),
    });
  }
  this.port.postMessage({ type: 'channelState', channelState, row: currentRow, order: currentOrder });
}
```

### Fallback

If the libopenmpt WASM modification proves harder than expected (internal struct access, ABI stability), fall back to the pattern-data approach we already have. Channel state is an upgrade, not a requirement. The coordinator works either way.

## Component 2: Soundlib as Document Model

### Current state

The OpenMPTEditBridge already syncs edits from the tracker store to the soundlib. But it's treated as a side channel — a hack for hot-reload during libopenmpt playback.

### New role

The soundlib becomes THE authoritative data store:

1. **Import**: `loadModule(buffer)` loads the raw module into CSoundFile
2. **Read**: Pattern data, samples, instruments read via soundlib API → populate TrackerSong (view model)
3. **Edit**: All mutations go through soundlib API (`setPatternCell`, `setSampleData`, etc.)
4. **View sync**: After each edit, update the affected TrackerSong fields (debounced for bulk operations)
5. **Playback**: `serialize()` → load binary into libopenmpt worklet
6. **Export**: `saveModule(format)` → MOD/XM/IT/S3M binary

### TrackerSong becomes a view model

TrackerSong is no longer the source of truth. It's a cached read-only snapshot of the soundlib state, used by:
- Pattern editor (reads cells for display)
- Instrument list (reads names, types)
- Song info panel (reads metadata)
- Export dialogs (reads format info)

When the user edits a cell:
```
User clicks cell → setCell() →
  1. soundlib.setPatternCell(pattern, row, channel, cell)  // source of truth
  2. trackerStore.updateCell(pattern, row, channel, cell)   // view model cache
  3. editBridge.markDirty()                                  // flag for hot-reload
```

### Hot-reload on play

When play is pressed and the bridge is dirty:
```
1. soundlib.saveModule(format) → serialized binary
2. libopenmptEngine.hotReload(binary) → worklet loads new module
3. editBridge.clearDirty()
```

This already exists. We just make it the official path instead of a fallback.

## Component 3: Coordinator (Slim TrackerReplayer)

### What it does

- Receives `onPosition` + `onChannelState` callbacks from the active WASM engine
- Fires ToneEngine notes for replaced instruments using processed channel state
- Manages mute/solo (forwards `setMuteMask` to active engine)
- Drives pattern editor cursor (`queueDisplayState`)
- Dispatches VU meter data
- Handles DJ features (scratch buffer, crossfade, beat matching)
- Captures automation data (Paula log for UADE, channel state for libopenmpt)
- Applies groove templates to ToneEngine note timing

### What it does NOT do

- Sequence ticks (WASM engine does this)
- Process effects (WASM engine does this)
- Manage sample playback (libopenmpt/ToneEngine does this)
- Track pattern position (WASM engine reports this)

### Interface

```typescript
class PlaybackCoordinator {
  // Position tracking
  private songPos = 0;
  private pattPos = 0;
  private playing = false;
  
  // Active engine
  private activeEngine: WASMPlaybackEngine | null = null;
  
  // Replaced instruments
  private replacedInstruments = new Set<number>();
  
  // Called by WASM engine position callbacks
  onRowChange(order: number, row: number, time: number): void;
  onChannelState(state: ChannelState[], time: number): void;
  
  // Hybrid synth note firing
  private fireHybridNotes(channelState: ChannelState[], time: number): void;
  
  // Mute/solo
  setChannelMuteMask(mask: number): void;
  
  // DJ features
  initScratchBuffer(): void;
  
  // Automation
  captureAutomation(channelState: ChannelState[]): void;
}
```

### Hybrid note firing with channel state

When the coordinator receives channel state from libopenmpt:

```typescript
fireHybridNotes(channelState: ChannelState[], time: number): void {
  for (let ch = 0; ch < channelState.length; ch++) {
    const cs = channelState[ch];
    if (!this.replacedInstruments.has(cs.instrument)) continue;
    
    // Use PROCESSED frequency from libopenmpt (includes portamento, vibrato, arpeggio)
    const noteName = frequencyToNoteName(cs.frequency);
    const velocity = cs.volume / 64;
    
    const engine = getToneEngine();
    const config = this.instrumentMap.get(cs.instrument);
    if (!config) continue;
    
    engine.triggerNote(
      cs.instrument,
      noteName,        // processed pitch (not raw pattern note)
      rowDuration,
      time,
      velocity,        // processed volume
      config,
      false,           // accent
      false,           // slide
      ch,              // channel
    );
  }
  
  this.updateWasmMuteMask();
}
```

This is significantly cleaner than the current approach because:
- Pitch includes portamento/vibrato/arpeggio effects (processed by libopenmpt)
- Volume includes volume slides/tremolo (processed by libopenmpt)
- No pattern data lookup needed — channel state comes from the engine
- No parallel scheduler — timing comes from the engine's position callback

## Component 4: Format Consolidation

### Formats moving from UADE to libopenmpt

Audit needed per-format, but candidates include:
- OKT (Oktalyzer) — libopenmpt has native loader
- MED/OctaMED — libopenmpt has native loader
- DIGI (DigiBooster) — libopenmpt has native loader
- DBM (DigiBooster Pro) — libopenmpt has native loader
- SFX (SoundFX) — libopenmpt has native loader
- STK (SoundTracker) — libopenmpt has native loader
- ICE — libopenmpt has native loader
- PT36 — libopenmpt has native loader
- Several others in libopenmpt's format list

### Formats staying on UADE

Anything libopenmpt can't handle — compiled 68k replayers, FC, TFMX, JamCracker, custom Amiga formats. These stay on UADE with their own position callbacks feeding the coordinator.

### Import pipeline changes

Current:
```
File → native parser → TrackerSong → TrackerReplayer (sequencing)
                      ↘ libopenmptFileData → LibopenmptEngine (audio)
```

After:
```
File → soundlib.loadModule() → THE DOCUMENT
                              ↘ derive TrackerSong (view)
                              ↘ serialize → libopenmpt worklet (playback)
```

For non-libopenmpt formats (UADE, Furnace, Hively, etc.):
```
File → native parser → TrackerSong (view) + nativeFileData
                      ↘ WASM engine (playback)
                      ↘ position callbacks → coordinator
```

The coordinator doesn't care which path — it just receives position + optional channel state.

## Migration Strategy

### Phase 1: Channel State Export (WASM modification)
- Add channel state C API functions to libopenmpt wrapper
- Extend chiptune3 worklet to send channelState messages
- Extend LibopenmptEngine to receive and forward channelState
- Test: verify per-channel pitch/volume/instrument data is accurate

### Phase 2: Coordinator
- Extract coordinator logic from TrackerReplayer into new class
- Move: position tracking, VU dispatch, mute/solo, DJ features, automation
- Rewrite fireHybridNotesForRow to use channel state instead of pattern lookup
- Delete: tick processing, effect handlers, sample pool management (~4,000 lines)
- Test: hybrid playback works with processed pitch/volume

### Phase 3: Soundlib as Document
- Make OpenMPTEditBridge the primary edit path (not a side channel)
- TrackerStore mutations go through soundlib first, then update view
- Hot-reload on play uses serialized soundlib data
- Test: pattern editing during playback works reliably

### Phase 4: Format Consolidation
- Audit UADE vs libopenmpt format-by-format
- Move qualifying formats to libopenmpt import path
- Update routing in AmigaFormatParsers.ts
- Test: each migrated format plays correctly with all effects

### Phase 5: Cleanup
- Remove dead TS replayer code (effect handlers, tick processing)
- Remove stale hybrid block code
- Update documentation
- Performance audit (coordinator should be lighter than current replayer)

## Feature Preservation Matrix

| Feature | Current Implementation | After Migration | Notes |
|---------|----------------------|-----------------|-------|
| MOD/XM/IT/S3M playback | TS replayer + libopenmpt | libopenmpt only | More accurate |
| Pattern editing | TrackerStore → EditBridge → hot-reload | Soundlib → TrackerStore (view) → hot-reload | Cleaner |
| Instrument replacement | fireHybridNotesForRow + position callbacks | Coordinator + channel state | Pitch/volume now processed |
| TB-303 patterns | TS replayer processRow | ToneEngine via coordinator | Gate timing preserved |
| Groove templates | TS replayer calculateGrooveOffset | Coordinator applies to ToneEngine notes | Preserved |
| DJ scratch | TrackerReplayer scratch buffer | Coordinator scratch buffer | Moved, not changed |
| Mute/solo 34 engines | forwardReplayerMuteMask | Coordinator forwards to active engine | Preserved |
| VU meters | Engine callbacks → ToneEngine | Engine callbacks → coordinator | Same path |
| Automation capture | Paula log / channel state | Coordinator captures from engine | Improved |
| UADE chip RAM patching | UADEChipEditor | Preserved — UADE formats stay on UADE | No change |
| Furnace macros | FurnaceDispatchEngine | Preserved — Furnace stays separate | No change |
| DBX save/load | useProjectPersistence | Preserved — soundlib serializes all formats | No change |
| HVSC/Modland | search + load + play | Preserved | No change |
| 188+ format import | Native parsers + converters | Preserved — no parser removed | Gain ~20 formats |
| Envelope processing | TS replayer (approximate) | libopenmpt (reference-quality) | Improved |
| NNA (IT) | Not implemented | Gained via libopenmpt | New feature |
| Sustain loops (IT) | Not implemented | Gained via libopenmpt | New feature |

## Success Criteria

### Automated
- `npm run type-check` passes
- All 188+ format imports still work (load → play → no crashes)
- Pattern editing during libopenmpt playback: edit cell → hear change on next pattern repeat

### Manual
- Load MOD, replace instrument with synth, add notes → synth plays with correct pitch (portamento works)
- Load XM with volume envelopes → envelopes play correctly
- Load IT with NNA → note actions work (new feature)
- DJ scratch on a MOD → scratch buffer works
- Mute/solo on any format → correct channels muted
- Save as .dbx → reload → all state preserved including replaced instruments
- Export as MOD/XM → valid file plays in OpenMPT

## Files Affected

| File | Change |
|------|--------|
| `third-party/libopenmpt/` | Add channel state API wrapper |
| `public/chiptune3/chiptune3.worklet.js` | Send channelState messages |
| `src/engine/libopenmpt/LibopenmptEngine.ts` | Receive channelState, expose callback |
| `src/engine/TrackerReplayer.ts` | Strip to ~500-line coordinator |
| `src/engine/libopenmpt/OpenMPTEditBridge.ts` | Upgrade to primary edit path |
| `src/lib/import/wasm/OpenMPTSoundlib.ts` | May need additional APIs |
| `src/stores/useTrackerStore.ts` | Edits go through soundlib first |
| `src/stores/useMixerStore.ts` | Coordinator handles mute/solo |
| `src/lib/import/parsers/AmigaFormatParsers.ts` | Route formats to libopenmpt where possible |
| Various native parsers | May be simplified or removed for consolidated formats |
