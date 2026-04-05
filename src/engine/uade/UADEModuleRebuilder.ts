/**
 * UADEModuleRebuilder — Rebuild a UADE module binary with replaced samples
 * and reload it into the engine at the current playback position.
 *
 * Path 2 of UADE instrument replacement: when sample data changes (not just
 * parameters), the module binary must be reconstructed and reloaded because
 * Amiga DMA sample pointers reference absolute chip RAM addresses.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { UADEInstrumentLayout, SampleLayout } from './UADEInstrumentLayout';
import { UADEEngine } from './UADEEngine';
import { UADEChipEditor } from './UADEChipEditor';

/** Replacement sample data for a single instrument */
export interface SampleReplacement {
  pcm: Int8Array;        // 8-bit signed Amiga PCM data
  loopStart: number;     // Loop start offset in bytes
  loopLen: number;       // Loop length in bytes (2 = no loop)
}

/**
 * Convert floating-point audio samples to 8-bit signed Amiga PCM.
 * Input: Float32Array in [-1, 1] range.
 * Output: Int8Array in [-128, 127] range.
 */
export function convertTo8bitAmiga(float32: Float32Array): Int8Array {
  const out = new Int8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    // Clamp to [-1, 1] then scale to [-128, 127]
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    out[i] = Math.round(clamped * 127);
  }
  return out;
}

/**
 * Replace instrument samples in a module binary and reload into UADE.
 *
 * Strategy:
 * 1. Read the current module binary from chip RAM (includes any parameter edits)
 * 2. Patch sample data and header fields (length, loop start, loop length) in the binary
 * 3. Reload the modified binary into UADE
 *
 * @param song Current TrackerSong (provides uadeEditableFileData for original binary)
 * @param layout The instrument layout descriptor
 * @param replacements Map of instrIndex (0-based) → replacement sample data
 */
export async function replaceAndReload(
  song: TrackerSong,
  layout: UADEInstrumentLayout,
  replacements: Map<number, SampleReplacement>,
): Promise<void> {
  if (!UADEEngine.hasInstance()) {
    console.warn('[UADEModuleRebuilder] No UADE engine instance — cannot rebuild');
    return;
  }

  const engine = UADEEngine.getInstance();
  const editor = new UADEChipEditor(engine);

  // Read the current module from chip RAM (preserves any live edits)
  const moduleBase = await editor.getModuleBase();
  if (moduleBase === 0) {
    console.warn('[UADEModuleRebuilder] Module base is 0 — cannot rebuild');
    return;
  }

  // Get original file size from the song's raw data
  const originalData = song.uadeEditableFileData;
  if (!originalData) {
    console.warn('[UADEModuleRebuilder] No uadeEditableFileData — cannot rebuild');
    return;
  }

  // Read the live module from chip RAM
  const liveModule = await editor.readEditedModule(originalData.byteLength);
  const moduleBytes = new Uint8Array(liveModule);

  // Apply each sample replacement
  for (const [instrIndex, replacement] of replacements) {
    if (instrIndex < 0 || instrIndex >= layout.maxInstruments) continue;

    // Update header fields (length, loop start, loop length)
    const headerBase = layout.instrTableOffset + instrIndex * layout.instrHeaderSize;

    if (layout.fields['length']) {
      const f = layout.fields['length'];
      const lenVal = f.unit === 'words'
        ? Math.floor(replacement.pcm.length / 2)
        : replacement.pcm.length;
      writeFieldToBuffer(moduleBytes, headerBase + f.offset, f, lenVal);
    }

    if (layout.fields['loopStart']) {
      const f = layout.fields['loopStart'];
      const val = f.unit === 'words'
        ? Math.floor(replacement.loopStart / 2)
        : replacement.loopStart;
      writeFieldToBuffer(moduleBytes, headerBase + f.offset, f, val);
    }

    if (layout.fields['loopLength'] || layout.fields['loopLen']) {
      const f = layout.fields['loopLength'] || layout.fields['loopLen'];
      const val = f.unit === 'words'
        ? Math.floor(replacement.loopLen / 2)
        : replacement.loopLen;
      writeFieldToBuffer(moduleBytes, headerBase + f.offset, f, val);
    }

    // Write sample PCM data
    const sampleOffset = getSampleDataOffset(layout.sampleLayout, instrIndex, song);
    if (sampleOffset >= 0 && sampleOffset + replacement.pcm.length <= moduleBytes.length) {
      moduleBytes.set(new Uint8Array(replacement.pcm.buffer, replacement.pcm.byteOffset, replacement.pcm.length), sampleOffset);
    } else {
      console.warn(
        `[UADEModuleRebuilder] Sample data for instr ${instrIndex} would overflow module binary ` +
        `(offset=${sampleOffset}, size=${replacement.pcm.length}, moduleSize=${moduleBytes.length})`,
      );
    }
  }

  // Reload the modified module into UADE
  const buffer = moduleBytes.buffer.slice(
    moduleBytes.byteOffset,
    moduleBytes.byteOffset + moduleBytes.byteLength,
  );
  await engine.loadTune(buffer);
}

/**
 * Write a field value into a raw byte buffer (big-endian).
 */
function writeFieldToBuffer(
  buf: Uint8Array,
  offset: number,
  field: { size: 1 | 2 | 4; type: string },
  value: number,
): void {
  if (offset < 0 || offset + field.size > buf.length) return;
  switch (field.size) {
    case 1:
      buf[offset] = value & 0xFF;
      break;
    case 2:
      buf[offset] = (value >> 8) & 0xFF;
      buf[offset + 1] = value & 0xFF;
      break;
    case 4:
      buf[offset] = (value >>> 24) & 0xFF;
      buf[offset + 1] = (value >>> 16) & 0xFF;
      buf[offset + 2] = (value >>> 8) & 0xFF;
      buf[offset + 3] = value & 0xFF;
      break;
  }
}

/**
 * Resolve the file offset where sample PCM data begins for an instrument.
 * Returns -1 if the offset cannot be determined.
 */
function getSampleDataOffset(
  sampleLayout: SampleLayout,
  instrIndex: number,
  song: TrackerSong,
): number {
  switch (sampleLayout.type) {
    case 'contiguous':
      // Sample data starts at a fixed offset — caller must track per-instrument offsets
      // For MOD-like formats, samples are stored sequentially after headers
      return sampleLayout.startOffset;
    case 'fixed-slots':
      return sampleLayout.startOffset + instrIndex * sampleLayout.slotSize;
    case 'custom':
      return sampleLayout.getSampleOffset(instrIndex, song).offset;
    case 'pointer-table':
      // Pointer table requires reading pointers from the module — not supported in
      // offline buffer mode. The caller should use a custom layout instead.
      console.warn('[UADEModuleRebuilder] pointer-table sample layout not supported for offline rebuild');
      return -1;
  }
}
