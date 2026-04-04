export interface DecodedRegisterWrite {
  paramId: string;
  value: number;  // 0-1 normalized
}

/**
 * Stateful SID decoder that tracks multi-byte registers (frequency, pulse width, filter cutoff).
 * Call `write()` for each register write; it returns decoded params when a full value is available.
 */
export class SIDRegisterDecoder {
  private regs: Uint8Array[] = [];

  constructor(chipCount = 1) {
    for (let i = 0; i < chipCount; i++) {
      this.regs.push(new Uint8Array(25));
    }
  }

  write(chip: number, reg: number, value: number): DecodedRegisterWrite[] {
    if (chip >= this.regs.length || reg > 24) return [];

    this.regs[chip][reg] = value;
    const results: DecodedRegisterWrite[] = [];

    // Voice registers: 0-6 = voice 0, 7-13 = voice 1, 14-20 = voice 2
    if (reg <= 20) {
      const voice = Math.floor(reg / 7);
      const voiceReg = reg % 7;
      const prefix = `sid.${chip}.${voice}`;
      const base = voice * 7;

      switch (voiceReg) {
        case 0: // FREQ_LO
        case 1: { // FREQ_HI — emit combined 16-bit frequency
          const freq = this.regs[chip][base] | (this.regs[chip][base + 1] << 8);
          results.push({ paramId: `${prefix}.frequency`, value: freq / 65535 });
          break;
        }
        case 2: // PW_LO
        case 3: { // PW_HI — emit combined 12-bit pulse width
          const pw = this.regs[chip][base + 2] | ((this.regs[chip][base + 3] & 0x0F) << 8);
          results.push({ paramId: `${prefix}.pulseWidth`, value: pw / 4095 });
          break;
        }
        case 4: // Control register — 8 individual bits
          results.push({ paramId: `${prefix}.waveNoise`, value: (value >> 7) & 1 });
          results.push({ paramId: `${prefix}.wavePulse`, value: (value >> 6) & 1 });
          results.push({ paramId: `${prefix}.waveSaw`, value: (value >> 5) & 1 });
          results.push({ paramId: `${prefix}.waveTri`, value: (value >> 4) & 1 });
          results.push({ paramId: `${prefix}.test`, value: (value >> 3) & 1 });
          results.push({ paramId: `${prefix}.ringMod`, value: (value >> 2) & 1 });
          results.push({ paramId: `${prefix}.sync`, value: (value >> 1) & 1 });
          results.push({ paramId: `${prefix}.gate`, value: value & 1 });
          break;
        case 5: // Attack/Decay
          results.push({ paramId: `${prefix}.attack`, value: ((value >> 4) & 0xF) / 15 });
          results.push({ paramId: `${prefix}.decay`, value: (value & 0xF) / 15 });
          break;
        case 6: // Sustain/Release
          results.push({ paramId: `${prefix}.sustain`, value: ((value >> 4) & 0xF) / 15 });
          results.push({ paramId: `${prefix}.release`, value: (value & 0xF) / 15 });
          break;
      }
      return results;
    }

    // Filter and global registers: 21-24
    switch (reg) {
      case 21: // FC_LO
      case 22: { // FC_HI — emit combined 11-bit filter cutoff
        const fc = (this.regs[chip][21] & 0x07) | (this.regs[chip][22] << 3);
        results.push({ paramId: `sid.${chip}.filter.cutoff`, value: fc / 2047 });
        break;
      }
      case 23: // RES_FILT
        results.push({ paramId: `sid.${chip}.filter.resonance`, value: ((value >> 4) & 0xF) / 15 });
        results.push({ paramId: `sid.${chip}.filter.voice1`, value: value & 1 });
        results.push({ paramId: `sid.${chip}.filter.voice2`, value: (value >> 1) & 1 });
        results.push({ paramId: `sid.${chip}.filter.voice3`, value: (value >> 2) & 1 });
        results.push({ paramId: `sid.${chip}.filter.extIn`, value: (value >> 3) & 1 });
        break;
      case 24: // MODE_VOL
        results.push({ paramId: `sid.${chip}.filter.voice3off`, value: (value >> 7) & 1 });
        results.push({ paramId: `sid.${chip}.filter.hp`, value: (value >> 6) & 1 });
        results.push({ paramId: `sid.${chip}.filter.bp`, value: (value >> 5) & 1 });
        results.push({ paramId: `sid.${chip}.filter.lp`, value: (value >> 4) & 1 });
        results.push({ paramId: `sid.${chip}.global.volume`, value: (value & 0xF) / 15 });
        break;
    }

    return results;
  }

  reset(): void {
    for (const regs of this.regs) regs.fill(0);
  }
}
