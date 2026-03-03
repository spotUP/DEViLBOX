/**
 * ASIDProtocol.ts
 * 
 * ASID (Audio over Serial Interface Device) protocol implementation
 * for controlling real SID hardware (USB-SID-Pico, TherapSID, etc.) via MIDI.
 * 
 * Protocol Format:
 * F0 2D <device> <reg> <data> F7
 * 
 * - F0: MIDI SysEx start
 * - 2D: ASID manufacturer ID
 * - <device>: Device address (0x4D for USB-SID-Pico)
 * - <reg>: SID register (0x00-0x1F for single SID, 0x00-0x5F for 3 SIDs)
 * - <data>: Register value (0x00-0xFF)
 * - F7: MIDI SysEx end
 * 
 * Multi-SID Addressing:
 * - SID 1: registers 0x00-0x1F
 * - SID 2: registers 0x20-0x3F (offset +0x20)
 * - SID 3: registers 0x40-0x5F (offset +0x40)
 * 
 * Reference:
 * - USB-SID-Pico: https://github.com/LouDnl/USBSID-Pico
 * - SIDFactory2 ASID: https://github.com/Chordian/sidfactory2/tree/asid-support
 */

// ASID Protocol Constants
export const ASID = {
  SYSEX_START: 0xF0,
  SYSEX_END: 0xF7,
  MANUFACTURER_ID: 0x2D,
  
  // Common device addresses
  DEVICE_ADDRESS: {
    USBSID_PICO: 0x4D,
    THERAPSID: 0x4D,  // Same as USB-SID-Pico
  },
  
  // SID register offsets for multi-SID
  SID_REGISTER_OFFSET: {
    SID1: 0x00,
    SID2: 0x20,
    SID3: 0x40,
  },
  
  // SID register count (29 registers per SID)
  REGISTERS_PER_SID: 0x1D,
} as const;

/**
 * Format an ASID MIDI SysEx message for a SID register write
 * 
 * @param device Device address (0x4D for USB-SID-Pico)
 * @param register SID register (0x00-0x5F for up to 3 SIDs)
 * @param value Register value (0x00-0xFF)
 * @returns Uint8Array containing the ASID SysEx message
 */
export function formatASIDMessage(
  device: number,
  register: number,
  value: number
): Uint8Array {
  // Validate inputs
  if (device < 0 || device > 0xFF) {
    throw new Error(`Invalid device address: ${device.toString(16)}`);
  }
  if (register < 0 || register > 0xFF) {
    throw new Error(`Invalid register: ${register.toString(16)}`);
  }
  if (value < 0 || value > 0xFF) {
    throw new Error(`Invalid value: ${value.toString(16)}`);
  }

  return new Uint8Array([
    ASID.SYSEX_START,
    ASID.MANUFACTURER_ID,
    device,
    register,
    value,
    ASID.SYSEX_END,
  ]);
}

/**
 * Send a SID register write to ASID hardware via MIDI
 * 
 * @param output MIDI output port
 * @param device Device address (0x4D for USB-SID-Pico)
 * @param register SID register (0x00-0x1F for single SID)
 * @param value Register value (0x00-0xFF)
 */
export function sendASIDRegisterWrite(
  output: MIDIOutput,
  device: number,
  register: number,
  value: number
): void {
  try {
    const message = formatASIDMessage(device, register, value);
    output.send(message);
  } catch (err) {
    console.error('[ASID] Failed to send register write:', err);
    throw err;
  }
}

/**
 * Calculate register address for multi-SID configurations
 * 
 * @param sidIndex SID chip index (0, 1, or 2)
 * @param localRegister Local register within the SID (0x00-0x1C)
 * @returns Global register address (0x00-0x5F)
 */
export function getSIDRegisterAddress(sidIndex: number, localRegister: number): number {
  if (sidIndex < 0 || sidIndex > 2) {
    throw new Error(`Invalid SID index: ${sidIndex} (must be 0-2)`);
  }
  if (localRegister < 0 || localRegister >= ASID.REGISTERS_PER_SID) {
    throw new Error(`Invalid local register: ${localRegister.toString(16)} (must be 0x00-0x1C)`);
  }

  const offset = sidIndex * ASID.SID_REGISTER_OFFSET.SID2;
  return offset + localRegister;
}

/**
 * Batch send multiple SID register writes
 * 
 * Useful for initializing SID state or sending parameter updates.
 * Adds minimal delay between writes to avoid overwhelming the device.
 * 
 * @param output MIDI output port
 * @param device Device address
 * @param writes Array of [register, value] pairs
 * @param delayMs Delay between writes in milliseconds (default: 0)
 */
export async function sendASIDBatch(
  output: MIDIOutput,
  device: number,
  writes: Array<[register: number, value: number]>,
  delayMs = 0
): Promise<void> {
  for (const [register, value] of writes) {
    sendASIDRegisterWrite(output, device, register, value);
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Send a SID reset sequence
 * 
 * Clears all SID registers to default state (silent).
 * 
 * @param output MIDI output port
 * @param device Device address
 * @param sidIndex Which SID to reset (0-2), or -1 for all SIDs
 */
export async function resetASIDSID(
  output: MIDIOutput,
  device: number,
  sidIndex: number = 0
): Promise<void> {
  const sidsToReset = sidIndex === -1 ? [0, 1, 2] : [sidIndex];
  
  for (const sid of sidsToReset) {
    const writes: Array<[number, number]> = [];
    
    // Clear all 29 SID registers
    for (let reg = 0; reg < ASID.REGISTERS_PER_SID; reg++) {
      const globalReg = getSIDRegisterAddress(sid, reg);
      writes.push([globalReg, 0x00]);
    }
    
    await sendASIDBatch(output, device, writes, 1);
  }
}

/**
 * Test if a MIDI device supports ASID protocol
 * 
 * This is a heuristic check based on device name patterns.
 * USB-SID-Pico and TherapSID typically have "SID" in the name.
 * 
 * @param device MIDIOutput device
 * @returns true if the device likely supports ASID
 */
export function isASIDDevice(device: MIDIOutput): boolean {
  const name = device.name?.toLowerCase() || '';
  
  // Known ASID device name patterns
  const patterns = [
    'usbsid',
    'usb-sid',
    'pico',
    'therapsid',
    'sid hardware',
    'asid',
  ];
  
  return patterns.some(pattern => name.includes(pattern));
}

/**
 * Get human-readable name for ASID device address
 */
export function getASIDDeviceName(address: number): string {
  switch (address) {
    case ASID.DEVICE_ADDRESS.USBSID_PICO:
      return 'USB-SID-Pico';
    default:
      return `ASID Device (0x${address.toString(16).toUpperCase()})`;
  }
}
