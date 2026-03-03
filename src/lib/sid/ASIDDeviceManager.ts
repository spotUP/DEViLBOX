/**
 * ASIDDeviceManager.ts
 * 
 * Manages ASID-compatible MIDI devices for SID hardware playback.
 * Handles device detection, selection, connection state, and error recovery.
 */

import { isASIDDevice } from './ASIDProtocol';

export interface ASIDDeviceInfo {
  id: string;
  name: string;
  manufacturer?: string;
  state: 'connected' | 'disconnected';
  port: MIDIOutput;
}

export interface ASIDManagerState {
  devices: ASIDDeviceInfo[];
  selectedDevice: ASIDDeviceInfo | null;
  isSupported: boolean;
  lastError: string | null;
}

type StateChangeCallback = (state: ASIDManagerState) => void;

/**
 * Singleton manager for ASID MIDI devices
 */
class ASIDDeviceManager {
  private midiAccess: MIDIAccess | null = null;
  private devices: Map<string, ASIDDeviceInfo> = new Map();
  private selectedDeviceId: string | null = null;
  private listeners: Set<StateChangeCallback> = new Set();
  private isInitialized = false;

  /**
   * Initialize ASID device manager and request MIDI access
   */
  async init(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    // Check Web MIDI API support
    if (!navigator.requestMIDIAccess) {
      console.warn('[ASID] Web MIDI API not supported in this browser');
      this.notifyListeners({ lastError: 'Web MIDI API not supported' });
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      
      // Set up listeners for device connect/disconnect
      this.midiAccess.onstatechange = this.handleStateChange.bind(this);
      
      // Scan for existing devices
      this.scanDevices();
      
      this.isInitialized = true;
      console.log('[ASID] Device manager initialized');
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to request MIDI access';
      console.error('[ASID] Initialization failed:', err);
      this.notifyListeners({ lastError: errorMsg });
      return false;
    }
  }

  /**
   * Scan for ASID-compatible MIDI output devices
   */
  private scanDevices(): void {
    if (!this.midiAccess) return;

    this.devices.clear();

    for (const output of this.midiAccess.outputs.values()) {
      // Only include devices that appear to be ASID-compatible
      if (isASIDDevice(output)) {
        const info: ASIDDeviceInfo = {
          id: output.id,
          name: output.name || 'Unknown ASID Device',
          manufacturer: output.manufacturer || undefined,
          state: output.state,
          port: output,
        };
        this.devices.set(output.id, info);
        console.log('[ASID] Detected device:', info.name);
      }
    }

    // If we had a selected device and it's gone, clear selection
    if (this.selectedDeviceId && !this.devices.has(this.selectedDeviceId)) {
      console.warn('[ASID] Previously selected device disconnected');
      this.selectedDeviceId = null;
    }

    this.notifyListeners();
  }

  /**
   * Handle MIDI device state changes (connect/disconnect)
   */
  private handleStateChange(event: MIDIConnectionEvent): void {
    const port = event.port;
    
    if (port && port.type === 'output') {
      console.log(`[ASID] Device ${port.state}:`, port.name || 'Unknown');
      this.scanDevices();
    }
  }

  /**
   * Get list of available ASID devices
   */
  getDevices(): ASIDDeviceInfo[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get currently selected device
   */
  getSelectedDevice(): ASIDDeviceInfo | null {
    if (!this.selectedDeviceId) return null;
    return this.devices.get(this.selectedDeviceId) || null;
  }

  /**
   * Select an ASID device by ID
   */
  selectDevice(deviceId: string | null): boolean {
    if (deviceId === null) {
      this.selectedDeviceId = null;
      console.log('[ASID] Device selection cleared');
      this.notifyListeners();
      return true;
    }

    const device = this.devices.get(deviceId);
    if (!device) {
      console.error('[ASID] Device not found:', deviceId);
      this.notifyListeners({ lastError: `Device not found: ${deviceId}` });
      return false;
    }

    if (device.state !== 'connected') {
      console.error('[ASID] Device is not connected:', device.name);
      this.notifyListeners({ lastError: `Device not connected: ${device.name}` });
      return false;
    }

    this.selectedDeviceId = deviceId;
    console.log('[ASID] Selected device:', device.name);
    this.notifyListeners();
    return true;
  }

  /**
   * Check if an ASID device is currently selected and connected
   */
  isDeviceReady(): boolean {
    const device = this.getSelectedDevice();
    return device !== null && device.state === 'connected';
  }

  /**
   * Get the MIDI output port for the selected device
   */
  getSelectedPort(): MIDIOutput | null {
    const device = this.getSelectedDevice();
    return device?.port || null;
  }

  /**
   * Register a callback for state changes
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    // Return unsubscribe function
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(partial?: Partial<ASIDManagerState>): void {
    const state: ASIDManagerState = {
      devices: this.getDevices(),
      selectedDevice: this.getSelectedDevice(),
      isSupported: !!this.midiAccess,
      lastError: partial?.lastError || null,
    };

    this.listeners.forEach(listener => listener(state));
  }

  /**
   * Reset manager state (for cleanup)
   */
  reset(): void {
    this.selectedDeviceId = null;
    this.devices.clear();
    this.listeners.clear();
    
    if (this.midiAccess) {
      this.midiAccess.onstatechange = null;
      this.midiAccess = null;
    }
    
    this.isInitialized = false;
    console.log('[ASID] Device manager reset');
  }
}

// Singleton instance
let instance: ASIDDeviceManager | null = null;

/**
 * Get the singleton ASID device manager instance
 */
export function getASIDDeviceManager(): ASIDDeviceManager {
  if (!instance) {
    instance = new ASIDDeviceManager();
  }
  return instance;
}

/**
 * Check if ASID hardware support is available in this browser
 */
export function isASIDSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}
