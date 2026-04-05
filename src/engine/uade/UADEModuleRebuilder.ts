/**
 * UADEModuleRebuilder — Rebuild a UADE module binary with updated sample data,
 * then stop/reload/play to hear the changes.
 *
 * Used when instrument sample data changes (new PCM, different length).
 * Parameter-only edits use UADEInstrumentPatcher instead (no interruption).
 */

import type { UADEInstrumentLayout } from './UADEInstrumentLayout';
import { UADEEngine } from './UADEEngine';

/**
 * Convert a Float32 audio buffer to 8-bit signed Amiga PCM.
 * UADE expects signed 8-bit mono samples.
 */
export function convertTo8bitAmiga(float32: Float32Array): Uint8Array {
  const out = new Int8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    out[i] = Math.round(Math.max(-128, Math.min(127, float32[i] * 127)));
  }
  return new Uint8Array(out.buffer);
}

/**
 * Rebuild a ProTracker-family module binary with updated sample data.
 *
 * ProTracker layout:
 *   [0..19]      Song name
 *   [20..949]    31 × 30-byte instrument headers (name + length + finetune + vol + loop)
 *   [950]        Song length (number of positions)
 *   [951]        Restart position
 *   [952..1079]  128-byte pattern order table
 *   [1080..1083] Format tag ("M.K.", "4CHN", etc.)
 *   [1084..]     Pattern data (numPatterns × numChannels × 64 rows × 4 bytes)
 *   [after patterns] Sample data (contiguous, order matches instrument headers)
 */
export function rebuildProtrackerModule(
  originalBinary: ArrayBuffer,
  layout: UADEInstrumentLayout,
  sampleReplacements: Map<number, { pcm: Uint8Array; loopStart: number; loopLen: number }>,
): ArrayBuffer {
  const src = new Uint8Array(originalBinary);
  const view = new DataView(originalBinary);

  // Read original sample lengths to find sample data start
  const sampleLengths: number[] = [];
  for (let i = 0; i < layout.maxInstruments; i++) {
    const headerOffset = layout.instrTableOffset + i * layout.instrHeaderSize;
    const lengthField = layout.fields['length'];
    if (!lengthField) { sampleLengths.push(0); continue; }
    const lenWords = view.getUint16(headerOffset + lengthField.offset);
    sampleLengths.push(lenWords * 2); // words → bytes
  }

  // Sample data start = fileSize - sum(sampleLengths)
  const totalSampleBytes = sampleLengths.reduce((a, b) => a + b, 0);
  const sampleDataStart = src.length - totalSampleBytes;

  // Build new sample data and track new lengths
  const newSampleLengths = [...sampleLengths];
  const newSamples: Uint8Array[] = [];
  let offset = sampleDataStart;

  for (let i = 0; i < layout.maxInstruments; i++) {
    const replacement = sampleReplacements.get(i);
    if (replacement) {
      // Amiga requires even-length samples
      const evenLen = replacement.pcm.length + (replacement.pcm.length % 2);
      const padded = new Uint8Array(evenLen);
      padded.set(replacement.pcm);
      newSamples.push(padded);
      newSampleLengths[i] = evenLen;
    } else {
      // Keep original sample data
      newSamples.push(src.slice(offset, offset + sampleLengths[i]));
      newSampleLengths[i] = sampleLengths[i];
    }
    offset += sampleLengths[i];
  }

  // Rebuild the binary
  const newTotalSampleBytes = newSampleLengths.reduce((a, b) => a + b, 0);
  const newBinary = new Uint8Array(sampleDataStart + newTotalSampleBytes);

  // Copy everything up to sample data (headers + patterns)
  newBinary.set(src.subarray(0, sampleDataStart));

  // Write new sample data and update headers
  let writeOffset = sampleDataStart;
  const headerView = new DataView(newBinary.buffer);

  for (let i = 0; i < layout.maxInstruments; i++) {
    newBinary.set(newSamples[i], writeOffset);

    // Update instrument header: length
    const headerOffset = layout.instrTableOffset + i * layout.instrHeaderSize;
    const lengthField = layout.fields['length'];
    if (lengthField) {
      headerView.setUint16(headerOffset + lengthField.offset, Math.floor(newSampleLengths[i] / 2));
    }

    // Update loop points for replaced samples
    const replacement = sampleReplacements.get(i);
    if (replacement) {
      const loopStartField = layout.fields['loopStart'];
      if (loopStartField) {
        headerView.setUint16(headerOffset + loopStartField.offset, Math.floor(replacement.loopStart / 2));
      }
      const loopLenField = layout.fields['loopLen'];
      if (loopLenField) {
        headerView.setUint16(headerOffset + loopLenField.offset, Math.floor(replacement.loopLen / 2));
      }
    }

    writeOffset += newSampleLengths[i];
  }

  return newBinary.buffer;
}

/**
 * Full cycle: rebuild → stop → reload → play.
 */
export async function replaceAndReload(
  song: { uadeEditableFileData?: ArrayBuffer; uadeEditableFileName?: string },
  layout: UADEInstrumentLayout,
  sampleReplacements: Map<number, { pcm: Uint8Array; loopStart: number; loopLen: number }>,
): Promise<void> {
  if (!UADEEngine.hasInstance()) return;
  const engine = UADEEngine.getInstance();

  const original = song.uadeEditableFileData;
  if (!original) throw new Error('No editable file data for UADE module');

  // Rebuild binary with new samples
  const rebuilt = rebuildProtrackerModule(original, layout, sampleReplacements);

  // Stop → reload → play
  engine.stop();
  await engine.loadAndPlay(rebuilt, song.uadeEditableFileName ?? 'module.mod');

  // Update song's file data reference for future rebuilds
  song.uadeEditableFileData = rebuilt;
}
