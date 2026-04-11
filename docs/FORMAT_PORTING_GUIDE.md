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

### Lessons Learned

- **Read the actual source code** — The SF2 C++ source on GitHub has the exact binary format
  documented in code comments. `driver_info.cpp`, `datasource_orderlist.cpp`, and
  `datasource_sequence.cpp` provided everything needed.
- **PSID wrapping is powerful** — Any C64 format with known init/play addresses can reuse
  C64SIDEngine for audio. This pattern works for GoatTracker, SID Factory II, and potentially
  other C64 trackers.
- **Duration expansion is critical** — Without expanding duration bytes into hold rows,
  patterns look compressed and don't align with the actual playback timing.
