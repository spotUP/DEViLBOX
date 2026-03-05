/**
 * USBSIDPico.ts
 *
 * WebUSB driver for the USB-SID-Pico hardware device.
 * Communicates directly via USB bulk transfers — no MIDI dependency.
 *
 * Key advantages over ASID/MIDI:
 * - Cycle-exact writes (timing-accurate SID playback)
 * - Buffered USB packets (efficient batching)
 * - Device commands (reset, pause, clock rate, mono/stereo)
 * - Up to 4 SID chips
 *
 * Reference: https://github.com/LouDnl/USBSID-Pico-driver
 */

// --- WebUSB Constants ---
const DEVICE_CLASS  = 0xFF;  // Vendor-specific interface
const CTRL_TRANSFER = 0x22;
const CTRL_ENABLE   = 0x01;

// --- USB-SID-Pico device IDs ---
export const USBSID_VID = 0xCAFE;
export const USBSID_PID = 0x4011;

// --- Buffer constants ---
const BUFFER_SIZE       = 64;
const MAX_WRITE_BYTES   =  3;  // cmd + register + value
const MAX_CYCLED_BYTES  =  5;  // cmd + register + value + cycles_hi + cycles_lo
const MAX_WRITE_BUFFER  = 63;  // cmd + 62 bytes (31 writes)
const MAX_CYCLED_BUFFER = 61;  // cmd + 60 bytes (15 cycled writes)

// --- Command byte encoding (top 2 bits of byte 0) ---
const WRITE        = 0;  // 0b00 << 6 = 0x00
const READ         = 1;  // 0b01 << 6 = 0x40
const CYCLED_WRITE = 2;  // 0b10 << 6 = 0x80
const COMMAND      = 3;  // 0b11 << 6 = 0xC0

// --- Command IDs (lower 5 bits) ---
export const CMD = {
  PAUSE:       10,
  UNPAUSE:     11,
  MUTE:        12,
  UNMUTE:      13,
  RESET_SID:   14,
  DISABLE_SID: 15,
  ENABLE_SID:  16,
  CLEAR_BUS:   17,
  CONFIG:      18,
  RESET_MCU:   19,
  BOOTLOADER:  20,
} as const;

// --- Config sub-commands ---
export const CFG = {
  RESET_USBSID:     0x20,
  READ_CONFIG:       0x30,
  APPLY_CONFIG:      0x31,
  STORE_CONFIG:      0x32,
  SAVE_CONFIG:       0x33,
  SAVE_NORESET:      0x34,
  RESET_CONFIG:      0x35,
  SINGLE_SID:        0x40,
  DUAL_SID:          0x41,
  QUAD_SID:          0x42,
  TRIPLE_SID:        0x43,
  SET_CLOCK:         0x50,
  DETECT_SIDS:       0x51,
  TEST_ALLSIDS:      0x52,
  TEST_SID1:         0x53,
  TEST_SID2:         0x54,
  TEST_SID3:         0x55,
  TEST_SID4:         0x56,
  LOAD_MIDI_STATE:   0x60,
  SAVE_MIDI_STATE:   0x61,
  RESET_MIDI_STATE:  0x63,
  USBSID_VERSION:    0x80,
  TOGGLE_AUDIO:      0x88,
  SET_AUDIO:         0x89,
} as const;

// --- Clock rates ---
export const ClockRate = {
  DEFAULT: 0,  // 1000000 Hz
  PAL:     1,  //  985248 Hz
  NTSC:    2,  // 1022727 Hz
  DREAN:   3,  // 1023440 Hz
} as const;
export type ClockRateValue = typeof ClockRate[keyof typeof ClockRate];

// --- Audio mode ---
export const AudioMode = {
  MONO:   0,
  STEREO: 1,
} as const;

export type USBSIDState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface USBSIDDeviceInfo {
  productName: string;
  serialNumber: string;
  vendorId: number;
  productId: number;
}

type StateChangeCallback = (state: USBSIDState, info?: USBSIDDeviceInfo) => void;

/**
 * USB-SID-Pico WebUSB driver.
 *
 * Manages connection, buffered writes, and device commands.
 * Call init() to request and open the device via WebUSB prompt.
 */
export class USBSIDPicoDevice {
  private device: USBDevice | null = null;
  private interfaceNumber = -1;
  private endpointOut = -1;
  private endpointIn = -1;
  private _state: USBSIDState = 'disconnected';
  private _writeCount = 0;
  private _consecutiveErrors = 0;
  private listeners = new Set<StateChangeCallback>();
  private disconnectHandler: ((ev: USBConnectionEvent) => void) | null = null;

  // Write buffering
  private cycleExact: boolean;
  private backbuf = new Uint8Array(BUFFER_SIZE);
  private backbufIdx = 1;
  private maxPacketSize: number;

  constructor(cycleExact = true) {
    this.cycleExact = cycleExact;
    this.maxPacketSize = cycleExact ? MAX_CYCLED_BUFFER : MAX_WRITE_BUFFER;
  }

  get state(): USBSIDState { return this._state; }
  get writeCount(): number { return this._writeCount; }
  get isConnected(): boolean { return this._state === 'connected'; }

  get deviceInfo(): USBSIDDeviceInfo | null {
    if (!this.device) return null;
    return {
      productName: this.device.productName || 'USB-SID-Pico',
      serialNumber: this.device.serialNumber || '',
      vendorId: this.device.vendorId,
      productId: this.device.productId,
    };
  }

  /** Register a callback for connection state changes */
  onStateChange(cb: StateChangeCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setState(state: USBSIDState): void {
    this._state = state;
    this.listeners.forEach(cb => cb(state, this.deviceInfo ?? undefined));
  }

  // ─── Connection ──────────────────────────────────────────

  /** Check if WebUSB is supported in this browser */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'usb' in navigator;
  }

  /**
   * Request and open USB-SID-Pico device.
   * Shows browser USB device picker prompt.
   * @param existingDevice Optional pre-paired device (from getDevices())
   */
  async init(existingDevice?: USBDevice): Promise<boolean> {
    if (this._state === 'connected') {
      console.log('[USBSIDPico] Already connected');
      return true;
    }

    if (!USBSIDPicoDevice.isSupported()) {
      console.warn('[USBSIDPico] WebUSB not supported');
      this.setState('error');
      return false;
    }

    this.setState('connecting');

    try {
      if (existingDevice) {
        this.device = existingDevice;
      } else {
        this.device = await navigator.usb.requestDevice({
          filters: [{ vendorId: USBSID_VID, productId: USBSID_PID }],
        });
      }

      if (!this.device) {
        throw new Error('No device selected');
      }

      await this.device.open();

      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }

      // Find the vendor-specific interface and endpoints
      this.findInterface();

      await this.device.claimInterface(this.interfaceNumber);
      await this.device.selectAlternateInterface(this.interfaceNumber, 0);

      // Enable the interface
      await this.device.controlTransferOut({
        requestType: 'class',
        recipient: 'interface',
        request: CTRL_TRANSFER,
        value: CTRL_ENABLE,
        index: this.interfaceNumber,
      });

      this.backbufIdx = 1;
      this._writeCount = 0;
      this._consecutiveErrors = 0;

      // Listen for USB disconnect events
      this.registerDisconnectHandler();

      this.setState('connected');

      console.log('[USBSIDPico] Connected:', this.device.productName);
      return true;
    } catch (err) {
      console.error('[USBSIDPico] Connection failed:', err);
      this.device = null;
      this.setState('error');
      return false;
    }
  }

  /**
   * Try to reconnect to a previously paired device without showing the picker.
   * Returns true if a paired device was found and connected.
   */
  async reconnect(): Promise<boolean> {
    if (!USBSIDPicoDevice.isSupported()) return false;

    try {
      const devices = await navigator.usb.getDevices();
      const pico = devices.find(
        d => d.vendorId === USBSID_VID && d.productId === USBSID_PID
      );
      if (pico) {
        return this.init(pico);
      }
    } catch (err) {
      console.warn('[USBSIDPico] Reconnect failed:', err);
    }
    return false;
  }

  /** Find the vendor-specific interface and its endpoints */
  private findInterface(): void {
    if (!this.device?.configuration) {
      throw new Error('No USB configuration');
    }

    for (const iface of this.device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass === DEVICE_CLASS) {
          this.interfaceNumber = iface.interfaceNumber;
          for (const ep of alt.endpoints) {
            if (ep.direction === 'out') this.endpointOut = ep.endpointNumber;
            if (ep.direction === 'in') this.endpointIn = ep.endpointNumber;
          }
          return;
        }
      }
    }
    throw new Error('No vendor-specific interface found on device');
  }

  /** Register WebUSB disconnect event handler */
  private registerDisconnectHandler(): void {
    this.unregisterDisconnectHandler();
    this.disconnectHandler = (ev: USBConnectionEvent) => {
      if (ev.device === this.device) {
        console.warn('[USBSIDPico] Device disconnected (unplugged)');
        this.handleDisconnect();
      }
    };
    navigator.usb.addEventListener('disconnect', this.disconnectHandler);
  }

  /** Remove WebUSB disconnect event handler */
  private unregisterDisconnectHandler(): void {
    if (this.disconnectHandler) {
      navigator.usb.removeEventListener('disconnect', this.disconnectHandler);
      this.disconnectHandler = null;
    }
  }

  /** Handle unexpected device disconnect (unplug) */
  private handleDisconnect(): void {
    this.device = null;
    this.interfaceNumber = -1;
    this.endpointOut = -1;
    this.endpointIn = -1;
    this.backbufIdx = 1;
    this._writeCount = 0;
    this._consecutiveErrors = 0;
    this.unregisterDisconnectHandler();
    this.setState('disconnected');
  }

  /** Close the USB connection */
  async close(): Promise<void> {
    if (!this.device) return;

    this.unregisterDisconnectHandler();

    try {
      await this.resetSID();
      await this.device.releaseInterface(this.interfaceNumber);
      await this.device.close();
    } catch (err) {
      console.warn('[USBSIDPico] Close error:', err);
    }

    this.device = null;
    this.interfaceNumber = -1;
    this.endpointOut = -1;
    this.endpointIn = -1;
    this._writeCount = 0;
    this._consecutiveErrors = 0;
    this.setState('disconnected');
    console.log('[USBSIDPico] Disconnected');
  }

  // ─── Low-level USB write ─────────────────────────────────

  /** Send raw bytes to the device. Auto-disconnects after 5 consecutive errors. */
  private async rawWrite(data: Uint8Array): Promise<void> {
    if (!this.device || this.endpointOut < 0) return;
    try {
      await this.device.transferOut(this.endpointOut, data);
      this._consecutiveErrors = 0;
    } catch (err) {
      this._consecutiveErrors++;
      if (this._consecutiveErrors >= 5) {
        console.error('[USBSIDPico] 5 consecutive write errors — disconnecting');
        this.handleDisconnect();
      } else {
        console.warn(`[USBSIDPico] Write error (${this._consecutiveErrors}/5):`, err);
      }
    }
  }

  // ─── Register Writes ─────────────────────────────────────

  /**
   * Calculate hardware register address for a given chip and register.
   * @param chip SID chip index (0-3)
   * @param reg SID register (0x00-0x18)
   */
  private chipAddr(chip: number, reg: number): number {
    return (chip * 0x20) | reg;
  }

  /**
   * Simple (non-cycled) register write. Adds to buffer, flushes when full.
   * @param chip SID chip index (0-3)
   * @param reg SID register (0x00-0x18)
   * @param value Register value (0x00-0xFF)
   * @param flush Force flush after this write
   */
  write(chip: number, reg: number, value: number, flush = false): void {
    this.backbuf[this.backbufIdx++] = this.chipAddr(chip, reg);
    this.backbuf[this.backbufIdx++] = value;
    this._writeCount++;

    if (this.backbufIdx >= MAX_WRITE_BUFFER || flush) {
      this.backbuf[0] = (WRITE << 6) | (this.backbufIdx - 1);
      this.rawWrite(this.backbuf.slice(0, this.backbufIdx));
      this.backbufIdx = 1;
    }
  }

  /**
   * Cycle-exact register write. Includes timing information so the Pico
   * firmware replays with accurate C64 cycle timing.
   * @param cycles Cycles since last write (0-65535)
   * @param chip SID chip index (0-3)
   * @param reg SID register (0x00-0x18)
   * @param value Register value (0x00-0xFF)
   */
  writeCycled(cycles: number, chip: number, reg: number, value: number): void {
    this.backbuf[this.backbufIdx++] = this.chipAddr(chip, reg);
    this.backbuf[this.backbufIdx++] = value;
    this.backbuf[this.backbufIdx++] = (cycles >> 8) & 0xFF;
    this.backbuf[this.backbufIdx++] = cycles & 0xFF;
    this._writeCount++;

    if (this.backbufIdx >= MAX_CYCLED_BUFFER) {
      this.backbuf[0] = (CYCLED_WRITE << 6) | (this.backbufIdx - 1);
      this.rawWrite(this.backbuf.slice(0, this.backbufIdx));
      this.backbufIdx = 1;
    }
  }

  /** Flush any buffered writes immediately */
  flush(): void {
    if (this.backbufIdx <= 1) return;

    const cmd = this.cycleExact ? CYCLED_WRITE : WRITE;
    this.backbuf[0] = (cmd << 6) | (this.backbufIdx - 1);
    this.rawWrite(this.backbuf.slice(0, this.backbufIdx));
    this.backbufIdx = 1;
  }

  // ─── Device Commands ─────────────────────────────────────

  /** Send a command to the device */
  private sendCommand(command: number): void {
    this.rawWrite(new Uint8Array([(COMMAND << 6) | command]));
  }

  /** Send a config command with optional parameters */
  private sendConfig(subCmd: number, a = 0, b = 0, c = 0, d = 0, e = 0): void {
    this.rawWrite(new Uint8Array([
      (COMMAND << 6) | CMD.CONFIG, subCmd, a, b, c, d, e,
    ]));
  }

  /** Reset all SID chips to silent state */
  async resetSID(): Promise<void> {
    this.flush();
    this.sendCommand(CMD.RESET_SID);
    await new Promise(r => setTimeout(r, 50));

    // Set volume to 0 on all chips
    for (const chip of [0, 1, 2, 3]) {
      this.write(chip, 0x18, 0, true);
    }
    await new Promise(r => setTimeout(r, 50));
    this.backbufIdx = 1;
  }

  /** Pause SID output */
  pause(): void { this.sendCommand(CMD.PAUSE); }

  /** Unpause SID output */
  unpause(): void { this.sendCommand(CMD.UNPAUSE); }

  /** Mute SID output */
  mute(): void { this.sendCommand(CMD.MUTE); }

  /** Unmute SID output */
  unmute(): void { this.sendCommand(CMD.UNMUTE); }

  /** Set the SID clock rate (PAL/NTSC/DREAN) */
  setClock(rate: ClockRateValue): void {
    this.sendConfig(CFG.SET_CLOCK, rate);
  }

  /** Set audio mode (mono/stereo) — v1.3+ boards only */
  setAudioMode(stereo: boolean): void {
    this.sendConfig(CFG.SET_AUDIO, stereo ? 1 : 0);
  }

  /** Toggle mono/stereo — v1.3+ boards only */
  toggleAudio(): void {
    this.sendConfig(CFG.TOGGLE_AUDIO);
  }

  /** Configure SID count on device */
  setSIDCount(count: 1 | 2 | 3 | 4): void {
    const map = {
      1: CFG.SINGLE_SID,
      2: CFG.DUAL_SID,
      3: CFG.TRIPLE_SID,
      4: CFG.QUAD_SID,
    };
    this.sendConfig(map[count]);
  }

  /** Request firmware version (result comes via IN endpoint) */
  requestVersion(): void {
    this.sendConfig(CFG.USBSID_VERSION);
  }

  /** Detect connected SID chips */
  detectSIDs(): void {
    this.sendConfig(CFG.DETECT_SIDS);
  }

  /**
   * Read a response from the device's IN endpoint.
   * Returns the raw response bytes, or null on timeout/error.
   */
  async readResponse(timeoutMs = 500): Promise<Uint8Array | null> {
    if (!this.device || this.endpointIn < 0) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const result = await this.device.transferIn(this.endpointIn, BUFFER_SIZE);
      clearTimeout(timer);
      if (result.data && result.data.byteLength > 0) {
        return new Uint8Array(result.data.buffer);
      }
    } catch {
      // Timeout or device error — expected when no response available
    }
    return null;
  }

  /**
   * Request and read firmware version string from the device.
   * Returns version string or null if not available.
   */
  async getFirmwareVersion(): Promise<string | null> {
    if (!this.isConnected) return null;
    this.sendConfig(CFG.USBSID_VERSION);
    await new Promise(r => setTimeout(r, 100));
    const resp = await this.readResponse(500);
    if (!resp || resp.length < 3) return null;
    // Parse version bytes — format: [cmd, major, minor, patch, ...]
    // Skip first byte (command echo), remaining are version data
    const chars: string[] = [];
    for (let i = 1; i < resp.length; i++) {
      if (resp[i] === 0) break;
      chars.push(String.fromCharCode(resp[i]));
    }
    return chars.length > 0 ? chars.join('') : null;
  }

  /**
   * Request and read SID chip detection results from the device.
   * Returns array of detected chip info, or null if not available.
   */
  async detectSIDChips(): Promise<Array<{ slot: number; detected: boolean; type?: string }> | null> {
    if (!this.isConnected) return null;
    this.sendConfig(CFG.DETECT_SIDS);
    await new Promise(r => setTimeout(r, 500)); // Detection takes time
    const resp = await this.readResponse(1000);
    if (!resp || resp.length < 2) return null;
    // Parse detection response — format varies by firmware
    // Common: [cmd, sid1_type, sid2_type, sid3_type, sid4_type]
    // type: 0=not detected, 1=6581, 2=8580
    const chipTypeNames: Record<number, string> = { 0: 'none', 1: '6581', 2: '8580' };
    const results: Array<{ slot: number; detected: boolean; type?: string }> = [];
    for (let i = 1; i < Math.min(resp.length, 5); i++) {
      const typeCode = resp[i];
      results.push({
        slot: i - 1,
        detected: typeCode > 0,
        type: chipTypeNames[typeCode] ?? `unknown(${typeCode})`,
      });
    }
    return results;
  }
}

// ─── Singleton ───────────────────────────────────────────

let instance: USBSIDPicoDevice | null = null;

export function getUSBSIDPico(): USBSIDPicoDevice {
  if (!instance) {
    instance = new USBSIDPicoDevice(true); // cycle-exact by default
  }
  return instance;
}
