/**
 * ActionamicsParser.ts - Actionamics Sound Tool (.act / .ast) native parser.
 *
 * The module is decoded by ActionamicsModule.ts (every byte kept, exact
 * inverse) and the grid is the song the replayer walks, built by
 * actionamicsGrid.ts: one grid pattern per song position of sub-song 0, as
 * many rows as the replayer plays there (set rows / break effects change it),
 * notes the replayer's own table periods, effects verbatim.
 *
 * Identification: the signature "ACTIONAMICS SOUND TOOL" at offset 62.
 * Reference: NostalgicPlayer ActionamicsWorker.cs (the loader the WASM
 * replayer ports); the replayer itself is actionamics-wasm/src/actionamics.c.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, UADEChipRamInfo } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import { decodeActionamicsModule, isActionamicsModule, type ActionamicsModule } from './ActionamicsModule';
import { walkActionamicsSong } from './actionamicsGrid';

export function isActionamicsFormat(bytes: Uint8Array): boolean {
  return isActionamicsModule(bytes);
}

export function parseActionamicsFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isActionamicsFormat(bytes)) return null;
  try {
    const m = decodeActionamicsModule(bytes);
    return m ? buildSong(m, bytes, filename) : null;
  } catch (e) {
    console.warn('[ActionamicsParser] Parse failed:', e);
    return null;
  }
}

/** One instrument per Actionamics instrument: the sample its list starts on. */
function instrumentConfigs(m: ActionamicsModule, size: number): InstrumentConfig[] {
  const instrumentsOffset = m.moduleInfoOffset + m.lengths[1] + m.lengths[2] * 3;
  return m.instruments.map((inst, i) => {
    const id = i + 1;
    const sampleNo = m.sampleLists[inst.sampleList]?.[0] ?? -1;
    const sample = m.samples[sampleNo];
    const pcm = m.samplePcm[sampleNo];
    const chipRam = { moduleBase: 0, moduleSize: size, instrBase: instrumentsOffset + i * 32, instrSize: 32 } as UADEChipRamInfo;
    if (sample && pcm && sample.length > 0) {
      const loopStart = sample.loopLength > 1 ? sample.loopStart * 2 : 0;
      const loopEnd = sample.loopLength > 1 ? (sample.loopStart + sample.loopLength) * 2 : 0;
      // 8287 Hz: the Amiga PAL C-3 rate; the sample header's effect speed is a modulation counter, not a rate.
      const instr = createSamplerInstrument(id, sample.name || `Instrument ${id}`, new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 64, 8287, loopStart, loopEnd);
      instr.uadeChipRam = chipRam;
      return instr;
    }
    return {
      id, name: sample?.name || `Instrument ${id}`, type: 'synth' as const, synthType: 'ActionamicsWasmSynth' as const,
      effects: [], volume: 0, pan: 0, uadeChipRam: chipRam,
    } as InstrumentConfig;
  });
}

function buildSong(m: ActionamicsModule, bytes: Uint8Array, filename: string): TrackerSong {
  const info = m.songs[0];
  const walk = walkActionamicsSong(m, 0);
  const copy = (): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  const patterns: Pattern[] = walk.steps.map((step, idx) => ({
    id: `pattern-${idx}`,
    name: `Position ${step.position}`,
    length: step.rows,
    channels: step.voices.map((rows, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ([-50, 50, 50, -50] as const)[ch] ?? 0,
      instrumentId: null,
      color: null,
      rows: rows.map((r) => r.cell),
    })),
    importMetadata: {
      sourceFormat: 'AST',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: m.tracks.length,
      originalInstrumentCount: m.instruments.length,
    },
  }));

  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'AST' as TrackerFormat,
    patterns,
    instruments: instrumentConfigs(m, bytes.length),
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: Math.max(0, info.loop - info.start),
    numChannels: 4,
    initialSpeed: info.speed > 0 ? info.speed : 6,
    initialBPM: m.tempo > 0 ? m.tempo : 125,
    linearPeriods: false,
    uadeEditableFileData: copy(),
    // Native playback: the Actionamics WASM replayer (ActionamicsReplayer in
    // NativeEngineRouting, ahead of UADEEditable).
    actionamicsFileData: copy(),
  };
}
