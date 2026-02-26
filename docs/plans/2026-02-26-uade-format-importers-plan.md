---
date: 2026-02-26
topic: uade-format-importers
tags: [uade, amiga, import, parsers, instrument-names]
status: draft
---

# UADE Format Importers — Comprehensive Plan

## Research Sources

- `/Users/spot/Code/DEViLBOX/Reference Code/libxmp-master/src/loaders/` — C loaders (authoritative binary layouts)
- `/Users/spot/Code/DEViLBOX/Reference Code/libxmp-master/docs/formats/` — Format specs
- `/Users/spot/Code/DEViLBOX/Reference Code/uade-3.05/amigasrc/players/` — Original Amiga player ASM sources
- `/Users/spot/Code/DEViLBOX/Reference Music/` — Test files

---

## Current State (2026-02-26)

### Already implemented (dedicated TypeScript parsers)
| Parser | Formats | Status |
|--------|---------|--------|
| `MODParser.ts` | .mod, .mod_doc, .mod15, .mod_ntk, Prowiz variants | Complete |
| `XMParser.ts` | .xm | Complete |
| `SoundFXParser.ts` | .sfx, .sfx13 | Complete |
| `DigiBoosterParser.ts` | .digi | Complete |
| `OktalyzerParser.ts` | .okt, .okta | Complete |
| `MEDParser.ts` | .med, .mmd0, .mmd1, .mmd2, .mmd3 | Complete (PCM), partial (synth) |
| `HivelyParser.ts` | .ahx, .hvl, .thx | Complete |
| `FCParser.ts` | .fc, .fc13, .fc14, .sfc, .bfc, .bsi, .smod | Complete |
| `SoundMonParser.ts` | .bp, .bp3, .sndmon | Complete |
| `SidMon2Parser.ts` | .sid, .sid1, .sid2, .smn | Complete |
| `DigitalMugicianParser.ts` | .dmu, .dmu2, .mug, .mug2 | Complete |
| `FredEditorParser.ts` | .fred | Complete |
| `TFMXParser.ts` | .tfmx, .mdat, .tfmxpro, .tfmx1.5, .tfmx7v, .tfhd1.5 | Complete |

### Name extractors in UADEParser.tryExtractInstrumentNames
| Case | Formats | Status |
|------|---------|--------|
| DM2! magic | .dm2, .dm | Dead code (real files are binaries) |
| Sonic Arranger SOAR | .sa, .sa-p, .sa_old, .sonic, .lion | ✅ Complete |
| SoundFX | .sfx, .sfx13 | ✅ Complete (also has dedicated parser) |
| Generic 22-byte scanner | MOD-derived formats | ✅ Already catches IMS, many Prowiz variants |

---

## Phase A — Name extractors in UADEParser (quick wins, high value)

These formats remain in the UADE engine for playback but get real instrument names
in the instrument list. Implementation site: `UADEParser.ts → tryExtractInstrumentNames()`.

### A1: JamCracker (.jam, .jc)

**Reference:** `Reference Code/libxmp-master/docs/formats/JamCracker.txt`

**Binary layout:**
```
+0x00   4 bytes  "BeEp" magic
+0x04   2 bytes  sample count (BE)
[Repeat 'count' times, 40 bytes each]
  +0x00  31 bytes  sample name (ASCII, null-terminated)
  +0x1F   1 byte   flags
  +0x20   4 bytes  sample size (BE)
  +0x24   4 bytes  sample address (BE)
```

**Detection:** `bytes[0..3] === 'BeEp'`
**Name location:** Offset +6, 31-byte name, 40-byte stride
**Variable count:** Read from offset +4 (u16BE)

**TypeScript:**
```typescript
if (ext === 'jam' || ext === 'jc') {
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic === 'BeEp' && bytes.length >= 6) {
    const sampleCount = view.getUint16(4, false);
    const STRIDE = 40;
    const NAME_OFF = 6;  // start of first entry
    const NAME_LEN = 31;
    const names: string[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const base = NAME_OFF + i * STRIDE;
      if (base + NAME_LEN > bytes.length) break;
      let name = '';
      for (let j = 0; j < NAME_LEN; j++) {
        const c = bytes[base + j];
        if (c === 0) break;
        if (c < 0x20 || c > 0x7e) { name = ''; break; }
        name += String.fromCharCode(c);
      }
      const trimmed = name.trim();
      if (trimmed) names.push(trimmed);
    }
    if (names.length > 0) return names;
  }
}
```

---

### A2: TCB Tracker (.tcb)

**Reference:** `Reference Code/libxmp-master/docs/formats/tcb-tracker.txt`

**Binary layout:**
```
+0x00   8 bytes  "AN COOL." or "AN COOL!" magic
+0x08   2 bytes  unknown
+0x0A   2 bytes  pattern count (BE)
+0x0C   2 bytes  unknown
+0x0E 128 bytes  pattern sequence
+0x8E   1 byte   song length
+0x8F   1 byte   unknown
+0x90   2 bytes  unknown
+0x92  16 × 8 bytes  instrument names (8 chars each, NOT null-terminated — space-padded)
```

**Detection:** `bytes[0..5] === 'AN COO'` (check first 6 chars)
**Name location:** Offset +0x92, 8-byte names, fixed 16 instruments
**Name size:** 8 bytes, space-padded (no null)

**TypeScript:**
```typescript
if (ext === 'tcb') {
  if (bytes.length >= 0x92 + 16 * 8) {
    const magic6 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    if (magic6 === 'AN COO') {
      const names: string[] = [];
      for (let i = 0; i < 16; i++) {
        const base = 0x92 + i * 8;
        let name = '';
        for (let j = 0; j < 8; j++) {
          const c = bytes[base + j];
          if (c === 0 || c === 0x20) break;  // stop at null or space (space-padded, no null-term)
          if (c < 0x20 || c > 0x7e) { name = ''; break; }
          name += String.fromCharCode(c);
        }
        const trimmed = name.trim();
        if (trimmed) names.push(trimmed);
      }
      if (names.length > 0) return names;
    }
  }
}
```

**Note:** TCB names are 8 bytes and may be space-padded rather than null-terminated. Adjust scanner if needed.

---

### A3: Quadra Composer / EMOD (.emod, .qc)

**Reference:** `Reference Code/libxmp-master/docs/formats/QuadraComposer.txt`
**Also:** `Reference Code/libxmp-master/src/loaders/emod_load.c`

**Binary layout (IFF FORM-EMOD):**
```
+0x00   4 bytes  "FORM"
+0x04   4 bytes  file size - 8 (BE)
+0x08   4 bytes  "EMOD"
+0x0C   4 bytes  "EMIC"
+0x10   4 bytes  EMIC chunk size (BE)
+0x14   2 bytes  EMIC version
+0x16  20 bytes  Song name
+0x2A  20 bytes  Composer name
+0x3E   1 byte   Tempo
+0x3F   1 byte   Number of samples (N)
[Repeat N times, variable stride ~32 bytes per sample]:
  +0   1 byte   sample number
  +1   1 byte   volume
  +2   2 bytes  sample length (words)
  +4  20 bytes  sample name ← NAMES HERE
  +24  1 byte   control (loop flag)
  +25  1 byte   finetune
  +26  2 bytes  repeat start (words)
  +28  2 bytes  repeat length (words)
  +30  4 bytes  sample data offset (from file start)
```

**Detection:** Check "FORM" at +0, "EMOD" at +8
**Name location:** Inside EMIC chunk, after fixed header, per-sample entries at offset +4 from entry start, 20-byte name
**Sample count:** byte at EMIC+0x3F
**Entry size:** 34 bytes per sample (1+1+2+20+1+1+2+2+4)

**TypeScript:**
```typescript
if (ext === 'emod' || ext === 'qc') {
  const form = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const emod = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  const emic = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (form === 'FORM' && emod === 'EMOD' && emic === 'EMIC' && bytes.length >= 0x40) {
    const sampleCount = bytes[0x3F];
    const ENTRY_SIZE = 34;
    const NAME_OFF   = 4;
    const NAME_LEN   = 20;
    const ENTRIES_START = 0x40;
    const names: string[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const base = ENTRIES_START + i * ENTRY_SIZE + NAME_OFF;
      if (base + NAME_LEN > bytes.length) break;
      const name = readFixedAscii(bytes, base, NAME_LEN);
      if (name) names.push(name);
    }
    if (names.length > 0) return names;
  }
}
```

**Note:** Verify exact offsets against a reference .emod file from exotica before committing.

---

### A4: AMOS Music Bank (.abk)

**Reference:** `Reference Code/libxmp-master/docs/formats/AMOS_Music_Bank_format.txt`
**Also:** `Reference Code/libxmp-master/src/loaders/abk_load.c`

**Binary layout:**
```
+0x00   4 bytes  "AmBk" magic
+0x04   2 bytes  bank number (should be 3 for music)
+0x06   2 bytes  memory type
+0x08   4 bytes  bank length
+0x0C   8 bytes  bank name ("Music   ")
+0x14   Start of main header:
  +0x00  4 bytes  instruments data offset (from start of main header)
  +0x04  4 bytes  songs data offset
  +0x08  4 bytes  patterns data offset
  +0x0C  4 bytes  always 0
[At instruments data (offset from main header start):]
  +0x00  2 bytes  instrument count
  [Repeat count times, 0x20 (32) bytes each:]
    +0x00  4 bytes  sample data offset
    +0x04  4 bytes  sample repeat offset
    +0x08  2 bytes  loop offset (words)
    +0x0A  2 bytes  loop length (words)
    +0x0C  2 bytes  default volume (0-64)
    +0x0E  2 bytes  sample length (words)
    +0x10 16 bytes  sample name (ASCII, null-padded) ← NAMES HERE
```

**Detection:** "AmBk" at +0, bank number = 3 at +4
**Name location:** instruments offset + 2 + (i × 32) + 0x10, 16-byte name
**Variable count:** From instruments header

**TypeScript:**
```typescript
if (ext === 'abk') {
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic === 'AmBk' && bytes.length >= 0x20) {
    const MAIN_HEADER_OFF = 0x14;
    const instrOff = view.getUint32(MAIN_HEADER_OFF + 0, false) + MAIN_HEADER_OFF;
    if (instrOff + 2 > bytes.length) return null;
    const instrCount = view.getUint16(instrOff, false);
    const STRIDE   = 32;
    const NAME_OFF = 0x10;
    const NAME_LEN = 16;
    const names: string[] = [];
    for (let i = 0; i < instrCount; i++) {
      const base = instrOff + 2 + i * STRIDE + NAME_OFF;
      if (base + NAME_LEN > bytes.length) break;
      const name = readFixedAscii(bytes, base, NAME_LEN);
      if (name) names.push(name);
    }
    if (names.length > 0) return names;
  }
}
```

**Note:** Verify offset arithmetic against abk_load.c. The AMOS bank format has several header variants (truncated forms from ripped files) — guard against out-of-bounds reads.

---

## Phase B — Full Dedicated TypeScript Parsers

These formats have complete format specifications AND libxmp C source as reference.
A dedicated TypeScript parser would bypass UADE for these formats, giving full
pattern/instrument editing, proper note ranges, and effects mapping.

Priority order based on format complexity and ROI:

### B1: JamCracker (.jam, .jc) — PRIORITY: HIGH

**Reference:** `Reference Code/libxmp-master/docs/formats/JamCracker.txt`
**Also:** `Reference Code/libxmp-master/src/loaders/jam_load.c`

**Why worth a dedicated parser:**
- Complete format spec available
- 4-channel Amiga tracker (same complexity as SoundFX which already has a parser)
- Used for many Amiga game soundtracks (Agony, Lotus, etc.)
- Effects: arpeggio, vibrato, volume, portamento, phase-shift

**Format overview:**
```
"BeEp" magic
sample count (u16BE)
[N × 40-byte sample headers] — name(31) + flags(1) + size(4) + addr(4)
pattern count
[pattern list: row count + offset pairs]
pattern list (order table)
[pattern data: 8-byte cells per voice × 4 voices × variable rows]
[raw sample PCM at end]
```

**Pattern cell (8 bytes):**
- period (u16BE, Amiga period)
- sample index (u8)
- speed flag (u4) + arpeggio (u4)
- vibrato info (u8)
- phase shift (u8)
- volume (u8)
- portamento (u8)

**New file:** `src/lib/import/formats/JamCrackerParser.ts`

---

### B2: Quadra Composer (.emod, .qc) — PRIORITY: HIGH

**Reference:** `Reference Code/libxmp-master/docs/formats/QuadraComposer.txt`
**Also:** `Reference Code/libxmp-master/src/loaders/emod_load.c`

**Why worth a dedicated parser:**
- IFF-structured format (clean, well-documented)
- Complete format spec: patterns, samples, song order, effects
- Similar complexity to SoundFX parser

**Format overview:**
```
FORM / EMOD / EMIC (info + samples + order) + PATT (pattern data) + 8SMP (sample PCM)
```

**Effects mapping:**
```
0yz  Arpeggio
1yz  Pitch slide up
2yz  Pitch slide down
3yz  Tone portamento
4yz  Vibrato
5yz  Volume slide + port
6yz  Volume slide + vibrato
7yz  Tremolo
Ayz  Volume slide
Bxx  Pattern jump
Cxx  Set volume
Dxx  Pattern break
Exy  Extended (filter, fine slides, loop, retrig, etc.)
Fxx  Set tempo
```

**New file:** `src/lib/import/formats/QuadraComposerParser.ts`

---

### B3: AMOS Music Bank (.abk) — PRIORITY: MEDIUM

**Reference:** `Reference Code/libxmp-master/docs/formats/AMOS_Music_Bank_format.txt`
**Also:** `Reference Code/libxmp-master/src/loaders/abk_load.c`

**Why worth a dedicated parser:**
- Widely used format for AMOS Basic games
- Many Amiga game soundtracks stored in this format
- Complete spec available

**Format overview:**
- 4-channel tracker
- Songs, patterns, instruments all in one file
- Uses Startrekker-style pattern format (16 bytes per row × 4 channels)

**Complexity note:** AMOS Music Banks can have multiple songs per file. The parser would
need to handle song selection similar to how TFMX handles subsongs.

**New file:** `src/lib/import/formats/AMOSMusicBankParser.ts`

---

### B4: TCB Tracker (.tcb) — PRIORITY: LOW

**Reference:** `Reference Code/libxmp-master/docs/formats/tcb-tracker.txt`

**Why lower priority:**
- Atari ST format (not Amiga-native — plays via UADE's Atari support)
- Only 8-byte instrument names
- Limited sample set (16 instruments max)
- Very few real-world files available

**Format overview:**
```
"AN COOL." or "AN COOL!" magic
pattern count, sequence, song length
instrument names (16 × 8 bytes)
pattern data (4 channels × 64 rows × 2-byte cells)
sample metadata (volume, sizes, offsets)
raw sample PCM
```

**New file:** `src/lib/import/formats/TCBTrackerParser.ts` — only if reference .tcb files are found

---

## Phase C — Formats Not Parseable (Compiled Amiga Binaries)

The following UADE formats are compiled Amiga executables. There is no static
instrument name table — names come from runtime IFF sample headers or are not
stored at all. These cannot be parsed with static TypeScript.

| Format | Extensions | Reason |
|--------|-----------|--------|
| Richard Joseph | .rj, .rjp | Compiled loadseg binary |
| Dave Lowe | .dl, .dl_deli, .dln | Compiled binary |
| Mark Cooksey | .mc, .mcr, .mco | Compiled binary |
| Delta Music 1 | .dm, .dlm1, .dm1 | Compiled binary |
| Delta Music 2 | .dm2, .dlm2 | Compiled binary |
| JochenHippel | .hip, .hip7, .hipc, .hst | Compiled with embedded player |
| Rob Hubbard | .rh, .rho | Compiled SID/Amiga binary |
| Tim Follin | .tf | Compiled binary |
| Ben Daglish | .bd, .bds | Compiled binary |
| DavidWhittaker | .dw, .dwold | Compiled binary |
| Various others | .bss, .hot, .aam, etc. | Compiled binaries |

Generic 22-byte scanner may catch MOD-style name blocks in:
- Prowiz-packed MOD variants (all decompress to standard MOD layout)
- Images Music System .ims (MOD-identical instrument header)
- Various ProTracker-derived formats

---

## Implementation Order

### Immediate (Phase A — instrument naming)

1. **A1: JamCracker names** — 15 min, `jam`/`jc` case in `tryExtractInstrumentNames`
2. **A2: TCB Tracker names** — 15 min, `tcb` case
3. **A3: Quadra Composer names** — 30 min, FORM/EMOD IFF walk
4. **A4: AMOS Music Bank names** — 30 min, AmBk header walk

### Near-term (Phase B — dedicated parsers)

5. **B1: JamCracker parser** — 1–2 hours
   - `src/lib/import/formats/JamCrackerParser.ts`
   - Route `jam`/`jc` away from UADE in `parseModuleToSong`

6. **B2: Quadra Composer parser** — 2–3 hours (IFF chunked format, more complex)
   - `src/lib/import/formats/QuadraComposerParser.ts`
   - Route `emod`/`qc` away from UADE

7. **B3: AMOS Music Bank parser** — 3–4 hours (multi-song support)
   - `src/lib/import/formats/AMOSMusicBankParser.ts`
   - Route `abk` away from UADE

### Future (Phase B4 + beyond)

8. **B4: TCB Tracker parser** — if reference .tcb files obtained
9. **DigiBooster Pro (.dbm)** — if .dbm files arrive (not currently in UADE_EXTENSIONS, libopenmpt handles these)

---

## Verification Checklist

After each Phase A item:
- `npx tsc --noEmit` — zero errors
- Load a reference file from `Reference Music/` → instrument names appear in instrument list
- Generic scanner no longer needed (format-specific result takes priority)

After each Phase B parser:
- `npx tsc --noEmit` — zero errors
- Load reference file → full pattern data, instrument names, correct note ranges
- Playback via native parser (not UADE) sounds equivalent to UADE playback
- Save as `.dbx` → reload → no data loss

---

## Reference Files Available

| Format | Reference Music Location |
|--------|------------------------|
| JamCracker | Need files — ask for .jam samples |
| TCB Tracker | Need files — ask for .tcb samples |
| Quadra Composer | Need files — ask for .emod samples |
| AMOS Music Bank | Need files — ask for .abk samples |
| Sonic Arranger | `/Reference Music/Sonic Arranger/` ✅ |
| Delta Music | `/Reference Music/Delta Music/` ✅ |
| Richard Joseph | `/Reference Music/Richard Joseph/` ✅ |
| SoundFX | Use existing .sfx files ✅ |
