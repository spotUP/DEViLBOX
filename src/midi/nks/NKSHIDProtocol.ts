/**
 * NKS HID Protocol
 * 
 * Implements Native Instruments' HID protocol for hardware controllers:
 * - Display updates (LCD screens)
 * - Knob value reads
 * - Button state monitoring
 * - Light guide control
 * - Transport controls
 * 
 * Based on reverse engineering and NI Developer documentation
 */

import type { NKSControllerInfo, NKSKeyLight } from './types';

/**
 * Vendor IDs for NKS-compatible devices
 */
export const NI_VENDOR_ID = 0x17CC;     // Native Instruments
export const AKAI_VENDOR_ID = 0x09E8;   // Akai Professional
export const ARTURIA_VENDOR_ID = 0x1C75; // Arturia
export const NEKTAR_VENDOR_ID = 0x1FC9;  // Nektar Technology
export const M_AUDIO_VENDOR_ID = 0x0763; // M-Audio (Avid)
// TODO: Verify real USB vendor IDs with hardware - these are placeholders
// that currently duplicate Arturia/Nektar IDs and will cause wrong vendor name detection
export const STUDIOLOGIC_VENDOR_ID = 0x1C75; // Placeholder - same as Arturia, needs real Studiologic/Fatar VID
export const ICON_VENDOR_ID = 0x1FC9;   // Placeholder - same as Nektar, needs real iCON VID
export const ALESIS_VENDOR_ID = 0x000F;  // Alesis

/**
 * Product IDs for NI controllers
 */
export const NI_PRODUCT_IDS = {
  // Komplete Kontrol S-Series MK1
  KOMPLETE_KONTROL_S25_MK1: 0x1340,
  KOMPLETE_KONTROL_S49_MK1: 0x1350,
  KOMPLETE_KONTROL_S61_MK1: 0x1360,
  KOMPLETE_KONTROL_S88_MK1: 0x1410,
  
  // Komplete Kontrol S-Series MK2
  KOMPLETE_KONTROL_S49_MK2: 0x1620,
  KOMPLETE_KONTROL_S61_MK2: 0x1630,
  KOMPLETE_KONTROL_S88_MK2: 0x1650,
  
  // Komplete Kontrol S-Series MK3
  KOMPLETE_KONTROL_S49_MK3: 0x1720,
  KOMPLETE_KONTROL_S61_MK3: 0x1730,
  KOMPLETE_KONTROL_S88_MK3: 0x1750,
  
  // Komplete Kontrol A-Series
  KOMPLETE_KONTROL_A25: 0x1610,
  KOMPLETE_KONTROL_A49: 0x1611,
  KOMPLETE_KONTROL_A61: 0x1612,
  
  // Komplete Kontrol M32
  KOMPLETE_KONTROL_M32: 0x1600,
  
  // Maschine
  MASCHINE_MK2: 0x0808,
  MASCHINE_MK3: 0x1700,
  MASCHINE_PLUS: 0x1710,
  MASCHINE_STUDIO: 0x1140,
  MASCHINE_MIKRO_MK2: 0x0813,
  MASCHINE_MIKRO_MK3: 0x1705,
  MASCHINE_JAM: 0x1500,
};

/**
 * Product IDs for Akai MPK controllers (NKS-compatible)
 */
export const AKAI_PRODUCT_IDS = {
  MPK_MINI_MK3: 0x0135,
  MPK_MINI_PLUS: 0x0138,
  MPK249: 0x0131,
  MPK261: 0x0132,
  MPK288: 0x0133,
};

/**
 * Product IDs for Arturia controllers (NKS-compatible)
 */
export const ARTURIA_PRODUCT_IDS = {
  KEYLAB_ESSENTIAL_49: 0x0527,
  KEYLAB_ESSENTIAL_61: 0x0528,
  KEYLAB_ESSENTIAL_88: 0x0529,
  KEYLAB_MKII_49: 0x0611,
  KEYLAB_MKII_61: 0x0612,
  KEYLAB_MKII_88: 0x0613,
};

/**
 * Product IDs for Nektar controllers (NKS-compatible)
 */
export const NEKTAR_PRODUCT_IDS = {
  IMPACT_LX25_PLUS: 0x2030,
  IMPACT_LX49_PLUS: 0x2031,
  IMPACT_LX61_PLUS: 0x2032,
  IMPACT_LX88_PLUS: 0x2033,
  PANORAMA_T4: 0x2020,
  PANORAMA_T6: 0x2021,
};

/**
 * Product IDs for M-Audio controllers (NKS-compatible)
 */
export const M_AUDIO_PRODUCT_IDS = {
  CODE_25: 0x0195,
  CODE_49: 0x0196,
  CODE_61: 0x0197,
};

/**
 * Product IDs for Studiologic controllers (NKS-compatible)
 */
export const STUDIOLOGIC_PRODUCT_IDS = {
  SL_MIXFACE: 0x0800,
  NUMA_COMPACT_2: 0x0810,
};

/**
 * Product IDs for iCON controllers (NKS-compatible)
 */
export const ICON_PRODUCT_IDS = {
  PLATFORM_M_PLUS: 0x3010,
  PLATFORM_X_PLUS: 0x3011,
};

/**
 * Product IDs for Alesis controllers (NKS-compatible)
 */
export const ALESIS_PRODUCT_IDS = {
  VI25: 0x0137,
  VI49: 0x0138,
  VI61: 0x0139,
};

/**
 * HID Report IDs for different message types
 *
 * NI MK2 Protocol:
 *   Display: 2-line text, knobs render as basic value bars
 *   Reports: Standard report IDs below
 *
 * NI MK3 Protocol (S49/S61/S88 MK3):
 *   Display: High-res color screens (480x272 per section)
 *   NKS2 PDI: Full graphical rendering of knob/menu/waveform/filter controls
 *   Reports: Extended report format with display region addressing
 *   Touch strip: Capacitive strip below display, reports position + pressure
 *   Light guide: Per-key RGB LEDs (not just on/off)
 *
 * TODO: MK3-specific report IDs (requires hardware for verification):
 *   DISPLAY_REGION: 0x80 - Draw to specific display region
 *   DISPLAY_BITMAP: 0x81 - Send bitmap data to display
 *   TOUCH_STRIP:    0x20 - Touch strip position/pressure input
 *   KEY_LED_RGB:    0x04 - Per-key RGB light guide
 *   KNOB_TOUCH:     0x13 - Knob touch detection (capacitive)
 */
const HID_REPORT_IDS = {
  DISPLAY_UPDATE: 0x01,
  LED_UPDATE: 0x02,
  LIGHT_GUIDE: 0x03,
  KNOB_VALUES: 0x10,
  BUTTON_STATE: 0x11,
  TRANSPORT: 0x12,
  PING: 0xF0,
  DEVICE_INFO: 0xF1,
};

/**
 * Button IDs (common across devices)
 */
export const NKS_BUTTONS = {
  // Transport
  PLAY: 0x01,
  STOP: 0x02,
  REC: 0x03,
  LOOP: 0x04,
  METRO: 0x05,
  TEMPO: 0x06,
  
  // Navigation
  LEFT: 0x10,
  RIGHT: 0x11,
  UP: 0x12,
  DOWN: 0x13,
  ENTER: 0x14,
  BACK: 0x15,
  
  // Browser
  BROWSE: 0x20,
  INSTANCE: 0x21,
  PRESET: 0x22,
  
  // Pages
  PAGE_LEFT: 0x30,
  PAGE_RIGHT: 0x31,
  
  // Knobs (push)
  KNOB_1: 0x40,
  KNOB_2: 0x41,
  KNOB_3: 0x42,
  KNOB_4: 0x43,
  KNOB_5: 0x44,
  KNOB_6: 0x45,
  KNOB_7: 0x46,
  KNOB_8: 0x47,
  
  // Modifiers
  SHIFT: 0x50,
  CLEAR: 0x51,
  
  // Octave
  OCTAVE_UP: 0x60,
  OCTAVE_DOWN: 0x61,
  
  // Scale
  SCALE: 0x70,
  ARP: 0x71,
};

/**
 * HID Protocol Handler
 */
export class NKSHIDProtocol {
  private device: HIDDevice | null = null;
  private deviceInfo: NKSControllerInfo | null = null;
  private knobValues: number[] = new Array(8).fill(0);
  private buttonStates: Map<number, boolean> = new Map();
  private _connectPromise: Promise<boolean> | null = null;

  // Callbacks
  private onKnobChange?: (index: number, value: number) => void;
  private onButtonPress?: (buttonId: number) => void;
  private onButtonRelease?: (buttonId: number) => void;
  
  constructor() {
    // Bind input report handler
    this.handleInputReport = this.handleInputReport.bind(this);
  }
  
  /**
   * Request HID device access and connect
   */
  async requestDevice(): Promise<boolean> {
    if (!('hid' in navigator)) {
      console.error('[NKS HID] Web HID API not supported');
      return false;
    }
    
    try {
      // Request device with all NKS-compatible vendor ID filters
      const devices = await navigator.hid.requestDevice({
        filters: [
          { vendorId: NI_VENDOR_ID },
          { vendorId: AKAI_VENDOR_ID },
          { vendorId: ARTURIA_VENDOR_ID },
          { vendorId: NEKTAR_VENDOR_ID },
          { vendorId: M_AUDIO_VENDOR_ID },
          { vendorId: STUDIOLOGIC_VENDOR_ID },
          { vendorId: ICON_VENDOR_ID },
          { vendorId: ALESIS_VENDOR_ID },
        ],
      });
      
      if (devices.length === 0) {
        console.log('[NKS HID] No device selected');
        return false;
      }
      
      return await this.connect(devices[0]);
    } catch (error) {
      console.error('[NKS HID] Failed to request device:', error);
      return false;
    }
  }
  
  /**
   * Connect to a specific HID device
   */
  async connect(device: HIDDevice): Promise<boolean> {
    // Guard against concurrent connect calls (e.g. React StrictMode double-mount)
    if (this._connectPromise) return this._connectPromise;

    this._connectPromise = this._doConnect(device);
    try {
      return await this._connectPromise;
    } finally {
      this._connectPromise = null;
    }
  }

  private async _doConnect(device: HIDDevice): Promise<boolean> {
    try {
      if (!device.opened) {
        await device.open();
      }

      this.device = device;
      this.deviceInfo = this.parseDeviceInfo(device);

      // Listen for input reports
      device.addEventListener('inputreport', this.handleInputReport);

      // Send ping only to NI devices that support HID output reports
      if (this.deviceInfo.supportsHIDOutput) {
        try {
          await this.sendPing();
        } catch (pingError) {
          console.warn('[NKS HID] Ping failed:', pingError);
        }
      }

      console.log('[NKS HID] Connected to:', this.deviceInfo.name);
      return true;
    } catch (error) {
      console.error('[NKS HID] Failed to connect:', error);
      return false;
    }
  }
  
  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
    if (this.device) {
      this.device.removeEventListener('inputreport', this.handleInputReport);
      
      if (this.device.opened) {
        await this.device.close();
      }
      
      this.device = null;
      this.deviceInfo = null;
      console.log('[NKS HID] Disconnected');
    }
  }
  
  /**
   * Get connected device info
   */
  getDeviceInfo(): NKSControllerInfo | null {
    return this.deviceInfo;
  }
  
  /**
   * Parse device info from HID device
   */
  private parseDeviceInfo(device: HIDDevice): NKSControllerInfo {
    const productId = device.productId;
    const vendorId = device.vendorId;
    const productName = device.productName || 'Unknown Controller';
    
    // Determine vendor name
    let vendorName = 'Native Instruments';
    if (vendorId === AKAI_VENDOR_ID) vendorName = 'Akai';
    else if (vendorId === ARTURIA_VENDOR_ID) vendorName = 'Arturia';
    else if (vendorId === NEKTAR_VENDOR_ID) vendorName = 'Nektar';
    else if (vendorId === M_AUDIO_VENDOR_ID) vendorName = 'M-Audio';
    else if (vendorId === STUDIOLOGIC_VENDOR_ID) vendorName = 'Studiologic';
    else if (vendorId === ICON_VENDOR_ID) vendorName = 'iCON';
    else if (vendorId === ALESIS_VENDOR_ID) vendorName = 'Alesis';
    
    // Determine capabilities based on product ID
    let hasDisplay = false;
    let displayLines = 0;
    let displayChars = 0;
    let hasLightGuide = false;
    let lightGuideKeys = 0;
    let knobCount = 8;
    
    // S-Series MK1 (25/49/61/88)
    const sMK1Ids = [0x1340, 0x1350, 0x1360, 0x1410];
    if (sMK1Ids.includes(productId)) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 72;
      hasLightGuide = true;
      if (productId === 0x1340) lightGuideKeys = 25; // S25 MK1
      else if (productId === 0x1350) lightGuideKeys = 49; // S49 MK1
      else if (productId === 0x1360) lightGuideKeys = 61; // S61 MK1
      else if (productId === 0x1410) lightGuideKeys = 88; // S88 MK1
    }
    // S-Series MK2/MK3 (high-end)
    else if (productId >= 0x1620 && productId <= 0x1750) {
      hasDisplay = true;
      displayLines = 4;
      displayChars = 144;
      hasLightGuide = true;
      
      if (productId === 0x1620 || productId === 0x1720) lightGuideKeys = 49; // S49
      else if (productId === 0x1630 || productId === 0x1730) lightGuideKeys = 61; // S61
      else if (productId === 0x1650 || productId === 0x1750) lightGuideKeys = 88; // S88
    }
    // A-Series (mid-range)
    else if (productId >= 0x1610 && productId <= 0x1612) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 72;
      hasLightGuide = true;
      
      if (productId === 0x1610) lightGuideKeys = 25; // A25
      else if (productId === 0x1611) lightGuideKeys = 49; // A49
      else if (productId === 0x1612) lightGuideKeys = 61; // A61
    }
    // M32 (compact)
    else if (productId === 0x1600) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 72;
      hasLightGuide = true;
      lightGuideKeys = 32;
    }
    // Maschine MK2
    else if (productId === 0x0808) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 128;
      hasLightGuide = false;
      knobCount = 8;
    }
    // Maschine
    else if (productId === 0x1700 || productId === 0x1710) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 144;
      hasLightGuide = false;
      knobCount = 8;
    }
    // Maschine Studio
    else if (productId === 0x1140) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 160;
      hasLightGuide = false;
      knobCount = 8;
    }
    // Maschine Mikro MK2/MK3
    else if (productId === 0x0813 || productId === 0x1705) {
      hasDisplay = false; // Mikro has no display
      displayLines = 0;
      displayChars = 0;
      hasLightGuide = false;
      knobCount = 8;
    }
    // Maschine Jam
    else if (productId === 0x1500) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 96;
      hasLightGuide = false;
      knobCount = 8;
    }
    
    // Akai MPK Mini series (NKS-compatible) - detect by name OR product ID
    const akaiMiniIds = [0x0135, 0x0138]; // MPK Mini MK3, MPK Mini Plus
    const isMPKMini = vendorId === AKAI_VENDOR_ID && (
      akaiMiniIds.includes(productId) || 
      productName.toLowerCase().includes('mpk mini')
    );
    if (isMPKMini) {
      hasDisplay = true; // Graphical OLED (128x64 pixels)
      displayLines = 2;
      displayChars = 16;
      hasLightGuide = true; // 8 RGB drum pads (not keys, but using light guide for pad LEDs)
      lightGuideKeys = 8; // 8 drum pads with RGB LEDs
      knobCount = 8;
      console.log(`[NKS HID] Detected MPK Mini: productId=0x${productId.toString(16)}, name="${productName}"`);
    }
    // Akai MPK 249/261/288 (full-size with NKS)
    else if (vendorId === AKAI_VENDOR_ID && [0x0131, 0x0132, 0x0133].includes(productId)) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 80;
      hasLightGuide = false;
      knobCount = 8;
    }
    
    // Arturia KeyLab Essential series
    const arturiaEssentialIds = [0x0527, 0x0528, 0x0529];
    if (vendorId === ARTURIA_VENDOR_ID && arturiaEssentialIds.includes(productId)) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 64;
      hasLightGuide = false;
      knobCount = 9; // Arturia has 9 knobs
    }
    // Arturia KeyLab MkII series
    else if (vendorId === ARTURIA_VENDOR_ID && [0x0611, 0x0612, 0x0613].includes(productId)) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 80;
      hasLightGuide = false;
      knobCount = 9;
    }
    
    // Nektar Impact LX Plus series
    const nektarLXIds = [0x2030, 0x2031, 0x2032, 0x2033];
    if (vendorId === NEKTAR_VENDOR_ID && nektarLXIds.includes(productId)) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 40;
      hasLightGuide = false;
      knobCount = 8;
    }
    // Nektar Panorama T series
    else if (vendorId === NEKTAR_VENDOR_ID && [0x2020, 0x2021].includes(productId)) {
      hasDisplay = true;
      displayLines = 4;
      displayChars = 128;
      hasLightGuide = true;
      lightGuideKeys = 49; // T4 = 49 keys, T6 = 61 keys
      knobCount = 8;
    }
    
    // M-Audio Code series
    if (vendorId === M_AUDIO_VENDOR_ID && [0x0195, 0x0196, 0x0197].includes(productId)) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 64;
      hasLightGuide = false;
      knobCount = 16; // M-Audio Code has 16 knobs
    }
    
    // Studiologic
    if (vendorId === STUDIOLOGIC_VENDOR_ID && [0x0800, 0x0810].includes(productId)) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 40;
      hasLightGuide = false;
      knobCount = 8;
    }
    
    // iCON Platform series
    if (vendorId === ICON_VENDOR_ID && [0x3010, 0x3011].includes(productId)) {
      hasDisplay = true;
      displayLines = 2;
      displayChars = 64;
      hasLightGuide = false;
      knobCount = 8;
    }
    
    // Alesis VI series
    if (vendorId === ALESIS_VENDOR_ID && [0x0137, 0x0138, 0x0139].includes(productId)) {
      hasDisplay = false; // VI series has no display
      displayLines = 0;
      displayChars = 0;
      hasLightGuide = false;
      knobCount = 8;
    }
    
    // Only NI devices communicate via HID output reports;
    // Akai, Arturia, etc. use MIDI SysEx for display/LED control
    const supportsHIDOutput = vendorId === NI_VENDOR_ID;

    return {
      id: `nks_${vendorId.toString(16)}_${productId.toString(16)}`,
      name: productName,
      vendor: vendorName,
      hasDisplay,
      displayLines,
      displayChars,
      hasLightGuide,
      lightGuideKeys,
      hasKnobs: true,
      knobCount,
      hasButtons: true,
      hasPads: productId === 0x1700 || productId === 0x1710, // Maschine has pads
      hasTransport: true,
      hasJogWheel: productId === 0x1700 || productId === 0x1710,
      hasBrowserControls: true,
      hasTouchStrip: productId >= 0x1720 && productId <= 0x1750, // S-Series MK3
      supportsHIDOutput,
    };
  }
  
  /**
   * Send display update to controller
   */
  async sendDisplayUpdate(displayLines: string[]): Promise<void> {
    if (!this.device || !this.deviceInfo?.hasDisplay || !this.deviceInfo.supportsHIDOutput) return;
    
    // Pad/truncate lines to display size
    const formattedLines = displayLines.slice(0, this.deviceInfo.displayLines).map(line => 
      line.padEnd(this.deviceInfo!.displayChars, ' ').substring(0, this.deviceInfo!.displayChars)
    );
    
    // Encode display data
    const encoder = new TextEncoder();
    const maxSize = this.deviceInfo.displayLines * this.deviceInfo.displayChars;
    const displayText = formattedLines.join('').substring(0, maxSize);
    const displayBytes = encoder.encode(displayText);
    
    // Build HID report
    const report = new Uint8Array(64);
    report[0] = HID_REPORT_IDS.DISPLAY_UPDATE;
    report[1] = this.deviceInfo.displayLines;
    report[2] = displayBytes.length & 0xFF;
    report[3] = (displayBytes.length >> 8) & 0xFF;
    report.set(displayBytes.slice(0, 60), 4);
    
    try {
      await this.device.sendReport(HID_REPORT_IDS.DISPLAY_UPDATE, report);
    } catch (error) {
      console.debug('[NKS HID] Display update not supported');
    }
  }
  
  /**
   * Send light guide update to controller
   */
  async sendLightGuide(keyLights: NKSKeyLight[]): Promise<void> {
    if (!this.device || !this.deviceInfo?.hasLightGuide || !this.deviceInfo.supportsHIDOutput) return;
    
    try {
      // Build light guide message (up to 128 keys)
      const lightData = new Uint8Array(128 * 2); // 2 bytes per key (color + brightness)
      
      for (const light of keyLights) {
        if (light.note < 0 || light.note >= 128) continue;
        
        const offset = light.note * 2;
        lightData[offset] = light.color;
        lightData[offset + 1] = Math.round(light.brightness * 255);
      }
      
      // Send in chunks (64 bytes per HID report)
      for (let i = 0; i < lightData.length; i += 60) {
        const chunk = lightData.slice(i, i + 60);
        const report = new Uint8Array(64);
        report[0] = HID_REPORT_IDS.LIGHT_GUIDE;
        report[1] = (i / 60) & 0xFF; // Chunk index
        report[2] = chunk.length;
        report.set(chunk, 3);
        
        await this.device.sendReport(HID_REPORT_IDS.LIGHT_GUIDE, report);
      }
    } catch (error) {
      // Silently fail if device doesn't support light guide
      console.debug('[NKS HID] Light guide update not supported');
    }
  }
  
  /**
   * Handle input report from controller
   */
  private handleInputReport(event: HIDInputReportEvent): void {
    const { data, reportId } = event;
    const bytes = new Uint8Array(data.buffer);
    
    console.log('[NKS HID] Input report received - Report ID:', reportId, 'Data length:', bytes.length, 'First 8 bytes:', Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    switch (reportId) {
      case HID_REPORT_IDS.KNOB_VALUES:
        this.handleKnobValues(bytes);
        break;
        
      case HID_REPORT_IDS.BUTTON_STATE:
        this.handleButtonState(bytes);
        break;
        
      case HID_REPORT_IDS.TRANSPORT:
        this.handleTransport(bytes);
        break;
        
      case HID_REPORT_IDS.DEVICE_INFO:
        this.handleDeviceInfo(bytes);
        break;
        
      default:
        console.log('[NKS HID] Unknown report ID:', reportId);
        break;
    }
  }
  
  /**
   * Handle knob value changes
   */
  private handleKnobValues(data: Uint8Array): void {
    console.log('[NKS HID] Knob values report received');
    
    // Knob values: byte 1 = count, then pairs of (knobIndex, value)
    const count = data[1];
    
    for (let i = 0; i < count; i++) {
      const offset = 2 + (i * 2);
      const knobIndex = data[offset];
      const rawValue = data[offset + 1];
      
      // Convert to 0-1 range
      const value = rawValue / 127;
      
      if (this.knobValues[knobIndex] !== value) {
        this.knobValues[knobIndex] = value;
        console.log('[NKS HID] Knob change: index', knobIndex, 'value', value.toFixed(3));
        this.onKnobChange?.(knobIndex, value);
      }
    }
  }
  
  /**
   * Handle button state changes
   */
  private handleButtonState(data: Uint8Array): void {
    const buttonId = data[1];
    const isPressed = data[2] === 1;
    
    const wasPressed = this.buttonStates.get(buttonId) || false;
    
    if (isPressed !== wasPressed) {
      this.buttonStates.set(buttonId, isPressed);
      
      if (isPressed) {
        this.onButtonPress?.(buttonId);
      } else {
        this.onButtonRelease?.(buttonId);
      }
    }
  }
  
  /**
   * Handle transport control
   */
  private handleTransport(data: Uint8Array): void {
    const command = data[1];
    
    // Map to button presses
    this.handleButtonState(new Uint8Array([0, command, 1]));
  }
  
  /**
   * Handle device info response
   */
  private handleDeviceInfo(data: Uint8Array): void {
    // Parse additional device capabilities from response
    console.log('[NKS HID] Device info received:', data);
  }
  
  /**
   * Send ping to device
   */
  private async sendPing(): Promise<void> {
    if (!this.device || !this.deviceInfo?.supportsHIDOutput) return;
    
    const report = new Uint8Array(64);
    report[0] = HID_REPORT_IDS.PING;
    report[1] = 0x01; // Ping request
    
    await this.device.sendReport(HID_REPORT_IDS.PING, report);
  }
  
  /**
   * Set knob change callback
   */
  onKnobChanged(callback: (index: number, value: number) => void): void {
    this.onKnobChange = callback;
  }
  
  /**
   * Set button press callback
   */
  onButtonPressed(callback: (buttonId: number) => void): void {
    this.onButtonPress = callback;
  }
  
  /**
   * Set button release callback
   */
  onButtonReleased(callback: (buttonId: number) => void): void {
    this.onButtonRelease = callback;
  }
  
  /**
   * Get current knob values
   */
  getKnobValues(): number[] {
    return [...this.knobValues];
  }
  
  /**
   * Get button state
   */
  getButtonState(buttonId: number): boolean {
    return this.buttonStates.get(buttonId) || false;
  }
}

/**
 * Check if Web HID is supported
 */
export function isHIDSupported(): boolean {
  return 'hid' in navigator;
}

/**
 * Get list of already-paired NI devices
 */
export async function getPairedDevices(): Promise<HIDDevice[]> {
  if (!isHIDSupported()) return [];
  
  const devices = await navigator.hid.getDevices();
  const supportedVendors = [
    NI_VENDOR_ID,
    AKAI_VENDOR_ID,
    ARTURIA_VENDOR_ID,
    NEKTAR_VENDOR_ID,
    M_AUDIO_VENDOR_ID,
    STUDIOLOGIC_VENDOR_ID,
    ICON_VENDOR_ID,
    ALESIS_VENDOR_ID,
  ];
  return devices.filter(device => supportedVendors.includes(device.vendorId));
}
