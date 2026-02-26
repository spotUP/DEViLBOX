---
date: 2026-02-26
topic: missing-format-imports
tags: [import, vgm, ym, nsf, sap, sid, ay, chiptune]
status: draft
---

# Missing Format Imports — Design

## Context

DEViLBOX already covers 20+ Amiga/tracker formats plus the UADE catch-all for 130+ exotic
Amiga types. The following popular chiptune formats from outside the Amiga world are absent:

- **VGM/VGZ** — Video Game Music, universal chip-dump format (vgmrips.net)
- **YM** — Atari ST AY/YM2149 register dumps (Leonard's format, huge archive)
- **NSF/NSFE** — NES Sound Format (2A03 + expansion chips)
- **SAP** — Atari 8-bit POKEY
- **SID** — Commodore 64 SID (6581/8580)
- **AY** — ZX Spectrum AY format

## Conversion Strategy

All six are **register-dump or CPU-code formats** — they don't have explicit note/pattern data.
The extraction approach for each:

1. Parse format-specific binary header → identify chip type(s) and sample rate
2. Replay register writes frame-by-frame (or scan the pre-captured register states for YM/SAP)
3. Detect note-on/note-off events from frequency + volume/key-on register writes
4. Group events per channel into pattern rows at the format's native tick rate
5. Extract unique parameter combinations as FurnaceConfig instrument definitions
6. Emit a `Song` object with patterns, instruments, and optional samples

Where full reconstruction isn't feasible (complex macro formats), fall back to:
- Creating instruments from detected register states
- A single pattern row per detected "note event"
- UADE as fallback for actual playback

## Per-Format Details

### VGM/VGZ (`VGMParser.ts`)

**Spec:** VGM 1.00–1.71. Header at offset 0 identifies version, chip clocks, data offset.
Command stream: 1-byte opcode + 0–2 data bytes. Key opcodes:
- `0x50` SN76489, `0x52/0x53` YM2612, `0x5A/0x5B` YM3812, `0x5C/0x5D` YM2203
- `0x61` wait N samples, `0x62/0x63` wait 735/882 samples (60/50 Hz frame)
- `0x66` end of data
- GZ-compressed variant (`.vgz`) = gzip-decompress first

**Chip mapping:**
- YM2612/YM3438 → `FurnaceOPN` (FM, 6 channels)
- YM3812/OPL2 → `FurnaceOPL`
- YMF262/OPL3 → `FurnaceOPL`
- SN76489/SN76496 → `FurnaceSN`
- AY-3-8910/YM2149 → `FurnaceAY`
- YM2203/OPN → `FurnaceOPN2203`

**Pattern reconstruction:** Detect note-on from CH3 frequency write + key-on (addr 0x28).
Detect note-off from key-off. Convert F-number + block to MIDI note via standard OPN formula.

### YM (`YMParser.ts`)

**Spec:** Leonard's YM format. Magic `YM2!`/`YM3!`/`YM3b`/`YM4!`/`YM5!`/`YM6!`.
YM5/YM6: interleaved register frames (16 regs × N frames), LZH-compressed.
YM2/YM3: uncompressed, 14 regs × N frames, 50 Hz.

**Extraction:** Each frame = one row of AY register state. Convert:
- Regs 0-1: channel A pitch → note
- Regs 2-3: channel B pitch → note
- Regs 4-5: channel C pitch → note
- Regs 8-10: volume → determine note-on/off

Map to 3-channel `FurnaceAY` pattern.

**Library:** Need LZH decompressor for YM5/6. Use a small pure-TS implementation or
copy the ~150-line LZH decoder used in other YM players.

### NSF/NSFE (`NSFParser.ts`)

**Spec:** NSFE preferred (has metadata). NSF: 128-byte header + 6502 CPU code.
Header contains: load/init/play addresses, number of songs, NTSC/PAL rate, bank-switching.

**Approach:** Rather than running a 6502 emulator, extract:
- `expSound` byte → expansion chip flags (FDS, MMC5, VRC6, N163, Sunsoft 5B)
- Song metadata from NSFE chunks (song names, durations, authors)
- Create a `FurnaceNES` instrument per detected expansion chip channel
- One "instrument" per song (referenced as a multi-subsong collection)

Full pattern extraction requires CPU emulation → out of scope for initial implementation.
Instead: create instrument stubs + metadata, mark as UADE-playable if UADE supports NSF.

### SAP (`SAPParser.ts`)

**Spec:** Plain ASCII header lines terminated by `0xFF 0xFF`, then 6502 binary.
Header fields: `AUTHOR`, `NAME`, `DATE`, `SONGS`, `DEFSONG`, `TYPE` (B/C/D/S), `FASTPLAY`.

**Approach:** Parse header metadata → extract song count → create one `FurnacePOKEY`
instrument stub per song with the SAP metadata attached.
Full extraction would require POKEY+6502 emulation → UADE fallback for playback.

### SID (`SIDParser.ts`)

**Spec:** PSID/RSID. 124-byte header: magic `PSID`/`RSID`, version (1-4), load/init/play
addresses, song count, default song, flags (NTSC/PAL, 6581/8580, 1/2/3 SID chips).
Optional metadata in v2+: title, author, released, second/third SID address.

**Extraction:**
- Detect dual/triple SID from flags
- Map SID model to `FurnaceSID6581` or `FurnaceSID8580`
- Create instrument stubs with ADSR defaults from SID convention
- Multi-subsong: one entry per song index (like UADE subsong handling)

### AY (`AYParser.ts`)

**Spec:** Vortex Tracker / AY-emul format. Magic `ZXAYEMUL`. Header:
- Offset 6: file author, misc info pointers
- Tracks array with per-song pointers to player + AY register data

**Approach:** Parse header for song count/names → extract AY chip type (AY/YM) →
create `FurnaceAY` instrument stubs. Full extraction requires Z80 CPU emulation.

## File Structure

```
src/lib/import/formats/
  VGMParser.ts      ← new
  YMParser.ts       ← new
  NSFParser.ts      ← new
  SAPParser.ts      ← new
  SIDParser.ts      ← new
  AYParser.ts       ← new
src/lib/import/
  parseModuleToSong.ts  ← add 6 new branches
src/components/dialogs/
  ImportModuleDialog.tsx  ← add extensions to accepted list
```

## Integration Points

- `parseModuleToSong.ts`: Add extension checks before the UADE catch-all
- `ImportModuleDialog.tsx`: Add `.vgm,.vgz,.ym,.nsf,.nsfe,.sap,.sid,.ay` to accepted extensions
- Each parser implements the same interface: `(data: Uint8Array, filename: string) => Promise<Song>`
- Multi-subsong: parsers return `songs[]` array; `ImportModuleDialog` handles selection same as UADE

## Success Criteria

**Automated:** `npx tsc --noEmit` passes, `npm test` passes

**Manual:**
- [ ] `.vgm` file with OPN2 chip loads and shows FM instrument params
- [ ] `.ym` file loads with 3-channel AY pattern visible
- [ ] `.nsf` file loads with NES instrument stubs and song count metadata
- [ ] `.sap` file loads with POKEY instrument stub and author/title
- [ ] `.sid` file loads with C64 SID instrument stub and song count
- [ ] `.ay` file loads with AY instrument stub
- [ ] All extensions appear in the import dialog file picker
