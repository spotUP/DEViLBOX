/**
 * GTUltraASIDBridge — Bridges GoatTracker Ultra's SID register writes
 * to real hardware via the SIDHardwareManager (ASID/MIDI or WebUSB).
 *
 * The GTUltra WASM engine emits SID register data via EM_JS callback
 * (gt_asid_write). This bridge captures those writes and forwards them
 * to whichever hardware transport is active.
 *
 * Supports dual-SID mode: SID #1 → registers 0x00-0x18, SID #2 → 0x20-0x38.
 */

import { getSIDHardwareManager } from '@/lib/sid/SIDHardwareManager';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { SIDRegisterDecoder } from '../automation/decoders/SIDRegisterDecoder';
import { getAutomationCapture } from '../automation/AutomationCapture';
import type { AutomationSourceRef } from '../../types/automation';

type BridgeChangeCallback = (enabled: boolean) => void;

export class GTUltraASIDBridge {
  private enabled = false;
  private _writeCount = 0;
  private sidDecoder = new SIDRegisterDecoder(2);
  private captureEnabled = true;
  private listeners = new Set<BridgeChangeCallback>();

  /** Total number of register writes sent to hardware */
  getWriteCount(): number { return this._writeCount; }

  /** Subscribe to enable/disable state changes. Returns unsubscribe. */
  onChange(cb: BridgeChangeCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyChange(): void {
    const enabled = this.enabled;
    this.listeners.forEach(cb => cb(enabled));
  }

  /** Enable hardware output. Starts sending SID register writes. */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    const mgr = getSIDHardwareManager();
    // Clear the diff cache so the first frame's register dump is sent in
    // full, not filtered against stale values from a previous session.
    mgr.clearDiffCache();
    // Apply the persisted clock rate (PAL/NTSC/DREAN) so pitch matches the
    // song's target frame rate. Without this the Pico plays at whatever
    // rate it was last set to.
    void mgr.applyClockFromSettings();
    console.log('[GTUltra HW] Bridge enabled, mode:', mgr.mode);
    this.notifyChange();
  }

  /** Disable hardware output. Silences hardware. */
  async disable(): Promise<void> {
    if (!this.enabled) return;
    this.enabled = false;
    this._writeCount = 0;
    const mgr = getSIDHardwareManager();
    if (mgr.isActive) {
      // Silence: zero volume on each SID
      mgr.writeRegister(0, 0x18, 0);
      if (useGTUltraStore.getState().sidCount === 2) {
        mgr.writeRegister(1, 0x18, 0);
      }
      mgr.flush();
    }
    console.log('[GTUltra HW] Bridge disabled');
    this.notifyChange();
  }

  /**
   * Write a single SID register to hardware.
   * @param sidIdx - SID chip index (0 or 1)
   * @param reg - Register offset (0x00-0x18)
   * @param value - Register value (0x00-0xFF)
   */
  writeRegister(sidIdx: number, reg: number, value: number): void {
    if (!this.enabled || reg > 0x18) return;
    getSIDHardwareManager().writeRegister(sidIdx, reg, value);
    this._writeCount++;
  }

  /**
   * Write a full SID register dump (25 bytes) for one chip.
   * Only changed registers are sent (diffing handled by manager).
   */
  writeFrame(sidIdx: number, registers: Uint8Array): void {
    if (!this.enabled) return;
    getSIDHardwareManager().writeFrame(sidIdx, registers);
    this._writeCount += registers.length; // approximate
  }

  /** Check if hardware is connected and ready. */
  get isConnected(): boolean {
    return getSIDHardwareManager().isActive;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Reset all SID registers on hardware. */
  async reset(): Promise<void> {
    await getSIDHardwareManager().resetSID();
  }

  /** Enable/disable automation capture from SID register writes */
  enableCapture(enabled: boolean): void {
    this.captureEnabled = enabled;
    if (!enabled) {
      this.sidDecoder.reset();
    }
  }

  /** Process a register write for automation capture */
  captureRegisterWrite(
    chip: number,
    reg: number,
    value: number,
    tick: number,
    tableType?: 'wave' | 'pulse' | 'filter',
    tableIndex?: number,
  ): void {
    if (!this.captureEnabled) return;

    const decoded = this.sidDecoder.write(chip, reg, value);
    const capture = getAutomationCapture();
    const sourceRef: AutomationSourceRef | undefined = tableType != null && tableIndex != null
      ? { type: 'table', tableType, tableId: chip, index: tableIndex }
      : undefined;

    for (const entry of decoded) {
      capture.push(entry.paramId, tick, entry.value, sourceRef);
    }
  }
}

// Singleton
let instance: GTUltraASIDBridge | null = null;

export function getGTUltraASIDBridge(): GTUltraASIDBridge {
  if (!instance) instance = new GTUltraASIDBridge();
  return instance;
}
