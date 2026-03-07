# UADE Integration — Deep Dive Technical Research

**Date:** 2026-03-07  
**Scope:** Complete UADE WASM module architecture, Paula register interception, enhanced import pipeline

---

## 1. Current UADE WASM Module

### Location
- **WASM Binary:** `/Users/spot/Code/DEViLBOX/public/uade/UADE.wasm` (2.0 MB)
- **JS Glue:** `/Users/spot/Code/DEViLBOX/public/uade/UADE.js` (96 KB)
- **Worklet:** `/Users/spot/Code/DEViLBOX/public/uade/UADE.worklet.js` (68 KB, 1803 lines)
- **Source:** `/Users/spot/Code/DEViLBOX/uade-wasm/src/` (custom wrappers + standard UADE)

### Architecture
```
JavaScript
  ↓ (UADEEngine.ts)
AudioWorklet (UADE.worklet.js)
  ↓ (Emscripten wrapper)
WASM Module (UADE.wasm)
  ├─ libuade (format detection, eagleplayer dispatch)
  ├─ shim_ipc.c (in-memory ring buffers replacing socketpair)
  ├─ uadecore_wasm.c (68k CPU emulator, Paula custom chip)
  └─ entry.c (WASM exported API surface)
```

**Why custom:** Native UADE uses `fork()+socketpair()` for IPC between frontend and 68k emulator core. WASM is single-threaded, so the DEViLBOX build:
- Replaces socketpair with in-memory ring buffers (shim_ipc.c)
- Splits the emulation into phases (phase 1=config, phase 2=reset, phase 3=handle_r_state, phase 4=m68k_run_1)
- Returns control to JS between phases so async messaging works

### Supported Formats
**130+ exotic Amiga music formats** (complete eagleplayer set embedded in WASM):
- JochenHippel, TFMX, Future Composer, FRED, SidMon
- Music Assembler, Hippel-7V, SoundMon, etc.
- Detection by magic bytes + extension in `eagleplayer.conf`

---

## 2. Paula Register Interception — Complete Pipeline

### Why Paula Registers Matter
Each Amiga Paula channel (0-3) has hardware registers controlling:
- **AUDxLC (LCH+LCL):** Sample pointer (24-bit chip RAM address)
- **AUDxLEN:** Sample length in words
- **AUDxPER:** Period (frequency control, Amiga period values)
- **AUDxVOL:** Volume 0-64
- **AUDxDAT:** Sample data (rarely logged)

These writes are where "notes" happen — when a driver sets AUDxLC + AUDxPER + AUDxVOL, it's triggering a note.

### Capture Points

#### 1. **WASM-Side Logging (entry.c + audio.c)**

**Static buffers:**
```c
// paula_log.h
#define PAULA_LOG_SIZE 512              // Ring buffer
typedef struct {
    uint8_t channel;                    // 0-3
    uint8_t reg;                        // PAULA_REG_* (0-5)
    uint16_t value;                     // Register value written
    uint32_t source_addr;               // g_uade_last_chip_read_addr
    uint32_t tick;                      // g_uade_tick_count (CIA-A)
} UadePaulaLogEntry;  // 12 bytes
```

**Where writes are logged:**
- Location: `uade-wasm/src/entry.c:79-88` — `uade_wasm_log_paula_write()`
- Called from: Paula emulator in `audio.c` (inside `#ifdef UADE_WASM` guards)
- **Critical:** `g_uade_last_chip_read_addr` is set in `memory.c` whenever the 68k CPU reads from chip RAM
  - When a driver reads an instrument's volume value from chip RAM and writes it to `AUDxVOL`, the `sourceAddr` captures that chip RAM address
  - This allows reverse-engineering where volume/period parameters live for any format

**Enables:** Auto-discovery of chip RAM parameter layouts without format-specific parsers

#### 2. **Worklet-Side Draining (UADE.worklet.js)**

**Message handler case 'getPaulaLog' (line 280):**
```javascript
const maxEntries = 512;
const ptr = this._wasm._malloc(maxEntries * 3 * 4);
const count = this._wasm._uade_wasm_get_paula_log(ptr, maxEntries);
const raw = new Uint32Array(this._wasm.HEAPU8.buffer, ptr, count * 3);
// Unpack: w0 = channel|reg|value (3 fields packed), w1 = sourceAddr, w2 = tick
```

Packs Paula log entries into a compact binary format:
- Word 0: `(channel << 24) | (reg << 16) | value`
- Word 1: sourceAddr
- Word 2: tick count

#### 3. **Engine-Side Receipt (UADEEngine.ts)**

**API:**
- `enablePaulaLog(enable: boolean)` — fires-and-forgets message to worklet
- `getPaulaLog(): Promise<PaulaLogEntry[]>` — drains accumulated log, returns structured entries
- Returns: Array of `PaulaLogEntry` interfaces with unpacked fields

---

## 3. Tick Snapshots — Timeline Reconstruction

### Why Tick Snapshots?
Paula write log only captures register writes (new notes). But held notes don't write registers — they just keep playing. To reconstruct full patterns including held notes, we capture the **full state of all 4 channels at each CIA-A Timer A tick**.

### Data Structure (paula_log.h:37-49)

```c
typedef struct {
    uint16_t period;      // AUDx PER current value
    uint16_t volume;      // AUDx VOL current value
    uint32_t lc;          // AUDx LC current pointer
    uint16_t len;         // AUDx LEN
    uint8_t dma_en;       // DMA enable flag
    uint8_t triggered;    // 1 if DMA restarted this tick (new note)
} UadeChannelTick;

typedef struct {
    uint32_t tick;           // CIA-A Timer A tick number
    UadeChannelTick channels[4];  // All 4 channels
} UadeTickSnapshot;  // 52 bytes
```

**Key field:** `triggered` — set to 1 when AUDxLC is written (new note starts), 0 otherwise

### Collection

**In entry.c:**
- Called from CIA emulator when CIA-A Timer A fires (frequency ~50 Hz on NTSC Amiga)
- Snapshots ring buffer: `g_tick_snaps[]` (4096 snapshots max)
- Enabled via: `uade_wasm_enable_tick_snapshots(1)` before enhanced scan

**In worklet:**
- Case 'getTickSnapshots' (line 336) unpacks and returns array of UADETickSnapshot objects
- Line 354: `const count = this._wasm._uade_wasm_get_tick_snapshots(ptr, maxSnaps)`

### Reconstruction (UADEPatternReconstructor.ts)

Algorithm reconstructs editable patterns from snapshots:

1. **Detect speed:** Find most common interval (CIA ticks) between consecutive `triggered=1` events across all channels. Fallback: 6 (ProTracker default).
2. **Group into rows:** Each row = `speed` CIA ticks.
3. **Extract note:** For each row, read first snapshot:
   - If `triggered=1`: emit note (map period → MIDI note)
   - If `triggered=0` and same period/lc as prior row: suppress (held note)
   - Else: emit empty cell
4. **Map instruments:** Use `lc` (chip RAM address) to look up instrument from enhanced scan sample table
5. **Detect effects:** Scan all snapshots in row for constant per-tick deltas:
   - Period delta → portamento (XM 1/2)
   - Volume delta → volume slide (XM A)

**Output:** Standard TrackerSong with editable Pattern array

---

## 4. Paula Register Auto-Discovery (UADEFormatAnalyzer.ts)

### Goal
For ANY UADE format without a dedicated parser, auto-discover where volume/period parameters live in chip RAM.

### How It Works

**Input:** Paula write log + known sample pointers from enhanced scan

**Process:**
1. Group log entries by CIA tick
2. For each tick, per channel:
   - Reconstruct AUDxLC from LCH+LCL writes: `lc = (lch << 16) | lcl`
   - Find matching known sample pointer
   - If found, record `sourceAddr` of:
     - AUDxVOL write (if present) → `volAddr`
     - AUDxPER write (if present) → `perAddr`
3. Create `UADEChipRamInfo` per instrument:
   ```typescript
   {
     moduleBase: 0,
     moduleSize: 0,
     instrBase: lc,
     instrSize: 8,
     sections: {
       'volume': volAddr,    // Chip RAM address of volume byte
       'period': perAddr,    // Chip RAM address of period word
       'samplePtr': lc,      // Chip RAM address of sample pointer
     }
   }
   ```

**Result:** `uadeChipRam` field on each Sampler instrument allows live editing of chip RAM parameters

**Example:** If analyzer finds volume writes come from address 0x15234, users can read/write that address directly to change per-instrument volume without re-exporting.

---

## 5. Enhanced Import Pipeline (UADEParser.ts)

### Two Modes: Enhanced vs. Classic

#### **Enhanced Mode (default)**
Returns fully editable `TrackerSong` with:
- Real Sampler instruments with extracted PCM samples
- Editable patterns reconstructed from CIA tick snapshots
- Auto-discovered chip RAM parameter layouts
- Instrument names extracted from file headers or chip RAM

#### **Classic Mode (fallback)**
Playback-only `TrackerSong`:
- Single UADESynth instrument (entire module as one opaque audio stream)
- Display-only patterns from Paula register heuristic scan
- For synthesis-only formats where PCM extraction yields nothing

### Flow (parseUADEFile @ line 397)

```
1. Load file via UADEEngine.load()
   → Returns UADEMetadata (player, formatName, subsongCount, scanData)

2. Route to native parsers if available
   → NATIVE_ROUTES table (line 435): 60+ format-specific parsers
   → E.g., ProTracker → MODParser, MED → MEDParser, SoundMon → SoundMonParser

3. If no native parser, use enhanced scan:
   a. Scan for subsong 0 (or re-scan requested subsong)
   b. Get CIA tick snapshots → reconstructPatterns()
   c. Try to read instrument names from chip RAM (MOD-style magic check at 0x438)
   d. Create Sampler instruments from extracted PCM
   e. Auto-discover chip RAM parameter layouts (UADEFormatAnalyzer)
   f. If reconstruction yields ≥1 pattern, use them; else use scan-row display patterns

4. Fallback to classic if enhanced yields no playable instruments
```

### Key Decision Points

**Line 432-859:** Native route dispatch
- Check `metadata.formatName` against NATIVE_ROUTES table
- E.g., 'ProTracker' → MODParser, 'SoundMon' → SoundMonParser
- Formats with native parsers deliver better results (accurate names, effects, structure)

**Line 866-874:** Subsong switching
- Default: reuse scanData from initial load (fast)
- subsong>0: call `engine.scanSubsong(subsong)` (re-scans to get unique patterns)

**Line 883-886:** Synthesis-only format check
- Sets: `SYNTHESIS_FORMATS` (currently empty — all synthesis formats now have native parsers)
- If matched: force classic mode + render each Paula channel in isolation (4 seconds of audio per channel)

**Line 943-1025:** Enhanced song construction
- `buildEnhancedSong()`: creates Sampler instruments from PCM
- `UADEFormatAnalyzer.analyzeAndPopulate()`: enriches with chip RAM layouts
- `reconstructPatterns()`: replaces display patterns with editable ones
- Warnings surface scan-quality issues (e.g., VBlank fallback, no PCM extracted)

---

## 6. Format-Specific Native Parsers

### Purpose
For formats with static structure (header tables, fixed layouts), native TypeScript parsers deliver better results than Paula register heuristics:
- Accurate instrument names (no guessing from chip RAM)
- Correct pattern structure and effects
- Proper tempo/speed values
- Sample metadata (loop points, base notes)

### Architecture

**Each parser:**
- `src/lib/import/formats/<Format>Parser.ts`
- Export: `parse<Format>File(buffer, filename): Promise<TrackerSong>`
- Returns `TrackerSong` with real `Sampler` instruments or format-specific synth instruments

**Registered in:**
- `UADEParser.ts` NATIVE_ROUTES (line 435)
- `src/engine/registry/builtin/` format-specific engine registration
- `src/engine/InstrumentFactory.ts` synth instantiation

### Examples

**PCM Formats (static sample tables):**
- JamCracker (`.jam`, `.jc`) — 4ch, PCM samples, Fxx/arpeggio/vibrato/portamento
- SoundFX (`.sfx`, `.sfx13`) — 15/31 instruments, PCM samples
- Future Composer (`.fc13`, `.fc14`) — 4ch, 47 waveforms, synth macro sequencer

**Synthesis Formats (synth engines):**
- SoundMon (`.bp`, `.bp3`) — wavetable + ADSR + LFO + arpeggio → SoundMonSynth
- SidMon (`.sid`, `.sid2`) — CIA oscillators → SidMonSynth
- Digital Mugician (`.dmu`, `.dmu2`) — custom synth → DigMugSynth
- Future Composer synth (`.fc` variants) — 47 waveforms → FCSynth

---

## 7. PCM Sample Extraction (buildEnhancedSong)

### How It Works

**After enhanced scan, we have:**
- `enhancedScan.samples: Record<number, UADEExtractedSample>`
- Key = chip RAM sample pointer (AUDxLC value)
- Value = `{ pcm: Uint8Array, length, loopStart, loopLength, typicalPeriod }`

**For each extracted sample:**
1. Create Sampler instrument: `createSamplerInstrument(id, name, pcmData, volume, sampleRate, loopStart, loopLength)`
2. Store chip RAM pointer in: `instrument.sample.uadeSamplePtr`
3. Store sample metadata in: `instrument.sample`

**Sample rate calculation:**
- Use `typicalPeriod` (most common Paula period seen during playback)
- Map period → frequency via Amiga period table
- Derive sample rate from expected playback rate

### Limitations

**Synthesis formats:** Waveforms are macro-generated at playback time (Furnace-style). Enhanced scan cannot extract them because they don't exist in chip RAM as PCM. For these, must either:
- Use dedicated synth parser (SoundMonParser, FCSynth, etc.)
- Or render each channel in isolation (4-second snapshot of synthesized output)

---

## 8. Current Editor + Export Capabilities

### What Can Be Edited

**Enhanced mode:**
- Sampler instruments: trim/loop PCM in Sampler editor
- Chip RAM parameters: read/write instrument volume, period via UADEChipEditor
- Patterns: edit notes/instruments/effects (reconstructed from CIA ticks)
- Subsongs: switch and import different subsongs

**Classic mode:**
- Nothing — playback only via UADEEngine

### What Can Be Exported

**Current export formats:**
- **MOD:** All songs (via libopenmpt export)
- **XM:** All songs (extended module format)
- **WAV:** Full-song render via UADE engine
- **Native format:** Not implemented (would require reverse-parsed file structure)

**Why native export is hard:**
- Each format has different binary structure (header layout, pattern encoding, sample storage)
- UADE gives us audio output + register analysis, not the file format rules
- Would need either:
  1. Full format-specific recompiler (big effort per format)
  2. Memory snapshot + 68k reassembly (fragile, incomplete)

**Current philosophy:** Treat UADE formats as import-only. Export to standard MOD/XM for editing elsewhere.

---

## 9. Real-World Example: Jochen Hippel Format

### File Format
- Compiled 68k Amiga executable (no static structure in file)
- Magic: "COSO" at byte 0 (if not PP20-compressed)
- May be PP20-packed in distribution

### UADE Load Process
1. File loaded into WASM MEMFS
2. Eagleplayer `hippel.player` decompresses (if PP20) → chip RAM
3. Executes 68k code from eagleplayer, which:
   - Decompresses song data (if needed)
   - Sets up Paula channels with hardcoded song data
   - Writes AUDxLC, AUDxLEN, AUDxPER, AUDxVOL per tick
4. Paula emulator captures all register writes + CIA tick snapshots

### Enhanced Import
1. No native parser entry (Jochen Hippel is pure 68k, not parseable as static structure)
2. Enhanced scan runs:
   - CIA snapshots captured during playback
   - Paula log captures all register writes
3. Pattern reconstruction:
   - Ticks with `triggered=1` → new notes
   - Reconstruct from period values (which notes played)
   - Instrument lookup: `lc` addresses map to extracted PCM samples
4. Chip RAM analysis:
   - Log entries show which addresses sourced VOL/PER writes
   - Auto-discover where per-instrument parameters live
5. Output:
   - Sampler instruments with extracted PCM
   - Editable patterns
   - Chip RAM editor for fine-tuning volume/period

### Cannot Export
- No way to recreate the 68k code + song data binary
- Export as MOD/XM instead

---

## 10. Summary of Technical Achievements

| Component | Status | Notes |
|-----------|--------|-------|
| UADE WASM module | ✅ Complete | 2.0 MB, 130+ formats, in-process 68k emulation |
| Paula write logging | ✅ Complete | Captures all AUDx register writes + source chip RAM addresses |
| CIA tick snapshots | ✅ Complete | Full Paula state every ~20ms, enables pattern reconstruction |
| Pattern reconstruction | ✅ Complete | CIA snapshots → editable TrackerSong patterns with effects |
| Chip RAM parameter auto-discovery | ✅ Complete | Paula log + snapshots → UADEChipRamInfo |
| Native format parsers | ✅ Extensive | 60+ formats with dedicated parsers (better than heuristics) |
| Sample extraction | ✅ Complete | PCM samples → Sampler instruments |
| Real-time editing | ✅ Partial | Can edit samples + chip RAM params; cannot edit patterns in-place |
| Native format export | ❌ Not implemented | Only MOD/XM export; would require format-specific recompilers |

---

## 11. Potential Future Work

### Highest Impact
1. **Pattern editing in enhanced mode:** Allow note/instrument/effect edits to flow back to UADE engine (challenging: requires mapping edits → Paula register writes)
2. **Per-format native export:** Build compilable recompilers for top formats (JochenHippel, TFMX, Future Composer) using Furnace/OpenMPT as reference
3. **Live chip RAM parameter UI:** Real-time sliders for UADEChipRam fields with instant playback feedback

### Technical Challenges
- Pattern editing requires reverse-mapping XM pattern cells → 68k CPU instructions (not feasible)
- Native export requires binary file format knowledge + code generation (high effort, format-specific)
- Live parameters require robust address space tracking + memory safety guarantees

---

**Research completed:** 2026-03-07
**Sources:** UADE WASM source, UADEEngine.ts, UADEParser.ts, worklet code, paula_log.h, UADEFormatAnalyzer.ts, UADEPatternReconstructor.ts
