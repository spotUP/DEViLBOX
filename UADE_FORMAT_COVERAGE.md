# UADE Format Coverage — DEViLBOX Implementation Plan

> **Goal:** Every UADE format fully integrated into DEViLBOX with native WASM playback,
> import/export, instrument editor, pattern editing, and live parameter control.

**Last updated:** 2026-03-06

## Summary

| Tier | Status | Count | Description |
|------|--------|-------|-------------|
| ✅ Tier 1 | **Full integration** | 7 | WASM engine + parser + exporter + instrument editor |
| 🟡 Tier 2 | **Has WASM engine** | 25 | Native playback works, missing exporter/inst editor |
| 🟠 Tier 3 | **Parser only** | 96 | Can import but plays via UADE fallback |
| 🔴 Tier 4 | **UADE-only** | 47 | No parser, no WASM — pure UADE passthrough |
| **Total** | | **175** | |

## Integration Checklist Per Format

Each format needs these components for full integration:

- [ ] **WASM engine** — Transpiled C replayer compiled to Emscripten WASM
- [ ] **Parser** — TypeScript importer (binary → DEViLBOX internal structures)
- [ ] **Exporter** — TypeScript/WASM serializer (DEViLBOX → native binary)
- [ ] **Instrument Editor** — UI controls for all instrument parameters
- [ ] **Pattern View** — DOM + Pixi views (1:1 parity)
- [ ] **Live Editing** — Real-time parameter changes during playback

---

## ✅ Tier 1 — Fully Integrated (7 formats)

These formats have complete WASM engines, parsers, exporters, and instrument editors.

| # | Format | WASM | Parser | Exporter | Inst Editor | Pattern View | Live Edit |
|---|--------|------|--------|----------|-------------|--------------|-----------|
| 1 | **HivelyTracker/AHX** | hively-wasm | ✅ HivelyParser | ✅ HivelyExporter | ✅ HivelyControls | ✅ DOM+Pixi | ✅ |
| 2 | **Future Composer 1.3** | fc-wasm | ✅ FCParser | ✅ FCExporter | ✅ FCControls | classic | ✅ |
| 3 | **Future Composer 1.4** | fc-wasm | ✅ FCParser | ✅ FCExporter | ✅ FCControls | classic | ✅ |
| 4 | **JamCracker Pro** | jamcracker-wasm | ✅ JamCrackerParser | ✅ JamCrackerExporter | ✅ JamCrackerControls | ✅ DOM+Pixi | ✅ |
| 5 | **MED/OctaMED** | octamed-wasm | ✅ MEDParser | ✅ MEDExporter | ✅ OctaMEDControls | classic | ✅ |
| 6 | **MusicLine Editor** | musicline-wasm | ✅ MusicLineParser | ✅ MusicLineExporter | ✅ MusicLineControls | ✅ DOM+Pixi | ✅ |
| 7 | **Octa-MED** | octamed-wasm | ✅ MEDParser | ✅ MEDExporter | ✅ OctaMEDControls | classic | ✅ |

---

## 🟡 Tier 2 — Has WASM Engine, Needs Completion (25 formats)

These have native WASM playback but need exporters, instrument editors, or pattern views.

| # | Format | WASM Module | Parser | Exporter | Inst Editor | Missing |
|---|--------|-------------|--------|----------|-------------|---------|
| 1 | **DavidWhittaker** | davidwhittaker-wasm | ✅ | ❌ | ✅ DavidWhittakerControls | exporter |
| 2 | **Fred Editor** | fred-wasm | ✅ | ❌ | ✅ FredControls | exporter |
| 3 | **FutureComposer-BSI** | fc-wasm | ❌ | ❌ | ❌ | parser, exporter, inst-editor |
| 4 | **FuturePlayer** | futureplayer-wasm | ✅ | ✅ FuturePlayerExporter | ❌ | inst-editor |
| 5 | **Hippel-CoSo** | hippel-coso-wasm | ✅ | ❌ | ✅ HippelCoSoControls | exporter |
| 6 | **Mugician** | digmug-wasm | ✅ | ❌ | ✅ DigMugControls | exporter |
| 7 | **MugicianII** | digmug-wasm | ✅ | ❌ | ✅ DigMugControls | exporter |
| 8 | **PTK-Prowiz** (ProTracker) | pt2-replayer-wasm | ✅ | ✅ MODExporter | ❌ | inst-editor |
| 9 | **Protracker4** | pt2-replayer-wasm | ✅ | ✅ MODExporter | ❌ | inst-editor |
| 10 | **RobHubbard** | robhubbard-wasm | ✅ | ❌ | ✅ RobHubbardControls | exporter |
| 11 | **SIDMon 1.0** | sidmon1-wasm | ✅ | ❌ | ✅ SidMon1Controls | exporter |
| 12 | **SIDMon 2.0** | sidmon-wasm | ✅ | ❌ | ✅ SidMonControls | exporter |
| 13 | **Sonic Arranger** | sonic-arranger-wasm | ✅ | ❌ | ✅ SonicArrangerControls | exporter |
| 14 | **Sonic Arranger PC** | sonic-arranger-wasm | ✅ | ❌ | ❌ | exporter, inst-editor |
| 15 | **SoundMon 2.0** | soundmon-wasm | ✅ | ❌ | ✅ SoundMonControls | exporter |
| 16 | **SoundMon 2.2** | soundmon-wasm | ✅ | ❌ | ✅ SoundMonControls | exporter |
| 17 | **Soundtracker-IV** | pt2-replayer-wasm | ✅ | ❌ | ❌ | exporter, inst-editor |
| 18 | **TFMX** | tfmx-wasm | ✅ | ❌ | ✅ TFMXControls | exporter |
| 19 | **TFMX-7V** | tfmx-wasm | ❌ | ❌ | ❌ | parser, exporter, inst-editor |
| 20 | **TFMX-7V-TFHD** | tfmx-wasm | ❌ | ❌ | ❌ | parser, exporter, inst-editor |
| 21 | **TFMX-Pro** | tfmx-wasm | ❌ | ❌ | ❌ | parser, exporter, inst-editor |
| 22 | **TFMX-Pro-TFHD** | tfmx-wasm | ❌ | ❌ | ❌ | parser, exporter, inst-editor |
| 23 | **TFMX-TFHD** | tfmx-wasm | ❌ | ❌ | ❌ | parser, exporter, inst-editor |
| 24 | **TFMX_ST** | tfmx-wasm | ❌ | ❌ | ❌ | parser, exporter, inst-editor |
| 25 | **UltimateSoundtracker** | pt2-replayer-wasm | ✅ | ✅ MODExporter | ❌ | inst-editor |

### Tier 2 Priority Actions

1. **Exporters needed (13):** DavidWhittaker, Fred, Hippel-CoSo, Mugician/II, RobHubbard, SIDMon 1/2, SonicArranger, SoundMon 2.0/2.2, TFMX, Soundtracker-IV
2. **TFMX variant parsers (6):** TFMX-7V, TFMX-7V-TFHD, TFMX-Pro, TFMX-Pro-TFHD, TFMX-TFHD, TFMX_ST — extend existing TFMXParser
3. **Instrument editors (8):** FuturePlayer, PTK-Prowiz, Protracker4, UltimateSoundtracker, Soundtracker-IV, FutureComposer-BSI, SonicArranger-PC, TFMX variants
4. **FutureComposer-BSI parser:** Variant of FC, should extend existing FCParser

---

## 🟠 Tier 3 — Parser Only, Needs WASM Engine (96 formats)

These can import files but play via UADE fallback. They need transpiled C → WASM engines.

### Priority Group A — Trackers/Sequencers (have editable pattern structure)

These are actual music editors with patterns, sequences, and instruments — highest value for full editing.

| # | Format | Parser | Exporter | Inst Editor | Notes |
|---|--------|--------|----------|-------------|-------|
| 1 | **DigiBooster** | ✅ DigiBoosterParser | ✅ DigiBoosterExporter | ❌ | 8-channel tracker, popular |
| 2 | **Oktalyzer** | ✅ OktalyzerParser | ✅ OktalyzerExporter | ❌ | 8-channel tracker |
| 3 | **QuadraComposer** | ✅ QuadraComposerParser | ❌ | ❌ | Pattern-based |
| 4 | **Sound-FX** | ✅ SoundFXParser | ❌ | ❌ | 4-channel tracker |
| 5 | **TCB Tracker** | ✅ | ❌ | ❌ | Atari ST tracker |
| 6 | **FashionTracker** | ✅ | ❌ | ❌ | Pattern-based |
| 7 | **LegglessMusicEditor** | ✅ | ❌ | ❌ | Editor format |
| 8 | **MusicAssembler** | ✅ | ❌ | ❌ | Pattern-based |
| 9 | **MusicMaker 4V** | ✅ | ❌ | ❌ | 4-voice |
| 10 | **MusicMaker 8V** | ✅ | ❌ | ❌ | 8-voice |
| 11 | **PumaTracker** | ✅ | ❌ | ❌ | Tracker |
| 12 | **TimeTracker** | ✅ | ❌ | ❌ | Tracker |
| 13 | **GMC** (Game Music Creator) | ✅ | ❌ | ❌ | Game music |
| 14 | **ImagesMusicSystem** | ✅ | ❌ | ❌ | Editor |
| 15 | **ChipTracker** (KRIS) | ✅ | ❌ | ❌ | Chip tracker |

### Priority Group B — Composer/Synth Formats (have programmable instruments)

These have interesting instrument architectures worth exposing.

| # | Format | Parser | Notes |
|---|--------|--------|-------|
| 1 | **DeltaMusic 1.3** | ✅ | Has inst editor (DeltaMusic1Controls), needs WASM+exporter |
| 2 | **DeltaMusic 2.0** | ✅ DeltaMusic2Parser | Has inst editor (DeltaMusic2Controls), needs WASM+exporter |
| 3 | **Ben Daglish** | ✅ | Game composer format |
| 4 | **Ben Daglish SID** | ✅ | SID variant |
| 5 | **InStereo! 1** | ✅ InStereo1Parser | Stereo format |
| 6 | **InStereo! 2** | ✅ InStereo2Parser | Stereo format |
| 7 | **Dave Lowe** | ✅ | Game composer |
| 8 | **Jochen Hippel 7V** | ✅ | 7-voice variant |
| 9 | **Jochen Hippel ST** | ✅ | Atari ST variant |
| 10 | **Fred Gray** | ✅ FredGrayParser | Related to Fred Editor |
| 11 | **Jeroen Tel** | ✅ | Game composer |
| 12 | **Mark Cooksey** | ✅ | Game composer |
| 13 | **Richard Joseph** | ✅ | Game composer |
| 14 | **Rob Hubbard ST** | ✅ | Atari ST variant |
| 15 | **Special FX** | ✅ | Game music |

### Priority Group C — Player-Only Formats (minimal editing value)

These are mostly game music drivers and packed formats with limited editability.

| # | Format | Notes |
|---|--------|-------|
| 1 | ADPCM Mono | Compressed audio |
| 2 | ActionAmics | Game driver |
| 3 | Alcatraz Packer | Packed format |
| 4 | AM-Composer | Simple format |
| 5 | AMOS Music Bank | AMOS BASIC music |
| 6 | Anders Øland | Game driver |
| 7 | Andrew Parton | Game driver |
| 8 | Art of Noise 4V/8V | Art format |
| 9 | Ashley Hogg | Game driver |
| 10 | Blade Packer | Packed format |
| 11 | Cinemaware | Game music |
| 12 | Core Design | Game driver |
| 13 | Custom Made | Custom player |
| 14 | Desire | Demo format |
| 15 | Digital Sonix Chrome | |
| 16 | Digital Sound Studio | |
| 17 | Infogrames | Game driver |
| 18 | Janko Mrsic-Flogel | Game driver |
| 19 | Janne Salmijärvi | Optimizer |
| 20 | Jason Brooke | Game driver |
| 21 | Jason Page | Game driver |
| 22 | Jesper Olsen | |
| 23 | Kim Christensen | |
| 24 | Kris Hatlelid | |
| 25 | Laxity | |
| 26 | Magnetic Fields Packer | Packed format |
| 27 | Maniacs of Noise | Game driver |
| 28 | Mark Cooksey Old | |
| 29 | Martin Walker | Game driver |
| 30 | Maximum Effect | |
| 31 | Medley | |
| 32 | MIDI Loriciel | |
| 33 | MMDC | |
| 34 | Mosh Packer | Packed format |
| 35 | MultiMedia Sound | |
| 36 | Nick Pelling Packer | Packed format |
| 37 | NovoTrade Packer | Packed format |
| 38 | NTSP | |
| 39 | onEscapee | Game music |
| 40 | Paul Robotham | Game driver |
| 41 | Paul Shields | Game driver |
| 42 | Paul Summers | Game driver |
| 43 | Paul Tonge | Game driver |
| 44 | Peter Verswyvelen | Game driver |
| 45 | Pierre Adane | Game driver |
| 46 | Professional Sound Artists | |
| 47 | Quartet / PSG / ST | Multi-platform |
| 48 | Sean Conran | Game driver |
| 49 | Sound Control | |
| 50 | Sound Factory | |
| 51 | Sound Master | |
| 52 | Sound Player | |
| 53 | Speedy System | |
| 54 | Steve Barrett | Game driver |
| 55 | Steve Turner | Game driver |
| 56 | Synth Pack | |
| 57 | The Musical Enlightenment | |
| 58 | Thomas Hermann | |
| 59 | Titanics Packer | Packed format |
| 60 | Tomy Tracker | |
| 61 | Tronic | |
| 62 | UFO | |
| 63 | Wally Beben | Game driver |
| 64 | Zound Monitor | |

---

## 🔴 Tier 4 — UADE-Only, Needs Everything (47 formats)

No parser, no WASM engine — pure UADE passthrough. Need parser + WASM engine + full integration.

### Priority Group A — Notable/Complex Formats

| # | Format | UADE Player | Prefixes | Notes |
|---|--------|-------------|----------|-------|
| 1 | **Jochen Hippel** (base) | JochenHippel | hip, mcmd, sog | Major Amiga composer, multiple variants |
| 2 | **Jochen Hippel UADE** | JochenHippel_UADE | | UADE-specific variant |
| 3 | **Dave Lowe New** | DaveLoweNew | dln | Updated Dave Lowe driver |
| 4 | **Dave Lowe Deli** | DaveLowe_Deli | dl_deli | Deli variant |
| 5 | **AudioSculpture** | AudioSculpture | adsc | Complex synth format |
| 6 | **Dynamic Synthesizer** | DynamicSynthesizer | dns | Synth-based |
| 7 | **EMS / EMS-6** | EMS, EMS-6 | ems, emsv6 | Electronic Music System |
| 8 | **Tim Follin** | TimFollin | tf | Famous game composer |
| 9 | **Beathoeven Synthesizer** | BeathovenSynthesizer | bss | Synth-based |
| 10 | **Voodoo Supreme Synth** | VoodooSupremeSynthesizer | vss | Synth-based |
| 11 | **SonixMusicDriver (SNX)** | SonixMusicDriver | smus, snx, tiny | Major format |
| 12 | **PreTracker** | PreTracker | prt | Tracker format |
| 13 | **SynTracker** | SynTracker | st, synmod | Tracker |
| 14 | **YM-2149** | YM-2149 | ym, ymst | Chip tune |

### Priority Group B — Game Music Drivers

| # | Format | UADE Player | Prefixes | Notes |
|---|--------|-------------|----------|-------|
| 1 | AProSys | AProSys | aps | |
| 2 | ArtAndMagic | ArtAndMagic | aam | |
| 3 | Darius Zendeh | DariusZendeh | dz, mkiio | |
| 4 | David Hanney | DavidHanney | dh | |
| 5 | Dirk Bialluch | DirkBialluch | tpu | |
| 6 | EarAche | EarAche | ea, mg | |
| 7 | ENV | ENV | | |
| 8 | Forgotten Worlds Game | ForgottenWorlds_Game | fw | |
| 9 | GlueMon | GlueMon | glue, gm | |
| 10 | Howie Davies | HowieDavies | hd | |
| 11 | Jesper Olsen EP | JesperOlsen_EP | | |
| 12 | Major Tom | MajorTom | hn, mtp2, thn, arp | |
| 13 | Mark II | MarkII | mk2, mkii | |
| 14 | MCMD | MCMD | mcmd_org | |
| 15 | Mike Davies | MikeDavies | md | |
| 16 | Pokeynoise | Pokeynoise | pn | |
| 17 | RiffRaff | RiffRaff | riff | |
| 18 | S | S | | Unknown |
| 19 | Scott Johnston | ScottJohnston | | |
| 20 | SCUMM | SCUMM | scumm | LucasArts game music |
| 21 | Sean Connolly | SeanConnolly | s-c, scn | |
| 22 | Sierra AGI | Sierra-AGI | agi | Sierra game music |
| 23 | Silmarils | Silmarils | mok | |
| 24 | Sound Images | SoundImages | tw | |
| 25 | Sound Programming Language | SoundProgrammingLanguage | spl | |
| 26 | Special-FX ST | Special-FX_ST | doda | Atari ST variant |
| 27 | Speedy A1 System | SpeedyA1System | sas | |
| 28 | SUN-Tronic | SUN-Tronic | sun | |
| 29 | Synth | Synth | syn | |
| 30 | SynthDream | SynthDream | sdr | |
| 31 | MIDI Loriciel | MIDI-Loriciel | midi | |
| 32 | Richard Joseph Player | RichardJoseph_Player | rjp | |

---

## Implementation Strategy

### Phase 1: Complete Tier 2 (25 formats → Tier 1)

**Effort:** Medium — WASM engines exist, just need exporters + instrument editors.

1. **Add exporters** for 13 formats with WASM engines but no exporter
   - Use WASM `serialize()` approach where possible (most reliable)
   - Build TypeScript binary serializers as fallback
2. **Add instrument editors** for 8 formats missing them
   - ProTracker/Soundtracker family: shared SampleControls
   - TFMX variants: extend TFMXControls
   - FuturePlayer: new FuturePlayerControls
3. **Extend TFMX parser** for 6 variants (7V, Pro, ST, TFHD variants)
4. **Add FutureComposer-BSI parser** (variant of existing FC format)

### Phase 2: Transpile Tier 3 Priority A Trackers (15 formats)

**Effort:** High — Need to transpile 68k ASM → C → WASM for each.

Follow the transpile-debug-68k-replayer skill phases 0-13 for each format:
1. Get the UADE player ASM source
2. Transpile to C
3. Debug waveform match against UADE
4. Build WASM module
5. Wire into DEViLBOX (engine, views, editing)

Priority order: DigiBooster → Oktalyzer → QuadraComposer → Sound-FX → TCB Tracker → rest

### Phase 3: Transpile Tier 3 Priority B Composer Formats (15 formats)

Focus on formats with interesting instrument architectures:
DeltaMusic → InStereo → Dave Lowe → Jochen Hippel 7V/ST → Fred Gray → rest

### Phase 4: Transpile Tier 4 Notable Formats (14 formats)

Start with: Jochen Hippel base → Tim Follin → SNX/SonixMusicDriver → AudioSculpture → PreTracker → EMS → YM-2149 → rest

### Phase 5: Remaining Formats (Tier 3C + Tier 4B)

Game drivers and packed formats — lower priority but completeness matters.
Many of these share similar architectures and can be batch-processed.

---

## Progress Tracking

### Completed This Session
- [x] Full audit of 175 UADE player formats
- [x] Cross-referenced against all DEViLBOX engines, parsers, exporters, editors
- [x] Classified into 4 tiers with priority groups
- [x] Created implementation strategy

### Next Steps
- [ ] Start Phase 1: Complete Tier 2 exporters (13 formats)
- [ ] Start Phase 1: Add missing instrument editors (8 formats)
- [ ] Start Phase 1: TFMX variant parsers (6 formats)
- [ ] Start Phase 2: Begin transpiling Tier 3A trackers

---

## Architecture Reference

### File Locations Per Format

```
${format}-wasm/                          # WASM module source
  CMakeLists.txt                         # Emscripten build
  src/${format}_wrapper.c                # Bridge to transpiled C
public/${format}/                        # Built WASM output
  ${Format}.js + .wasm                   # Emscripten output
  ${Format}.worklet.js                   # AudioWorklet
src/engine/${format}/                    # TypeScript engine
  ${Format}Engine.ts                     # Singleton engine class
src/lib/import/formats/                  # Parser
  ${Format}Parser.ts                     # Binary → internal structures
src/lib/export/                          # Exporter
  ${Format}Exporter.ts                   # Internal → binary
src/components/instruments/controls/     # Instrument editor
  ${Format}Controls.tsx                  # Knobs, sliders, envelopes
src/components/tracker/                  # DOM pattern view
  ${Format}View.tsx                      # Tracker-style view
src/pixi/views/${format}/               # Pixi pattern view
  Pixi${Format}View.tsx                  # GL renderer view
```

### Key Integration Points

- `src/lib/import/FormatRegistry.ts` — Register format detection
- `src/engine/InstrumentFactory.ts` — Register synth creation
- `src/components/tracker/TrackerView.tsx` — Route DOM view
- `src/pixi/views/PixiTrackerView.tsx` — Route Pixi view
- `src/components/instruments/InstrumentPanel.tsx` — Route instrument editor
