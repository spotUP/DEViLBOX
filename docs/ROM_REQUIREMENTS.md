# ROM Requirements for All Synths

**Last Updated:** 2026-02-06

Complete list of all synthesizers in DEViLBOX that require external ROM data to function.

---

## ✅ MAME Chips Requiring External ROM Files

### 1. **TR707** - Roland TR-707 Drum Machine
**Status:** ✅ ROM loader implemented
**Location:** `src/engine/tr707/`
**ROM Path:** `/public/roms/tr707/`

**Required Files:**
- `tr707_combined.bin` (128KB) - Combined ROM, OR:
- `tr707_voices.bin` (64KB) - IC34+IC35: Bass, snare, toms, rimshot, handclap
- `tr707_crash.bin` (32KB) - IC19: Crash cymbal
- `tr707_ride.bin` (32KB) - IC22: Ride cymbal

**Optional:**
- `tr707_expansion.bin` (256KB) - [HKA TR-707 Expansion](https://hkadesign.org.uk/tr707expansion.html)

**Function:** PCM drum samples
**Size:** 128KB standard, 256KB expanded
**Without ROM:** Silent (no drum sounds)

---

### 2. **C352** - Namco 32-Voice PCM
**Status:** ✅ ROM loader implemented
**Location:** `src/engine/c352/`
**ROM Path:** `/public/roms/c352/`

**Required Files:**
- `c352_samples.bin` - Game-specific sample ROM
- Examples: System 12/23 arcade games (Soul Edge, Time Crisis, etc.)

**Function:** PCM sample playback
**Size:** Varies (typically 2-8MB)
**Without ROM:** Silent (no samples)
**Has loadROM:** ✅ Yes (integrated)

---

### 3. **ICS2115** - ICS Wavetable Synthesizer
**Status:** ✅ ROM loader implemented
**Location:** `src/engine/ics2115/`
**ROM Path:** `/public/roms/ics2115/`

**Required Files:**
- `ics2115_wavetable.bin` - Wavetable ROM
- Examples: Gravis UltraSound compatible ROMs

**Function:** Wavetable sample playback
**Size:** Up to 16MB
**Without ROM:** Silent (no wavetables)
**Has loadROM:** ✅ Yes (integrated)

---

### 4. **K054539** - Konami PCM/ADPCM
**Status:** ✅ ROM loader implemented
**Location:** `src/engine/k054539/`
**ROM Path:** `/public/roms/k054539/`

**Required Files:**
- `k054539_samples.bin` - Sample ROM
- Examples: Vendetta, Golfing Greats, Xexex, etc.

**Function:** PCM/ADPCM sample playback
**Size:** Up to 16MB
**Without ROM:** Silent (no samples)
**Has loadROM:** ✅ Yes (integrated)

---

### 5. **RF5C400** - Ricoh 32-Voice PCM
**Status:** ✅ ROM loader implemented
**Location:** `src/engine/rf5c400/`
**ROM Path:** `/public/roms/rf5c400/`

**Required Files:**
- `rf5c400_samples.bin` - Sample ROM
- Examples: Sega ST-V, Saturn arcade ports

**Function:** PCM sample playback
**Size:** Varies (typically 2-8MB)
**Without ROM:** Silent (no samples)
**Has loadROM:** ✅ Yes (integrated)

---

### 6. **RolandSA** - Roland SA-Synthesis Digital Piano
**Status:** ✅ ROM loader implemented
**Location:** `src/engine/roland_sa/`
**ROM Path:** `/public/roms/roland_sa/`

**Required Files:**
- `roland_sa_ic5.bin` (128KB) - Wave ROM IC5
- `roland_sa_ic6.bin` (128KB) - Wave ROM IC6
- `roland_sa_ic7.bin` (128KB) - Wave ROM IC7

**Function:** Sample mixing/interpolation
**Size:** 384KB total (3x 128KB)
**Without ROM:** Silent (no piano samples)
**Has loadROM:** ✅ Yes (integrated)

---

### 7. **ES5503** - Ensoniq DOC (Digital Oscillator Chip)
**Status:** ⏳ Needs ROM loader integration
**Location:** `src/engine/es5503/`
**ROM Path:** `/public/roms/es5503/`

**Required Files:**
- Wavetable/sample data (128KB address space)
- Examples: Apple IIgs system ROMs, Ensoniq Mirage samples

**Function:** 8-bit sample playback
**Size:** Up to 128KB
**Without ROM:** Can generate tones but no complex sounds
**Has loadROM:** Need to verify

---

## ✅ MAME Chips with Internal ROM (No External Files Needed)

### 8. **SP0250** - GI Speech Chip
**Status:** ✅ Works out of the box
**Location:** `src/engine/sp0250/`
**Internal Data:** Allophone coefficient ROM (embedded in C++)
**External ROM:** Not needed

---

### 9. **TMS5220** - TI Speech Synthesis
**Status:** ✅ Works out of the box
**Location:** `src/engine/tms5220/`
**Internal Data:** Chirp ROM tables (embedded in C++)
**External ROM:** Not needed

---

### 10. **Votrax** - Votrax SC-01 Speech
**Status:** ✅ Works out of the box
**Location:** `src/engine/votrax/`
**Internal Data:** Phoneme ROM parameters (embedded in C++)
**External ROM:** Not needed

---

### 11. **MSM5232** - OKI 8-Voice Sound Generator
**Status:** ✅ Works out of the box
**Location:** `src/engine/msm5232/` (if exists)
**Internal Data:** Pitch ROM table (embedded in C++)
**External ROM:** Not needed

---

## ✅ Non-MAME Synths Requiring ROM Files

### 12. **D50Synth** - Roland D-50 Emulation
**Status:** ✅ Has ROM loader (manual call required)
**Location:** `src/engine/d50/`
**Architecture:** Uses legacy MAMEEngine (not AudioWorklet)

**Required Files:**
- `d50_ic5.bin` - IC5 ROM
- `d50_ic6.bin` - IC6 ROM
- `d50_ic7.bin` - IC7 ROM

**Function:** D-50 LA synthesis sample ROMs
**Size:** Varies (several hundred KB total)
**Without ROM:** Cannot produce D-50 sounds
**Has loadROM:** ✅ Yes (`async loadROMs(ic5, ic6, ic7)` method)
**Note:** ROM loading not automatic - must call `loadROMs()` manually after init

---

### 13. **RdPianoSynth** - Roland Digital Piano (MKS-20/MK-80)
**Status:** ✅ ROM loader fully implemented and automatic
**Location:** `src/engine/rdpiano/`
**ROM Path:** `/public/rdpiano/roms/` (custom path, not /roms/)
**Architecture:** Uses AudioWorklet with automatic ROM loading

**Required Files:**
- **Program ROM:** `RD200_B.bin`
- **MKS-20 Set A:** `mks20_15179738.BIN`, `mks20_15179737.BIN`, `mks20_15179736.BIN`, `mks20_15179757.BIN`
- **MKS-20 Set B:** `mks20_15179741.BIN`, `mks20_15179740.BIN`, `mks20_15179739.BIN`, `mks20_15179757.BIN`
- **MK-80:** `MK80_IC5.bin`, `MK80_IC6.bin`, `MK80_IC7.bin`, `MK80_IC18.bin`

**Function:** Electric/digital piano sample playback (16 patches total)
**Size:** Multiple ROM sets (~512KB per set)
**Without ROM:** Silent (no piano samples)
**Has loadROM:** ✅ Yes - automatically loads during initialization

---

### 14. **VFXSynth** - Ensoniq VFX/SD-1 (ES5506)
**Status:** ✅ Has ROM loader (manual call required)
**Location:** `src/engine/vfx/`
**Architecture:** Uses legacy MAMEEngine (not AudioWorklet)

**Required Files:**
- VFX wavetable ROM banks (multiple banks supported)

**Function:** ES5506 wavetable/sample playback
**Size:** Varies by bank (up to 8MB total)
**Without ROM:** Limited functionality (no transwave samples)
**Has loadROM:** ✅ Yes (`async loadSampleROM(bank, data)` method)
**Note:** ROM loading not automatic - must call `loadSampleROM()` manually for each bank

---

## 🔊 Synths That DON'T Need ROM (RAM-based or Pure Synthesis)

### AICA - Dreamcast Audio
- **Type:** Wavetable with RAM upload
- **No ROM needed:** Samples uploaded at runtime

### SCSP - Sega Saturn Audio
- **Type:** Wavetable with RAM upload
- **No ROM needed:** Samples uploaded at runtime

### All FM Synths (OPN, OPM, OPL, etc.)
- **Type:** Pure FM synthesis
- **No ROM needed:** Generates sounds algorithmically

### All Analog-Modeled Synths
- **Type:** Virtual analog
- **No ROM needed:** Pure synthesis

---

## Summary Statistics

**Total synths needing external ROM:** 14
- MAME AudioWorklet chips: 6 (TR707, C352, ICS2115, K054539, RF5C400, RolandSA)
- MAME AudioWorklet (optional ROM): 1 (ES5503)
- Legacy MAMEEngine: 2 (D50, VFX)
- Custom AudioWorklet: 1 (RdPiano)

**Fully automatic ROM loading:** 7/14 (50%)
- ✅ TR707 (MAME AudioWorklet)
- ✅ C352 (MAME AudioWorklet)
- ✅ K054539 (MAME AudioWorklet)
- ✅ ICS2115 (MAME AudioWorklet)
- ✅ RF5C400 (MAME AudioWorklet)
- ✅ RolandSA (MAME AudioWorklet)
- ✅ RdPiano (Custom AudioWorklet)

**Manual ROM loading available:** 2/14
- ✅ D50 (call `loadROMs()` after init)
- ✅ VFX (call `loadSampleROM()` after init)

**Optional ROM (works without):** 1/14
- ES5503 (has built-in waveforms, ROM loader needs TypeScript exposure for custom wavetables)

**No external ROM needed (internal data):** 4
- SP0250, TMS5220, Votrax, MSM5232

---

## Implementation Priority

### High Priority (Simple, Common)
1. ✅ **TR707** - Done
2. ✅ **C352** - Done
3. ✅ **K054539** - Done

### Medium Priority (Useful)
4. ✅ **ICS2115** - Done
5. ✅ **RF5C400** - Done
6. **RdPiano** - Electric piano is very useful (needs verification)
7. **D50** - Popular synth (needs verification)

### Lower Priority (Specialized)
8. ✅ **RolandSA** - Done
9. **ES5503** - Apple IIgs/Mirage (needs TypeScript method exposure)
10. **VFX** - Ensoniq workstation (needs verification)

---

## Next Steps

To implement ROM loading for remaining chips:

1. **Use the generic ROM loader:**
   ```typescript
   import { loadChipROMs, ChipROMConfig } from '@engine/mame/MAMEROMLoader';
   ```

2. **Create ROM config** for each chip in `MAMEROMLoader.ts`

3. **Override `initialize()`** in each synth (like TR707)

4. **Place ROM files** in `/public/roms/{chipname}/`

5. **Test** each chip to verify ROM loading works

6. **Document** specific ROM requirements for each chip
