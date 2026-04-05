/**
 * UADEInstrumentPatcher — Live chip RAM patching for instrument parameters.
 *
 * Uses the UADEInstrumentLayout descriptor to compute chip RAM addresses
 * for individual fields (volume, finetune, loop points, etc.) and writes
 * them in-place. Changes take effect on the next note trigger.
 *
 * For complex instrument sections (FC envelopes, SoundMon wavetables, TFMX macros),
 * delegates to the layout's sectionEncoders.
 */

import type { UADEChipEditor } from './UADEChipEditor';
import type { UADEInstrumentLayout, InstrumentFieldDescriptor } from './UADEInstrumentLayout';

export class UADEInstrumentPatcher {
  private readonly editor: UADEChipEditor;
  constructor(editor: UADEChipEditor) { this.editor = editor; }

  /**
   * Compute the chip RAM address of a field within an instrument header.
   * instrIndex is 0-based.
   */
  private getFieldAddr(layout: UADEInstrumentLayout, instrIndex: number, field: InstrumentFieldDescriptor): number {
    // This returns a file-relative offset; caller must add moduleBase
    return layout.instrTableOffset + instrIndex * layout.instrHeaderSize + field.offset;
  }

  /**
   * Patch a single named field in an instrument header.
   * The value is clamped to the field's max and masked if appropriate.
   */
  async patchField(
    layout: UADEInstrumentLayout,
    instrIndex: number,
    fieldName: string,
    value: number,
  ): Promise<void> {
    const field = layout.fields[fieldName];
    if (!field) {
      console.warn(`[UADEInstrumentPatcher] Unknown field "${fieldName}" for format "${layout.formatId}"`);
      return;
    }
    if (instrIndex < 0 || instrIndex >= layout.maxInstruments) return;

    let clamped = Math.round(value);
    if (field.max !== undefined) clamped = Math.min(clamped, field.max);

    const moduleBase = await this.editor.getModuleBase();
    const addr = moduleBase + this.getFieldAddr(layout, instrIndex, field);

    switch (field.type) {
      case 'u8':
        if (field.mask !== undefined) {
          // Read-modify-write for sub-byte fields
          const existing = await this.editor.readBytes(addr, 1);
          const masked = (existing[0] & ~field.mask) | (clamped & field.mask);
          await this.editor.writeBytes(addr, new Uint8Array([masked & 0xFF]));
        } else {
          await this.editor.writeBytes(addr, new Uint8Array([clamped & 0xFF]));
        }
        break;
      case 's8':
        await this.editor.writeBytes(addr, new Uint8Array([clamped < 0 ? clamped + 256 : clamped]));
        break;
      case 'u16be':
        await this.editor.writeBytes(addr, new Uint8Array([(clamped >> 8) & 0xFF, clamped & 0xFF]));
        break;
      case 's16be': {
        const u = clamped < 0 ? clamped + 0x10000 : clamped;
        await this.editor.writeBytes(addr, new Uint8Array([(u >> 8) & 0xFF, u & 0xFF]));
        break;
      }
      case 'u32be':
        await this.editor.writeBytes(addr, new Uint8Array([
          (clamped >>> 24) & 0xFF, (clamped >>> 16) & 0xFF,
          (clamped >>> 8) & 0xFF, clamped & 0xFF,
        ]));
        break;
    }
  }

  /**
   * Patch a complex instrument section (envelope, wavetable, macro, etc.)
   * using the layout's registered sectionEncoder.
   */
  async patchSection(
    layout: UADEInstrumentLayout,
    instrIndex: number,
    sectionName: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    if (!layout.sectionEncoders?.[sectionName]) {
      console.warn(`[UADEInstrumentPatcher] No section encoder for "${sectionName}" in format "${layout.formatId}"`);
      return;
    }
    if (instrIndex < 0 || instrIndex >= layout.maxInstruments) return;

    const encoder = layout.sectionEncoders[sectionName];
    const moduleBase = await this.editor.getModuleBase();
    const offset = encoder.getOffset(instrIndex, layout);
    const encoded = encoder.encode(config, instrIndex);
    const maxSize = encoder.getSize(instrIndex);

    if (encoded.length > maxSize) {
      console.warn(
        `[UADEInstrumentPatcher] Section "${sectionName}" overflow: ` +
        `encoded ${encoded.length} bytes > max ${maxSize}`,
      );
      return;
    }

    // Write encoded data, zero-fill remainder
    const padded = new Uint8Array(maxSize);
    padded.set(encoded);
    await this.editor.writeBytes(moduleBase + offset, padded);
  }
}
