/**
 * BluetoothMIDIManager - iOS Bluetooth MIDI support detection
 * iOS requires Bluetooth MIDI pairing via Settings app
 */

export interface BluetoothMIDIInfo {
  isIOS: boolean;
  isSupported: boolean;
  instructions: string | null;
  requiresPairing: boolean;
}

/**
 * Detect if the device is iOS
 */
export const isIOSDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent || navigator.vendor;

  // iPad on iOS 13+ detection (reports as Mac)
  const isIPadOS = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;

  // iPhone/iPod detection
  const isIPhone = /iPhone|iPod/i.test(userAgent);

  // iPad (pre-iOS 13)
  const isIPad = /iPad/i.test(userAgent);

  return isIPadOS || isIPhone || isIPad;
};

/**
 * Detect if the device is Android
 */
export const isAndroidDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor;
  return /android/i.test(userAgent);
};

/**
 * Detect if the device is mobile (iOS or Android)
 */
export const isMobileDevice = (): boolean => {
  return isIOSDevice() || isAndroidDevice();
};

/**
 * Detect if Web MIDI API is supported
 */
export const isWebMIDISupported = (): boolean => {
  if (typeof navigator === 'undefined') {
    console.log('[MIDI] Navigator is undefined (SSR context?)');
    return false;
  }

  const hasAPI = 'requestMIDIAccess' in navigator;

  if (!hasAPI) {
    console.log('[MIDI] Web MIDI API not found in navigator');
    console.log('[MIDI] Browser:', navigator.userAgent);
    console.log('[MIDI] Protocol:', window.location.protocol);
    console.log('[MIDI] Is HTTPS:', window.location.protocol === 'https:');
    console.log('[MIDI] Is localhost:', window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  }

  return hasAPI;
};

/**
 * Get Bluetooth MIDI information for the current device
 */
export const getBluetoothMIDIInfo = (): BluetoothMIDIInfo => {
  const isIOS = isIOSDevice();
  const isAndroid = isAndroidDevice();
  const isSupported = isWebMIDISupported();

  if (!isSupported) {
    if (isAndroid) {
      return {
        isIOS: false,
        isSupported: false,
        instructions: `Web MIDI is not supported on Android Chrome yet.

To use MIDI on Android:
1. Try Chrome Canary or Chrome Dev (enable chrome://flags/#enable-web-midi)
2. Or use a desktop browser (Chrome, Edge, Opera)
3. USB MIDI controllers work better than Bluetooth on Android

Alternatively, use an iOS device with Safari for full MIDI support.`,
        requiresPairing: false,
      };
    }
    return {
      isIOS,
      isSupported: false,
      instructions: 'Web MIDI is not supported on this browser. Try Safari on iOS or Chrome/Edge on desktop.',
      requiresPairing: false,
    };
  }

  if (isIOS) {
    return {
      isIOS: true,
      isSupported: true,
      instructions: `To connect MIDI devices on iOS:

USB MIDI (via Camera Connection Kit):
1. Connect USB MIDI controller to Lightning/USB-C adapter
2. DEViLBOX should detect it automatically
3. Check MIDI settings to verify connection

Bluetooth MIDI:
1. Open Settings → Bluetooth
2. Turn on your MIDI device
3. Pair it with your ${/iPad/i.test(navigator.userAgent) ? 'iPad' : 'iPhone'}
4. Return to DEViLBOX (no refresh needed)
5. Device should appear in MIDI settings

Note: iOS Safari has the best MIDI support. Chrome on iOS does NOT support Web MIDI.`,
      requiresPairing: true,
    };
  }

  if (isAndroid) {
    return {
      isIOS: false,
      isSupported: true,
      instructions: `To connect MIDI devices on Android:

USB MIDI (via USB-C or OTG adapter):
1. Connect USB MIDI controller via adapter
2. Grant USB permission when prompted
3. Check MIDI settings to verify connection

Bluetooth MIDI:
1. Pair MIDI device via Android Bluetooth settings
2. Open DEViLBOX
3. Device should appear in MIDI settings

Note: Android MIDI support varies by device and browser. Chrome 43+ required. USB works more reliably than Bluetooth.`,
      requiresPairing: false,
    };
  }

  // Desktop
  return {
    isIOS: false,
    isSupported: true,
    instructions: 'Connect your USB MIDI device. It should be detected automatically. Bluetooth MIDI may require pairing first.',
    requiresPairing: false,
  };
};

/**
 * Request MIDI access with proper error handling for mobile
 */
export const requestMIDIAccessMobile = async (): Promise<MIDIAccess | null> => {
  if (!isWebMIDISupported()) {
    throw new Error('Web MIDI API is not supported on this device/browser');
  }

  try {
    // Request MIDI access (sysex: false for better mobile compatibility)
    const access = await navigator.requestMIDIAccess({ sysex: false });
    return access;
  } catch (error) {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'SecurityError':
          throw new Error('MIDI access denied. Please grant permission in browser settings and refresh the page.');
        case 'NotSupportedError':
          throw new Error('MIDI is not supported on this device.');
        case 'InvalidStateError':
          throw new Error('MIDI access is already being requested.');
        default:
          throw new Error(`MIDI access failed: ${error.message}`);
      }
    }
    throw error;
  }
};

/**
 * Get list of connected MIDI devices
 */
export const getConnectedMIDIDevices = (access: MIDIAccess): {
  inputs: MIDIInput[];
  outputs: MIDIOutput[];
} => {
  const inputs: MIDIInput[] = [];
  const outputs: MIDIOutput[] = [];

  access.inputs.forEach((input) => inputs.push(input));
  access.outputs.forEach((output) => outputs.push(output));

  return { inputs, outputs };
};

/**
 * Check if any MIDI devices are connected
 */
export const hasConnectedMIDIDevices = (access: MIDIAccess): boolean => {
  return access.inputs.size > 0 || access.outputs.size > 0;
};

/**
 * Format MIDI device name for display
 */
export const formatMIDIDeviceName = (device: MIDIInput | MIDIOutput): string => {
  // Some devices have manufacturer + name, clean it up
  const name = device.name || 'Unknown Device';
  const manufacturer = device.manufacturer || '';

  // If name already includes manufacturer, don't duplicate
  if (manufacturer && !name.toLowerCase().includes(manufacturer.toLowerCase())) {
    return `${manufacturer} ${name}`;
  }

  return name;
};

export default {
  isIOSDevice,
  isWebMIDISupported,
  getBluetoothMIDIInfo,
  requestMIDIAccessMobile,
  getConnectedMIDIDevices,
  hasConnectedMIDIDevices,
  formatMIDIDeviceName,
};
