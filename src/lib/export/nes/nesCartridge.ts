/**
 * NES cartridge (.nes, iNES 2.0, mapper 31): 6502 register-stream player (public/nes/player.bin) + the song's region stream.
 * Structure follows vectrex/vectrexCartridge.ts. The player image is an 8 bank (32 KB) mapper-31 ROM whose last 4 KB bank
 * holds code, vectors, title and start subsong; the cartridge keeps that bank last and puts the stream in the banks before it.
 * Mapper 31 selects 4 KB banks through an 8 bit register, so PRG is at most 1 MB (256 banks, the last one is the player).
 */
import { encodeNesStreams, NES_REGIONS, type NesRegion, type NesSubsongInput } from './nesStream';

export interface NesPlayer {
  bytes: Uint8Array;
  size: number;
  titleOffset: number;
  titleLength: number;
  startSubsongOffset: number;
  nmiAddress: number;
  bankSize: number;
  maxStreamBanks: number;
}

export async function fetchNesPlayer(): Promise<NesPlayer> {
  const base = import.meta.env.BASE_URL;
  const [bin, meta] = await Promise.all([
    fetch(`${base}nes/player.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}nes/player.json`).then((r) => r.json()),
  ]);
  return { ...meta, bytes: new Uint8Array(bin) };
}

export interface NesCartridgeResult { rom: Uint8Array; banks: number; streamBytes: number; seconds: number[] }

/** Title text as the ROM field holds it: printable ASCII, anything else a space, padded to the field. */
export function nesTitle(title: string, length: number): Uint8Array {
  return Uint8Array.from(title.replace(/[^\x20-\x7E]/g, ' ').slice(0, length).padEnd(length, ' '), (c) => c.charCodeAt(0));
}

export function buildNesCartridge(subsongs: readonly NesSubsongInput[], player: NesPlayer, title = 'devilbox', region: NesRegion = 'ntsc', startSubsong = 0): NesCartridgeResult {
  if (!subsongs.length) throw new Error('No NES capture to export. Play an NES-family song through while recording.');
  if (!NES_REGIONS.includes(region)) throw new Error(`Unknown region ${region}`);
  if (startSubsong < 0 || startSubsong >= subsongs.length) throw new Error(`Start subsong ${startSubsong} does not exist.`);
  const bank = player.bankSize;
  const stream = encodeNesStreams(subsongs, bank)[region];
  const streamBanks = Math.ceil(stream.length / bank);
  if (streamBanks > player.maxStreamBanks) {
    throw new Error(`The song needs ${streamBanks} banks of ${bank} bytes but mapper 31 addresses ${player.maxStreamBanks} stream banks (1 MB with the player bank); shorten the song.`);
  }
  let banks = 8; // the player image is 32 KB, the smallest the header allows here
  while (banks < streamBanks + 1) banks *= 2;
  const rom = new Uint8Array(16 + banks * bank);
  rom.set(player.bytes.subarray(0, 16));
  rom[4] = banks * bank / 16384; // PRG size in 16 KB units (at most 64, so the NES 2.0 high nibble in byte 9 stays 0)
  rom.set(stream, 16);
  const last = 16 + (banks - 1) * bank;
  const playerBankAt = player.size - bank;
  rom.set(player.bytes.subarray(playerBankAt), last);
  rom.set(nesTitle(title, player.titleLength), last + player.titleOffset - playerBankAt);
  rom[last + player.startSubsongOffset - playerBankAt] = startSubsong;
  return { rom, banks, streamBytes: stream.length, seconds: subsongs.map((s) => { const c = s[region] ?? s.ntsc; return c.events.length ? Math.max(...c.events.map((e) => e.sample)) / c.sampleRate : 0; }) };
}
