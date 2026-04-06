# OpenMPT Core Engine — Phase 1: Channel State Export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose per-channel playback state (note, instrument, volume, frequency, panning) from libopenmpt's internal ModChannel struct through the WASM build, worklet, and TS engine — enabling the coordinator to fire ToneEngine synth notes with processed pitch/volume.

**Architecture:** Add C wrapper functions that read ModChannel fields → export via Emscripten → worklet sends channelState per row → LibopenmptEngine receives and exposes via callback → coordinator (fireHybridNotesForRow) uses processed state instead of raw pattern data.

**Tech Stack:** C++ (libopenmpt internals), Emscripten WASM, AudioWorklet JS, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-06-openmpt-core-engine-design.md`

---

## File Map

| File | Status | Purpose |
|------|--------|---------|
| `third-party/openmpt-master/libopenmpt/libopenmpt_impl.cpp` | MODIFY | Add per-channel state getter implementations |
| `third-party/openmpt-master/libopenmpt/libopenmpt.h` | MODIFY | Add C API function declarations |
| `third-party/openmpt-master/libopenmpt/libopenmpt_c.cpp` | MODIFY | Add C API wrapper functions |
| `public/chiptune3/chiptune3.worklet.js` | MODIFY | Extract and send channelState per row |
| `src/engine/libopenmpt/LibopenmptEngine.ts` | MODIFY | Receive channelState, expose onChannelState callback |
| `src/engine/TrackerReplayer.ts` | MODIFY | Upgrade fireHybridNotesForRow to use channel state |

---

## Task 1: Add Channel State C API to libopenmpt

**Files:**
- Modify: `third-party/openmpt-master/libopenmpt/libopenmpt.h`
- Modify: `third-party/openmpt-master/libopenmpt/libopenmpt_c.cpp`
- Modify: `third-party/openmpt-master/libopenmpt/libopenmpt_impl.cpp`

The existing VU meter functions read from `m_sndFile->m_PlayState.Chn[channel]`. We follow the exact same pattern for note/volume/frequency/panning/instrument.

- [ ] **Step 1: Add C++ implementation methods to openmpt_module_impl**

In `third-party/openmpt-master/libopenmpt/libopenmpt_impl.cpp`, find the `get_current_channel_vu_mono` implementation (~line 1386). After the VU methods, add:

```cpp
std::int32_t module_impl::get_current_channel_note(std::int32_t channel) const {
    if (channel < 0 || channel >= m_sndFile->GetNumChannels()) return 0;
    const auto &chn = m_sndFile->m_PlayState.Chn[channel];
    return static_cast<std::int32_t>(chn.nNote);
}

std::int32_t module_impl::get_current_channel_instrument(std::int32_t channel) const {
    if (channel < 0 || channel >= m_sndFile->GetNumChannels()) return 0;
    const auto &chn = m_sndFile->m_PlayState.Chn[channel];
    // nNewIns is the instrument triggered on this row; nOldIns is the last triggered
    return static_cast<std::int32_t>(chn.nNewIns ? chn.nNewIns : chn.nOldIns);
}

std::int32_t module_impl::get_current_channel_volume(std::int32_t channel) const {
    if (channel < 0 || channel >= m_sndFile->GetNumChannels()) return 0;
    const auto &chn = m_sndFile->m_PlayState.Chn[channel];
    // nRealVolume is the final computed volume after all processing (0-16384 range)
    return static_cast<std::int32_t>(chn.nRealVolume);
}

double module_impl::get_current_channel_frequency(std::int32_t channel) const {
    if (channel < 0 || channel >= m_sndFile->GetNumChannels()) return 0.0;
    const auto &chn = m_sndFile->m_PlayState.Chn[channel];
    // nPeriod is the current period after portamento/vibrato/arpeggio processing
    if (chn.nPeriod == 0) return 0.0;
    // Convert period to frequency using the module's frequency calculation
    return m_sndFile->GetFreqFromPeriod(chn.nPeriod, chn.nC5Speed, 0);
}

std::int32_t module_impl::get_current_channel_panning(std::int32_t channel) const {
    if (channel < 0 || channel >= m_sndFile->GetNumChannels()) return 128;
    const auto &chn = m_sndFile->m_PlayState.Chn[channel];
    return static_cast<std::int32_t>(chn.nRealPan);
}

bool module_impl::get_current_channel_active(std::int32_t channel) const {
    if (channel < 0 || channel >= m_sndFile->GetNumChannels()) return false;
    const auto &chn = m_sndFile->m_PlayState.Chn[channel];
    return chn.nLength > 0; // channel is active if it has sample data playing
}
```

Also add the declarations to `libopenmpt_impl.hpp` (the internal header), near the existing `get_current_channel_vu_mono`:

```cpp
std::int32_t get_current_channel_note(std::int32_t channel) const;
std::int32_t get_current_channel_instrument(std::int32_t channel) const;
std::int32_t get_current_channel_volume(std::int32_t channel) const;
double get_current_channel_frequency(std::int32_t channel) const;
std::int32_t get_current_channel_panning(std::int32_t channel) const;
bool get_current_channel_active(std::int32_t channel) const;
```

- [ ] **Step 2: Add C API wrapper functions**

In `third-party/openmpt-master/libopenmpt/libopenmpt_c.cpp`, find the `openmpt_module_get_current_channel_vu_mono` function. After it, add:

```c
LIBOPENMPT_API int32_t openmpt_module_get_current_channel_note(openmpt_module *mod, int32_t channel) {
    try {
        openmpt::interface::check_soundfile(mod);
        return mod->impl->get_current_channel_note(channel);
    } catch (...) {
        openmpt::interface::catch_all_exceptions();
    }
    return 0;
}

LIBOPENMPT_API int32_t openmpt_module_get_current_channel_instrument(openmpt_module *mod, int32_t channel) {
    try {
        openmpt::interface::check_soundfile(mod);
        return mod->impl->get_current_channel_instrument(channel);
    } catch (...) {
        openmpt::interface::catch_all_exceptions();
    }
    return 0;
}

LIBOPENMPT_API int32_t openmpt_module_get_current_channel_volume(openmpt_module *mod, int32_t channel) {
    try {
        openmpt::interface::check_soundfile(mod);
        return mod->impl->get_current_channel_volume(channel);
    } catch (...) {
        openmpt::interface::catch_all_exceptions();
    }
    return 0;
}

LIBOPENMPT_API double openmpt_module_get_current_channel_frequency(openmpt_module *mod, int32_t channel) {
    try {
        openmpt::interface::check_soundfile(mod);
        return mod->impl->get_current_channel_frequency(channel);
    } catch (...) {
        openmpt::interface::catch_all_exceptions();
    }
    return 0.0;
}

LIBOPENMPT_API int32_t openmpt_module_get_current_channel_panning(openmpt_module *mod, int32_t channel) {
    try {
        openmpt::interface::check_soundfile(mod);
        return mod->impl->get_current_channel_panning(channel);
    } catch (...) {
        openmpt::interface::catch_all_exceptions();
    }
    return 128;
}

LIBOPENMPT_API int openmpt_module_get_current_channel_active(openmpt_module *mod, int32_t channel) {
    try {
        openmpt::interface::check_soundfile(mod);
        return mod->impl->get_current_channel_active(channel) ? 1 : 0;
    } catch (...) {
        openmpt::interface::catch_all_exceptions();
    }
    return 0;
}
```

- [ ] **Step 3: Add declarations to the C header**

In `third-party/openmpt-master/libopenmpt/libopenmpt.h`, after the VU meter declarations (~line 1276), add:

```c
/*! \brief Get the current note for a channel after effect processing
 * \param mod The module handle
 * \param channel The channel number (0-based)
 * \return The current note value (0 = no note, 1-120 = note)
 */
LIBOPENMPT_API int32_t openmpt_module_get_current_channel_note(openmpt_module *mod, int32_t channel);

LIBOPENMPT_API int32_t openmpt_module_get_current_channel_instrument(openmpt_module *mod, int32_t channel);

LIBOPENMPT_API int32_t openmpt_module_get_current_channel_volume(openmpt_module *mod, int32_t channel);

LIBOPENMPT_API double openmpt_module_get_current_channel_frequency(openmpt_module *mod, int32_t channel);

LIBOPENMPT_API int32_t openmpt_module_get_current_channel_panning(openmpt_module *mod, int32_t channel);

LIBOPENMPT_API int openmpt_module_get_current_channel_active(openmpt_module *mod, int32_t channel);
```

- [ ] **Step 4: Rebuild the libopenmpt WASM**

The upstream Makefile builds libopenmpt as WASM:

```bash
cd third-party/openmpt-master
# Clean previous build
make CONFIG=emscripten clean
# Build with Emscripten
make CONFIG=emscripten VERBOSE=1
# Output: bin/stage/all/libopenmpt.wasm + libopenmpt.wasm.js
```

If the upstream Makefile doesn't export the new functions, they should be automatically exported since they use `LIBOPENMPT_API`. If not, check the Emscripten linker flags and add `-s EXPORTED_FUNCTIONS` entries.

Copy the built output:
```bash
cp bin/stage/all/libopenmpt.wasm.js public/chiptune3/libopenmpt.worklet.js
```

**Note:** The exact build command may need adjustment. Read the Makefile's `CONFIG=emscripten` section to find the right target. The key is that the new C API functions get exported in the WASM binary.

- [ ] **Step 5: Verify the build**

Load a MOD file in DEViLBOX and verify it still plays. The new functions are additive — existing behavior should be unchanged.

- [ ] **Step 6: Commit**

```bash
git add third-party/openmpt-master/libopenmpt/libopenmpt_impl.cpp
git add third-party/openmpt-master/libopenmpt/libopenmpt_impl.hpp
git add third-party/openmpt-master/libopenmpt/libopenmpt_c.cpp
git add third-party/openmpt-master/libopenmpt/libopenmpt.h
git add public/chiptune3/libopenmpt.worklet.js
git commit -m "feat: add per-channel state API to libopenmpt WASM (note, volume, frequency, pan, instrument)"
```

---

## Task 2: Worklet — Extract and Send Channel State Per Row

**Files:**
- Modify: `public/chiptune3/chiptune3.worklet.js`

Extend the worklet's render loop to extract channel state on each new row and send it to the main thread.

- [ ] **Step 1: Add channel state extraction to the process() method**

In `public/chiptune3/chiptune3.worklet.js`, find the position extraction code (~line 85-100) where it reads order/pattern/row and posts the message. After the row-change detection, add channel state extraction:

```javascript
// After existing position extraction:
const newRow = libopenmpt._openmpt_module_get_current_row(this.modulePtr)
const newOrder = libopenmpt._openmpt_module_get_current_order(this.modulePtr)

// Detect row change for channel state export
if (newRow !== this.lastStateRow || newOrder !== this.lastStateOrder) {
    this.lastStateRow = newRow
    this.lastStateOrder = newOrder
    
    // Extract per-channel state (only on row change, not every frame)
    if (this.channels > 0) {
        const chState = new Float64Array(this.channels * 6) // 6 fields per channel
        for (let i = 0; i < this.channels; i++) {
            const base = i * 6
            chState[base + 0] = libopenmpt._openmpt_module_get_current_channel_note(this.modulePtr, i)
            chState[base + 1] = libopenmpt._openmpt_module_get_current_channel_instrument(this.modulePtr, i)
            chState[base + 2] = libopenmpt._openmpt_module_get_current_channel_volume(this.modulePtr, i)
            chState[base + 3] = libopenmpt._openmpt_module_get_current_channel_frequency(this.modulePtr, i)
            chState[base + 4] = libopenmpt._openmpt_module_get_current_channel_panning(this.modulePtr, i)
            chState[base + 5] = libopenmpt._openmpt_module_get_current_channel_active(this.modulePtr, i)
        }
        msg.chState = chState
    }
}
```

Also add tracking fields to the constructor:

```javascript
this.lastStateRow = -1
this.lastStateOrder = -1
```

- [ ] **Step 2: Reset state tracking on load/stop**

In the `play` and `stop` message handlers, reset:

```javascript
this.lastStateRow = -1
this.lastStateOrder = -1
```

- [ ] **Step 3: Commit**

```bash
git add public/chiptune3/chiptune3.worklet.js
git commit -m "feat: worklet sends per-channel state (note, instrument, volume, freq, pan) on each row"
```

---

## Task 3: LibopenmptEngine — Receive and Forward Channel State

**Files:**
- Modify: `src/engine/libopenmpt/LibopenmptEngine.ts`

- [ ] **Step 1: Add ChannelState type and callback**

Near the top of LibopenmptEngine.ts, add the type:

```typescript
export interface LibopenmptChannelState {
  note: number;        // 0 = no note, 1-120 = note after effects
  instrument: number;  // current instrument number
  volume: number;      // 0-16384 (nRealVolume, post-processing)
  frequency: number;   // Hz, after portamento/vibrato/arpeggio
  panning: number;     // 0-256 (nRealPan)
  active: boolean;     // channel is producing sound
}
```

Add callback field to the class:

```typescript
onChannelState: ((state: LibopenmptChannelState[], time: number) => void) | null = null;
```

- [ ] **Step 2: Parse chState in the message handler**

In the message handler where position messages are parsed (look for `msg.pos` or the position extraction), add:

```typescript
// After existing position handling:
if (msg.chState) {
  const arr = msg.chState as Float64Array;
  const numChannels = arr.length / 6;
  const state: LibopenmptChannelState[] = [];
  for (let i = 0; i < numChannels; i++) {
    const base = i * 6;
    state.push({
      note: arr[base + 0],
      instrument: arr[base + 1],
      volume: arr[base + 2],
      frequency: arr[base + 3],
      panning: arr[base + 4],
      active: arr[base + 5] !== 0,
    });
  }
  if (this.onChannelState) {
    // Use same audio-accurate timestamp as position callback
    const rawCtx = this.output.context as AudioContext;
    const latency = rawCtx.outputLatency ?? (rawCtx as any).baseLatency ?? 0;
    const time = rawCtx.currentTime + latency;
    this.onChannelState(state, time);
  }
}
```

- [ ] **Step 3: Run type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/engine/libopenmpt/LibopenmptEngine.ts
git commit -m "feat: LibopenmptEngine receives and forwards per-channel state from worklet"
```

---

## Task 4: Coordinator — Use Channel State for Hybrid Notes

**Files:**
- Modify: `src/engine/TrackerReplayer.ts`

Upgrade `fireHybridNotesForRow()` to use the processed channel state from libopenmpt instead of raw pattern data lookup.

- [ ] **Step 1: Add onChannelState subscription in the libopenmpt play path**

In TrackerReplayer.ts, find where `mptEngine.onPosition` is set (~line 1983). After the onPosition subscription, add:

```typescript
// Subscribe to per-channel state for hybrid synth note firing
mptEngine.onChannelState = (channelState, time) => {
  if (!this.playing || !this.song || this._replacedInstruments.size === 0) return;
  this.fireHybridNotesFromChannelState(channelState, time);
};
```

- [ ] **Step 2: Add fireHybridNotesFromChannelState method**

Add a new method near the existing `fireHybridNotesForRow`:

```typescript
/**
 * Fire ToneEngine notes for replaced instruments using PROCESSED channel state
 * from libopenmpt. This uses the actual pitch/volume after all effect processing
 * (portamento, vibrato, volume slides, etc.) rather than raw pattern data.
 */
private fireHybridNotesFromChannelState(
  channelState: import('./libopenmpt/LibopenmptEngine').LibopenmptChannelState[],
  time: number,
): void {
  if (!this.song) return;

  for (let ch = 0; ch < Math.min(channelState.length, this.channels.length); ch++) {
    const cs = channelState[ch];
    const channel = this.channels[ch];

    // Skip channels with no replaced instrument
    if (!cs.instrument || !this._replacedInstruments.has(cs.instrument)) {
      // If this channel WAS playing a replaced instrument, cut it
      const chanInst = typeof channel.instrument === 'number' ? channel.instrument
        : channel.instrument != null && typeof channel.instrument === 'object' && 'id' in channel.instrument
          ? (channel.instrument as { id: number }).id : 0;
      if (chanInst && this._replacedInstruments.has(chanInst)) {
        if (channel.player) {
          try { channel.player.stop(time); } catch { /* already stopped */ }
        }
        channel.instrument = null;
      }
      continue;
    }

    // Channel is playing a replaced instrument — fire via ToneEngine
    if (!cs.active || cs.frequency <= 0) continue;

    // Update channel instrument config
    const config = this.instrumentMap.get(cs.instrument);
    if (config) {
      channel.instrument = config;
    }

    // Convert frequency to note name
    const midiNote = Math.round(12 * Math.log2(cs.frequency / 440) + 69);
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNote / 12) - 1;
    const noteName = noteNames[midiNote % 12] + octave;

    // Normalize volume (nRealVolume is 0-16384, we need 0-1)
    const velocity = Math.min(1, cs.volume / 16384);

    const engine = getToneEngine();
    const rowDuration = (2.5 / this.bpm) * this.speed;

    if (config) {
      engine.triggerNote(
        cs.instrument,
        noteName,
        rowDuration,
        time,
        velocity,
        config,
        false,  // accent
        false,  // slide
        ch,     // channelIndex
      );
    }
  }

  // Update mute mask
  this.updateWasmMuteMask();
}
```

- [ ] **Step 3: Keep fireHybridNotesForRow as fallback**

Don't remove `fireHybridNotesForRow()` — it's the fallback for engines without channel state (UADE, Hively, etc.). The libopenmpt path uses `fireHybridNotesFromChannelState` (via onChannelState callback), other engines use `fireHybridNotesForRow` (via onPosition callback).

- [ ] **Step 4: Run type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/TrackerReplayer.ts
git commit -m "feat: hybrid notes use processed channel state from libopenmpt (pitch/volume/panning)"
```

---

## Task 5: Verification

- [ ] **Step 1: Build and test**

1. Rebuild libopenmpt WASM with the new C API functions
2. Load a MOD file in DEViLBOX
3. Verify normal playback works (no regression)
4. Replace an instrument with a synth (e.g., DuoSynth)
5. Add notes in the pattern editor
6. Press play

Expected:
- Original samples play via libopenmpt
- Replaced synth notes play via ToneEngine
- Synth notes have CORRECT pitch (portamento/vibrato applied by libopenmpt)
- Synth notes have CORRECT volume (volume slides applied by libopenmpt)
- Notes cut properly when switching instruments

- [ ] **Step 2: Test portamento**

1. Load a MOD with portamento effects (3xx)
2. Replace the instrument using portamento with a synth
3. Play — the synth should glide pitch smoothly (frequency comes from libopenmpt's processed state, not raw pattern note)

- [ ] **Step 3: Test arpeggio**

1. Load a MOD with arpeggio effects (0xy)
2. Replace the instrument
3. Play — the synth should cycle through arpeggio notes at the correct speed

- [ ] **Step 4: Run type-check**

Run: `npm run type-check`
Expected: PASS with zero errors

---

## Implementation Notes

### Why this approach works

libopenmpt processes ALL effects internally (portamento, vibrato, arpeggio, volume slides, tremolo, filter, NNA, etc.) and the results are visible in the ModChannel struct. By reading `nPeriod` (converted to frequency) and `nRealVolume` after processing, we get the EXACT same pitch and volume that libopenmpt would render as audio — but we route it through ToneEngine's synth instead.

### What happens for engines without channel state

UADE, Hively, Klystrack, MusicLine, and other WASM engines don't have this level of introspection. They continue using `fireHybridNotesForRow()` which reads raw pattern data. This is less accurate for effects but still functional. If needed, channel state can be added to other engines later using the same pattern.

### Frequency-to-note conversion

The `get_current_channel_frequency()` function uses libopenmpt's `GetFreqFromPeriod()` which handles ALL format-specific frequency calculations (Amiga periods, linear slides, XM fine tune, IT frequency tables). The coordinator converts frequency to MIDI note number for ToneEngine. For synths that support continuous pitch, we could pass the raw frequency instead.

### The thin coordinator (Phase 2)

This plan adds `fireHybridNotesFromChannelState` alongside the existing code. Phase 2 (the coordinator refactor) will strip TrackerReplayer to ~500 lines, keeping only: position tracking, hybrid note firing (both methods), mute/solo, VU meters, DJ features, and automation. The 4,000+ lines of tick processing, effect handlers, and sample management will be removed.
