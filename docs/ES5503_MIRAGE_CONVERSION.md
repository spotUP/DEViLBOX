# ES5503 Mirage Sample Conversion

**Date:** 2026-02-07
**Status:** ✅ Complete

---

## Overview

Successfully converted **11 Ensoniq Mirage samples** from IFF/8SVX format to raw 8-bit unsigned PCM for the ES5503 (Ensoniq DOC) wavetable chip.

---

## Conversion Process

### Source Files
- **Location:** `/Users/spot/Code/DEViLBOX/public/roms/Mirage4Amiga/`
- **Format:** IFF/8SVX (Amiga 8-bit sampled sound voice)
- **Total files:** 1,788 samples across 132 directories
- **Original size:** ~51 MB uncompressed

### Converter Script
- **Script:** `/Users/spot/Code/DEViLBOX/scripts/convert-mirage-samples.py`
- **Language:** Python 3
- **Function:** Parse IFF/8SVX → Extract PCM → Convert signed to unsigned → Package for ES5503

### Conversion Details

**IFF/8SVX Format:**
- Container: IFF (Interchange File Format)
- Chunk structure: FORM → VHDR (header) → BODY (PCM data)
- Audio format: 8-bit signed PCM (-128 to +127)
- Sample rate: Typically 29,412 Hz

**ES5503 Format:**
- Audio format: 8-bit unsigned PCM (0x00-0xFF, with 0x80 = center)
- Reserved value: 0x00 (end-of-sample marker, converted to 0x01)
- Wave RAM: 128KB total (pages 0-7 reserved for built-in waveforms)
- Custom data: Pages 8+ (offset 2048+)

**Conversion formula:**
```python
unsigned_value = (signed_value + 128) & 0xFF
if unsigned_value == 0x00:
    unsigned_value = 0x01  # Avoid reserved marker
```

---

## Selected Samples

The converter prioritized **short wavetable-style samples** suitable for synthesis (vs. long attack transients). Total selected: **11 samples (110 KB)**

### Sample Bank Contents

| Sample | Offset | Page | Size | Description |
|--------|--------|------|------|-------------|
| SYNTH_48-1L-1.8svx | 0x0800 (2048) | 8 | 4096 | Synth waveform |
| SYNTH_48-1L-3.8svx | 0x1800 (6144) | 24 | 4608 | Synth waveform |
| SYNTH_48-1U-2.8svx | 0x2A00 (10752) | 42 | 32768 | Synth waveform (large) |
| A-1L-1.8svx | 0xAA00 (43520) | 170 | 8704 | Piano sample |
| A-1L-2.8svx | 0xCC00 (52224) | 204 | 9728 | Piano sample |
| A-1L-3.8svx | 0xF200 (61952) | 242 | 14336 | Piano sample |
| A-1L-4.8svx | 0x12A00 (76288) | 298 | 10240 | Piano sample |
| A-1L-5.8svx | 0x15200 (86528) | 338 | 3584 | Piano sample |
| A-1L-6.8svx | 0x16000 (90112) | 352 | 3584 | Piano sample |
| A-1L-7.8svx | 0x16E00 (93696) | 366 | 8704 | Piano sample |
| A-1L-8.8svx | 0x19000 (102400) | 400 | 10240 | Piano sample |

**Total ROM size:** 112,640 bytes (110 KB of samples + 2 KB reserved header)

---

## Output Files

### ROM Package
- **File:** `/public/roms/es5503/es5503.zip` (85 KB compressed)
- **Contents:** `es5503_wavetable.bin` (112,640 bytes)
- **Compression:** 23% (deflate)

### Sample Map
- **File:** `/public/roms/es5503/es5503_wavetable.map.txt`
- **Purpose:** Human-readable reference showing sample offsets and page numbers
- **Use case:** For manually selecting wavetables in ES5503 synth

---

## Auto-Loading Implementation

### Code Changes

**1. Added import to ES5503Synth.ts:**
```typescript
import { loadES5503ROMs } from '@engine/mame/MAMEROMLoader';
```

**2. Added initialize() override:**
```typescript
protected async initialize(): Promise<void> {
  try {
    // Load Ensoniq Mirage wavetable ROM data
    const romData = await loadES5503ROMs();

    // Call parent initialize first to set up worklet
    await super.initialize();

    // Load custom wavetables into wave RAM (pages 8+)
    this.loadWaveData(romData, 2048);  // Start at page 8 (offset 2048)

    console.log('[ES5503] Mirage wavetable ROM loaded successfully');
  } catch (error) {
    console.error('[ES5503] ROM loading failed:', error);
    console.error('Place ROM files in /public/roms/es5503/ - see /public/roms/README.md');
    // Continue anyway - synth works with 8 built-in waveforms
  }
}
```

**3. Updated MAMEROMLoader.ts:**
- Added `ES5503_ROM_CONFIG` with zipFile support
- Already had `loadES5503ROMs()` helper function

---

## Built-in Waveforms vs. Custom Samples

### Built-in Waveforms (Pages 0-7)
The ES5503 has **8 built-in waveforms** that work without any ROM loading:

1. **Sine** - Pure sine wave
2. **Sawtooth** - Bright, buzzy waveform
3. **Square** - Hollow, clarinet-like tone
4. **Triangle** - Soft, flute-like tone
5. **Noise** - White noise for percussion
6. **Pulse (25%)** - Thin pulse wave
7. **Pulse (12.5%)** - Very thin pulse
8. **Organ** - Organ-like harmonic content

### Custom Samples (Pages 8+)
The converted Mirage samples provide:
- **3 synth wavetables** - Complex harmonic content for synthesis
- **8 piano samples** - Attack transients and sustain loops

**Usage:**
- Built-in waveforms: Call `setWaveform(0-7)` using `ES5503Waveform` constants
- Custom samples: Call `setWaveform(8-440)` to select Mirage pages 8-440
- Advanced: Use `loadWavePage(data, page)` to load your own wavetables

---

## Technical Notes

### Why Skip Long Samples?
The converter skips samples larger than 32KB because:
- ES5503 is designed for **wavetable synthesis**, not sample playback
- Short, looping waveforms are more suitable for real-time synthesis
- 128KB wave RAM should contain diverse timbres, not a few long samples

### Why Mirage Samples?
The Ensoniq Mirage (1984) was the first affordable professional sampler and used the **ES5503 chip**. Its sample library is historically accurate and optimized for the ES5503's architecture.

### IFF/8SVX Format Details
IFF (Interchange File Format) was developed by Electronic Arts for Amiga computers:
- **FORM chunk:** Container with total size
- **VHDR chunk:** Voice header with sample rate, loop points
- **BODY chunk:** Raw PCM sample data (8-bit signed)
- Word-aligned: Chunks padded to even byte boundaries

---

## Verification

### Console Messages
On successful initialization, the browser console should show:
```
[ES5503] Mirage wavetable ROM loaded successfully
```

### Testing
1. Create ES5503 synth instance
2. Call `await synth.ensureInitialized()`
3. Play note using built-in waveform: `synth.setWaveform(ES5503Waveform.SINE)`
4. Play note using Mirage sample: `synth.setWaveform(8)` (first custom page)
5. Check oscilloscope for waveform differences

---

## File Sizes Summary

| Item | Size |
|------|------|
| Source files (uncompressed) | 51 MB (1,788 files) |
| Selected samples (raw PCM) | 110 KB (11 files) |
| ROM file (with header) | 112 KB |
| Compressed ZIP | 85 KB |
| **Compression ratio** | **~600:1** from original library |

---

## Future Enhancements

Possible improvements:
1. **User selection tool** - Allow users to choose which Mirage samples to include
2. **Custom wavetable import** - Upload .wav files and convert to ES5503 format
3. **Wavetable editor** - Visual waveform editor for creating custom wavetables
4. **Multi-bank support** - Multiple ROM packages for different sound categories

---

**All ES5503 ROM conversion complete! 🎹**
