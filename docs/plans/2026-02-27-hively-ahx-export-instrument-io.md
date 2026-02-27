# HivelyTracker AHX Export + Instrument I/O Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add HVL/AHX song export to the toolbar, per-instrument `.ahi` file save/load, and an instrument picker dialog for importing from any `.hvl`/`.ahx` file.

**Architecture:** No new WASM. All logic is pure TypeScript. Extend `HivelyExporter.ts` with `exportAsAhi()`. Extend `HivelyParser.ts` with `parseAhiFile()` and `extractInstrumentsFromHvl()`. Wire buttons into `PixiHivelyView` toolbar and `InstrumentList`. Add a `HivelyImportDialog` React component.

**Tech Stack:** TypeScript, React, Vitest, existing HivelyExporter.ts / HivelyParser.ts patterns.

---

## Background: Bit-level formats (read this before touching binary code)

### .ahi format (= 4-byte magic + 22-byte instrument header + plist entries + null-terminated name)

Magic selection — scan all plist `fx` arrays:
- If every `fx` value is in `{0,1,2,3,4,5,12,15}` → write `"THXI"` (AHX compat, 4-byte plist entries)
- Any other `fx` value → write `"HVLI"` (HVL format, 5-byte plist entries)

**22-byte instrument header (bytes 4–25 in .ahi, same layout as in HVL/AHX song files):**
```
Byte  0: volume
Byte  1: ((filterSpeed & 0x1f) << 3) | (waveLength & 0x07)
Bytes 2-8: aFrames, aVolume, dFrames, dVolume, sFrames, rFrames, rVolume
Bytes 9-11: reserved (write 0)
Byte 12: (filterLowerLimit & 0x7f) | (((filterSpeed >> 5) & 1) << 7)
Byte 13: vibratoDelay
Byte 14: (hardCutRelease ? 0x80 : 0) | ((hardCutReleaseFrames & 0x07) << 4) | (vibratoDepth & 0x0f)
Byte 15: vibratoSpeed
Byte 16: squareLowerLimit
Byte 17: squareUpperLimit
Byte 18: squareSpeed
Byte 19: filterUpperLimit & 0x3f
Byte 20: plist speed
Byte 21: plist entry count
```

**Reconstruction (parse):**
```
filterSpeed = ((byte1 >> 3) & 0x1f) | ((byte12 >> 2) & 0x20)
filterLowerLimit = byte12 & 0x7f
```

**AHX plist entry (4 bytes) — same as in `parseAHX` lines 224–251 and `exportAsHively` lines 428–440:**
```
byte 0: (fx1Packed << 5) | (fx0Packed << 2) | (waveform >> 1) & 3
  where fx1Packed = fx[1] == 12 ? 6 : fx[1] == 15 ? 7 : fx[1]
  where fx0Packed = fx[0] == 12 ? 6 : fx[0] == 15 ? 7 : fx[0]
byte 1: ((waveform & 1) << 7) | ((fixed ? 1 : 0) << 6) | (note & 0x3f)
byte 2: fxParam[0]
byte 3: fxParam[1]
```

**Decode AHX plist:**
```
fx1 = (byte0 >> 5) & 7; if fx1 == 6 → 12, if fx1 == 7 → 15
fx0 = (byte0 >> 2) & 7; if fx0 == 6 → 12, if fx0 == 7 → 15
waveform = ((byte0 << 1) & 6) | (byte1 >> 7)
fixed = ((byte1 >> 6) & 1) !== 0
note = byte1 & 0x3f
```

**HVL plist entry (5 bytes) — same as `exportAsHively` lines 443–451:**
```
byte 0: fx[0] & 0x0f
byte 1: ((fx[1] & 0x0f) << 3) | (waveform & 0x07)
byte 2: ((fixed ? 1 : 0) << 6) | (note & 0x3f)
byte 3: fxParam[0]
byte 4: fxParam[1]
```

**Decode HVL plist:**
```
fx0 = byte0 & 0x0f
fx1 = (byte1 >> 3) & 0x0f
waveform = byte1 & 0x07
fixed = ((byte2 >> 6) & 1) !== 0
note = byte2 & 0x3f
```

---

## Task 1: `exportAsAhi` in HivelyExporter.ts + tests

**Files:**
- Modify: `src/lib/export/HivelyExporter.ts` (append after line 463)
- Create: `src/lib/export/__tests__/HivelyAhiExporter.test.ts`

**Step 1: Write the failing test**

Create `src/lib/export/__tests__/HivelyAhiExporter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { exportAsAhi } from '../HivelyExporter';
import type { HivelyConfig } from '../../../types/instrument';

const SIMPLE_CONFIG: HivelyConfig = {
  volume: 50,
  waveLength: 2,
  filterLowerLimit: 10,
  filterUpperLimit: 30,
  filterSpeed: 37,          // 6-bit value: 37 = 0b100101, tests both bit fields
  squareLowerLimit: 20,
  squareUpperLimit: 60,
  squareSpeed: 3,
  vibratoDelay: 4,
  vibratoSpeed: 8,
  vibratoDepth: 3,
  hardCutRelease: true,
  hardCutReleaseFrames: 2,
  envelope: { aFrames: 3, aVolume: 60, dFrames: 5, dVolume: 40, sFrames: 10, rFrames: 4, rVolume: 0 },
  performanceList: {
    speed: 2,
    entries: [
      { note: 0, waveform: 2, fixed: false, fx: [0, 0], fxParam: [0, 0] },
      { note: 12, waveform: 1, fixed: true, fx: [1, 3], fxParam: [0x10, 0x20] },
    ],
  },
};

describe('exportAsAhi', () => {
  it('writes THXI magic when all FX ≤ 5', () => {
    const bytes = exportAsAhi(SIMPLE_CONFIG, 'test');
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('THXI');
  });

  it('writes HVLI magic when FX > 5 present', () => {
    const cfg: HivelyConfig = {
      ...SIMPLE_CONFIG,
      performanceList: {
        speed: 1,
        entries: [{ note: 0, waveform: 0, fixed: false, fx: [8, 0], fxParam: [0, 0] }],
      },
    };
    const bytes = exportAsAhi(cfg, 'hvl');
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('HVLI');
  });

  it('encodes volume in byte 4', () => {
    const bytes = exportAsAhi(SIMPLE_CONFIG, 'x');
    expect(bytes[4]).toBe(50);
  });

  it('encodes filterSpeed low 5 bits in byte 5 bits 7-3', () => {
    const bytes = exportAsAhi(SIMPLE_CONFIG, 'x');
    // filterSpeed = 37 = 0b100101; low 5 bits = 0b00101 = 5
    expect((bytes[5] >> 3) & 0x1f).toBe(37 & 0x1f);
  });

  it('encodes filterSpeed bit 5 in byte 16 bit 7', () => {
    const bytes = exportAsAhi(SIMPLE_CONFIG, 'x');
    // filterSpeed = 37 = 0b100101; bit 5 = 1
    expect((bytes[16] >> 7) & 1).toBe((37 >> 5) & 1);
  });

  it('appends null-terminated name', () => {
    const bytes = exportAsAhi(SIMPLE_CONFIG, 'hello');
    // Find name after header (26 bytes) + plist entries (2 * 4 bytes for THXI)
    const nameStart = 26 + 2 * 4;
    expect(String.fromCharCode(...bytes.slice(nameStart, nameStart + 5))).toBe('hello');
    expect(bytes[nameStart + 5]).toBe(0);
  });

  it('uses 12→6 and 15→7 FX mapping in AHX plist', () => {
    const cfg: HivelyConfig = {
      ...SIMPLE_CONFIG,
      performanceList: {
        speed: 1,
        entries: [{ note: 0, waveform: 0, fixed: false, fx: [12, 15], fxParam: [0, 0] }],
      },
    };
    const bytes = exportAsAhi(cfg, 'x');
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('THXI');
    const plistByte0 = bytes[26];
    const fx1Packed = (plistByte0 >> 5) & 7;
    const fx0Packed = (plistByte0 >> 2) & 7;
    expect(fx0Packed).toBe(6); // 12 → 6
    expect(fx1Packed).toBe(7); // 15 → 7
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/lib/export/__tests__/HivelyAhiExporter.test.ts 2>&1
```

Expected: FAIL — `exportAsAhi is not a function` (or similar).

**Step 3: Implement `exportAsAhi`**

Append to `src/lib/export/HivelyExporter.ts` (after the last `}`):

```typescript
// ── Standalone Instrument (.ahi) Exporter ──────────────────────────────────

/**
 * Export a single HivelyTracker instrument as a binary .ahi file.
 *
 * Format: "THXI" (AHX-compatible, 4-byte plist entries) when all FX codes fit
 * in AHX range {0-5, 12, 15}. Otherwise "HVLI" (HVL format, 5-byte entries).
 *
 * Layout: 4-byte magic + 22-byte header + N plist entries + null-terminated name.
 */
export function exportAsAhi(config: HivelyConfig, name: string): Uint8Array {
  const plist = config.performanceList ?? { speed: 1, entries: [] };

  const isAHX = plist.entries.every(e =>
    e.fx.every(fx => fx <= 5 || fx === 12 || fx === 15)
  );

  const plistEntrySize = isAHX ? 4 : 5;
  const nameBytes = textEncoder.encode(name);
  const totalSize = 4 + 22 + plist.entries.length * plistEntrySize + nameBytes.length + 1;
  const buf = new Uint8Array(totalSize);
  let off = 0;

  // Magic
  const magic = isAHX ? 'THXI' : 'HVLI';
  for (let i = 0; i < 4; i++) buf[off++] = magic.charCodeAt(i);

  // 22-byte instrument header
  const filterSpeed = config.filterSpeed ?? 0;
  const env = config.envelope ?? { aFrames: 1, aVolume: 64, dFrames: 1, dVolume: 64, sFrames: 1, rFrames: 1, rVolume: 0 };

  buf[off++] = (config.volume ?? 64) & 0xff;
  buf[off++] = ((filterSpeed & 0x1f) << 3) | ((config.waveLength ?? 3) & 0x07);
  buf[off++] = env.aFrames & 0xff;
  buf[off++] = env.aVolume & 0xff;
  buf[off++] = env.dFrames & 0xff;
  buf[off++] = env.dVolume & 0xff;
  buf[off++] = env.sFrames & 0xff;
  buf[off++] = env.rFrames & 0xff;
  buf[off++] = env.rVolume & 0xff;
  buf[off++] = 0; buf[off++] = 0; buf[off++] = 0; // reserved
  buf[off++] = ((config.filterLowerLimit ?? 0) & 0x7f) | (((filterSpeed >> 5) & 1) << 7);
  buf[off++] = (config.vibratoDelay ?? 0) & 0xff;
  buf[off++] = ((config.hardCutRelease ? 1 : 0) << 7)
    | (((config.hardCutReleaseFrames ?? 0) & 0x07) << 4)
    | ((config.vibratoDepth ?? 0) & 0x0f);
  buf[off++] = (config.vibratoSpeed ?? 0) & 0xff;
  buf[off++] = (config.squareLowerLimit ?? 0) & 0xff;
  buf[off++] = (config.squareUpperLimit ?? 0) & 0xff;
  buf[off++] = (config.squareSpeed ?? 0) & 0xff;
  buf[off++] = (config.filterUpperLimit ?? 0) & 0x3f;
  buf[off++] = plist.speed & 0xff;
  buf[off++] = plist.entries.length & 0xff;

  // Plist entries
  for (const entry of plist.entries) {
    if (isAHX) {
      let fx1Packed = entry.fx[1] & 0x07;
      if (entry.fx[1] === 12) fx1Packed = 6;
      if (entry.fx[1] === 15) fx1Packed = 7;
      let fx0Packed = entry.fx[0] & 0x07;
      if (entry.fx[0] === 12) fx0Packed = 6;
      if (entry.fx[0] === 15) fx0Packed = 7;
      const waveHi = (entry.waveform >> 1) & 3;
      buf[off++] = (fx1Packed << 5) | (fx0Packed << 2) | waveHi;
      buf[off++] = ((entry.waveform & 1) << 7) | ((entry.fixed ? 1 : 0) << 6) | (entry.note & 0x3f);
      buf[off++] = entry.fxParam[0] & 0xff;
      buf[off++] = entry.fxParam[1] & 0xff;
    } else {
      buf[off++] = entry.fx[0] & 0x0f;
      buf[off++] = ((entry.fx[1] & 0x0f) << 3) | (entry.waveform & 0x07);
      buf[off++] = ((entry.fixed ? 1 : 0) << 6) | (entry.note & 0x3f);
      buf[off++] = entry.fxParam[0] & 0xff;
      buf[off++] = entry.fxParam[1] & 0xff;
    }
  }

  // Null-terminated name
  buf.set(nameBytes, off);
  buf[off + nameBytes.length] = 0;

  return buf;
}
```

**Step 4: Run tests**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/lib/export/__tests__/HivelyAhiExporter.test.ts 2>&1
```

Expected: All tests PASS.

**Step 5: TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: no output.

**Step 6: Commit**

```bash
git add src/lib/export/HivelyExporter.ts src/lib/export/__tests__/HivelyAhiExporter.test.ts
git commit -m "feat(hively): add exportAsAhi — standalone .ahi instrument file writer"
```

---

## Task 2: `parseAhiFile` in HivelyParser.ts + tests

**Files:**
- Modify: `src/lib/import/formats/HivelyParser.ts` (append before last line or after `parseHivelyFile`)
- Create: `src/lib/import/__tests__/HivelyAhiParser.test.ts`

**Step 1: Write the failing test**

Create `src/lib/import/__tests__/HivelyAhiParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { exportAsAhi } from '../../export/HivelyExporter';
import { parseAhiFile } from '../formats/HivelyParser';
import type { HivelyConfig } from '../../../types/instrument';

const FULL_CONFIG: HivelyConfig = {
  volume: 48,
  waveLength: 1,
  filterLowerLimit: 15,
  filterUpperLimit: 62,
  filterSpeed: 37,   // 0b100101 — tests both byte fields
  squareLowerLimit: 8,
  squareUpperLimit: 56,
  squareSpeed: 7,
  vibratoDelay: 12,
  vibratoSpeed: 16,
  vibratoDepth: 5,
  hardCutRelease: true,
  hardCutReleaseFrames: 3,
  envelope: { aFrames: 2, aVolume: 55, dFrames: 8, dVolume: 30, sFrames: 20, rFrames: 6, rVolume: 0 },
  performanceList: {
    speed: 3,
    entries: [
      { note: 0,  waveform: 2, fixed: false, fx: [0, 0], fxParam: [0, 0]    },
      { note: 24, waveform: 1, fixed: true,  fx: [1, 3], fxParam: [16, 32]  },
      { note: 0,  waveform: 0, fixed: false, fx: [12, 15], fxParam: [0, 0]  },
    ],
  },
};

describe('parseAhiFile — THXI round-trip', () => {
  it('parses back all scalar fields correctly', () => {
    const bytes = exportAsAhi(FULL_CONFIG, 'My Instrument');
    const { config, name } = parseAhiFile(bytes.buffer);

    expect(name).toBe('My Instrument');
    expect(config.volume).toBe(FULL_CONFIG.volume);
    expect(config.waveLength).toBe(FULL_CONFIG.waveLength);
    expect(config.filterSpeed).toBe(FULL_CONFIG.filterSpeed);
    expect(config.filterLowerLimit).toBe(FULL_CONFIG.filterLowerLimit);
    expect(config.filterUpperLimit).toBe(FULL_CONFIG.filterUpperLimit);
    expect(config.squareLowerLimit).toBe(FULL_CONFIG.squareLowerLimit);
    expect(config.squareUpperLimit).toBe(FULL_CONFIG.squareUpperLimit);
    expect(config.squareSpeed).toBe(FULL_CONFIG.squareSpeed);
    expect(config.vibratoDelay).toBe(FULL_CONFIG.vibratoDelay);
    expect(config.vibratoSpeed).toBe(FULL_CONFIG.vibratoSpeed);
    expect(config.vibratoDepth).toBe(FULL_CONFIG.vibratoDepth);
    expect(config.hardCutRelease).toBe(FULL_CONFIG.hardCutRelease);
    expect(config.hardCutReleaseFrames).toBe(FULL_CONFIG.hardCutReleaseFrames);
  });

  it('parses envelope correctly', () => {
    const { config } = parseAhiFile(exportAsAhi(FULL_CONFIG, 'x').buffer);
    expect(config.envelope).toEqual(FULL_CONFIG.envelope);
  });

  it('parses plist speed and entry count', () => {
    const { config } = parseAhiFile(exportAsAhi(FULL_CONFIG, 'x').buffer);
    expect(config.performanceList.speed).toBe(3);
    expect(config.performanceList.entries).toHaveLength(3);
  });

  it('decodes AHX fx mapping 12→6→12 and 15→7→15', () => {
    const { config } = parseAhiFile(exportAsAhi(FULL_CONFIG, 'x').buffer);
    const entry2 = config.performanceList.entries[2];
    expect(entry2.fx[0]).toBe(12);
    expect(entry2.fx[1]).toBe(15);
  });
});

describe('parseAhiFile — HVLI round-trip', () => {
  it('round-trips HVL-format instruments', () => {
    const cfg: HivelyConfig = {
      ...FULL_CONFIG,
      performanceList: {
        speed: 1,
        entries: [{ note: 5, waveform: 3, fixed: true, fx: [8, 0], fxParam: [0xAB, 0] }],
      },
    };
    const bytes = exportAsAhi(cfg, 'hvlinst');
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('HVLI');
    const { config, name } = parseAhiFile(bytes.buffer);
    expect(name).toBe('hvlinst');
    expect(config.performanceList.entries[0].fx[0]).toBe(8);
    expect(config.performanceList.entries[0].note).toBe(5);
    expect(config.performanceList.entries[0].fixed).toBe(true);
    expect(config.performanceList.entries[0].fxParam[0]).toBe(0xAB);
  });
});

describe('parseAhiFile — error cases', () => {
  it('throws on too-short buffer', () => {
    expect(() => parseAhiFile(new ArrayBuffer(10))).toThrow('too short');
  });

  it('throws on invalid magic', () => {
    const buf = new Uint8Array(30);
    expect(() => parseAhiFile(buf.buffer)).toThrow('Invalid .ahi magic');
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/lib/import/__tests__/HivelyAhiParser.test.ts 2>&1
```

Expected: FAIL — `parseAhiFile is not exported`.

**Step 3: Implement `parseAhiFile`**

Open `src/lib/import/formats/HivelyParser.ts`. Check the existing imports at the top — confirm that `HivelyConfig` and its nested types are already imported (they are used by `convertHivelyToTrackerSong`). If not, add: `import type { HivelyConfig } from '@typedefs/instrument';`

Append after `parseHivelyFile` (after line 729):

```typescript
/**
 * Parse a .ahi standalone instrument file (THXI = AHX format, HVLI = HVL format).
 * Returns the HivelyConfig and instrument name.
 */
export function parseAhiFile(buffer: ArrayBuffer): { config: HivelyConfig; name: string } {
  const buf = new Uint8Array(buffer);
  if (buf.length < 26) throw new Error('Invalid .ahi file: too short');

  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== 'THXI' && magic !== 'HVLI') {
    throw new Error(`Invalid .ahi magic: "${magic}"`);
  }
  const isAHX = magic === 'THXI';

  // Instrument header at bytes 4–25 (same bit layout as in HVL/AHX song files)
  const b = 4; // base offset
  const volume           = buf[b + 0];
  const filterSpeed      = ((buf[b + 1] >> 3) & 0x1f) | ((buf[b + 12] >> 2) & 0x20);
  const waveLength       = buf[b + 1] & 0x07;
  const envelope = {
    aFrames: buf[b + 2], aVolume: buf[b + 3],
    dFrames: buf[b + 4], dVolume: buf[b + 5],
    sFrames: buf[b + 6], rFrames: buf[b + 7], rVolume: buf[b + 8],
  };
  const filterLowerLimit      = buf[b + 12] & 0x7f;
  const vibratoDelay          = buf[b + 13];
  const hardCutRelease        = (buf[b + 14] & 0x80) !== 0;
  const hardCutReleaseFrames  = (buf[b + 14] >> 4) & 0x07;
  const vibratoDepth          = buf[b + 14] & 0x0f;
  const vibratoSpeed          = buf[b + 15];
  const squareLowerLimit      = buf[b + 16];
  const squareUpperLimit      = buf[b + 17];
  const squareSpeed           = buf[b + 18];
  const filterUpperLimit      = buf[b + 19] & 0x3f;
  const plistSpeed            = buf[b + 20];
  const plistLength           = buf[b + 21];

  let off = 26; // after 4-byte magic + 22-byte header
  const plistEntrySize = isAHX ? 4 : 5;

  if (buf.length < off + plistLength * plistEntrySize) {
    throw new Error('Invalid .ahi file: truncated plist data');
  }

  const entries: HivelyConfig['performanceList']['entries'] = [];
  for (let j = 0; j < plistLength; j++) {
    if (isAHX) {
      let fx1 = (buf[off] >> 5) & 7;
      if (fx1 === 6) fx1 = 12;
      if (fx1 === 7) fx1 = 15;
      let fx0 = (buf[off] >> 2) & 7;
      if (fx0 === 6) fx0 = 12;
      if (fx0 === 7) fx0 = 15;
      const waveform = ((buf[off] << 1) & 6) | (buf[off + 1] >> 7);
      const fixed = ((buf[off + 1] >> 6) & 1) !== 0;
      const note = buf[off + 1] & 0x3f;
      entries.push({ note, waveform, fixed, fx: [fx0, fx1], fxParam: [buf[off + 2], buf[off + 3]] });
      off += 4;
    } else {
      const fx0 = buf[off] & 0x0f;
      const fx1 = (buf[off + 1] >> 3) & 0x0f;
      const waveform = buf[off + 1] & 0x07;
      const fixed = ((buf[off + 2] >> 6) & 1) !== 0;
      const note = buf[off + 2] & 0x3f;
      entries.push({ note, waveform, fixed, fx: [fx0, fx1], fxParam: [buf[off + 3], buf[off + 4]] });
      off += 5;
    }
  }

  // Null-terminated name at end
  let nameEnd = off;
  while (nameEnd < buf.length && buf[nameEnd] !== 0) nameEnd++;
  const name = new TextDecoder().decode(buf.slice(off, nameEnd));

  return {
    name,
    config: {
      volume, waveLength, filterSpeed,
      filterLowerLimit, filterUpperLimit,
      squareLowerLimit, squareUpperLimit, squareSpeed,
      vibratoDelay, vibratoSpeed, vibratoDepth,
      hardCutRelease, hardCutReleaseFrames,
      envelope,
      performanceList: { speed: plistSpeed, entries },
    },
  };
}
```

**Step 4: Run tests**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/lib/import/__tests__/HivelyAhiParser.test.ts 2>&1
```

Expected: All PASS.

**Step 5: TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: no output.

**Step 6: Commit**

```bash
git add src/lib/import/formats/HivelyParser.ts src/lib/import/__tests__/HivelyAhiParser.test.ts
git commit -m "feat(hively): add parseAhiFile — .ahi instrument file parser with round-trip tests"
```

---

## Task 3: `extractInstrumentsFromHvl` in HivelyParser.ts + tests

**Files:**
- Modify: `src/lib/import/formats/HivelyParser.ts` (append after `parseAhiFile`)
- Create: `src/lib/import/__tests__/HivelyExtractInstruments.test.ts`

**Step 1: Write the failing test**

The reference HVL file is at: `Reference Music/HivelyTracker/`. Find any `.hvl` file. The test will use the first one found.

Create `src/lib/import/__tests__/HivelyExtractInstruments.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { extractInstrumentsFromHvl } from '../formats/HivelyParser';

const HVL_DIR = resolve(import.meta.dirname, '../../../../Reference Music/HivelyTracker');

function firstHvlFile(): string {
  const files = readdirSync(HVL_DIR).filter(f => /\.(hvl|ahx)$/i.test(f));
  if (!files.length) throw new Error(`No HVL/AHX files found in ${HVL_DIR}`);
  return resolve(HVL_DIR, files[0]);
}

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('extractInstrumentsFromHvl', () => {
  it('returns non-empty instrument array from a real HVL file', () => {
    const buf = loadBuf(firstHvlFile());
    const instruments = extractInstrumentsFromHvl(buf);
    expect(instruments.length).toBeGreaterThan(0);
  });

  it('each entry has a config with envelope and performanceList', () => {
    const buf = loadBuf(firstHvlFile());
    const instruments = extractInstrumentsFromHvl(buf);
    for (const { config } of instruments) {
      expect(config.envelope).toBeDefined();
      expect(config.performanceList).toBeDefined();
      expect(Array.isArray(config.performanceList.entries)).toBe(true);
    }
  });

  it('name is a string (may be empty)', () => {
    const buf = loadBuf(firstHvlFile());
    const instruments = extractInstrumentsFromHvl(buf);
    for (const { name } of instruments) {
      expect(typeof name).toBe('string');
    }
  });

  it('throws on garbage buffer', () => {
    expect(() => extractInstrumentsFromHvl(new ArrayBuffer(20))).toThrow();
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/lib/import/__tests__/HivelyExtractInstruments.test.ts 2>&1
```

Expected: FAIL — `extractInstrumentsFromHvl is not a function`.

**Step 3: Implement `extractInstrumentsFromHvl`**

Append after `parseAhiFile` in `src/lib/import/formats/HivelyParser.ts`:

```typescript
/**
 * Extract all instruments from a .hvl or .ahx file as HivelyConfig objects.
 * Useful for the "import instruments from another song" dialog.
 */
export function extractInstrumentsFromHvl(
  buffer: ArrayBuffer
): Array<{ name: string; config: HivelyConfig }> {
  const mod = parseHivelyBinary(buffer);
  return mod.instruments.map(ins => ({
    name: ins.name,
    config: {
      volume: ins.volume,
      waveLength: ins.waveLength,
      filterLowerLimit: ins.filterLowerLimit,
      filterUpperLimit: ins.filterUpperLimit,
      filterSpeed: ins.filterSpeed,
      squareLowerLimit: ins.squareLowerLimit,
      squareUpperLimit: ins.squareUpperLimit,
      squareSpeed: ins.squareSpeed,
      vibratoDelay: ins.vibratoDelay,
      vibratoSpeed: ins.vibratoSpeed,
      vibratoDepth: ins.vibratoDepth,
      hardCutRelease: ins.hardCutRelease,
      hardCutReleaseFrames: ins.hardCutReleaseFrames,
      envelope: { ...ins.envelope },
      performanceList: {
        speed: ins.performanceList.speed,
        entries: ins.performanceList.entries.map(e => ({
          note: e.note,
          waveform: e.waveform,
          fixed: e.fixed,
          fx: [...e.fx] as [number, number],
          fxParam: [...e.fxParam] as [number, number],
        })),
      },
    },
  }));
}
```

**Step 4: Run tests**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/lib/import/__tests__/HivelyExtractInstruments.test.ts 2>&1
```

Expected: All PASS. If the test can't find HVL files, update the path in the test to match an actual HVL file in the repo.

**Step 5: TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

**Step 6: Commit**

```bash
git add src/lib/import/formats/HivelyParser.ts src/lib/import/__tests__/HivelyExtractInstruments.test.ts
git commit -m "feat(hively): add extractInstrumentsFromHvl for import dialog"
```

---

## Task 4: Song export buttons in `PixiHivelyView` toolbar

**Files:**
- Modify: `src/pixi/views/hively/PixiHivelyView.tsx`

No tests for this task (pure UI wiring). Verify manually.

**Step 1: Add the download helper and toolbar buttons**

Open `src/pixi/views/hively/PixiHivelyView.tsx`.

First, check what `useTrackerStore` exposes for the full song. Look in `src/stores/useTrackerStore.ts` for a property that holds the `TrackerSong` (likely called `song`, `currentSong`, or accessible via `getSong()`).

Add the import at the top of the file:

```typescript
import { exportAsHively } from '@lib/export/HivelyExporter';
```

Add the download helper and the song selector inside the component (after the existing `useTrackerStore` calls):

```typescript
// Get the full song for export — check your store for the exact selector name
const song = useTrackerStore(s => s.song); // adjust property name if needed

const handleExport = useCallback((format: 'hvl' | 'ahx') => {
  if (!song) return;
  const result = exportAsHively(song, { format });
  const url = URL.createObjectURL(result.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (result.warnings.length > 0) {
    console.warn('[HivelyExport]', result.warnings.join('; '));
  }
}, [song]);
```

Then in the toolbar JSX (after the `[TRK]` toggle, before the closing `</div>`), add two export buttons using inline style to match the existing toolbar aesthetic:

```tsx
<span style={{ color: '#555' }}>|</span>
<button
  onClick={() => handleExport('hvl')}
  disabled={!song}
  style={{
    background: 'none',
    border: '1px solid #444',
    color: '#88ff88',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    padding: '1px 6px',
    cursor: song ? 'pointer' : 'default',
    opacity: song ? 1 : 0.4,
  }}
  title="Export as HVL"
>
  HVL↓
</button>
<button
  onClick={() => handleExport('ahx')}
  disabled={!song}
  style={{
    background: 'none',
    border: '1px solid #444',
    color: '#88ff88',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    padding: '1px 6px',
    cursor: song ? 'pointer' : 'default',
    opacity: song ? 1 : 0.4,
  }}
  title="Export as AHX (4 channels max)"
>
  AHX↓
</button>
```

**Step 2: TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

If there are type errors on `s.song`, open `src/stores/useTrackerStore.ts` and find the correct property name for the TrackerSong. Common alternatives: `s.currentSong`, `s.trackerSong`, `s.module`.

**Step 3: Commit**

```bash
git add src/pixi/views/hively/PixiHivelyView.tsx
git commit -m "feat(hively): add HVL/AHX export buttons to toolbar"
```

---

## Task 5: Per-instrument save/load `.ahi` in `InstrumentList`

**Files:**
- Modify: `src/components/instruments/InstrumentList.tsx`

**Step 1: Add imports**

At the top of `InstrumentList.tsx`, add to the existing lucide-react import:

```typescript
import { Plus, Trash2, Copy, Repeat, Repeat1, FolderOpen, Pencil, Package, ExternalLink, Download, Upload } from 'lucide-react';
```

Also add static imports for the AHI functions:

```typescript
import { exportAsAhi } from '@lib/export/HivelyExporter';
import { parseAhiFile } from '@lib/import/formats/HivelyParser';
```

**Step 2: Add the handlers inside the component**

Inside `InstrumentList` (after `handleDragStart`, before the `return`):

```typescript
const handleSaveAhi = useCallback((e: React.MouseEvent, inst: InstrumentConfig) => {
  e.stopPropagation();
  if (!inst.hively) return;
  const bytes = exportAsAhi(inst.hively, inst.name);
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${inst.name.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'instrument'}.ahi`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}, []);

const handleLoadAhi = useCallback((e: React.MouseEvent, id: number) => {
  e.stopPropagation();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ahi';
  input.onchange = async (ev: Event) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const { config, name } = parseAhiFile(buffer);
      updateInstrument(id, { hively: config, name });
    } catch (err) {
      console.error('[AhiLoad] Failed to parse .ahi:', err);
    }
  };
  input.click();
}, [updateInstrument]);
```

**Step 3: Add buttons to the FT2 variant instrument row**

Find the FT2 actions block (around line 380–405):

```tsx
{showActions && (
  <div className={`instrument-action-buttons flex gap-0.5 ...`}>
    <button onClick={(e) => handlePopOut(e, instrument.id)} ...>
      <ExternalLink size={10} />
    </button>
    <button onClick={(e) => handleClone(e, instrument.id)} ...>
      <Copy size={10} />
    </button>
    ...
  </div>
)}
```

Add the HVL-specific buttons BEFORE `<Trash2>` in that same group:

```tsx
{instrument.synthType === 'HivelySynth' && (
  <>
    <button
      onClick={(e) => handleSaveAhi(e, instrument)}
      className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20' : 'hover:bg-ft2-border'} text-yellow-400`}
      title="Save as .ahi instrument file"
    >
      <Download size={10} />
    </button>
    <button
      onClick={(e) => handleLoadAhi(e, instrument.id)}
      className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20' : 'hover:bg-ft2-border'} text-yellow-400`}
      title="Load .ahi instrument file"
    >
      <Upload size={10} />
    </button>
  </>
)}
```

**Step 4: TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

**Step 5: Commit**

```bash
git add src/components/instruments/InstrumentList.tsx
git commit -m "feat(hively): add per-instrument .ahi save/load buttons in InstrumentList"
```

---

## Task 6: `HivelyImportDialog` + wire into `InstrumentList`

**Files:**
- Create: `src/components/instruments/HivelyImportDialog.tsx`
- Modify: `src/components/instruments/InstrumentList.tsx`

**Step 1: Create the dialog component**

Create `src/components/instruments/HivelyImportDialog.tsx`:

```typescript
/**
 * HivelyImportDialog — Pick instruments from a .hvl or .ahx file and import
 * them into the current song starting at the target slot.
 */
import React, { useState } from 'react';
import type { HivelyConfig } from '@typedefs/instrument';
import { extractInstrumentsFromHvl } from '@lib/import/formats/HivelyParser';

interface HivelyImportEntry {
  name: string;
  config: HivelyConfig;
  selected: boolean;
}

interface HivelyImportDialogProps {
  onClose: () => void;
  /** Called with the selected instruments in order; caller inserts them. */
  onImport: (instruments: Array<{ name: string; config: HivelyConfig }>) => void;
}

export const HivelyImportDialog: React.FC<HivelyImportDialogProps> = ({ onClose, onImport }) => {
  const [entries, setEntries] = useState<HivelyImportEntry[]>([]);
  const [filename, setFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const found = extractInstrumentsFromHvl(buffer);
      setEntries(found.map(i => ({ ...i, selected: false })));
      setError(null);
    } catch (err) {
      setEntries([]);
      setError(`Could not read file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const toggleAll = (selected: boolean) => {
    setEntries(prev => prev.map(e => ({ ...e, selected })));
  };

  const handleConfirm = () => {
    const selected = entries.filter(e => e.selected).map(({ name, config }) => ({ name, config }));
    if (selected.length > 0) onImport(selected);
    onClose();
  };

  const selectedCount = entries.filter(e => e.selected).length;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-ft2-bg border border-ft2-border p-4 rounded min-w-[340px] max-w-[500px] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-ft2-highlight font-mono font-bold text-sm mb-3">
          Import Instruments from HVL / AHX
        </h2>

        <input
          type="file"
          accept=".hvl,.ahx"
          onChange={handleFile}
          className="block w-full mb-3 text-ft2-text text-xs font-mono cursor-pointer"
        />

        {filename && !error && (
          <p className="text-ft2-textDim text-xs font-mono mb-2">{filename}</p>
        )}

        {error && (
          <p className="text-red-400 text-xs font-mono mb-2">{error}</p>
        )}

        {entries.length > 0 && (
          <>
            <div className="flex gap-2 mb-1">
              <button
                onClick={() => toggleAll(true)}
                className="text-xs text-ft2-highlight underline"
              >all</button>
              <button
                onClick={() => toggleAll(false)}
                className="text-xs text-ft2-highlight underline"
              >none</button>
            </div>
            <div className="max-h-52 overflow-y-auto border border-ft2-border divide-y divide-ft2-border mb-3">
              {entries.map((entry, idx) => (
                <label
                  key={idx}
                  className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-ft2-header select-none"
                >
                  <input
                    type="checkbox"
                    checked={entry.selected}
                    onChange={() =>
                      setEntries(prev =>
                        prev.map((x, i) => i === idx ? { ...x, selected: !x.selected } : x)
                      )
                    }
                    className="accent-ft2-highlight"
                  />
                  <span className="text-xs font-mono text-ft2-textDim w-5 shrink-0">
                    {(idx + 1).toString().padStart(2, '0')}
                  </span>
                  <span className="text-xs font-mono text-ft2-text truncate">
                    {entry.name || '(unnamed)'}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs font-mono text-ft2-text border border-ft2-border hover:border-ft2-highlight transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="px-3 py-1 text-xs font-mono bg-ft2-highlight text-ft2-bg disabled:opacity-40 disabled:cursor-default"
          >
            Import {selectedCount > 0 ? `(${selectedCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
```

**Step 2: Wire `HivelyImportDialog` into `InstrumentList`**

Open `src/components/instruments/InstrumentList.tsx`.

Add the import:

```typescript
import { HivelyImportDialog } from './HivelyImportDialog';
```

Add a prop to enable the Hively import action:

```typescript
interface InstrumentListProps {
  // ... existing props ...
  /** Show "Import from HVL/AHX" button (only when a Hively song is loaded) */
  showHivelyImport?: boolean;
}
```

Add state for the dialog inside the component:

```typescript
const [showHivelyImportDialog, setShowHivelyImportDialog] = useState(false);
```

Add an import handler that inserts instruments starting at the currently selected slot:

```typescript
const handleHivelyImport = useCallback(
  (toImport: Array<{ name: string; config: HivelyConfig }>) => {
    for (const { name, config: hively } of toImport) {
      createInstrument({ name, synthType: 'HivelySynth', hively });
    }
  },
  [createInstrument]
);
```

> Note: check `createInstrument` signature in `useInstrumentStore` — it may take a partial `InstrumentConfig`. Adjust the call to match the actual API.

In the FT2 action bar (the `showActionBar` block, around lines 263–305), add an "HVL" button when `showHivelyImport` is true:

```tsx
{showHivelyImport && (
  <button
    onClick={() => setShowHivelyImportDialog(true)}
    className="flex flex-col items-center gap-0.5 px-1 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight transition-colors text-ft2-text"
    title="Import instruments from HVL/AHX file"
  >
    <Upload size={14} />
    <span className="text-[8px] font-bold">HVL</span>
  </button>
)}
```

At the bottom of the component return (just before the final closing `</div>`), render the dialog:

```tsx
{showHivelyImportDialog && (
  <HivelyImportDialog
    onClose={() => setShowHivelyImportDialog(false)}
    onImport={handleHivelyImport}
  />
)}
```

**Step 3: Pass `showHivelyImport` where InstrumentList is used for HivelyTracker**

Find where `InstrumentList` is rendered in the HivelyTracker context (likely in `TrackerView.tsx` or the HivelyTracker-specific panel). Add `showHivelyImport={song?.format === 'HVL' || song?.format === 'AHX'}`.

If you can't find the right location, search with:
```bash
grep -rn "InstrumentList" src/ --include="*.tsx"
```

**Step 4: TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Fix any type errors. Common issues:
- `createInstrument` signature mismatch — check the store's actual API
- `HivelyConfig` import missing in InstrumentList — add `import type { HivelyConfig } from '@typedefs/instrument'`

**Step 5: Run all Hively-related tests**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/lib/export/__tests__/HivelyAhiExporter.test.ts src/lib/import/__tests__/HivelyAhiParser.test.ts src/lib/import/__tests__/HivelyExtractInstruments.test.ts 2>&1
```

Expected: All pass.

**Step 6: Commit**

```bash
git add src/components/instruments/HivelyImportDialog.tsx src/components/instruments/InstrumentList.tsx
git commit -m "feat(hively): add HivelyImportDialog and wire showHivelyImport into InstrumentList"
```

---

## Manual Verification Checklist

After all tasks are complete, verify in the browser:

**Song export:**
- [ ] Load a `.hvl` file → HivelyTracker view appears
- [ ] Click `HVL↓` → file downloads with correct `.hvl` extension
- [ ] Click `AHX↓` → file downloads with correct `.ahx` extension
- [ ] Reopen the downloaded HVL in DEViLBOX → song plays correctly

**Instrument save (.ahi):**
- [ ] With a HivelyTracker song loaded, hover over an instrument in the list
- [ ] Click the Download (yellow) icon → `<name>.ahi` downloads
- [ ] File is valid binary starting with `THXI` or `HVLI` (check with hex editor or by loading it back)

**Instrument load (.ahi):**
- [ ] Click the Upload (yellow) icon on any instrument row
- [ ] Pick the `.ahi` file just saved → instrument name and config updates
- [ ] Play the instrument → sounds the same as before save/load

**Import from HVL/AHX:**
- [ ] The "HVL" button appears in the InstrumentList action bar when a Hively song is loaded
- [ ] Click it → dialog opens
- [ ] Pick a `.hvl` file → instrument list appears with correct names
- [ ] Select some instruments → click Import → they appear in the instrument list
- [ ] Play imported instruments → sound matches original song
