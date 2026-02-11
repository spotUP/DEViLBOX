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
  pitch: number;     // Pitch index 0-63 (0=unvoiced)
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

  /** Read N bits from the bitstream (MSB first, matching TMS5220 serial protocol) */
  readBits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byteIndex = Math.floor(this.bitPos / 8);
      const bitIndex = this.bitPos % 8;
      if (byteIndex < this.data.length) {
        // TMS5220 reads bits MSB first within each byte
        const bit = (this.data[byteIndex] >> (7 - bitIndex)) & 1;
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
 */
function parseLPCFrame(reader: BitReader): LPCFrame | null {
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
  const pitch = reader.readBits(6);
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
export function scanVSMForWords(romData: Uint8Array, maxWords = 256): VSMWord[] {
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

      const frame = parseLPCFrame(reader);

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
 */
export function parseLPCFramesFromPosition(romData: Uint8Array, startBit: number): LPCFrame[] {
  const reader = new BitReader(romData, startBit);
  const frames: LPCFrame[] = [];
  const totalBits = romData.length * 8;

  while (reader.position < totalBits - 10 && frames.length < 300) {
    const frame = parseLPCFrame(reader);
    if (frame === null) break; // Stop frame
    frames.push(frame);
  }

  return frames;
}

/**
 * Full Speak & Spell (US) vocabulary list.
 * Letters A-Z followed by ~200 spelling words from the 1978-1980 US models.
 * Order matches the VSM ROM address table layout.
 */
export const SPEAK_AND_SPELL_VOCABULARY: string[] = [
  // Letters A-Z (first 26 entries in the ROM address table)
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  // Vocabulary words (alphabetical as stored in the ROM)
  'ABOUT', 'AFTER', 'AGAIN', 'ANSWER', 'BEAUTY', 'BETWEEN', 'BOY', 'BUILT',
  'BUSY', 'BUY', 'CEILING', 'CIRCLE', 'CLOWN', 'COME', 'COULD', 'COUNTRY',
  'COUSIN', 'DOES', 'DOUBLE', 'ENOUGH', 'EVER', 'EYE', 'FRIEND', 'FROM',
  'GHOST', 'GIRL', 'GOES', 'GONE', 'GOOD', 'GREAT', 'GUARD', 'GUESS',
  'GYM', 'HALF', 'HAVE', 'HEART', 'HERE', 'HIDDEN', 'HOUR', 'IDEA',
  'ISLE', 'JOIN', 'KEY', 'KNOW', 'LAUGH', 'LEARN', 'LISTEN', 'LOVE',
  'MACHINE', 'MANY', 'MEANT', 'MOVE', 'NONE', 'OCEAN', 'OF', 'ONE',
  'ONLY', 'OTHER', 'OVEN', 'OUTSIDE', 'PEOPLE', 'PERIOD', 'PHONE', 'PIECE',
  'PRETTY', 'PROMISE', 'PSYCHOLOGY', 'QUIET', 'READY', 'RIGHT', 'ROUGH',
  'SAID', 'SAYS', 'SCHOOL', 'SCIENCE', 'SCISSORS', 'SECRET', 'SHOULD',
  'SIGN', 'SOME', 'SPECIAL', 'SQUARE', 'STRAIGHT', 'SUGAR', 'SURE',
  'THEIR', 'THERE', 'THEY', 'THOUGH', 'THOUGHT', 'THROUGH', 'TOGETHER',
  'TROUBLE', 'TWO', 'UPON', 'USUAL', 'VERY', 'WAS', 'WATCH', 'WATER',
  'WEAR', 'WEIRD', 'WHAT', 'WHERE', 'WHO', 'WOMEN', 'WON', 'WORD',
  'WORK', 'WOULD', 'WRITE', 'WRONG', 'YOU', 'YOUR', 'ZERO',
];

/**
 * Build word table by parsing the VSM ROM address table.
 *
 * The VSM ROM begins with a table of 16-bit little-endian byte addresses
 * used by the TMS6100 Read-and-Branch protocol. Each address has:
 * - Bits 13-0: byte address within a 16KB VSM chip
 * - Bits 15-14: chip select (0=first chip, 1=second chip)
 *
 * The MCU ROM parameter is reserved for future cross-referencing;
 * the primary address data is extracted from the VSM ROM itself.
 *
 * @param _mcuRom - MCU ROM data (reserved, not currently used)
 * @param vsmRom - Combined VSM ROM data (TMC0351 + TMC0352, 32KB)
 */
export function buildWordTableFromMCU(_mcuRom: Uint8Array, vsmRom: Uint8Array): VSMWord[] {
  const totalBytes = vsmRom.length;
  const words: VSMWord[] = [];

  // Scan the beginning of the VSM ROM for the address table.
  // Read 16-bit LE values and convert to combined byte offsets.
  // The table ends when we encounter a value that points outside the ROM
  // or when parsed LPC frames at the target address are too short.
  const maxTableBytes = Math.min(1024, totalBytes);
  const addresses: Array<{ byteOffset: number; tableOffset: number }> = [];

  for (let off = 0; off < maxTableBytes; off += 2) {
    const raw = vsmRom[off] | (vsmRom[off + 1] << 8);
    const chip = (raw >> 14) & 3;
    const addr = raw & 0x3FFF;
    const combinedByte = chip * 16384 + addr;

    // Must point within the ROM and past the table area itself
    if (combinedByte >= totalBytes) break;

    // Validate: try to parse LPC frames at this byte address
    const frames = parseLPCFramesFromPosition(vsmRom, combinedByte * 8);
    if (frames.length >= 3) {
      addresses.push({ byteOffset: combinedByte, tableOffset: off });
    } else if (addresses.length > 10) {
      // Once we've found many valid entries, a failed parse likely means table end
      break;
    }
  }

  // Name words from the vocabulary list
  for (let i = 0; i < addresses.length; i++) {
    const name = i < SPEAK_AND_SPELL_VOCABULARY.length
      ? SPEAK_AND_SPELL_VOCABULARY[i]
      : `Word ${i}`;
    const startBit = addresses[i].byteOffset * 8;
    const frames = parseLPCFramesFromPosition(vsmRom, startBit);
    words.push({ name, startBit, frames });
  }

  return words;
}

/**
 * @deprecated Use buildWordTableFromMCU or scanVSMForWords instead.
 * Kept for backwards compatibility.
 */
export const SPEAK_AND_SPELL_WORDS: Array<{ name: string; offset: number }> =
  SPEAK_AND_SPELL_VOCABULARY.slice(0, 26).map((name, i) => ({
    name,
    offset: 0x0010 + i * 0x0090, // Approximate offsets for A-Z
  }));
