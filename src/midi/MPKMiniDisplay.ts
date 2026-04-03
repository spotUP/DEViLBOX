/**
 * MPKMiniDisplay - Control the OLED display on Akai MPK Mini MK3
 *
 * Updates knob names via SysEx so the display shows parameter names
 * when knobs are turned.
 *
 * SysEx Protocol based on: https://github.com/tsmetana/mpk3-settings
 */

import { getMIDIManager } from './MIDIManager';

// SysEx constants
const SYSEX_START = 0xF0;
const SYSEX_END = 0xF7;
const MANUFACTURER_ID = 0x47;  // Akai
const PRODUCT_ID = 0x49;       // MPK Mini MK3
const DIRECTION_SEND = 0x7F;
const CMD_WRITE = 0x64;

// Program 0 = RAM (temporary, shown immediately)
const PGM_NUM_RAM = 0x00;

// Knob offsets in the SysEx message (from start of data payload)
const KNOB_OFFSETS = {
  1: { mode: 92, cc: 93, min: 94, max: 95, name: 96 },
  2: { mode: 112, cc: 113, min: 114, max: 115, name: 116 },
  3: { mode: 132, cc: 133, min: 134, max: 135, name: 136 },
  4: { mode: 152, cc: 153, min: 154, max: 155, name: 156 },
  5: { mode: 172, cc: 173, min: 174, max: 175, name: 176 },
  6: { mode: 192, cc: 193, min: 194, max: 195, name: 196 },
  7: { mode: 212, cc: 213, min: 214, max: 215, name: 216 },
  8: { mode: 232, cc: 233, min: 234, max: 235, name: 236 },
};

const KNOB_NAME_LENGTH = 16;
const DATA_PAYLOAD_LENGTH = 246;

// Default program template (minimal valid configuration)
const DEFAULT_PROGRAM_NAME = 'DEViLBOX       ';  // 16 chars

interface KnobConfig {
  name: string;
  cc: number;
  min?: number;
  max?: number;
  mode?: 'absolute' | 'relative';
}

class MPKMiniDisplay {
  private static instance: MPKMiniDisplay | null = null;
  private currentPreset: Uint8Array | null = null;
  private deviceName: string | null = null;

  // Pad LED state
  private readonly padNotes = [36, 37, 38, 39, 40, 41, 42, 43]; // Bank A: C2-G#2
  private padFlashTimers: (ReturnType<typeof setTimeout> | null)[] = new Array(8).fill(null);

  // OLED display debounce
  private lastDisplayUpdate = 0;
  private displayDebounceMs = 250; // max 4 updates/sec

  private constructor() {}

  static getInstance(): MPKMiniDisplay {
    if (!MPKMiniDisplay.instance) {
      MPKMiniDisplay.instance = new MPKMiniDisplay();
    }
    return MPKMiniDisplay.instance;
  }

  /**
   * Check if an MPK Mini MK3 is connected
   */
  checkConnection(): boolean {
    const midiManager = getMIDIManager();
    const devices = midiManager.getInputDevices();

    for (const device of devices) {
      const name = device.name?.toLowerCase() || '';
      if (name.includes('mpk mini') || name.includes('mpkmini')) {
        this.deviceName = device.name || 'MPK Mini';
        return true;
      }
    }

    this.deviceName = null;
    return false;
  }

  /**
   * Get the detected device name
   */
  getDeviceName(): string | null {
    return this.deviceName;
  }

  /**
   * Create a default preset template
   */
  private createDefaultPreset(): Uint8Array {
    const data = new Uint8Array(DATA_PAYLOAD_LENGTH);

    // Program number (RAM = 0)
    data[0] = PGM_NUM_RAM;

    // Program name (16 bytes)
    const nameBytes = this.stringToBytes(DEFAULT_PROGRAM_NAME, 16);
    data.set(nameBytes, 1);

    // Set some sensible defaults for other settings
    data[17] = 0;   // Pad MIDI channel
    data[18] = 0;   // Aftertouch off
    data[19] = 0;   // Keybed channel
    data[20] = 4;   // Keybed octave (C4)

    // Initialize all 8 knobs with default names
    for (let i = 1; i <= 8; i++) {
      const offset = KNOB_OFFSETS[i as keyof typeof KNOB_OFFSETS];
      data[offset.mode - 7] = 0;      // Absolute mode
      data[offset.cc - 7] = 70 + i - 1;  // CC 70-77
      data[offset.min - 7] = 0;       // Min 0
      data[offset.max - 7] = 127;     // Max 127

      // Default name
      const name = `Knob ${i}        `;  // Pad to 16 chars
      const nameBytes = this.stringToBytes(name, KNOB_NAME_LENGTH);
      data.set(nameBytes, offset.name - 7);
    }

    return data;
  }

  /**
   * Convert a string to fixed-length byte array
   */
  private stringToBytes(str: string, length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      if (i < str.length) {
        // Only use ASCII characters (0-127)
        bytes[i] = Math.min(127, str.charCodeAt(i));
      } else {
        bytes[i] = 0x20;  // Space padding
      }
    }
    return bytes;
  }

  /**
   * Build a complete SysEx message
   */
  private buildSysExMessage(data: Uint8Array): Uint8Array {
    // Calculate message length (two 7-bit values)
    const payloadLen = data.length;
    const lenHigh = (payloadLen >> 7) & 0x7F;
    const lenLow = payloadLen & 0x7F;

    const message = new Uint8Array(7 + data.length + 1);
    message[0] = SYSEX_START;
    message[1] = MANUFACTURER_ID;
    message[2] = DIRECTION_SEND;
    message[3] = PRODUCT_ID;
    message[4] = CMD_WRITE;
    message[5] = lenHigh;
    message[6] = lenLow;
    message.set(data, 7);
    message[message.length - 1] = SYSEX_END;

    return message;
  }

  /**
   * Find the MPK Mini output device ID
   */
  private findMPKMiniOutputId(): string | null {
    const midiManager = getMIDIManager();
    const outputs = midiManager.getOutputDevices();

    for (const output of outputs) {
      const name = output.name?.toLowerCase() || '';
      if (name.includes('mpk mini') || name.includes('mpkmini')) {
        return output.id;
      }
    }
    return null;
  }

  /**
   * Send SysEx message to the MPK Mini
   */
  private async sendSysEx(message: Uint8Array): Promise<boolean> {
    const midiManager = getMIDIManager();

    // Find MPK Mini output device ID
    const mpkOutputId = this.findMPKMiniOutputId();
    if (!mpkOutputId) {
      console.warn('[MPKMiniDisplay] No MPK Mini output device found');
      return false;
    }

    // Get current selected output to restore later
    const currentOutput = midiManager.getSelectedOutput();
    const previousOutputId = currentOutput?.id || null;

    try {
      // Select MPK Mini as output
      midiManager.selectOutput(mpkOutputId);

      // Send the SysEx message
      midiManager.sendSysEx(message);

      console.log('[MPKMiniDisplay] SysEx message sent successfully');

      // Restore previous output if different
      if (previousOutputId && previousOutputId !== mpkOutputId) {
        midiManager.selectOutput(previousOutputId);
      }

      return true;
    } catch (error) {
      console.error('[MPKMiniDisplay] Failed to send SysEx:', error);

      // Try to restore previous output
      if (previousOutputId) {
        try {
          midiManager.selectOutput(previousOutputId);
        } catch {
          // Ignore restore errors
        }
      }

      return false;
    }
  }

  /**
   * Update a single knob's display name
   */
  async setKnobName(knobNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, name: string): Promise<boolean> {
    if (!this.checkConnection()) {
      console.warn('[MPKMiniDisplay] MPK Mini not connected');
      return false;
    }

    // Initialize preset if needed
    if (!this.currentPreset) {
      this.currentPreset = this.createDefaultPreset();
    }

    // Update knob name in preset
    const offset = KNOB_OFFSETS[knobNumber];
    const nameBytes = this.stringToBytes(name, KNOB_NAME_LENGTH);
    this.currentPreset.set(nameBytes, offset.name - 7);

    // Send the updated preset
    const sysex = this.buildSysExMessage(this.currentPreset);
    return this.sendSysEx(sysex);
  }

  /**
   * Update multiple knobs at once
   */
  async setKnobNames(knobs: Record<number, string>): Promise<boolean> {
    if (!this.checkConnection()) {
      console.warn('[MPKMiniDisplay] MPK Mini not connected');
      return false;
    }

    // Initialize preset if needed
    if (!this.currentPreset) {
      this.currentPreset = this.createDefaultPreset();
    }

    // Update all specified knob names
    for (const [knobNum, name] of Object.entries(knobs)) {
      const num = parseInt(knobNum) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
      if (num >= 1 && num <= 8) {
        const offset = KNOB_OFFSETS[num];
        const nameBytes = this.stringToBytes(name, KNOB_NAME_LENGTH);
        this.currentPreset.set(nameBytes, offset.name - 7);
      }
    }

    // Send the updated preset
    const sysex = this.buildSysExMessage(this.currentPreset);
    return this.sendSysEx(sysex);
  }

  /**
   * Set knob configuration including CC number and name
   */
  async setKnobConfig(knobNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, config: KnobConfig): Promise<boolean> {
    if (!this.checkConnection()) {
      console.warn('[MPKMiniDisplay] MPK Mini not connected');
      return false;
    }

    // Initialize preset if needed
    if (!this.currentPreset) {
      this.currentPreset = this.createDefaultPreset();
    }

    const offset = KNOB_OFFSETS[knobNumber];

    // Update knob settings
    if (config.mode !== undefined) {
      this.currentPreset[offset.mode - 7] = config.mode === 'relative' ? 1 : 0;
    }
    if (config.cc !== undefined) {
      this.currentPreset[offset.cc - 7] = config.cc & 0x7F;
    }
    if (config.min !== undefined) {
      this.currentPreset[offset.min - 7] = config.min & 0x7F;
    }
    if (config.max !== undefined) {
      this.currentPreset[offset.max - 7] = config.max & 0x7F;
    }

    // Update name
    const nameBytes = this.stringToBytes(config.name, KNOB_NAME_LENGTH);
    this.currentPreset.set(nameBytes, offset.name - 7);

    // Send the updated preset
    const sysex = this.buildSysExMessage(this.currentPreset);
    return this.sendSysEx(sysex);
  }

  // ===========================================================================
  // Pad LED Feedback
  // ===========================================================================

  /**
   * Send raw MIDI data directly to the MPK Mini output device
   * (bypasses the selected output to avoid disrupting other MIDI routing)
   */
  private sendToMPK(channel: number, note: number, velocity: number): void {
    const mpkOutputId = this.findMPKMiniOutputId();
    if (!mpkOutputId) return;
    const midiManager = getMIDIManager();
    midiManager.sendRawToDevice(
      mpkOutputId,
      new Uint8Array([0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f])
    );
  }

  /**
   * Turn a pad LED on or off (pad index 0-7)
   */
  setPadLED(padIndex: number, on: boolean): void {
    if (padIndex < 0 || padIndex > 7) return;
    const note = this.padNotes[padIndex];
    this.sendToMPK(0, note, on ? 127 : 0);
  }

  /**
   * Flash a pad LED briefly then turn it off
   */
  flashPad(padIndex: number, durationMs = 100): void {
    if (padIndex < 0 || padIndex > 7) return;
    // Clear any existing flash timer for this pad
    if (this.padFlashTimers[padIndex] !== null) {
      clearTimeout(this.padFlashTimers[padIndex]!);
    }
    this.setPadLED(padIndex, true);
    this.padFlashTimers[padIndex] = setTimeout(() => {
      this.setPadLED(padIndex, false);
      this.padFlashTimers[padIndex] = null;
    }, durationMs);
  }

  /**
   * Turn off all pad LEDs
   */
  clearAllPadLEDs(): void {
    for (let i = 0; i < 8; i++) {
      if (this.padFlashTimers[i] !== null) {
        clearTimeout(this.padFlashTimers[i]!);
        this.padFlashTimers[i] = null;
      }
      this.setPadLED(i, false);
    }
  }

  // ===========================================================================
  // OLED Display Enhancement
  // ===========================================================================

  /**
   * Update the OLED display with status info (debounced to max 4 updates/sec)
   * Format: "DVB 140 ACID   " — 16 chars max
   */
  async updateStatusDisplay(bpm: number, bankName: string, instrumentName?: string): Promise<void> {
    const now = Date.now();
    if (now - this.lastDisplayUpdate < this.displayDebounceMs) return;
    this.lastDisplayUpdate = now;

    const bpmStr = Math.round(bpm).toString();
    const label = instrumentName ? instrumentName.slice(0, 8) : bankName.slice(0, 8);
    const display = `DVB ${bpmStr} ${label}`.slice(0, 16).padEnd(16);

    await this.sendMPKLCDDisplay(display);
  }

  /**
   * Update the program name on the OLED display
   */
  async sendMPKLCDDisplay(text: string): Promise<boolean> {
    if (!this.currentPreset) {
      this.currentPreset = this.createDefaultPreset();
    }

    const nameBytes = this.stringToBytes(text, 16);
    this.currentPreset.set(nameBytes, 1); // offset 1 = program name

    const sysex = this.buildSysExMessage(this.currentPreset);
    return this.sendSysEx(sysex);
  }

  /**
   * Apply DEViLBOX default knob mapping for TB-303 control
   */
  async applyDEViLBOXPreset(): Promise<boolean> {
    const knobs: Record<number, string> = {
      1: 'Cutoff',
      2: 'Resonance',
      3: 'Env Mod',
      4: 'Decay',
      5: 'Accent',
      6: 'Overdrive',
      7: 'Slide Time',
      8: 'Filter FM',
    };

    return this.setKnobNames(knobs);
  }

  /**
   * Reset all knob names to defaults
   */
  async resetKnobNames(): Promise<boolean> {
    this.currentPreset = this.createDefaultPreset();
    const sysex = this.buildSysExMessage(this.currentPreset);
    return this.sendSysEx(sysex);
  }
}

// Export singleton getter
export function getMPKMiniDisplay(): MPKMiniDisplay {
  return MPKMiniDisplay.getInstance();
}

export { MPKMiniDisplay };
