/**
 * MIDIManager - Singleton for Web MIDI API device management
 *
 * Handles:
 * - Device discovery and enumeration
 * - Connection/disconnection events
 * - Message routing to registered handlers
 * - SysEx transmission
 */

import type { MIDIDeviceInfo, MIDIMessage, MIDIMessageHandler, MIDIMessageType } from './types';

class MIDIManager {
  private static instance: MIDIManager | null = null;

  // Web MIDI API access
  private midiAccess: MIDIAccess | null = null;

  // Device maps
  private inputs: Map<string, MIDIInput> = new Map();
  private outputs: Map<string, MIDIOutput> = new Map();

  // Selected devices
  private selectedInputId: string | null = null;
  private selectedOutputId: string | null = null;

  // Message handlers
  private messageHandlers: Set<MIDIMessageHandler> = new Set();

  // Device change callbacks
  private deviceChangeCallbacks: Set<() => void> = new Set();

  // Activity tracking
  private lastActivityTimestamp: number = 0;

  // Bound message handler reference for cleanup
  private boundMessageHandler: ((event: MIDIMessageEvent) => void) | null = null;

  // MIDI Clock sync state
  private clockTickCount: number = 0;
  private lastClockTimestamp: number = 0;
  private clockBPM: number = 0;
  private clockSyncEnabled: boolean = false;
  private clockSyncCallbacks: Set<(bpm: number) => void> = new Set();
  private transportCallbacks: Set<(command: 'start' | 'stop' | 'continue') => void> = new Set();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MIDIManager {
    if (!MIDIManager.instance) {
      MIDIManager.instance = new MIDIManager();
    }
    return MIDIManager.instance;
  }

  /**
   * Check if Web MIDI API is supported
   */
  isSupported(): boolean {
    return 'requestMIDIAccess' in navigator;
  }

  /**
   * Initialize MIDI access
   */
  async init(): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn('[MIDIManager] Web MIDI API not supported');
      return false;
    }

    try {
      // Request MIDI access with SysEx support
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });

      // Set up device tracking
      this.updateDevices();

      // Listen for device changes
      this.midiAccess.onstatechange = () => {
        this.updateDevices();
        this.notifyDeviceChange();
      };

      console.log('[MIDIManager] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[MIDIManager] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Update device maps from MIDI access
   */
  private updateDevices(): void {
    if (!this.midiAccess) return;

    // Clear existing
    this.inputs.clear();
    this.outputs.clear();

    // Populate inputs
    console.log('[MIDI] Available inputs:');
    this.midiAccess.inputs.forEach((input, id) => {
      console.log(`  - ${input.name} (${id}) state: ${input.state}, connection: ${input.connection}`);
      this.inputs.set(id, input);
    });

    // Populate outputs
    console.log('[MIDI] Available outputs:');
    this.midiAccess.outputs.forEach((output, id) => {
      console.log(`  - ${output.name} (${id})`);
      this.outputs.set(id, output);
    });

    // Auto-select TD-3 if available and nothing selected
    if (!this.selectedInputId) {
      const td3Input = this.detectTD3Devices().input;
      if (td3Input) {
        this.selectInput(td3Input.id);
      }
    }

    if (!this.selectedOutputId) {
      const td3Output = this.detectTD3Devices().output;
      if (td3Output) {
        this.selectOutput(td3Output.id);
      }
    }
  }

  /**
   * Convert MIDIPort to MIDIDeviceInfo
   */
  private portToDeviceInfo(port: MIDIPort, type: 'input' | 'output'): MIDIDeviceInfo {
    const name = port.name || 'Unknown Device';
    const manufacturer = port.manufacturer || '';

    return {
      id: port.id,
      name,
      manufacturer,
      type,
      isConnected: port.connection === 'open' || port.state === 'connected',
      isTD3: this.isTD3Device(name, manufacturer),
    };
  }

  /**
   * Check if device is a TD-3
   */
  private isTD3Device(name: string, manufacturer: string): boolean {
    const lowerName = name.toLowerCase();
    const lowerMfr = manufacturer.toLowerCase();

    return (
      lowerName.includes('td-3') ||
      lowerName.includes('td3') ||
      (lowerMfr.includes('behringer') && lowerName.includes('303'))
    );
  }

  /**
   * Get all input devices
   */
  getInputDevices(): MIDIDeviceInfo[] {
    const devices: MIDIDeviceInfo[] = [];
    this.inputs.forEach((input) => {
      devices.push(this.portToDeviceInfo(input, 'input'));
    });
    // Sort with TD-3 first
    return devices.sort((a, b) => {
      if (a.isTD3 && !b.isTD3) return -1;
      if (!a.isTD3 && b.isTD3) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get all output devices
   */
  getOutputDevices(): MIDIDeviceInfo[] {
    const devices: MIDIDeviceInfo[] = [];
    this.outputs.forEach((output) => {
      devices.push(this.portToDeviceInfo(output, 'output'));
    });
    // Sort with TD-3 first
    return devices.sort((a, b) => {
      if (a.isTD3 && !b.isTD3) return -1;
      if (!a.isTD3 && b.isTD3) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Auto-detect TD-3 devices
   */
  detectTD3Devices(): { input: MIDIDeviceInfo | null; output: MIDIDeviceInfo | null } {
    const inputs = this.getInputDevices();
    const outputs = this.getOutputDevices();

    return {
      input: inputs.find((d) => d.isTD3) || null,
      output: outputs.find((d) => d.isTD3) || null,
    };
  }

  /**
   * Select input device
   */
  async selectInput(deviceId: string | null): Promise<void> {
    // Disconnect from previous input
    if (this.selectedInputId) {
      const prevInput = this.inputs.get(this.selectedInputId);
      if (prevInput) {
        prevInput.onmidimessage = null;
        if (this.boundMessageHandler) {
          prevInput.removeEventListener('midimessage', this.boundMessageHandler as EventListener);
        }
        try {
          await prevInput.close();
        } catch {
          // Ignore close errors
        }
      }
    }

    this.selectedInputId = deviceId;

    // Connect to new input
    if (deviceId) {
      const input = this.inputs.get(deviceId);
      if (input) {
        try {
          // Explicitly open the port first
          await input.open();
          console.log(`[MIDI] Input opened: ${input.name} (state: ${input.state}, connection: ${input.connection})`);

          // Attach message handler using both methods for compatibility
          this.boundMessageHandler = this.handleMIDIMessage.bind(this);
          input.onmidimessage = this.boundMessageHandler;
          input.addEventListener('midimessage', this.boundMessageHandler as EventListener);

          console.log(`[MIDI] Handler attached to ${input.name}`);
        } catch (error) {
          console.error(`[MIDI] Failed to open input ${input.name}:`, error);
        }
      }
    }
  }

  /**
   * Select output device
   */
  selectOutput(deviceId: string | null): void {
    this.selectedOutputId = deviceId;

    if (deviceId) {
      const output = this.outputs.get(deviceId);
      if (output) {
        console.log(`[MIDIManager] Selected output: ${output.name}`);
      }
    }
  }

  /**
   * Get selected input device info
   */
  getSelectedInput(): MIDIDeviceInfo | null {
    if (!this.selectedInputId) return null;
    const input = this.inputs.get(this.selectedInputId);
    if (!input) return null;
    return this.portToDeviceInfo(input, 'input');
  }

  /**
   * Get selected output device info
   */
  getSelectedOutput(): MIDIDeviceInfo | null {
    if (!this.selectedOutputId) return null;
    const output = this.outputs.get(this.selectedOutputId);
    if (!output) return null;
    return this.portToDeviceInfo(output, 'output');
  }

  /**
   * Handle incoming MIDI message
   */
  private handleMIDIMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length === 0) return;

    const statusByte = data[0];

    // Skip verbose logging for clock messages (they come 24 times per beat)
    if (statusByte !== 0xf8) {
      // Log with hex values for easier debugging
      const hexBytes = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const msgType = data[0] >= 0xF0 ? 'SysEx/System' :
                      (data[0] & 0xF0) === 0xB0 ? 'CC' :
                      (data[0] & 0xF0) === 0x90 ? 'NoteOn' :
                      (data[0] & 0xF0) === 0x80 ? 'NoteOff' :
                      (data[0] & 0xF0) === 0xE0 ? 'PitchBend' :
                      (data[0] & 0xF0) === 0xC0 ? 'ProgChange' : 'Other';
      console.log(`[MIDI ${msgType}] ${hexBytes} (${data.length} bytes)`);
    }

    this.lastActivityTimestamp = Date.now();

    const message = this.parseMIDIMessage(statusByte, data, event.timeStamp);

    // Handle MIDI clock sync internally
    if (this.clockSyncEnabled) {
      if (message.type === 'clock') {
        this.processClockTick(event.timeStamp);
      } else if (message.type === 'start' || message.type === 'stop' || message.type === 'continue') {
        this.processTransportCommand(message.type);
      }
    }

    // Log parsed messages (except clock which is too frequent)
    if (message.type === 'cc') {
      console.log(`[MIDI] CC ${message.cc} = ${message.value} (ch ${message.channel})`);
    } else if (message.type === 'noteOn') {
      console.log(`[MIDI] Note ON ${message.note} vel ${message.velocity} (ch ${message.channel})`);
    } else if (message.type === 'noteOff') {
      console.log(`[MIDI] Note OFF ${message.note} (ch ${message.channel})`);
    } else if (message.type === 'pitchBend') {
      console.log(`[MIDI] Pitch Bend ${message.pitchBend} (ch ${message.channel})`);
    } else if (message.type === 'programChange') {
      console.log(`[MIDI] Program Change ${message.program} (ch ${message.channel})`);
    }

    // Dispatch to all handlers
    this.messageHandlers.forEach((handler) => {
      try {
        handler(message, this.selectedInputId || '');
      } catch (error) {
        console.error('[MIDIManager] Handler error:', error);
      }
    });
  }

  /**
   * Process MIDI clock tick for BPM calculation
   * MIDI clock sends 24 pulses per quarter note (24 PPQ)
   */
  private processClockTick(timestamp: number): void {
    this.clockTickCount++;

    if (this.lastClockTimestamp > 0) {
      const deltaMs = timestamp - this.lastClockTimestamp;

      // Calculate BPM from the delta (24 ticks per beat)
      // BPM = 60000 / (deltaMs * 24) = 2500 / deltaMs
      if (deltaMs > 0) {
        const instantBPM = 2500 / deltaMs;

        // Use exponential moving average for smoother BPM
        if (this.clockBPM === 0) {
          this.clockBPM = instantBPM;
        } else {
          this.clockBPM = this.clockBPM * 0.9 + instantBPM * 0.1;
        }

        // Notify callbacks every 24 ticks (once per beat) to reduce overhead
        if (this.clockTickCount % 24 === 0) {
          const roundedBPM = Math.round(this.clockBPM * 10) / 10;
          this.clockSyncCallbacks.forEach((callback) => {
            try {
              callback(roundedBPM);
            } catch (error) {
              console.error('[MIDIManager] Clock sync callback error:', error);
            }
          });
        }
      }
    }

    this.lastClockTimestamp = timestamp;
  }

  /**
   * Process transport command (start/stop/continue)
   */
  private processTransportCommand(command: 'start' | 'stop' | 'continue'): void {
    console.log(`[MIDI] Transport: ${command}`);

    // Reset clock on start
    if (command === 'start') {
      this.clockTickCount = 0;
      this.lastClockTimestamp = 0;
    }

    this.transportCallbacks.forEach((callback) => {
      try {
        callback(command);
      } catch (error) {
        console.error('[MIDIManager] Transport callback error:', error);
      }
    });
  }

  /**
   * Parse raw MIDI data into structured message
   */
  private parseMIDIMessage(statusByte: number, data: Uint8Array, timestamp: number): MIDIMessage {
    let type: MIDIMessageType = 'other';
    let channel: number;
    let note: number | undefined;
    let velocity: number | undefined;
    let cc: number | undefined;
    let value: number | undefined;
    let pitchBend: number | undefined;
    let program: number | undefined;

    // System messages (0xF0-0xFF) don't have a channel
    if (statusByte >= 0xf0) {
      channel = -1; // No channel for system messages

      switch (statusByte) {
        case 0xf0: // SysEx start
          type = 'sysex';
          break;
        case 0xf8: // Clock (24 PPQ timing tick)
          type = 'clock';
          break;
        case 0xfa: // Start
          type = 'start';
          break;
        case 0xfb: // Continue
          type = 'continue';
          break;
        case 0xfc: // Stop
          type = 'stop';
          break;
        // Other system messages: 0xF1-0xF7, 0xF9, 0xFD-0xFF
        default:
          type = 'other';
          break;
      }
    } else {
      // Channel messages (0x80-0xEF)
      const messageType = statusByte & 0xf0;
      channel = statusByte & 0x0f;

      switch (messageType) {
        case 0x90: // Note On
          type = 'noteOn';
          note = data[1];
          velocity = data[2];
          // Note On with velocity 0 is actually Note Off
          if (velocity === 0) {
            type = 'noteOff';
          }
          break;

        case 0x80: // Note Off
          type = 'noteOff';
          note = data[1];
          velocity = data[2];
          break;

        case 0xb0: // Control Change
          type = 'cc';
          cc = data[1];
          value = data[2];
          break;

        case 0xc0: // Program Change
          type = 'programChange';
          program = data[1];
          break;

        case 0xe0: // Pitch Bend
          type = 'pitchBend';
          // Pitch bend is 14-bit: LSB in data[1], MSB in data[2]
          // Result is -8192 to 8191 (center = 0)
          pitchBend = ((data[2] << 7) | data[1]) - 8192;
          break;

        default:
          type = 'other';
          break;
      }
    }

    return {
      type,
      channel,
      data,
      timestamp,
      note,
      velocity,
      cc,
      value,
      pitchBend,
      program,
    };
  }

  /**
   * Add message handler
   */
  addMessageHandler(handler: MIDIMessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Remove message handler
   */
  removeMessageHandler(handler: MIDIMessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Send CC message
   */
  sendCC(channel: number, cc: number, value: number): void {
    if (!this.selectedOutputId) return;

    const output = this.outputs.get(this.selectedOutputId);
    if (!output) return;

    const message = new Uint8Array([0xb0 | (channel & 0x0f), cc & 0x7f, value & 0x7f]);
    output.send(message);
  }

  /**
   * Send SysEx message
   */
  sendSysEx(data: Uint8Array): void {
    if (!this.selectedOutputId) {
      console.warn('[MIDIManager] No output device selected for SysEx');
      return;
    }

    const output = this.outputs.get(this.selectedOutputId);
    if (!output) {
      console.warn('[MIDIManager] Output device not found');
      return;
    }

    try {
      output.send(data);
      console.log('[MIDIManager] SysEx sent:', data.length, 'bytes');
    } catch (error) {
      console.error('[MIDIManager] Failed to send SysEx:', error);
      throw error;
    }
  }

  /**
   * Send Note On
   */
  sendNoteOn(channel: number, note: number, velocity: number): void {
    if (!this.selectedOutputId) return;

    const output = this.outputs.get(this.selectedOutputId);
    if (!output) return;

    const message = new Uint8Array([0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f]);
    output.send(message);
  }

  /**
   * Send Note Off
   */
  sendNoteOff(channel: number, note: number): void {
    if (!this.selectedOutputId) return;

    const output = this.outputs.get(this.selectedOutputId);
    if (!output) return;

    const message = new Uint8Array([0x80 | (channel & 0x0f), note & 0x7f, 0]);
    output.send(message);
  }

  /**
   * Send Pitch Bend
   * @param channel MIDI channel (0-15)
   * @param value Pitch bend value (-8192 to 8191, 0 = center)
   */
  sendPitchBend(channel: number, value: number): void {
    if (!this.selectedOutputId) return;

    const output = this.outputs.get(this.selectedOutputId);
    if (!output) return;

    // Convert from -8192..8191 to 0..16383
    const bendValue = Math.max(0, Math.min(16383, value + 8192));
    const lsb = bendValue & 0x7f;
    const msb = (bendValue >> 7) & 0x7f;

    const message = new Uint8Array([0xe0 | (channel & 0x0f), lsb, msb]);
    output.send(message);
  }

  /**
   * Send Program Change
   * @param channel MIDI channel (0-15)
   * @param program Program number (0-127)
   */
  sendProgramChange(channel: number, program: number): void {
    if (!this.selectedOutputId) return;

    const output = this.outputs.get(this.selectedOutputId);
    if (!output) return;

    const message = new Uint8Array([0xc0 | (channel & 0x0f), program & 0x7f]);
    output.send(message);
  }

  // ============================================================================
  // MIDI CLOCK SYNC
  // ============================================================================

  /**
   * Enable or disable MIDI clock sync
   */
  setClockSyncEnabled(enabled: boolean): void {
    this.clockSyncEnabled = enabled;
    if (!enabled) {
      this.clockTickCount = 0;
      this.lastClockTimestamp = 0;
      this.clockBPM = 0;
    }
    console.log(`[MIDIManager] Clock sync ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if clock sync is enabled
   */
  isClockSyncEnabled(): boolean {
    return this.clockSyncEnabled;
  }

  /**
   * Get current BPM from MIDI clock
   */
  getClockBPM(): number {
    return Math.round(this.clockBPM * 10) / 10;
  }

  /**
   * Subscribe to clock BPM updates
   * Callback is called once per beat with the current BPM
   */
  onClockSync(callback: (bpm: number) => void): () => void {
    this.clockSyncCallbacks.add(callback);
    return () => {
      this.clockSyncCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to transport commands (start/stop/continue)
   */
  onTransportCommand(callback: (command: 'start' | 'stop' | 'continue') => void): () => void {
    this.transportCallbacks.add(callback);
    return () => {
      this.transportCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to device changes
   */
  onDeviceChange(callback: () => void): () => void {
    this.deviceChangeCallbacks.add(callback);
    return () => {
      this.deviceChangeCallbacks.delete(callback);
    };
  }

  /**
   * Notify all device change subscribers
   */
  private notifyDeviceChange(): void {
    this.deviceChangeCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[MIDIManager] Device change callback error:', error);
      }
    });
  }

  /**
   * Get last activity timestamp
   */
  getLastActivityTimestamp(): number {
    return this.lastActivityTimestamp;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.midiAccess !== null;
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    // Clear state change handler
    if (this.midiAccess) {
      this.midiAccess.onstatechange = null;
    }

    // Disconnect from all inputs
    this.inputs.forEach((input) => {
      input.onmidimessage = null;
    });

    this.inputs.clear();
    this.outputs.clear();
    this.messageHandlers.clear();
    this.deviceChangeCallbacks.clear();
    this.clockSyncCallbacks.clear();
    this.transportCallbacks.clear();
    this.selectedInputId = null;
    this.selectedOutputId = null;
    this.midiAccess = null;
    this.clockSyncEnabled = false;
    this.clockBPM = 0;
    this.clockTickCount = 0;
    this.lastClockTimestamp = 0;
  }
}

// Export singleton getter
export function getMIDIManager(): MIDIManager {
  return MIDIManager.getInstance();
}

export { MIDIManager };
