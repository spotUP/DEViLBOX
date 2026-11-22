// Places Banjo song data into the prebuilt 64 KB player (public/sms/player.sms) and fixes the Sega header.
// Layout (tools/sms-player/sms-player.asm): bank 0 = player, bank 1 = header only, banks 2-3 = song, which the player
// maps into slots 1-2 (Z80 0x4000-0xBFFF) through the Sega mapper.
import type { BanjoLayout, BanjoSong } from './banjoSong';

const ROM_BYTES = 0x10000;
const HEADER = 0x7ff0;
const SONG_WINDOW = 0x8000;
const SIZE_64K = 0xe;
const SN_CLOCK = 3579545;
const REGION_SMS_EXPORT = 4;
const REGION_GG_INTERNATIONAL = 7;

export function buildSmsRom(player: Uint8Array, layout: BanjoLayout, song: BanjoSong, gameGear: boolean): Uint8Array {
  if (player.length !== ROM_BYTES) throw new Error(`Master System player is ${player.length} bytes, expected ${ROM_BYTES}`);
  if (song.bytes.length > SONG_WINDOW) {
    throw new Error(`Song data is ${song.bytes.length} bytes; the cartridge has room for ${SONG_WINDOW}`);
  }
  const rom = player.slice();
  rom.set(song.bytes, layout.song_rom);
  rom[layout.song_hz] = song.hz;
  // Retune sn_tone_lookup (12 semitones x 16 fine steps from A = 110 Hz) by the song's leftover tuning; periods only shrink.
  for (let i = 0; i < 192; i++) {
    const period = Math.round(SN_CLOCK / 32 / (110 * 2 ** ((i / 16 + song.tune) / 12)));
    rom[layout.sn_tone_rom + 2 * i] = period & 0xff;
    rom[layout.sn_tone_rom + 2 * i + 1] = period >> 8;
  }
  rom[0x7fff] = ((gameGear ? REGION_GG_INTERNATIONAL : REGION_SMS_EXPORT) << 4) | SIZE_64K;
  // Checksum for the 64 KB size code: 16-bit sum of every byte except the 16-byte header at 0x7FF0.
  let sum = 0;
  for (let i = 0; i < ROM_BYTES; i++) if (i < HEADER || i >= HEADER + 16) sum = (sum + rom[i]) & 0xffff;
  rom[0x7ffa] = sum & 0xff;
  rom[0x7ffb] = sum >> 8;
  return rom;
}
