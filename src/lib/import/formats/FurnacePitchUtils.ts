/**
 * FurnacePitchUtils - Accurate frequency to chip register mapping
 *
 * Logic based on ymfm and Furnace hardware drivers.
 * Reference: Furnace engine.cpp calcBaseFreq, CONVERT_FNUM_BLOCK
 */

export interface ChipPitch {
  block: number;   // Octave/Block (0-7)
  fnum: number;    // F-Number (0-1023 or 0-2047)
}

export class FurnacePitchUtils {
  // Constants for standard hardware clocks and frequency bases
  // Reference: Furnace genesis.h, ym2203.h, fmshared_OPN.h
  public static readonly CLOCK_OPN2 = 7670454;     // Genesis NTSC (COLOR_NTSC * 15 / 7)
  public static readonly CLOCK_OPN2_PAL = 7600489; // Genesis PAL
  public static readonly CLOCK_OPN = 4000000;      // YM2203 PC-88/98 (4MHz typical)
  public static readonly CLOCK_OPM  = 3579545;     // Arcade standard

  // Frequency bases (clock * prescaler factor) - used for F-Number calculation
  public static readonly FREQ_BASE_OPN2 = 9440540.0;  // Genesis (divBase=72)
  public static readonly FREQ_BASE_OPN = 4720270.0;   // YM2203 (divBase=36)
  public static readonly FREQ_BASE_OPM = 3579545.0;   // YM2151

  /**
   * Calculate OPN2 (YM2612) Block and F-Number
   * Reference: YM2612 Application Manual, Furnace genesis.cpp
   *
   * Hardware formula: Freq = (Fnum * chipClock) / (144 * 2^(21-Block))
   * Rearranged: Fnum = (Freq * 144 * 2^(21-Block)) / chipClock
   *
   * The YM2612 has:
   * - 11-bit F-Number (0-2047)
   * - 3-bit Block (0-7), each block doubles the frequency
   * - At block 4, F-Number ~1084 = A4 (440Hz)
   */
  public static freqToOPN2(freq: number): ChipPitch {
    if (freq <= 0) return { block: 0, fnum: 0 };

    const clock = this.CLOCK_OPN2; // 7670454 Hz (Genesis NTSC)

    // Find the appropriate block (octave)
    // Higher blocks = lower fnum for same frequency
    // We want fnum in valid 0-2047 range, ideally 600-1200 for precision
    let block = 7;
    let fnum = 0;

    // Start from highest block (smallest fnum) and work down until fnum is large enough
    for (block = 7; block >= 0; block--) {
      // Fnum = (Freq * 144 * 2^21) / (chipClock * 2^Block)
      const divisor = Math.pow(2, block);
      fnum = Math.round((freq * 144 * 2097152) / (clock * divisor));

      // If fnum is in valid range and reasonably large, use this block
      if (fnum <= 2047 && fnum >= 600) {
        break;
      }
      // If fnum is valid but small, try lower block for more precision
      if (fnum <= 2047 && fnum < 600 && block > 0) {
        continue;
      }
      // If we're at block 0 and fnum is still valid, use it
      if (block === 0 && fnum <= 2047) {
        break;
      }
    }

    // Handle edge cases: if fnum overflows at block 7, clamp to max
    if (fnum > 2047) {
      block = 7;
      fnum = 2047;
    }

    // Clamp to valid ranges
    block = Math.max(0, Math.min(7, block));
    fnum = Math.max(0, Math.min(2047, fnum));

    return { block, fnum };
  }

  /**
   * Calculate OPM (YM2151) Key Code and Key Fraction
   * OPM uses a different system: Key Code (octave + note) and 6-bit Fraction
   * Reference: Furnace arcade.cpp noteMap and hScale function
   */
  public static freqToOPM(freq: number): { kc: number; kf: number } {
    // OPM note mapping - from Furnace arcade.cpp
    // The YM2151 doesn't use a linear note mapping; it skips values 3, 7, 11
    const noteMap = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];

    if (freq <= 0) return { kc: 0, kf: 0 };

    // Frequency to MIDI note conversion
    const midi = 12 * Math.log2(freq / 440) + 69;
    const note = Math.floor(midi);
    const fraction = midi - note;

    // KC format: bits 4-6 = octave (0-7), bits 0-3 = note from noteMap
    // Furnace hScale: ((note/12)<<4)+(noteMap[note%12])
    const octave = Math.floor(note / 12) - 1;
    const noteInOctave = note % 12;

    // Apply OPM note mapping and clamp octave to valid range
    const clampedOctave = Math.max(0, Math.min(7, octave));
    const kc = (clampedOctave << 4) | noteMap[noteInOctave];
    const kf = Math.floor(fraction * 64) & 0x3F; // 6-bit fraction

    return { kc, kf };
  }

  /**
   * Calculate Game Boy frequency (11-bit)
   * Formula: 2048 - (131072 / Freq)
   */
  public static freqToGB(freq: number): number {
    if (freq <= 0) return 0;
    const val = 2048 - (131072 / freq);
    return Math.max(0, Math.min(2047, Math.floor(val)));
  }

  /**
   * Calculate NES Pulse/Triangle period
   * Formula: CPU / (16 * Freq) - 1
   * NTSC CPU = 1789773 Hz
   */
  public static freqToNES(freq: number): number {
    if (freq <= 0) return 0;
    const val = (1789773 / (16 * freq)) - 1;
    return Math.max(0, Math.min(2047, Math.floor(val)));
  }

  /**
   * Calculate NES Noise period index (0-15)
   * The NES noise channel uses a 4-bit period index that maps to specific periods:
   * $0=4, $1=8, $2=16, $3=32, $4=64, $5=96, $6=128, $7=160,
   * $8=202, $9=254, $A=380, $B=508, $C=762, $D=1016, $E=2034, $F=4068
   * We map frequency to the closest period index.
   */
  public static freqToNESNoise(freq: number): number {
    // NES noise period lookup table (NTSC)
    const periodTable = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];

    if (freq <= 0) return 0xF; // Lowest frequency = highest period

    // Calculate the period we need: CPU / freq
    // NTSC CPU = 1789773 Hz, noise is clocked at CPU/2 and periods are in samples
    const targetPeriod = 1789773 / freq;

    // Find closest period index
    let bestIndex = 0;
    let bestDiff = Math.abs(periodTable[0] - targetPeriod);

    for (let i = 1; i < 16; i++) {
      const diff = Math.abs(periodTable[i] - targetPeriod);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  /**
   * Calculate AY-3-8910/YM2149 frequency
   * Formula: chipClock / (16 * freq)
   * Default clock: 1789773 Hz (NES-compatible)
   */
  public static freqToAY(freq: number, clock: number = 1789773): number {
    if (freq <= 0) return 0;
    const val = Math.floor(clock / (16 * freq));
    return Math.max(0, Math.min(4095, val)); // 12-bit
  }

  /**
   * Calculate PCE/TurboGrafx-16 frequency
   * Formula: chipClock / (32 * freq)
   * Clock: 3579545 Hz
   */
  public static freqToPCE(freq: number): number {
    if (freq <= 0) return 0;
    const val = Math.floor(3579545 / (32 * freq));
    return Math.max(0, Math.min(4095, val)); // 12-bit
  }

  /**
   * Calculate SCC/SCC+ frequency
   * Formula: chipClock / (16 * freq) - 1
   * Clock: 3579545 Hz
   */
  public static freqToSCC(freq: number): number {
    if (freq <= 0) return 0;
    const val = Math.floor(3579545 / (16 * freq)) - 1;
    return Math.max(0, Math.min(4095, val)); // 12-bit
  }

  /**
   * Calculate C64 SID frequency (16-bit)
   * Formula: (freq * 16777216) / chipClock
   * Clock: 985248 Hz (PAL) or 1022727 Hz (NTSC)
   */
  public static freqToSID(freq: number, pal: boolean = true): number {
    if (freq <= 0) return 0;
    const clock = pal ? 985248 : 1022727;
    const val = Math.floor((freq * 16777216) / clock);
    return Math.max(0, Math.min(65535, val)); // 16-bit
  }

  /**
   * Calculate PSG (SN76489) frequency
   * Formula: chipClock / (32 * freq)
   * Clock: 3579545 Hz
   */
  public static freqToPSG(freq: number): number {
    if (freq <= 0) return 0;
    const val = Math.floor(3579545 / (32 * freq));
    return Math.max(0, Math.min(1023, val)); // 10-bit
  }

  /**
   * Calculate SNES DSP pitch value
   * Formula: (freq * 4096) / 32000
   * Sample rate: 32000 Hz
   */
  public static freqToSNES(freq: number): number {
    if (freq <= 0) return 0;
    const val = Math.floor((freq * 4096) / 32000);
    return Math.max(0, Math.min(0x3FFF, val)); // 14-bit
  }

  /**
   * Calculate FDS (Famicom Disk System) frequency
   * Formula: (freq * 65536) / chipClock
   * Clock: 1789773 Hz
   */
  public static freqToFDS(freq: number): number {
    if (freq <= 0) return 0;
    const val = Math.floor((freq * 65536) / 1789773);
    return Math.max(0, Math.min(4095, val)); // 12-bit
  }

  /**
   * Calculate VRC6 period
   * Formula: chipClock / (16 * freq) - 1
   * Clock: 3579545 Hz
   */
  public static freqToVRC6(freq: number): number {
    if (freq <= 0) return 0;
    const val = Math.floor(3579545 / (16 * freq)) - 1;
    return Math.max(0, Math.min(4095, val)); // 12-bit
  }

  /**
   * Calculate POKEY (Atari) frequency
   * Formula: chipClock / (2 * freq) - 1
   * Clock: 1789773 Hz
   */
  public static freqToPOKEY(freq: number): number {
    if (freq <= 0) return 0;
    const val = Math.floor(1789773 / (2 * freq)) - 1;
    return Math.max(0, Math.min(255, val)); // 8-bit
  }

  /**
   * Calculate TIA (Atari 2600) frequency
   * Formula: chipClock / (32 * freq) - 1
   * Clock: 31440 Hz
   */
  public static freqToTIA(freq: number): number {
    if (freq <= 0) return 0;
    const val = Math.floor(31440 / (32 * freq)) - 1;
    return Math.max(0, Math.min(31, val)); // 5-bit
  }

  /**
   * Calculate VIC-20 frequency
   * Formula: 256 - (chipClock / (32 * freq))
   * Clock: 1022727 Hz (NTSC)
   */
  public static freqToVIC(freq: number): number {
    if (freq <= 0) return 0;
    const val = Math.floor(256 - (1022727 / (32 * freq)));
    return Math.max(0, Math.min(127, val)); // 7-bit
  }

  /**
   * Calculate TED (Commodore Plus/4) frequency
   * Formula: 1024 - (chipClock / (8 * freq))
   * Clock: 1773447 Hz
   */
  public static freqToTED(freq: number): number {
    if (freq <= 0) return 0;
    const val = Math.floor(1024 - (1773447 / (8 * freq)));
    return Math.max(0, Math.min(1023, val)); // 10-bit
  }

  /**
   * Calculate Amiga Paula period
   * Formula: chipClock / (freq * 2)
   * Clock: 3546895 Hz (PAL)
   */
  public static freqToAmiga(freq: number, pal: boolean = true): number {
    if (freq <= 0) return 65535;
    const clock = pal ? 3546895 : 3579545;
    const val = Math.floor(clock / (freq * 2));
    return Math.max(124, Math.min(65535, val)); // 16-bit, min period 124
  }
}
