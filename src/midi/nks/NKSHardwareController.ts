/**
 * NKS Hardware Controller Integration
 * 
 * Bridges NKSManager state with HID protocol for real hardware control
 */

import { NKSHIDProtocol, NKS_BUTTONS, isHIDSupported } from './NKSHIDProtocol';
import { useNKSStore } from './NKSManager';
import type { NKSControllerInfo, NKSKeyLight, NKS2SynthProfile, NKS2PDI } from './types';
import { sendMPKLCDDisplay, syncNKSLightsToPads } from './AkaiMIDIProtocol';
import { getNKS2Profile } from './synthParameterMaps';
import type { SynthType } from '@typedefs/instrument';

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

  // ========================================================================
  // NKS2 Display Modes (Stubs - requires NI hardware to test)
  // ========================================================================

  /** Current display mode: Performance shows top 8-16 params, Edit shows grouped navigation */
  private displayMode: 'performance' | 'edit' = 'performance';
  private editGroupIndex = 0;
  private nks2Profile: NKS2SynthProfile | null = null;

  /**
   * Load NKS2 profile for a synth and configure display.
   * Called when instrument changes.
   *
   * On NI hardware (S-Series MK2/MK3):
   * - Performance mode: 8 knobs = first Performance section, PDI-styled controls
   * - Edit mode: Navigate through EditGroups with soft buttons
   * - Display shows parameter names, values with PDI formatting
   *
   * On Akai MPK Mini:
   * - Performance mode only (8 knobs, LCD text)
   */
  loadNKS2Profile(synthType: SynthType): void {
    this.nks2Profile = getNKS2Profile(synthType);
    this.displayMode = 'performance';
    this.editGroupIndex = 0;

    if (!this.nks2Profile) return;

    // TODO: When NI hardware connected, send NKS2 display mode init:
    // - Set knob PDI types (affects how knobs render on NI displays)
    // - Send parameter names and units for display
    // - Configure Performance section labels
    // - For S-Series MK3: render PDI controls on high-res display
    console.log('[NKS2] Profile loaded for', synthType, '-',
      this.nks2Profile.parameters.length, 'params,',
      this.nks2Profile.navigation.performance.length, 'perf sections');
  }

  /**
   * Toggle between Performance and Edit display modes.
   * Performance: shows top 8-16 params (most important)
   * Edit: shows all params organized in groups (NKS2 EditGroups)
   *
   * On NI S-Series: INSTANCE button toggles mode
   * On Akai: Not applicable (Performance mode only)
   */
  toggleDisplayMode(): void {
    if (!this.nks2Profile?.navigation.editGroups?.length) return;

    this.displayMode = this.displayMode === 'performance' ? 'edit' : 'performance';
    this.editGroupIndex = 0;

    console.log('[NKS2] Display mode:', this.displayMode);
    // TODO: Update NI hardware display with mode indicator
  }

  /**
   * Navigate between Edit groups (when in Edit mode).
   * On NI hardware, soft buttons above the display select groups.
   */
  navigateEditGroup(direction: 'prev' | 'next'): void {
    if (this.displayMode !== 'edit' || !this.nks2Profile?.navigation.editGroups) return;

    const groups = this.nks2Profile.navigation.editGroups;
    if (direction === 'next') {
      this.editGroupIndex = (this.editGroupIndex + 1) % groups.length;
    } else {
      this.editGroupIndex = this.editGroupIndex === 0 ? groups.length - 1 : this.editGroupIndex - 1;
    }

    console.log('[NKS2] Edit group:', groups[this.editGroupIndex].name);
    // TODO: Update NI hardware display with group parameters
  }

  /**
   * Format a parameter value according to its NKS2 PDI type.
   * Used for hardware display rendering.
   *
   * - continuous: "0.00" to "1.00" (or with unit: "440 Hz")
   * - continuous_bipolar: "-1.00" to "+1.00" (centered at 0)
   * - discrete: Display value string from list
   * - toggle: "ON" / "OFF"
   */
  formatNKS2Value(pdi: NKS2PDI, value: number): string {
    switch (pdi.type) {
      case 'toggle':
        return value >= 0.5 ? 'ON' : 'OFF';

      case 'discrete':
      case 'discrete_bipolar':
        if (pdi.display_values && pdi.value_count) {
          const index = Math.round(value * (pdi.value_count - 1));
          return pdi.display_values[Math.min(index, pdi.display_values.length - 1)] || `${index}`;
        }
        return `${Math.round(value * (pdi.value_count || 1))}`;

      case 'continuous_bipolar':
        return (value * 2 - 1).toFixed(2);

      case 'continuous':
      default:
        return value.toFixed(2);
    }
  }

  // ========================================================================
  // Light Guide Integration (Stubs - requires NI keyboard hardware)
  // ========================================================================

  /**
   * Set light guide for a key range (e.g., bass synth = lower keys highlighted).
   * On NI S-Series keyboards, LEDs above each key light up.
   *
   * @param lowNote - Lowest MIDI note of the active range
   * @param highNote - Highest MIDI note of the active range
   * @param color - NKS light color index (see NKSKeyLight)
   */
  setKeyRangeLightGuide(lowNote: number, highNote: number, color = 0x05): void {
    const lights: NKSKeyLight[] = [];

    for (let note = lowNote; note <= highNote; note++) {
      lights.push({
        note,
        color,
        brightness: note === lowNote || note === highNote ? 1.0 : 0.5,
      });
    }

    const state = useNKSStore.getState();
    state.setLightGuide(lights);

    // TODO: Send to NI hardware via HID
    console.log(`[NKS2] Key range light guide: ${lowNote}-${highNote}`);
  }

  /**
   * Set light guide for drum pad mapping.
   * Maps MIDI notes to pad positions with color coding by drum type.
   * On Akai: maps to RGB pad LEDs via MIDI SysEx
   * On NI Maschine: maps to pad LEDs via HID
   */
  setDrumPadLightGuide(padMap: Array<{ note: number; color: number; name: string }>): void {
    const lights: NKSKeyLight[] = padMap.map(pad => ({
      note: pad.note,
      color: pad.color,
      brightness: 0.8,
    }));

    const state = useNKSStore.getState();
    state.setLightGuide(lights);

    if (this.isAkaiDevice) {
      syncNKSLightsToPads(lights).catch(() => {});
    }
    // TODO: For NI Maschine, send via HID pad LED protocol

    console.log(`[NKS2] Drum pad light guide: ${padMap.length} pads`);
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
