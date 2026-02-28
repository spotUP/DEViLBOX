# UADE Chip RAM Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Future Composer, SoundMon, SidMon 1/2, and Fred Editor fully editable in DEViLBOX — pattern data, synthesis instrument parameters, and PCM samples — with UADE as the single playback engine, and one-click export back to the original Amiga binary format.

**Architecture:** When UADE loads a song its 68k emulator places the entire module in Amiga chip RAM. The native parser already knows every byte offset in the file (and file layout == chip RAM layout for these formats). We store the chip RAM base address in the TrackerSong, then the instrument editor reads and writes parameters directly to chip RAM via `uade_wasm_write_memory`. UADE picks up all changes on the next note trigger. Export reads the modified chip RAM back to disk.

**Tech Stack:** TypeScript, UADE WASM (`uade_wasm_write_memory` / `uade_wasm_read_memory` already exported), AudioWorklet message passing, React instrument editor components.

**Reference:** Design doc at `docs/plans/2026-02-28-uade-chip-ram-editing-design.md`

---

## Context every implementer must know

**Chip RAM address = file offset + moduleBase.**
For these five formats, UADE loads the binary file directly into chip RAM with no transformation. The file byte at offset N ends up at chip RAM address `moduleBase + N`. The native parsers already know every meaningful offset; we just need to add `moduleBase` at runtime.

**`uade_wasm_write_memory` already exists** (entry.c line ~600) — no WASM rebuild needed.

**`uade_wasm_read_memory` already exists** — but the current worklet only exposes it for scanning during the enhanced scan. We need a general-purpose `readMemory` message for use at any time.

**Format name strings** (from `eagleplayer.conf` — used as keys in NATIVE_ROUTES):
- `'FutureComposer1.3'`, `'FutureComposer1.4'`, `'FutureComposer-BSI'`
- `'SoundMon2.0'`, `'SoundMon2.2'`
- `'SIDMon1.0'`, `'SIDMon2.0'`
- `'Fred'`

**SYNTHESIS_FORMATS set in UADEParser.ts** currently forces these formats to classic mode. That guard must be removed for each format as its native parser is wired up.

**FCParser.ts** returns instruments with `synthType: 'FCSynth'` and `fc: FCConfig`. We are NOT changing that — the FCSynth is used for note-level preview in the pattern editor. The chip RAM editor adds a separate editing layer on top; it does not replace FCSynth. Same for SoundMonSynth, SidMon1Synth, SidMonSynth, FredSynth.

---

## Task 1: Add `writeMemory` and general `readMemory` to the worklet and UADEEngine

**Files:**
- Modify: `public/uade/UADE.worklet.js` (in `_handleMessage` switch)
- Modify: `src/engine/uade/UADEEngine.ts`

The worklet currently handles `readString` and `scanMemory` messages for chip RAM access during the scan phase. We need general-purpose `readMemory` and `writeMemory` messages that work at any time (before/after/during scan).

**Step 1: Add worklet message handlers**

In `public/uade/UADE.worklet.js`, inside `_handleMessage(data)`, add two new cases after the existing `readString` handler:

```javascript
case 'readMemory': {
  const { requestId, addr, length } = data;
  try {
    const buf = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      buf[i] = this._wasm.HEAPU8[
        this._wasm._uade_wasm_read_memory(addr + i) // single-byte read
      ] ?? 0;
    }
    // Use bulk read if available (more efficient)
    if (this._wasm._uade_wasm_read_memory) {
      const ptr = this._wasm._malloc(length);
      this._wasm._uade_wasm_read_memory(addr, ptr, length);
      const result = new Uint8Array(this._wasm.HEAPU8.buffer, ptr, length).slice();
      this._wasm._free(ptr);
      this.port.postMessage({ type: 'readMemoryResult', requestId, data: result.buffer }, [result.buffer]);
    } else {
      this.port.postMessage({ type: 'readMemoryResult', requestId, data: buf.buffer }, [buf.buffer]);
    }
  } catch (e) {
    this.port.postMessage({ type: 'readMemoryError', requestId, error: String(e) });
  }
  break;
}
case 'writeMemory': {
  const { requestId, addr, data: writeData } = data;
  try {
    const bytes = new Uint8Array(writeData);
    const ptr = this._wasm._malloc(bytes.length);
    this._wasm.HEAPU8.set(bytes, ptr);
    this._wasm._uade_wasm_write_memory(addr, ptr, bytes.length);
    this._wasm._free(ptr);
    this.port.postMessage({ type: 'writeMemoryResult', requestId });
  } catch (e) {
    this.port.postMessage({ type: 'writeMemoryError', requestId, error: String(e) });
  }
  break;
}
```

**Step 2: Add UADEEngine methods**

In `src/engine/uade/UADEEngine.ts`, add private tracking fields alongside the existing `_readStringPending` / `_scanMemoryPending` maps:

```typescript
private _readMemoryPending = new Map<number, { resolve: (v: Uint8Array) => void; reject: (e: Error) => void }>();
private _readMemoryNextId = 0;
private _writeMemoryPending = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
private _writeMemoryNextId = 0;
```

Add message handlers in the worklet `onmessage` switch (alongside `readStringResult`):

```typescript
case 'readMemoryResult': {
  const { requestId, data } = event.data;
  this._readMemoryPending.get(requestId)?.resolve(new Uint8Array(data));
  this._readMemoryPending.delete(requestId);
  break;
}
case 'readMemoryError': {
  const { requestId, error } = event.data;
  this._readMemoryPending.get(requestId)?.reject(new Error(error));
  this._readMemoryPending.delete(requestId);
  break;
}
case 'writeMemoryResult': {
  const { requestId } = event.data;
  this._writeMemoryPending.get(requestId)?.resolve();
  this._writeMemoryPending.delete(requestId);
  break;
}
case 'writeMemoryError': {
  const { requestId, error } = event.data;
  this._writeMemoryPending.get(requestId)?.reject(new Error(error));
  this._writeMemoryPending.delete(requestId);
  break;
}
```

Add two public methods before `dispose()`:

```typescript
/** Read `length` bytes from Amiga chip RAM starting at `addr`. */
async readMemory(addr: number, length: number): Promise<Uint8Array> {
  await this._initPromise;
  if (!this.workletNode) throw new Error('UADEEngine not initialized');
  const requestId = this._readMemoryNextId++;
  const promise = new Promise<Uint8Array>((resolve, reject) => {
    this._readMemoryPending.set(requestId, { resolve, reject });
  });
  this.workletNode.port.postMessage({ type: 'readMemory', requestId, addr, length });
  return promise;
}

/** Write `data` bytes into Amiga chip RAM at `addr`. Changes take effect on next note trigger. */
async writeMemory(addr: number, data: Uint8Array): Promise<void> {
  await this._initPromise;
  if (!this.workletNode) throw new Error('UADEEngine not initialized');
  const requestId = this._writeMemoryNextId++;
  const promise = new Promise<void>((resolve, reject) => {
    this._writeMemoryPending.set(requestId, { resolve, reject });
  });
  const copy = data.slice();
  this.workletNode.port.postMessage(
    { type: 'writeMemory', requestId, addr, data: copy.buffer },
    [copy.buffer],
  );
  return promise;
}
```

**Step 3: Run type check**
```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

**Step 4: Commit**
```bash
git add public/uade/UADE.worklet.js src/engine/uade/UADEEngine.ts
git commit -m "feat(uade): add general-purpose readMemory/writeMemory to worklet and UADEEngine"
```

---

## Task 2: Add `uadeChipRam` metadata type and field

**Files:**
- Modify: `src/types/instrument.ts`

This metadata is stored on each synthesis instrument produced by a UADE native parser. It tells the chip RAM editor exactly where to find and modify the instrument's data in Amiga memory.

**Step 1: Add the interface**

Find the section in `src/types/instrument.ts` where other format-specific config types are defined (near `FCConfig`, `SoundMonConfig`, etc.) and add:

```typescript
/** Chip RAM location metadata for UADE-based format editing.
 *  Stored on instruments produced by native parsers when loaded via UADE.
 *  All addresses are absolute Amiga chip RAM addresses. */
export interface UADEChipRamInfo {
  /** Chip RAM address where the module binary starts (file byte 0 maps here). */
  moduleBase: number;
  /** Total size of the module binary in bytes (for full export via readMemory). */
  moduleSize: number;
  /** Chip RAM address where this instrument's data block starts.
   *  instrBase = moduleBase + file_offset_of_instrument_entry */
  instrBase: number;
  /** Size of this instrument's data block in bytes. */
  instrSize: number;
  /** Format-specific named section addresses within the module.
   *  e.g. { freqMacros: 0x12340, volMacros: 0x15600, waveData: 0x18000 }
   *  Used by editors to find waveform tables, arpeggio data, etc. */
  sections: Record<string, number>;
}
```

Then add `uadeChipRam?: UADEChipRamInfo` to `InstrumentConfig`:

```typescript
export interface InstrumentConfig {
  // ... existing fields ...
  uadeChipRam?: UADEChipRamInfo;  // present when loaded via UADE native parser
}
```

**Step 2: Type check**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**
```bash
git add src/types/instrument.ts
git commit -m "feat(uade): add UADEChipRamInfo type for chip RAM address metadata on instruments"
```

---

## Task 3: UADEChipEditor utility

**Files:**
- Create: `src/engine/uade/UADEChipEditor.ts`

A thin helper class over `UADEEngine.readMemory` / `writeMemory` with convenience methods for reading/writing typed values and exporting the module binary.

**Step 1: Create the file**

```typescript
/**
 * UADEChipEditor — read/write helpers for Amiga chip RAM via UADEEngine.
 *
 * Used by instrument parameter editors to live-edit synthesis parameters.
 * All changes take effect on the next UADE note trigger (no restart needed
 * for parameter edits; song-level structural changes require reload).
 */

import type { UADEEngine } from './UADEEngine';

export class UADEChipEditor {
  constructor(private readonly engine: UADEEngine) {}

  /** Read `length` raw bytes from chip RAM at `addr`. */
  readBytes(addr: number, length: number): Promise<Uint8Array> {
    return this.engine.readMemory(addr, length);
  }

  /** Write raw bytes to chip RAM at `addr`. */
  writeBytes(addr: number, data: Uint8Array): Promise<void> {
    return this.engine.writeMemory(addr, data);
  }

  /** Read a big-endian unsigned 16-bit value. */
  async readU16(addr: number): Promise<number> {
    const b = await this.engine.readMemory(addr, 2);
    return (b[0] << 8) | b[1];
  }

  /** Read a big-endian unsigned 32-bit value. */
  async readU32(addr: number): Promise<number> {
    const b = await this.engine.readMemory(addr, 4);
    return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  }

  /** Write a big-endian unsigned 8-bit value. */
  writeU8(addr: number, value: number): Promise<void> {
    return this.engine.writeMemory(addr, new Uint8Array([value & 0xFF]));
  }

  /** Write a big-endian unsigned 16-bit value. */
  writeU16(addr: number, value: number): Promise<void> {
    return this.engine.writeMemory(addr, new Uint8Array([(value >> 8) & 0xFF, value & 0xFF]));
  }

  /** Write a big-endian unsigned 32-bit value. */
  writeU32(addr: number, value: number): Promise<void> {
    return this.engine.writeMemory(addr, new Uint8Array([
      (value >>> 24) & 0xFF, (value >>> 16) & 0xFF,
      (value >>> 8) & 0xFF, value & 0xFF,
    ]));
  }

  /** Write a signed 8-bit value (stored as two's-complement). */
  writeS8(addr: number, value: number): Promise<void> {
    return this.writeU8(addr, value < 0 ? value + 256 : value);
  }

  /** Write a block of bytes at addr, reading the new values from `bytes`. */
  writeBlock(addr: number, bytes: number[]): Promise<void> {
    return this.engine.writeMemory(addr, new Uint8Array(bytes));
  }

  /**
   * Read the entire module binary back from chip RAM.
   * The returned buffer is byte-identical to the original format file
   * (with any chip RAM edits applied), ready for download.
   *
   * @param moduleBase - chip RAM address where module starts (from UADEChipRamInfo)
   * @param moduleSize - total byte length of the module
   */
  readModule(moduleBase: number, moduleSize: number): Promise<Uint8Array> {
    return this.engine.readMemory(moduleBase, moduleSize);
  }

  /**
   * Trigger a browser download of the module binary in its original format.
   * Call this after the user has finished editing parameters.
   */
  async exportModule(moduleBase: number, moduleSize: number, filename: string): Promise<void> {
    const bytes = await this.readModule(moduleBase, moduleSize);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

**Step 2: Type check**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**
```bash
git add src/engine/uade/UADEChipEditor.ts
git commit -m "feat(uade): UADEChipEditor — typed read/write helpers + module export for chip RAM editing"
```

---

## Task 4: Future Composer — wire native parser + add chip RAM info

**Files:**
- Modify: `src/lib/import/formats/UADEParser.ts`
- Modify: `src/lib/import/formats/FCParser.ts`

**FC format chip RAM layout** (from FCParser.ts + eagleplayer.conf analysis):
- Module loads at chip RAM address 0x000000 (FC eagleplayer loads song to absolute address 0)
- Magic bytes at offset 0: `FC13`, `FC14`, or `SMOD`
- Header pointer fields (big-endian u32 at these offsets from module base):
  - `+0x04`: sequence length
  - `+0x08`: pattern data pointer (`patPtr`) — absolute file offset
  - `+0x10`: freq macro pointer (`freqMacroPtr`) — absolute file offset
  - `+0x18`: vol macro pointer (`volMacroPtr`) — absolute file offset
  - `+0x20`: PCM sample data pointer (`samplePtr`) — absolute file offset
  - `+0x24`: waveform data pointer (`wavePtr`) — absolute file offset
- Sample definitions: 10 entries × 6 bytes starting at offset `0x28` (FC14: `0x28 + 80`)
- Freq macros: 64 bytes each, starting at `freqMacroPtr`
- Vol macros: 64 bytes each, starting at `volMacroPtr`
- PCM data: starts at `samplePtr`
- Waveform data: starts at `wavePtr`
- Total module size: read from file (already known by parser as `buffer.byteLength`)

**Step 1: Modify FCParser.ts to accept and populate chip RAM info**

FCParser currently reads from a raw `ArrayBuffer buffer`. We need it to also accept an optional `moduleBase` and return chip RAM addresses in the instruments it creates.

Find the function signature `export function parseFCFile(...)` (or however FC is exported) and check its current signature. Then:

Add an optional `moduleBase = 0` parameter to the parse function. In the instrument creation loop, after building each `FCConfig` instrument, attach `uadeChipRam`:

```typescript
// After reading header pointers (freqMacroPtr, volMacroPtr, etc. already computed):
const chipRam: UADEChipRamInfo = {
  moduleBase,
  moduleSize: buffer.byteLength,
  instrBase: moduleBase + instrOffset, // offset of this instrument's entry in file
  instrSize: instrEntrySize,
  sections: {
    freqMacros: moduleBase + freqMacroPtr,
    volMacros: moduleBase + volMacroPtr,
    waveData: moduleBase + wavePtr,
    sampleData: moduleBase + samplePtr,
    sampleDefs: moduleBase + sampleDefsOffset, // 0x28 or 0x28+80 for FC14
  },
};
instrument.uadeChipRam = chipRam;
```

Import `UADEChipRamInfo` from `@/types/instrument`.

**Step 2: Add FC to NATIVE_ROUTES in UADEParser.ts**

In `parseUADEFile()`, expand the `NATIVE_ROUTES` object. The new entries call the FC parser with `moduleBase = 0` (FC always loads at 0x000000):

```typescript
'FutureComposer1.3': async () => {
  const { parseFCFile } = await import('./FCParser');
  return parseFCFile(buffer, filename, 0); // moduleBase = 0
},
'FutureComposer1.4': async () => {
  const { parseFCFile } = await import('./FCParser');
  return parseFCFile(buffer, filename, 0);
},
'FutureComposer-BSI': async () => {
  const { parseFCFile } = await import('./FCParser');
  return parseFCFile(buffer, filename, 0);
},
```

**Step 3: Remove FC from SYNTHESIS_FORMATS**

In `parseUADEFile()`, find the `SYNTHESIS_FORMATS` set and remove `'fc3', 'sfc', 'bfc', 'bsi'` from it (these are now handled by native parser routing). Also remove the FC magic check below it that forces classic mode for FC13/FC14/SMOD — those are now caught by NATIVE_ROUTES first.

**Step 4: Type check**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**
```bash
git add src/lib/import/formats/UADEParser.ts src/lib/import/formats/FCParser.ts
git commit -m "feat(uade): wire Future Composer native parser + embed chip RAM addresses in instruments"
```

---

## Task 5: SoundMon — wire native parser + chip RAM info

**Files:**
- Modify: `src/lib/import/formats/SoundMonParser.ts`
- Modify: `src/lib/import/formats/UADEParser.ts`

**SoundMon chip RAM layout** (from SoundMonParser.ts analysis):
- Module base: 0x000000 (SoundMon eagleplayer loads at address 0)
- Magic at offset 26: `BPSM` (V1), `V.2` (V2), or `V.3` (V3)
- Instrument table: starts at offset 32, count = 15, entry size varies by version
- V2/V3 synth entry: `~25 bytes` (see parser for exact layout)
- Track data: follows instrument table at `32 + (15 * instrSize)`
- Pattern data: follows track data
- Synth tables (waveforms): 64 bytes each, follows pattern data
- PCM sample data: follows synth tables

**Step 1: Modify SoundMonParser.ts** — same pattern as Task 4.

Add optional `moduleBase = 0` parameter. Compute `instrBase = moduleBase + 32 + (instrIndex * instrEntrySize)`. Populate `uadeChipRam` on each instrument with:
```typescript
sections: {
  instrTable: moduleBase + 32,
  trackData: moduleBase + trackDataOffset,    // offset computed during parse
  patternData: moduleBase + patternDataOffset, // offset computed during parse
  synthTables: moduleBase + synthTablesOffset, // offset computed during parse
  sampleData: moduleBase + sampleDataOffset,   // offset computed during parse
}
```

**Step 2: Add to NATIVE_ROUTES**

```typescript
'SoundMon2.0': async () => {
  const { parseSoundMonFile } = await import('./SoundMonParser');
  return parseSoundMonFile(buffer, filename, 0);
},
'SoundMon2.2': async () => {
  const { parseSoundMonFile } = await import('./SoundMonParser');
  return parseSoundMonFile(buffer, filename, 0);
},
```

**Step 3: Remove from SYNTHESIS_FORMATS** — remove `'bp', 'bp3', 'sm', 'sm2', 'sm3', 'sm4'`.

**Step 4: Type check + commit**
```bash
npx tsc --noEmit 2>&1 | head -20
git add src/lib/import/formats/SoundMonParser.ts src/lib/import/formats/UADEParser.ts
git commit -m "feat(uade): wire SoundMon native parser + chip RAM addresses"
```

---

## Task 6: SidMon 1.0 — wire native parser + chip RAM info

**Files:**
- Modify: `src/lib/import/formats/SidMon1Parser.ts`
- Modify: `src/lib/import/formats/UADEParser.ts`

**SidMon 1 chip RAM layout:**
SidMon 1 is a compiled Amiga binary. The parser scans for `0x41fa` opcode and calculates `position` — this `position` is the chip RAM offset of the format's internal header. All section offsets are relative to `position`.

Key sections (all relative to `position` in chip RAM at `moduleBase`):
- Instruments: `moduleBase + position + instrBase` (from header at `position - 28`)
- Waveforms: `moduleBase + position + waveStart` (from header at `position - 24`)
- Pattern data: `moduleBase + position + patStart` (from header at `position - 12`)
- Track data: `moduleBase + position + trackBase` (from header at `position - 44`)

**Important:** SidMon 1 is likely NOT at address 0x000000 — it's a compiled Amiga executable that may load at 0x1000 or another address. The parser already calculates `position` from scanning the buffer. We need to find `moduleBase` by scanning chip RAM for the `0x41fa` + SID-MON string.

**Step 1: Modify SidMon1Parser.ts**

Add `moduleBase = 0` parameter. After the parser computes `position` (its internal offset), store it as `sections.position = moduleBase + position` in `uadeChipRam`.

For each instrument at `instrBase + (i-1)*32`, set:
```typescript
uadeChipRam = {
  moduleBase,
  moduleSize: buffer.byteLength,
  instrBase: moduleBase + instrBase + (i-1) * 32,
  instrSize: 32,
  sections: {
    position: moduleBase + position,
    waveData: moduleBase + position + waveStart,
    patternData: moduleBase + position + patStart,
    trackData: moduleBase + position + trackBase,
  }
}
```

**Step 2: Add to NATIVE_ROUTES**

SidMon 1 may not load at 0x000000. Use `engine.scanMemoryForMagic()` to find the real base. Do this in the NATIVE_ROUTES wrapper:

```typescript
'SIDMon1.0': async () => {
  const { parseSidMon1File } = await import('./SidMon1Parser');
  // SidMon1 is a compiled Amiga binary; scan chip RAM for the SID-MON string
  // to find where UADE loaded it. Fallback to 0 if not found.
  let moduleBase = 0;
  try {
    const sidMonMagic = new TextEncoder().encode(' SID-MON BY R');
    moduleBase = await engine.scanMemoryForMagic(sidMonMagic);
    if (moduleBase < 0) moduleBase = 0;
  } catch { /* older WASM, moduleBase stays 0 */ }
  return parseSidMon1File(buffer, filename, moduleBase);
},
```

**Step 3: Remove from SYNTHESIS_FORMATS** — remove `'sid'`.

**Step 4: Type check + commit**
```bash
npx tsc --noEmit 2>&1 | head -20
git add src/lib/import/formats/SidMon1Parser.ts src/lib/import/formats/UADEParser.ts
git commit -m "feat(uade): wire SidMon 1 native parser + chip RAM scanning for module base"
```

---

## Task 7: SidMon 2.0 — wire native parser + chip RAM info

**Files:**
- Modify: `src/lib/import/formats/SidMon2Parser.ts`
- Modify: `src/lib/import/formats/UADEParser.ts`

**SidMon 2 chip RAM layout:**
- Magic at file offset 58: `SIDMON II - THE MIDI VERSION`
- Module base: 0x000000 (SidMon 2 loads at address 0 via a plain loader stub)
- Instrument table: computed offset `instrOffset` found during parse (after track data)
- Each instrument: 32 bytes
- Wave table: immediately after instrument table, `waveDataLen` bytes
- Arpeggio table: after wave table, `arpeggioLen` bytes
- Vibrato table: after arpeggio, `vibratoLen` bytes
- Sample metadata: after vibrato table
- PCM data: after sample metadata

**Step 1: Modify SidMon2Parser.ts** — add `moduleBase = 0`, populate `uadeChipRam`:

```typescript
{
  moduleBase,
  moduleSize: buffer.byteLength,
  instrBase: moduleBase + instrOffset + (i * 32),
  instrSize: 32,
  sections: {
    instrTable: moduleBase + instrOffset,
    waveTable: moduleBase + waveTableOffset,   // instrOffset + numInstruments*32
    arpeggioTable: moduleBase + arpeggioOffset,
    vibratoTable: moduleBase + vibratoOffset,
    sampleData: moduleBase + sampleDataOffset,
  }
}
```

**Step 2: Add to NATIVE_ROUTES**

```typescript
'SIDMon2.0': async () => {
  const { parseSidMon2File } = await import('./SidMon2Parser');
  return parseSidMon2File(buffer, filename, 0);
},
```

**Step 3: Remove `'sid2'` from SYNTHESIS_FORMATS.**

**Step 4: Type check + commit**
```bash
npx tsc --noEmit 2>&1 | head -20
git add src/lib/import/formats/SidMon2Parser.ts src/lib/import/formats/UADEParser.ts
git commit -m "feat(uade): wire SidMon 2 native parser + chip RAM addresses"
```

---

## Task 8: Fred Editor — wire native parser + chip RAM info

**Files:**
- Modify: `src/lib/import/formats/FredEditorParser.ts`
- Modify: `src/lib/import/formats/UADEParser.ts`

**Fred Editor chip RAM layout:**
Fred is a compiled Amiga binary. The parser scans for specific 68k opcode patterns and derives two key pointers: `dataPtr` and `basePtr`. All data is relative to these.

- Sample definitions: 64 bytes each, at `dataPtr + 0x8a2 - sampleDataOffset` — use the offset already computed by parser
- Pattern data: at `basePtr + patternDataOffset`
- Track data: at `dataPtr + 0xb0e`

**Step 1: Modify FredEditorParser.ts** — add `moduleBase = 0` parameter. Expose `dataPtr` and `basePtr` as section addresses:

```typescript
uadeChipRam = {
  moduleBase,
  moduleSize: buffer.byteLength,
  instrBase: moduleBase + instrOffset + (i * 64),
  instrSize: 64,
  sections: {
    dataBase: moduleBase + dataPtr,
    fileBase: moduleBase + basePtr,
    sampleDefs: moduleBase + sampleDefsStart,
    patternData: moduleBase + patternDataStart,
    trackData: moduleBase + dataPtr + 0xb0e,
  }
}
```

**Step 2: Add to NATIVE_ROUTES**

Fred may or may not load at 0x000000. Use magic scanning:

```typescript
'Fred': async () => {
  const { parseFredEditorFile } = await import('./FredEditorParser');
  // Fred is a compiled Amiga binary; try to find the module in chip RAM
  // by scanning for the characteristic 0x4EFA 68k opcode sequence
  let moduleBase = 0;
  try {
    const fredMagic = new Uint8Array([0x4E, 0xFA, 0x00]); // BRA.W opcode start
    const found = await engine.scanMemoryForMagic(fredMagic, 256 * 1024);
    if (found >= 0) moduleBase = found;
  } catch { /* moduleBase stays 0 */ }
  return parseFredEditorFile(buffer, filename, moduleBase);
},
```

**Step 3: Remove `'fred'` from SYNTHESIS_FORMATS.**

**Step 4: Type check + commit**
```bash
npx tsc --noEmit 2>&1 | head -20
git add src/lib/import/formats/FredEditorParser.ts src/lib/import/formats/UADEParser.ts
git commit -m "feat(uade): wire Fred Editor native parser + chip RAM scanning"
```

---

## Task 9: Instrument parameter editor — Future Composer

**Files:**
- Create: `src/components/instruments/editors/UADEFCEditor.tsx`

This is the editing UI for Future Composer instruments. It reads parameters from chip RAM (via `UADEChipEditor`), displays them as knobs/sliders/waveform editors, and writes changes back immediately.

**Step 1: Create the component**

```tsx
/**
 * UADEFCEditor — editing UI for Future Composer synthesis instruments.
 *
 * Reads parameters from Amiga chip RAM (via UADEChipEditor) and writes
 * changes back immediately. UADE picks up the change on next note trigger.
 */
import React, { useEffect, useState, useCallback } from 'react';
import type { InstrumentConfig } from '@/types/instrument';
import { UADEChipEditor } from '@engine/uade/UADEChipEditor';
import { UADEEngine } from '@engine/uade/UADEEngine';

interface UADEFCEditorProps {
  instrument: InstrumentConfig;
}

export function UADEFCEditor({ instrument }: UADEFCEditorProps) {
  const chipRam = instrument.uadeChipRam;
  const [freqMacro, setFreqMacro] = useState<Uint8Array | null>(null);
  const [volMacro, setVolMacro] = useState<Uint8Array | null>(null);

  const editor = new UADEChipEditor(UADEEngine.getInstance());

  // Load macro data from chip RAM on mount
  useEffect(() => {
    if (!chipRam) return;
    const instrIndex = /* compute from instrBase */ 0;
    const freqAddr = chipRam.sections.freqMacros + instrIndex * 64;
    const volAddr  = chipRam.sections.volMacros  + instrIndex * 64;
    Promise.all([
      editor.readBytes(freqAddr, 64),
      editor.readBytes(volAddr,  64),
    ]).then(([freq, vol]) => {
      setFreqMacro(freq);
      setVolMacro(vol);
    }).catch(console.warn);
  }, [chipRam?.instrBase]);

  const handleFreqByteChange = useCallback(async (byteIndex: number, value: number) => {
    if (!chipRam || !freqMacro) return;
    const instrIndex = 0; // TODO: derive from chipRam.instrBase
    const addr = chipRam.sections.freqMacros + instrIndex * 64 + byteIndex;
    await editor.writeU8(addr, value);
    const updated = freqMacro.slice();
    updated[byteIndex] = value;
    setFreqMacro(updated);
  }, [chipRam, freqMacro]);

  if (!chipRam) {
    return <div className="text-xs text-muted">No chip RAM info — load via UADE to edit</div>;
  }

  return (
    <div className="uade-fc-editor p-2 space-y-2">
      <div className="text-xs font-medium text-muted uppercase tracking-wider">
        Future Composer — Chip RAM Editor
      </div>

      {/* Freq macro waveform display */}
      <div>
        <div className="text-xs mb-1">Freq Macro (64 bytes)</div>
        {freqMacro && (
          <div className="flex gap-px">
            {Array.from(freqMacro).map((byte, i) => (
              <input
                key={i}
                type="number"
                min={0} max={255}
                value={byte}
                className="w-6 h-6 text-xs text-center bg-surface border border-border"
                onChange={e => handleFreqByteChange(i, Number(e.target.value))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Vol macro display */}
      <div>
        <div className="text-xs mb-1">Vol Macro (64 bytes)</div>
        {volMacro && (
          <div className="flex gap-px">
            {Array.from(volMacro).map((byte, i) => (
              <span key={i} className="w-6 h-6 text-xs text-center inline-block">
                {byte}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Export button */}
      <button
        className="text-xs px-2 py-1 bg-accent text-accent-fg rounded"
        onClick={() => editor.exportModule(chipRam.moduleBase, chipRam.moduleSize, 'song.fc')}
      >
        Export .fc (Amiga)
      </button>
    </div>
  );
}
```

**Note:** This is a functional skeleton. The byte-grid display should be replaced with a proper waveform editor in a follow-up task. The instrIndex derivation from `chipRam.instrBase` needs to be completed based on `chipRam.sections.freqMacros` and the known macro stride (64 bytes).

**Step 2: Type check**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**
```bash
git add src/components/instruments/editors/UADEFCEditor.tsx
git commit -m "feat(uade): Future Composer chip RAM instrument editor with export"
```

---

## Task 10: Instrument parameter editors — SoundMon, SidMon, Fred

**Files:**
- Create: `src/components/instruments/editors/UADESoundMonEditor.tsx`
- Create: `src/components/instruments/editors/UADESidMon1Editor.tsx`
- Create: `src/components/instruments/editors/UADESidMon2Editor.tsx`
- Create: `src/components/instruments/editors/UADEFredEditor.tsx`

Each editor follows the same pattern as `UADEFCEditor` in Task 9. Specific fields per format:

**SoundMon editor fields** (all read/write via chip RAM at `instrBase + offset`):
- `+4`: adsrControl (u8) — synth control flags
- `+8`: adsrSpeed (u8) — ADSR envelope speed
- `+9`: lfoControl (u8) — LFO control flags
- `+11`: lfoDepth (u8) — LFO modulation depth
- `+14`: lfoDelay (u8) — LFO start delay
- `+16`: lfoSpeed (u8) — LFO rate
- `+25`: volume (u8) — instrument volume
- Waveform table bytes: `chipRam.sections.synthTables + (tableIndex * 64)`, 64 bytes

**SidMon 1 editor fields** (all at `instrBase + offset`, instrBase = `moduleBase + position + instrOffset`):
- `+4..+19`: arpeggio (16 × u8) — semitone arpeggio table
- `+20`: attackSpeed, `+21`: attackMax, `+22`: decaySpeed, `+23`: decayMin
- `+24`: sustain, `+26`: releaseSpeed, `+27`: releaseMin
- `+28`: phaseShift, `+29`: phaseSpeed, `+30`: finetune, `+31`: pitchFall (s8)
- Waveform: 32 bytes at `chipRam.sections.waveData + (waveIndex * 32)`

**SidMon 2 editor fields** (all at `instrBase + offset`):
- `+0`: waveIndex (u8, >> 4 to get index), `+2`: waveSpeed, `+3`: waveDelay
- `+4`: arpeggioIndex (u8, >> 4), `+6`: arpeggioSpeed, `+7`: arpeggioDelay
- `+8`: vibratoIndex (u8, >> 4), `+10`: vibratoSpeed, `+11`: vibratoDelay
- `+16`: attackMax, `+17`: attackSpeed, `+18`: decayMin, `+19`: decaySpeed
- `+20`: sustain, `+21`: releaseMin, `+22`: releaseSpeed

**Fred editor fields** (all at `instrBase + offset`):
- `+10`: vibratoDelay, `+12`: vibratoSpeed, `+13`: vibratoDepth
- `+14`: envelopeVol, `+15`: attackSpeed, `+16`: attackVol
- `+17`: decaySpeed, `+18`: decayVol, `+19`: sustainTime
- `+20`: releaseSpeed, `+21`: releaseVol
- `+22..+37`: arpeggio (16 × s8 signed bytes)
- `+40`: pulseRateNeg (s8), `+41`: pulseRatePos, `+42`: pulseSpeed
- `+43`: pulsePosL, `+44`: pulsePosH, `+45`: pulseDelay

Use the same pattern: `useEffect` to load current values from chip RAM, `onChange` to write back immediately. Each editor gets an export button.

**Step 1: Create each editor following the UADEFCEditor pattern.**

**Step 2: Type check**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**
```bash
git add src/components/instruments/editors/UADESoundMonEditor.tsx \
        src/components/instruments/editors/UADESidMon1Editor.tsx \
        src/components/instruments/editors/UADESidMon2Editor.tsx \
        src/components/instruments/editors/UADEFredEditor.tsx
git commit -m "feat(uade): chip RAM instrument editors for SoundMon, SidMon 1/2, Fred"
```

---

## Task 11: Wire editors into UnifiedInstrumentEditor

**Files:**
- Modify: `src/components/instruments/editors/UnifiedInstrumentEditor.tsx` (or wherever instrument editors are dispatched)

**Step 1: Find where instrument editors are dispatched**

Search for where `FCSynth` controls are loaded:
```bash
grep -r "FCSynth\|FCControls\|SoundMonControls" src/components/ --include="*.tsx" -l
```

**Step 2: Add lazy imports for the new UADE chip editors**

In the relevant file, add:

```typescript
const UADEFCEditor      = lazy(() => import('./UADEFCEditor').then(m => ({ default: m.UADEFCEditor })));
const UADESoundMonEditor = lazy(() => import('./UADESoundMonEditor').then(m => ({ default: m.UADESoundMonEditor })));
const UADESidMon1Editor  = lazy(() => import('./UADESidMon1Editor').then(m => ({ default: m.UADESidMon1Editor })));
const UADESidMon2Editor  = lazy(() => import('./UADESidMon2Editor').then(m => ({ default: m.UADESidMon2Editor })));
const UADEFredEditor     = lazy(() => import('./UADEFredEditor').then(m => ({ default: m.UADEFredEditor })));
```

**Step 3: Add cases to the synthType dispatch**

In the switch/if-else that decides which editor to show based on `instrument.synthType`:

```typescript
case 'FCSynth':
  return instrument.uadeChipRam
    ? <Suspense fallback={null}><UADEFCEditor instrument={instrument} /></Suspense>
    : <ExistingFCControls ... />;

case 'SoundMonSynth':
  return instrument.uadeChipRam
    ? <Suspense fallback={null}><UADESoundMonEditor instrument={instrument} /></Suspense>
    : <ExistingControls ... />;

case 'SidMon1Synth':
  return instrument.uadeChipRam
    ? <Suspense fallback={null}><UADESidMon1Editor instrument={instrument} /></Suspense>
    : null;

case 'SidMonSynth': // SidMon2
  return instrument.uadeChipRam
    ? <Suspense fallback={null}><UADESidMon2Editor instrument={instrument} /></Suspense>
    : null;

case 'FredSynth':
  return instrument.uadeChipRam
    ? <Suspense fallback={null}><UADEFredEditor instrument={instrument} /></Suspense>
    : null;
```

The `instrument.uadeChipRam` check ensures the chip RAM editor only appears when the instrument was loaded through UADE (not when manually creating an FC instrument from scratch).

**Step 4: Type check**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**
```bash
git add src/components/instruments/editors/UnifiedInstrumentEditor.tsx
git commit -m "feat(uade): wire UADE chip RAM editors into UnifiedInstrumentEditor"
```

---

## Task 12: Full type check and verification

**Step 1: Full type check**
```bash
npx tsc --noEmit 2>&1
```
Expected: zero errors.

**Step 2: Manual smoke test checklist**

Load each format in the browser and verify:
- [ ] FC file (`.fc`, `.fc3`, `.bsi`) — loads with correct pattern data + instruments in editor
- [ ] SoundMon file (`.bp`, `.bp3`) — loads with correct instruments
- [ ] SidMon 1 file (`.sid1`) — loads with correct instruments
- [ ] SidMon 2 file (`.sid2`) — loads with correct instruments
- [ ] Fred Editor file (`.fred`) — loads with correct instruments
- [ ] Each format shows the chip RAM editor panel (not the old synth controls)
- [ ] Changing a parameter byte → UADE song restarts → audible change
- [ ] Export button downloads a file of the correct size
- [ ] Downloaded file has the same magic bytes as the original

**Step 3: Final commit if any fixups were needed**
```bash
git add -p  # stage only relevant changes
git commit -m "fix(uade): chip RAM editor fixups from smoke testing"
```

---

## What comes next (not in this plan)

- **Phase 2:** TFMX parser completion — the TFMXSynth is implemented but TFMXParser.ts only extracts trackstep sequences. Full editability requires parsing the TFMX macro table and SMPL companion file.
- **Phase 3:** JochenHippel-CoSo, JochenHippel-7V wiring and chip RAM maps
- **Phase 4:** Rob Hubbard, David Whittaker, Delta Music, Ben Daglish, Mark Cooksey wiring
- **Phase 5:** Waveform mini-editor (draw directly on the 64-byte waveform tables)
- **Phase 6:** Pattern editor write-back — write note changes directly to chip RAM pattern data
