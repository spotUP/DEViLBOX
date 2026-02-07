# ROM Status Report - DEViLBOX

**Generated:** 2026-02-07

## ✅ ROMs Ready to Use (5 chips)

These chips have ROM files properly extracted and packaged in their directories:

### 1. TR707 - Roland TR-707 Drum Machine
- **Location:** `/public/roms/tr707/tr707.zip`
- **Size:** 180 KB (128KB + individual files)
- **Contents:**
  - `tr707_combined.bin` (128KB) - All samples combined
  - `tr707_voices.bin` (64KB) - IC34+IC35: Bass, snare, toms, rimshot, handclap
  - `tr707_crash.bin` (32KB) - IC19: Crash cymbal
  - `tr707_ride.bin` (32KB) - IC22: Ride cymbal
- **Source:** Hardware dump from original TR-707
- **Status:** ✅ **READY** - Auto-loads on initialization

### 2. C352 - Namco 32-Voice PCM
- **Location:** `/public/roms/c352/c352.zip`
- **Size:** 7.0 MB
- **Contents:** 2 sample banks from Tekken 2 and Time Crisis
- **Source:** MAME ROMs (tekken2.zip, timecris.zip)
- **Status:** ✅ **READY** - Auto-loads on initialization

### 3. K054539 - Konami PCM/ADPCM
- **Location:** `/public/roms/k054539/k054539.zip`
- **Size:** 3.3 MB
- **Contents:** 4 sample banks from Xexex, Violent Storm, Mystic Warriors
- **Source:** MAME ROMs (xexex.zip, viostorm.zip, mystwarr.zip)
- **Status:** ✅ **READY** - Auto-loads on initialization

### 4. ICS2115 - ICS Wavetable Synthesizer
- **Location:** `/public/roms/ics2115/ics2115.zip`
- **Size:** 172 KB
- **Contents:** 1 wavetable bank from Raiden 2
- **Source:** MAME ROMs (raiden2.zip)
- **Status:** ✅ **READY** - Auto-loads on initialization

### 5. RF5C400 - Ricoh 32-Voice PCM
- **Location:** `/public/roms/rf5c400/rf5c400.zip`
- **Size:** 844 KB
- **Contents:** Combined sample data from beatmania 1st MIX
- **Source:** MAME ROMs (bm1stmix.zip)
- **Status:** ✅ **READY** - Auto-loads on initialization

---

## ⏳ ROMs Pending - Hardware Dumps Required (4 chips)

These chips need ROM dumps from actual hardware. MAME arcade ROMs won't work for these:

### 6. RolandSA - Roland SA-Synthesis Digital Piano
- **Location:** `/public/roms/roland_sa/` (empty)
- **Size Needed:** 384KB (3x 128KB)
- **Required Files:**
  - `roland_sa_ic5.bin` (128KB) - Wave ROM IC5
  - `roland_sa_ic6.bin` (128KB) - Wave ROM IC6
  - `roland_sa_ic7.bin` (128KB) - Wave ROM IC7
- **Source Needed:** Roland HP-3000S, HP-2000, or KR-33 piano hardware
- **Status:** ❌ **MISSING** - Needs hardware EPROM dump

### 7. D50 - Roland D-50 Linear Arithmetic Synth
- **Location:** `/public/roms/d50/` (empty)
- **Size Needed:** ~500KB total
- **Required Files:**
  - `d50_ic5.bin` - IC5 ROM (PCM attack transients)
  - `d50_ic6.bin` - IC6 ROM (PCM loops)
  - `d50_ic7.bin` - IC7 ROM (PCM samples)
- **Source Needed:** Roland D-50 synthesizer (1987) hardware
- **Status:** ❌ **MISSING** - Needs hardware EPROM dump

### 8. VFX - Ensoniq VFX/SD-1 Wavetable Synth
- **Location:** `/public/roms/vfx/` (empty)
- **Size Needed:** Up to 8MB
- **Required Files:** Multiple ROM banks containing transwave samples
- **Source Needed:** Ensoniq VFX, VFX-sd, SD-1, TS-10, or TS-12 hardware
- **Status:** ❌ **MISSING** - Needs hardware EPROM dump

### 9. RdPiano - Roland MKS-20/MK-80 Digital Pianos
- **Location:** `/public/rdpiano/roms/` (empty)
- **Size Needed:** ~1.5MB total
- **Required Files:**
  - `RD200_B.bin` - MCU program ROM
  - MKS-20 Set A: `mks20_15179738.BIN`, `mks20_15179737.BIN`, `mks20_15179736.BIN`, `mks20_15179757.BIN`
  - MKS-20 Set B: `mks20_15179741.BIN`, `mks20_15179740.BIN`, `mks20_15179739.BIN`, `mks20_15179757.BIN`
  - MK-80: `MK80_IC5.bin`, `MK80_IC6.bin`, `MK80_IC7.bin`, `MK80_IC18.bin`
- **Source Needed:** Roland MKS-20 or MK-80 digital piano hardware
- **Status:** ❌ **MISSING** - Needs hardware EPROM dump

---

## 🔵 ROMs Optional (1 chip)

### 10. ES5503 - Ensoniq DOC (Digital Oscillator Chip)
- **Location:** `/public/roms/es5503/` (empty)
- **Size Needed:** Up to 128KB
- **Required Files:** `es5503_wavetable.bin` - Custom wavetable data
- **Source Options:**
  - Apple IIgs system ROMs
  - Ensoniq Mirage sampler ROMs
  - Ensoniq ESQ-1/SQ-80 wavetable data
- **Status:** ⚪ **OPTIONAL** - Works without ROM (has 8 built-in waveforms)
- **Note:** ROM only needed for custom wavetables beyond built-in ones

---

## ✨ No External ROM Needed (4 chips)

These chips have internal ROM data compiled into the WASM binary:

### SP0250 - GI Speech Chip
- **Internal Data:** Allophone coefficient ROM (embedded in C++)
- **Status:** ✅ Works out of the box

### TMS5220 - TI Speech Synthesis
- **Internal Data:** Chirp ROM tables (embedded in C++)
- **Status:** ✅ Works out of the box

### Votrax - Votrax SC-01 Speech
- **Internal Data:** Phoneme ROM parameters (embedded in C++)
- **Status:** ✅ Works out of the box

### MSM5232 - OKI 8-Voice Sound Generator
- **Internal Data:** Pitch ROM table (embedded in C++)
- **Status:** ✅ Works out of the box

---

## 📊 Summary Statistics

| Category | Count | Percentage |
|----------|-------|------------|
| **Ready to use** | 5/14 | 36% |
| **Missing (hardware dumps)** | 4/14 | 29% |
| **Optional** | 1/14 | 7% |
| **No ROM needed** | 4/14 | 29% |

### Usable Now:
**9/14 chips (64%)** work without any additional ROM dumps:
- 5 chips with ROMs ready (TR707, C352, K054539, ICS2115, RF5C400)
- 4 chips with internal ROMs (SP0250, TMS5220, Votrax, MSM5232)

### Available ROM Coverage by Type:
- **MAME Arcade PCM:** 100% (4/4 chips have ROMs)
- **Hardware Synthesizers:** 0% (4/4 need hardware dumps)
- **Speech Synthesis:** 100% (3/3 have internal ROMs)

---

## 🎯 Next Steps

### Immediate Testing (Ready Now):
1. Test TR707 drum machine sounds
2. Test C352 with Tekken 2/Time Crisis samples
3. Test K054539 with Konami arcade samples
4. Test ICS2115 with Raiden 2 wavetables
5. Test RF5C400 with beatmania samples

### Future ROM Acquisition:
To complete the remaining 4 chips, you'll need to:
1. Source the original hardware
2. Use an EPROM reader to dump the ROM chips
3. Place the dumps in the appropriate directories

### Alternative Sources:
- Check online ROM archives (if you own the hardware)
- Contact hardware modding communities
- Purchase pre-dumped ROM cartridges/expansions

---

## 📝 Testing Checklist

- [ ] TR707 - Create drum patterns, verify all 15 sounds play
- [ ] C352 - Test Namco System 11/12 game sounds
- [ ] K054539 - Test Konami beat-em-up samples
- [ ] ICS2115 - Test Raiden shoot-em-up wavetables
- [ ] RF5C400 - Test Bemani electronic music samples
- [ ] SP0250 - Test speech synthesis (no ROM needed)
- [ ] TMS5220 - Test speech synthesis (no ROM needed)
- [ ] Votrax - Test speech synthesis (no ROM needed)
- [ ] MSM5232 - Test organ sounds (no ROM needed)

---

**All ROM files are automatically loaded when you initialize these synths!** 🎵
