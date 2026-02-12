/**
 * Akai MIDI Protocol for MPK Mini MK3
 *
 * Handles OLED display text and knob name updates via SysEx preset write (CMD 0x64).
 *
 * Protocol references:
 * - MPK Mini MK3 SysEx: https://github.com/tsmetana/mpk3-settings
 *   Header: F0 47 7F 49 (Akai, broadcast, MPK Mini MK3)
 *   CMD_WRITE (0x64): Write preset data to RAM (program name + knob names on OLED)
 * - NKS SDK Section 12.2.4: 18 light guide colors
 *
 * Hardware limitations (MK3):
 * - Pad LEDs are single-color (red Bank A, green Bank B), hardware-driven only
 *   — no known MIDI message can control them externally
 * - OLED only displays 16-char program name + knob names via preset write
 *   — no bitmap/pixel-level control (0x0E is Akai Fire only)
 */

import { useMIDIStore } from '@/stores/useMIDIStore';
import type { NKSParameter } from './types';

/**
 * Akai SysEx constants (per mpk3-settings message.h)
 */
const AKAI_SYSEX_HEADER = [0xF0, 0x47, 0x7F]; // F0=SysEx, 47=Akai, 7F=broadcast
const SYSEX_END = 0xF7;
const MPK_DEVICE_ID = 0x49; // MPK Mini MK3

const MPK_COMMANDS = {
  WRITE_DATA: 0x64,    // Write preset/program data (confirmed working on MK3)
  QUERY_DATA: 0x66,    // Query preset data
};

/**
 * Preset data layout (from mpk3-settings message.h)
 * Total payload: 246 bytes, written to Program 0 (RAM) for immediate effect
 *
 * Byte map:
 *   0       Program number (0=RAM)
 *   1-16    Program name (ASCII, shown on OLED idle screen)
 *   17      Pad MIDI channel
 *   18      Aftertouch
 *   19      Keybed channel
 *   20      Keybed octave
 *   21-30   Arpeggiator settings
 *   31-36   Joystick settings
 *   37-84   16 pads x 3 bytes (note, PC, CC) — NO color fields
 *   85-244  8 knobs x 20 bytes (mode, CC, min, max, name[16])
 *   245     Transpose
 */
const PGM_NUM_RAM = 0x00;
const DATA_PAYLOAD_LENGTH = 246;
const PROGRAM_NAME_OFFSET = 1;  // Bytes 1-16 in data payload
const PROGRAM_NAME_LENGTH = 16;

// Knob config offsets in data payload (message offset - 7 for data-relative)
const KNOB_DATA_OFFSETS = [
  { mode: 85, cc: 86, min: 87, max: 88, name: 89 },   // Knob 1
  { mode: 105, cc: 106, min: 107, max: 108, name: 109 }, // Knob 2
  { mode: 125, cc: 126, min: 127, max: 128, name: 129 }, // Knob 3
  { mode: 145, cc: 146, min: 147, max: 148, name: 149 }, // Knob 4
  { mode: 165, cc: 166, min: 167, max: 168, name: 169 }, // Knob 5
  { mode: 185, cc: 186, min: 187, max: 188, name: 189 }, // Knob 6
  { mode: 205, cc: 206, min: 207, max: 208, name: 209 }, // Knob 7
  { mode: 225, cc: 226, min: 227, max: 228, name: 229 }, // Knob 8
];
const KNOB_NAME_LENGTH = 16;

// ===== CACHED MIDI OUTPUT =====

let cachedOutput: MIDIOutput | null = null;

/**
 * Get the MPK Mini MIDI output, cached across calls.
 * Falls back to store-based detection, then direct Web MIDI scan.
 */
async function getMPKOutput(): Promise<MIDIOutput | null> {
  // Return cached output if still connected
  if (cachedOutput && cachedOutput.state === 'connected') {
    return cachedOutput;
  }

  // Check store for device presence first (avoids unnecessary requestMIDIAccess)
  const midiState = useMIDIStore.getState();
  const hasDevice = midiState.outputDevices.some(
    (o: { name: string | null }) => o.name?.includes('MPK mini')
  );
  if (!hasDevice) {
    cachedOutput = null;
    return null;
  }

  try {
    const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
    const output = Array.from(midiAccess.outputs.values()).find(
      o => o.name?.includes('MPK mini')
    );

    cachedOutput = output ?? null;
    if (cachedOutput) {
      console.debug('[Akai MIDI] Output cached:', cachedOutput.name);
    }
    return cachedOutput;
  } catch (error) {
    console.error('[Akai MIDI] Failed to get MIDI access:', error);
    cachedOutput = null;
    return null;
  }
}

// ===== DISPLAY CONTROL (via SysEx preset write CMD 0x64) =====

/**
 * Cached preset data — maintained across calls so we don't overwrite
 * knob configs when updating just the program name, or vice versa.
 */
let currentPreset: Uint8Array | null = null;

/**
 * Get or create the cached preset data.
 * Initializes with safe defaults: standard knob CCs (70-77), absolute mode.
 */
function getOrCreatePreset(): Uint8Array {
  if (currentPreset) return currentPreset;

  const data = new Uint8Array(DATA_PAYLOAD_LENGTH);
  data[0] = PGM_NUM_RAM;

  // Program name: "DEViLBOX" padded to 16 chars
  setPresetString(data, PROGRAM_NAME_OFFSET, 'DEViLBOX        ', PROGRAM_NAME_LENGTH);

  // Sensible defaults for other settings
  data[17] = 0;   // Pad MIDI channel
  data[18] = 0;   // Aftertouch off
  data[19] = 0;   // Keybed channel
  data[20] = 4;   // Keybed octave (C4)

  // Initialize 8 knobs with default CCs and names
  for (let i = 0; i < 8; i++) {
    const offset = KNOB_DATA_OFFSETS[i];
    data[offset.mode] = 0;           // Absolute mode
    data[offset.cc] = 70 + i;        // CC 70-77
    data[offset.min] = 0;            // Min 0
    data[offset.max] = 127;          // Max 127
    setPresetString(data, offset.name, `Knob ${i + 1}`, KNOB_NAME_LENGTH);
  }

  currentPreset = data;
  return data;
}

/**
 * Write an ASCII string into a preset data buffer at a given offset.
 */
function setPresetString(data: Uint8Array, offset: number, str: string, length: number): void {
  for (let i = 0; i < length; i++) {
    data[offset + i] = i < str.length ? Math.min(127, str.charCodeAt(i)) : 0x20;
  }
}

/**
 * Send the current preset data to the MPK Mini via CMD_WRITE (0x64).
 */
async function sendPreset(data: Uint8Array): Promise<void> {
  const output = await getMPKOutput();
  if (!output) return;

  const lenHigh = (data.length >> 7) & 0x7F;
  const lenLow = data.length & 0x7F;

  const sysex = new Uint8Array([
    ...AKAI_SYSEX_HEADER,
    MPK_DEVICE_ID,
    MPK_COMMANDS.WRITE_DATA,
    lenHigh,
    lenLow,
    ...data,
    SYSEX_END,
  ]);

  output.send(sysex);
}

/**
 * Send LCD display text to MPK Mini MK3.
 * Updates the program name (16 chars) on the OLED via preset write.
 * The OLED shows this as the idle screen header.
 */
export async function sendMPKLCDDisplay(line1: string, line2: string): Promise<void> {
  const preset = getOrCreatePreset();

  // Combine into 16-char program name (pad/truncate each line to 8 chars)
  const text = (line1.substring(0, 8).padEnd(8) + line2.substring(0, 8).padEnd(8));
  setPresetString(preset, PROGRAM_NAME_OFFSET, text, PROGRAM_NAME_LENGTH);

  try {
    await sendPreset(preset);
    console.log('[Akai MIDI] Display updated:', text.trim());
  } catch (error) {
    console.error('[Akai MIDI] Failed to send display:', error);
  }
}

/**
 * Update MPK Mini LCD with NKS2 synth/page/parameter info.
 * Called by NKSManager.updateDisplay() on page change, instrument switch, or parameter edit.
 *
 * Updates both:
 * - Program name on OLED (synth type + page number)
 * - Knob names (so turning a knob shows the parameter name on the OLED)
 */
export function updateNKSDisplay(
  synthType: string,
  currentPage: number,
  totalPages: number,
  pageParams: NKSParameter[],
): void {
  const preset = getOrCreatePreset();

  // Program name: synth type + page indicator (16 chars)
  const pageStr = totalPages > 1 ? ` ${currentPage + 1}/${totalPages}` : '';
  const maxNameLen = PROGRAM_NAME_LENGTH - pageStr.length;
  const progName = synthType.substring(0, maxNameLen) + pageStr;
  setPresetString(preset, PROGRAM_NAME_OFFSET, progName, PROGRAM_NAME_LENGTH);

  // Knob names: abbreviated parameter names (shown on OLED when knob is turned)
  for (let i = 0; i < 8; i++) {
    const param = pageParams[i];
    const offset = KNOB_DATA_OFFSETS[i];

    if (param) {
      const name = (param.name || param.id)
        .replace(/Cutoff/i, 'Cut')
        .replace(/Resonance/i, 'Res')
        .replace(/Attack/i, 'Atk')
        .replace(/Decay/i, 'Dec')
        .replace(/Sustain/i, 'Sus')
        .replace(/Release/i, 'Rel')
        .replace(/Volume/i, 'Vol')
        .replace(/Feedback/i, 'Fdb')
        .replace(/Frequency/i, 'Frq')
        .replace(/Algorithm/i, 'Alg')
        .replace(/Overdrive/i, 'OD')
        .replace(/Waveform/i, 'Wav');
      setPresetString(preset, offset.name, name, KNOB_NAME_LENGTH);
    } else {
      setPresetString(preset, offset.name, `Knob ${i + 1}`, KNOB_NAME_LENGTH);
    }
  }

  // Fire-and-forget preset update (async but we don't await)
  sendPreset(preset).catch(() => {
    // Silently ignore - no MPK Mini connected is fine
  });
}
