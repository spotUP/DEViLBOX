/**
 * SIDHardwareManager.ts
 *
 * Unified manager for SID hardware output — abstracts over two transports:
 *   1. ASID over Web MIDI (existing, simple register writes)
 *   2. WebUSB direct connection (new, cycle-exact writes + device commands)
 *
 * SID engines call this manager instead of ASID/WebUSB directly.
 * The manager routes writes to whichever transport is active.
 */

import { getASIDDeviceManager, isASIDSupported } from './ASIDDeviceManager';
import { sendASIDRegisterWrite, resetASIDSID, ASID } from './ASIDProtocol';
import {
  getUSBSIDPico,
  USBSIDPicoDevice,
  ClockRate,
  type ClockRateValue,
} from './USBSIDPico';

export type SIDHardwareMode = 'off' | 'asid' | 'webusb';

export interface SIDHardwareStatus {
  mode: SIDHardwareMode;
  connected: boolean;
  deviceName: string | null;
  writeCount: number;
  /** Whether WebUSB is supported by the browser */
  webusbSupported: boolean;
  /** Whether Web MIDI (ASID) is supported by the browser */
  asidSupported: boolean;
  /** Firmware version string (WebUSB only) */
  firmwareVersion?: string | null;
  /** Detected SID chip info (WebUSB only) */
  detectedChips?: Array<{ slot: number; detected: boolean; type?: string }> | null;
}

type StatusChangeCallback = (status: SIDHardwareStatus) => void;

/**
 * Unified SID hardware output manager.
 * Singleton — use getSIDHardwareManager().
 */
class SIDHardwareManager {
  private _mode: SIDHardwareMode = 'off';
  private listeners = new Set<StatusChangeCallback>();
  private lastRegisters = new Map<number, number>(); // global reg → value (for diff writes)
  private _writeCount = 0;
  private unsubUSBState: (() => void) | null = null;
  private _firmwareVersion: string | null = null;
  private _detectedChips: Array<{ slot: number; detected: boolean; type?: string }> | null = null;
  private flushScheduled = false;

  get mode(): SIDHardwareMode { return this._mode; }
  get writeCount(): number { return this._writeCount; }

  get isActive(): boolean {
    if (this._mode === 'webusb') return getUSBSIDPico().isConnected;
    if (this._mode === 'asid') return getASIDDeviceManager().isDeviceReady();
    return false;
  }

  // ─── Mode Management ─────────────────────────────────────

  /**
   * Activate a specific hardware mode.
   * For WebUSB: attempts reconnect to previously paired device.
   * For ASID: initializes Web MIDI.
   */
  async setMode(mode: SIDHardwareMode): Promise<boolean> {
    // Deactivate current mode first
    if (this._mode !== 'off' && this._mode !== mode) {
      await this.deactivate();
    }

    this._mode = mode;
    this._writeCount = 0;
    this.lastRegisters.clear();

    if (mode === 'off') {
      this.notifyListeners();
      return true;
    }

    if (mode === 'webusb') {
      const pico = getUSBSIDPico();
      // Subscribe to state changes
      this.unsubUSBState = pico.onStateChange(() => this.notifyListeners());
      // Try reconnect to previously paired device
      const ok = await pico.reconnect();
      if (ok) await this.queryDeviceInfo();
      this.notifyListeners();
      return ok;
    }

    if (mode === 'asid') {
      const mgr = getASIDDeviceManager();
      const ok = await mgr.init();
      this.notifyListeners();
      return ok;
    }

    return false;
  }

  /** Show WebUSB device picker and connect */
  async connectWebUSB(): Promise<boolean> {
    const pico = getUSBSIDPico();
    if (!this.unsubUSBState) {
      this.unsubUSBState = pico.onStateChange(() => this.notifyListeners());
    }
    const ok = await pico.init();
    if (ok) {
      this._mode = 'webusb';
      await this.queryDeviceInfo();
    }
    this.notifyListeners();
    return ok;
  }

  /** Deactivate current mode and disconnect */
  async deactivate(): Promise<void> {
    if (this._mode === 'webusb') {
      const pico = getUSBSIDPico();
      await pico.close();
      if (this.unsubUSBState) {
        this.unsubUSBState();
        this.unsubUSBState = null;
      }
    }
    if (this._mode === 'asid') {
      // Silence via ASID
      const port = getASIDDeviceManager().getSelectedPort();
      if (port) {
        sendASIDRegisterWrite(port, ASID.DEVICE_ADDRESS.USBSID_PICO, 0x18, 0);
      }
    }

    this._mode = 'off';
    this._writeCount = 0;
    this._firmwareVersion = null;
    this._detectedChips = null;
    this.lastRegisters.clear();
    this.notifyListeners();
  }

  // ─── Register Writes ─────────────────────────────────────

  /**
   * Write a SID register. Routes to active transport.
   * @param chip SID chip index (0-3)
   * @param reg SID register (0x00-0x18)
   * @param value Register value (0x00-0xFF)
   */
  writeRegister(chip: number, reg: number, value: number): void {
    // Diff-based: skip if unchanged
    const globalReg = (chip * 0x20) | reg;
    if (this.lastRegisters.get(globalReg) === value) return;
    this.lastRegisters.set(globalReg, value);

    if (this._mode === 'webusb') {
      const pico = getUSBSIDPico();
      if (pico.isConnected) {
        pico.write(chip, reg, value);
        this._writeCount++;
        this.scheduleFlush();
      }
    } else if (this._mode === 'asid') {
      const port = getASIDDeviceManager().getSelectedPort();
      if (port) {
        sendASIDRegisterWrite(
          port,
          ASID.DEVICE_ADDRESS.USBSID_PICO,
          globalReg,
          value
        );
        this._writeCount++;
      }
    }
  }

  /**
   * Cycle-exact register write (WebUSB only).
   * Falls back to simple write for ASID mode.
   * @param cycles C64 clock cycles since last write
   * @param chip SID chip index (0-3)
   * @param reg SID register (0x00-0x18)
   * @param value Register value (0x00-0xFF)
   */
  writeCycled(cycles: number, chip: number, reg: number, value: number): void {
    const globalReg = (chip * 0x20) | reg;
    this.lastRegisters.set(globalReg, value);

    if (this._mode === 'webusb') {
      const pico = getUSBSIDPico();
      if (pico.isConnected) {
        pico.writeCycled(cycles, chip, reg, value);
        this._writeCount++;
      }
    } else {
      // Fall back to non-cycled write for ASID
      this.writeRegister(chip, reg, value);
    }
  }

  /**
   * Write a full frame of SID registers (25 bytes).
   * Only changed registers are sent.
   */
  writeFrame(chip: number, registers: Uint8Array): void {
    for (let i = 0; i < 25 && i < registers.length; i++) {
      this.writeRegister(chip, i, registers[i]);
    }
    // Flush WebUSB buffer after frame
    if (this._mode === 'webusb') {
      getUSBSIDPico().flush();
    }
  }

  /** Flush any buffered writes (WebUSB only) */
  flush(): void {
    if (this._mode === 'webusb') {
      getUSBSIDPico().flush();
    }
  }

  /**
   * Debounced flush — coalesces a burst of writes into one USB transfer.
   *
   * GoatTracker dumps 25 register writes per audio quantum via postMessage,
   * which arrive as 25 separate main-thread events. Without draining the
   * pico buffer between events, writes sit there until MAX_WRITE_BUFFER (31)
   * is hit — typically ~100+ ms of lag at normal song pacing.
   *
   * setTimeout(0) queues a macrotask that runs AFTER all currently-pending
   * message events, so a full frame's worth of writes batch into one flush.
   */
  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => {
      this.flushScheduled = false;
      if (this._mode === 'webusb') {
        getUSBSIDPico().flush();
      }
    }, 0);
  }

  /**
   * Clear the diff cache. Call before starting a new playback session so
   * the first frame's register dump is sent in full rather than being
   * filtered against stale values from a previous song.
   */
  clearDiffCache(): void {
    this.lastRegisters.clear();
  }

  /** Apply the persisted clock rate setting to the hardware (WebUSB only). */
  async applyClockFromSettings(): Promise<void> {
    if (this._mode !== 'webusb') return;
    try {
      const { useSettingsStore } = await import('@stores/useSettingsStore');
      const rate = useSettingsStore.getState().webusbClockRate;
      if (rate >= 0 && rate <= 3) {
        getUSBSIDPico().setClock(rate as ClockRateValue);
      }
    } catch (err) {
      console.warn('[SIDHardware] Apply clock from settings failed:', err);
    }
  }

  // ─── Device Commands ─────────────────────────────────────

  /** Reset all SID chips to silent state */
  async resetSID(): Promise<void> {
    this.lastRegisters.clear();

    if (this._mode === 'webusb') {
      await getUSBSIDPico().resetSID();
    } else if (this._mode === 'asid') {
      const port = getASIDDeviceManager().getSelectedPort();
      if (port) {
        await resetASIDSID(port, ASID.DEVICE_ADDRESS.USBSID_PICO, -1);
      }
    }
  }

  /** Pause hardware output (WebUSB only) */
  pause(): void {
    if (this._mode === 'webusb') getUSBSIDPico().pause();
  }

  /** Unpause hardware output (WebUSB only) */
  unpause(): void {
    if (this._mode === 'webusb') getUSBSIDPico().unpause();
  }

  /** Set SID clock rate (WebUSB only) */
  setClock(rate: ClockRateValue): void {
    if (this._mode === 'webusb') getUSBSIDPico().setClock(rate);
  }

  /** Set audio mode (WebUSB only, v1.3+ boards) */
  setAudioMode(stereo: boolean): void {
    if (this._mode === 'webusb') getUSBSIDPico().setAudioMode(stereo);
  }

  // ─── Device Info ──────────────────────────────────────────

  /** Query firmware version and SID chip info from connected WebUSB device */
  async queryDeviceInfo(): Promise<void> {
    if (this._mode !== 'webusb') return;
    const pico = getUSBSIDPico();
    if (!pico.isConnected) return;

    try {
      this._firmwareVersion = await pico.getFirmwareVersion();
      this._detectedChips = await pico.detectSIDChips();
      this.notifyListeners();
    } catch (err) {
      console.warn('[SIDHardwareManager] Device info query failed:', err);
    }
  }

  get firmwareVersion(): string | null { return this._firmwareVersion; }
  get detectedChips() { return this._detectedChips; }

  // ─── Status ──────────────────────────────────────────────

  getStatus(): SIDHardwareStatus {
    let deviceName: string | null = null;

    if (this._mode === 'webusb') {
      const info = getUSBSIDPico().deviceInfo;
      deviceName = info?.productName ?? null;
    } else if (this._mode === 'asid') {
      const dev = getASIDDeviceManager().getSelectedDevice();
      deviceName = dev?.name ?? null;
    }

    return {
      mode: this._mode,
      connected: this.isActive,
      deviceName,
      writeCount: this._writeCount,
      webusbSupported: USBSIDPicoDevice.isSupported(),
      asidSupported: isASIDSupported(),
      firmwareVersion: this._firmwareVersion,
      detectedChips: this._detectedChips,
    };
  }

  onStatusChange(cb: StatusChangeCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach(cb => cb(status));
  }
}

// ─── Singleton ───────────────────────────────────────────

let instance: SIDHardwareManager | null = null;

export function getSIDHardwareManager(): SIDHardwareManager {
  if (!instance) {
    instance = new SIDHardwareManager();
  }
  return instance;
}

/**
 * Auto-reconnect to USB-SID-Pico if mode was 'webusb' on last session.
 * Call this once during app startup.
 */
export async function initSIDHardwareFromSettings(): Promise<void> {
  try {
    const { useSettingsStore } = await import('@stores/useSettingsStore');
    const mode = useSettingsStore.getState().sidHardwareMode;
    if (mode === 'webusb' && USBSIDPicoDevice.isSupported()) {
      console.log('[SIDHardware] Auto-reconnecting WebUSB from saved settings...');
      const mgr = getSIDHardwareManager();
      const ok = await mgr.setMode('webusb');
      console.log(`[SIDHardware] Auto-reconnect ${ok ? 'succeeded' : 'failed (no paired device)'}`);
    } else if (mode === 'asid') {
      const mgr = getSIDHardwareManager();
      await mgr.setMode('asid');
    }
  } catch (err) {
    console.warn('[SIDHardware] Auto-init failed:', err);
  }
}

// Re-export for convenience
export { ClockRate };
