/**
 * FurnaceInstrumentEncoder - Serialize FurnaceConfig to DEViLBOX instrument binary format
 *
 * This encodes to the custom 0xF0B1 format consumed by our WASM wrapper:
 * See: furnace-wasm/common/FurnaceDispatchWrapper.cpp :: furnace_dispatch_set_instrument_full()
 *
 * Binary format (variable length):
 *   Header (32 bytes):
 *     [0-1]   magic: 0xF0 0xB1
 *     [2]     version
 *     [3]     type (DivInstrumentType)
 *     [4-7]   totalSize (uint32)
 *     [8-11]  fmOffset (uint32) - offset to FM data, 0 if none
 *     [12-15] stdOffset (uint32) - offset to STD/macro data
 *     [16-19] chipOffset (uint32) - offset to chip-specific data
 *     [20-23] sampleOffset (uint32) - offset to sample/amiga data
 *     [24-27] reserved
 *     [28-31] nameLen (uint32)
 *   [32-...]  name (nameLen bytes, UTF-8)
 *   [...]     FM data (if fmOffset > 0)
 *   [...]     STD/macro data
 *   [...]     Chip-specific data
 *   [...]     Sample/amiga data
 */

import type { FurnaceConfig, FurnaceMacro } from '@typedefs/instrument';

// DivInstrumentType values (from instrument.h)
const DIV_INS_STD = 0;
const DIV_INS_FM = 1;
const DIV_INS_GB = 2;
const DIV_INS_C64 = 3;
const DIV_INS_N163 = 17;
const DIV_INS_OPZ = 19;
const DIV_INS_SNES = 29;
const DIV_INS_OPL_DRUMS = 32;
const DIV_INS_OPM = 33;
const DIV_INS_OPLL = 13;
const DIV_INS_OPL = 14;
const DIV_INS_FDS = 15;
const DIV_INS_ESFM = 55;

/** All FM-based instrument types that have operator data */
const FM_INSTRUMENT_TYPES = new Set([
  DIV_INS_STD,  // STD can have FM data too
  DIV_INS_FM,
  DIV_INS_OPLL,
  DIV_INS_OPL,
  DIV_INS_OPZ,
  DIV_INS_OPL_DRUMS,
  DIV_INS_OPM,
  DIV_INS_ESFM,
]);

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

  writeInt32(value: number): void {
    this.writeUint32(value);
  }

  writeInt8(value: number): void {
    this.writeUint8(value < 0 ? value + 256 : value);
  }

  getPosition(): number {
    return this.buffer.length;
  }

  patchUint32(position: number, value: number): void {
    this.buffer[position] = value & 0xFF;
    this.buffer[position + 1] = (value >> 8) & 0xFF;
    this.buffer[position + 2] = (value >> 16) & 0xFF;
    this.buffer[position + 3] = (value >> 24) & 0xFF;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/** Convert boolean-or-number field to uint8 */
function boolToU8(val: boolean | number | undefined): number {
  if (val === undefined) return 0;
  if (typeof val === 'number') return val & 0xFF;
  return val ? 1 : 0;
}

/**
 * Encode a complete Furnace instrument to binary format
 *
 * chipType in FurnaceConfig is already DivInstrumentType — no remapping needed.
 * Reference: furnace-wasm/common/FurnaceDispatchWrapper.cpp:3631
 */
export function encodeFurnaceInstrument(config: FurnaceConfig, name: string = 'Instrument'): Uint8Array {
  const writer = new BinaryWriter();

  // Header magic: 0xF0 0xB1
  writer.writeUint8(0xF0);
  writer.writeUint8(0xB1);

  // Version
  writer.writeUint8(1);

  // Instrument type — chipType IS the DivInstrumentType already
  writer.writeUint8(config.chipType);

  // Reserve space for header offsets (will patch later)
  const totalSizePos = writer.getPosition();
  writer.writeUint32(0); // [4-7]   totalSize
  writer.writeUint32(0); // [8-11]  fmOffset
  writer.writeUint32(0); // [12-15] stdOffset
  writer.writeUint32(0); // [16-19] chipOffset
  writer.writeUint32(0); // [20-23] sampleOffset
  writer.writeUint32(0); // [24-27] reserved

  // Name length + name bytes
  const nameBytes = new TextEncoder().encode(name);
  writer.writeUint32(nameBytes.length);
  for (const byte of nameBytes) {
    writer.writeUint8(byte);
  }

  // === FM data ===
  // Reference: FurnaceDispatchWrapper.cpp:3654-3692
  // C++ reads: fm[0]=alg, fm[1]=fb, fm[2]=fms, fm[3]=ams, fm[4]=fms2, fm[5]=ams2, fm[6]=ops, fm[7]=opllPreset
  // Then operators at fm+8, 24 bytes each:
  //   [0]=enable [1]=am [2]=ar [3]=dr [4]=mult [5]=rr [6]=sl [7]=tl
  //   [8]=dt2 [9]=rs [10]=dt(signed) [11]=d2r [12]=ssgEnv [13]=dam [14]=dvb [15]=egt
  //   [16]=ksl [17]=sus [18]=vib [19]=ws [20]=ksr [21]=kvs [22-23]=pad
  let fmOffset = 0;
  if (FM_INSTRUMENT_TYPES.has(config.chipType) && config.operators && config.operators.length > 0) {
    fmOffset = writer.getPosition();

    writer.writeUint8(config.algorithm || 0);
    writer.writeUint8(config.feedback || 0);
    writer.writeUint8(config.fms || 0);
    writer.writeUint8(config.ams || 0);
    writer.writeUint8(config.fms2 || 0);
    writer.writeUint8(config.ams2 || 0);
    writer.writeUint8(config.ops || 4);
    writer.writeUint8(config.opllPreset || 0);

    // Write 4 operators (24 bytes each)
    for (let i = 0; i < 4; i++) {
      if (i < config.operators.length) {
        const op = config.operators[i];
        writer.writeUint8(op.enabled ? 1 : 0);   // [0]  enable
        writer.writeUint8(boolToU8(op.am));       // [1]  am
        writer.writeUint8(op.ar || 0);            // [2]  ar
        writer.writeUint8(op.dr || 0);            // [3]  dr
        writer.writeUint8(op.mult || 0);          // [4]  mult
        writer.writeUint8(op.rr || 0);            // [5]  rr
        writer.writeUint8(op.sl || 0);            // [6]  sl
        writer.writeUint8(op.tl || 0);            // [7]  tl
        writer.writeUint8(op.dt2 || 0);           // [8]  dt2
        writer.writeUint8(op.rs || 0);            // [9]  rs
        writer.writeInt8(op.dt || 0);             // [10] dt (signed)
        writer.writeUint8(op.d2r || 0);           // [11] d2r
        writer.writeUint8(op.ssg || 0);           // [12] ssgEnv
        writer.writeUint8(boolToU8(op.dam));      // [13] dam
        writer.writeUint8(boolToU8(op.dvb));      // [14] dvb
        writer.writeUint8(boolToU8(op.egt));      // [15] egt
        writer.writeUint8(op.ksl || 0);           // [16] ksl
        writer.writeUint8(boolToU8(op.sus));      // [17] sus
        writer.writeUint8(boolToU8(op.vib));      // [18] vib
        writer.writeUint8(op.ws || 0);            // [19] ws
        writer.writeUint8(boolToU8(op.ksr));      // [20] ksr
        writer.writeUint8(op.kvs || 0);           // [21] kvs
        writer.writeUint8(0);                     // [22] pad
        writer.writeUint8(0);                     // [23] pad
      } else {
        for (let j = 0; j < 24; j++) writer.writeUint8(0);
      }
    }
  }

  // === STD/Macro data ===
  // Reference: FurnaceDispatchWrapper.cpp:3696-3730
  // Format per macro: [0]=len [1]=delay [2]=speed [3]=loop [4]=rel [5]=mode [6]=open
  // Then len × int32 values
  // 15 macros in order: vol, arp, duty, wave, pitch, ex1, ex2, ex3, alg, fb, fms, ams, panL, panR, phaseReset
  let stdOffset = 0;
  if (config.macros && config.macros.length > 0) {
    stdOffset = writer.getPosition();

    // Index macros by code (0-14)
    const macrosByCode: (FurnaceMacro | null)[] = new Array(15).fill(null);
    for (const macro of config.macros) {
      const code = macro.code ?? macro.type;
      if (code !== undefined && code >= 0 && code < 15) {
        macrosByCode[code] = macro;
      }
    }

    for (let i = 0; i < 15; i++) {
      const macro = macrosByCode[i];

      if (macro && macro.data && macro.data.length > 0) {
        writer.writeUint8(macro.data.length);                                   // len
        writer.writeUint8(macro.delay ?? 0);                                    // delay
        writer.writeUint8(macro.speed ?? 1);                                    // speed
        writer.writeUint8(macro.loop !== undefined ? macro.loop : 255);         // loop (255 = no loop)
        writer.writeUint8(macro.release !== undefined ? macro.release : 255);   // rel (255 = no release)
        writer.writeUint8(macro.mode ?? 0);                                     // mode
        writer.writeUint8(macro.open ? 1 : 0);                                 // open

        for (const value of macro.data) {
          writer.writeInt32(value);
        }
      } else {
        // Empty macro header (7 bytes, all zero)
        for (let j = 0; j < 7; j++) writer.writeUint8(0);
      }
    }
  }

  // === Chip-specific data ===
  // Reference: FurnaceDispatchWrapper.cpp:3732-3809
  let chipOffset = 0;

  if (config.chipType === DIV_INS_GB && config.gb) {
    chipOffset = writer.getPosition();
    const gb = config.gb;
    writer.writeUint8(gb.envVol || 0);
    writer.writeUint8(gb.envDir || 0);
    writer.writeUint8(gb.envLen || 0);
    writer.writeUint8(gb.soundLen || 0);
    writer.writeUint8(gb.softEnv ? 1 : 0);
    writer.writeUint8(gb.alwaysInit ? 1 : 0);
    writer.writeUint8(0); // doubleWave (not in our type, default 0)
    const hwSeqLen = gb.hwSeq?.length ?? 0;
    writer.writeUint8(hwSeqLen);
    if (gb.hwSeq) {
      for (const entry of gb.hwSeq) {
        writer.writeUint8(entry.cmd);
        writer.writeUint16(entry.data);
      }
    }
  }

  if (config.chipType === DIV_INS_C64 && config.c64) {
    chipOffset = writer.getPosition();
    const c64 = config.c64;
    // Byte 0: waveform flags
    let waveFlags = 0;
    if (c64.triOn) waveFlags |= 1;
    if (c64.sawOn) waveFlags |= 2;
    if (c64.pulseOn) waveFlags |= 4;
    if (c64.noiseOn) waveFlags |= 8;
    writer.writeUint8(waveFlags);
    writer.writeUint8(c64.a || 0);
    writer.writeUint8(c64.d || 0);
    writer.writeUint8(c64.s || 0);
    writer.writeUint8(c64.r || 0);
    writer.writeUint16(c64.duty || 0);
    writer.writeUint8(c64.ringMod ? 1 : 0);
    writer.writeUint8(c64.oscSync ? 1 : 0);
    // Byte 9: filter/config flags
    let filterFlags = 0;
    if (c64.toFilter) filterFlags |= 1;
    if (c64.initFilter) filterFlags |= 2;
    const dutyIsAbs = 'dutyIsAbs' in c64 ? c64.dutyIsAbs : false;
    if (dutyIsAbs) filterFlags |= 4;
    const filterIsAbs = 'filterIsAbs' in c64 ? (c64 as any).filterIsAbs : false;
    if (filterIsAbs) filterFlags |= 8;
    const noTest = 'noTest' in c64 ? (c64 as any).noTest : false;
    if (noTest) filterFlags |= 16;
    writer.writeUint8(filterFlags);
    writer.writeUint8(c64.filterResonance ?? c64.filterRes ?? 0);
    writer.writeUint16(c64.filterCutoff ?? 0);
    // Byte 13: filter type flags
    let filterTypeFlags = 0;
    if (c64.filterHP) filterTypeFlags |= 1;
    if (c64.filterLP) filterTypeFlags |= 2;
    if (c64.filterBP) filterTypeFlags |= 4;
    if (c64.filterCh3Off) filterTypeFlags |= 8;
    writer.writeUint8(filterTypeFlags);
  }

  if (config.chipType === DIV_INS_N163 && config.n163) {
    chipOffset = writer.getPosition();
    const n163 = config.n163;
    writer.writeUint32(n163.wave || 0);
    writer.writeUint32(n163.wavePos || 0);
    writer.writeUint32(n163.waveLen || 0);
    writer.writeUint8(n163.waveMode || 0);
    writer.writeUint8(n163.perChPos ? 1 : 0);
  }

  if (config.chipType === DIV_INS_FDS && config.fds) {
    chipOffset = writer.getPosition();
    const fds = config.fds;
    writer.writeUint32(fds.modSpeed || 0);
    writer.writeUint32(fds.modDepth || 0);
    writer.writeUint8(fds.initModTableWithFirstWave ? 1 : 0);
    // 32-step mod table (signed bytes)
    const table = fds.modTable || [];
    for (let i = 0; i < 32; i++) {
      writer.writeInt8(i < table.length ? table[i] : 0);
    }
  }

  if (config.chipType === DIV_INS_SNES && config.snes) {
    chipOffset = writer.getPosition();
    const snes = config.snes;
    writer.writeUint8(snes.useEnv ? 1 : 0);
    writer.writeUint8(snes.sus ?? 0);
    writer.writeUint8(typeof snes.gainMode === 'number' ? snes.gainMode : 0);
    writer.writeUint8(snes.gain || 0);
    writer.writeUint8(snes.a || 0);
    writer.writeUint8(snes.d || 0);
    writer.writeUint8(snes.s || 0);
    writer.writeUint8(snes.r || 0);
    writer.writeUint8(snes.d2 ?? 0);
  }

  // === Sample/amiga data ===
  // Reference: FurnaceDispatchWrapper.cpp:3812-3830
  let sampleOffset = 0;
  if (config.amiga) {
    sampleOffset = writer.getPosition();
    const amiga = config.amiga;
    writer.writeUint16(amiga.initSample ?? -1);
    let sampleFlags = 0;
    if (amiga.useNoteMap) sampleFlags |= 1;
    if (amiga.useSample) sampleFlags |= 2;
    if (amiga.useWave) sampleFlags |= 4;
    writer.writeUint8(sampleFlags);
    writer.writeUint8(amiga.waveLen || 0);

    // Note map (120 entries × 8 bytes each)
    if (amiga.useNoteMap && amiga.noteMap) {
      for (let i = 0; i < 120; i++) {
        if (i < amiga.noteMap.length) {
          const entry = amiga.noteMap[i];
          writer.writeUint32(entry.frequency || 0);  // freq (int32)
          writer.writeUint16(entry.sample ?? -1);     // map (int16)
          writer.writeInt8(0);                        // dpcmFreq
          writer.writeInt8(0);                        // dpcmDelta
        } else {
          for (let j = 0; j < 8; j++) writer.writeUint8(0);
        }
      }
    }
  }

  // Patch header with final offsets
  const totalSize = writer.getPosition();
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
  console.log(`[FurnaceEncoder] Encoding instrument ${instrumentIndex}: "${name}" (type=${config.chipType})`);
  const binaryData = encodeFurnaceInstrument(config, name);
  console.log(`[FurnaceEncoder] Encoded ${binaryData.length} bytes`);
  return binaryData;
}
