/**
 * Cinter4ModExporter.ts — export a DEViLBOX song as a Cinter ProTracker module
 *
 * A Cinter song ships as an ordinary ProTracker .mod: the Cinter instruments
 * carry their 12 params in the 22-char sample name, and the Amiga Cinter replayer
 * regenerates their PCM at runtime from those names. Non-Cinter ("raw") samples
 * are kept as-is — the replayer can't regenerate what it didn't synthesize.
 *
 * This builds the MOD sample table itself (Cinter voices rendered from their
 * params, or stripped to silence for the replayer to regenerate; raw samples
 * decoded from their buffers) and hands the patterns to the shared MODExporter,
 * reusing its note→period and effect conversion.
 */

import type { InstrumentConfig } from '@/types';
import type { Pattern, ParsedSample } from '@/types/tracker';
import { exportAsMOD, type MODExportOptions, type MODExportResult } from './MODExporter';
import {
  cinter4ParamsToSampleName,
  type Cinter4Version,
} from '@/lib/import/formats/cinter4Params';
import { renderCinter4Sample } from '@/engine/cinter4/cinter4SynthCore';
import { readCinter4InstrumentParams } from '@/engine/cinter4/cinter4Instrument';

export interface Cinter4ModExportOptions extends MODExportOptions {
  /**
   * Strip Cinter sample PCM to silence (length kept so the replayer can size the
   * buffer it regenerates). The Amiga regenerates the voices from the names; the
   * intro cruncher compresses the zeroed data away. Default false → full PCM, so
   * the .mod also plays in any ordinary ProTracker/player.
   */
  stripCinterSamples?: boolean;
}

/** Decode a 16- or 8-bit mono WAV ArrayBuffer to signed 8-bit PCM. */
function wavToInt8(buf?: ArrayBuffer): Int8Array {
  if (!buf || buf.byteLength < 44) return new Int8Array(0);
  const v = new DataView(buf);
  let off = 12, bits = 16, dataOff = -1, dataLen = 0;
  while (off + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    const sz = v.getUint32(off + 4, true);
    if (id === 'fmt ' && off + 8 + 16 <= v.byteLength) bits = v.getUint16(off + 8 + 14, true) || 16;
    if (id === 'data') { dataOff = off + 8; dataLen = sz; break; }
    off += 8 + sz + (sz & 1);
  }
  if (dataOff < 0) return new Int8Array(0);
  if (bits === 8) {
    const out = new Int8Array(dataLen);
    for (let i = 0; i < dataLen; i++) out[i] = (v.getUint8(dataOff + i) << 24) >> 24;
    return out;
  }
  const n = Math.floor(dataLen / 2);
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(-128, Math.min(127, v.getInt16(dataOff + i * 2, true) >> 8));
  return out;
}

/** Build the 22-char Cinter sample name, preserving the version label (char 0). */
function cinterSampleName(params: number[], version: Cinter4Version, origName?: string): string {
  const body = cinter4ParamsToSampleName(params).slice(1); // 20 param chars
  let first = '1'; // v4 marker
  if (version === 3) {
    const c = origName?.[0];
    first = c && !/[0-9]/.test(c) ? c : 's'; // keep original v3 label, else 's'
  }
  return (first + body).slice(0, 22);
}

function makeParsedSample(id: number, name: string, pcm: Int8Array, loopStartFrames: number, loopLenFrames: number, volume: number): ParsedSample {
  return {
    id,
    name,
    pcmData: pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer,
    loopStart: loopStartFrames,
    loopLength: loopLenFrames,
    loopType: loopLenFrames > 0 ? 'forward' : 'none',
    volume,
    finetune: 0,
    relativeNote: 0,
    panning: 128,
    bitDepth: 8,
    sampleRate: 8363,
    length: pcm.length,
  };
}

/**
 * Export the song as a Cinter-compatible ProTracker .mod.
 *
 * @param patterns      the song patterns
 * @param instruments   the song instruments (Cinter voices + raw samples)
 */
export async function exportCinterMod(
  patterns: Pattern[],
  instruments: InstrumentConfig[],
  options: Cinter4ModExportOptions = {},
): Promise<MODExportResult> {
  const strip = options.stripCinterSamples ?? false;

  // Preserve any original samples the import kept (raw samples re-export losslessly).
  const meta = patterns[0]?.importMetadata;
  const originalSamples: { [id: number]: ParsedSample } = { ...(meta?.originalSamples ?? {}) };

  let cinterCount = 0;
  const prepared = instruments.map((inst): InstrumentConfig => {
    const cp = readCinter4InstrumentParams(inst);

    if (cp) {
      // Cinter voice → param-encoded name + rendered (or stripped) PCM.
      cinterCount++;
      const lengthSamples = Math.max(2, cp.lengthWords * 2);
      const repeatStart = cp.replenWords > 0 ? (cp.lengthWords - cp.replenWords) * 2 : null;
      const pcm = strip
        ? new Int8Array(lengthSamples)
        : renderCinter4Sample(cp.params, lengthSamples, repeatStart, cp.version);
      const origName = (inst.parameters as Record<string, unknown> | undefined)?.sampleName as string | undefined;
      const name = cinterSampleName(cp.params, cp.version, origName);
      const volume = Math.round(Math.max(0, Math.min(64, 64 * Math.pow(10, (inst.volume ?? 0) / 20))));
      originalSamples[inst.id] = makeParsedSample(inst.id, name, pcm, repeatStart ?? 0, cp.replenWords * 2, volume);
      return { ...inst, name, type: 'sample', synthType: 'Sampler' };
    }

    // Non-Cinter sample → keep. Ensure an originalSamples entry exists (decode the
    // buffer if the import didn't preserve one) so it bakes instead of going silent.
    if (inst.type === 'sample' && inst.sample) {
      if (!originalSamples[inst.id]) {
        const pcm = wavToInt8(inst.sample.audioBuffer);
        if (pcm.length > 0) {
          const loopLen = inst.sample.loop ? Math.max(0, inst.sample.loopEnd - inst.sample.loopStart) : 0;
          const volume = Math.round(Math.max(0, Math.min(64, 64 * Math.pow(10, (inst.volume ?? 0) / 20))));
          originalSamples[inst.id] = makeParsedSample(inst.id, inst.name, pcm, inst.sample.loopStart, loopLen, volume);
        }
      }
      return { ...inst, synthType: 'Sampler' };
    }
    return inst;
  });

  // Attach the merged sample table so MODExporter's lossless path picks it up.
  const exportPatterns: Pattern[] = patterns.map((p, i) =>
    i === 0
      ? ({ ...p, importMetadata: { ...(p.importMetadata ?? {}), sourceFormat: 'MOD', originalSamples } } as Pattern)
      : p,
  );

  const result = await exportAsMOD(exportPatterns, prepared, options);
  result.warnings = [
    `Cinter export: ${cinterCount} synth instrument(s) written with param-encoded names${strip ? ', PCM stripped (replayer regenerates)' : ''}.`,
    ...result.warnings.filter((w) => !/silent placeholder/.test(w)),
  ];
  return result;
}
