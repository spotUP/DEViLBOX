# UADE — Unix Amiga Delitracker Emulator (Catch-All)

**Status:** DETECTION_ONLY — catch-all parser for 130+ Amiga formats; UADE synthesizes audio
**Parser:** `src/lib/import/formats/UADEParser.ts`
**Extensions:** 130+ extensions (see list below)
**UADE name:** Various (per-format eagleplayer)
**Reference files:** `Reference Music/` (many subdirectories)
**Reference:** `Reference Code/uade-3.05/`

---

## Overview

`UADEParser.ts` is the catch-all handler for all Amiga music formats that do not have a
dedicated native TypeScript parser. It routes files to the UADE 68k emulator (WASM build)
for synthesis, using the appropriate eagleplayer binary from `uade-3.05/players/`.

Two operating modes:

- **Classic mode (fallback):** Returns a playback-only TrackerSong with a `UADESynth`
  instrument. No PCM extraction.
- **Enhanced mode (rebuilt WASM):** Extracts real PCM samples from Amiga chip RAM,
  detects effects from per-tick analysis, creates a fully editable TrackerSong with
  real Sampler instruments.

---

## Extension Set (UADE_EXTENSIONS)

The `UADE_EXTENSIONS` set contains 130+ extensions registered for UADE handling.
Selected entries by format family:

| Extensions | Format |
|------------|--------|
| `aps` | AProSys |
| `ast` | ActionAmics |
| `adpcm` | ADPCM |
| `alp` | Alcatraz Packer |
| `aon`, `aon4`, `aon8` | ArtOfNoise |
| `bd`, `bds` | Ben Daglish |
| `cin` | Cinemaware |
| `core` | CoreDesign |
| `cm`, `rk`, `rkb` | CustomMade |
| `dl`, `dln` | Dave Lowe / Dave Lowe New |
| `dw`, `dwold` | David Whittaker |
| `dlm1`, `dlm2` | Delta Music |
| `dsr` | Desire |
| `fp` | FuturePlayer |
| `glue`, `gm` | GlueMon |
| `hip`, `hip7`, `hst`, `mcmd` | Jochen Hippel / TFMX variants |
| `ims` | Images Music System |
| `is`, `is20` | InStereo |
| `jam`, `jc` | JamCracker |
| `jt` | Jeroen Tel |
| `jpn`, `jp` | Jason Page |
| `lme` | LegglessMusicEditor |
| `mfp` | Magnetic Fields Packer |
| `mc`, `mcr`, `mco` | Mark Cooksey |
| `avp`, `mw` | Martin Walker |
| `mm4`, `mm8`, `sdata` | MusicMaker 4V/8V |
| `ma` | MusicAssembler |
| `rj`, `rjp` | Richard Joseph |
| `rh`, `rho` | Rob Hubbard |
| `sa`, `sonic` | SonicArranger |
| `smus`, `snx`, `tiny` | SonixMusicDriver |
| `sc`, `sct` | SoundControl |
| `sfx`, `sfx13` | Sound-FX |
| `bp`, `bp3`, `sndmon` | SoundMon |
| `tfmx`, `mdat`, `tfmxpro` | TFMX |
| `tme` | The Musical Enlightenment |
| `mus`, `ufo` | UFO/MicroProse |
| `wb` | Wally Beben |
| `ym`, `ymst` | YM-2149 |
| `ml` | MusiclineEditor |
| `symmod` | Symphonie Pro (UADE fallback) |
| `dbm` | DigiBooster Pro (UADE fallback) |
| `gt2`, `gtk` | Graoumf Tracker 2 (UADE fallback) |
| `dsym` | Digital Symphony (UADE fallback) |
| `cba` | Chuck Biscuits (UADE fallback) |

Complete list in `UADEParser.ts::UADE_EXTENSIONS`.

---

## Format Routing (SYNTHESIS_FORMATS)

Some formats in `UADE_EXTENSIONS` have dedicated native parsers. The `SYNTHESIS_FORMATS`
map in `UADEParser.ts` routes these to their specific parser/synth type rather than UADE.
When no native parser matches, the UADE catch-all handles synthesis.

---

## Instrument Name Extraction

`tryExtractInstrumentNames()` in `UADEParser.ts` provides heuristic instrument name
extraction for selected formats. For formats with no native parser, instrument names
come from any ASCII strings found in the binary.

---

## Enhanced Mode (WASM)

The rebuilt UADE WASM provides a `UADEEngine` that:
1. Loads the eagleplayer binary for the detected format
2. Emulates 68k execution to synthesize audio
3. Optionally captures chip RAM state to extract PCM samples
4. Performs per-tick analysis to detect note/volume/effect changes

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/UADEParser.ts`
- **Engine:** `src/engine/uade/UADEEngine.ts`
- **UADE source:** `Reference Code/uade-3.05/`
- **Eagleplayer conf:** `Reference Code/uade-3.05/eagleplayer.conf`
- **Player binaries:** `Reference Code/uade-3.05/players/`
