/**
 * SIDHeaderParser.ts — Lightweight SID header metadata extraction.
 * Reads PSID/RSID headers without instantiating the full C64SIDEngine.
 * Used in ImportModuleDialog to show chip info before importing.
 */

export interface SIDHeaderInfo {
  format: 'PSID' | 'RSID';
  version: number;
  title: string;
  author: string;
  copyright: string;
  subsongs: number;
  defaultSubsong: number;   // 0-based
  chipModel: '6581' | '8580' | 'Unknown';
  clockSpeed: 'PAL' | 'NTSC' | 'Unknown';
  secondSID: boolean;
  thirdSID: boolean;
}

function readStr(data: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && data[end] !== 0) end++;
  return new TextDecoder('latin1').decode(data.subarray(offset, end));
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

  // Flags at offset 0x76-0x77 (version >= 2)
  let chipModel: SIDHeaderInfo['chipModel'] = 'Unknown';
  let clockSpeed: SIDHeaderInfo['clockSpeed'] = 'Unknown';
  let secondSID = false;
  let thirdSID = false;

  if (version >= 2 && data.length > 0x77) {
    const flags = view.getUint16(0x76, false);

    // Bits 4-5: clock speed (00=unknown, 01=PAL, 10=NTSC, 11=both)
    const clock = (flags >> 2) & 0x03;
    if (clock === 1) clockSpeed = 'PAL';
    else if (clock === 2) clockSpeed = 'NTSC';

    // Bits 6-7: SID model (00=unknown, 01=6581, 10=8580, 11=both)
    const sid = (flags >> 4) & 0x03;
    if (sid === 1) chipModel = '6581';
    else if (sid === 2 || sid === 3) chipModel = '8580';

    // PSIDv3+: second/third SID chip flags at 0x7A-0x7B
    if (version >= 3 && data.length > 0x7B) {
      secondSID = (data[0x77] & 0x40) !== 0;
      if (version >= 4 && data.length > 0x7E) {
        thirdSID = (data[0x77] & 0x80) !== 0;
      }
    }
  }

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
  };
}
