/**
 * NKS Hardware Controller Integration
 * 
 * Bridges NKSManager state with HID protocol for real hardware control
 */

import { NKSHIDProtocol, NKS_BUTTONS, isHIDSupported } from './NKSHIDProtocol';
import { useNKSStore } from './NKSManager';
import type { NKSControllerInfo, NKSKeyLight } from './types';
import { sendMPKLCDDisplay, syncNKSLightsToPads } from './AkaiMIDIProtocol';

/**
 * Hardware controller manager
 */
export class NKSHardwareController {
  public protocol: NKSHIDProtocol;
  private updateInterval: number | null = null;
  private lightGuideEnabled = true;
  private isAkaiDevice = false;
  
  constructor() {
    this.protocol = new NKSHIDProtocol();
    
    // Set up protocol callbacks
    this.protocol.onKnobChanged((index, value) => {
      this.handleKnobChange(index, value);
    });
    
    this.protocol.onButtonPressed((buttonId) => {
      this.handleButtonPress(buttonId);
    });
  }
  
  /**
   * Request and connect to hardware (requires user gesture)
   */
  async requestConnection(): Promise<boolean> {
    if (!isHIDSupported()) {
      console.error('[NKS Hardware] Web HID not supported');
      return false;
    }
    
    const connected = await this.protocol.requestDevice();
    
    if (connected) {
      const deviceInfo = this.protocol.getDeviceInfo();
      this.isAkaiDevice = deviceInfo?.vendor.toLowerCase().includes('akai') || false;
      this.startDisplayUpdates();
      this.updateLightGuide();
    }
    
    return connected;
  }
  
  /**
   * Connect to already-paired device (no user gesture required)
   */
  async connectToPairedDevice(): Promise<boolean> {
    if (!isHIDSupported()) {
      return false;
    }
    
    try {
      const { getPairedDevices } = await import('./NKSHIDProtocol');
      const devices = await getPairedDevices();
      
      if (devices.length === 0) {
        return false;
      }
      
      // Connect to first paired device
      const connected = await this.protocol.connect(devices[0]);
      
      if (connected) {
        const deviceInfo = this.protocol.getDeviceInfo();
        this.isAkaiDevice = deviceInfo?.vendor.toLowerCase().includes('akai') || false;
        this.startDisplayUpdates();
        this.updateLightGuide();
      }
      
      return connected;
    } catch (error) {
      console.error('[NKS Hardware] Failed to connect to paired device:', error);
      return false;
    }
  }
  
  /**
   * Disconnect from hardware
   */
  async disconnect(): Promise<void> {
    this.stopDisplayUpdates();
    await this.protocol.disconnect();
  }
  
  /**
   * Get connected device info
   */
  getDeviceInfo(): NKSControllerInfo | null {
    return this.protocol.getDeviceInfo();
  }
  
  /**
   * Check if hardware is connected
   */
  isConnected(): boolean {
    return this.protocol.getDeviceInfo() !== null;
  }
  
  /**
   * Start periodic display updates
   */
  private startDisplayUpdates(): void {
    if (this.updateInterval !== null) return;
    
    // Update display at 10 Hz (comfortable for LCD)
    this.updateInterval = window.setInterval(() => {
      this.updateDisplay();
    }, 100);
    
    // Initial update
    this.updateDisplay();
  }
  
  /**
   * Stop display updates
   */
  private stopDisplayUpdates(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  /**
   * Update hardware display
   */
  private async updateDisplay(): Promise<void> {
    const state = useNKSStore.getState();
    const displayInfo = state.displayInfo;
    
    if (!displayInfo || displayInfo.length === 0) return;
    
    // Use MIDI for Akai devices, HID for Native Instruments
    if (this.isAkaiDevice) {
      const line1 = displayInfo[0] || '';
      const line2 = displayInfo[1] || '';
      await sendMPKLCDDisplay(line1, line2);
    } else {
      await this.protocol.sendDisplayUpdate(displayInfo);
    }
  }
  
  /**
   * Update light guide LEDs
   */
  private async updateLightGuide(): Promise<void> {
    if (!this.lightGuideEnabled) return;
    
    const state = useNKSStore.getState();
    const lights = state.lightGuide || [];
    
    // Use MIDI for Akai devices, HID for Native Instruments
    if (this.isAkaiDevice) {
      await syncNKSLightsToPads(lights);
    } else {
      await this.protocol.sendLightGuide(lights);
    }
  }
  
  /**
   * Handle knob value change from hardware
   */
  private handleKnobChange(knobIndex: number, value: number): void {
    const state = useNKSStore.getState();
    const page = state.currentPage;
    const paramIndex = page * 8 + knobIndex;
    const param = state.parameters[paramIndex];
    
    if (param) {
      // Set parameter value in NKS store
      state.setParameterValue(param.id, value);
    }
  }
  
  /**
   * Handle button press from hardware
   */
  private handleButtonPress(buttonId: number): void {
    const state = useNKSStore.getState();
    
    switch (buttonId) {
      case NKS_BUTTONS.PAGE_LEFT:
        state.prevPage();
        this.updateDisplay();
        break;
        
      case NKS_BUTTONS.PAGE_RIGHT:
        state.nextPage();
        this.updateDisplay();
        break;
        
      case NKS_BUTTONS.PRESET:
        // TODO: Open preset browser
        console.log('[NKS] Preset browser requested');
        break;
        
      case NKS_BUTTONS.BROWSE:
        // TODO: Open browser
        console.log('[NKS] Browser requested');
        break;
        
      case NKS_BUTTONS.SHIFT:
        // Handle shift modifier
        break;
        
      case NKS_BUTTONS.CLEAR:
        // Reset current parameter
        const currentParamIndex = state.currentPage * 8;
        const currentParam = state.parameters[currentParamIndex];
        if (currentParam) {
          state.setParameterValue(currentParam.id, 0);
        }
        break;
        
      case NKS_BUTTONS.OCTAVE_UP:
        this.shiftLightGuide(12);
        break;
        
      case NKS_BUTTONS.OCTAVE_DOWN:
        this.shiftLightGuide(-12);
        break;
        
      case NKS_BUTTONS.SCALE:
        // TODO: Toggle scale mode
        console.log('[NKS] Scale mode toggle');
        break;
        
      // Transport controls
      case NKS_BUTTONS.PLAY:
        console.log('[NKS] Play pressed');
        // TODO: Trigger play in audio engine
        break;
        
      case NKS_BUTTONS.STOP:
        console.log('[NKS] Stop pressed');
        // TODO: Trigger stop in audio engine
        break;
        
      case NKS_BUTTONS.REC:
        console.log('[NKS] Record pressed');
        // TODO: Trigger record in audio engine
        break;
        
      case NKS_BUTTONS.LOOP:
        console.log('[NKS] Loop toggle');
        // TODO: Toggle loop in audio engine
        break;
        
      case NKS_BUTTONS.METRO:
        console.log('[NKS] Metronome toggle');
        // TODO: Toggle metronome
        break;
    }
  }
  
  /**
   * Shift light guide octave
   */
  private shiftLightGuide(semitones: number): void {
    const state = useNKSStore.getState();
    const currentLights = state.lightGuide || [];
    
    const shiftedLights = currentLights.map(light => ({
      ...light,
      note: Math.max(0, Math.min(127, light.note + semitones)),
    }));
    
    state.setLightGuide(shiftedLights);
    this.updateLightGuide();
  }
  
  /**
   * Set light guide colors for scale highlighting
   */
  setScaleLights(rootNote: number, scaleIntervals: number[]): void {
    const lights: NKSKeyLight[] = [];
    
    // Generate lights for all octaves
    for (let octave = 0; octave < 11; octave++) {
      for (const interval of scaleIntervals) {
        const note = (octave * 12) + rootNote + interval;
        if (note >= 0 && note < 128) {
          lights.push({
            note,
            color: interval === 0 ? 0x02 : 0x01, // Root = blue, others = white
            brightness: 0.5,
          });
        }
      }
    }
    
    const state = useNKSStore.getState();
    state.setLightGuide(lights);
    this.updateLightGuide();
  }
  
  /**
   * Clear light guide
   */
  clearLightGuide(): void {
    const state = useNKSStore.getState();
    state.setLightGuide([]);
    this.updateLightGuide();
  }
  
  /**
   * Enable/disable light guide updates
   */
  setLightGuideEnabled(enabled: boolean): void {
    this.lightGuideEnabled = enabled;
    
    if (enabled) {
      this.updateLightGuide();
    } else {
      this.clearLightGuide();
    }
  }
  
  /**
   * Sync knobs to current parameter values
   */
  async syncKnobsToParameters(): Promise<void> {
    // Note: Physical knobs can't be moved by software
    // This would trigger a display update to show current values
    await this.updateDisplay();
  }
}

/**
 * Singleton instance
 */
let hardwareControllerInstance: NKSHardwareController | null = null;

/**
 * Get or create hardware controller instance
 */
export function getNKSHardwareController(): NKSHardwareController {
  if (!hardwareControllerInstance) {
    hardwareControllerInstance = new NKSHardwareController();
  }
  return hardwareControllerInstance;
}

/**
 * Check if hardware is available
 */
export function isNKSHardwareAvailable(): boolean {
  return isHIDSupported();
}

/**
 * Connect to already-paired NKS device (no user gesture required)
 */
export async function connectToNKSPairedDevice(): Promise<boolean> {
  return getNKSHardwareController().connectToPairedDevice();
}
