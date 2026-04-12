/**
 * AsapParser.ts — ASAP (Another Slight Atari Player) format detection and parser
 *
 * ASAP supports Atari 8-bit POKEY music formats:
 * SAP, CMC, CM3, CMR, CMS, DMC, DLT, MPT, MPD, RMT, TMC, TM8, TM2, FC
 *
 * The actual playback is handled by the ASAP WASM engine. This parser
 * extracts basic metadata and stores the raw binary for the engine.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { ChannelData, InstrumentConfig } from '@/types';
import { DEFAULT_FURNACE } from '@/types/instrument';

function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** Extensions supported by ASAP */
const ASAP_EXTENSIONS = [
  '.sap', '.cmc', '.cm3', '.cmr', '.cms', '.dmc', '.dlt',
  '.mpt', '.mpd', '.rmt', '.tmc', '.tm8', '.tm2', '.fc',
];

/**
 * Check if a file is an ASAP-supported format by extension.
 * For .sap files, also checks the SAP magic header.
 */
export function isAsapFormat(filename: string, buffer: ArrayBuffer): boolean {
  const ext = filename.toLowerCase().replace(/^.*(\.[^.]+)$/, '$1');
  if (!ASAP_EXTENSIONS.includes(ext)) return false;
  // For .sap files, verify header magic "SAP"
  if (ext === '.sap') {
    const b = new Uint8Array(buffer);
    return b.length >= 3 && b[0] === 0x53 && b[1] === 0x41 && b[2] === 0x50;
  }
  return true;
}

/**
 * Parse SAP header for metadata (title, author, songs count).
 * Only applicable to .sap files which have a text header.
 */
function parseSAPHeaderMeta(buf: Uint8Array): { name: string; author: string; songs: number; stereo: boolean } {
  const meta = { name: '', author: '', songs: 1, stereo: false };
  let off = 0;
  while (off < buf.length - 1) {
    if (buf[off] === 0xFF && buf[off + 1] === 0xFF) break;
    let lineEnd = off;
    while (lineEnd < buf.length && buf[lineEnd] !== 0x0A) lineEnd++;
    const line = new TextDecoder('latin1')
      .decode(buf.subarray(off, lineEnd))
      .replace(/\r/g, '')
      .trim();
    if (line.startsWith('NAME '))   meta.name   = line.slice(5).replace(/^"|"$/g, '').trim();
    if (line.startsWith('AUTHOR ')) meta.author = line.slice(7).replace(/^"|"$/g, '').trim();
    if (line.startsWith('SONGS '))  meta.songs  = parseInt(line.slice(6)) || 1;
    if (line === 'STEREO')          meta.stereo = true;
    off = lineEnd + 1;
  }
  return meta;
}

/**
 * Parse an ASAP-supported file into a TrackerSong.
 * Stores raw binary data for the ASAP WASM engine.
 */
export async function parseAsapFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  const ext = filename.toLowerCase().replace(/^.*(\.[^.]+)$/, '$1');

  // Extract metadata from SAP header if available
  let name = filename.replace(/\.[^.]+$/, '');
  let author = '';
  let songs = 1;
  let stereo = false;

  if (ext === '.sap') {
    const meta = parseSAPHeaderMeta(buf);
    if (meta.name) name = meta.name;
    if (meta.author) author = meta.author;
    songs = meta.songs;
    stereo = meta.stereo;
  }

  const numCh = stereo ? 8 : 4;
  const displayName = name + (author ? ` — ${author}` : '');

  const instruments: InstrumentConfig[] = Array.from({ length: numCh }, (_, i) => ({
    id: i + 1,
    name: `POKEY ${i + 1}`,
    type: 'synth' as const,
    synthType: 'AsapSynth' as const,
    furnace: { ...DEFAULT_FURNACE, chipType: 20, ops: 2 },
    effects: [] as [],
    volume: 0,
    pan: 0,
  }));

  const pattern = {
    id: 'p0',
    name: 'Pattern 1',
    length: 16,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`,
      name: `POKEY ${i + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 16 }, emptyCell),
    })),
  };

  return {
    name: displayName,
    format: 'ASAP' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: songs,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 1,
    initialBPM: 50,
    asapFileData: buffer.slice(0),
    asapFilename: filename,
  };
}
