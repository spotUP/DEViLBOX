/**
 * EnsoniqParser - Decodes Ensoniq VFX and ESQ-1 SysEx patch data
 */

export interface EnsoniqPatch {
  name: string;
  type: 'vfx' | 'esq1';
  registers: Record<number, number>;
}

export class EnsoniqParser {
  /**
   * Parse a raw SysEx buffer (.syx)
   */
  public static parse(data: Uint8Array): EnsoniqPatch | null {
    // Basic SysEx check: F0 ... F7
    if (data[0] !== 0xF0 || data[data.length - 1] !== 0xF7) {
      console.warn('[EnsoniqParser] Not a valid SysEx file');
      return null;
    }

    // Check Manufacturer ID (0x0F = Ensoniq)
    if (data[1] !== 0x0F) {
      console.warn('[EnsoniqParser] Not an Ensoniq SysEx file');
      return null;
    }

    // Check Product ID
    // 0x05 = ESQ-1 / SQ-80
    // 0x06 = VFX / SD-1
    const productId = data[2];
    
    if (productId === 0x05) {
      return this.parseESQ1(data);
    } else if (productId === 0x06) {
      return this.parseVFX(data);
    }

    return null;
  }

  /**
   * ESQ-1 Patch Parser (102 bytes per patch)
   */
  private static parseESQ1(data: Uint8Array): EnsoniqPatch {
    void data;
    // ESQ-1 SysEx format is nibbleized (2 bytes per internal byte)
    // or sometimes packed depending on the message type.
    // For now, we'll implement a simple name extraction and basic mapping.
    
    // Extract name (last 6 bytes of the 102 byte patch usually)
    // This varies by dump type, but we'll try a common offset
    const name = "ESQ1 PATCH";
    
    return {
      name,
      type: 'esq1',
      registers: {} // Mapping logic to be expanded
    };
  }

  /**
   * VFX Patch Parser
   */
  private static parseVFX(data: Uint8Array): EnsoniqPatch {
    let name = "VFX PATCH";
    
    // Extract name (offset 4-15 in many VFX dumps)
    const nameBytes = data.slice(4, 16);
    name = String.fromCharCode(...nameBytes).trim();

    return {
      name,
      type: 'vfx',
      registers: this.mapVFXPatchToRegisters(data)
    };
  }

  private static mapVFXPatchToRegisters(data: Uint8Array): Record<number, number> {
    const regs: Record<number, number> = {};
    
    // Ensoniq VFX has 6 "Voices" per patch. Each maps to 1 or more ES5506 oscillators.
    // This is a simplified mapping of the core oscillator parameters.
    for (let v = 0; v < 6; v++) {
      const voiceBase = 0x20 + (v * 0x40); // Rough estimate of patch data offsets
      const oscIdx = v; // Map patch voice to hardware oscillator
      
      // Page Select + Register
      const p = (reg: number) => (oscIdx << 8) | reg;

      // Wavetable Address (START/END)
      regs[p(0x08 | 0x80)] = data[voiceBase + 0x00]; // Start
      regs[p(0x10 | 0x80)] = data[voiceBase + 0x04]; // End
      
      // Pitch
      regs[p(0x08)] = data[voiceBase + 0x08]; // Freq Low
      regs[p(0x09)] = data[voiceBase + 0x09]; // Freq High
      
      // Volume
      regs[p(0x10)] = 0xFF; // Default full volume for now
      regs[p(0x11)] = 0xFF;
    }

    return regs;
  }
}
