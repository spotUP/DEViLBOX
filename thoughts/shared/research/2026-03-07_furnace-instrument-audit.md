---
date: 2026-03-07
topic: furnace-instrument-pipeline-audit
tags: [furnace, wasm, instruments, audit]
status: implemented
---

# Furnace Instrument Pipeline — Deep Audit

## Pipeline Overview

```
.fur file → FurnaceInstrumentParser.ts → InstrumentConverter.ts → FurnaceInstrumentEncoder.ts (0xF0B1 binary)
→ worklet setInstrumentFull → WASM furnace_dispatch_set_instrument_full() → DivInstrument → engine_set_instrument()
→ platform getIns() → macroInit() + chip registers
```

## Audit Results by Layer

### Layer 1: Encoder ↔ Decoder Binary Format — CLEAN

The 0xF0B1 binary format between TypeScript encoder and WASM decoder is **byte-perfect**.
All offsets, sizes, endianness, and sentinel markers match exactly.

- FM header (8 bytes) + 4 operators × 24 bytes = 104 bytes ✓
- 22 standard macros (7-byte header + len×4 values each) ✓
- 80 operator macros (sentinel 0xA0 + 4 ops × 20 params) ✓
- Chip-specific: GB (8+hwSeq), C64 (14), N163 (14), FDS (41), SNES (9) ✓
- Amiga: initSample + flags + 120 noteMap entries × 8 bytes ✓

### Layer 2: Converter — CLEAN

InstrumentConverter preserves all data. No fields dropped.
Safety fixes in encoder (C64 waveform forcing, ADSR sustain minimum) are intentional.

### Layer 3: Parser (New INS2/FINS Format) — 1 BUG

New format uses feature blocks. Core features fully parsed:
- FM ('FM'), Macros ('MA'), C64 ('64'), GB ('GB'), Sample ('SM') ✓
- SNES ('SN'), N163 ('N1'), FDS ('FD'), Operator Macros ('O1'-'O4') ✓

**BUG:** FM `block` field missing (v224+, used for OPL/OPLL frequency calculation)

Unparsed feature blocks preserved in rawBinaryData (not used in WASM path):
LD (OPL drums), WS (WaveSynth), MP (MultiPCM), SU (Sound Unit),
ES (ES5506), X1 (X1-010), NE (NES DPCM), EF (ESFM), PN (PowerNoise),
S2 (SID2), S3 (SID3)

### Layer 4: Parser (Old INST Format) — CRITICAL BUGS

Parser stops reading after standard macros (vol/arp/duty/wave/pitch/ex1-3).
Everything after that in the reference C++ is NOT extracted:

| Missing Data | Version | Severity |
|---|---|---|
| FM macros (alg/fb/fms/ams + 48 op macros) | v29+ | CRITICAL |
| Macro release points (12 standard + op macros) | v44+ | CRITICAL |
| Extended op macros (dam/dvb/egt/ksl/sus/vib/ws/ksr × 4 ops) | v61+ | CRITICAL |
| OPL drum config (fixedDrums, freq triplet) | v63+ | HIGH |
| Sample note map (120 entries) | v67+ | HIGH |
| N163 config (wave, wavePos, waveLen, waveMode) | v73+ | HIGH |
| Extended macros (panL/panR/phaseReset/ex4-ex8) | v76+ | CRITICAL |
| FDS config (modSpeed, modDepth, modTable) | v76+ | HIGH |
| OPZ fms2/ams2 | v77+ | HIGH |
| WaveSynth config | v79+ | MEDIUM |
| Macro modes (ADSR/LFO mode byte) | v84+ | HIGH |
| C64 noTest flag | v89+ | MEDIUM |
| Macro speed/delay per macro | v111+ | HIGH |

**Impact:** Old .fur files (pre-INS2 format) will have instruments with missing macros,
wrong release behavior, missing extended parameters. This affects FM chip songs especially.

### Layer 5: WASM Decoder → Platform — MISSING CHIP PARSERS

The WASM decoder (`furnace_dispatch_set_instrument_full`) only has chip-specific
parsing for 5 instrument types. All other types fall through to defaults:

| Parsed (5) | Not Parsed (~60) |
|---|---|
| GB (type 2) | NES (type 34) |
| C64 (type 3) | AY/AY8930 (types 6, 7) |
| N163 (type 17) | PCE (type 5) |
| FDS (type 15) | SCC (type 18) |
| SNES (type 29) | TIA (type 8) |
| | POKEY (type 20) |
| | Lynx (type 23) |
| | ESFM (type 55) |
| | MultiPCM (type 28) |
| | ES5506 (type 27) |
| | ...and 50+ more |

**What works for unparsed types:**
- FM data (operators, algorithm, feedback) — decoded for ALL types ✓
- Macros (all 22 standard + 80 op macros) — decoded for ALL types ✓
- Amiga/sample data — decoded for ALL types ✓

**What fails for unparsed types:**
- Chip-specific registers (e.g., AY noise period, PCE noise mode, ESFM operator routing)
- Platform gets default DivInstrument with zero-initialized chip-specific fields
- May produce wrong sound or silence depending on what the platform reads

**Mitigating factor:** Most platforms that need chip-specific data are "simpler" chips
where macros + FM data cover most of the sound. The platforms that need specific fields
most urgently are: NES (DPCM note map), ESFM (operator routing/delay), SID2 (volume/mixMode).

## Priority Fix List

### P0 — Critical (affects common formats)
1. **Old INST format: Complete macro parsing** — Add FM macros (v29+), release points (v44+),
   extended macros (v76+), macro modes (v84+), macro speed/delay (v111+)
2. **Old INST format: Extended op macros** — Add dam/dvb/egt/ksl/sus/vib/ws/ksr (v61+)

### P1 — High (affects specific chips)
3. **WASM chip parsers: NES** — Add DPCM note map parsing
4. **WASM chip parsers: ESFM** — Add operator routing/delay/outLvl parsing
5. **WASM chip parsers: AY/AY8930** — Add noise period, envelope shape
6. **Old INST format: Sample map** (v67+), N163 (v73+), FDS (v76+)
7. **New format: FM block field** (v224+)

### P2 — Medium (affects niche chips)
8. **WASM chip parsers: PCE, SCC, Lynx, TIA, POKEY, etc.**
9. **Old INST format: OPL drums** (v63+), WaveSynth (v79+)
10. **WASM chip parser: SID2** (volume, mixMode, noiseMode)

## Files Referenced

- `src/lib/import/formats/furnace/FurnaceInstrumentParser.ts` — Parser
- `src/lib/import/formats/InstrumentConverter.ts` — Converter
- `src/lib/import/formats/FurnaceInstrumentEncoder.ts` — Binary encoder (0xF0B1)
- `furnace-wasm/common/FurnaceDispatchWrapper.cpp:2925-3190` — WASM decoder
- `furnace-wasm/common/DivEngineStub.cpp` — Instrument storage + getIns()
- `third-party/furnace-master/src/engine/instrument.cpp` — Reference parser
- `third-party/furnace-master/src/engine/instrument.h` — Reference struct definitions
