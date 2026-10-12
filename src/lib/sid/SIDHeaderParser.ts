/**
 * SIDHeaderParser.ts — Lightweight SID header metadata extraction.
 * Reads PSID/RSID headers without instantiating the full C64SIDEngine.
 * The one reader of the header: the import dialog, the format store and the
 * playback engine (C64SIDEngine) all take their chip model / chip count from here.
 *
 * Layout (HVSC SID_file_format.txt): flags word at 0x76 (v2+, big endian)
 *   bit 0     musPlayer
 *   bit 1     psidSpecific (PSID) / C64BASIC (RSID)
 *   bits 2-3  clock          (00 unknown, 01 PAL, 10 NTSC, 11 both)
 *   bits 4-5  sidModel       (00 unknown, 01 6581, 10 8580, 11 both)
 *   bits 6-7  secondSIDModel (v3+, same coding; 00 = same as the first)
 *   bits 8-9  thirdSIDModel  (v4+, same coding; 00 = same as the first)
 * 0x7A secondSIDAddress (v3+): middle byte of the chip's address, $D420 = 0x42;
 *      0 = no second chip. 0x7B thirdSIDAddress (v4+), same coding.
 */

export type SIDChipModel = '6581' | '8580' | 'Unknown';

export interface SIDHeaderInfo {
  format: 'PSID' | 'RSID';
  version: number;
  title: string;
  author: string;
  copyright: string;
  subsongs: number;
  defaultSubsong: number;   // 0-based
  /** Model of the first chip ('both' = the tune works on either; read as 8580, as jsSID does). */
  chipModel: SIDChipModel;
  clockSpeed: 'PAL' | 'NTSC' | 'Unknown';
  /** A second chip is present (0x7A holds a valid address). */
  secondSID: boolean;
  /** A third chip is present (0x7B holds a valid address). */
  thirdSID: boolean;
  /** SID chips the tune plays on: 1, 2 or 3. Each chip has 3 voices. */
  chipCount: number;
  /** Model of each chip, chipCount long (a second / third chip with model 00 takes the first's). */
  chipModels: SIDChipModel[];
}

function readStr(data: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && data[end] !== 0) end++;
  return new TextDecoder('latin1').decode(data.subarray(offset, end));
}

function modelFromBits(bits: number): SIDChipModel {
  if (bits === 1) return '6581';
  if (bits === 2 || bits === 3) return '8580';
  return 'Unknown';
}

/** An extra chip's address byte is valid when even, in $42-$7F or $E0-$FE (spec); 0 = no chip. */
function isChipAddress(b: number): boolean {
  return (b & 1) === 0 && ((b >= 0x42 && b <= 0x7E) || (b >= 0xE0 && b <= 0xFE));
}

/**
 * Parse SID file header. Returns null if not a valid SID file.
 */
export function parseSIDHeader(data: Uint8Array): SIDHeaderInfo | null {
  if (data.length < 0x76) return null;

  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== 'PSID' && magic !== 'RSID') return null;

  const view = new DataView(data.buffer, data.byteOffset);
  const version = view.getUint16(4, false);
  const songs = view.getUint16(0x0E, false);
  const startSong = view.getUint16(0x10, false);

  const title = readStr(data, 0x16, 32);
  const author = readStr(data, 0x36, 32);
  const copyright = readStr(data, 0x56, 32);

  let chipModel: SIDChipModel = 'Unknown';
  let clockSpeed: SIDHeaderInfo['clockSpeed'] = 'Unknown';
  let secondSID = false;
  let thirdSID = false;
  let secondModel: SIDChipModel = 'Unknown';
  let thirdModel: SIDChipModel = 'Unknown';

  if (version >= 2 && data.length >= 0x7C) {
    const flags = view.getUint16(0x76, false);

    const clock = (flags >> 2) & 0x03;
    if (clock === 1) clockSpeed = 'PAL';
    else if (clock === 2) clockSpeed = 'NTSC';

    chipModel = modelFromBits((flags >> 4) & 0x03);

    if (version >= 3) {
      secondSID = isChipAddress(data[0x7A]);
      secondModel = modelFromBits((flags >> 6) & 0x03);
      if (version >= 4) {
        thirdSID = isChipAddress(data[0x7B]);
        thirdModel = modelFromBits((flags >> 8) & 0x03);
      }
    }
  }

  const chipModels: SIDChipModel[] = [chipModel];
  if (secondSID) chipModels.push(secondModel === 'Unknown' ? chipModel : secondModel);
  if (thirdSID) chipModels.push(thirdModel === 'Unknown' ? chipModel : thirdModel);

  return {
    format: magic as 'PSID' | 'RSID',
    version,
    title,
    author,
    copyright,
    subsongs: songs,
    defaultSubsong: Math.max(0, startSong - 1),
    chipModel,
    clockSpeed,
    secondSID,
    thirdSID,
    chipCount: chipModels.length,
    chipModels,
  };
}

/** The SID Settings chip model choice: the header's model, or one the user forces. */
export type SidChipModelSetting = 'auto' | '6581' | '8580';

/**
 * The model a SID emulator plays the first chip as: the user's forced model
 * (SID Settings), else the header's, 6581 when the header does not say.
 */
export function sidPlaybackModel(info: Pick<SIDHeaderInfo, 'chipModel'> | null | undefined, setting: SidChipModelSetting = 'auto'): '6581' | '8580' {
  if (setting !== 'auto') return setting;
  return info?.chipModel === '8580' ? '8580' : '6581';
}

/** The SID Settings clock choice: the header's, or a PAL / NTSC the user forces. */
export type SidClockSetting = 'auto' | 'PAL' | 'NTSC';

/**
 * The machine a SID emulator runs the tune on: the user's forced clock (SID
 * Settings), else the header's, PAL when the header does not say (or says both).
 */
export function sidPlaybackClock(info: Pick<SIDHeaderInfo, 'clockSpeed'> | null | undefined, setting: SidClockSetting = 'auto'): 'PAL' | 'NTSC' {
  if (setting !== 'auto') return setting;
  return info?.clockSpeed === 'NTSC' ? 'NTSC' : 'PAL';
}

/** The SID Settings audio buffer: each engine's own size ('auto'), or a ScriptProcessor size in frames. */
export type SidBufferSizeSetting = 'auto' | 1024 | 2048 | 4096 | 8192 | 16384;

/** The ScriptProcessor buffer an engine plays through: the forced size, else the engine's own. */
export function sidBufferFrames(setting: SidBufferSizeSetting | undefined, engineDefault: number): number {
  return setting === undefined || setting === 'auto' ? engineDefault : setting;
}

/** What SID Settings forces on every tune, over its header (an undefined field = the header decides). */
export interface SidForcedPlayback {
  chipModel?: '6581' | '8580';
  clock?: 'PAL' | 'NTSC';
}

/**
 * The SID Settings that override a tune's header: a forced model or clock.
 * Applied whenever the setting is not 'auto', even when it names what the
 * header says: the emulators read some header codes their own way (WebSID
 * plays a "PAL and NTSC" tune as NTSC), so "same as the header" is the
 * emulator's call, not this one's.
 */
export function sidForcedPlayback(settings: { chipModel?: SidChipModelSetting; clock?: SidClockSetting }): SidForcedPlayback {
  const out: SidForcedPlayback = {};
  if (settings.chipModel && settings.chipModel !== 'auto') out.chipModel = settings.chipModel;
  if (settings.clock && settings.clock !== 'auto') out.clock = settings.clock;
  return out;
}

/**
 * A C64 SID file (PSID / RSID magic at offset 0). The extension alone is no
 * proof: .sid is also SIDMon on the Amiga.
 */
export function isSidFileBytes(data: ArrayBuffer | Uint8Array): boolean {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data, 0, Math.min(4, data.byteLength));
  return b.length >= 4 && (b[0] === 0x50 || b[0] === 0x52) && b[1] === 0x53 && b[2] === 0x49 && b[3] === 0x44;
}
