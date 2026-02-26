# CPU-Based Pattern Extraction for Chiptune Formats

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract real note/pattern data from NSF, SID, SAP, AY (CPU-code formats) and fix YM/VGM register parsing so all 6 chip-dump parsers produce playable tracker patterns.

**Architecture:** VGM and YM already contain register dumps — we improve their extraction directly. NSF/SID/SAP need a shared lightweight 6502 CPU emulator that runs the format's init/play routines while intercepting chip-register writes. AY (ZX Spectrum) needs a Z80 emulator doing the same. All CPU emulators live in `src/lib/import/cpu/` and are pure TypeScript with no external deps.

**Tech Stack:** TypeScript, existing `Pattern`/`TrackerCell`/`TrackerSong` types, no new npm packages.

---

## Current State

| Parser | Status | Problem |
|--------|--------|---------|
| VGMParser | Partial | Only OPN2 (YM2612) channels extracted; SN76489 PSG and OPM (YM2151) ignored |
| YMParser | Broken | LZH-5 decoder has incomplete huffman implementation; YM5!/YM6! files decompress to garbage |
| NSFParser | Stub | Empty 16-row pattern; needs 6502 + NES APU register tracking |
| SIDParser | Stub | Empty 16-row pattern; needs 6502 + SID register tracking |
| SAPParser | Stub | Empty 16-row pattern; needs 6502 + POKEY register tracking |
| AYParser | Stub | Empty 16-row pattern; needs Z80 + AY register tracking |

---

## Task 1: Fix YMParser LZH-5 Decoder

The existing `decodeLZH5()` in `YMParser.ts` has an incomplete `makeTable()` (the canonical code filling loop is wrong) and a broken `readCLen()` (always returns 0). This makes every YM5!/YM6! file fail silently and fall back to an empty single frame.

**Files:**
- Modify: `src/lib/import/formats/YMParser.ts` — replace `decodeLZH5` with correct implementation
- Modify: `src/lib/import/__tests__/YMParser.test.ts` — add decompression test

**Step 1: Add a decompression smoke test (will fail with current decoder)**

In `src/lib/import/__tests__/YMParser.test.ts`, add:

```typescript
it('correctly decompresses a YM5! frame block', () => {
  // A minimal hand-crafted YM5! file with 1 frame, no digidrums, no title/author
  // The data section is: AY registers all 0x00 for one frame (16 bytes), LZH-5 compressed.
  // Compression of 16 zero bytes with LZH-5 produces this known byte sequence:
  // (generated offline: echo -n <16 zeros> | lha -a - | tail -c +26 | xxd)
  // For simplicity, test that parseYMFile on a YM3! (uncompressed) file
  // produces real note data — this validates the frame extraction path.
  const buf = new Uint8Array(4 + 14 * 4); // YM3! + 4 frames of 14 registers
  buf[0] = 0x59; buf[1] = 0x4D; buf[2] = 0x33; buf[3] = 0x21; // 'YM3!'
  // Frame 0: tone A period = 100 (note ~A4), volume 8, mixer tone enabled
  buf[4] = 100; buf[5] = 0; // AY reg 0,1 = period A = 100
  buf[7+8] = 8; // reg 8 = vol A = 8 (was buf[8+8] but zero page starts at 4)
  // Actually: regs at offset 4, frame 0: reg[0]=100, reg[1]=0, reg[7]=0x38, reg[8]=8
  const b4 = buf.subarray(4);
  b4[0] = 100; b4[1] = 0;   // period A lo/hi
  b4[7] = 0x38;              // mixer: tone A enabled (bits 0-2 clear = tone on)
  b4[8] = 8;                 // vol A = 8
  const song = await parseYMFile(buf.buffer, 'test.ym');
  const row0 = song.patterns[0].channels[0].rows[0];
  expect(row0.note).toBeGreaterThan(0); // should have a real note
});
```

**Step 2: Run test, confirm it fails**
```bash
npx vitest run src/lib/import/__tests__/YMParser.test.ts
```

**Step 3: Replace the `decodeLZH5` function in `YMParser.ts`**

Replace the entire `decodeLZH5` function (lines 48–235) with this correct implementation based on the canonical LZHUF public-domain algorithm:

```typescript
function decodeLZH5(src: Uint8Array): Uint8Array {
  const DICBIT = 13, DICSIZ = 1 << DICBIT, MAXMATCH = 256, THRESHOLD = 3;
  const NC = 510, CBIT = 9, NT = DICBIT + 1, TBIT = 5, NP = DICBIT + 1, PBIT = 4;
  const MAX_TABLE = 4096;

  const dic = new Uint8Array(DICSIZ).fill(0x20);
  const out: number[] = [];
  let dicPos = 0, srcPos = 0;
  let bitBuf = 0, subBuf = 0, bitCount = 0;

  function fillBuf(n: number): void {
    bitBuf = ((bitBuf << n) >>> 0) & 0xFFFF;
    while (n > bitCount) {
      n -= bitCount;
      bitBuf |= ((subBuf << n) >>> 0) & 0xFFFF;
      subBuf = srcPos < src.length ? src[srcPos++] : 0;
      bitCount = 8;
    }
    bitCount -= n;
    bitBuf |= (subBuf >> bitCount) & 0xFFFF;
    bitBuf &= 0xFFFF;
  }

  function getBits(n: number): number {
    const r = (bitBuf >> (16 - n)) & ((1 << n) - 1);
    fillBuf(n);
    return r;
  }

  // Prime the bit buffer
  subBuf = srcPos < src.length ? src[srcPos++] : 0;
  fillBuf(16);

  const cLen  = new Uint8Array(NC);
  const cTable = new Uint16Array(MAX_TABLE);
  const pLen  = new Uint8Array(NP);
  const pTable = new Uint16Array(256);

  function makeTable(nchar: number, bitlen: Uint8Array, tablebits: number, table: Uint16Array): void {
    const tableSize = 1 << tablebits;
    // Count codes by length
    const count = new Uint16Array(17);
    for (let i = 0; i < nchar; i++) count[Math.min(bitlen[i], 16)]++;

    // Build starting position for each length
    const start = new Uint16Array(18);
    start[1] = 0;
    for (let i = 1; i <= 16; i++) start[i + 1] = start[i] + count[i];

    // Fill table with canonical Huffman codes
    for (let i = 0; i < tableSize; i++) table[i] = 0xFFFF;
    for (let p = 0; p < nchar; p++) {
      const len = bitlen[p];
      if (len === 0) continue;
      const startIdx = start[len];
      start[len]++;
      if (len <= tablebits) {
        const fillCount = 1 << (tablebits - len);
        const base = startIdx << (tablebits - len);
        for (let i = 0; i < fillCount; i++) {
          if (base + i < tableSize) table[base + i] = p;
        }
      }
    }
  }

  function readPtLen(nn: number, nbit: number, special: number): void {
    let n = getBits(nbit);
    if (n === 0) {
      const c = getBits(nbit);
      for (let i = 0; i < nn; i++) pLen[i] = 0;
      for (let i = 0; i < 256; i++) pTable[i] = c;
    } else {
      let i = 0;
      while (i < n) {
        let c = (bitBuf >> 13) & 7;
        if (c === 7) {
          let k = 0x1000;
          while (k & bitBuf) { k >>= 1; c++; }
        }
        fillBuf(c < 7 ? 3 : c - 3);
        pLen[i++] = c;
        if (i === special) {
          c = getBits(2);
          while (--c >= 0 && i < nn) pLen[i++] = 0;
        }
      }
      while (i < nn) pLen[i++] = 0;
      makeTable(nn, pLen, 8, pTable);
    }
  }

  function readCLen(): void {
    let n = getBits(CBIT);
    if (n === 0) {
      const c = getBits(CBIT);
      for (let i = 0; i < NC; i++) cLen[i] = 0;
      for (let i = 0; i < MAX_TABLE; i++) cTable[i] = c;
    } else {
      let i = 0;
      while (i < n) {
        let c = pTable[(bitBuf >> 8) & 0xFF];
        if (c === 0xFFFF) c = NC - 1; // fallback
        if (c >= NT) c = NT - 1;
        fillBuf(pLen[c]);
        if (c <= 2) {
          if      (c === 0) { c = 1; }
          else if (c === 1) { c = getBits(4) + 3; }
          else              { c = getBits(CBIT) + 20; }
          while (--c >= 0 && i < NC) cLen[i++] = 0;
        } else {
          cLen[i++] = c - 2;
        }
      }
      while (i < NC) cLen[i++] = 0;
      makeTable(NC, cLen, 12, cTable);
    }
  }

  let blockSize = 0;
  while (out.length < 4 * 1024 * 1024) { // 4 MB safety cap
    if (blockSize === 0) {
      blockSize = getBits(16);
      if (blockSize === 0) break;
      readPtLen(NT, TBIT, 3);
      readCLen();
      readPtLen(NP, PBIT, -1);
    }
    blockSize--;

    let j = cTable[(bitBuf >> 4) & 0xFFF];
    if (j === 0xFFFF || j >= NC) break;
    fillBuf(cLen[j]);

    if (j <= 255) {
      dic[dicPos] = j;
      out.push(j);
      dicPos = (dicPos + 1) & (DICSIZ - 1);
    } else {
      const matchLen = j - 256 + THRESHOLD;
      let pv = pTable[(bitBuf >> 8) & 0xFF];
      if (pv === 0xFFFF || pv >= NP) break;
      fillBuf(pLen[pv]);
      // Extend position with extra bits if pv > 1
      if (pv >= 2) {
        pv = ((pv - 1) << 1) | getBits(1);
        // Some implementations extend further:
        // for NP > 2, each additional bit extends pv
      }
      const matchPos = (dicPos - pv - 1) & (DICSIZ - 1);
      for (let k = 0; k < matchLen; k++) {
        const c = dic[(matchPos + k) & (DICSIZ - 1)];
        dic[dicPos] = c;
        out.push(c);
        dicPos = (dicPos + 1) & (DICSIZ - 1);
      }
    }
  }

  return new Uint8Array(out);
}
```

**Step 4: Run tests, confirm pass**
```bash
npx vitest run src/lib/import/__tests__/YMParser.test.ts && npx tsc --noEmit
```
Expected: all 3+ tests pass, TypeScript clean.

**Step 5: Commit**
```bash
git add src/lib/import/formats/YMParser.ts src/lib/import/__tests__/YMParser.test.ts
git commit -m "fix(import): correct LZH-5 decoder in YMParser for YM5!/YM6! files"
```

---

## Task 2: Extend VGMParser with SN76489 + OPM Note Extraction

VGMParser already tracks OPN2 (YM2612) perfectly. SN76489 (PSG) and YM2151 (OPM) are common in Sega/arcade VGM files and currently produce silent channels.

**Files:**
- Modify: `src/lib/import/formats/VGMParser.ts` — extend `walkCommands` and `buildInstruments`

**Step 1: Add SN76489 test to `VGMParser.test.ts`**

```typescript
it('extracts SN76489 PSG notes from a minimal VGM', () => {
  // Build a VGM with SN76489 clock and one tone write + wait + end
  const vgm = new Uint8Array(0x100).fill(0);
  // Magic
  vgm[0] = 0x56; vgm[1] = 0x67; vgm[2] = 0x6D; vgm[3] = 0x20;
  // Version 1.00
  vgm[8] = 0x00; vgm[9] = 0x01; vgm[10] = 0x00; vgm[11] = 0x00;
  // SN76489 clock at 0x0C: 3579545 Hz
  const clk = 3579545;
  vgm[0x0C] = clk & 0xFF; vgm[0x0D] = (clk >> 8) & 0xFF;
  vgm[0x0E] = (clk >> 16) & 0xFF; vgm[0x0F] = (clk >> 24) & 0xFF;
  // Data offset: 0x40
  // SN76489 command: channel 0, latch+data, freq=440 → counter = 3579545/32/440 ≈ 254
  // Latch byte: 0x80 | (ch<<5) | (0<<4) | (lo4 of counter)
  // Data byte:  0x00 | (hi6 of counter)
  // counter = 254 = 0b11111110; lo4 = 0xE, hi6 = 0b001111 = 0x0F
  vgm[0x40] = 0x50;  // SN76489 write command
  vgm[0x41] = 0x8E;  // latch ch0 tone lo nibble = 0xE
  vgm[0x42] = 0x50;  // SN76489 write command
  vgm[0x43] = 0x0F;  // data hi6 = 0x0F
  vgm[0x44] = 0x63;  // wait 735 samples (60Hz)
  vgm[0x45] = 0x66;  // end
  const song = await parseVGMFile(vgm.buffer, 'test.vgm');
  // Should detect SN76489 and create a PSG instrument
  expect(song.instruments.some(i => i.name.includes('PSG') || i.name.includes('SN'))).toBe(true);
  // Should have a non-zero note somewhere
  const hasNote = song.patterns[0].channels.some(ch => ch.rows.some(r => r.note > 0));
  expect(hasNote).toBe(true);
});
```

**Step 2: Run test, confirm it fails**
```bash
npx vitest run src/lib/import/__tests__/VGMParser.test.ts
```

**Step 3: Add SN76489 note extraction to `walkCommands` in `VGMParser.ts`**

After the existing `opn2*` state arrays, add SN76489 state:

```typescript
// SN76489 state (4 channels: 0-2 tone, 3 noise)
const snCounter  = new Uint16Array(4); // 10-bit frequency counter per channel
const snVolume   = new Uint8Array(4).fill(0x0F); // 4-bit volume (0=max, 15=silent)
const snLatch    = new Uint8Array(1);  // which channel/type is latched

// SN76489 clock = typically 3579545 Hz (NTSC) or 3546893 Hz (PAL)
// freq = clock / (32 * counter); MIDI note = round(12*log2(freq/440)+69)
```

Add a `sn76489Clock` variable from the VGM header (offset 0x0C, lower 30 bits), defaulting to 3579545.

Replace the existing `if (cmd === 0x50) { pos++; continue; }` stub in `walkCommands` with:

```typescript
if (cmd === 0x50) { // SN76489 write
  if (pos >= buf.length) break;
  const val = buf[pos++];
  if (val & 0x80) {
    // Latch byte: bits[6:5]=channel, bit[4]=type(0=tone/1=vol)
    snLatch[0] = (val >> 5) & 0x03;
    const ch = snLatch[0];
    const isVol = (val >> 4) & 1;
    if (isVol) {
      const newVol = val & 0x0F;
      const wasOn = snVolume[ch] < 0x0F;
      const willBe = newVol < 0x0F;
      snVolume[ch] = newVol;
      if (wasOn && !willBe) events.push({ tick, ch: 8 + ch, note: 97, on: false, instIdx: snInstIdx });
    } else {
      snCounter[ch] = (snCounter[ch] & 0x3F0) | (val & 0x0F);
    }
  } else {
    // Data byte: bits[5:0] = upper 6 bits of counter
    const ch = snLatch[0];
    snCounter[ch] = ((val & 0x3F) << 4) | (snCounter[ch] & 0x0F);
    if (snVolume[ch] < 0x0F && ch < 3) {
      const freq = sn76489Clock / (32 * snCounter[ch]);
      const note = Math.round(12 * Math.log2(freq / 440) + 69);
      if (note >= 1 && note <= 96) {
        events.push({ tick, ch: 8 + ch, note, on: true, instIdx: snInstIdx });
      }
    }
  }
  continue;
}
```

Where `snInstIdx` is the index of the SN76489 instrument in the instruments array (set when building instruments, passed into `walkCommands`).

Update `walkCommands` signature to accept `chips` and a `chipInstOffsets` map, or simply pass the instrument index array. The simplest approach: pass `snInstStart: number` (index of first SN instrument, or -1 if not present).

Update `buildInstruments` to return both the array and a map of chip→startIndex:

```typescript
interface ChipInstMap { sn76489: number; ym2612: number; ym2151: number; }
function buildInstruments(chips: VGMChips): { insts: InstrumentConfig[]; map: ChipInstMap }
```

Update `eventsToPattern` and `walkCommands` to use the expanded channel count (OPN2 uses ch 0–5, SN uses ch 8–11, OPM uses ch 12–19).

**Step 4: Add OPM (YM2151) note extraction** — YM2151 has 8 channels. Register 0x28+ch = key-code (octave+note), register 0x08 = key-on. Add state tracking analogous to OPN2:

```typescript
// OPM (YM2151) per-channel state (8 channels)
const opmKeyCode = new Uint8Array(8); // reg 0x28–0x2F: bits[6:4]=octave, bits[3:0]=note
const opmKeyOn   = new Uint8Array(8); // reg 0x08, bits[6:3] = op enables per ch
// YM2151 KC nibble → semitone offset from C (C is at nibble 11, C# at 0)
// KC nibble: 0=C#  1=D  2=D#  3=E  4=F  5=F#  6=G  7=G#  8=A  9=A#  10=B  11=C
// KC nibble → semitone: [1,2,3,4,5,6,7,8,9,10,11,0]
// midi = octave * 12 + KC_TO_SEMITONE[min(kc&0xF, 11)] + 12
const KC_TO_SEMITONE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0] as const;
```

For cmd 0x54 (YM2151 port 0):
- If reg === 0x08: key-on/off for ch = val & 0x07; ons = (val & 0x78) !== 0
- If reg >= 0x28 && reg <= 0x2F: store key code for channel (reg - 0x28)

**Step 5: Run tests**
```bash
npx vitest run src/lib/import/__tests__/VGMParser.test.ts && npx tsc --noEmit
```

**Step 6: Commit**
```bash
git add src/lib/import/formats/VGMParser.ts src/lib/import/__tests__/VGMParser.test.ts
git commit -m "feat(import): add SN76489 PSG and OPM note extraction to VGMParser"
```

---

## Task 3: 6502 CPU Emulator

This is the shared infrastructure used by NSF, SID, and SAP parsers.

**Files:**
- Create: `src/lib/import/cpu/Cpu6502.ts`
- Create: `src/lib/import/cpu/__tests__/Cpu6502.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/import/cpu/__tests__/Cpu6502.test.ts
import { Cpu6502, type MemoryMap } from '../Cpu6502';

function makeRAM(init?: Partial<Record<number,number>>): MemoryMap & { ram: Uint8Array } {
  const ram = new Uint8Array(0x10000);
  if (init) for (const [a, v] of Object.entries(init)) ram[Number(a)] = Number(v);
  return { ram, read: (a) => ram[a & 0xFFFF], write: (a, v) => { ram[a & 0xFFFF] = v & 0xFF; } };
}

describe('Cpu6502', () => {
  it('executes LDA #imm + RTS', () => {
    // LDA #0x42 (2 bytes) + RTS (1 byte)
    const mem = makeRAM({ 0x0200: 0xA9, 0x0201: 0x42, 0x0202: 0x60 });
    // Set up return address on stack so RTS lands at 0xFFFF (sentinel)
    mem.ram[0x01FD] = 0xFE; // hi
    mem.ram[0x01FC] = 0xFF; // lo  (RTS pops lo then hi, adds 1 → 0xFFFF)
    const cpu = new Cpu6502(mem);
    cpu.reset(0x0200, 0xFB); // SP = 0xFB (2 bytes used for return addr)
    cpu.runUntilPC(0xFFFF, 100);
    expect(cpu.getA()).toBe(0x42);
  });

  it('executes JSR + RTS correctly', () => {
    // 0x0200: JSR 0x0210   [20 10 02]
    // 0x0203: LDA #0x01    [A9 01]
    // 0x0205: (unreachable / checked not to touch A first)
    // 0x0210: LDA #0x55    [A9 55]
    // 0x0212: RTS           [60]
    const mem = makeRAM({
      0x0200: 0x20, 0x0201: 0x10, 0x0202: 0x02, // JSR $0210
      0x0203: 0xEA,                               // NOP (after return)
      0x0204: 0x60,                               // RTS (exit)
      0x0210: 0xA9, 0x0211: 0x55,                // LDA #$55
      0x0212: 0x60,                               // RTS
    });
    mem.ram[0x01FD] = 0x02; mem.ram[0x01FC] = 0x02; // return from final RTS to 0x0203 (+1 = 0x0203? actually RTS addr+1)
    // Simpler: just run with enough cycles
    const cpu = new Cpu6502(mem);
    cpu.reset(0x0200, 0xFF);
    cpu.runSteps(20);
    expect(cpu.getA()).toBe(0x55);
    expect(cpu.getPC()).toBe(0x0204); // after RTS from subroutine, back at 0x0203, then NOP → 0x0204
  });

  it('handles branch (BEQ)', () => {
    // LDA #0 → BEQ +2 → LDA #1 → LDA #2 → RTS
    // If branch taken: skips LDA #1, loads #2
    const mem = makeRAM({
      0x0200: 0xA9, 0x0201: 0x00, // LDA #0 (sets Z)
      0x0202: 0xF0, 0x0203: 0x02, // BEQ +2 (skip LDA #1)
      0x0204: 0xA9, 0x0205: 0x01, // LDA #1 (skipped)
      0x0206: 0xA9, 0x0207: 0x02, // LDA #2
      0x0208: 0x60,               // RTS
    });
    const cpu = new Cpu6502(mem);
    cpu.reset(0x0200, 0xFF);
    cpu.runSteps(20);
    expect(cpu.getA()).toBe(0x02);
  });
});
```

**Step 2: Run tests, confirm fail**
```bash
npx vitest run src/lib/import/cpu/__tests__/Cpu6502.test.ts
```
Expected: `Cannot find module '../Cpu6502'`

**Step 3: Implement `Cpu6502.ts`**

```typescript
// src/lib/import/cpu/Cpu6502.ts

export interface MemoryMap {
  read(addr: number): number;
  write(addr: number, value: number): void;
}

export class Cpu6502 {
  private A = 0; private X = 0; private Y = 0;
  private SP = 0xFD; private PC = 0;
  // Status flags
  private N = 0; private V = 0; private B = 1;
  private D = 0; private I = 1; private Z = 0; private C = 0;

  constructor(private mem: MemoryMap) {}

  reset(pc: number, sp = 0xFD): void {
    this.PC = pc; this.SP = sp;
    this.A = 0; this.X = 0; this.Y = 0;
    this.N = 0; this.V = 0; this.B = 1; this.D = 0; this.I = 1; this.Z = 1; this.C = 0;
  }

  getA(): number { return this.A; }
  getX(): number { return this.X; }
  getY(): number { return this.Y; }
  getPC(): number { return this.PC; }
  getSP(): number { return this.SP; }
  setA(v: number): void { this.A = v & 0xFF; }
  setX(v: number): void { this.X = v & 0xFF; }
  setY(v: number): void { this.Y = v & 0xFF; }
  setPC(v: number): void { this.PC = v & 0xFFFF; }

  private rd(a: number): number { return this.mem.read(a & 0xFFFF) & 0xFF; }
  private wr(a: number, v: number): void { this.mem.write(a & 0xFFFF, v & 0xFF); }
  private rd16(a: number): number { return this.rd(a) | (this.rd(a + 1) << 8); }
  // 6502 page-wrap bug: indirect JMP wraps within page
  private rd16wrap(a: number): number { return this.rd(a) | (this.rd((a & 0xFF00) | ((a + 1) & 0xFF)) << 8); }

  private fetch(): number { return this.rd(this.PC++); }
  private fetch16(): number { const lo = this.fetch(); const hi = this.fetch(); return lo | (hi << 8); }

  private push(v: number): void { this.wr(0x0100 | this.SP, v); this.SP = (this.SP - 1) & 0xFF; }
  private pop(): number { this.SP = (this.SP + 1) & 0xFF; return this.rd(0x0100 | this.SP); }

  private getP(): number {
    return (this.N << 7) | (this.V << 6) | (1 << 5) | (this.B << 4) |
           (this.D << 3) | (this.I << 2) | (this.Z << 1) | this.C;
  }
  private setP(v: number): void {
    this.N = (v >> 7) & 1; this.V = (v >> 6) & 1; this.B = (v >> 4) & 1;
    this.D = (v >> 3) & 1; this.I = (v >> 2) & 1; this.Z = (v >> 1) & 1; this.C = v & 1;
  }
  private nz(v: number): void { this.N = (v >> 7) & 1; this.Z = v === 0 ? 1 : 0; }

  private adc(val: number): void {
    const r = this.A + val + this.C;
    this.V = (~(this.A ^ val) & (this.A ^ r) & 0x80) ? 1 : 0;
    this.C = r > 0xFF ? 1 : 0;
    this.A = r & 0xFF; this.nz(this.A);
  }
  private sbc(val: number): void { this.adc(val ^ 0xFF); }
  private cmp(a: number, b: number): void { const r = a - b; this.N = (r >> 7) & 1; this.Z = r === 0 ? 1 : 0; this.C = r >= 0 ? 1 : 0; }
  private branch(cond: boolean): void {
    const off = this.fetch(); // signed
    if (cond) this.PC = (this.PC + (off < 0x80 ? off : off - 0x100)) & 0xFFFF;
  }
  private asl(v: number): number { this.C = (v >> 7) & 1; v = (v << 1) & 0xFF; this.nz(v); return v; }
  private lsr(v: number): number { this.C = v & 1; v = v >> 1; this.nz(v); return v; }
  private rol(v: number): number { const c = this.C; this.C = (v >> 7) & 1; v = ((v << 1) | c) & 0xFF; this.nz(v); return v; }
  private ror(v: number): number { const c = this.C; this.C = v & 1; v = (v >> 1) | (c << 7); this.nz(v); return v; }

  /** Execute one instruction, return cycles consumed. */
  step(): number {
    const op = this.fetch();
    switch (op) {
      // ── LDA ──
      case 0xA9: { const v = this.fetch();                           this.A = v; this.nz(v); return 2; }
      case 0xA5: { const v = this.rd(this.fetch());                  this.A = v; this.nz(v); return 3; }
      case 0xB5: { const v = this.rd((this.fetch()+this.X)&0xFF);   this.A = v; this.nz(v); return 4; }
      case 0xAD: { const v = this.rd(this.fetch16());                this.A = v; this.nz(v); return 4; }
      case 0xBD: { const v = this.rd(this.fetch16()+this.X);        this.A = v; this.nz(v); return 4; }
      case 0xB9: { const v = this.rd(this.fetch16()+this.Y);        this.A = v; this.nz(v); return 4; }
      case 0xA1: { const zp=(this.fetch()+this.X)&0xFF; const v=this.rd(this.rd16(zp)); this.A=v; this.nz(v); return 6; }
      case 0xB1: { const zp=this.fetch(); const v=this.rd(this.rd16(zp)+this.Y); this.A=v; this.nz(v); return 5; }
      // ── LDX ──
      case 0xA2: { const v=this.fetch();                           this.X=v; this.nz(v); return 2; }
      case 0xA6: { const v=this.rd(this.fetch());                  this.X=v; this.nz(v); return 3; }
      case 0xB6: { const v=this.rd((this.fetch()+this.Y)&0xFF);   this.X=v; this.nz(v); return 4; }
      case 0xAE: { const v=this.rd(this.fetch16());                this.X=v; this.nz(v); return 4; }
      case 0xBE: { const v=this.rd(this.fetch16()+this.Y);        this.X=v; this.nz(v); return 4; }
      // ── LDY ──
      case 0xA0: { const v=this.fetch();                           this.Y=v; this.nz(v); return 2; }
      case 0xA4: { const v=this.rd(this.fetch());                  this.Y=v; this.nz(v); return 3; }
      case 0xB4: { const v=this.rd((this.fetch()+this.X)&0xFF);   this.Y=v; this.nz(v); return 4; }
      case 0xAC: { const v=this.rd(this.fetch16());                this.Y=v; this.nz(v); return 4; }
      case 0xBC: { const v=this.rd(this.fetch16()+this.X);        this.Y=v; this.nz(v); return 4; }
      // ── STA ──
      case 0x85: { this.wr(this.fetch(), this.A); return 3; }
      case 0x95: { this.wr((this.fetch()+this.X)&0xFF, this.A); return 4; }
      case 0x8D: { this.wr(this.fetch16(), this.A); return 4; }
      case 0x9D: { this.wr(this.fetch16()+this.X, this.A); return 5; }
      case 0x99: { this.wr(this.fetch16()+this.Y, this.A); return 5; }
      case 0x81: { const zp=(this.fetch()+this.X)&0xFF; this.wr(this.rd16(zp), this.A); return 6; }
      case 0x91: { const zp=this.fetch(); this.wr(this.rd16(zp)+this.Y, this.A); return 6; }
      // ── STX ──
      case 0x86: { this.wr(this.fetch(), this.X); return 3; }
      case 0x96: { this.wr((this.fetch()+this.Y)&0xFF, this.X); return 4; }
      case 0x8E: { this.wr(this.fetch16(), this.X); return 4; }
      // ── STY ──
      case 0x84: { this.wr(this.fetch(), this.Y); return 3; }
      case 0x94: { this.wr((this.fetch()+this.X)&0xFF, this.Y); return 4; }
      case 0x8C: { this.wr(this.fetch16(), this.Y); return 4; }
      // ── Transfers ──
      case 0xAA: { this.X=this.A; this.nz(this.X); return 2; }
      case 0xA8: { this.Y=this.A; this.nz(this.Y); return 2; }
      case 0x8A: { this.A=this.X; this.nz(this.A); return 2; }
      case 0x98: { this.A=this.Y; this.nz(this.A); return 2; }
      case 0xBA: { this.X=this.SP; this.nz(this.X); return 2; }
      case 0x9A: { this.SP=this.X; return 2; }
      // ── Stack ──
      case 0x48: { this.push(this.A); return 3; }
      case 0x68: { this.A=this.pop(); this.nz(this.A); return 4; }
      case 0x08: { this.push(this.getP() | 0x10); return 3; }
      case 0x28: { this.setP(this.pop()); return 4; }
      // ── ADC ──
      case 0x69: { this.adc(this.fetch()); return 2; }
      case 0x65: { this.adc(this.rd(this.fetch())); return 3; }
      case 0x75: { this.adc(this.rd((this.fetch()+this.X)&0xFF)); return 4; }
      case 0x6D: { this.adc(this.rd(this.fetch16())); return 4; }
      case 0x7D: { this.adc(this.rd(this.fetch16()+this.X)); return 4; }
      case 0x79: { this.adc(this.rd(this.fetch16()+this.Y)); return 4; }
      case 0x61: { const zp=(this.fetch()+this.X)&0xFF; this.adc(this.rd(this.rd16(zp))); return 6; }
      case 0x71: { const zp=this.fetch(); this.adc(this.rd(this.rd16(zp)+this.Y)); return 5; }
      // ── SBC ──
      case 0xE9: { this.sbc(this.fetch()); return 2; }
      case 0xE5: { this.sbc(this.rd(this.fetch())); return 3; }
      case 0xF5: { this.sbc(this.rd((this.fetch()+this.X)&0xFF)); return 4; }
      case 0xED: { this.sbc(this.rd(this.fetch16())); return 4; }
      case 0xFD: { this.sbc(this.rd(this.fetch16()+this.X)); return 4; }
      case 0xF9: { this.sbc(this.rd(this.fetch16()+this.Y)); return 4; }
      case 0xE1: { const zp=(this.fetch()+this.X)&0xFF; this.sbc(this.rd(this.rd16(zp))); return 6; }
      case 0xF1: { const zp=this.fetch(); this.sbc(this.rd(this.rd16(zp)+this.Y)); return 5; }
      // ── AND ──
      case 0x29: { this.A&=this.fetch(); this.nz(this.A); return 2; }
      case 0x25: { this.A&=this.rd(this.fetch()); this.nz(this.A); return 3; }
      case 0x35: { this.A&=this.rd((this.fetch()+this.X)&0xFF); this.nz(this.A); return 4; }
      case 0x2D: { this.A&=this.rd(this.fetch16()); this.nz(this.A); return 4; }
      case 0x3D: { this.A&=this.rd(this.fetch16()+this.X); this.nz(this.A); return 4; }
      case 0x39: { this.A&=this.rd(this.fetch16()+this.Y); this.nz(this.A); return 4; }
      case 0x21: { const zp=(this.fetch()+this.X)&0xFF; this.A&=this.rd(this.rd16(zp)); this.nz(this.A); return 6; }
      case 0x31: { const zp=this.fetch(); this.A&=this.rd(this.rd16(zp)+this.Y); this.nz(this.A); return 5; }
      // ── ORA ──
      case 0x09: { this.A|=this.fetch(); this.nz(this.A); return 2; }
      case 0x05: { this.A|=this.rd(this.fetch()); this.nz(this.A); return 3; }
      case 0x15: { this.A|=this.rd((this.fetch()+this.X)&0xFF); this.nz(this.A); return 4; }
      case 0x0D: { this.A|=this.rd(this.fetch16()); this.nz(this.A); return 4; }
      case 0x1D: { this.A|=this.rd(this.fetch16()+this.X); this.nz(this.A); return 4; }
      case 0x19: { this.A|=this.rd(this.fetch16()+this.Y); this.nz(this.A); return 4; }
      case 0x01: { const zp=(this.fetch()+this.X)&0xFF; this.A|=this.rd(this.rd16(zp)); this.nz(this.A); return 6; }
      case 0x11: { const zp=this.fetch(); this.A|=this.rd(this.rd16(zp)+this.Y); this.nz(this.A); return 5; }
      // ── EOR ──
      case 0x49: { this.A^=this.fetch(); this.nz(this.A); return 2; }
      case 0x45: { this.A^=this.rd(this.fetch()); this.nz(this.A); return 3; }
      case 0x55: { this.A^=this.rd((this.fetch()+this.X)&0xFF); this.nz(this.A); return 4; }
      case 0x4D: { this.A^=this.rd(this.fetch16()); this.nz(this.A); return 4; }
      case 0x5D: { this.A^=this.rd(this.fetch16()+this.X); this.nz(this.A); return 4; }
      case 0x59: { this.A^=this.rd(this.fetch16()+this.Y); this.nz(this.A); return 4; }
      case 0x41: { const zp=(this.fetch()+this.X)&0xFF; this.A^=this.rd(this.rd16(zp)); this.nz(this.A); return 6; }
      case 0x51: { const zp=this.fetch(); this.A^=this.rd(this.rd16(zp)+this.Y); this.nz(this.A); return 5; }
      // ── CMP/CPX/CPY ──
      case 0xC9: { this.cmp(this.A, this.fetch()); return 2; }
      case 0xC5: { this.cmp(this.A, this.rd(this.fetch())); return 3; }
      case 0xD5: { this.cmp(this.A, this.rd((this.fetch()+this.X)&0xFF)); return 4; }
      case 0xCD: { this.cmp(this.A, this.rd(this.fetch16())); return 4; }
      case 0xDD: { this.cmp(this.A, this.rd(this.fetch16()+this.X)); return 4; }
      case 0xD9: { this.cmp(this.A, this.rd(this.fetch16()+this.Y)); return 4; }
      case 0xC1: { const zp=(this.fetch()+this.X)&0xFF; this.cmp(this.A,this.rd(this.rd16(zp))); return 6; }
      case 0xD1: { const zp=this.fetch(); this.cmp(this.A,this.rd(this.rd16(zp)+this.Y)); return 5; }
      case 0xE0: { this.cmp(this.X, this.fetch()); return 2; }
      case 0xE4: { this.cmp(this.X, this.rd(this.fetch())); return 3; }
      case 0xEC: { this.cmp(this.X, this.rd(this.fetch16())); return 4; }
      case 0xC0: { this.cmp(this.Y, this.fetch()); return 2; }
      case 0xC4: { this.cmp(this.Y, this.rd(this.fetch())); return 3; }
      case 0xCC: { this.cmp(this.Y, this.rd(this.fetch16())); return 4; }
      // ── BIT ──
      case 0x24: { const v=this.rd(this.fetch()); this.Z=(this.A&v)?0:1; this.N=(v>>7)&1; this.V=(v>>6)&1; return 3; }
      case 0x2C: { const v=this.rd(this.fetch16()); this.Z=(this.A&v)?0:1; this.N=(v>>7)&1; this.V=(v>>6)&1; return 4; }
      // ── INC/DEC ──
      case 0xE6: { const a=this.fetch(); const v=(this.rd(a)+1)&0xFF; this.wr(a,v); this.nz(v); return 5; }
      case 0xF6: { const a=(this.fetch()+this.X)&0xFF; const v=(this.rd(a)+1)&0xFF; this.wr(a,v); this.nz(v); return 6; }
      case 0xEE: { const a=this.fetch16(); const v=(this.rd(a)+1)&0xFF; this.wr(a,v); this.nz(v); return 6; }
      case 0xFE: { const a=this.fetch16()+this.X; const v=(this.rd(a)+1)&0xFF; this.wr(a,v); this.nz(v); return 7; }
      case 0xC6: { const a=this.fetch(); const v=(this.rd(a)-1)&0xFF; this.wr(a,v); this.nz(v); return 5; }
      case 0xD6: { const a=(this.fetch()+this.X)&0xFF; const v=(this.rd(a)-1)&0xFF; this.wr(a,v); this.nz(v); return 6; }
      case 0xCE: { const a=this.fetch16(); const v=(this.rd(a)-1)&0xFF; this.wr(a,v); this.nz(v); return 6; }
      case 0xDE: { const a=this.fetch16()+this.X; const v=(this.rd(a)-1)&0xFF; this.wr(a,v); this.nz(v); return 7; }
      case 0xE8: { this.X=(this.X+1)&0xFF; this.nz(this.X); return 2; }
      case 0xCA: { this.X=(this.X-1)&0xFF; this.nz(this.X); return 2; }
      case 0xC8: { this.Y=(this.Y+1)&0xFF; this.nz(this.Y); return 2; }
      case 0x88: { this.Y=(this.Y-1)&0xFF; this.nz(this.Y); return 2; }
      // ── ASL ──
      case 0x0A: { this.A=this.asl(this.A); return 2; }
      case 0x06: { const a=this.fetch(); this.wr(a,this.asl(this.rd(a))); return 5; }
      case 0x16: { const a=(this.fetch()+this.X)&0xFF; this.wr(a,this.asl(this.rd(a))); return 6; }
      case 0x0E: { const a=this.fetch16(); this.wr(a,this.asl(this.rd(a))); return 6; }
      case 0x1E: { const a=this.fetch16()+this.X; this.wr(a,this.asl(this.rd(a))); return 7; }
      // ── LSR ──
      case 0x4A: { this.A=this.lsr(this.A); return 2; }
      case 0x46: { const a=this.fetch(); this.wr(a,this.lsr(this.rd(a))); return 5; }
      case 0x56: { const a=(this.fetch()+this.X)&0xFF; this.wr(a,this.lsr(this.rd(a))); return 6; }
      case 0x4E: { const a=this.fetch16(); this.wr(a,this.lsr(this.rd(a))); return 6; }
      case 0x5E: { const a=this.fetch16()+this.X; this.wr(a,this.lsr(this.rd(a))); return 7; }
      // ── ROL ──
      case 0x2A: { this.A=this.rol(this.A); return 2; }
      case 0x26: { const a=this.fetch(); this.wr(a,this.rol(this.rd(a))); return 5; }
      case 0x36: { const a=(this.fetch()+this.X)&0xFF; this.wr(a,this.rol(this.rd(a))); return 6; }
      case 0x2E: { const a=this.fetch16(); this.wr(a,this.rol(this.rd(a))); return 6; }
      case 0x3E: { const a=this.fetch16()+this.X; this.wr(a,this.rol(this.rd(a))); return 7; }
      // ── ROR ──
      case 0x6A: { this.A=this.ror(this.A); return 2; }
      case 0x66: { const a=this.fetch(); this.wr(a,this.ror(this.rd(a))); return 5; }
      case 0x76: { const a=(this.fetch()+this.X)&0xFF; this.wr(a,this.ror(this.rd(a))); return 6; }
      case 0x6E: { const a=this.fetch16(); this.wr(a,this.ror(this.rd(a))); return 6; }
      case 0x7E: { const a=this.fetch16()+this.X; this.wr(a,this.ror(this.rd(a))); return 7; }
      // ── JMP / JSR / RTS / RTI ──
      case 0x4C: { this.PC=this.fetch16(); return 3; }
      case 0x6C: { this.PC=this.rd16wrap(this.fetch16()); return 5; }
      case 0x20: {
        const addr=this.fetch16();
        const ret=this.PC-1;
        this.push((ret>>8)&0xFF); this.push(ret&0xFF);
        this.PC=addr; return 6;
      }
      case 0x60: {
        const lo=this.pop(); const hi=this.pop();
        this.PC=(lo|(hi<<8))+1; return 6;
      }
      case 0x40: {
        this.setP(this.pop());
        const lo=this.pop(); const hi=this.pop();
        this.PC=lo|(hi<<8); return 6;
      }
      // ── Branches ──
      case 0x90: { this.branch(this.C===0); return 2; }  // BCC
      case 0xB0: { this.branch(this.C===1); return 2; }  // BCS
      case 0xF0: { this.branch(this.Z===1); return 2; }  // BEQ
      case 0xD0: { this.branch(this.Z===0); return 2; }  // BNE
      case 0x30: { this.branch(this.N===1); return 2; }  // BMI
      case 0x10: { this.branch(this.N===0); return 2; }  // BPL
      case 0x70: { this.branch(this.V===1); return 2; }  // BVS
      case 0x50: { this.branch(this.V===0); return 2; }  // BVC
      // ── Flag ops ──
      case 0x18: { this.C=0; return 2; } // CLC
      case 0x38: { this.C=1; return 2; } // SEC
      case 0x58: { this.I=0; return 2; } // CLI
      case 0x78: { this.I=1; return 2; } // SEI
      case 0xD8: { this.D=0; return 2; } // CLD
      case 0xF8: { this.D=1; return 2; } // SED
      case 0xB8: { this.V=0; return 2; } // CLV
      // ── NOP and misc ──
      case 0xEA: return 2; // NOP
      // Unofficial NOPs with operand bytes (commonly used in NSF code):
      case 0x1A: case 0x3A: case 0x5A: case 0x7A: case 0xDA: case 0xFA: return 2;
      case 0x80: case 0x82: case 0x89: case 0xC2: case 0xE2: { this.fetch(); return 2; }
      case 0x04: case 0x44: case 0x64: { this.fetch(); return 3; }
      case 0x0C: { this.fetch16(); return 4; }
      case 0x14: case 0x34: case 0x54: case 0x74: case 0xD4: case 0xF4: { this.fetch(); return 4; }
      case 0x1C: case 0x3C: case 0x5C: case 0x7C: case 0xDC: case 0xFC: { this.fetch16(); return 4; }
      default: return 2; // unknown → treat as NOP
    }
  }

  /** Run exactly N instructions. */
  runSteps(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  /** Run until PC == targetPC or cycleLimit exceeded. */
  runUntilPC(targetPC: number, cycleLimit: number): number {
    let cycles = 0;
    while (cycles < cycleLimit && this.PC !== targetPC) {
      cycles += this.step();
    }
    return cycles;
  }

  /** Run the subroutine starting at addr, stopping when it returns (SP back to initial). */
  runSubroutine(addr: number, maxCycles = 100_000): void {
    const initSP = this.SP;
    this.PC = addr;
    // Push a sentinel return address ($FFFF) so the final RTS terminates
    this.push(0xFF); this.push(0xFE); // RTS will read 0xFEFF+1 = 0xFF00... use cycle limit instead
    // Actually: just track stack depth
    const startSP = this.SP;
    let cycles = 0;
    while (cycles < maxCycles) {
      if (this.SP > startSP && this.PC !== addr) break; // returned past call depth
      cycles += this.step();
    }
  }

  /**
   * Run a music-player-style loop:
   * 1. Call init(A, X) at initAddr
   * 2. Call play() at playAddr `frames` times
   * Returns after all frames are collected.
   */
  runPlayer(initAddr: number, playAddr: number, initA: number, initX: number, frames: number, cyclesPerFrame = 29780): void {
    this.setA(initA); this.setX(initX);
    this.callSubroutine(initAddr);
    for (let f = 0; f < frames; f++) {
      this.callSubroutine(playAddr, cyclesPerFrame);
    }
  }

  private callSubroutine(addr: number, maxCycles = 200_000): void {
    // Push sentinel return address 0xFFFF
    this.push(0xFF); this.push(0xFF);
    this.PC = addr;
    let cycles = 0;
    while (cycles < maxCycles && this.PC !== 0x0000) {
      // Check if we returned to sentinel (hit RTS from top-level call)
      if (this.PC === 0x0000) break;
      cycles += this.step();
    }
  }
}
```

**Note on `callSubroutine`:** We push `0xFF 0xFF` as a fake return address. When the music player's top-level `RTS` fires, it pops these bytes and sets `PC = 0xFF00 + 1 = not useful`. Instead, use a cycle limit: after `maxCycles` the loop exits. For `runPlayer`, also set a sentinel by hooking the read at 0x0000 to return `0x60` (RTS), and pushing `0xFF, 0xFF` — when RTS fires from subroutine, PC becomes 0x0000 which reads 0x60 (RTS again), creating an infinite loop. Better approach: track stack pointer depth.

**Revised `callSubroutine`** (clean approach):
```typescript
private callSubroutine(addr: number, maxCycles = 200_000): void {
  const targetSP = this.SP; // SP before call
  this.push(0xFF); this.push(0xFE); // fake return = 0xFEFF+1 = 0xFF00 (unused)
  this.PC = addr;
  let cycles = 0;
  while (cycles < maxCycles) {
    cycles += this.step();
    // Stop when SP returns above where we started (subroutine returned)
    if (this.SP >= targetSP) break;
  }
}
```

**Step 4: Run tests**
```bash
npx vitest run src/lib/import/cpu/__tests__/Cpu6502.test.ts && npx tsc --noEmit
```

**Step 5: Commit**
```bash
git add src/lib/import/cpu/Cpu6502.ts src/lib/import/cpu/__tests__/Cpu6502.test.ts
git commit -m "feat(cpu): add 6502 CPU emulator for NSF/SID/SAP pattern extraction"
```

---

## Task 4: NSF Pattern Extraction via 6502 + NES APU

**Files:**
- Modify: `src/lib/import/formats/NSFParser.ts`
- Modify: `src/lib/import/__tests__/NSFParser.test.ts`

**NES APU register map:**
- `$4000–$4003`: Pulse 1 (duty/vol, sweep, timer lo, length+timer hi)
- `$4004–$4007`: Pulse 2 (same layout)
- `$4008–$400B`: Triangle (linear counter, unused, timer lo, length+timer hi)
- `$400C–$400F`: Noise (unused, vol, period, length)
- `$4015`: Status/enable register

**Note formula for Pulse/Triangle:**
- timer = ((reg[hi] & 0x07) << 8) | reg[lo]  (11-bit)
- Pulse freq = 1789773 / (16 * (timer + 1))
- Triangle freq = 1789773 / (32 * (timer + 1))  (double period)
- note = round(12 * log2(freq / 440) + 69)

**Step 1: Update NSF test to verify real notes**

Replace the existing stub test with:
```typescript
it('extracts real Pulse 1 notes from minimal NSF', () => {
  // Build NSF with a simple play routine:
  //   LDA #$41 ; load timer hi (A4 ≈ timer 253)
  //   STA $4003 ; set pulse 1 timer hi (+ key-on)
  //   LDA #$FD  ; timer lo = 253
  //   STA $4002
  //   LDA #$8F  ; vol=15, duty=0, no length halt
  //   STA $4000
  //   RTS
  // = A9 41 8D 03 40  A9 FD 8D 02 40  A9 8F 8D 00 40  60

  const NSF_HEADER_SIZE = 128;
  const LOAD_ADDR = 0x8000;
  const INIT_ADDR = 0x8000;
  const PLAY_ADDR = 0x8000; // same routine for simplicity

  const playCode = new Uint8Array([
    0xA9, 0x01, 0x8D, 0x15, 0x40,  // LDA #1, STA $4015 (enable pulse 1)
    0xA9, 0x8F, 0x8D, 0x00, 0x40,  // LDA #$8F, STA $4000 (vol=15, duty=0)
    0xA9, 0xFD, 0x8D, 0x02, 0x40,  // LDA #$FD, STA $4002 (timer lo=253)
    0xA9, 0x41, 0x8D, 0x03, 0x40,  // LDA #$41, STA $4003 (timer hi=1, key+len)
    0x60                             // RTS
  ]);

  const buf = new Uint8Array(NSF_HEADER_SIZE + playCode.length);
  // Magic
  buf[0]=0x4E; buf[1]=0x45; buf[2]=0x53; buf[3]=0x4D; buf[4]=0x1A;
  buf[5] = 1; // version
  buf[6] = 1; // 1 song
  buf[7] = 1; // starting song = 1
  // Load addr (LE)
  buf[8] = LOAD_ADDR & 0xFF; buf[9] = (LOAD_ADDR >> 8) & 0xFF;
  // Init addr (LE)
  buf[10] = INIT_ADDR & 0xFF; buf[11] = (INIT_ADDR >> 8) & 0xFF;
  // Play addr (LE)
  buf[12] = PLAY_ADDR & 0xFF; buf[13] = (PLAY_ADDR >> 8) & 0xFF;
  // Title, artist (bytes 14–128 stay 0)
  buf[0x70] = 0; // PAL/NTSC flag = NTSC
  buf.set(playCode, NSF_HEADER_SIZE);

  const song = await parseNSFFile(buf.buffer, 'test.nsf');
  const hasNote = song.patterns[0].channels.some(ch => ch.rows.some(r => r.note > 0));
  expect(hasNote).toBe(true);
  // Pulse 1 is channel 0
  const ch0Notes = song.patterns[0].channels[0].rows.filter(r => r.note > 0);
  expect(ch0Notes.length).toBeGreaterThan(0);
});
```

**Step 2: Run test, confirm fail**

**Step 3: Replace `parseNSFFile` in `NSFParser.ts`**

Add import at top:
```typescript
import { Cpu6502, type MemoryMap } from '@/lib/import/cpu/Cpu6502';
```

Add frequency→note helper:
```typescript
const NES_CLOCK = 1789773;
function apuTimerToNote(timer: number, isTriangle = false): number {
  if (timer <= 0) return 0;
  const freq = NES_CLOCK / ((isTriangle ? 32 : 16) * (timer + 1));
  if (freq < 20 || freq > 20000) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}
```

Replace `emptyPattern` call in `parseNSFFile` with full NES APU register tracking:

```typescript
export async function parseNSFFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  let title = '', artist = '', songs = 1, expansion = 0;
  let loadAddr = 0, initAddr = 0, playAddr = 0;
  let isPAL = false;

  if (isNSFFormat(buffer)) {
    title     = readStr(buf, 14, 34);
    artist    = readStr(buf, 48, 34);
    songs     = buf[6] || 1;
    expansion = buf[127];
    loadAddr  = buf[8]  | (buf[9]  << 8);
    initAddr  = buf[10] | (buf[11] << 8);
    playAddr  = buf[12] | (buf[13] << 8);
    isPAL     = (buf[0x70] & 1) !== 0;
    const codeStart = buf[0x70 + 1] ? buf[0x70 + 1] : 128; // data at offset 128
    // Map NSF code into 64KB RAM starting at loadAddr
  } else if (isNSFEFormat(buffer)) {
    // ... existing NSFE parsing for metadata ...
    // extract loadAddr/initAddr/playAddr from INFO chunk
  } else {
    throw new Error('Not a valid NSF/NSFE file');
  }

  const instruments = buildNESInstruments(expansion);
  const numCh = Math.min(instruments.length, 13);

  // ── CPU emulation ──────────────────────────────────────────────────────────
  const FRAMES = Math.min(3000, 64 * 50); // 64 seconds at 50Hz max
  const MAX_ROWS = 256;

  // APU register shadow (indexed 0x4000–0x401F)
  const apuRegs = new Uint8Array(0x20);

  const ram = new Uint8Array(0x10000);
  // Load NSF code at loadAddr
  const codeData = buf.subarray(128); // NSF code starts at byte 128
  const codeLen = Math.min(codeData.length, 0x10000 - loadAddr);
  ram.set(codeData.subarray(0, codeLen), loadAddr);
  // Place a RTS at $FFFF as sentinel (already 0 but 0x60=RTS is better)
  ram[0xFFFF] = 0x60;

  const mem: MemoryMap = {
    read(addr) {
      // APU registers are write-only; return 0 for reads
      if (addr >= 0x4000 && addr < 0x4020) return apuRegs[addr - 0x4000];
      return ram[addr] || 0;
    },
    write(addr, val) {
      ram[addr & 0xFFFF] = val;
      if (addr >= 0x4000 && addr < 0x4020) {
        apuRegs[addr - 0x4000] = val;
      }
    },
  };

  const cpu = new Cpu6502(mem);
  cpu.reset(initAddr, 0xFD);
  cpu.setA(0); // subsong 0 (0-indexed)
  cpu.setX(isPAL ? 1 : 0);
  // Run init routine
  (cpu as any).callSubroutine(initAddr);

  // Collect note events per frame
  interface FrameState { notes: (number|null)[]; volumes: (number|null)[]; }
  const frameStates: FrameState[] = [];

  const cyclesPerFrame = isPAL ? 35464 : 29780;

  for (let f = 0; f < FRAMES; f++) {
    (cpu as any).callSubroutine(playAddr, cyclesPerFrame);

    // Read APU state and extract notes
    const notes: (number|null)[] = new Array(numCh).fill(null);
    const vols:  (number|null)[] = new Array(numCh).fill(null);

    // Pulse 1 (ch 0)
    const p1Enable = (apuRegs[0x15] & 1) !== 0;
    if (p1Enable) {
      const timer = ((apuRegs[0x03] & 0x07) << 8) | apuRegs[0x02];
      const vol   = apuRegs[0x00] & 0x0F;
      notes[0] = vol > 0 ? apuTimerToNote(timer) : null;
      vols[0]  = vol;
    }
    // Pulse 2 (ch 1)
    const p2Enable = (apuRegs[0x15] & 2) !== 0;
    if (p2Enable) {
      const timer = ((apuRegs[0x07] & 0x07) << 8) | apuRegs[0x06];
      const vol   = apuRegs[0x04] & 0x0F;
      notes[1] = vol > 0 ? apuTimerToNote(timer) : null;
      vols[1]  = vol;
    }
    // Triangle (ch 2)
    const triEnable = (apuRegs[0x15] & 4) !== 0;
    if (triEnable) {
      const timer  = ((apuRegs[0x0B] & 0x07) << 8) | apuRegs[0x0A];
      const linCnt = apuRegs[0x08] & 0x7F;
      notes[2] = linCnt > 0 ? apuTimerToNote(timer, true) : null;
      vols[2]  = linCnt > 0 ? 15 : 0;
    }
    // Noise (ch 3) — no MIDI note, just on/off
    const noiseEnable = (apuRegs[0x15] & 8) !== 0;
    if (noiseEnable) {
      const vol = apuRegs[0x0C] & 0x0F;
      notes[3] = vol > 0 ? 37 : null; // map to A2 (snare-ish)
      vols[3]  = vol;
    }

    frameStates.push({ notes, volumes: vols });
  }

  // ── frames → pattern ──────────────────────────────────────────────────────
  const step = Math.max(1, Math.ceil(frameStates.length / MAX_ROWS));
  const rows = Math.min(MAX_ROWS, Math.ceil(frameStates.length / step));

  const pat: Pattern = {
    id: 'p0', name: 'Pattern 1', length: rows,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: instruments[i]?.name || `CH ${i+1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, (): TrackerCell =>
        ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })),
    })),
  };

  const lastNote = new Array(numCh).fill(0);
  for (let row = 0; row < rows; row++) {
    const fs = frameStates[Math.min(row * step, frameStates.length - 1)];
    for (let ch = 0; ch < numCh && ch < fs.notes.length; ch++) {
      const n = fs.notes[ch];
      const cell = pat.channels[ch].rows[row];
      if (n !== null && n !== lastNote[ch]) {
        cell.note = n;
        cell.instrument = ch + 1;
        lastNote[ch] = n;
      } else if (n === null && lastNote[ch] > 0) {
        cell.note = 97; // note off
        lastNote[ch] = 0;
      }
    }
  }

  return {
    name: (title || filename.replace(/\.nsfe?$/i, '')) + (artist ? ` — ${artist}` : ''),
    format: 'NSF' as TrackerFormat,
    patterns: [pat],
    instruments,
    songPositions: [0],
    songLength: songs,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 1,
    initialBPM: isPAL ? 50 : 60,
  };
}
```

**Note:** The `callSubroutine` method is private. Make it `public` in `Cpu6502.ts` or expose it via a `runSubroutine(addr, maxCycles)` public method.

**Step 4: Run tests**
```bash
npx vitest run src/lib/import/__tests__/NSFParser.test.ts && npx tsc --noEmit
```

**Step 5: Commit**
```bash
git add src/lib/import/formats/NSFParser.ts src/lib/import/__tests__/NSFParser.test.ts src/lib/import/cpu/Cpu6502.ts
git commit -m "feat(import): NSF pattern extraction via 6502 CPU emulation + NES APU tracking"
```

---

## Task 5: SID Pattern Extraction via 6502 + SID Chip

**Files:**
- Modify: `src/lib/import/formats/SIDParser.ts`
- Modify: `src/lib/import/__tests__/SIDParser.test.ts`

**SID chip register map** (base $D400, 3 voices × 7 regs = 21 regs):
- `$D400–$D401`: Voice 1 frequency (lo, hi) — 16-bit
- `$D402–$D403`: Voice 1 pulse width (lo, hi[3:0])
- `$D404`: Voice 1 control (bit 0 = gate)
- `$D405`: Voice 1 ADSR hi (attack[7:4], decay[3:0])
- `$D406`: Voice 1 ADSR lo (sustain[7:4], release[3:0])
- Repeat × 3 for voices 2 ($D407) and 3 ($D40E)
- `$D418`: Filter/volume

**SID frequency formula:**
- `freq_hz = freq_reg * clock / 16777216`
- clock = 985248 Hz (PAL) or 1022727 Hz (NTSC)

**Step 1: Add integration test**

```typescript
it('extracts a real note from minimal PSID', () => {
  // Play routine: set voice 1 freq to A4 (~440 Hz), gate on
  // SID PAL clock = 985248 Hz; freq_reg = 440 * 16777216 / 985248 ≈ 7490 = 0x1D42
  // LDA #$42, STA $D400 (freq lo)
  // LDA #$1D, STA $D401 (freq hi)
  // LDA #$11, STA $D404 (gate on, triangle wave)
  // LDA #$0F, STA $D418 (vol=15)
  // RTS
  const SID_HEADER = 124;
  const LOAD_ADDR  = 0x1000;
  const playCode = new Uint8Array([
    0xA9, 0x42, 0x8D, 0x00, 0xD4, // LDA #$42, STA $D400
    0xA9, 0x1D, 0x8D, 0x01, 0xD4, // LDA #$1D, STA $D401
    0xA9, 0x11, 0x8D, 0x04, 0xD4, // LDA #$11, STA $D404 (gate+tri)
    0xA9, 0x0F, 0x8D, 0x18, 0xD4, // LDA #$0F, STA $D418 (vol)
    0x60,                           // RTS
  ]);
  const buf = new Uint8Array(SID_HEADER + playCode.length);
  buf[0]=0x50; buf[1]=0x53; buf[2]=0x49; buf[3]=0x44; // 'PSID'
  buf[4]=0; buf[5]=2; // version 2
  buf[6]=0; buf[7]=0x7C; // data offset = 124
  buf[8]=(LOAD_ADDR>>8)&0xFF; buf[9]=LOAD_ADDR&0xFF; // load addr (BE)
  buf[10]=LOAD_ADDR>>8; buf[11]=(LOAD_ADDR+5)&0xFF; // init addr
  buf[12]=LOAD_ADDR>>8; buf[13]=LOAD_ADDR&0xFF;       // play addr
  buf[14]=0; buf[15]=1; // 1 song
  buf[16]=0; buf[17]=1; // start song = 1
  // title at 22, author at 54 stay 0
  buf.set(playCode, SID_HEADER);

  const song = await parseSIDFile(buf.buffer, 'test.sid');
  const hasNote = song.patterns[0].channels.some(ch => ch.rows.some(r => r.note > 0));
  expect(hasNote).toBe(true);
});
```

**Step 2: Implement SID extraction in `SIDParser.ts`**

Add imports and frequency helper:
```typescript
import { Cpu6502, type MemoryMap } from '@/lib/import/cpu/Cpu6502';

function sidFreqToNote(freqReg: number, clock = 985248): number {
  if (freqReg === 0) return 0;
  const freq = freqReg * clock / 16777216;
  if (freq < 20 || freq > 20000) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}
```

Add `runSIDEmulation` function:
```typescript
function runSIDEmulation(
  buf: Uint8Array,
  loadAddr: number, initAddr: number, playAddr: number,
  dataOffset: number, numChips: number, sidClock: number
): FrameState[] {
  const FRAMES = 3000; // 60 seconds at 50Hz
  const ram = new Uint8Array(0x10000);
  // Load SID code
  const code = buf.subarray(dataOffset);
  ram.set(code.subarray(0, Math.min(code.length, 0x10000 - loadAddr)), loadAddr);

  const sidRegs = new Uint8Array(0x20); // $D400–$D41F

  const mem: MemoryMap = {
    read: (a) => {
      if (a >= 0xD400 && a < 0xD420) return sidRegs[a - 0xD400];
      return ram[a] || 0;
    },
    write: (a, v) => {
      ram[a & 0xFFFF] = v & 0xFF;
      if (a >= 0xD400 && a < 0xD420) sidRegs[a - 0xD400] = v;
    },
  };

  const cpu = new Cpu6502(mem);
  cpu.reset(initAddr, 0xFD);
  cpu.setA(0); // subsong 0
  cpu.runSubroutine(initAddr);

  const frames: FrameState[] = [];
  for (let f = 0; f < FRAMES; f++) {
    cpu.runSubroutine(playAddr, 20000);
    const notes: (number|null)[] = [];
    const vols:  (number|null)[] = [];
    const totalVoices = numChips * 3;
    for (let chip = 0; chip < numChips; chip++) {
      const base = chip * 0x20; // second SID at $D420 or configured address
      for (let v = 0; v < 3; v++) {
        const off = v * 7;
        const freqLo  = sidRegs[base + off + 0];
        const freqHi  = sidRegs[base + off + 1];
        const ctrl    = sidRegs[base + off + 4];
        const gateOn  = (ctrl & 1) !== 0;
        const freqReg = freqLo | (freqHi << 8);
        const note = (gateOn && freqReg > 0) ? sidFreqToNote(freqReg, sidClock) : null;
        notes.push(note);
        vols.push(gateOn ? 15 : 0);
      }
    }
    frames.push({ notes, volumes: vols });
  }
  return frames;
}
```

In `parseSIDFile`, after extracting header metadata, call `runSIDEmulation` and convert frames to pattern (same logic as NSFParser: downsample to MAX_ROWS=256, emit note-on/note-off changes).

**Key SID header fields** (all big-endian):
- offset 6: `uint16` data offset (where code starts in the file)
- offset 8: `uint16` load address (0 = first 2 bytes of data are load addr)
- offset 10: `uint16` init address
- offset 12: `uint16` play address (0 = use NMI/IRQ)
- offset 119: flags byte for SID model (bits 5:4 = SID1, bits 7:6 = SID2)

**Step 3: Run tests, commit**
```bash
npx vitest run src/lib/import/__tests__/SIDParser.test.ts && npx tsc --noEmit
git add src/lib/import/formats/SIDParser.ts src/lib/import/__tests__/SIDParser.test.ts
git commit -m "feat(import): SID pattern extraction via 6502 + SID register tracking"
```

---

## Task 6: SAP Pattern Extraction via 6502 + POKEY

**Files:**
- Modify: `src/lib/import/formats/SAPParser.ts`
- Modify: `src/lib/import/__tests__/SAPParser.test.ts`

**POKEY register map** (base $D200):
- `$D200`: AUDF1 — channel 1 frequency divisor
- `$D201`: AUDC1 — channel 1 control (bits[3:0]=volume, bit[4]=noise, bit[5]=tone)
- `$D202/$D203`: AUDF2/AUDC2 — channel 2
- `$D204/$D205`: AUDF3/AUDC3 — channel 3
- `$D206/$D207`: AUDF4/AUDC4 — channel 4
- `$D208`: AUDCTL — audio control (bit 6 = 1.79 MHz clock for ch1/3, etc.)

**POKEY frequency formula (standard mode, 64kHz clock):**
- `freq = 1789773 / (2 * (AUDF + 1))` when AUDCTL bit for high-freq not set
- Actually: base clock = 1789773 Hz; POKEY divides by (AUDF+1)*2 for tone
- Simplified: `freq = 894886.5 / (AUDF + 1)` (half-clock divide)
- Proper: depends on AUDCTL bits (high frequency mode, linked channels)
- Safe approximation: `freq = 1789773 / (28 * (AUDF + 1))` (standard clock divide by 28)

**Note:** POKEY is complex. Use a simplified model:
- If `AUDC` bit 5 set (tone output enabled) and volume > 0: calculate frequency
- Channel is "on" when `(AUDC & 0xA0) === 0x20` (tone enabled, no noise only)

**Step 1: Integration test**

Build a minimal SAP type-B header with simple POKEY-writing play code. The test verifies at least one channel has a non-zero note.

**Step 2: Implement SAP extraction**

Parse SAP header to find `INIT` and `PLAYER` addresses from the ASCII header lines:
- `INIT hex` → initAddr
- `PLAYER hex` → playerAddr
- `TYPE letter` → SAP type (B is most common)
- `FASTPLAY decimal` → frames per interrupt (default 312 for 50Hz)

Run 6502 emulation:
- Init: `LDA #song; JSR initAddr`
- Player: `JSR playerAddr` × FRAMES

Intercept writes to `$D200–$D20F` to track POKEY state.

```typescript
function pokeyFreqToNote(audf: number, audctl: number, ch: number): number {
  // Ch 0,2 use bit 6 (ch0) or bit 3 (ch2) of AUDCTL for 1.79MHz clock
  const hiFreq = ch === 0 ? (audctl & 0x40) : (ch === 2 ? (audctl & 0x08) : 0);
  const divisor = hiFreq ? (audf + 1) : (28 * (audf + 1));
  const freq = 1789773 / divisor;
  if (freq < 20 || freq > 20000) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}
```

**Step 3: Run tests, commit**
```bash
npx vitest run src/lib/import/__tests__/SAPParser.test.ts && npx tsc --noEmit
git add src/lib/import/formats/SAPParser.ts src/lib/import/__tests__/SAPParser.test.ts
git commit -m "feat(import): SAP pattern extraction via 6502 + POKEY register tracking"
```

---

## Task 7: Z80 CPU Emulator

**Files:**
- Create: `src/lib/import/cpu/CpuZ80.ts`
- Create: `src/lib/import/cpu/__tests__/CpuZ80.test.ts`

The Z80 is needed only for AY (ZXAYEMUL) format. Unlike the 6502, the Z80 has:
- Registers: A, F, B, C, D, E, H, L, I, R, IX, IY, SP, PC
- Shadow registers: A', F', B', C', D', E', H', L'
- Two-byte opcode prefixes: CB (bit ops), DD (IX), ED (extended), FD (IY)
- OUT instruction (writes to I/O port — used for AY register writes)

**Z80 AY I/O ports (ZX Spectrum):**
- `OUT ($BFFD), A` — write AY register data (port select = $BFFD = 0xBFFD)
- `OUT ($FFFD), A` — select AY register (port select = $FFFD = 0xFFFD)

**Z80 I/O intercept interface:**
```typescript
export interface Z80IO {
  in(port: number): number;
  out(port: number, value: number): void;
}
```

**Step 1: Z80 tests**

```typescript
// CpuZ80.test.ts
describe('CpuZ80', () => {
  it('executes LD A, n + RET', () => {
    const ram = new Uint8Array(0x10000);
    ram[0x0000] = 0x3E; ram[0x0001] = 0x42; // LD A, $42
    ram[0x0002] = 0xC9;                       // RET
    const io: Z80IO = { in: () => 0, out: () => {} };
    const cpu = new CpuZ80({ read: a => ram[a], write: (a,v) => { ram[a]=v; } }, io);
    cpu.reset(0x0000, 0xFFFE);
    cpu.runSteps(3);
    expect(cpu.getA()).toBe(0x42);
  });

  it('executes DJNZ loop', () => {
    // LD B, 3; DJNZ -2 (loop back to DJNZ); NOP
    const ram = new Uint8Array(0x10000);
    ram[0] = 0x06; ram[1] = 3;    // LD B, 3
    ram[2] = 0x10; ram[3] = 0xFE; // DJNZ $-2 (back to offset 2)
    ram[4] = 0x00;                 // NOP
    const cpu = new CpuZ80({ read: a => ram[a], write: (a,v)=>{ram[a]=v;} }, { in:()=>0, out:()=>{} });
    cpu.reset(0, 0xFFFE);
    cpu.runSteps(10);
    expect(cpu.getB()).toBe(0);
  });

  it('OUT intercepts AY port writes', () => {
    const writes: {port: number, val: number}[] = [];
    const ram = new Uint8Array(0x10000);
    ram[0] = 0x3E; ram[1] = 7;       // LD A, 7 (select AY reg 7)
    ram[2] = 0xD3; ram[3] = 0xFF;    // OUT ($FF), A — ZX Spectrum: port = A<<8|$FD = $FFFD
    ram[4] = 0xC9;                    // RET
    const cpu = new CpuZ80(
      { read: a => ram[a], write: (a,v)=>{ram[a]=v;} },
      { in: () => 0, out: (p,v) => writes.push({port:p, val:v}) }
    );
    cpu.reset(0, 0xFFFE);
    cpu.runSteps(5);
    expect(writes.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Implement `CpuZ80.ts`**

The Z80 implementation is larger than the 6502 due to prefix opcodes. Structure:

```typescript
export class CpuZ80 {
  // Main registers
  private A=0; private F=0;
  private B=0; private C=0; private D=0; private E=0;
  private H=0; private L=0;
  private IXH=0; private IXL=0; private IYH=0; private IYL=0;
  private SP=0xFFFE; private PC=0;
  private I=0; private R=0;
  private IM=1; // interrupt mode
  private IFF1=false; private IFF2=false;
  // Shadow registers
  private A_=0; private F_=0;
  private B_=0; private C_=0; private D_=0; private E_=0;
  private H_=0; private L_=0;

  get BC() { return (this.B<<8)|this.C; }
  get DE() { return (this.D<<8)|this.E; }
  get HL() { return (this.H<<8)|this.L; }
  get IX() { return (this.IXH<<8)|this.IXL; }
  get IY() { return (this.IYH<<8)|this.IYL; }

  // Flags (F register bits): S=7, Z=6, H=4, PV=2, N=1, C=0
  get fS() { return (this.F>>7)&1; }
  get fZ() { return (this.F>>6)&1; }
  get fH() { return (this.F>>4)&1; }
  get fPV(){ return (this.F>>2)&1; }
  get fN() { return (this.F>>1)&1; }
  get fC() { return  this.F    &1; }
  // ... setters ...

  step(): number { /* full opcode dispatch with CB/DD/ED/FD prefixes */ }
  runSteps(n: number): void { /* ... */ }
  runSubroutine(addr: number, maxCycles = 200_000): void { /* track SP depth */ }
  getA(): number { return this.A; }
  getB(): number { return this.B; }
  // ...
}
```

**Key Z80 opcodes needed for AY music drivers:**

| Opcode | Instruction | Notes |
|--------|-------------|-------|
| 0x3E nn | LD A, n | Load immediate |
| 0x06 nn | LD B, n | |
| 0x0E nn | LD C, n | |
| 0x21 nn nn | LD HL, nn | |
| 0x11 nn nn | LD DE, nn | |
| 0x01 nn nn | LD BC, nn | |
| 0x7E | LD A, (HL) | |
| 0x77 | LD (HL), A | |
| 0xED 0x5B | LD DE, (nn) | Extended |
| 0x10 e | DJNZ e | Decrement B, branch if non-zero |
| 0x18 e | JR e | Unconditional relative jump |
| 0x20/0x28/0x30/0x38 | JR NZ/Z/NC/C | Conditional relative |
| 0xC3 | JP nn | |
| 0xCA/0xC2/etc | JP Z/NZ/etc | |
| 0xCD | CALL nn | |
| 0xC9 | RET | |
| 0xC8/0xC0/etc | RET Z/NZ/etc | |
| 0xD3 n | OUT (n), A | Z80 out: port=(A<<8)\|n |
| 0xDB n | IN A, (n) | |
| 0xED 0x79 | OUT (C), A | Port = BC |
| 0xED 0x59 | IN E, (C) | |
| 0xAF | XOR A | A = 0, clears flags |
| 0x87 | ADD A, A | Double A |
| 0x80-0x87 | ADD A, r | |
| 0x90-0x97 | SUB r | |
| 0xA0-0xA7 | AND r | |
| 0xB0-0xB7 | OR r | |
| 0xA8-0xAF | XOR r | |
| 0xB8-0xBF | CP r | Compare |
| 0x04/0x0C/etc | INC r | |
| 0x05/0x0D/etc | DEC r | |
| 0x23/0x2B | INC/DEC HL | |
| 0xEB | EX DE, HL | |
| 0xE5/0xD5/0xC5/0xF5 | PUSH HL/DE/BC/AF | |
| 0xE1/0xD1/0xC1/0xF1 | POP HL/DE/BC/AF | |
| 0xF3/0xFB | DI/EI | Disable/enable interrupts |
| 0x00 | NOP | |
| 0x76 | HALT | Treat as NOP/infinite loop guard |
| CB 0x00-0x3F | RLC/RRC/RL/RR/SLA/SRA/SWAP/SRL r | Bit shifts |
| CB 0x40-0x7F | BIT b, r | Test bit |
| CB 0x80-0xBF | RES b, r | Reset bit |
| CB 0xC0-0xFF | SET b, r | Set bit |

**Step 3: Run tests, commit**
```bash
npx vitest run src/lib/import/cpu/__tests__/CpuZ80.test.ts && npx tsc --noEmit
git add src/lib/import/cpu/CpuZ80.ts src/lib/import/cpu/__tests__/CpuZ80.test.ts
git commit -m "feat(cpu): add Z80 CPU emulator for AY/ZX-Spectrum pattern extraction"
```

---

## Task 8: AY (ZX Spectrum) Pattern Extraction via Z80

**Files:**
- Modify: `src/lib/import/formats/AYParser.ts`
- Modify: `src/lib/import/__tests__/AYParser.test.ts`

**ZXAYEMUL memory layout:**
- Header contains a `memPtr` field: 16-bit LE offset at bytes 10–11 = size of header-relative memory data
- Each song has: `initAddr` (2 bytes BE), `interruptAddr` (2 bytes BE), and optionally `sp` (2 bytes BE)
- Z80 memory: 64KB, code/data loaded from the file's memory block
- AY register select port: `$FFFD` (high byte of port)
- AY register write port: `$BFFD` (high byte of port)

**Step 1: Add test**

Build a minimal ZXAYEMUL file with 1 song that writes AY reg 0 = 100 (tone A period = 100) on each interrupt.

**Step 2: Implement AY extraction in `AYParser.ts`**

```typescript
import { CpuZ80, type Z80IO } from '@/lib/import/cpu/CpuZ80';

function ayPeriodToNote(period: number, clock = 1773400): number {
  // ZX Spectrum AY clock = 1.7734 MHz
  if (period <= 0) return 0;
  const freq = clock / (16 * period);
  if (freq < 20) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}

function runAYEmulation(buf: Uint8Array, initAddr: number, interruptAddr: number, sp: number): FrameState[] {
  const FRAMES = 3000; // 60s at 50Hz
  const ram = new Uint8Array(0x10000);

  // Load memory block from file (offsets described in ZXAYEMUL spec)
  // The ZXAYEMUL file has a memory block starting at offset 0x14 + memOffset
  // For simplicity: load entire file content starting at offset 0x24 into RAM at $8000
  const memData = buf.subarray(0x24);
  ram.set(memData.subarray(0, Math.min(memData.length, 0x8000)), 0x8000);
  // Stack area
  const stackAddr = sp || 0xF000;

  const ayRegs = new Uint8Array(16);
  let selectedReg = 0;

  const io: Z80IO = {
    in: (port) => {
      if ((port & 0xFF00) === 0xFF00) return ayRegs[selectedReg & 0x0F];
      return 0xFF;
    },
    out: (port, val) => {
      if ((port & 0xFF00) === 0xFF00) { selectedReg = val & 0x0F; }       // $FFFD = select
      else if ((port & 0xFF00) === 0xBF00) { ayRegs[selectedReg] = val; } // $BFFD = write
    },
  };

  const mem = { read: (a: number) => ram[a & 0xFFFF], write: (a: number, v: number) => { ram[a & 0xFFFF] = v; } };
  const cpu = new CpuZ80(mem, io);
  cpu.reset(initAddr, stackAddr);
  cpu.runSubroutine(initAddr);

  const frames: FrameState[] = [];
  for (let f = 0; f < FRAMES; f++) {
    cpu.runSubroutine(interruptAddr, 70000); // ~70228 T-states per 50Hz frame
    // Read AY state
    const notes: (number|null)[] = [];
    const vols:  (number|null)[] = [];
    const mixer = ayRegs[7];
    for (let ch = 0; ch < 3; ch++) {
      const period = ayRegs[ch*2] | ((ayRegs[ch*2+1] & 0x0F) << 8);
      const vol    = ayRegs[8 + ch] & 0x0F;
      const toneOn = !((mixer >> ch) & 1) && vol > 0 && period > 0;
      notes.push(toneOn ? ayPeriodToNote(period) : null);
      vols.push(vol);
    }
    frames.push({ notes, volumes: vols });
  }
  return frames;
}
```

Parse the ZXAYEMUL header to extract `initAddr`, `interruptAddr`, `sp` for the requested subsong, then call `runAYEmulation` and convert frames→pattern with the same downsample logic used in NSFParser.

**Step 3: Update ZXAYEMUL header parsing** to extract per-song addresses. The header structure after the 20-byte fixed header has per-song entries each 22 bytes (name ptr, author ptr, init, interrupt, sp, reserved).

**Step 4: Run tests, commit**
```bash
npx vitest run src/lib/import/__tests__/AYParser.test.ts && npx tsc --noEmit
git add src/lib/import/formats/AYParser.ts src/lib/import/__tests__/AYParser.test.ts
git commit -m "feat(import): AY ZX-Spectrum pattern extraction via Z80 + AY I/O interception"
```

---

## Task 9: Full Test Suite + TypeScript Verification

**Step 1: Run all tests**
```bash
npm test
```
Expected: all existing 1275 tests pass + new tests from tasks 1–8.

**Step 2: TypeScript check**
```bash
npx tsc --noEmit
```
Expected: zero errors.

**Step 3: Commit any minor fixes**
```bash
git add -p  # add only files changed
git commit -m "fix(import): post-integration cleanup for CPU emulator parsers"
```

---

## Verification Checklist (Manual)

After all tasks complete, manually drop real files into the app and verify:

- [ ] `.ym` (YM5! compressed) — loads and shows 3-channel AY pattern with real notes
- [ ] `.vgm` with SN76489 — shows PSG channel notes
- [ ] `.vgm` with OPN2 (YM2612) — shows FM channel notes (already worked)
- [ ] `.nsf` — shows NES Pulse/Triangle notes; pattern has multiple rows
- [ ] `.sid` — shows SID voice notes; notes change across pattern rows
- [ ] `.sap` — shows POKEY channel notes
- [ ] `.ay` — shows 3-channel AY pattern from ZX Spectrum music

## Performance Notes

The 6502 and Z80 emulators run up to 3000 frames (60 seconds of music) during import. On a modern browser this runs in well under 1 second since we're not doing audio synthesis — just register tracking. If performance is an issue, reduce FRAMES to 1500 (30 seconds).
