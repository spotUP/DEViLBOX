---
date: 2026-04-12
topic: deep-format-audit-handoff
tags: [audit, formats, patterns, samples, editability, chip-ram, buzzmachine]
status: final
---

# Deep Format Audit Handoff — 2026-04-12

## What Was Done

Two-phase session: first fixed playback failures from the April 11 smoke test, then executed a comprehensive deep integration audit of all 638 format entries.

### Phase 1: Playback Fixes (continuing April 11 handoff)

**Commits:**
- `8d29c9f9e` — Buzzmachine stereo buffer view + Core Design native parser routing
- `de853081f` — **Buzzmachine effects stereo interleaved I/O** — root cause: Buzz API `numSamples` means stereo PAIRS (numSamples×2 floats). Worklet was writing mono input / reading mono output. Fixed all 23 effects.
- `4c57382f3` — UADE scan warnings no longer appended to song titles

**Browser debugging confirmed:**
- MusicLine pink2.ml: very quiet but not silent (rmsAvg=0.0003)
- FredMon aspar.fred: plays fine (rmsAvg=0.196), "sounds terrible" is subjective quality
- 3 UADE formats with working alternates (Jesper Olsen, Richard Joseph, Infogrames)
- 3 genuine UADE limitations (IFF-SMUS, Composer 670, MaxTrax)

### Phase 2: Deep Integration Audit

**The problem:** localhost:4444 was "all green" for playback, but 49% of formats had stub/empty patterns, 52% had names-only samples, and 57% used generic UADEEditableSynth with no deep integration.

**New infrastructure built:**

1. **Chip RAM Pattern Reader** (`138f5104c`)
   - `src/engine/uade/UADEChipRAMPatternReader.ts` — bulk-reads pattern data from UADE's emulated Amiga chip RAM after the 68k replayer unpacks a module
   - `decodeModCell()` in `UADEPatternEncoder.ts` — standard ProTracker 4-byte cell decoder covering all packed MOD variants
   - `UADEPatternLayout.decodeCell` — optional per-format decoder override
   - `UADEEditable.onStarted` hook in `NativeEngineRouting.ts` — auto-triggers chip RAM reading 500ms after UADE loads

2. **57 Custom Format Decoders** (3 commits)
   - Batch 1 (`ed593caec`): SoundFX, Oktalyzer, DigiBooster, ChuckBiscuits, NRU, 669
   - Batch 2 (`13da38d00`): DSM, DTM, IMS, KRIS, GameMusicCreator, STP, STM, UNIC, MTM, Graoumf (GTK+GT2), PLM, QuadraComposer, AMF, GMC, XMF, TCBTracker, FC
   - Batch 3: ArtOfNoise, DeltaMusic1/2, DigitalMugician, EarAche, FAR, InStereo1/2, JamCracker, Hippel7V, MED, MFP, MadTracker2, RichardJoseph, RobHubbard, RonKlaren, SCUMM, SeanConnolly, SidMon1, SonicArranger, SoundControl, SoundMon, SoundFactory, Symphonie, Synthesis, TFMX, WallyBeben, ActivisionPro, ZoundMonitor, Composer667, WantedTeamDaveLowe, SimpleAmigaStub, FashionTracker, DavidWhittaker

3. **50 New Pattern Layouts** (`22c21c35a`, `b96b370a6`)
   - 16 packed MOD parsers (Alcatraz, Blade, Mosh, Titanics, NovoTrade, etc.)
   - 28 compiled 68k parsers (Andrew Parton, Ashley Hogg, Core Design, etc.)
   - 6 remaining parsers (EasyTrax, Medley, MIDILoriciel, MMDC, PaulSummers, Quartet)
   - Total layouts: 64 → 114

4. **Other Fixes** (`1b468e342`)
   - FormatRegistry: IceTracker, MusicMaker 4V/8V pointed to non-existent parser modules — fixed
   - FormatRegistry: Steve Turner extRegex matched wrong extension — fixed
   - FormatRegistry: Richard Joseph .rj extension wasn't routed — fixed
   - FormatRegistry: duplicate suntronic entry removed
   - Aelapse WASM OOM: INITIAL_MEMORY 32MB → 64MB, rebuilt
   - HMR disabled (`vite.config.ts hmr: false`) for stable DJ sets

### Final Numbers (638 formats)

| Metric | Session Start | Final | Change |
|--------|-------------|-------|--------|
| Full patterns | 176 (22%) | 543 (85%) | **+367** |
| Full samples | 124 (15%) | 534 (83%) | **+410** |
| Editable | 490 (61%) | 521 (81%) | +31 |
| Stub patterns | 392 (49%) | 0 (0%) | **-392** |

### What's At Ceiling (Cannot Improve Further)

- **45 partial-pattern AdPlug formats** — OPL register capture inherent limitation. Would need 45 native OPL format parsers.
- **50 none-pattern formats** — chip emulators (SID, NSF, VGM, GBS, HES, KSS, SPC, MDX, PMD, SAP, S98, AY, YM) + compiled 68k replayers forced to classic scan + engine-driven formats (SC68, ZXTune, Eupmini, Cpsycle, Ixalance, PxTone, Organya)
- **92 none-sample formats** — FM/PSG/wavetable synthesis formats with no PCM. The chip emulator IS the sample player.
- **12 names-only samples** — forced-classic 68k replayers where enhanced scan produces wrong results
- **48 non-editable formats** — chip emulators + UADE-only compiled 68k with no known binary layout

## Key Files

| File | Purpose |
|------|---------|
| `src/engine/uade/UADEChipRAMPatternReader.ts` | NEW — bulk chip RAM pattern reading |
| `src/engine/uade/UADEPatternEncoder.ts` | Added `decodeModCell()` + `decodeCell` interface |
| `src/engine/uade/encoders/MODEncoder.ts` | Added `decodeMODCell()` shared export |
| `src/engine/replayer/NativeEngineRouting.ts` | UADEEditable `onStarted` hook for auto pattern read |
| `public/Buzzmachine.worklet.js` | Stereo interleaved I/O fix + bypass on crash |
| `src/lib/import/FormatRegistry.ts` | Registry bug fixes |
| `vite.config.ts` | HMR disabled |
| `tools/format-state.json` | Deep audit data (1465 entries) |

## Untested

- **Chip RAM pattern reader** — infrastructure is in place but hasn't been browser-tested. Load any packed MOD format (e.g., Promizer, Titanics Packer) and check if patterns populate after 500ms.
- **Buzzmachine stereo I/O** — BuzzDistortion and BuzzChorus confirmed working. Other 21 effects use same code path but weren't individually tested.
- **Smoke test** — attempted but couldn't run (AudioContext unlock issue). The April 11 results (83/106) are stale. Re-run with `npx tsx tools/playback-smoke-test.ts --local-only`.

## Next Steps

1. **Re-run smoke test** — get updated pass rate with all fixes
2. **Browser-test chip RAM reader** — load a packed MOD and verify patterns appear
3. **Soak test** — 2+ hour stress test before April 18 live gig (6 days)
4. **Re-enable HMR** — when not DJing, change `vite.config.ts` hmr back to `{ host: 'localhost', protocol: 'ws', overlay: false }`
