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
 * Detect if Web MIDI API is supported
 */
export const isWebMIDISupported = (): boolean => {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
};

/**
 * Get Bluetooth MIDI information for the current device
 */
export const getBluetoothMIDIInfo = (): BluetoothMIDIInfo => {
  const isIOS = isIOSDevice();
  const isSupported = isWebMIDISupported();

  if (!isSupported) {
    return {
      isIOS,
      isSupported: false,
      instructions: 'Web MIDI is not supported on this browser. Try Safari on iOS or Chrome on Android.',
      requiresPairing: false,
    };
  }

  if (isIOS) {
    return {
      isIOS: true,
      isSupported: true,
      instructions: `To connect Bluetooth MIDI devices on iOS:

1. Open Settings → Bluetooth
2. Turn on your MIDI device
3. Pair it with your ${/iPad/i.test(navigator.userAgent) ? 'iPad' : 'iPhone'}
4. Return to DEViLBOX and refresh the page
5. Your MIDI device should appear in the MIDI settings

Note: iOS requires Bluetooth MIDI devices to be paired through Settings first.`,
      requiresPairing: true,
    };
  }

  // Android or desktop
  return {
    isIOS: false,
    isSupported: true,
    instructions: 'Connect your USB MIDI device or Bluetooth MIDI device (if supported by your browser).',
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
