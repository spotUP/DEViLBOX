/**
 * cinter4Recognize.ts — detect Cinter instruments by their sample names
 *
 * A Cinter song is an ordinary ProTracker module whose Cinter instruments carry
 * their 12 params in the 22-char sample name. This lightweight detector (no audio
 * / synth deps, so it's safe to call from the instrument store) scans freshly
 * imported sample instruments and tags any whose name decodes as Cinter params as
 * a live Cinter synth voice — keeping the already-loaded PCM for exact playback
 * while attaching the params so the editor can re-synthesize and the exporter can
 * write the param-encoded name. Non-Cinter samples (free text) are left untouched.
 *
 * Detecting by name (not by file format) is the robust gate: it works no matter
 * which import path produced the instruments, and the name structure is specific
 * enough that ordinary sample names don't false-match.
 */

import type { InstrumentConfig } from '../../types/instrument/defaults';
import { cinter4ParseSampleName } from '../../lib/import/formats/cinter4Params';

/**
 * Count Cinter instruments in a raw ProTracker .mod by reading the 31 sample
 * names straight from the header (no full parse). A standard MOD header is:
 *   20 bytes title, then 31 × 30-byte sample headers (22-byte name first).
 * Returns 0 for non-MOD / non-Cinter files. Used by the import dialog to label a
 * MOD as a Cinter module before importing.
 */
export function countCinterModInstruments(bytes: Uint8Array): number {
  if (bytes.length < 20 + 31 * 30 + 4) return 0;
  const ascii = (off: number, len: number): string => {
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = bytes[off + i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  let count = 0;
  for (let i = 0; i < 31; i++) {
    const name = ascii(20 + i * 30, 22);
    if (cinter4ParseSampleName(name)) count++;
  }
  return count;
}

/** Frame count of a 16-bit mono WAV ArrayBuffer (scans for the data chunk). */
function wavFrameCount(buf?: ArrayBuffer): number {
  if (!buf || buf.byteLength < 44) return 0;
  const v = new DataView(buf);
  let bits = 16;
  let off = 12;
  while (off + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    const sz = v.getUint32(off + 4, true);
    if (id === 'fmt ' && off + 8 + 16 <= v.byteLength) bits = v.getUint16(off + 8 + 14, true) || 16;
    if (id === 'data') return Math.floor(sz / Math.max(1, bits / 8));
    off += 8 + sz + (sz & 1);
  }
  return 0;
}

/**
 * Tag Cinter instruments in an imported instrument set. Mutates in place.
 * Instruments already recognized (parameters.cinter === 1) are skipped so an
 * edited voice's params aren't overwritten from a stale name on re-load.
 *
 * @returns the number of instruments newly recognized as Cinter.
 */
export function recognizeCinter4Instruments(instruments: InstrumentConfig[]): number {
  let count = 0;
  for (const inst of instruments) {
    if (!inst || inst.type !== 'sample' || !inst.name || !inst.sample) continue;
    const pr = inst.parameters as Record<string, unknown> | undefined;
    if (pr?.cinter === 1) continue; // already a Cinter voice — don't re-derive
    const parsed = cinter4ParseSampleName(inst.name);
    if (!parsed) continue;

    const frames = wavFrameCount(inst.sample.audioBuffer);
    const lengthWords = Math.max(1, Math.floor(frames / 2));
    const replenWords =
      inst.sample.loop && inst.sample.loopEnd > inst.sample.loopStart
        ? Math.max(0, Math.floor((inst.sample.loopEnd - inst.sample.loopStart) / 2))
        : 0;

    inst.synthType = 'Cinter4Synth';
    inst.parameters = {
      ...pr,
      cinter: 1,
      version: parsed.version,
      lengthWords,
      replenWords,
      p0: parsed.params[0], p1: parsed.params[1], p2: parsed.params[2], p3: parsed.params[3],
      p4: parsed.params[4], p5: parsed.params[5], p6: parsed.params[6], p7: parsed.params[7],
      p8: parsed.params[8], p9: parsed.params[9], p10: parsed.params[10], p11: parsed.params[11],
      sampleName: inst.name,
    } as unknown as Record<string, unknown>;
    count++;
  }
  return count;
}
