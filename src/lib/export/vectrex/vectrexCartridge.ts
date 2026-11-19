/** Vectrex cartridge (.bin): the 6809 PT3 player (public/vectrex/player.bin) plus a PT3 module from furnaceToPt3. */
import { pt3NoteTable, pt3VolumeTable, VECTREX_AY_CLOCK } from './pt3Tables';

export interface VectrexPlayer {
  bytes: Uint8Array;
  titleOffset: number;
  titleLength: number;
  dataOffset: number;
  authorOffset: number;
  authorLength: number;
  scrollOffset: number;
  scrollLength: number;
  /** Note table (96 big-endian words) and volume table (256 bytes) of the PT3 core, built by pt3Tables.ts. */
  ntOffset: number;
  vtOffset: number;
  maxCartridge: number;
}

export async function fetchVectrexPlayer(): Promise<VectrexPlayer> {
  const base = import.meta.env.BASE_URL;
  const [bin, meta] = await Promise.all([
    fetch(`${base}vectrex/player.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}vectrex/player.json`).then((r) => r.json()),
  ]);
  return { ...meta, bytes: new Uint8Array(bin) };
}

/** Title as the BIOS prints it: upper case ASCII, anything else a space, padded to the field. */
export function vectrexTitle(title: string, length: number): Uint8Array {
  const t = title.toUpperCase().replace(/[^\x20-\x5F]/g, ' ').slice(0, length).padEnd(length, ' ');
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
}

/** PT3 cartridge: the 6809 port of Bulba's PT3 player (public/vectrex/pt3core.asm) plus the module from furnaceToPt3
 * (run at VECTREX_AY_CLOCK). The note table is Bulba's for the module's header, scaled to clock. */
export function buildVectrexPt3Cartridge(module: Uint8Array, player: VectrexPlayer, title = 'devilbox', author = 'devilbox', scrollText = '', clock = VECTREX_AY_CLOCK): { bin: Uint8Array; moduleBytes: number } {
  const size = player.dataOffset + module.length;
  if (size > player.maxCartridge) {
    throw new Error(`The song does not fit: a Vectrex cartridge holds ${player.maxCartridge} bytes, this one needs ${size}.`);
  }
  let padded = 4096;
  while (padded < size) padded *= 2;
  const bin = new Uint8Array(padded);
  bin.set(player.bytes.subarray(0, player.dataOffset));
  bin.set(vectrexTitle(title, player.titleLength), player.titleOffset);
  bin.set(vectrexTitle(author, player.authorLength), player.authorOffset);
  const pad = ' '.repeat(16);
  if (scrollText) bin.set(vectrexTitle(pad + scrollText + pad, player.scrollLength), player.scrollOffset);
  pt3NoteTable(module, clock).forEach((p, i) => { bin[player.ntOffset + 2 * i] = p >> 8; bin[player.ntOffset + 2 * i + 1] = p & 0xFF; });
  bin.set(pt3VolumeTable(module), player.vtOffset);
  bin.set(module, player.dataOffset);
  return { bin, moduleBytes: module.length };
}
