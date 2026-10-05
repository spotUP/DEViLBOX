/**
 * S98Parser.ts - S98 register logs (PC-88 / PC-98 / X1 / FM Towns / MSX FM music)
 *
 * An S98 file is a timed log of the writes a game made to its sound chips;
 * there is no pattern data and nothing to edit. S98Engine (s98-wasm: one
 * ymfm chip per logged device) replays the whole file and the song opens in
 * the scope view, like the game-music-emu formats (owner, 2026-10-05). The
 * parser reads the header only - device table and tags - and returns one
 * empty pattern with a channel per device, so the mixer's mute and solo
 * reach the devices (bit N of the engine's mute mask = device N).
 *
 * The earlier parser rebuilt approximate notes from the register writes on
 * Furnace instruments and gave v0/v1 files a YM2149 where the format's
 * default device is a YM2608 at 7.9872 MHz. The header rules follow libvgm's
 * player/s98player.cpp, as s98-wasm does.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { emptyPattern } from './Sc68Parser';

/** S98 device types, as the header's device table numbers them. */
export const S98_DEVICE_NAMES: Readonly<Record<number, string>> = {
  1: 'YM2149 PSG', 2: 'YM2203 OPN', 3: 'YM2612 OPN2', 4: 'YM2608 OPNA', 5: 'YM2151 OPM',
  6: 'YM2413 OPLL', 7: 'YM3526 OPL', 8: 'YM3812 OPL2', 9: 'YMF262 OPL3',
  15: 'AY-3-8910 PSG', 16: 'SN76489 DCSG',
};

export function s98DeviceName(type: number): string {
  return S98_DEVICE_NAMES[type] ?? `Device type ${type}`;
}

export interface S98Device { type: number; clock: number }

export interface S98Header {
  version: number;
  devices: S98Device[];
  title: string;
  artist: string;
  game: string;
}

const le32 = (b: Uint8Array, off: number): number =>
  off + 4 <= b.length ? (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0 : 0;

export function isS98Format(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  return buffer.byteLength >= 0x20 && b[0] === 0x53 && b[1] === 0x39 && b[2] === 0x38;
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  try {
    return new TextDecoder('shift_jis').decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

export function readS98Header(buffer: ArrayBuffer): S98Header {
  const b = new Uint8Array(buffer);
  const version = b[3] - 0x30;
  const devices: S98Device[] = [];
  if (version === 2) {
    // v2: a device table ended by type 0
    for (let p = 0x20; p + 16 <= b.length && le32(b, p) !== 0; p += 16) devices.push({ type: le32(b, p), clock: le32(b, p + 4) });
  } else if (version === 3) {
    const count = le32(b, 0x1C);
    for (let i = 0, p = 0x20; i < count && p + 16 <= b.length; i++, p += 16) devices.push({ type: le32(b, p), clock: le32(b, p + 4) });
  }
  if (devices.length === 0) devices.push({ type: 4, clock: 7987200 }); // the format's default: YM2608
  const h: S98Header = { version, devices: devices.slice(0, 8), title: '', artist: '', game: '' };

  const tagOfs = le32(b, 0x10);
  if (tagOfs > 0 && tagOfs < b.length) {
    let end = b.indexOf(0, tagOfs);
    if (end < 0) end = b.length;
    const raw = b.subarray(tagOfs, end);
    if (version < 3) {
      h.title = decodeText(raw).trim(); // v0-v2: the tag offset points at the title
    } else if (String.fromCharCode(...raw.subarray(0, 5)) === '[S98]') {
      for (const line of decodeText(raw.subarray(5)).split(/\r?\n/)) {
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim().toLowerCase();
        const val = line.slice(eq + 1).trim();
        if (key === 'title') h.title = val;
        else if (key === 'artist') h.artist = val;
        else if (key === 'game') h.game = val;
      }
    }
  }
  return h;
}

export async function parseS98File(buffer: ArrayBuffer, filename = 'song.s98'): Promise<TrackerSong> {
  if (!isS98Format(buffer)) throw new Error(`${filename}: not an S98 file`);
  const h = readS98Header(buffer);
  const names = h.devices.map((d) => s98DeviceName(d.type));

  const instruments: InstrumentConfig[] = names.map((name, i): InstrumentConfig => ({
    id: i + 1, name, type: 'synth', synthType: 'S98Synth', effects: [], volume: 0, pan: 0,
  }));
  const pattern = emptyPattern(names.length, 64);
  pattern.channels.forEach((ch, i) => { ch.name = names[i]; });

  const base = h.title || h.game || filename.replace(/\.s98$/i, '');
  const game = h.title && h.game ? ` (${h.game})` : '';
  return {
    name: base + game + (h.artist ? ` — ${h.artist}` : ''),
    format: 'S98' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: names.length,
    initialSpeed: 6,
    initialBPM: 125,
    s98FileData: buffer.slice(0),
  };
}
