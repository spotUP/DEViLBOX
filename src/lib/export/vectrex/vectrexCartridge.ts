/**
 * Vectrex cartridge (.bin): register-stream 6809 player (public/vectrex/player.bin) + the song's
 * AY-3-8910 writes, captured from the Furnace WASM engine at the Vectrex clock (song clockSel 4).
 * The 50 Hz frame/delta encoding is shared with the ZX export (zx/zxAyStream.ts).
 */
import { captureToFrames, encodeFrames, ZX_CTRL_LOOP } from '../zx/zxAyStream';
import type { RegisterWrite } from '../VGMExporter';

export interface VectrexPlayer {
  bytes: Uint8Array;
  titleOffset: number;
  titleLength: number;
  dataOffset: number;
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

export interface VectrexCartridgeResult { bin: Uint8Array; frames: number; dataBytes: number; seconds: number }

/** Title as the BIOS prints it: upper case ASCII, anything else a space, padded to the field. */
export function vectrexTitle(title: string, length: number): Uint8Array {
  const t = title.toUpperCase().replace(/[^\x20-\x5F]/g, ' ').slice(0, length).padEnd(length, ' ');
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
}

export function buildVectrexCartridge(writes: readonly RegisterWrite[], sampleRate: number, player: VectrexPlayer, title = 'devilbox'): VectrexCartridgeResult {
  const frames = captureToFrames(writes, sampleRate);
  if (frames.length === 0) throw new Error('No AY register writes were captured. Play a Vectrex (AY-3-8910) song through while recording.');
  const encoded = encodeFrames(frames);
  const dataBytes = encoded.reduce((n, f) => n + f.length, 0) + 2;
  const size = player.dataOffset + dataBytes;
  if (size > player.maxCartridge) {
    throw new Error(`The song needs ${size} bytes but a Vectrex cartridge holds ${player.maxCartridge} bytes without bank switching (the song data may take ${player.maxCartridge - player.dataOffset}); shorten the song.`);
  }
  // Real cartridges are 4 KB or larger powers of two.
  let padded = 4096;
  while (padded < size) padded *= 2;
  const bin = new Uint8Array(padded);
  bin.set(player.bytes.subarray(0, player.dataOffset));
  bin.set(vectrexTitle(title, player.titleLength), player.titleOffset);
  let o = player.dataOffset;
  for (const f of encoded) { bin.set(f, o); o += f.length; }
  bin[o++] = 0; bin[o] = ZX_CTRL_LOOP;
  return { bin, frames: frames.length, dataBytes, seconds: frames.length / 50 };
}
