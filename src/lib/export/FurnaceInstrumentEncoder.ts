/**
 * FurnaceInstrumentEncoder - Serialize FurnaceConfig to Furnace binary format
 * 
 * Based on Furnace source code:
 * - src/engine/instrument.cpp (writeInsData, writeInsDataNew)
 * - src/engine/fileOps/insCodec.cpp
 * 
 * This allows us to rebuild instrument binary data after UI edits,
 * enabling full round-trip editing of Furnace instruments.
 */

import type { FurnaceConfig } from '@typedefs/instrument';

/**
 * Binary writer helper class
 */
class BinaryWriter {
  private buffer: number[] = [];

  writeUint8(value: number): void {
    this.buffer.push(value & 0xFF);
  }

  writeUint16(value: number): void {
    this.buffer.push(value & 0xFF);
    this.buffer.push((value >> 8) & 0xFF);
  }

  writeUint32(value: number): void {
    this.buffer.push(value & 0xFF);
    this.buffer.push((value >> 8) & 0xFF);
    this.buffer.push((value >> 16) & 0xFF);
    this.buffer.push((value >> 24) & 0xFF);
  }

  writeInt8(value: number): void {
    this.writeUint8(value);
  }

  writeInt16(value: number): void {
    this.writeUint16(value);
  }

  writeInt32(value: number): void {
    this.writeUint32(value);
  }

  writeString(str: string): void {
    const bytes = new TextEncoder().encode(str);
    for (const byte of bytes) {
      this.buffer.push(byte);
    }
    this.buffer.push(0); // null terminator
  }

  /**
   * Write a magic string without null terminator or padding
   * Used for FINS (4 bytes) and feature codes like NA, FM (2 bytes)
   */
  writeMagic(magic: string): void {
    const bytes = new TextEncoder().encode(magic);
    for (const byte of bytes) {
      this.buffer.push(byte);
    }
  }

  getLength(): number {
    return this.buffer.length;
  }

  // Get current position for length calculations
  getPosition(): number {
    return this.buffer.length;
  }

  // Patch a uint16 at a specific position
  patchUint16(position: number, value: number): void {
    this.buffer[position] = value & 0xFF;
    this.buffer[position + 1] = (value >> 8) & 0xFF;
  }

  // Patch a uint32 at a specific position
  patchUint32(position: number, value: number): void {
    this.buffer[position] = value & 0xFF;
    this.buffer[position + 1] = (value >> 8) & 0xFF;
    this.buffer[position + 2] = (value >> 16) & 0xFF;
    this.buffer[position + 3] = (value >> 24) & 0xFF;
  }

  getBuffer(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  toUint8Array(): Uint8Array {
    return this.getBuffer();
  }
}

/**
 * Get Furnace instrument type code from chipType
 * Based on Furnace DivInstrumentType enum
 */
function getFurnaceInstrumentType(chipType: number): number {
  // Map chipType to Furnace instrument type
  // This is a simplified mapping - expand as needed
  const typeMap: Record<number, number> = {
    0: 1,   // OPN -> FM (OPN)
    1: 2,   // OPM -> FM (OPM)
    2: 3,   // OPL -> FM (OPL)
    3: 4,   // OPL drums -> FM (OPLL)
    8: 8,   // TIA -> TIA
    13: 1,  // OPNA -> FM (OPN)
    14: 1,  // OPNB -> FM (OPN)
    // Add more mappings as needed
  };
  
  return typeMap[chipType] || 0;
}

/**
 * Encode a complete Furnace instrument to binary format
 * 
 * Binary format (variable length):
 *   Header (32 bytes):
 *     [0-1] magic: 0xF0 0xB1
 *     [2] version
 *     [3] type (DivInstrumentType)
 *     [4-7] totalSize (uint32)
 *     [8-11] fmOffset (uint32) - offset to FM data, 0 if none
 *     [12-15] stdOffset (uint32) - offset to STD/macro data
 *     [16-19] chipOffset (uint32) - offset to chip-specific data
 *     [20-23] sampleOffset (uint32) - offset to sample/amiga data
 *     [24-27] reserved
 *     [28-31] nameLen (uint32)
 *   [32-...] name (nameLen bytes, UTF-8)
 *   [...] FM data (if fmOffset > 0)
 *   [...] STD/macro data
 */
export function encodeFurnaceInstrument(config: FurnaceConfig, name: string = 'Instrument'): Uint8Array {
  const writer = new BinaryWriter();
  
  // Write header magic: 0xF0 0xB1
  writer.writeUint8(0xF0);
  writer.writeUint8(0xB1);
  
  // Write version
  writer.writeUint8(1);
  
  // Write instrument type
  const insType = getFurnaceInstrumentType(config.chipType);
  writer.writeUint8(insType);
  
  // Reserve space for header fields (will patch later)
  const totalSizePos = writer.getPosition();
  writer.writeUint32(0); // totalSize placeholder
  writer.writeUint32(0); // fmOffset placeholder
  writer.writeUint32(0); // stdOffset placeholder
  writer.writeUint32(0); // chipOffset placeholder
  writer.writeUint32(0); // sampleOffset placeholder
  writer.writeUint32(0); // reserved
  
  // Write name length and name
  const nameBytes = new TextEncoder().encode(name);
  writer.writeUint32(nameBytes.length);
  for (const byte of nameBytes) {
    writer.writeUint8(byte);
  }
  
  // Now write FM data if chip supports it
  let fmOffset = 0;
  const isFMChip = [0, 1, 2, 3].includes(config.chipType); // OPN, OPM, OPL, OPLL
  if (isFMChip && config.operators && config.operators.length > 0) {
    fmOffset = writer.getPosition();
    
    // FM data format:
    // [0] alg, [1] fb, [2] fms, [3] ams, [4] fms2, [5] ams2, [6] ops, [7] opllPreset
    // [8+] operators (24 bytes each)
    writer.writeUint8(config.algorithm || 0);
    writer.writeUint8(config.feedback || 0);
    writer.writeUint8(config.fms || 0);
    writer.writeUint8(config.ams || 0);
    writer.writeUint8(config.fms2 || 0);
    writer.writeUint8(config.ams2 || 0);
    writer.writeUint8(config.ops || 4);
    writer.writeUint8(config.opllPreset || 0);
    
    // Write operators (always 4, pad if needed)
    for (let i = 0; i < 4; i++) {
      if (i < config.operators.length) {
        const op = config.operators[i];
        writer.writeUint8(op.enabled ? 1 : 0);
        writer.writeUint8(typeof op.am === 'number' ? op.am : (op.am ? 1 : 0));
        writer.writeUint8(op.ar || 0);
        writer.writeUint8(op.dr || 0);
        writer.writeUint8(op.mult || 0);
        writer.writeUint8(op.rr || 0);
        writer.writeUint8(op.sl || 0);
        writer.writeUint8(op.tl || 0);
        writer.writeUint8(op.dt2 || 0);
        writer.writeUint8(op.rs || 0);
        writer.writeUint8(op.dt || 0);
        writer.writeUint8(op.d2r || 0);
        writer.writeUint8(op.ssg || 0);
        writer.writeUint8(typeof op.dam === 'number' ? op.dam : (op.dam ? 1 : 0));
        writer.writeUint8(typeof op.dvb === 'number' ? op.dvb : (op.dvb ? 1 : 0));
        writer.writeUint8(typeof op.egt === 'number' ? op.egt : (op.egt ? 1 : 0));
        writer.writeUint8(op.ksl || 0);
        writer.writeUint8(typeof op.sus === 'number' ? op.sus : (op.sus ? 1 : 0));
        writer.writeUint8(typeof op.vib === 'number' ? op.vib : (op.vib ? 1 : 0));
        writer.writeUint8(op.ws || 0);
        writer.writeUint8(typeof op.ksr === 'number' ? op.ksr : (op.ksr ? 1 : 0));
        writer.writeUint8(op.kvs || 0);
        // Pad to 24 bytes
        writer.writeUint8(0);
        writer.writeUint8(0);
      } else {
        // Write empty operator (24 bytes)
        for (let j = 0; j < 24; j++) {
          writer.writeUint8(0);
        }
      }
    }
  }
  
  // STD/Macro data offset
  let stdOffset = 0;
  if (config.macros && config.macros.length > 0) {
    stdOffset = writer.getPosition();
    console.log(`[FurnaceEncoder] Writing ${config.macros.length} macros at offset ${stdOffset}`);
    console.log(`[FurnaceEncoder] Macro details:`, config.macros.map((m: any) => ({
      code: m.code,
      type: m.type,
      length: m.data?.length ?? 0,
      loop: m.loop,
      release: m.release,
      mode: m.mode
    })));
    
    // Log first macro's data values
    if (config.macros.length > 0) {
      const firstMacro = config.macros[0] as any;
      console.log(`[FurnaceEncoder] First macro code=${firstMacro.code} data=[${firstMacro.data?.slice(0, 16).join(',')}${firstMacro.data && firstMacro.data.length > 16 ? '...' : ''}]`);
    }
    
    // Create array to hold macros in correct positions (indexed by code)
    const macrosByCode: any[] = new Array(15).fill(null);
    for (const macro of config.macros) {
      const code = (macro as any).code;
      if (code !== undefined && code < 15) {
        macrosByCode[code] = macro;
      }
    }
    
    // Write up to 15 standard macros in order (by code)
    // Macro format: [0] len, [1] delay, [2] speed, [3] loop, [4] rel, [5] mode, [6] open
    // [7+] values (len × 4 bytes, int32)
    for (let i = 0; i < 15; i++) {
      const macro = macrosByCode[i];
      
      if (macro && macro.data && macro.data.length > 0) {
        console.log(`[FurnaceEncoder] Macro ${i}: type=${macro.type} len=${macro.data.length} loop=${macro.loop} release=${macro.release}`);
        writer.writeUint8(macro.data.length); // len
        writer.writeUint8(macro.delay ?? 0);  // delay
        writer.writeUint8(macro.speed ?? 1);  // speed
        // Don't use || operator! It converts -1/255 to falsy and writes 0 instead
        writer.writeUint8(macro.loop !== undefined ? macro.loop : 255);  // loop (255 = -1 = no loop)
        writer.writeUint8(macro.release !== undefined ? macro.release : 255); // rel (255 = -1 = no release)
        writer.writeUint8(macro.mode ?? 0);   // mode
        writer.writeUint8(macro.open ? 1 : 0); // open
        
        // Write macro values (int32)
        for (const value of macro.data) {
          writer.writeInt32(value);
        }
      } else {
        // Empty macro: len=0, all other fields=0
        for (let j = 0; j < 7; j++) {
          writer.writeUint8(0);
        }
      }
    }
  }
  
  // Chip-specific data offset (not implemented yet)
  const chipOffset = 0;
  
  // Sample/amiga data offset (not implemented yet)
  const sampleOffset = 0;
  
  // Get total size
  const totalSize = writer.getPosition();
  
  // Patch header with offsets
  writer.patchUint32(totalSizePos, totalSize);
  writer.patchUint32(totalSizePos + 4, fmOffset);
  writer.patchUint32(totalSizePos + 8, stdOffset);
  writer.patchUint32(totalSizePos + 12, chipOffset);
  writer.patchUint32(totalSizePos + 16, sampleOffset);
  
  return writer.toUint8Array();
}

/**
 * Rebuild and re-upload a Furnace instrument to the engine
 * Call this whenever the user edits a Furnace instrument in the UI
 */
export function updateFurnaceInstrument(
  config: FurnaceConfig,
  name: string,
  instrumentIndex: number
): Uint8Array {
  console.log(`[FurnaceEncoder] Encoding instrument ${instrumentIndex}: "${name}"`);
  const binaryData = encodeFurnaceInstrument(config, name);
  console.log(`[FurnaceEncoder] Encoded ${binaryData.length} bytes`);
  console.log(`[FurnaceEncoder] First 16 bytes (hex):`, 
    Array.from(binaryData.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')
  );
  return binaryData;
}
