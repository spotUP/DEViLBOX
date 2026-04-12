import { aA as UADEEngine, aS as getCellFileOffset } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class UADEChipEditor {
  engine;
  constructor(engine) {
    this.engine = engine;
  }
  /** Check if UADE engine is active and safe for chip RAM operations. */
  get isActive() {
    return UADEEngine.hasInstance();
  }
  /** Read `length` raw bytes from chip RAM at `addr`. */
  readBytes(addr, length) {
    if (!this.isActive) return Promise.resolve(new Uint8Array(length));
    return this.engine.readMemory(addr, length).catch(() => new Uint8Array(length));
  }
  /** Write raw bytes to chip RAM at `addr`. */
  writeBytes(addr, data) {
    if (!this.isActive) return Promise.resolve();
    return this.engine.writeMemory(addr, data).catch(() => {
    });
  }
  /** Read a big-endian unsigned 16-bit value. */
  async readU16(addr) {
    const b = await this.readBytes(addr, 2);
    return b[0] << 8 | b[1];
  }
  /** Read a big-endian unsigned 32-bit value. */
  async readU32(addr) {
    const b = await this.readBytes(addr, 4);
    return (b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]) >>> 0;
  }
  /** Write a big-endian unsigned 8-bit value. */
  writeU8(addr, value) {
    return this.writeBytes(addr, new Uint8Array([value & 255]));
  }
  /** Write a big-endian unsigned 16-bit value. */
  writeU16(addr, value) {
    return this.writeBytes(addr, new Uint8Array([value >> 8 & 255, value & 255]));
  }
  /** Write a big-endian unsigned 32-bit value. */
  writeU32(addr, value) {
    return this.writeBytes(addr, new Uint8Array([
      value >>> 24 & 255,
      value >>> 16 & 255,
      value >>> 8 & 255,
      value & 255
    ]));
  }
  /** Write a signed 8-bit value (stored as two's-complement). */
  writeS8(addr, value) {
    return this.writeU8(addr, value < 0 ? value + 256 : value);
  }
  /** Write a block of bytes at addr, reading the new values from `bytes`. */
  writeBlock(addr, bytes) {
    return this.writeBytes(addr, new Uint8Array(bytes));
  }
  /**
   * Read the entire module binary back from chip RAM.
   * The returned buffer is byte-identical to the original format file
   * (with any chip RAM edits applied), ready for download.
   */
  readModule(moduleBase, moduleSize) {
    return this.engine.readMemory(moduleBase, moduleSize);
  }
  // ── UADE Module Base Address ──────────────────────────────────────────────
  /** Cached module base address (chip RAM address where module binary starts) */
  _moduleBase = null;
  /**
   * Read the module base address from chip RAM.
   * UADE stores modaddr as a big-endian u32 at address 0x100 (SCORE_MODULE_ADDR).
   * Cached after first read since it doesn't change during playback.
   */
  async getModuleBase() {
    if (this._moduleBase !== null) return this._moduleBase;
    this._moduleBase = await this.readU32(256);
    return this._moduleBase;
  }
  /** Clear the cached module base (call on new module load) */
  clearModuleBaseCache() {
    this._moduleBase = null;
  }
  // ── Pattern Cell Patching ──────────────────────────────────────────────────
  /**
   * Write a single edited pattern cell back to chip RAM.
   * The 68k replayer reads pattern data from chip RAM on the fly,
   * so this edit takes effect on the next tick that reads this cell.
   */
  async patchPatternCell(layout, pattern, row, channel, cell) {
    const moduleBase = await this.getModuleBase();
    const fileOffset = getCellFileOffset(layout, pattern, row, channel);
    if (fileOffset < 0) return;
    const addr = moduleBase + fileOffset;
    const bytes = layout.encodeCell(cell);
    await this.writeBytes(addr, bytes);
  }
  /**
   * Export the module with all chip RAM edits applied.
   * Since pattern edits were written to chip RAM in-place,
   * the exported file automatically includes all modifications.
   */
  async exportEditedModule(layout, filename) {
    const moduleBase = await this.getModuleBase();
    await this.exportModule(moduleBase, layout.moduleSize, filename);
  }
  /**
   * Universal export: read the module back from chip RAM using the original
   * file size. Works for ANY UADE format — no encoder or pattern layout needed.
   * Any chip RAM edits (pattern cells, instrument params) are included.
   */
  async exportWithOriginalSize(originalFileSize, filename) {
    const moduleBase = await this.getModuleBase();
    if (moduleBase === 0 || originalFileSize <= 0) {
      throw new Error("Cannot export: module base or file size unknown");
    }
    await this.exportModule(moduleBase, originalFileSize, filename);
  }
  /**
   * Read the edited module bytes (for non-browser contexts or further processing).
   * Returns the raw bytes without triggering a download.
   */
  async readEditedModule(originalFileSize) {
    const moduleBase = await this.getModuleBase();
    if (moduleBase === 0 || originalFileSize <= 0) {
      throw new Error("Cannot read module: module base or file size unknown");
    }
    return this.readModule(moduleBase, originalFileSize);
  }
  /**
   * Trigger a browser download of the module binary in its original format.
   * Call this after the user has finished editing parameters.
   */
  async exportModule(moduleBase, moduleSize, filename) {
    const bytes = await this.readModule(moduleBase, moduleSize);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  // ── Variable-Length Pattern Rewriting ──────────────────────────────────────
  /**
   * Re-encode and write an entire channel's pattern data to chip RAM.
   * Uses trackMap to resolve (TrackerSong patternIdx, channel) → file-level
   * pattern index, then writes the re-encoded data at the file pattern's address.
   *
   * @returns true if written, false if the re-encoded data exceeded the
   *          original size (edit rejected to prevent buffer overflow).
   */
  async rewriteVariablePattern(layout, trackerPatternIndex, channel, rows) {
    var _a;
    const filePatIdx = (_a = layout.trackMap[trackerPatternIndex]) == null ? void 0 : _a[channel];
    if (filePatIdx == null || filePatIdx < 0) return false;
    const fileOffset = layout.filePatternAddrs[filePatIdx];
    const originalSize = layout.filePatternSizes[filePatIdx];
    if (fileOffset == null || originalSize == null) return false;
    const moduleBase = await this.getModuleBase();
    const encoded = layout.encoder.encodePattern(rows, channel);
    if (encoded.length > originalSize) {
      console.warn(
        `[UADEChipEditor] Variable-length pattern overflow: file pattern ${filePatIdx} encoded ${encoded.length} bytes > original ${originalSize}`
      );
      return false;
    }
    const addr = moduleBase + fileOffset;
    const padded = new Uint8Array(originalSize);
    padded.set(encoded);
    await this.writeBytes(addr, padded);
    return true;
  }
}
export {
  UADEChipEditor
};
