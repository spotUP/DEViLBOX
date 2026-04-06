/**
 * OpenMPTExporter — Export TrackerSong to IT/S3M (and optionally XM/MOD) via OpenMPT WASM
 *
 * Uses the reference OpenMPT CSoundFile implementation for byte-perfect output.
 * This replaces the need for TypeScript-based binary serializers.
 */

import type { Pattern } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';
import * as osl from '@lib/import/wasm/OpenMPTSoundlib';
import type { SaveFormat, PatternCell } from '@lib/import/wasm/OpenMPTSoundlib';

export interface OpenMPTExportOptions {
  format: SaveFormat;
  moduleName: string;
  channelLimit?: number;
  initialBPM?: number;
  initialSpeed?: number;
}

export interface OpenMPTExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

/** Map DEViLBOX/XM effTyp → OpenMPT CMD_* value */
function mapEffectToOpenMPT(effTyp: number, eff: number): { cmd: number; param: number } {
  switch (effTyp) {
    case 0:  return eff === 0 ? { cmd: 0, param: 0 } : { cmd: 1, param: eff }; // Arpeggio or empty
    case 1:  return { cmd: 2, param: eff };  // PortaUp → CMD_PORTAMENTOUP
    case 2:  return { cmd: 3, param: eff };  // PortaDown → CMD_PORTAMENTODOWN
    case 3:  return { cmd: 4, param: eff };  // TonePorta → CMD_TONEPORTAMENTO
    case 4:  return { cmd: 5, param: eff };  // Vibrato → CMD_VIBRATO
    case 5:  return { cmd: 6, param: eff };  // TonePortaVol → CMD_TONEPORTAVOL
    case 6:  return { cmd: 7, param: eff };  // VibratoVol → CMD_VIBRATOVOL
    case 7:  return { cmd: 8, param: eff };  // Tremolo → CMD_TREMOLO
    case 8:  return { cmd: 9, param: eff };  // Panning → CMD_PANNING8
    case 9:  return { cmd: 10, param: eff }; // Offset → CMD_OFFSET
    case 10: return { cmd: 11, param: eff }; // VolSlide → CMD_VOLUMESLIDE
    case 11: return { cmd: 12, param: eff }; // PosJump → CMD_POSITIONJUMP
    case 12: return { cmd: 13, param: eff }; // Volume → CMD_VOLUME
    case 13: return { cmd: 14, param: eff }; // PatBreak → CMD_PATTERNBREAK
    case 14: return { cmd: 19, param: eff }; // Extended → CMD_MODCMDEX
    case 15: return eff < 0x20               // Speed or Tempo
      ? { cmd: 16, param: eff }              // CMD_SPEED
      : { cmd: 17, param: eff };             // CMD_TEMPO
    case 16: return { cmd: 23, param: eff }; // GlobalVol → CMD_GLOBALVOLUME
    case 17: return { cmd: 24, param: eff }; // GlobalVolSlide → CMD_GLOBALVOLSLIDE
    case 20: return { cmd: 25, param: eff }; // KeyOff → CMD_KEYOFF
    case 21: return { cmd: 30, param: eff }; // SetEnvPos → CMD_SETENVPOSITION
    case 25: return { cmd: 29, param: eff }; // PanSlide → CMD_PANNINGSLIDE
    case 27: return { cmd: 15, param: eff }; // MultiRetrig → CMD_RETRIG
    case 29: return { cmd: 18, param: eff }; // Tremor → CMD_TREMOR
    case 33: return { cmd: 28, param: eff }; // ExtraFine → CMD_XFINEPORTAUPDOWN
    default: return { cmd: 0, param: 0 };
  }
}

/** Map DEViLBOX note → OpenMPT note value */
function mapNoteToOpenMPT(note: number): number {
  if (note === 0) return 0;       // Empty
  if (note === 97) return 255;    // Note-off → NOTE_KEYOFF
  if (note >= 1 && note <= 96) return note; // Direct mapping
  return 0;
}

/** Map DEViLBOX volume column byte → OpenMPT volcmd + vol */
function mapVolumeToOpenMPT(vol: number): { volcmd: number; volval: number } {
  if (vol === 0) return { volcmd: 0, volval: 0 };
  if (vol >= 0x10 && vol <= 0x50) return { volcmd: 1, volval: vol - 0x10 }; // Volume set
  if (vol >= 0x60 && vol <= 0x6F) return { volcmd: 3, volval: vol - 0x60 }; // Vol slide up
  if (vol >= 0x70 && vol <= 0x7F) return { volcmd: 4, volval: vol - 0x70 }; // Vol slide down
  if (vol >= 0x80 && vol <= 0x8F) return { volcmd: 5, volval: vol - 0x80 }; // Fine vol up
  if (vol >= 0x90 && vol <= 0x9F) return { volcmd: 6, volval: vol - 0x90 }; // Fine vol down
  if (vol >= 0xA0 && vol <= 0xAF) return { volcmd: 7, volval: vol - 0xA0 }; // Vib speed
  if (vol >= 0xB0 && vol <= 0xBF) return { volcmd: 8, volval: vol - 0xB0 }; // Vib depth
  if (vol >= 0xC0 && vol <= 0xCF) return { volcmd: 2, volval: (vol - 0xC0) << 2 }; // Panning
  if (vol >= 0xF0 && vol <= 0xFF) return { volcmd: 11, volval: vol - 0xF0 }; // Tone porta
  return { volcmd: 0, volval: 0 };
}

/**
 * Export patterns and instruments to IT/S3M/XM/MOD using the OpenMPT WASM module.
 */
export async function exportWithOpenMPT(
  patterns: Pattern[],
  instruments: InstrumentConfig[],
  songPositions: number[],
  options: OpenMPTExportOptions,
): Promise<OpenMPTExportResult> {
  const warnings: string[] = [];
  const format = options.format;
  const numChannels = options.channelLimit || patterns[0]?.channels.length || 4;

  // Bake automation curves into pattern effects before writing to OpenMPT
  try {
    const { useAutomationStore } = await import('@stores/useAutomationStore');
    const { bakeAutomationForExport } = await import('./AutomationBaker');
    const { FORMAT_LIMITS } = await import('@/lib/formatCompatibility');
    const curves = useAutomationStore.getState().curves;
    if (curves.length > 0) {
      const formatKey = format.toUpperCase(); // 'MOD' | 'XM' | 'IT' | 'S3M'
      const fmt = FORMAT_LIMITS[formatKey];
      if (fmt) {
        const bakeResult = bakeAutomationForExport(patterns, curves, fmt);
        patterns = bakeResult.patterns;
        if (bakeResult.bakedCount > 0) {
          warnings.push(`${bakeResult.bakedCount} automation curve(s) baked into ${formatKey} effects.`);
        }
        if (bakeResult.overflowRows > 0) {
          warnings.push(`${bakeResult.overflowRows} row(s) had no free effect slot — automation data lost on those rows.`);
        }
        for (const w of bakeResult.warnings) warnings.push(w);
      }
    }
  } catch { /* automation store not available */ }

  // Map format to CSoundFile type enum
  const formatMap: Record<SaveFormat, number> = { mod: 0, xm: 1, it: 2, s3m: 3 };
  const formatType = formatMap[format];

  // Create new module
  const created = await osl.createNewModule(
    formatType as 0 | 1 | 2 | 3,
    numChannels,
    patterns.length,
  );
  if (!created) throw new Error('Failed to create new OpenMPT module');

  try {
    // Set speed/tempo
    await osl.setInitialSpeed(options.initialSpeed ?? 6);
    await osl.setInitialTempo(options.initialBPM ?? 125);

    // Write pattern data
    for (let p = 0; p < patterns.length; p++) {
      const pat = patterns[p];
      const numRows = pat.length || 64;

      // Resize pattern if needed
      await osl.resizePattern(p, numRows);

      // Write cells
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < Math.min(numChannels, pat.channels.length); c++) {
          const cell = pat.channels[c]?.rows[r];
          if (!cell) continue;

          const note = mapNoteToOpenMPT(cell.note);
          const { volcmd, volval } = mapVolumeToOpenMPT(cell.volume);
          const fx = mapEffectToOpenMPT(cell.effTyp, cell.eff);

          if (note || cell.instrument || volcmd || fx.cmd) {
            const patCell: PatternCell = {
              note,
              instrument: cell.instrument,
              volcmd,
              vol: volval,
              command: fx.cmd,
              param: fx.param,
            };
            await osl.setPatternCell(p, r, c, patCell);
          }
        }
      }
    }

    // Write order list
    for (let i = 0; i < songPositions.length; i++) {
      await osl.setOrderPattern(i, songPositions[i]);
    }

    // Upload sample data for instruments
    for (let i = 0; i < instruments.length; i++) {
      const inst = instruments[i];
      if (!inst.sample?.audioBuffer || inst.sample.audioBuffer.byteLength === 0) continue;

      try {
        const sampleRate = inst.sample.sampleRate || 8363;
        const data = new Int16Array(inst.sample.audioBuffer);
        if (data.length > 0) {
          await osl.setSampleData(i + 1, data, sampleRate, false);
        }
      } catch {
        warnings.push(`Failed to write sample data for instrument ${i + 1} "${inst.name}"`);
      }
    }

    // Save
    const result = await osl.saveModule(format);
    if (!result) throw new Error(`OpenMPT: Failed to save as ${format.toUpperCase()}`);

    const ext = format === 'mod' ? 'mod' : format;
    const filename = `${options.moduleName.replace(/[^\w\s-]/g, '').trim() || 'export'}.${ext}`;

    return {
      data: new Blob([result], { type: 'application/octet-stream' }),
      filename,
      warnings,
    };
  } finally {
    await osl.destroyModule();
  }
}
