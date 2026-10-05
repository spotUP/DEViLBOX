/**
 * EupminiParser.ts -- EUP (FM Towns) format parser
 *
 * EUP is a music format used by the Fujitsu FM Towns computer, featuring
 * 6 FM synthesis channels, 3 SSG channels, and 2 ADPCM channels (11 total).
 *
 * Minimal stub parser that creates a TrackerSong for the WASM engine.
 * Since EUP playback is handled entirely by the WASM engine
 * (suppressNotes = true), the TrackerSong returned here is a minimal shell
 * with one empty pattern. The WASM engine handles all actual audio rendering.
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
 * Returns a minimal TrackerSong with one empty pattern.
 * The WASM engine handles all actual playback — this just provides the
 * TrackerSong shell that the UI/store layer expects.
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

  const numChannels = 11; // 6 FM + 3 SSG + 2 ADPCM
  const numRows = 64;
  const baseName = fileName.replace(/\.[^.]+$/, '');

  const emptyRows = Array.from({ length: numRows }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: numRows,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'EUP' as const,
      sourceFile: fileName,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'FM Towns', type: 'synth' as const,
    synthType: 'EupminiSynth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  return {
    name: `${baseName} [EUP]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    eupFileData: data.slice(0),
    // The banks the header names, beside the song (modland: in the song's own folder).
    eupFmBankData: bankFile(companions, eupBankName(data, FM_BANK_NAME), 'fmb')?.slice(0),
    eupPcmBankData: bankFile(companions, eupBankName(data, PCM_BANK_NAME), 'pmb')?.slice(0),
  };
}
