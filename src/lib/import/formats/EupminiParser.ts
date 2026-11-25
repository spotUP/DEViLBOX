/**
 * EupminiParser.ts -- EUP (FM Towns) format parser
 *
 * EUP is a music format used by the Fujitsu FM Towns computer, featuring
 * 6 FM synthesis channels, 3 SSG channels, and 2 ADPCM channels (11 total).
 *
 * The WASM engine plays the file (suppressNotes = true). The grid is the event
 * stream as the vendored player walks it, decoded in wasm (eupmini-wasm
 * src/eup_grid.cpp): one pattern per bar, 16 rows, one channel per track voice.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/** EUP header (eupplay.cpp EUPHEAD): 2048 bytes, then 6 bytes before the events. */
const EUP_HEADER_SIZE = 2048;
const TRK_MIDI_CH = 0x394;   // 32 tracks -> MIDI channel (0xFF: unused)
const FM_MIDI_CH = 0x6D4;    // 6 FM devices -> MIDI channel
const PCM_MIDI_CH = 0x6DA;   // 8 PCM devices -> MIDI channel
const FM_BANK_NAME = 0x6E2;  // 8 chars, file <name>.fmb beside the song
const PCM_BANK_NAME = 0x6EA; // 8 chars, file <name>.pmb beside the song

/** A channel byte the player accepts: one of 32 MIDI channels, or 0xFF for none. */
const isChannel = (b: number) => b < 32 || b === 0xFF;

/**
 * Check if a buffer looks like an EUP file: long enough for the 2048-byte
 * header and the event start the player reads, and every channel assignment
 * the player maps (eupmini_harness.cpp) is a channel number, at least one
 * track mapped. Bytes 32-47 are the artist field (Traumerei.eup: "SCHUMAN"),
 * not a channel map; checking them refused real files.
 */
export function isEupFormat(data: ArrayBuffer): boolean {
  if (data.byteLength < EUP_HEADER_SIZE + 6 + 6) return false;
  const view = new Uint8Array(data);
  let mapped = 0;
  for (let i = 0; i < 32; i++) {
    const ch = view[TRK_MIDI_CH + i];
    if (!isChannel(ch)) return false;
    if (ch !== 0xFF) mapped++;
  }
  for (let i = 0; i < 6; i++) if (!isChannel(view[FM_MIDI_CH + i])) return false;
  for (let i = 0; i < 8; i++) if (!isChannel(view[PCM_MIDI_CH + i])) return false;
  return mapped > 0;
}

/** The bank name the header gives at `offset` (8 chars, NUL-padded), or ''. */
export function eupBankName(data: ArrayBuffer, offset: number): string {
  const view = new Uint8Array(data, offset, 8);
  let name = '';
  for (const b of view) { if (b === 0) break; name += String.fromCharCode(b); }
  return name.trim();
}

/** The companion whose file name is `<name>.<ext>` (any case, any directory), as the player opens it. */
function bankFile(companions: Map<string, ArrayBuffer> | undefined, name: string, ext: string): ArrayBuffer | undefined {
  if (!name || !companions) return undefined;
  const want = `${name}.${ext}`.toLowerCase();
  for (const [path, data] of companions) {
    if ((path.split('/').pop() ?? path).toLowerCase() === want) return data;
  }
  return undefined;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse an EUP file into a TrackerSong.
 *
 * One pattern per bar, decoded in wasm; the WASM engine handles playback.
 */
export async function parseEupFile(
  fileName: string,
  data: ArrayBuffer,
  companions?: Map<string, ArrayBuffer>,
): Promise<TrackerSong> {
  if (data.byteLength < EUP_HEADER_SIZE + 6 + 6) {
    throw new Error(
      `Invalid EUP file: too small (${data.byteLength} bytes, minimum ${EUP_HEADER_SIZE + 12})`
    );
  }

  const baseName = fileName.replace(/\.[^.]+$/, '');
  const { eupGrid, eupBarCells } = await import('@/engine/eupmini/eupminiEditWasm');
  const grid = await eupGrid(new Uint8Array(data));
  const numChannels = Math.max(1, grid.tracks.length);

  const patterns = grid.bars.map((bar, b) => {
    const cells = eupBarCells(bar);
    return {
      id: `pattern-${b}`,
      name: `Bar ${b + 1}`,
      length: cells.length,
      channels: Array.from({ length: numChannels }, (_, ch) => ({
        id: `channel-${ch}`,
        name: grid.slots[ch] ? `Track ${grid.tracks[ch] + 1} Voice ${grid.slots[ch] + 1}` : `Track ${(grid.tracks[ch] ?? 0) + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
        rows: cells.map((row) => row[ch]),
      })),
      importMetadata: {
        sourceFormat: 'EUP' as const,
        sourceFile: fileName,
        importedAt: new Date().toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: grid.bars.length,
        originalInstrumentCount: 0,
      },
    };
  });

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'FM Towns', type: 'synth' as const,
    synthType: 'EupminiSynth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  return {
    name: `${baseName} [EUP]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    // one row = 24 of the player's 96 steps per beat: speed 6 at the song's tempo plays a row per 16th note
    initialBPM: grid.tempo,
    linearPeriods: false,
    eupFileData: data.slice(0),
    // The banks the header names, beside the song (modland: in the song's own folder).
    eupFmBankData: bankFile(companions, eupBankName(data, FM_BANK_NAME), 'fmb')?.slice(0),
    eupPcmBankData: bankFile(companions, eupBankName(data, PCM_BANK_NAME), 'pmb')?.slice(0),
  };
}
