---
date: 2026-04-06
topic: uade-full-editability-plan
tags: [uade, format-audit, editing, plan]
status: final
---

# Plan: Make Every UADE Format Fully Editable

## Current State

- **172 formats** in eagleplayer.conf
- **3 fully editable** (DL, DH, FT) — native parser + encoder + layout
- **99 partial** — have some capabilities (samples/layout) but missing encoder or real patterns
- **70 stubs** — empty patterns, no sample extraction, no encoder

## What "Fully Editable" Means

For each format:
1. **Real pattern data** — parsed from binary, not empty stubs
2. **Real sample extraction** — PCM from the module binary
3. **Cell encoder** — TrackerCell → format-specific binary bytes
4. **UADEPatternLayout** — maps (pattern, row, channel) → file byte offset
5. **Chip RAM patching** — edits written to emulated memory, replayer picks them up
6. **Export** — modified module readable back from chip RAM

## Strategy

### Tier 1: Standard Tracker Formats (MOD-like cell encoding)
These use standard ProTracker 4-byte cells (period + sample + effect). One encoder handles them all.

**Approach:** Generic MOD cell encoder + format-specific header/offset calculator.

**Formats (estimated ~40):**
- All PTK-Prowiz variants (40a, 50a, 60a, p61a, etc.) — already have SAMPLES+ENCODER+LAYOUT
- Soundtracker-IV, UltimateSoundtracker — MOD-like
- DIGI-Booster — MOD-like with extra channels
- SoundFX, SoundControl — MOD variants
- Oktalyzer — 8-channel MOD variant
- JamCracker — MOD-like with effects
- QuadraComposer — MOD variant
- GMC, Synth, TCB_Tracker — MOD-like

**Work needed:** Verify each has proper getCellFileOffset. Many already work via the PTK-Prowiz catch-all.

### Tier 2: Data-Only Formats (clear binary structure, no 68k code)
These have fixed headers with clean chunk/offset layouts. Can be parsed by reading the binary directly.

**Approach:** Read header, compute offsets, implement encoder.

| Format | Prefixes | Files | Binary Structure | ASM Source |
|--------|----------|-------|-----------------|------------|
| DavidHanney | dh | 8 | IFF chunks (DSNG/SEQU/INFO/BLK) | Binary only |
| FashionTracker | ex | 14 | Fixed header, MOD cells at 0x02D6 | YES |
| FredGray | gray | 12 | HUNK + FREDGRAY header + pointer table | Binary only |
| Quartet | qpa | 7 | 68k-BRA + data | YES |
| SteveBarrett | sb | 8 | 68k-BRA + data | YES |
| ThomasHermann | thm | 1 | HUNK + data | YES |
| KimChristensen | kim | 1 | Data format | YES |
| Desire | dsr | 5 | Data format | YES |

**Status:** DH and FT already done. Others need investigation.

### Tier 3: 68k Executables with UADE ASM Source (53 formats)
These are compiled 68k executables where data is found via opcode scanning. The UADE assembly source documents the scanning algorithm.

**Approach per format:**
1. Read UADE .asm source for InitPlayer/SampleInit
2. Replicate the opcode scanning in TypeScript
3. Find pattern data offset and cell encoding
4. Implement parser + encoder

**Highest priority (by file count):**

| Format | Prefixes | Ref Files | ASM Lines | Complexity |
|--------|----------|-----------|-----------|------------|
| BenDaglish | bd | 85 | ~1040 | HIGH — multi-path scanning, feature flags |
| SoundMaster | sm,sm1-3 | 44 | ~750 | HIGH — indirect pointer chains |
| JasonPage | jpn,jp | 77 | ~600 | HIGH — 4 sub-variants, two-file |
| SeanConran | scr | 17 | ~1388 | MEDIUM |
| JeroenTel | jt | 19 | ~1237 | MEDIUM — sample extraction done |
| MarkCooksey | mc,mcr,mco | 13 | ~1702 | HIGH — 4 sub-variants |
| RobHubbard | rh | varies | ~800 | HIGH — compiled synth replayer |
| RichardJoseph | rjp | 178 | ~600 | MEDIUM — two-file, companion done |
| JochenHippel | hip,mcmd | varies | ~500 | MEDIUM |
| WallyBeben | wb | 24 | ~1050 | MEDIUM — sample+phrase done |
| FuturePlayer | fp | varies | ~400 | MEDIUM |
| ManiacsOfNoise | mon | varies | ~600 | MEDIUM |

**For each format, the implementation session should:**
1. Read the UADE .asm SampleInit to understand sample descriptors
2. Read InitPlayer to understand how data pointers are discovered
3. Read the Play routine to understand cell encoding
4. Hex dump a test file to verify understanding
5. Implement parser + encoder + layout
6. Type-check + test with MCP load_file

### Tier 4: Formats Without ASM Source (17 formats)
These have only binary UADE players — no assembly source to reference.

**Approach:** Use the dynamic layout (Paula log source addresses) for basic editing. For full editing, would need to disassemble the binary player.

| Format | Prefixes | Notes |
|--------|----------|-------|
| JasonBrooke | jcb,jcbo,jb | Prefix-only detection, binary player |
| FredGray | gray | HUNK exe, has FREDGRAY magic |
| GlueMon | glue,gm | Binary player |
| JankoMrsicFlogel | jmf | Binary player |
| ManiacsOfNoise | mon | Binary player |
| DigitalSonixChrome | dsc | Binary player |
| Laxity | powt,pt | Binary player |
| Special-FX | jd | Binary player |
| SpeedySystem | ss | Binary player |
| BenDaglish-SID | BDS | Binary player |
| JochenHippel-7V | hip7,s7g | Binary player |

**Strategy:** Use enhanced scan + dynamic layout for these. Full native editing not feasible without disassembly.

### Tier 5: Synth Formats (3 formats)
Fred Editor, Ron Klaren, SunTronic — algorithmic synthesis, no DMA samples.

**Strategy:** These need synth parameter editing, not pattern cell editing. Different architecture needed (direct register writes via chip RAM). Deferred.

## Implementation Order

### Phase 1: Quick Wins (1 session)
- Verify all Tier 1 (MOD-like) formats have working encoders
- Complete remaining Tier 2 data formats (FredGray, Quartet, SteveBarrett)
- Wire up WallyBeben encoder (has patterns, needs encoder)
- Wire up JeroenTel encoder (has samples, needs patterns+encoder)

### Phase 2: High-File-Count Formats (2-3 sessions)
- BenDaglish (85 files) — trace position list + track data
- SoundMaster (44 files) — trace indirect pointer chains
- Jason Page (77 files) — 4 sub-variants, companion loading done
- Richard Joseph (178 files) — companion loading done, need pattern parsing

### Phase 3: Medium-Priority Formats (2-3 sessions)
- MarkCooksey (13 files) — 4 sub-variants, sample extraction done
- SeanConran (17 files)
- JochenHippel variants
- RobHubbard
- FuturePlayer
- ManiacsOfNoise
- Remaining Tier 3 formats

### Phase 4: Polish (1 session)
- Tier 4 formats: verify dynamic layout works for all
- Tier 5 synth formats: evaluate synth parameter editing
- Comprehensive testing with MCP load_file across all formats

## Key Files

- **UADE ASM sources:** `third-party/uade-3.05/amigasrc/players/wanted_team/`
- **eagleplayer.conf:** `third-party/uade-3.05/eagleplayer.conf` — authoritative prefix→format map
- **Format parsers:** `src/lib/import/formats/*Parser.ts`
- **Encoders:** `src/engine/uade/encoders/`
- **Pattern layout types:** `src/engine/uade/UADEPatternEncoder.ts`
- **Chip RAM editor:** `src/engine/uade/UADEChipEditor.ts`
- **Format routing:** `src/lib/import/parsers/AmigaFormatParsers.ts`
- **UADE parser orchestration:** `src/lib/import/formats/UADEParser.ts`
- **Dynamic layout builder:** `src/engine/uade/UADEFormatAnalyzer.ts`

## Per-Format Implementation Template

For each Tier 3 format:
```
1. Read: third-party/uade-3.05/amigasrc/players/wanted_team/{Format}/src/*.asm
   - SampleInit: sample descriptor format, count, loop points
   - InitPlayer: data pointer discovery (opcode scanning)
   - Play/Interrupt: cell encoding, pattern structure
   
2. Analyze: xxd test file, verify header/pointer understanding

3. Implement:
   a. Parser: src/lib/import/formats/{Format}Parser.ts
      - Sample extraction (createSamplerInstrument)
      - Pattern data parsing (cell decoding)
      - UADEPatternLayout with getCellFileOffset + encodeCell
   b. Encoder: src/engine/uade/encoders/{Format}Encoder.ts (if variable-length)
   c. Routing: src/lib/import/parsers/AmigaFormatParsers.ts (if needed)

4. Verify:
   - npm run type-check
   - MCP: load_file → verify instruments + patterns
   - MCP: set_cell → verify edit persists
   - MCP: play → verify audio plays correctly
```

## Success Criteria

- Every format in eagleplayer.conf either:
  - Has a native parser with encoder + layout (Tiers 1-3), OR
  - Uses dynamic layout with period+volume editing (Tier 4), OR
  - Is documented as synth-only with explanation (Tier 5)
- `npm run type-check` passes
- All test files load with real patterns and instruments
- Cell edits write to chip RAM and affect playback
