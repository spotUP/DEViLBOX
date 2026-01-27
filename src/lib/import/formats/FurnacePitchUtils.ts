/**
 * FurnacePitchUtils - Accurate frequency to chip register mapping
 * 
 * Logic based on ymfm and Furnace hardware drivers.
 */

export interface ChipPitch {
  block: number;   // Octave/Block (0-7)
  fnum: number;    // F-Number (0-1023 or 0-2047)
}

export class FurnacePitchUtils {
  // Constants for standard hardware clocks
  public static readonly CLOCK_OPN2 = 7670454; // Genesis NTSC
  public static readonly CLOCK_OPM  = 3579545; // Arcade standard

  /**
   * Calculate OPN2 (YM2612) Block and F-Number
   * Formula: Fnum = (Freq * 2^20 / (Clock / 144)) / 2^(block-1)
   */
  public static freqToOPN2(freq: number): ChipPitch {
    // We want the highest F-Number possible for precision
    // OPN2 F-Number is 11-bit (0-2047)
    let block = 0;
    let fnum = 0;

    // Find the highest block that fits the frequency
    // Each block doubles the frequency range
    for (block = 7; block >= 0; block--) {
      // Magic constant for OPN2: (2^20 / (7670454 / 144)) = 19.6608
      fnum = Math.floor((freq * 144 * (1 << 20)) / (this.CLOCK_OPN2 * (1 << (block - 1))));
      if (fnum >= 0 && fnum <= 2047) break;
    }

    return { 
      block: Math.max(0, block), 
      fnum: Math.max(0, Math.min(2047, fnum)) 
    };
  }

  /**
   * Calculate OPM (YM2151) Key Code and Key Fraction
   * OPM uses a different system: Key Code (octave + note) and 6-bit Fraction
   */
  public static freqToOPM(freq: number): { kc: number; kf: number } {
    // Frequency to MIDI note conversion
    const midi = 12 * Math.log2(freq / 440) + 69;
    const note = Math.floor(midi);
    const fraction = midi - note;

    // KC: bits 0-3 = note (0-11), bits 4-6 = octave
    const octave = Math.floor(note / 12) - 1;
    const noteInOctave = note % 12;
    
    // OPM Note mapping is slightly different (0=C#, 1=D... 11=C, 12=C#)
    // We use a simplified mapping for now
    const kc = (octave << 4) | (noteInOctave & 0x0F);
    const kf = Math.floor(fraction * 64); // 6-bit fraction

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
}
