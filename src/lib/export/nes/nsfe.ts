/**
 * NSFe export (Phase 10). The NSF data is the custom-cart ROM without its iNES header: the 4 KB banks are the NSF banks
 * ($5FF8-$5FFF is the NSF bank register block too), BANK initialises windows 0-6 to bank 0 and window 7 to the player bank,
 * and INIT / PLAY are the player's `nsfinit` / `nsfplay` (same stream decoder, no video). Load address $8000 keeps bank 0 at $8000.
 * FDS is refused: with the FDS bit set the NSF maps RAM at $6000-$DFFF and banks through $5FF6/$5FF7, which the decoder does not use.
 */
import { buildNesCartridge, nesTitle, type NesPlayer } from './nesCartridge';
import { NES_REGION_TIMING, type NesSubsongInput } from './nesStream';
import type { NesRomInfo } from './nesExport';

/** NSF header byte $07B bit per expansion chip; the 2A03 needs none. */
const EXPANSION_BIT: Record<string, number> = { vrc6: 1, vrc7: 2, fds: 4, mmc5: 8, n163: 16, s5b: 32 };
/** NSFe mixe device ids as recalled from the nesdev NSFe page (UNVERIFIED): 0 APU squares, 1 triangle/noise/DPCM, 2 VRC6, 3 VRC7, 4 FDS, 5 MMC5, 6 N163, 7 5B. Level 0 = no change. */
const MIXE_DEVICE: Record<string, number> = { vrc6: 2, vrc7: 3, fds: 4, mmc5: 5, n163: 6, s5b: 7 };

export interface NsfeResult { nsfe: Uint8Array; warnings: string[] }

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0x7f);
const zstr = (s: string) => Uint8Array.from([...nesTitle(s, s.length), 0]);
const cat = (...parts: Uint8Array[]) => { const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const le16 = (n: number) => Uint8Array.from([n & 0xff, (n >> 8) & 0xff]);
const chunk = (id: string, data: Uint8Array) => cat(Uint8Array.from([data.length & 0xff, (data.length >> 8) & 0xff, (data.length >> 16) & 0xff, data.length >>> 24]), ascii(id), data);

export function buildNsfe(subsongs: readonly NesSubsongInput[], player: NesPlayer & { nsfInitAddress?: number; nsfPlayAddress?: number }, info: NesRomInfo): NsfeResult {
  if (!player.nsfInitAddress || !player.nsfPlayAddress) throw new Error('The NES player image has no NSF entry points; rebuild it with tools/build-nes-player.sh.');
  if (info.chips.includes('fds')) throw new Error('NSFe export does not support FDS songs: the FDS NSF memory map conflicts with the player banking.');
  const cart = buildNesCartridge(subsongs, player, info.title, 'ntsc', 0, {});
  const data = cart.rom.subarray(16);
  const warnings: string[] = [];
  // No RATE chunk: Mesen2 rejects the file with it. The play rate is the console frame rate, so only 1:1 songs are exact.
  const off = subsongs.some((s) => Math.abs(s.ntsc.tickRateHz - NES_REGION_TIMING.ntsc.frameHz) / NES_REGION_TIMING.ntsc.frameHz > 0.005);
  if (off) warnings.push('The song does not tick at the console frame rate; an NSFe plays at the frame rate, so it will run at the wrong tempo. Use the cartridge export for this song.');
  const expansion = info.chips.reduce((m, c) => m | (EXPANSION_BIT[c] ?? 0), 0);
  const mixers = [...new Set(info.chips.map((c) => MIXE_DEVICE[c]).filter((d) => d !== undefined))];
  const nsfe = cat(
    ascii('NSFE'),
    chunk('INFO', cat(le16(0x8000), le16(player.nsfInitAddress), le16(player.nsfPlayAddress), Uint8Array.from([2, expansion, subsongs.length, 0]))),
    chunk('BANK', Uint8Array.from([0, 0, 0, 0, 0, 0, 0, cart.banks - 1])),
    chunk('auth', cat(zstr(info.title), zstr(info.author ?? ''), zstr(''), zstr('DEViLBOX'))),
    chunk('tlbl', cat(...subsongs.map((_, i) => zstr(`Song ${i + 1}`)))),
    chunk('regn', Uint8Array.from([0, 1, 2])), // all three region streams are stored
    ...(mixers.length ? [chunk('mixe', cat(...mixers.map((d) => cat(Uint8Array.from([d]), le16(0)))))] : []),
    chunk('DATA', data),
    chunk('NEND', new Uint8Array(0)),
  );
  return { nsfe, warnings };
}
