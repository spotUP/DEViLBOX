/**
 * VSM (Voice Synthesis Memory) ROM Parser for TMS5220 Speak & Spell
 *
 * Parses LPC-encoded speech data from Texas Instruments Voice Synthesis Memory ROMs.
 * The Speak & Spell uses two 16KB VSM ROM chips (TMC0351 + TMC0352) containing
 * ~200 LPC-encoded words.
 *
 * LPC Frame format (TMS5220):
 * - Silent:   Energy=0 (4 bits total)
 * - Stop:     Energy=15 (4 bits total)
 * - Repeat:   Energy(4) + Repeat=1(1) + Pitch(6) = 11 bits
 * - Unvoiced: Energy(4) + Repeat=0(1) + Pitch=0(6) + K1-K4(5+5+4+4) = 29 bits
 * - Voiced:   Energy(4) + Repeat=0(1) + Pitch(6) + K1-K10(5+5+4+4+4+4+4+3+3+3) = 50 bits
 */

export interface LPCFrame {
  energy: number;    // Energy index 0-15 (0=silent, 15=stop)
  repeat: boolean;   // Repeat previous frame's K coefficients
  pitch: number;     // Pitch index 0-31 (0=unvoiced, TMC0281 5-bit)
  k: number[];       // K1-K10 indices (only present for non-repeat, non-silent frames)
  unvoiced: boolean; // true if pitch=0 (noise excitation)
}

export interface VSMWord {
  name: string;
  startBit: number;
  frames: LPCFrame[];
}

/**
 * Bit reader for serial ROM data
 */
class BitReader {
  private data: Uint8Array;
  private bitPos: number;

  constructor(data: Uint8Array, startBit = 0) {
    this.data = data;
    this.bitPos = startBit;
  }

  /** Read N bits from the bitstream (LSB first within each byte, matching MAME speechrom.cpp) */
  readBits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byteIndex = Math.floor(this.bitPos / 8);
      const bitIndex = this.bitPos % 8;
      if (byteIndex < this.data.length) {
        // MAME speechrom.cpp reads bits LSB first: (byte >> bitOffset) & 1
        const bit = (this.data[byteIndex] >> bitIndex) & 1;
        value = (value << 1) | bit;
      }
      this.bitPos++;
    }
    return value;
  }

  get position(): number {
    return this.bitPos;
  }

  set position(pos: number) {
    this.bitPos = pos;
  }

  get bytesRemaining(): number {
    return Math.floor((this.data.length * 8 - this.bitPos) / 8);
  }
}

/**
 * Parse a single LPC frame from a bitstream.
 * Returns null if the frame is a stop frame (energy=15).
 *
 * pitchBits selects the chip family: 5 for TMC0281/TMS5100/TMS5110 (0-31),
 * 6 for TMS5200/TMS5220 (0-63). The frame layout is identical otherwise.
 */
function parseLPCFrame(reader: BitReader, pitchBits = 5): LPCFrame | null {
  const energy = reader.readBits(4);

  // Silent frame (energy=0)
  if (energy === 0) {
    return {
      energy: 0,
      repeat: false,
      pitch: 0,
      k: [],
      unvoiced: false,
    };
  }

  // Stop frame (energy=15)
  if (energy === 15) {
    return null;
  }

  const repeat = reader.readBits(1) === 1;
  const pitch = reader.readBits(pitchBits); // TMC0281 uses 5-bit pitch (0-31), not 6-bit TMS5220
  const unvoiced = pitch === 0;

  if (repeat) {
    return { energy, repeat: true, pitch, k: [], unvoiced };
  }

  // K coefficients
  const k1 = reader.readBits(5);  // K1: 5-bit (0-31)
  const k2 = reader.readBits(5);  // K2: 5-bit (0-31)
  const k3 = reader.readBits(4);  // K3: 4-bit (0-15)
  const k4 = reader.readBits(4);  // K4: 4-bit (0-15)

  if (unvoiced) {
    // Unvoiced frames only have K1-K4
    return {
      energy, repeat: false, pitch, unvoiced: true,
      k: [k1, k2, k3, k4, 8, 8, 8, 4, 4, 4], // Default middle values for K5-K10
    };
  }

  // Voiced frames have all K1-K10
  const k5 = reader.readBits(4);  // K5: 4-bit (0-15)
  const k6 = reader.readBits(4);  // K6: 4-bit (0-15)
  const k7 = reader.readBits(4);  // K7: 4-bit (0-15)
  const k8 = reader.readBits(3);  // K8: 3-bit (0-7)
  const k9 = reader.readBits(3);  // K9: 3-bit (0-7)
  const k10 = reader.readBits(3); // K10: 3-bit (0-7)

  return {
    energy, repeat: false, pitch, unvoiced: false,
    k: [k1, k2, k3, k4, k5, k6, k7, k8, k9, k10],
  };
}

/**
 * Scan VSM ROM data to find word boundaries.
 *
 * Words are sequences of LPC frames terminated by either:
 * - A stop frame (energy=15)
 * - A long run of silence
 *
 * The approach: scan through the ROM bit-by-bit looking for valid frame sequences.
 * This is a heuristic since we don't have the address table from the MCU ROM.
 */
export function scanVSMForWords(romData: Uint8Array, maxWords = 256, pitchBits = 5): VSMWord[] {
  const words: VSMWord[] = [];
  const reader = new BitReader(romData);
  const totalBits = romData.length * 8;
  let wordIndex = 0;

  // Start at byte boundaries and try to find valid word sequences
  for (let startByte = 0; startByte < romData.length - 4 && wordIndex < maxWords; startByte++) {
    const startBit = startByte * 8;
    reader.position = startBit;

    // Try to parse a sequence of valid frames
    const frames: LPCFrame[] = [];
    let valid = true;
    let frameCount = 0;
    let silentCount = 0;

    while (valid && frameCount < 200) { // Max frames per word
      if (reader.position >= totalBits - 10) {
        valid = false;
        break;
      }

      const frame = parseLPCFrame(reader, pitchBits);

      if (frame === null) {
        // Stop frame - end of word
        if (frameCount >= 3) {
          // Valid word found (at least 3 non-trivial frames)
          break;
        }
        valid = false;
        break;
      }

      frames.push(frame);
      frameCount++;

      if (frame.energy === 0) {
        silentCount++;
        if (silentCount > 5) {
          // Too many consecutive silent frames - probably not a valid word
          valid = false;
          break;
        }
      } else {
        silentCount = 0;
      }
    }

    if (valid && frames.length >= 3) {
      // Check if this word overlaps with a previous one
      const overlaps = words.some(w => {
        const wEnd = w.startBit + 50 * w.frames.length; // Rough end estimate
        return startBit >= w.startBit && startBit < wEnd;
      });

      if (!overlaps) {
        words.push({
          name: `Word ${wordIndex}`,
          startBit,
          frames,
        });
        wordIndex++;

        // Skip past this word's data
        startByte = Math.floor(reader.position / 8);
      }
    }
  }

  return words;
}

/**
 * Parse LPC frames starting at a specific bit position.
 * Used for direct word address playback.
 *
 * pitchBits selects the chip family: 5 for TMC0281/TMS5100/TMS5110,
 * 6 for TMS5200/TMS5220.
 */
export function parseLPCFramesFromPosition(romData: Uint8Array, startBit: number, pitchBits = 5): LPCFrame[] {
  const reader = new BitReader(romData, startBit);
  const frames: LPCFrame[] = [];
  const totalBits = romData.length * 8;

  while (reader.position < totalBits - 10 && frames.length < 300) {
    const frame = parseLPCFrame(reader, pitchBits);
    if (frame === null) break; // Stop frame
    frames.push(frame);
  }

  return frames;
}

/**
 * The Speak & Spell VSM directory.
 *
 * The ROM is self-describing; nothing has to be guessed, and nothing has to be read out
 * of the MCU. Layout (confirmed against the ti_lpc reference implementation and by
 * decoding the shipped ROM):
 *
 *   byte 0-3     entry-byte count of each of the four spelling lists
 *   byte 4-11    16-bit LE start address of each of the four spelling lists
 *   byte 0x0C..  the system phrase table: one 16-bit LE address per entry
 *   list entries each word: 6-bit ASCII spelling (bit 0x40 marks the last letter)
 *                followed by the 16-bit LE address of its LPC recording
 *
 * The catch that made entries past the prompts play as noise: part of the system table
 * is INDIRECT. Those slots hold the address of a slot that holds the recording address,
 * so reading them as recording addresses lands in the middle of unrelated speech data.
 */
interface SystemEntry {
  name: string;
  indirect: boolean;
}

const SYSTEM_TABLE_START = 0x0c;

const SYSTEM_ENTRIES: SystemEntry[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(name => ({ name, indirect: false })),
  { name: '(beep)', indirect: false },
  ...['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN']
    .map(name => ({ name, indirect: false })),
  { name: '"that is correct"', indirect: false },
  { name: '"you are correct"', indirect: false },
  { name: '"that is right"', indirect: false },
  { name: '"you are right"', indirect: false },
  { name: '"wrong"', indirect: true },
  { name: '"that is incorrect"', indirect: true },
  { name: '"spell"', indirect: true },
  { name: '"now spell"', indirect: true },
  { name: '"next spell"', indirect: true },
  { name: '"now try"', indirect: true },
  { name: '"try"', indirect: true },
  { name: '"say it"', indirect: false },
  { name: '"I win"', indirect: false },
  { name: '"you win"', indirect: false },
  { name: '"here is your score"', indirect: true },
  { name: '"perfect score"', indirect: false },
  { name: '(tones 1)', indirect: false },
  { name: '(tones 2)', indirect: false },
  { name: '(tones 3)', indirect: false },
  { name: '(tones 4)', indirect: false },
];

const SPELLING_LIST_COUNT = 4;
const LETTER_BASE = 0x41;      // spelling bytes are ASCII minus 'A', six bits wide
const LAST_LETTER_FLAG = 0x40; // set on the final letter of a spelling
const MAX_SPELLING_LENGTH = 12;

/** Read a 16-bit little-endian value. */
function readAddress(rom: Uint8Array, at: number): number {
  return rom[at] | (rom[at + 1] << 8);
}

/** Decode one spelling-list entry: its spelled name and the address of its recording. */
function readSpellingEntry(rom: Uint8Array, wordPointer: number): { name: string; address: number } | null {
  let name = '';
  for (let i = 0; i < MAX_SPELLING_LENGTH; i++) {
    const byte = rom[wordPointer + i];
    if (byte === undefined) return null;
    const code = (byte & 0x3f) + LETTER_BASE;
    // 'A' + 0x1a lands on '[', which the ROM uses for the apostrophe in COULDN'T.
    name += String.fromCharCode(code === 0x5b ? 0x27 : code);
    if (byte & LAST_LETTER_FLAG) {
      return { name, address: readAddress(rom, wordPointer + i + 1) };
    }
  }
  return null;
}

/**
 * Read every recording the ROM declares: the system phrases first (letters, digits and
 * spoken prompts, in hardware order), then the four spelling lists with their real names.
 */
export function parseVSMDirectory(vsmRom: Uint8Array): VSMWord[] {
  const words: VSMWord[] = [];
  const inRom = (address: number) => address > 0 && address < vsmRom.length;

  SYSTEM_ENTRIES.forEach((entry, index) => {
    const slot = SYSTEM_TABLE_START + index * 2;
    if (slot + 1 >= vsmRom.length) return;
    let address = readAddress(vsmRom, slot);
    if (entry.indirect) {
      if (!inRom(address)) return;
      address = readAddress(vsmRom, address);
    }
    if (!inRom(address)) return;
    words.push({ name: entry.name, startBit: address * 8, frames: parseLPCFramesFromPosition(vsmRom, address * 8) });
  });

  for (let list = 0; list < SPELLING_LIST_COUNT; list++) {
    const entryBytes = vsmRom[list];
    const listAddress = readAddress(vsmRom, 4 + list * 2);
    if (!inRom(listAddress)) continue;
    for (let offset = 0; offset < entryBytes; offset += 2) {
      const wordPointer = readAddress(vsmRom, listAddress + offset);
      if (!inRom(wordPointer)) continue;
      const entry = readSpellingEntry(vsmRom, wordPointer);
      if (!entry || !inRom(entry.address)) continue;
      words.push({
        name: entry.name,
        startBit: entry.address * 8,
        frames: parseLPCFramesFromPosition(vsmRom, entry.address * 8),
      });
    }
  }

  return words;
}

