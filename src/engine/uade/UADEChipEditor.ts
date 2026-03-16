/**
 * UADEChipEditor — read/write helpers for Amiga chip RAM via UADEEngine.
 *
 * Used by instrument parameter editors to live-edit synthesis parameters.
 * All changes take effect on the next UADE note trigger (no restart needed
 * for parameter edits; song-level structural changes require reload).
 */

import type { UADEEngine } from './UADEEngine';
import type { UADEPatternLayout } from './UADEPatternEncoder';
import { getCellFileOffset } from './UADEPatternEncoder';
import type { TrackerCell } from '@/types';

export class UADEChipEditor {
  private readonly engine: UADEEngine;
  constructor(engine: UADEEngine) { this.engine = engine; }

  /** Read `length` raw bytes from chip RAM at `addr`. */
  readBytes(addr: number, length: number): Promise<Uint8Array> {
    return this.engine.readMemory(addr, length);
  }

  /** Write raw bytes to chip RAM at `addr`. */
  writeBytes(addr: number, data: Uint8Array): Promise<void> {
    return this.engine.writeMemory(addr, data);
  }

  /** Read a big-endian unsigned 16-bit value. */
  async readU16(addr: number): Promise<number> {
    const b = await this.engine.readMemory(addr, 2);
    return (b[0] << 8) | b[1];
  }

  /** Read a big-endian unsigned 32-bit value. */
  async readU32(addr: number): Promise<number> {
    const b = await this.engine.readMemory(addr, 4);
    return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  }

  /** Write a big-endian unsigned 8-bit value. */
  writeU8(addr: number, value: number): Promise<void> {
    return this.engine.writeMemory(addr, new Uint8Array([value & 0xFF]));
  }

  /** Write a big-endian unsigned 16-bit value. */
  writeU16(addr: number, value: number): Promise<void> {
    return this.engine.writeMemory(addr, new Uint8Array([(value >> 8) & 0xFF, value & 0xFF]));
  }

  /** Write a big-endian unsigned 32-bit value. */
  writeU32(addr: number, value: number): Promise<void> {
    return this.engine.writeMemory(addr, new Uint8Array([
      (value >>> 24) & 0xFF, (value >>> 16) & 0xFF,
      (value >>> 8) & 0xFF, value & 0xFF,
    ]));
  }

  /** Write a signed 8-bit value (stored as two's-complement). */
  writeS8(addr: number, value: number): Promise<void> {
    return this.writeU8(addr, value < 0 ? value + 256 : value);
  }

  /** Write a block of bytes at addr, reading the new values from `bytes`. */
  writeBlock(addr: number, bytes: number[]): Promise<void> {
    return this.engine.writeMemory(addr, new Uint8Array(bytes));
  }

  /**
   * Read the entire module binary back from chip RAM.
   * The returned buffer is byte-identical to the original format file
   * (with any chip RAM edits applied), ready for download.
   */
  readModule(moduleBase: number, moduleSize: number): Promise<Uint8Array> {
    return this.engine.readMemory(moduleBase, moduleSize);
  }

  // ── UADE Module Base Address ──────────────────────────────────────────────

  /** Cached module base address (chip RAM address where module binary starts) */
  private _moduleBase: number | null = null;

  /**
   * Read the module base address from chip RAM.
   * UADE stores modaddr as a big-endian u32 at address 0x100 (SCORE_MODULE_ADDR).
   * Cached after first read since it doesn't change during playback.
   */
  async getModuleBase(): Promise<number> {
    if (this._moduleBase !== null) return this._moduleBase;
    this._moduleBase = await this.readU32(0x100);
    return this._moduleBase;
  }

  /** Clear the cached module base (call on new module load) */
  clearModuleBaseCache(): void {
    this._moduleBase = null;
  }

  // ── Pattern Cell Patching ──────────────────────────────────────────────────

  /**
   * Write a single edited pattern cell back to chip RAM.
   * The 68k replayer reads pattern data from chip RAM on the fly,
   * so this edit takes effect on the next tick that reads this cell.
   */
  async patchPatternCell(
    layout: UADEPatternLayout,
    pattern: number,
    row: number,
    channel: number,
    cell: TrackerCell,
  ): Promise<void> {
    const moduleBase = await this.getModuleBase();
    const fileOffset = getCellFileOffset(layout, pattern, row, channel);
    if (fileOffset < 0) return; // non-editable cell (e.g., wait row in variable-length format)
    const addr = moduleBase + fileOffset;
    const bytes = layout.encodeCell(cell);
    await this.writeBytes(addr, bytes);
  }

  /**
   * Export the module with all chip RAM edits applied.
   * Since pattern edits were written to chip RAM in-place,
   * the exported file automatically includes all modifications.
   */
  async exportEditedModule(layout: UADEPatternLayout, filename: string): Promise<void> {
    const moduleBase = await this.getModuleBase();
    await this.exportModule(moduleBase, layout.moduleSize, filename);
  }

  /**
   * Universal export: read the module back from chip RAM using the original
   * file size. Works for ANY UADE format — no encoder or pattern layout needed.
   * Any chip RAM edits (pattern cells, instrument params) are included.
   */
  async exportWithOriginalSize(originalFileSize: number, filename: string): Promise<void> {
    const moduleBase = await this.getModuleBase();
    if (moduleBase === 0 || originalFileSize <= 0) {
      throw new Error('Cannot export: module base or file size unknown');
    }
    await this.exportModule(moduleBase, originalFileSize, filename);
  }

  /**
   * Read the edited module bytes (for non-browser contexts or further processing).
   * Returns the raw bytes without triggering a download.
   */
  async readEditedModule(originalFileSize: number): Promise<Uint8Array> {
    const moduleBase = await this.getModuleBase();
    if (moduleBase === 0 || originalFileSize <= 0) {
      throw new Error('Cannot read module: module base or file size unknown');
    }
    return this.readModule(moduleBase, originalFileSize);
  }

  /**
   * Trigger a browser download of the module binary in its original format.
   * Call this after the user has finished editing parameters.
   */
  async exportModule(moduleBase: number, moduleSize: number, filename: string): Promise<void> {
    const bytes = await this.readModule(moduleBase, moduleSize);
    const blob = new Blob([bytes as unknown as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
