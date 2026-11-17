/**
 * NES cartridge (.nes, iNES 2.0, mapper 31): 6502 register-stream player (public/nes/player.bin) + the song's region stream.
 * Structure follows vectrex/vectrexCartridge.ts. The player image is an 8 bank (32 KB) mapper-31 ROM whose last 4 KB bank
 * holds code, vectors, title and start subsong; the cartridge keeps that bank last and puts the stream in the banks before it.
 * Mapper 31 selects 4 KB banks through an 8 bit register, so PRG is at most 1 MB (256 banks, the last one is the player).
 *
 * Expansion chips (Phase 5). The player writes the capture's chips at their canonical, non-mirrored addresses: VRC6 $9000-$B002,
 * VRC7 $9010 select / $9030 data (>=6 cycles between, >=42 after the data write), FDS $4040-$408A, MMC5 $5000-$5015,
 * N163 $F800 (bit 7 = autoincrement) / $4800, 5B $C000 select / $E000 data. A cartridge carrying several chips at once is a
 * custom multi-chip board: NES 2.0 submapper note, mapper 31 banking plus every chip's registers decoded by the board. Its
 * decode must (a) take bank registers at $5FF8-$5FFF only, so MMC5's $5000-$5015 is not a bank write (Mesen2's mapper 31 decodes
 * all of $5000-$5FFF, so MMC5 aliases the bank windows there), and (b) ignore writes to $8000-$FFFF as banking (mapper 31 does).
 * No emulator models this combined board: it is unverified; each chip is checked only as bus writes on the mapper-31 cart.
 *
 * Tick source (Phase 6). Three region streams (NTSC, PAL, Dendy) are stored; the player counts 12-cycle loop iterations between
 * two vblanks at boot to pick one (regbank[] in the player bank holds each stream's first bank). A song within 0.5 percent of the
 * region frame rate ticks on NMI. Any other rate (e.g. 75 Hz) ticks on the board's cycle IRQ: $4100 reload low, $4101 reload high
 * (CPU cycles per tick), $4102 bit 0 enable, $4103 write acknowledges. These sit outside $5000-$5FFF because Mesen2 aliases all of
 * that range as bank registers. The IRQ board is a spec, not hardware: no emulator models it. The table holds at most 36 subsongs.
 */
import { encodeNesStreams, NES_REGION_TIMING, NES_REGIONS, type NesRegion, type NesSubsongInput } from './nesStream';

export interface NesPlayer {
  bytes: Uint8Array;
  size: number;
  titleOffset: number;
  titleLength: number;
  startSubsongOffset: number;
  regbankOffset: number;
  authorOffset: number;
  authorLength: number;
  chipNameOffset: number;
  chipNameLength: number;
  scrollOffset: number;
  scrollLength: number;
  subsongCountOffset: number;
  nmiAddress: number;
  bankSize: number;
  maxStreamBanks: number;
}

export async function fetchNesPlayer(name: 'player' | 'player24' = 'player'): Promise<NesPlayer> {
  const base = import.meta.env.BASE_URL;
  const [bin, meta] = await Promise.all([
    fetch(`${base}nes/${name}.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}nes/${name}.json`).then((r) => r.json()),
  ]);
  return { ...meta, bytes: new Uint8Array(bin) };
}

export interface NesCartridgeResult { rom: Uint8Array; banks: number; streamBytes: number; seconds: number[] }

/** Text as a ROM field holds it: printable ASCII, anything else a space, padded to the field. */
export function nesTitle(title: string, length: number): Uint8Array {
  return Uint8Array.from(title.replace(/[^\x20-\x7E]/g, ' ').slice(0, length).padEnd(length, ' '), (c) => c.charCodeAt(0));
}

/** Player screen text: the font holds ASCII 0x20-0x5F only, so the screen fields are upper-cased and anything else is a space. */
export function nesScreenText(text: string, length: number): Uint8Array {
  return nesTitle(text.toUpperCase().replace(/[^\x20-\x5F]/g, ' '), length);
}

export interface NesScreenInfo { author?: string; chipName?: string; /** Scroller text; PROVISIONAL (owner to confirm): empty falls back to "TITLE - AUTHOR". */ comments?: string }

/** Patches the player's screen text, start subsong, subsong count and region banks. The player bytes from file offset `from` sit in `rom` at `at`. */
function patchPlayerScreen(rom: Uint8Array, at: number, from: number, player: NesPlayer, title: string, startSubsong: number, info: NesScreenInfo, subsongCount: number, regbank: readonly number[]): void {
  rom.set(nesScreenText(title, player.titleLength), at + player.titleOffset - from);
  rom[at + player.startSubsongOffset - from] = startSubsong;
  const author = info.author ?? '';
  const scroll = info.comments?.trim() || [title, author].filter(Boolean).join(' - ');
  rom.set(nesScreenText(author, player.authorLength), at + player.authorOffset - from);
  rom.set(nesScreenText(info.chipName ?? 'NES', player.chipNameLength), at + player.chipNameOffset - from);
  rom.set(nesScreenText(scroll.slice(0, player.scrollLength - 32), player.scrollLength), at + player.scrollOffset - from);
  rom[at + player.subsongCountOffset - from] = subsongCount;
  regbank.forEach((b, i) => { rom[at + player.regbankOffset - from + i] = b; });
}

export function buildNesCartridge(subsongs: readonly NesSubsongInput[], player: NesPlayer, title = 'devilbox', region: NesRegion = 'ntsc', startSubsong = 0, info: NesScreenInfo = {}): NesCartridgeResult {
  if (!subsongs.length) throw new Error('No NES capture to export. Play an NES-family song through while recording.');
  if (!NES_REGIONS.includes(region)) throw new Error(`Unknown region ${region}`);
  if (startSubsong < 0 || startSubsong >= subsongs.length) throw new Error(`Start subsong ${startSubsong} does not exist.`);
  const bank = player.bankSize;
  const regionStreams = encodeNesStreams(subsongs, bank);
  const regbank = NES_REGIONS.map(() => 0);
  let streamBanks = 0;
  for (const [i, r] of NES_REGIONS.entries()) { regbank[i] = streamBanks; streamBanks += Math.ceil(regionStreams[r].length / bank); }
  const stream = new Uint8Array(streamBanks * bank);
  for (const [i, r] of NES_REGIONS.entries()) stream.set(regionStreams[r], regbank[i] * bank);
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
  patchPlayerScreen(rom, last, playerBankAt, player, title, startSubsong, info, subsongs.length, regbank);
  return { rom, banks, streamBytes: stream.length, seconds: subsongs.map((s) => { const c = s[region] ?? s.ntsc; return c.events.length ? Math.max(...c.events.map((e) => e.sample)) / c.sampleRate : 0; }) };
}

/**
 * VRC6 original cartridge (iNES mapper 24, player build player24.bin). Stream banks are 8 KB: the player shows the current stream bank at $C000
 * (8 KB select, $C000) and the subsong's first bank (dictionary, region table) through the 16 KB select at $8000; the last 8 KB ($E000, player code)
 * is fixed. Region streams start on an even bank so the table sits at the start of a 16 KB bank. No DPCM bank switching ($C000-$DFFF is the stream
 * window) and no cycle-IRQ tick (the board IRQ is custom): the builder refuses such songs. Only 2A03 and VRC6 writes are allowed.
 */
export function buildVrc6Cartridge(subsongs: readonly NesSubsongInput[], player: NesPlayer, title = 'devilbox', info: NesScreenInfo = {}): NesCartridgeResult {
  if (!subsongs.length) throw new Error('No NES capture to export. Play an NES-family song through while recording.');
  for (const s of subsongs) for (const r of NES_REGIONS) {
    const c = s[r] ?? s.ntsc;
    if (r !== 'ntsc' && !s[r]) continue; // a region without its own capture plays the NTSC stream at the console's frame rate
    const other = c.events.find((e) => e.kind === 'write' && e.chip !== 'nes' && e.chip !== 'vrc6');
    if (other && other.kind === 'write') throw new Error(`A VRC6 cartridge carries 2A03 and VRC6 only; the song also writes ${other.chip}. Use the custom cartridge or NSFe.`);
    if (c.events.some((e) => e.kind === 'control' && e.control === 4)) throw new Error('A VRC6 cartridge cannot switch DPCM banks; the song does.');
    if (Math.abs(c.tickRateHz - NES_REGION_TIMING[r].frameHz) / NES_REGION_TIMING[r].frameHz > 0.005) throw new Error(`The song ticks at ${c.tickRateHz.toFixed(2)} Hz, not the ${r.toUpperCase()} frame rate; a VRC6 cartridge ticks on the frame (the cycle timer exists on the custom board only).`);
  }
  const bank = 8192;
  const regionStreams = encodeNesStreams(subsongs, bank);
  const regbank = NES_REGIONS.map(() => 0);
  let streamBanks = 0;
  for (const [i, r] of NES_REGIONS.entries()) { regbank[i] = streamBanks; streamBanks += Math.ceil(regionStreams[r].length / bank); streamBanks += streamBanks & 1; }
  if (streamBanks > 255) throw new Error(`The song needs ${streamBanks} banks of 8 KB; the VRC6 player addresses 255 (2 MB).`);
  const total = Math.ceil((streamBanks + 1) / 2) * 2; // PRG in 16 KB units: stream banks, padding, the fixed player bank last
  const rom = new Uint8Array(16 + total * bank);
  rom.set(player.bytes.subarray(0, 16));
  rom[4] = total / 2;
  for (const [i, r] of NES_REGIONS.entries()) rom.set(regionStreams[r], 16 + regbank[i] * bank);
  const fixed = player.size - bank;
  rom.set(player.bytes.subarray(fixed), rom.length - bank);
  patchPlayerScreen(rom, rom.length - bank, fixed, player, title, 0, info, subsongs.length, regbank);
  return { rom, banks: total, streamBytes: streamBanks * bank, seconds: subsongs.map((s) => { const c = s.ntsc; return c.events.length ? Math.max(...c.events.map((e) => e.sample)) / c.sampleRate : 0; }) };
}
