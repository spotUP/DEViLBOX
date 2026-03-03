/**
 * GTUltraASIDBridge — Bridges GoatTracker Ultra's SID register writes
 * to real hardware via the ASID protocol (USB-SID-Pico, TherapSID, etc.).
 *
 * The GTUltra WASM engine emits SID register data via EM_JS callback
 * (gt_asid_write). This bridge captures those writes and forwards them
 * to the ASID device manager for playback on real SID chips.
 *
 * Supports dual-SID mode: SID #1 → registers 0x00-0x18, SID #2 → 0x20-0x38.
 */

import { getASIDDeviceManager } from '@/lib/sid/ASIDDeviceManager';
import { sendASIDRegisterWrite, ASID, resetASIDSID } from '@/lib/sid/ASIDProtocol';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

export class GTUltraASIDBridge {
  private enabled = false;
  private lastRegisters: Uint8Array;
  private lastRegisters2: Uint8Array;
  private _writeCount = 0;

  constructor() {
    this.lastRegisters = new Uint8Array(25);
    this.lastRegisters2 = new Uint8Array(25);
  }

  /** Total number of register writes sent to hardware */
  getWriteCount(): number { return this._writeCount; }

  /** Get the MIDI output port for the selected ASID device */
  private getPort(): MIDIOutput | null {
    return getASIDDeviceManager().getSelectedPort();
  }

  /** Enable ASID output. Starts sending SID register writes to hardware. */
  enable(): void {
    this.enabled = true;
    console.log('[GTUltra ASID] Bridge enabled');
  }

  /** Disable ASID output. Silences hardware by zeroing volume registers. */
  disable(): void {
    this.enabled = false;
    this._writeCount = 0;
    const port = this.getPort();
    if (port) {
      // Silence: write 0 to volume register (0x18) on each SID
      sendASIDRegisterWrite(port, ASID.DEVICE_ADDRESS.USBSID_PICO, 0x18, 0);
      if (useGTUltraStore.getState().sidCount === 2) {
        sendASIDRegisterWrite(port, ASID.DEVICE_ADDRESS.USBSID_PICO, 0x20 + 0x18, 0);
      }
    }
    console.log('[GTUltra ASID] Bridge disabled');
  }

  /**
   * Write a single SID register to hardware.
   * @param sidIdx - SID chip index (0 or 1)
   * @param reg - Register offset (0x00-0x18)
   * @param value - Register value (0x00-0xFF)
   */
  writeRegister(sidIdx: number, reg: number, value: number): void {
    if (!this.enabled) return;
    if (reg > 0x18) return;

    const regs = sidIdx === 0 ? this.lastRegisters : this.lastRegisters2;
    if (regs[reg] === value) return;
    regs[reg] = value;

    const port = this.getPort();
    if (!port) return;

    const hwReg = reg + (sidIdx * 0x20);
    sendASIDRegisterWrite(port, ASID.DEVICE_ADDRESS.USBSID_PICO, hwReg, value);
    this._writeCount++;
  }

  /**
   * Write a full SID register dump (25 bytes) for one chip.
   * More efficient than individual writes for frame updates —
   * only changed registers are sent.
   */
  writeFrame(sidIdx: number, registers: Uint8Array): void {
    if (!this.enabled) return;

    const port = this.getPort();
    if (!port) return;

    const prev = sidIdx === 0 ? this.lastRegisters : this.lastRegisters2;
    const offset = sidIdx * 0x20;

    for (let i = 0; i < 25 && i < registers.length; i++) {
      if (registers[i] !== prev[i]) {
        prev[i] = registers[i];
        sendASIDRegisterWrite(port, ASID.DEVICE_ADDRESS.USBSID_PICO, offset + i, registers[i]);
        this._writeCount++;
      }
    }
  }

  /** Check if ASID hardware is connected and selected. */
  get isConnected(): boolean {
    return getASIDDeviceManager().isDeviceReady();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Reset all SID registers on hardware. */
  async reset(): Promise<void> {
    this.lastRegisters.fill(0);
    this.lastRegisters2.fill(0);
    const port = this.getPort();
    if (!port) return;
    await resetASIDSID(port, ASID.DEVICE_ADDRESS.USBSID_PICO, 0);
    if (useGTUltraStore.getState().sidCount === 2) {
      await resetASIDSID(port, ASID.DEVICE_ADDRESS.USBSID_PICO, 1);
    }
  }
}

// Singleton
let instance: GTUltraASIDBridge | null = null;

export function getGTUltraASIDBridge(): GTUltraASIDBridge {
  if (!instance) instance = new GTUltraASIDBridge();
  return instance;
}
