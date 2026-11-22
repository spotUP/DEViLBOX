// Places Banjo song data into the prebuilt 32 KB player (public/sms/player.sms) and fixes the Sega header.

const HEADER = 0x7ff0;
const SIZE_32K = 0xc;
const REGION_SMS_EXPORT = 4;
const REGION_GG_INTERNATIONAL = 7;

export function buildSmsRom(player: Uint8Array, song: Uint8Array, songAddr: number, gameGear: boolean): Uint8Array {
  if (player.length !== 0x8000) throw new Error(`Master System player is ${player.length} bytes, expected 32768`);
  if (songAddr + song.length > HEADER) {
    throw new Error(`Song data is ${song.length} bytes; the cartridge has room for ${HEADER - songAddr}`);
  }
  const rom = player.slice();
  rom.set(song, songAddr);
  rom[0x7fff] = ((gameGear ? REGION_GG_INTERNATIONAL : REGION_SMS_EXPORT) << 4) | SIZE_32K;
  // Checksum: 16-bit sum of every byte before the header (32 KB size code).
  let sum = 0;
  for (let i = 0; i < HEADER; i++) sum = (sum + rom[i]) & 0xffff;
  rom[0x7ffa] = sum & 0xff;
  rom[0x7ffb] = sum >> 8;
  return rom;
}
