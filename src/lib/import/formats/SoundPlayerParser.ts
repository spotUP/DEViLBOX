/**
 * SoundPlayerParser.ts - Sound Player (Scott Johnston, SJS.* + SMP.*): the
 * grid is the player's own walk of the song data.
 *
 * The module is a 3-byte header (CIA timer, voice mask) and an array of
 * 12-byte rows, 3 bytes [note, instrument, command] per voice; each voice
 * walks the rows on its own (waits, loops, song end), so the grid is a
 * row-tick timeline (one grid row = one player row tick = 6 player ticks)
 * with every row a voice reads on the tick it reads it. Codec, command set
 * and walk: soundPlayerCodec.ts; format write-up:
 * thoughts/shared/research/2026-10-06_soundplayer-format.md.
 *
 * Grid cells map back to the module bytes they came from
 * (uadePatternLayout.getCellFileOffset; -1 on the rows a voice spends
 * waiting), so an edit re-encodes its 3 bytes into the module the
 * eagleplayer runner plays (writeCellToChipRam).
 *
 * Samples are the IFF 8SVX FORMs of the SMP.<tune> companion, numbered as
 * InstallSamples numbers them (one slot per 4-byte step, a FORM skipping its
 * length): the cell's instrument byte is that slot.
 *
 * Detection (SoundPlayer_v1.asm Check2): byte1 in $0B..$A0, byte2 7 or 15,
 * the first row a command-only row (the same command for every voice).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { createSamplerInstrument } from './AmigaUtils';
import {
  SP_CIA_CLOCK, SP_TICKS_PER_ROW, decodeSoundPlayerModule, walkSoundPlayerVoice, spActiveVoices,
  spCellOffset, decodeSPCell, encodeSPCell, type SoundPlayerModule,
} from './soundPlayerCodec';

const MIN_FILE_SIZE = 15;
const ROWS_PER_PATTERN = 64;
/** Ceiling on the timeline when no voice reaches its song end (a parked voice). */
const MAX_ROW_TICKS = ROWS_PER_PATTERN * 512;
/** MI_MaxSamples: InstallSamples stops at slot 38. */
const MAX_SAMPLE_SLOTS = 38;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/** Read a 4-character ASCII tag at offset. */
function tag4(buf: Uint8Array, off: number): string {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

/**
 * Within an IFF FORM chunk, find the BODY sub-chunk and return its PCM data.
 * Also extracts sample name from NAME chunk and loop info from VHDR.
 */
function extractIffSample(buf: Uint8Array, formOff: number, formSize: number): {
  pcm: Uint8Array; name: string; loopStart: number; loopEnd: number;
} | null {
  const dataStart = formOff + 12; // skip FORM + size + type tag
  const dataEnd = formOff + 8 + formSize;

  let pcm: Uint8Array | null = null;
  let name = '';
  let oneShotHiSamples = 0;
  let repeatHiSamples = 0;

  let pos = dataStart;
  while (pos + 8 <= dataEnd) {
    const chunkTag = tag4(buf, pos);
    const chunkSize = u32BE(buf, pos + 4);
    const chunkData = pos + 8;

    if (chunkTag === 'BODY') {
      const bodyLen = Math.min(chunkSize, dataEnd - chunkData);
      if (bodyLen > 0) pcm = buf.slice(chunkData, chunkData + bodyLen);
    } else if (chunkTag === 'NAME') {
      const nameLen = Math.min(chunkSize, 64, dataEnd - chunkData);
      if (nameLen > 0) {
        name = String.fromCharCode(...Array.from(buf.slice(chunkData, chunkData + nameLen)))
          .replace(/\0/g, '').trim();
      }
    } else if (chunkTag === 'VHDR') {
      if (chunkSize >= 8 && chunkData + 8 <= dataEnd) {
        oneShotHiSamples = u32BE(buf, chunkData);
        repeatHiSamples = u32BE(buf, chunkData + 4);
      }
    }

    let nextPos = chunkData + chunkSize;
    if (nextPos & 1) nextPos++;
    if (nextPos <= pos) break;
    pos = nextPos;
  }

  if (!pcm || pcm.length === 0) return null;

  let loopStart = 0;
  let loopEnd = 0;
  if (repeatHiSamples > 2) {
    loopStart = oneShotHiSamples;
    loopEnd = oneShotHiSamples + repeatHiSamples;
  }

  return { pcm, name, loopStart, loopEnd };
}

export function isSoundPlayerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // byte[1]: must be in range 11–160 (exclusive of 0x0A, inclusive of 0x0B..0xA0)
  if (buf[1] <= 0x0A || buf[1] > 0xA0) return false;

  // byte[2]: voice count must be 7 or 15
  if (buf[2] !== 7 && buf[2] !== 15) return false;

  // bytes[3] and [4] must be zero
  if (buf[3] !== 0) return false;
  if (buf[4] !== 0) return false;

  // byte[5] must be non-zero — this is the key repetition/pattern value b5
  const b5 = buf[5];
  if (b5 === 0) return false;

  // word at offset 6 must be zero
  if (u16BE(buf, 6) !== 0) return false;

  // byte[8] must equal b5
  if (buf[8] !== b5) return false;

  // bytes[9] and [10] must be zero
  if (buf[9] !== 0) return false;
  if (buf[10] !== 0) return false;

  // byte[11] must equal b5
  if (buf[11] !== b5) return false;

  // word at offset 12 must be zero
  if (u16BE(buf, 12) !== 0) return false;

  // when voice count is 15, byte[14] must also equal b5
  if (buf[2] === 15 && buf[14] !== b5) return false;

  return true;
}

/**
 * The samples of an SMP.<tune> file, walked as InstallSamples walks them:
 * slot 1 at offset 0; a FORM fills its slot and the walk jumps past it
 * (FORM + 8 + length); anything else is an empty slot of 4 bytes.
 */
export function soundPlayerSampleSlots(smp: Uint8Array): Array<{ slot: number; formOff: number; formSize: number }> {
  const out: Array<{ slot: number; formOff: number; formSize: number }> = [];
  let a = 0;
  for (let slot = 1; slot <= MAX_SAMPLE_SLOTS && a + 4 <= smp.length; slot++) {
    if (tag4(smp, a) === 'FORM' && a + 8 <= smp.length) {
      const formSize = u32BE(smp, a + 4);
      out.push({ slot, formOff: a, formSize });
      a += 4 + formSize;
    }
    a += 4;
  }
  return out;
}

/** The SMP.<tune> companion the player's ExtLoad opens ("SJS." -> "SMP."). */
function findSampleFile(filename: string, companions?: Map<string, ArrayBuffer>): Uint8Array | null {
  if (!companions) return null;
  const base = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const want = `smp${base.slice(3)}`.toLowerCase();
  for (const [name, data] of companions) {
    const b = (name.split('/').pop() ?? name).toLowerCase();
    if (b === want) return new Uint8Array(data);
  }
  return null;
}

function soundPlayerInstruments(smp: Uint8Array | null): InstrumentConfig[] {
  const instruments: InstrumentConfig[] = [];
  if (!smp) return instruments;
  for (const { slot, formOff, formSize } of soundPlayerSampleSlots(smp)) {
    const sample = extractIffSample(smp, formOff, formSize);
    if (!sample) continue;
    instruments.push(createSamplerInstrument(
      slot, sample.name || `Sample ${slot}`, sample.pcm, 64, 8287, sample.loopStart, sample.loopEnd,
    ));
  }
  return instruments;
}

const EMPTY_CELL: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

/** The grid: each played voice's walk on one row-tick timeline. */
export function buildSoundPlayerGrid(m: SoundPlayerModule): {
  rowTicks: number; voices: number[]; rowAt: Int32Array[];
} {
  const voices = spActiveVoices(m);
  const probe = voices.map((v) => walkSoundPlayerVoice(m, v, MAX_ROW_TICKS));
  const passes = probe.map((w) => w.passTicks).filter((t) => t > 0);
  // The song is as long as its longest voice's pass; a shorter voice goes
  // round again inside it, as it does in the player.
  const rowTicks = passes.length > 0 ? Math.max(...passes) : MAX_ROW_TICKS;
  return { rowTicks, voices, rowAt: probe.map((w) => w.rowAt.subarray(0, rowTicks)) };
}

export function parseSoundPlayerFile(buffer: ArrayBuffer, filename: string, companions?: Map<string, ArrayBuffer>): TrackerSong {
  const buf = new Uint8Array(buffer);
  const _base = filename.split('/').pop()?.toLowerCase() ?? '';
  if (!_base.startsWith('sjs.') && !_base.endsWith('.spl') && !isSoundPlayerFormat(buf)) throw new Error('Not a Sound Player module');

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName = baseName.replace(/^sjs\./i, '') || baseName;

  const m = decodeSoundPlayerModule(buf);
  const { rowTicks, voices, rowAt } = buildSoundPlayerGrid(m);
  const numChannels = voices.length;
  const numPatterns = Math.max(1, Math.ceil(rowTicks / ROWS_PER_PATTERN));

  const patterns: Pattern[] = [];
  for (let p = 0; p < numPatterns; p++) {
    const length = Math.max(1, Math.min(ROWS_PER_PATTERN, rowTicks - p * ROWS_PER_PATTERN));
    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length,
      channels: voices.map((voice, ch) => ({
        id: `channel-${ch}`,
        name: `Voice ${voice + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        // Amiga panning: voices 0 and 3 left, 1 and 2 right.
        pan: voice === 0 || voice === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: Array.from({ length }, (_, r) => {
          const row = rowAt[ch][p * ROWS_PER_PATTERN + r] ?? -1;
          if (row < 0) return { ...EMPTY_CELL };
          const off = spCellOffset(row, voice);
          return decodeSPCell(buf.subarray(off, off + 3)) as TrackerCell;
        }),
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: 0,
      },
    });
  }

  let instruments = soundPlayerInstruments(findSampleFile(filename, companions));
  if (instruments.length === 0) {
    instruments = [{
      id: 1, name: 'Sample 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig];
  }

  // One player tick = timer / CIA clock seconds; tracker BPM = 2.5 x ticks per second.
  const initialBPM = m.timer > 0 ? Math.round((2.5 * SP_CIA_CLOCK) / m.timer) : 125;

  return {
    name: `${moduleName} [Sound Player]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: numPatterns,
    restartPosition: 0,
    numChannels,
    initialSpeed: SP_TICKS_PER_ROW,
    initialBPM,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'soundPlayer',
      patternDataFileOffset: 3,
      bytesPerCell: 3,
      rowsPerPattern: ROWS_PER_PATTERN,
      numChannels,
      numPatterns,
      moduleSize: buffer.byteLength,
      encodeCell: encodeSPCell,
      decodeCell: decodeSPCell,
      // The module bytes the cell came from: the row its voice reads on that
      // row tick; -1 while the voice waits (no bytes behind the cell).
      getCellFileOffset: (pattern: number, row: number, channel: number): number => {
        const tick = pattern * ROWS_PER_PATTERN + row;
        const r = rowAt[channel]?.[tick] ?? -1;
        return r < 0 || row >= ROWS_PER_PATTERN ? -1 : spCellOffset(r, voices[channel]);
      },
    } as UADEPatternLayout,
  };
}
