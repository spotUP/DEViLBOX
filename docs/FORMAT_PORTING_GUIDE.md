# Porting New Music Formats to DEViLBOX

A step-by-step guide for adding support for a new music file format. Covers all four
integration models, from simple TS-only parsing to full WASM streaming with live
pattern enrichment.

---

## Quick Decision Tree

```
Does a WASM library already exist that can play this format perfectly?
├─ YES → Model B (WASM Streaming) or Model C (Native Engine)
│        ├─ Does the library expose pattern/note data?
│        │   ├─ YES → Extract patterns at load time, stream audio
│        │   └─ NO  → Extract from OPL/chip registers or reconstruct from playback
│        └─ Is it an Amiga format that UADE can play?
│            └─ YES → Model C with UADE (editable hybrid)
└─ NO → Model A (Pure TypeScript) or write a WASM player
```

---

## The Four Integration Models

### Model A: Pure TypeScript Extraction

**When:** You have full documentation of the binary format and can parse patterns,
instruments, and effects entirely in TypeScript.

**Examples:** MOD, XM, IT, S3M, OKT, MED, DigiBooster

**How it works:**
```
File → TS Parser → TrackerSong (patterns + instruments) → ToneEngine plays notes
```

**Audio:** The TS scheduler (`TrackerReplayer.startScheduler()`) ticks through rows
and fires notes via ToneEngine (Web Audio synths/samplers).

**Position sync:** The scheduler calls `processTick()` → `processRow()` which updates
`coordinator.songPos`/`pattPos` and queues display states automatically.

**Files to create/modify:**
1. `src/lib/import/formats/MyFormatParser.ts` — Binary parser returning `TrackerSong`
2. `src/lib/import/FormatRegistry.ts` — Add entry to `FORMAT_REGISTRY`
3. `src/lib/import/parseModuleToSong.ts` — Add routing (if custom dispatch needed)

---

### Model B: WASM Streaming + Pattern Extraction

**When:** A WASM library plays the format perfectly, and you want both accurate audio
AND an editable pattern display.

**Examples:** AdPlug (OPL/AdLib), libopenmpt (MOD/XM/IT/S3M), Furnace (chip synths)

**How it works:**
```
File → TS Parser extracts patterns → TrackerSong stored
     → WASM engine plays audio in AudioWorklet
     → Worklet reports (order, row, audioTime) every process() call
     → TrackerReplayer.onPosition → coordinator.dispatchEnginePosition()
     → DisplayStateRing queues timed states → rAF loop drains for smooth scroll
```

**Audio:** WASM AudioWorklet renders samples directly. ToneEngine is suppressed
(`_suppressNotes = true`).

**Position sync:** The worklet checks position EVERY `process()` call (375/sec at
48kHz/128 frames). On row change, it posts `{type: 'position', order, row, audioTime}`
to the main thread. The replayer calls `coordinator.dispatchEnginePosition()` which:
- Adds output latency to audioTime
- Computes row duration from `(2.5 / bpm) * speed`
- Queues a `DisplayState` in the ring buffer
- Fires `onRowChange` for React store updates
- Triggers VU meters and automation

**Key lesson learned (AdPlug):** Check position EVERY process() call, not every Nth.
Throttling to 47fps (every 8th call) introduced 21ms detection jitter = visible stutter.
libopenmpt checks every call and scrolls perfectly smooth.

**Files to create/modify:**
1. `src/lib/import/formats/MyFormatParser.ts` — Extract patterns from binary
2. `public/myformat/MyFormat.worklet.js` — AudioWorklet with WASM
3. `src/lib/import/MyFormatPlayer.ts` — Main-thread wrapper (init, load, callbacks)
4. `src/engine/TrackerReplayer.ts` — Add `useMyFormatStreaming` flag + setup in `play()`
5. `src/lib/import/FormatRegistry.ts` — Add entry

---

### Model C: Native Engine Streaming

**When:** A standalone WASM engine (compiled from C/C++/68k) handles the entire
playback pipeline. You may or may not have editable pattern data.

**Examples:** UADE (Amiga replayers), Hively, SID, JamCracker, MusicLine, TFMX,
PreTracker, Hippel, Future Composer, Art of Noise, Sonix, and 30+ more

**How it works:**
```
File → TS Parser extracts patterns (if possible)
     → Raw binary stored on TrackerSong (e.g., .jamCrackerFileData)
     → Engine singleton loads binary, starts AudioWorklet playback
     → Engine.subscribeToCoordinator(coordinator) wires position dispatch
     → Engine's worklet reports position → dispatchEnginePosition()
```

**Audio:** Engine's AudioWorklet. ToneEngine suppressed for engine channels, but
"hybrid" playback is possible — replaced instruments (synth substitutions) play
through ToneEngine while the engine plays the rest.

**Position sync:** Same as Model B — engine reports to coordinator.

**Adding a new native engine:**
1. Compile the replayer to WASM (Emscripten)
2. Create AudioWorklet that loads WASM and renders audio
3. Create `src/engine/myformat/MyFormatEngine.ts` with `subscribeToCoordinator()`
4. Store raw binary on TrackerSong: `myFormatFileData?: ArrayBuffer`
5. Wire in TrackerReplayer's `play()` method

---

### Model D: UADE Editable Hybrid

**When:** UADE plays the format perfectly AND you have a native TS parser for patterns.
Best of both worlds: perfect audio + full editability.

**Examples:** Future Composer, SoundMon, CustomMade, David Whittaker, and 100+ Amiga formats

**How it works:**
```
File → TS Parser → full TrackerSong with patterns + instruments
     → Raw binary stored as .uadeEditableFileData
     → UADE plays audio, TrackerReplayer shows parsed patterns
     → Position sync via UADE tick counter: row = (tick - firstTick) / speed
     → Pattern edits → UADEPatternEncoder patches chip RAM in real-time
```

**This is the recommended approach for Amiga formats** where UADE already plays
them correctly. You get perfect audio immediately, and can progressively improve
the pattern extraction.

---

## Step-by-Step: Adding a New Format

### Step 1: Register the Format

Add an entry to `src/lib/import/FormatRegistry.ts`:

```typescript
{
  key: 'myformat',
  label: 'My Format',
  description: 'My tracker format (.myf)',
  family: 'amiga-native',        // or 'pc-tracker', 'chip-dump', etc.
  matchMode: 'extension',         // or 'prefix' for Amiga-style (e.g., 'myf.')
  extRegex: /\.myf$/i,
  nativeParser: {
    module: '@lib/import/formats/MyFormatParser',
    parseFn: 'parseMyFormatFile',
  },
  uadeFallback: true,             // true if UADE can play it as fallback
  libopenmptFallback: false,
},
```

### Step 2: Write the Parser

Create `src/lib/import/formats/MyFormatParser.ts`:

```typescript
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, PatternCell } from '@/types/pattern';
import type { InstrumentConfig } from '@/types/instrument';

export async function parseMyFormatFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const data = new DataView(buffer);

  // 1. Parse header: channels, patterns, speed, BPM
  const numChannels = data.getUint8(0x00);
  const numPatterns = data.getUint8(0x01);
  const speed = data.getUint8(0x02);
  // ...

  // 2. Parse instruments
  const instruments: InstrumentConfig[] = [];
  // ...

  // 3. Parse patterns
  const patterns: Pattern[] = [];
  // ...

  // 4. Parse song positions (order list)
  const songPositions: number[] = [];
  // ...

  // 5. Compute BPM from format's timing
  // Standard tracker equation: tickRate = BPM * 2 / 5
  // rowRate = tickRate / speed
  // If format uses a fixed refresh rate (e.g., 50Hz PAL):
  //   BPM = refreshRate * speed * 5 / 2
  const bpm = Math.round(50 * speed * 5 / 2);

  return {
    name: 'Song Title',
    format: 'XM',                  // Use closest TrackerFormat enum
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: bpm,

    // For WASM streaming (Model B/C/D):
    // myFormatFileData: buffer,
    // For UADE editable hybrid:
    // uadeEditableFileData: buffer,
    // uadeEditableFileName: filename,
  };
}
```

### Step 3: Route in parseModuleToSong (if needed)

For standard formats, the registry's `nativeParser` is auto-routed. For custom
dispatch (magic bytes, companion files, etc.), add routing in
`src/lib/import/parseModuleToSong.ts`.

### Step 4: Wire Streaming Playback (Model B/C only)

In `src/engine/TrackerReplayer.ts`, add setup in the `play()` method:

```typescript
// In play(), after the libopenmpt and AdPlug streaming blocks:
if (this.song.myFormatFileData && !this.useWasmSequencer && !this.useLibopenmptPlayback) {
  try {
    const { getMyFormatPlayer } = await import('@/lib/import/MyFormatPlayer');
    const player = getMyFormatPlayer();
    const ok = await player.load(this.song.myFormatFileData, this.song.myFormatFileName);

    if (ok) {
      this.useMyFormatStreaming = true;
      this._suppressNotes = true;
      this._activeWasmEngine = player;        // for mute/solo
      this.coordinator.markDispatchActive();   // skip TS scheduler

      player.onPosition = (order, row, audioTime) => {
        if (!this.playing || !this.song) return;
        if (order >= 0 && order < (this.song.songPositions?.length ?? 0)) {
          this.coordinator.dispatchEnginePosition(row, order, audioTime, false);
        }
      };

      player.onChannelLevels = (levels) => {
        const engine = getToneEngine();
        engine.updateRealtimeChannelLevels(Array.from(levels));
      };

      player.onEnded = () => this.stop();
    }
  } catch (err) { /* fallback */ }
}
```

And add cleanup in `stop()`:

```typescript
if (this.useMyFormatStreaming) {
  this.useMyFormatStreaming = false;
  this._suppressNotes = false;
  import('@/lib/import/MyFormatPlayer').then(({ getMyFormatPlayer }) => {
    const p = getMyFormatPlayer();
    p.onPosition = null;
    p.onChannelLevels = null;
    p.onEnded = null;
    p.stop();
  });
}
```

---

## Critical Implementation Details

### BPM/Speed and Row Duration

The display ring computes row duration as `(2.5 / bpm) * speed` seconds. This MUST
match the actual row rate of the format. The formula derives from the standard tracker
timing equation:

```
tickRate = BPM * 2 / 5          (ticks per second)
rowRate  = tickRate / speed      (rows per second)
rowDuration = 1 / rowRate = speed / (BPM * 2 / 5) = (2.5 / BPM) * speed
```

For OPL/AdLib formats with a fixed refresh rate (e.g., 70Hz):
```
tickRate = refreshRate = 70 Hz
rowRate = tickRate / ticksPerRow = 70 / 6 ≈ 11.67 rows/sec
BPM = refreshRate * 5 / 2 = 175
speed = ticksPerRow = 6
→ rowDuration = (2.5 / 175) * 6 = 6/70 ≈ 0.0857 sec ✓
```

### Worklet Position Reporting

**CRITICAL:** Check position EVERY `process()` call (not every Nth). This is the
single most important thing for smooth scrolling.

```javascript
// In your worklet's process() method:
process(inputs, outputs) {
  // ... render audio ...

  // Check position EVERY call (2.67ms at 48kHz/128 frames)
  const order = this.module._get_position();
  const row = this.module._get_row();

  if (order !== this.lastOrder || row !== this.lastRow) {
    this.lastOrder = order;
    this.lastRow = row;
    this.port.postMessage({
      type: 'position',
      order,
      row,
      audioTime: currentTime,  // Web Audio currentTime at quantum start
    });
  }

  // Throttle VU meters separately (~47fps is fine)
  if (++this.vuCounter >= 8) {
    this.vuCounter = 0;
    // ... read and send channel levels ...
  }

  // Detect song end
  if (result === 0) {
    this.playing = false;
    this.port.postMessage({ type: 'ended' });
  }

  return true;
}
```

### Mute/Solo Interface

Your engine must implement `setMuteMask(mask: number)`:

```typescript
// Bit N = 1: channel N plays, Bit N = 0: channel N muted
// The replayer sets this._activeWasmEngine = yourEngine
// Then updateWasmMuteMask() calls yourEngine.setMuteMask(mask)

// In your worklet:
case 'setMuteMask':
  if (this.module._set_mute_mask) {
    this.module._set_mute_mask(msg.mask >>> 0);
  }
  break;

// In your main-thread wrapper:
setMuteMask(mask: number): void {
  this.processNode?.port.postMessage({ type: 'setMuteMask', mask });
}
```

### Per-Channel VU Meters

Two approaches, use whichever your engine supports:

**A. Engine-side channel levels** (preferred — like AdPlug):
```javascript
// Worklet reads per-channel amplitude from WASM shadow registers
const ptr = this.module._get_channel_levels();  // float[numChannels]
const levels = new Float32Array(numCh);
for (let i = 0; i < numCh; i++) {
  levels[i] = dv.getFloat32(ptr + i * 4, true);
}
this.port.postMessage({ type: 'levels', channelLevels: levels });

// Main thread:
player.onChannelLevels = (levels) => {
  getToneEngine().updateRealtimeChannelLevels(Array.from(levels));
};
```

**B. Coordinator-driven** (for engines without per-channel output):
The coordinator's `dispatchEnginePosition()` already calls `triggerVUMeters()`
on every row change, which reads meter data from ToneEngine's staging array.

### Live Pattern Enrichment (Optional)

If your format's static extraction misses notes, you can enrich patterns during
playback — read the engine's internal state each row and fill empty cells:

```typescript
player.onChannelNotes = (notes, order, row) => {
  if (!this.playing || !this.song) return;
  const patIdx = this.song.songPositions?.[order];
  const pattern = useTrackerStore.getState().patterns[patIdx];
  if (!pattern || row >= pattern.length) return;

  for (const n of notes) {
    if (n.trigger && n.note > 0) {
      const existing = pattern.channels[n.ch].rows[row];
      if (!existing || existing.note === 0) {
        setCellInPattern(pattern, n.ch, row, {
          note: n.note, instrument: n.inst,
          volume: n.vol > 0 ? (0x10 + Math.min(n.vol, 63)) : 0,
          effTyp: n.effTyp, eff: n.eff,
        });
      }
    }
  }
};
```

### Song End Handling

Always wire `onEnded` to stop playback:

```typescript
player.onEnded = () => {
  _log('[TrackerReplayer] MyFormat song ended');
  this.stop();
};
```

Without this, the pattern display keeps scrolling after the audio stops.

---

## Checklist

- [ ] **FormatRegistry entry** — key, label, extensions, family, parser ref
- [ ] **Parser** — returns valid `TrackerSong` with patterns, instruments, positions
- [ ] **BPM/speed** — `(2.5 / bpm) * speed` matches actual row duration
- [ ] **Binary data** — raw file stored on `TrackerSong.myFormatFileData` for streaming
- [ ] **Worklet** — checks position every `process()` call, posts on row change
- [ ] **Main-thread wrapper** — onPosition, onChannelLevels, onEnded, setMuteMask
- [ ] **TrackerReplayer.play()** — streaming flag, suppressNotes, markDispatchActive
- [ ] **TrackerReplayer.stop()** — cleanup callbacks, stop engine
- [ ] **Mute/solo** — `_activeWasmEngine` set, `setMuteMask()` implemented
- [ ] **VU meters** — per-channel levels sent from worklet
- [ ] **Song end** — onEnded wired to `this.stop()`
- [ ] **Type check** — `npm run type-check` passes

---

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Position checked every Nth call | Jerky/stuttering scroll | Check EVERY `process()` call |
| `duration=0` in display state | Scroll jumps between rows | Use `dispatchEnginePosition()` which computes from BPM/speed |
| BPM/speed don't match actual row rate | Scroll drifts from audio | Verify: `speed / (bpm * 2 / 5)` = actual seconds per row |
| `onEnded` not wired | Pattern scrolls after song ends | Wire `player.onEnded = () => this.stop()` |
| `markDispatchActive()` not called | TS scheduler + WASM fight | Call it right after engine setup |
| `_suppressNotes` not set | Double audio (ToneEngine + WASM) | Set `this._suppressNotes = true` |
| WASM singleton cached across HMR | Old code persists after rebuild | Add cache-busting `?v=Date.now()` to WASM fetch |
| Pattern extraction returns empty cells | Notes missing from display | Add density check fallback + live enrichment |
| rAF-only position polling | Uneven stepped scroll speed | Use `setInterval(4ms)` for ±2ms accuracy |
| `displayRow` returns 0 when stopped | Arrow keys don't scroll pattern | Return `cursorRow` when not playing |
| Arrow keys in keyboard handler | Conflicts with canvas hold-to-scroll | Let canvas handle all navigation |
| Extension conflict (e.g., .sng) | Wrong format loaded | Magic byte check BEFORE extension routing |
| `formatIsPlaying={true}` on order matrix | Matrix scrolls with pattern rows | Pass `formatIsPlaying={false}` for order matrices |
| Singleton FormatPlaybackState not reset | Stale row persists after stop | Call `setFormatPlaybackPlaying(false)` on stop |
| Store cursor not synced from canvas | Note entry at wrong position | Use `onFormatCursorChange` callback |
| USB-SID-Pico write buffer not flushed | ~124ms hardware audio lag | `SIDHardwareManager.scheduleFlush()` via `setTimeout(0)` after each write |
| `USBSIDPicoDevice(cycleExact: true)` | `flush()` garbles 2-byte writes as CYCLED_WRITE | Use `cycleExact: false` — nothing uses `writeCycled()` |
| Circular store imports (A→B→C→A) | TDZ on `const` in production bundle | Use `storeAccess.ts` leaf-module registry — never static-import sibling stores |
| `SIDHardwareManager.lastRegisters` stale | First frame's writes filtered | Call `clearDiffCache()` on bridge enable |

---

## File Map

| Purpose | Path |
|---------|------|
| Format registry | `src/lib/import/FormatRegistry.ts` |
| Import dispatcher | `src/lib/import/parseModuleToSong.ts` |
| TrackerSong interface | `src/engine/TrackerReplayer.ts` (line 234) |
| PlaybackCoordinator | `src/engine/PlaybackCoordinator.ts` |
| DisplayStateRing | `src/engine/PlaybackCoordinator.ts` (line 40) |
| TrackerReplayer.play() | `src/engine/TrackerReplayer.ts` (search `play(`) |
| TrackerReplayer.stop() | `src/engine/TrackerReplayer.ts` (search `stop(`) |
| Mute mask update | `src/engine/TrackerReplayer.ts` (search `updateWasmMuteMask`) |
| Pattern editor rAF | `src/components/tracker/PatternEditorCanvas.tsx` (search `getStateAtTime`) |
| WASM position store | `src/stores/useWasmPositionStore.ts` |
| Format playback state | `src/engine/FormatPlaybackState.ts` |
| AdPlug reference impl | `public/adplug/AdPlugPlayer.worklet.js` + `src/lib/import/AdPlugPlayer.ts` |
| libopenmpt reference | `public/chiptune3/chiptune3.worklet.js` + `src/engine/libopenmpt/LibopenmptEngine.ts` |

---

## Reference Implementations

**Best example for Model B (WASM streaming):** AdPlug
- Worklet: `public/adplug/AdPlugPlayer.worklet.js`
- Player: `src/lib/import/AdPlugPlayer.ts`
- Parser: `src/lib/import/formats/AdPlugParser.ts`
- WASM extractor: `src/lib/import/formats/AdPlugWasmExtractor.ts`
- Replayer wiring: `src/engine/TrackerReplayer.ts` (search `useAdPlugStreaming`)

**Best example for Model C (native engine):** libopenmpt
- Engine: `src/engine/libopenmpt/LibopenmptEngine.ts`
- Worklet: `public/chiptune3/chiptune3.worklet.js`
- `startWithCoordinator()` pattern at line 303+

**Best example for Model D (UADE hybrid):** Future Composer, SoundMon
- Parser: `src/lib/import/formats/FutureComposerParser.ts`
- UADE wiring: `src/engine/TrackerReplayer.ts` (search `uadeEditableFileData`)

**Best example for PSID wrapping (C64 format with embedded driver):** SID Factory II
- Parser: `src/lib/import/formats/SIDFactory2Parser.ts`
- Pattern: Parse header blocks → extract patterns + PSID-wrap PRG → c64SidFileData
- Audio uses C64SIDEngine (reSID emulation), patterns extracted from header metadata

---

## Case Study: Porting SID Factory II (.sf2)

### What Made This Port Unique

SF2 files are C64 PRG files with an embedded 6502 music driver and structured header
blocks. The header blocks describe the driver's init/play addresses and the memory layout
of sequences and order lists — everything needed for both audio playback and pattern display.

### Key Decisions

1. **PSID wrapping for audio** — Instead of writing a 6502 emulator or porting the driver,
   we wrap the raw PRG in a standard PSID v2 header and feed it to the existing C64SIDEngine.
   The PSID header provides init/play addresses from the DriverCommon block. This gives us
   perfect audio using reSID emulation with zero additional WASM work.

2. **Native pattern extraction** — The SF2 header blocks provide exact memory addresses for
   sequence data and order lists. We build a C64 memory image, read the pointer tables,
   and unpack sequences using the documented byte format (command → instrument → duration → note).

3. **PETSCII string decoding** — Driver names use C64 PETSCII encoding (0x01-0x1A = A-Z).
   Always check for platform-specific text encodings.

4. **SoundFont disambiguation** — `.sf2` extension is shared with SoundFont files. We check
   for RIFF header first (SoundFont), then 0x1337 magic (SID Factory II).

### Sequence Format (the tricky part)

The packed sequence format has strict byte ordering per event:
```
[command >= 0xC0] [instrument >= 0xA0] [duration >= 0x80] <note 0x00-0x7F>
```
Each prefix byte is optional. Duration specifies extra rows to fill with hold/rest after
the note, which expands a compact sequence into a full-length pattern. The `Unpack()` method
in `datasource_sequence.cpp` is the authoritative reference.

### PSID Header Construction

```typescript
// PSID v2 header = 124 bytes, loadAddress=0 means data starts with 2-byte LE addr
// This is exactly what PRG files provide (first 2 bytes = load address)
const sidFile = new Uint8Array(124 + rawPRG.length);
sidFile.set(psidHeader, 0);     // 124-byte PSID header
sidFile.set(rawPRG, 124);       // Full PRG including 2-byte load address
// Set c64SidFileData on TrackerSong → C64SIDEngine handles everything
```

### Files Created/Modified

| File | Change |
|------|--------|
| `src/lib/import/formats/SIDFactory2Parser.ts` | New — 530 lines, full parser |
| `src/lib/import/FormatRegistry.ts` | Added entry (key: sidFactory2, family: c64-chip) |
| `src/lib/import/parsers/AmigaFormatParsers.ts` | Added .sf2 routing with SoundFont check |

### Hardware SID Output

Because SF2 uses C64SIDEngine, it inherits the register-dump hardware bridge for free.
The SF2View toolbar includes a `SIDHardwareToggle` that calls
`sf2Engine.engine.enableHardwareOutput()`. The afterProcess callback on the websid
ScriptProcessorNode reads $D400-$D418 at ~43 Hz and diff-writes to the USB-SID-Pico.

The jsSID backend (used for standalone .sid playback, not SF2) has its own cycle-exact
bridge that's more accurate but doesn't support RAM write access — so SF2 always uses
websid for its C64SIDEngine backend.

### Lessons Learned

- **Read the actual source code** — The SF2 C++ source on GitHub has the exact binary format
  documented in code comments. `driver_info.cpp`, `datasource_orderlist.cpp`, and
  `datasource_sequence.cpp` provided everything needed.
- **PSID wrapping is powerful** — Any C64 format with known init/play addresses can reuse
  C64SIDEngine for audio. This pattern works for GoatTracker, SID Factory II, and potentially
  other C64 trackers.
- **Duration expansion is critical** — Without expanding duration bytes into hold rows,
  patterns look compressed and don't align with the actual playback timing.
- **Hardware output is a free bonus** — Any format using C64SIDEngine gets USB-SID-Pico
  routing with one method call + a toolbar toggle. No additional WASM or engine work needed.

---

## Model E: Format-Specific View with Custom Engine

### When to Use

When a format has its own dedicated engine (WASM or otherwise), its own Zustand store,
and needs a custom UI layout that differs from the standard tracker view. The format
bypasses `TrackerReplayer` entirely and manages its own playback, position tracking,
and pattern data.

**Examples:** GT Ultra, SID Factory II, JamCracker, Hively

### How It Works

```
File → TS Parser extracts data → Format-specific Zustand store
     → Custom engine handles audio (WASM worklet or C64 emulation)
     → Engine reports position → FormatPlaybackState singleton
     → Format view renders PatternEditorCanvas in "format mode"
     → Format adapter hook converts store → FormatChannel[]
```

### Architecture

```
┌─ Format Engine ──────────────┐
│  Audio playback               │──→ FormatPlaybackState singleton
│  Position reporting           │       (row, rowDuration, rowChangeTime)
│  RAM/memory access            │
└──────────────────────────────┘
         ↕ store updates
┌─ Format Zustand Store ───────┐
│  Pattern data, order lists    │
│  Playback position            │
│  Cursor position              │
│  Instruments, tables          │
└──────────────────────────────┘
         ↕ React hooks
┌─ Format View ────────────────┐
│  Toolbar (transport, info)    │
│  Order matrix (optional)      │
│  PatternEditorCanvas          │←── formatColumns, formatChannels,
│    (format mode)              │    formatCurrentRow, formatIsPlaying
│  Instrument editor (optional) │
└──────────────────────────────┘
```

### Key Difference from Models A–D

Models A–D all flow through `TrackerReplayer` and `PlaybackCoordinator` for position sync.
Model E bypasses both — the engine writes directly to `FormatPlaybackState`, and the
canvas reads it via its RAF loop. No `dispatchEnginePosition()`, no `DisplayStateRing`.

### Files to Create

| File | Purpose |
|------|---------|
| `src/stores/useMyFormatStore.ts` | Zustand store for format state |
| `src/engine/myformat/MyFormatEngine.ts` | Engine wrapper (audio + memory access) |
| `src/components/myformat/MyFormatView.tsx` | Format-specific view layout |
| `src/components/myformat/useMyFormatFormatData.ts` | Store → FormatChannel[] adapter |
| `src/components/myformat/MyFormatKeyboardHandler.ts` | QWERTY piano + format-specific keys |
| `src/components/myformat/myformatAdapter.ts` | Column definitions + data conversion |

### Reference Implementations

- **GT Ultra** — Full-featured: WASM engine, order matrix, DAW mode, ASID bridge
- **SID Factory II** — C64 emulation: PSID wrapping, driver memory polling, live editing
- **JamCracker** — Simple: WASM engine, read/write patterns, export
- **Hively** — Minimal: uses standard tracker stores, custom position editor

---

## FormatPlaybackState — The Scroll Mechanism

All Model E engines use `FormatPlaybackState` to communicate playback position to
the pattern editor canvas. It's a lightweight singleton — zero React overhead, zero
allocation per frame.

### API

```typescript
import {
  setFormatPlaybackRow,
  setFormatPlaybackPlaying,
  setFormatPlaybackRowDuration,
  getFormatPlaybackState,
  resetFormatPlaybackState,
} from '@engine/FormatPlaybackState';

// Engine calls these:
setFormatPlaybackPlaying(true);
setFormatPlaybackRow(row);                 // Called on every row change
setFormatPlaybackRowDuration(120);         // Optional: exact ms per row

// Canvas reads this every rAF frame:
const state = getFormatPlaybackState();
// state.row, state.isPlaying, state.rowChangeTime, state.rowDuration
```

### Row Duration: Measurement vs Explicit

By default, `rowDuration` is estimated from a rolling average of measured intervals
between row changes. This works well for engines with precise callbacks (GT Ultra),
but produces jitter for engines that poll position via rAF (±16ms noise).

**Use `setFormatPlaybackRowDuration(ms)` when:**
- Your engine knows the exact speed (e.g., C64 driver speed × 20ms PAL tick)
- You're polling position and the rolling average produces visible jitter
- The format has variable speed and you read the current speed from engine memory

When an explicit duration is set, the rolling average is suppressed. Call with `0`
to revert to measurement-based estimation.

### Position Reporting Strategies

| Strategy | Accuracy | Used By | When |
|----------|----------|---------|------|
| Worklet callback | ±2.7ms | GT Ultra, JamCracker | Engine's worklet posts on row change |
| `setInterval(4ms)` | ±2ms | SF2 | Polling C64 RAM, no worklet callback |
| rAF polling (60Hz) | ±8ms | ❌ Avoid | Visible jitter in stepped scroll |

**Rule:** Never poll position with rAF alone. Use either worklet callbacks (preferred)
or a high-frequency interval (4ms). The SF2 engine splits its capture loop:
- rAF (60Hz) for flight recorder / SID register sampling (visual rate)
- `setInterval(4ms)` for position polling (sub-frame accuracy)

### Canvas Integration

The `PatternEditorCanvas` reads `getFormatPlaybackState()` every frame in both
the WebGL worker overlay and Canvas2D fallback RAF loops:

```typescript
// Worker overlay path (macOS):
const fps = getFormatPlaybackState();
const fpsSmooth = fps.isPlaying && formatIsPlayingRef.current;
let newRow = formatCurrentRowRef.current;  // From React prop
// Smooth offset calculated from fps.rowDuration + fps.rowChangeTime

// Canvas2D path (iOS/fallback):
const fpsActive = fps.isPlaying && formatIsPlayingRef.current;
playRow = fpsActive ? fps.row : formatCurrentRowRef.current;
```

**Important:** The `formatIsPlaying` prop controls whether the canvas uses
FormatPlaybackState for scrolling. Order matrices pass `formatIsPlaying={false}`
to prevent scrolling with the pattern — they track song position via their own
`formatCurrentRow` prop instead.

---

## SID Hardware Output (USB-SID-Pico / ASID)

Any format that uses C64 SID emulation can route its register writes to real
SID hardware via the USB-SID-Pico (WebUSB) or ASID (Web MIDI) transports.

### Architecture

```
SID Emulator (WASM)
  ↓ reads registers from emulated RAM ($D400-$D418)
C64SIDEngine.enableHardwareOutput()
  ↓ afterProcess callback reads 25 registers per audio buffer
SIDHardwareManager.writeRegister(chip, reg, value)
  ↓ diff cache (skip unchanged), setTimeout(0) batched flush
USBSIDPico.write(chip, reg, value) → USB bulk transfer
  ↓
Real SID chip on USB-SID-Pico hardware
```

### Two Hardware Bridges

**1. jsSID cycle-exact bridge** (JSSIDEngine) — writes registers individually as
the SID emulator produces them, with cycle timing. Most accurate. Enabled
automatically when `sidHardwareMode === 'webusb'` in settings.

**2. C64SIDEngine register-dump bridge** — reads all 25 SID registers from
emulated C64 RAM after each ScriptProcessorNode buffer fill (~43 Hz at 1024
samples/44.1kHz). Diff-writes changed registers to SIDHardwareManager. Used
by websid, tinyrsid, websidplay backends. Less precise than cycle-exact but
more than adequate for real-time playback.

### Key Implementation Details

**Diff cache in SIDHardwareManager:** Every `writeRegister()` compares against
`lastRegisters` Map. Only changed values go to USB. Call `clearDiffCache()` when
enabling the bridge so the first frame sends all 25 registers.

**Batched USB flush:** `writeRegister()` calls `scheduleFlush()` — a `setTimeout(0)`
debounce that fires AFTER all pending message events in the current event-loop tick.
A full frame's register dump batches into one USB bulk transfer instead of 25
individual ones. Without this, registers sit in the pico's 31-entry write buffer
for ~124 ms before draining.

**Clock rate:** Call `SIDHardwareManager.applyClockFromSettings()` on bridge enable
to sync the Pico's PAL/NTSC/DREAN clock with the persisted setting. Without this,
the Pico plays at whatever clock it last remembered — potentially wrong pitch.

**USBSIDPico cycleExact flag:** The singleton is `new USBSIDPicoDevice(false)` because
every call site uses the 2-byte `write()` method, never `writeCycled()`. With
`cycleExact: true`, the public `flush()` method wraps 2-byte entries in a
CYCLED_WRITE (4-byte) command header, garbling the stream.

**Muting the softsynth:** When hardware output is enabled, set the engine's
GainNode to 0 so the emulated SID and the real chip don't play in parallel.
Restore on disable.

### Adding Hardware Output to a New SID Format

If your format uses `C64SIDEngine`, hardware output is built in — call
`engine.enableHardwareOutput()` and add the `SIDHardwareToggle` component
to your toolbar:

```tsx
import { SIDHardwareToggle } from '@/components/common/SIDHardwareToggle';

// In your format view:
const c64Engine = myEngine.engine; // C64SIDEngine instance

<SIDHardwareToggle
  bridgeEnabled={hwEnabled}
  onEnable={() => c64Engine?.enableHardwareOutput()}
  onDisable={() => c64Engine?.disableHardwareOutput()}
  writeCount={writeCount}
/>
```

For GoatTracker (which uses its own WASM reSID, not C64SIDEngine), the bridge
works differently — the WASM emits register dumps via EM_JS `js_asid_write()`
callback → `GTUltraASIDBridge` → `SIDHardwareManager`. See
`src/engine/gtultra/GTUltraASIDBridge.ts` for that pattern.

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/sid/SIDHardwareManager.ts` | Unified manager — routes to WebUSB or ASID |
| `src/lib/sid/USBSIDPico.ts` | WebUSB driver for USB-SID-Pico |
| `src/lib/sid/ASIDDeviceManager.ts` | Web MIDI ASID device management |
| `src/engine/C64SIDEngine.ts` | Register-dump bridge for non-jsSID backends |
| `src/engine/gtultra/GTUltraASIDBridge.ts` | GT Ultra's EM_JS-based bridge |
| `src/components/common/SIDHardwareToggle.tsx` | Shared UI toggle component |

---

## Format-Specific Views

### Layout Pattern

All format views follow the same structure:

```tsx
<div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
  {/* Toolbar — 36px, format info + transport */}
  <div style={{ height: 36, flexShrink: 0 }}>
    <MyFormatToolbar />
  </div>

  {/* Order matrix — collapsible, optional */}
  <div style={{ height: matrixH, flexShrink: 0 }}>
    <MyOrderMatrix collapsed={collapsed} onToggleCollapse={toggle} />
  </div>

  {/* Pattern editor — flex: 1 fills remaining space */}
  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
    <PatternEditorCanvas
      formatColumns={FORMAT_COLUMNS}
      formatChannels={channels}
      formatCurrentRow={currentRow}
      formatIsPlaying={isPlaying}
      onFormatCellChange={handleCellChange}
      onFormatCursorChange={handleCursorChange}  // Optional: sync canvas cursor → store
    />
  </div>
</div>
```

### Format Adapter Hook Pattern

Every format needs a hook that converts its store data to `FormatChannel[]`:

```typescript
export function useMyFormatFormatData() {
  const playing = useMyFormatStore(s => s.playing);
  const playbackRow = useMyFormatStore(s => s.playbackPos.row);
  const cursorRow = useMyFormatStore(s => s.cursor.row);
  const playbackPos = useMyFormatStore(s => s.playbackPos);
  const orderCursor = useMyFormatStore(s => s.orderCursor);

  // Switch between playback position and cursor position
  const currentOrderPos = playing ? playbackPos.songPos : orderCursor;
  const displayRow = playing ? playbackRow : cursorRow;

  const channels = useMemo(() =>
    convertToFormatChannels(storeData, currentOrderPos),
    [storeData, currentOrderPos],
  );

  const handleCellChange = useCallback((chIdx, rowIdx, colKey, value) => {
    // Write to engine/store
    engine.setCell(chIdx, rowIdx, colKey, value);
    store.refresh();
  }, [currentOrderPos]);

  return { channels, currentRow: displayRow, isPlaying: playing, handleCellChange };
}
```

**Critical:** `displayRow` must return `cursorRow` when stopped, not `0`. Without
this, arrow key navigation doesn't scroll the pattern.

### FormatChannel / ColumnDef Types

Define your format's columns in an adapter file:

```typescript
import type { ColumnDef, FormatChannel, FormatCell } from '@/components/shared/format-editor-types';

export const MY_FORMAT_COLUMNS: ColumnDef[] = [
  { key: 'note',       label: 'Not', type: 'note', width: 3, emptyValue: 0 },
  { key: 'instrument', label: 'Ins', type: 'hex',  width: 2, emptyValue: 0xFF,
    color: '#80c0ff' },
  { key: 'command',    label: 'Cmd', type: 'hex',  width: 2, emptyValue: 0,
    color: '#ffe080' },
  { key: 'data',       label: 'Dat', type: 'hex',  width: 2, emptyValue: 0,
    color: '#ffe080' },
];
```

Column types: `note` (C-4 style), `hex` (2-digit hex), `ctrl` (special formatting).
`emptyValue` determines what renders as "··" (dots) vs a real value.

### Keyboard Handler Pattern

Format-specific keyboard handlers handle note entry, hex editing, and format-specific
shortcuts. Navigation (arrows, PgUp/PgDn, Home/End) is handled by the canvas itself.

```typescript
export function useMyFormatKeyboardHandler(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const handler = (e: KeyboardEvent) => {
      // Skip if user is in an input field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // QWERTY piano entry
      const pianoOffset = PIANO_MAP[e.key.toLowerCase()];
      if (pianoOffset !== undefined && !e.ctrlKey && !e.metaKey) {
        const note = pianoOffset + octave * 12;
        store.setNote(cursor.row, cursor.channel, note);
        e.preventDefault();
        return;
      }

      // Hex entry for instrument/command columns
      const hexVal = parseHex(e.key);
      if (hexVal !== null && cursor.columnType !== 'note') {
        // ... handle hex digit entry
      }

      // Format-specific shortcuts
      if (e.key === ' ') { togglePlayback(); e.preventDefault(); }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active]);
}
```

**Rule:** Do NOT handle arrow keys, PgUp/PgDn, Home/End in the keyboard handler.
The `PatternEditorCanvas` handles all navigation with smooth hold-to-scroll in its
internal RAF loop. Duplicating navigation in the keyboard handler causes conflicts.

Use `onFormatCursorChange` callback to sync the canvas cursor back to the format store:

```tsx
<PatternEditorCanvas
  onFormatCursorChange={(row, channel) => {
    store.setCursor({ row, channel });
  }}
/>
```

---

## Order Matrix / Trackstep Editor

### Using PatternEditorCanvas as an Order Matrix

The same `PatternEditorCanvas` can render order matrices by passing order data as
`formatChannels` with one row per order entry:

```tsx
<PatternEditorCanvas
  formatColumns={ORDER_COLUMNS}
  formatChannels={orderChannels}
  formatCurrentRow={songPos}
  formatIsPlaying={false}         // ← Order matrix does NOT scroll with playback
  onFormatCellChange={handleOrderChange}
  hideVUMeters={true}
  hideAutomationLanes={true}
/>
```

**Key:** `formatIsPlaying={false}` prevents the order matrix from using
`FormatPlaybackState` for scrolling. Instead, it centers on `formatCurrentRow`
(the song position from the Zustand store). The store updates when the engine
reports a new order position, which triggers a React re-render and prop change.

### Using SongOrderMatrix (Shared Component)

For simpler order editors, use the shared `SongOrderMatrix` component:

```tsx
import { SongOrderMatrix } from '@/components/shared/SongOrderMatrix';

<SongOrderMatrix
  label="POSITIONS"
  width={width}
  height={height}
  formatColumns={positionColumns}
  formatChannels={positionChannels}
  currentRow={currentPosition}
  onCellChange={handleCellChange}
  collapsed={collapsed}
  onToggleCollapse={toggle}
/>
```

This wraps `PatternEditorCanvas` with a collapsible container, label bar, and
keyboard shortcuts for block selection (Ctrl+C/X/V/A).

### Special Order Values

Order matrices often have special command values (repeat, transpose, end marker).
Use column `formatter` functions to decode them:

```typescript
const ORDER_COLUMN: ColumnDef = {
  key: 'order',
  label: 'Ord',
  type: 'hex',
  width: 2,
  emptyValue: -1,
  formatter: (val: number) => {
    if (val === 0xFF) return { text: 'EN', color: '#ff6060' };  // End marker
    if (val >= 0xD0 && val <= 0xDF) return { text: `R${val - 0xD0}`, color: '#60ff60' };
    return null;  // Use default hex rendering
  },
};
```

---

## Extension Conflict Resolution

Multiple formats sometimes share the same file extension (e.g., `.sng` is used by
both GoatTracker and AdPlug/EdPlayer/SNGPlay). The resolution pattern:

### Magic Byte Check Before Fallback

In `src/lib/file/UnifiedFileLoader.ts`, check magic bytes BEFORE the generic
extension-based routing:

```typescript
// In loadFile():

// 1. Check magic bytes for formats that share extensions
if (filename.endsWith('.sng')) {
  const { isGoatTrackerSong } = await import('../import/formats/GoatTrackerDetect');
  const buf = await file.arrayBuffer();
  if (isGoatTrackerSong(buf)) {
    return await loadSongFile(file, options, buf);  // → GoatTracker
  }
  // Not GoatTracker → fall through to AdPlug
}

// 2. Generic extension-based routing
if (isAdPlugWasmFormat(filename)) {
  return await loadAdPlugFile(file, options.companionFiles);
}
```

### SoundFont vs SID Factory II (.sf2)

Another example: `.sf2` is shared by SoundFont 2 (RIFF container) and SID Factory II
(C64 PRG with 0x1337 magic). The parser checks RIFF header first:

```typescript
if (isRIFFHeader(data))  → route to SoundFont loader
if (magic === 0x1337)    → route to SID Factory II parser
```

### Rules for Extension Conflicts

1. **Magic byte checks MUST come before extension-based routing** in `loadFile()`
2. **Lazy-load detection functions** — `await import()` avoids circular deps
3. **Read file bytes only when needed** — `file.arrayBuffer()` is async; don't read
   eagerly for every file
4. **Document the conflict** — add a comment explaining which formats share the extension

### Known Extension Conflicts

| Extension | Formats | Resolution |
|-----------|---------|------------|
| `.sng` | GoatTracker, AdPlug (EdPlayer/SNGPlay) | Magic bytes: `GTS!`/`GTS2-5` = GoatTracker |
| `.sf2` | SoundFont 2, SID Factory II | RIFF header = SoundFont, 0x1337 = SF2 |
| `.mod` | ProTracker, SoundTracker, NoiseTracker | M.K. / FLT4 / etc. magic at offset 1080 |

---

## Engine Position Reporting Patterns

### Pattern 1: Worklet Callback (Best — GT Ultra, JamCracker)

The engine's AudioWorklet fires a callback at the exact moment a row changes.
Zero jitter, precise timing.

```typescript
// In engine init:
engine.onPosition = (pos: { row: number; pos: number }) => {
  setFormatPlaybackRow(pos.row);
  store.updatePlaybackPos({ row: pos.row, songPos: pos.pos });
};
```

**Deduplication pattern** (closured state):
```typescript
onPosition: (() => {
  let lastRow = -1;
  let lastPos = -1;
  return (pos) => {
    setFormatPlaybackRow(pos.row);  // Always (lightweight singleton)
    if (pos.row !== lastRow || pos.pos !== lastPos) {
      lastRow = pos.row;
      lastPos = pos.pos;
      store.updatePlaybackPos({ row: pos.row, songPos: pos.pos });  // Only on change
    }
  };
})(),
```

### Pattern 2: High-Frequency Polling (SF2 — C64 RAM reads)

When the engine doesn't expose a position callback (e.g., C64 emulation via
ScriptProcessor), poll at high frequency with `setInterval`:

```typescript
// Start two parallel loops:

// 1. rAF (60Hz) — visual-rate sampling (oscilloscope, SID registers)
const captureTick = () => {
  flightRecorder.capture(sidEngine);
  captureRAFId = requestAnimationFrame(captureTick);
};
captureRAFId = requestAnimationFrame(captureTick);

// 2. setInterval (4ms ≈ 250Hz) — precise position polling
const pollPosition = () => {
  const seqRow = readRAM(driverCommon.sequenceIndexAddress) ?? 0;
  const orderIdx = readRAM(driverCommon.orderListIndexAddress) ?? 0;

  // Read speed from driver memory for exact row duration
  const eventDuration = readRAM(driverCommon.currentSeqEventDurationAddress) ?? 0;
  if (eventDuration > 0) {
    setFormatPlaybackRowDuration(eventDuration * 20);  // PAL: 20ms per tick
  }

  if (seqRow !== lastSeqRow) {
    lastSeqRow = seqRow;
    setFormatPlaybackRow(seqRow);
  }
};
positionPollId = window.setInterval(pollPosition, 4);
```

**Why 4ms?** rAF (60Hz) gives ±8ms detection jitter. In stepped scroll mode
(no interpolation), this causes visible speed variation — some rows display
for 7 frames, others for 8. `setInterval(4ms)` reduces jitter to ±2ms,
which is imperceptible.

### Pattern 3: Transport Store (Hively — Standard Tracker Path)

Some format views don't use `FormatPlaybackState` at all. They read from the
standard `useTransportStore` which is updated by `TrackerReplayer`:

```typescript
const isPlaying = useTransportStore(s => s.isPlaying);
const currentRow = useTransportStore(s => s.currentRow);
```

This works when the format's engine is wired through `NativeEngineRouting.ts`
and the standard replayer position sync path.

---

## Updated Checklist (Full Format with Custom View)

### Core Integration
- [ ] **FormatRegistry entry** — key, label, extensions, family, parser ref
- [ ] **Parser** — returns valid `TrackerSong` with patterns, instruments, positions
- [ ] **BPM/speed** — row timing matches actual format playback rate
- [ ] **Extension conflict** — magic byte check if extension is shared
- [ ] **Type check** — `npm run type-check` passes

### Engine
- [ ] **Engine class** — init, play, stop, pause, resume
- [ ] **Position reporting** — worklet callback OR high-frequency polling
- [ ] **FormatPlaybackState** — `setFormatPlaybackRow()` + `setFormatPlaybackPlaying()`
- [ ] **Row duration** — `setFormatPlaybackRowDuration()` if polling (not callback)
- [ ] **Mute/solo** — `setMuteMask(mask)` or per-channel mute API
- [ ] **Cleanup on stop** — cancel rAF, clear intervals, reset FormatPlaybackState

### Store
- [ ] **Zustand store** — pattern data, playback position, cursor, instruments
- [ ] **Position update action** — `updatePlaybackPos({ row, songPos })`
- [ ] **Cursor action** — `setCursor({ row, channel })`
- [ ] **Cell edit actions** — write note/instrument/command/data per cell

### View
- [ ] **Format view component** — toolbar + optional order matrix + PatternEditorCanvas
- [ ] **Format adapter hook** — `useMyFormatFormatData()` returning FormatChannel[]
- [ ] **Column definitions** — note, instrument, command columns with formatters
- [ ] **Cell change handler** — maps column keys to store/engine writes
- [ ] **displayRow** — returns `cursorRow` when stopped, `playbackRow` when playing
- [ ] **Cursor sync** — `onFormatCursorChange` callback bridges canvas → store

### Keyboard
- [ ] **Keyboard handler hook** — QWERTY piano entry + hex editing
- [ ] **No arrow key handling** — canvas handles all navigation
- [ ] **Format shortcuts** — space (transport), octave switch, order navigation

### Order Matrix (optional)
- [ ] **Order matrix component** — `PatternEditorCanvas` with `formatIsPlaying={false}`
- [ ] **Song position tracking** — reads `songPos` from store
- [ ] **Special value formatting** — end markers, repeat commands, transpose values

---

## Updated File Map

| Purpose | Path |
|---------|------|
| Format registry | `src/lib/import/FormatRegistry.ts` |
| File loader (extension routing) | `src/lib/file/UnifiedFileLoader.ts` |
| Import dispatcher | `src/lib/import/parseModuleToSong.ts` |
| TrackerSong interface | `src/engine/TrackerReplayer.ts` |
| PlaybackCoordinator | `src/engine/PlaybackCoordinator.ts` |
| **Format playback singleton** | **`src/engine/FormatPlaybackState.ts`** |
| **Format editor types** | **`src/components/shared/format-editor-types.ts`** |
| **Shared order matrix** | **`src/components/shared/SongOrderMatrix.tsx`** |
| Pattern editor canvas | `src/components/tracker/PatternEditorCanvas.tsx` |
| WASM position store | `src/stores/useWasmPositionStore.ts` |
| Native engine routing | `src/engine/replayer/NativeEngineRouting.ts` |

### Reference Implementations by Model

| Model | Format | Key Files |
|-------|--------|-----------|
| A (Pure TS) | MOD/XM/IT | `src/lib/import/formats/XMParser.ts` |
| B (WASM Streaming) | AdPlug | `src/lib/import/AdPlugPlayer.ts`, `public/adplug/` |
| C (Native Engine) | libopenmpt | `src/engine/libopenmpt/LibopenmptEngine.ts` |
| D (UADE Hybrid) | Future Composer | `src/lib/import/formats/FutureComposerParser.ts` |
| **E (Custom View)** | **GT Ultra** | **`src/engine/gtultra/`, `src/components/gtultra/`, `src/stores/useGTUltraStore.ts`** |
| **E (Custom View)** | **SID Factory II** | **`src/engine/sf2/`, `src/components/sidfactory2/`, `src/stores/useSF2Store.ts`** |
| **E (Custom View)** | **JamCracker** | **`src/engine/jamcracker/`, `src/components/jamcracker/`, `src/hooks/useJamCrackerData.ts`** |
| **E (Custom View)** | **Hively/AHX** | **`src/components/hively/`, `src/stores/useHivelyStore.ts`** |
