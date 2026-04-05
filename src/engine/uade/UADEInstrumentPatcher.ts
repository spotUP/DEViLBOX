/**
 * UADEInstrumentPatcher — Write instrument field values directly to chip RAM
 * during live UADE playback. The 68k replayer reads the modified data on the
 * next note trigger, making edits audible immediately without stopping playback.
 *
 * Mirrors UADEChipEditor.patchPatternCell() but for instrument headers.
 */

import type { UADEChipEditor } from './UADEChipEditor';
import type { UADEInstrumentLayout, InstrumentFieldDescriptor } from './UADEInstrumentLayout';

export class UADEInstrumentPatcher {
  private editor: UADEChipEditor;

  constructor(editor: UADEChipEditor) {
    this.editor = editor;
  }

  /**
   * Write a single instrument field to chip RAM.
   * @param layout      The format's instrument layout descriptor
   * @param instrIndex  0-based instrument index
   * @param fieldName   Field name (must match a key in layout.fields)
   * @param value       Raw value to write (in the field's native unit)
   */
  async patchField(
    layout: UADEInstrumentLayout,
    instrIndex: number,
    fieldName: string,
    value: number,
  ): Promise<void> {
    const field = layout.fields[fieldName];
    if (!field) return;
    if (instrIndex < 0 || instrIndex >= layout.maxInstruments) return;

    const moduleBase = await this.editor.getModuleBase();
    if (moduleBase === 0) return;

    const addr = moduleBase
      + layout.instrTableOffset
      + instrIndex * layout.instrHeaderSize
      + field.offset;

    const encoded = encodeFieldValue(field, value);
    const bytes = encodeToBytes(field, encoded);
    await this.editor.writeBytes(addr, bytes);
  }

  /**
   * Write a complex section (envelope, wavetable, macro) to chip RAM.
   * Uses the format's registered SectionEncoder.
   */
  async patchSection(
    layout: UADEInstrumentLayout,
    instrIndex: number,
    sectionName: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    const encoder = layout.sectionEncoders?.[sectionName];
    if (!encoder) return;
    if (instrIndex < 0 || instrIndex >= layout.maxInstruments) return;

    const moduleBase = await this.editor.getModuleBase();
    if (moduleBase === 0) return;

    const offset = encoder.getOffset(instrIndex, layout);
    const data = encoder.encode(config, instrIndex);
    const maxSize = encoder.getSize(instrIndex);

    // Never write more than the original section size (prevent buffer overflow)
    const safeData = data.length <= maxSize ? data : data.subarray(0, maxSize);
    // Zero-pad if smaller than original
    const padded = new Uint8Array(maxSize);
    padded.set(safeData);

    await this.editor.writeBytes(moduleBase + offset, padded);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Apply clamping, unit scaling, and masking to a raw value */
function encodeFieldValue(field: InstrumentFieldDescriptor, value: number): number {
  let v = value;
  if (field.max != null) v = Math.min(v, field.max);
  if (field.unit === 'words') v = Math.floor(v / 2);
  if (field.mask != null) v = v & field.mask;
  return v;
}

/** Encode a numeric value into a big-endian byte array */
function encodeToBytes(field: InstrumentFieldDescriptor, value: number): Uint8Array {
  switch (field.size) {
    case 1:
      return new Uint8Array([value & 0xFF]);
    case 2:
      return new Uint8Array([(value >> 8) & 0xFF, value & 0xFF]);
    case 4:
      return new Uint8Array([
        (value >> 24) & 0xFF, (value >> 16) & 0xFF,
        (value >> 8) & 0xFF, value & 0xFF,
      ]);
  }
}
