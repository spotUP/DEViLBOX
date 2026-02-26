/**
 * SoundFactoryParser.ts — Sound Factory (PSF) native parser
 *
 * Sound Factory is an Amiga sequencer/tracker format by Antti Silvast.
 * Files use extension .psf. The format uses an opcode-based scripting system
 * with up to 4 channels and up to 16 sub-songs. Instruments are defined
 * inline via the DefineInstrument opcode (0x84) embedded in the opcode stream.
 *
 * Reference: NostalgicPlayer SoundFactoryWorker.cs (authoritative loader)
 * Reference spec: thoughts/shared/research/nostalgicplayer/Sound Factory.txt
 * Reference containers: SoundFactory/Containers/*.cs
 *
 * File layout (big-endian):
 *   0x000   4 bytes  Module length (uint32 BE)
 *   0x004  16 bytes  Voice count for sub-songs 0-15 (1 byte each; 0=unused)
 *   0x014  256 bytes Subsong opcode start offsets: 16 subsongs × 4 channels × uint32
 *                   (each offset is file-relative from start; subtract 276 for opcodes-relative)
 *   0x114  N bytes  Opcodes (at absolute offset 276 = 0x114)
 *
 * Detection:
 *   - file length >= 276 (header size = 4 + 16 + 256 = 276)
 *   - moduleLength (at 0x000) <= file length
 *   - all 16 voice counts <= 15 (4-bit channel mask)
 *   - all offsets <= file length
 *   - minOffset of all non-zero offsets == 276 (opcodes start exactly at 0x114)
 *
 * Opcodes (0x80-0xFF are control; 0x00-0x7F are notes followed by uint16 duration):
 *   0x80 xxxx        Pause (xxxx = duration in ticks)
 *   0x81 xx          Set volume
 *   0x82 xx          Set finetune
 *   0x83 xx          Use instrument (by slot index)
 *   0x84 xx yyyy     Define instrument (xx = slot, yyyy = word count of instrument data)
 *   0x85             Return from subroutine
 *   0x86 xxxxxxxx    GoSub (relative signed int32 offset)
 *   0x87 xxxxxxxx    Goto (relative signed int32 offset)
 *   0x88 xx          For loop (xx times)
 *   0x89             Next (end of For loop)
 *   0x8A xx          FadeOut (speed xx)
 *   0x8B             Nop
 *   0x8C             Request
 *   0x8D             Loop (restart voice from beginning)
 *   0x8E             End (mute voice and stop)
 *   0x8F xx          FadeIn (speed xx)
 *   0x90 aa dd ss rr Set ADSR
 *   0x91             OneShot (do not loop sample)
 *   0x92             Looping (loop sample)
 *   0x93 on/off ...  Vibrato
 *   0x94 on/off ...  Arpeggio
 *   0x95 on/off ...  Phasing
 *   0x96 on/off ...  Portamento
 *   0x97 on/off ...  Tremolo
 *   0x98 on/off ...  Filter
 *   0x99 xxxx        StopAndPause (xxxx = duration)
 *   0x9A xx          LED (xx=0 off, else on)
 *   0x9B xx          WaitForRequest
 *   0x9C xx          SetTranspose
 *
 * Instrument data (DefineInstrument payload, starts 4 bytes after opcode):
 *   0x00  2  SampleLength (in words)
 *   0x02  2  SamplingPeriod (0 if default)
 *   0x04  1  EffectByte flags (bit0=OneShot, bit1=Vibrato, etc.)
 *   ... (see Sound Factory.txt for full layout)
 *   0x22  SampleLength*2  signed PCM sample data
 *
 * Extensions: .psf
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ──────────────────────────────────────────────────────────────

const HEADER_SIZE = 276;       // 4 + 16 + 256
const PAL_CLOCK = 3546895;

// Opcode enum (matches SoundFactory/Containers/Opcode.cs)
const enum Op {
  Pause        = 0x80,
  SetVolume    = 0x81,
  SetFineTune  = 0x82,
  UseInstrument = 0x83,
  DefineInstrument = 0x84,
  Return       = 0x85,
  GoSub        = 0x86,
  Goto         = 0x87,
  For          = 0x88,
  Next         = 0x89,
  FadeOut      = 0x8A,
  Nop          = 0x8B,
  Request      = 0x8C,
  Loop         = 0x8D,
  End          = 0x8E,
  FadeIn       = 0x8F,
  SetAdsr      = 0x90,
  OneShot      = 0x91,
  Looping      = 0x92,
  Vibrato      = 0x93,
  Arpeggio     = 0x94,
  Phasing      = 0x95,
  Portamento   = 0x96,
  Tremolo      = 0x97,
  Filter       = 0x98,
  StopAndPause = 0x99,
  Led          = 0x9A,
  WaitForRequest = 0x9B,
  SetTranspose = 0x9C,
}

// Period table for note-to-XM mapping (12 notes × 8 octaves, PAL Amiga)
// SampleTable from Tables.cs: used with MultiplyTable for period calculation
// Standard period table for note-to-frequency:
const PSF_PERIODS = [
  // Octave 1 (C-1 to B-1)
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // Octave 2
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // Octave 3
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  // Octave 4
  107, 101,  95,  90,  85,  80,  75,  71,  67,  63,  60,  56,
  // Octave 5
   53,  50,  47,  45,  42,  40,  37,  35,  33,  31,  30,  28,
  // Octave 6
   26,  25,  23,  22,  21,  20,  18,  17,  16,  15,  15,  14,
  // Octave 7
   13,  12,  11,  11,  10,  10,   9,   8,   8,   7,   7,   7,
  // Octave 8
    6,   6,   5,   5,   5,   5,   4,   4,   4,   3,   3,   3,
];

// ── Utility ────────────────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number { return buf[off]; }
function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}
function s32BE(buf: Uint8Array, off: number): number {
  const v = ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]);
  return v | 0; // sign-extend to int32
}
function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function periodToFreq(period: number): number {
  if (period <= 0) return 8287;
  return Math.round(PAL_CLOCK / (2 * period));
}

/** PSF note byte (0x00-0x7F) to XM note.
 *  Notes are encoded directly as indices into a period table (12 per octave).
 *  0x00-0x0B = octave 1, 0x0C-0x17 = octave 2, etc.
 */
function psfNoteToXm(noteByte: number): number {
  if (noteByte > 0x7F) return 0;
  // Map to XM: note 0 → C-1 (XM note 13)
  const xmNote = noteByte + 13;
  return Math.max(1, Math.min(96, xmNote));
}

/** Calculate Amiga period from PSF instrument sampling period + note.
 *  Uses the SampleTable and MultiplyTable from Tables.cs.
 */
function calculatePeriod(samplingPeriod: number, noteIdx: number): number {
  if (samplingPeriod === 0) {
    // No fixed sampling period: use period table directly
    const idx = Math.max(0, Math.min(PSF_PERIODS.length - 1, noteIdx));
    return PSF_PERIODS[idx];
  }
  // With sampling period: C3 = samplingPeriod at octave/note offset
  // Tables.MultiplyTable[12] and SampleTable[12] used in the player
  // Simplified: return fixed period based on samplingPeriod
  return samplingPeriod;
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` is a Sound Factory (.psf) module.
 * Based on NostalgicPlayer's Identify() method.
 */
export function isSoundFactoryFormat(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_SIZE) return false;

  const moduleLength = u32BE(bytes, 0);
  if (moduleLength > bytes.length) return false;

  // Check voice counts (bytes 4-19, one per subsong)
  for (let i = 0; i < 16; i++) {
    if (u8(bytes, 4 + i) > 15) return false;
  }

  // Check opcode start offsets (bytes 20 - 275, 64 × uint32)
  let minOffset = 0xffffffff;
  for (let i = 0; i < 4 * 16; i++) {
    const offset = u32BE(bytes, 20 + i * 4);
    if (offset > bytes.length) return false;
    if (offset > 0 && offset < minOffset) minOffset = offset;
  }

  // minOffset must be exactly HEADER_SIZE (276)
  if (minOffset !== HEADER_SIZE) return false;

  return true;
}

// ── Instrument extraction (scan opcode stream) ─────────────────────────────

interface PSFInstrument {
  offset: number;         // offset in opcodes array where this instrument was defined
  sampleLength: number;   // in words
  samplingPeriod: number;
  effectByte: number;
  sampleData: Int8Array;
  name: string;
}

/**
 * Scan the opcode stream starting at `startOffset` to find all DefineInstrument
 * opcodes and extract inline sample data.
 */
function findInstruments(
  opcodes: Uint8Array,
  startOffset: number,
  visitedOffsets: Set<number>,
  instruments: Map<number, PSFInstrument>,
): void {
  let offset = startOffset;
  const maxOffset = opcodes.length;

  while (offset < maxOffset) {
    if (visitedOffsets.has(offset)) return;
    visitedOffsets.add(offset);

    const opcode = u8(opcodes, offset++);

    if (opcode < 0x80) {
      // Note: followed by uint16 duration
      offset += 2;
      continue;
    }

    switch (opcode) {
      case Op.Next:
      case Op.Nop:
      case Op.Request:
      case Op.OneShot:
      case Op.Looping:
        break;

      case Op.SetVolume:
      case Op.SetFineTune:
      case Op.UseInstrument:
      case Op.For:
      case Op.FadeOut:
      case Op.FadeIn:
      case Op.Led:
      case Op.WaitForRequest:
      case Op.SetTranspose:
        offset += 1;
        break;

      case Op.Pause:
      case Op.StopAndPause:
        offset += 2;
        break;

      case Op.Portamento:
      case Op.Tremolo:
      case Op.Filter: {
        if (offset >= maxOffset) return;
        const enable = u8(opcodes, offset++) !== 0;
        if (enable) offset += 3;
        break;
      }

      case Op.Arpeggio: {
        if (offset >= maxOffset) return;
        const enable = u8(opcodes, offset++) !== 0;
        if (enable) offset += 1;
        break;
      }

      case Op.Vibrato:
      case Op.Phasing: {
        if (offset >= maxOffset) return;
        const enable = u8(opcodes, offset++) !== 0;
        if (enable) offset += 4;
        break;
      }

      case Op.SetAdsr: {
        // aa dd ss rr (4 bytes, but release flag determines +1 more)
        if (offset + 3 >= maxOffset) return;
        offset += 3;
        const releaseEnabled = u8(opcodes, offset++) !== 0;
        if (releaseEnabled) offset += 1;
        break;
      }

      case Op.DefineInstrument: {
        // 0x84 xx yyyy  (1 byte slot + 2 byte word count)
        if (offset + 3 > maxOffset) return;
        offset++;  // skip slot number
        const wordCount = u16BE(opcodes, offset); offset += 2;

        // Instrument data starts here
        const instrOffset = offset;

        if (!instruments.has(instrOffset) && instrOffset + 4 <= maxOffset) {
          const instr = fetchInstrument(opcodes, instrOffset);
          instruments.set(instrOffset, instr);
        }

        // Skip rest of instrument definition
        // wordCount*2 total bytes INCLUDING the 4 bytes of wordCount+slot we already consumed
        const remaining = wordCount * 2 - 4;
        if (remaining > 0) offset += remaining;
        break;
      }

      case Op.Return:
        return;

      case Op.GoSub: {
        if (offset + 4 > maxOffset) return;
        const rel = s32BE(opcodes, offset); offset += 4;
        const target = (offset + rel) >>> 0;
        if (target < maxOffset && !visitedOffsets.has(target)) {
          findInstruments(opcodes, target, visitedOffsets, instruments);
        }
        break;
      }

      case Op.Goto: {
        if (offset + 4 > maxOffset) return;
        const rel = s32BE(opcodes, offset); offset += 4;
        offset = (offset + rel) >>> 0;
        if (visitedOffsets.has(offset)) return;
        break;
      }

      case Op.Loop:
      case Op.End:
        return;

      default:
        break;
    }
  }
}

function fetchInstrument(opcodes: Uint8Array, offset: number): PSFInstrument {
  let off = offset;
  const maxOff = opcodes.length;

  const sampleLength   = off + 2 <= maxOff ? u16BE(opcodes, off) : 0; off += 2;
  const samplingPeriod = off + 2 <= maxOff ? u16BE(opcodes, off) : 0; off += 2;
  const effectByte     = off < maxOff ? u8(opcodes, off++) : 0;

  // Skip: tremoloSpeed(1) + tremoloStep(1) + tremoloRange(1) = 3
  off += 3;
  // portamentoStep(2) + portamentoSpeed(1) + arpeggioSpeed(1) = 4
  off += 4;
  // vibratoDelay(1) + vibratoSpeed(1) + vibratoStep(1) + vibratoAmount(1) = 4
  off += 4;
  // attackTime(1) + decayTime(1) + sustainLevel(1) + releaseTime(1) = 4
  off += 4;
  // phasingStart(1) + phasingEnd(1) + phasingSpeed(1) + phasingStep(1) = 4
  off += 4;
  // waveCount(1) + octave(1) = 2
  off += 2;
  // filterFrequency(1) + filterEnd(1) + filterSpeed(1) = 3
  off += 3;
  // padding(1) = 1
  off += 1;
  // DASR_SustainOffset(2) + DASR_ReleaseOffset(2) = 4
  off += 4;

  // Sample data: sampleLength words (signed bytes)
  const dataLen = sampleLength * 2;
  let sampleData: Int8Array;
  if (dataLen > 0 && off + dataLen <= maxOff) {
    sampleData = new Int8Array(dataLen);
    for (let i = 0; i < dataLen; i++) {
      sampleData[i] = (opcodes[off + i] < 128 ? opcodes[off + i] : opcodes[off + i] - 256);
    }
  } else {
    sampleData = new Int8Array(0);
  }

  return { offset, sampleLength, samplingPeriod, effectByte, sampleData, name: '' };
}

// ── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse a Sound Factory (.psf) file and return a TrackerSong.
 * Returns null if the file cannot be parsed.
 */
export function parseSoundFactoryFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isSoundFactoryFormat(bytes)) return null;

  const moduleLength = u32BE(bytes, 0);

  // ── Load sub-songs ────────────────────────────────────────────────────
  interface SongInfo {
    enabledChannels: number;
    opcodeStartOffsets: number[]; // relative to opcodes (i.e. file offset - HEADER_SIZE)
  }

  const songInfoList: SongInfo[] = [];
  const voiceCounts: number[] = [];
  for (let i = 0; i < 16; i++) {
    voiceCounts.push(u8(bytes, 4 + i));
  }

  // Read offsets: 16 subsongs × 4 channels × uint32
  // But we only add subsongs where voiceCount > 0
  const rawOffsets: number[][] = [];
  for (let i = 0; i < 16; i++) {
    const row: number[] = [];
    for (let ch = 0; ch < 4; ch++) {
      row.push(u32BE(bytes, 20 + (i * 4 + ch) * 4));
    }
    rawOffsets.push(row);
  }

  // Collect valid subsongs and convert offsets to opcodes-relative
  let offsetIdx = 0;
  for (let i = 0; i < 16; i++) {
    const ch = voiceCounts[i];
    if (ch === 0) { offsetIdx++; continue; }

    const row = rawOffsets[offsetIdx++];
    const relOffsets = row.map(o => o > 0 ? o - HEADER_SIZE : 0);

    songInfoList.push({
      enabledChannels: ch,
      opcodeStartOffsets: relOffsets,
    });
  }

  if (songInfoList.length === 0) return null;

  // ── Load opcode stream ─────────────────────────────────────────────────
  const opcodeLen = moduleLength > HEADER_SIZE ? moduleLength - HEADER_SIZE : 0;
  if (opcodeLen === 0 || HEADER_SIZE + opcodeLen > bytes.length) return null;

  const opcodes = bytes.slice(HEADER_SIZE, HEADER_SIZE + opcodeLen);

  // ── Find instruments by scanning opcode stream ─────────────────────────
  const instruments = new Map<number, PSFInstrument>();
  const visitedOffsets = new Set<number>();

  for (const song of songInfoList) {
    for (let ch = 0; ch < 4; ch++) {
      const startOffset = song.opcodeStartOffsets[ch];
      if (startOffset < opcodeLen) {
        findInstruments(opcodes, startOffset, visitedOffsets, instruments);
      }
    }
  }

  // Assign sequential instrument numbers
  const instrArray: PSFInstrument[] = [];
  const instrOffsetToId = new Map<number, number>();
  let instrIdCounter = 1;
  for (const [offset, instr] of instruments) {
    instrArray.push(instr);
    instrOffsetToId.set(offset, instrIdCounter++);
  }

  // ── Build InstrumentConfig[] ──────────────────────────────────────────
  const instrConfigs: InstrumentConfig[] = [];

  for (let idx = 0; idx < instrArray.length; idx++) {
    const instr = instrArray[idx];
    const id = idx + 1;
    const isOneShot = (instr.effectByte & 0x01) !== 0;

    if (instr.sampleData.length > 0) {
      // Convert signed to unsigned PCM
      const rawPcm = new Uint8Array(instr.sampleData.length);
      for (let i = 0; i < instr.sampleData.length; i++) {
        rawPcm[i] = (instr.sampleData[i] + 128) & 0xff;
      }

      const c3Rate = instr.samplingPeriod > 0
        ? periodToFreq(instr.samplingPeriod)
        : periodToFreq(214);

      const loopStart = isOneShot ? 0 : 0;
      const loopEnd   = isOneShot ? 0 : rawPcm.length;

      instrConfigs.push(
        createSamplerInstrument(id, `Instrument ${id}`, rawPcm, 64, c3Rate, loopStart, loopEnd)
      );
    } else {
      instrConfigs.push({
        id,
        name: `Instrument ${id}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // ── Extract notes from opcode stream ──────────────────────────────────
  // Walk the opcode stream for each channel of the first sub-song and extract
  // note events with their durations. Convert to a flat sequence of rows.

  interface NoteEvent {
    note: number;       // XM note number (0 = no note)
    instrId: number;    // instrument ID (0 = no instrument)
    volume: number;     // 0-64
    duration: number;   // ticks
  }

  function extractNotesFromVoice(startOffset: number): NoteEvent[] {
    const events: NoteEvent[] = [];
    let offset = startOffset;
    let currentInstrId = 0;
    let currentVolume = 64;
    const callStack: number[] = [];
    const forStack: Array<{ count: number; returnOffset: number }> = [];
    const visitedNote = new Set<number>();
    let steps = 0;

    while (offset < opcodes.length && steps < 65536) {
      steps++;

      const opcode = u8(opcodes, offset++);

      if (opcode < 0x80) {
        // Note (0x00-0x7F) followed by uint16 duration
        if (visitedNote.has(offset - 1)) {
          // Loop detected — stop
          break;
        }
        if (offset + 2 > opcodes.length) break;
        const duration = u16BE(opcodes, offset); offset += 2;
        const xmNote = psfNoteToXm(opcode);
        events.push({ note: xmNote, instrId: currentInstrId, volume: currentVolume, duration });
        continue;
      }

      switch (opcode) {
        case Op.Pause:
        case Op.StopAndPause: {
          if (offset + 2 > opcodes.length) return events;
          const dur = u16BE(opcodes, offset); offset += 2;
          events.push({ note: 0, instrId: 0, volume: 0, duration: dur });
          if (opcode === Op.StopAndPause) return events;
          break;
        }

        case Op.SetVolume:
          if (offset < opcodes.length) currentVolume = Math.min(64, u8(opcodes, offset++));
          break;

        case Op.SetFineTune:
        case Op.UseInstrument: {
          if (offset < opcodes.length) {
            const slot = u8(opcodes, offset++);
            if (opcode === Op.UseInstrument) {
              // Find instrument by slot index (sequential order)
              if (slot < instrArray.length) {
                currentInstrId = slot + 1;
              }
            }
          }
          break;
        }

        case Op.DefineInstrument: {
          if (offset + 3 > opcodes.length) return events;
          offset++; // slot
          const wordCount = u16BE(opcodes, offset); offset += 2;
          const instrOffset = offset;
          currentInstrId = instrOffsetToId.get(instrOffset) ?? currentInstrId;
          const remaining = wordCount * 2 - 4;
          if (remaining > 0) offset += remaining;
          break;
        }

        case Op.Return:
          if (callStack.length > 0) {
            offset = callStack.pop()!;
          } else {
            return events;
          }
          break;

        case Op.GoSub: {
          if (offset + 4 > opcodes.length) return events;
          const rel = s32BE(opcodes, offset); offset += 4;
          callStack.push(offset);
          offset = (offset - 4 + rel) >>> 0;
          break;
        }

        case Op.Goto: {
          if (offset + 4 > opcodes.length) return events;
          const rel = s32BE(opcodes, offset); offset += 4;
          offset = (offset - 4 + rel) >>> 0;
          break;
        }

        case Op.For: {
          if (offset < opcodes.length) {
            const count = u8(opcodes, offset++);
            forStack.push({ count, returnOffset: offset });
          }
          break;
        }

        case Op.Next: {
          if (forStack.length > 0) {
            const top = forStack[forStack.length - 1];
            top.count--;
            if (top.count > 0) {
              offset = top.returnOffset;
            } else {
              forStack.pop();
            }
          }
          break;
        }

        case Op.Loop:
          // Restart from beginning — stop extraction to avoid infinite loop
          return events;

        case Op.End:
          return events;

        case Op.Nop:
        case Op.Request:
        case Op.OneShot:
        case Op.Looping:
          break;

        case Op.FadeOut:
        case Op.FadeIn:
        case Op.Led:
        case Op.WaitForRequest:
        case Op.SetTranspose:
          if (offset < opcodes.length) offset++;
          break;

        case Op.Portamento:
        case Op.Tremolo:
        case Op.Filter: {
          if (offset >= opcodes.length) return events;
          const enable = u8(opcodes, offset++) !== 0;
          if (enable) offset += 3;
          break;
        }

        case Op.Arpeggio: {
          if (offset >= opcodes.length) return events;
          const enable = u8(opcodes, offset++) !== 0;
          if (enable) offset += 1;
          break;
        }

        case Op.Vibrato:
        case Op.Phasing: {
          if (offset >= opcodes.length) return events;
          const enable = u8(opcodes, offset++) !== 0;
          if (enable) offset += 4;
          break;
        }

        case Op.SetAdsr: {
          if (offset + 3 >= opcodes.length) return events;
          offset += 3;
          const releaseEnabled = u8(opcodes, offset++) !== 0;
          if (releaseEnabled) offset += 1;
          break;
        }

        default:
          break;
      }
    }

    return events;
  }

  // ── Build patterns from first sub-song ───────────────────────────────
  const song0 = songInfoList[0];
  const NUM_CHANNELS = 4;
  const ROWS_PER_PATTERN = 64;
  const AMIGA_PAN = [-50, 50, 50, -50]; // LRRL

  // Extract note events for each channel
  const channelEvents: NoteEvent[][] = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const startOff = song0.opcodeStartOffsets[ch];
    const enabled = (song0.enabledChannels & (1 << ch)) !== 0;
    if (enabled && startOff < opcodes.length) {
      channelEvents.push(extractNotesFromVoice(startOff));
    } else {
      channelEvents.push([]);
    }
  }

  // Convert note events (with tick durations) to flat pattern rows
  // Duration of 1 tick = 1 row (simplification; actual tick depends on tempo)
  function eventsToRows(events: NoteEvent[]): TrackerCell[] {
    const rows: TrackerCell[] = [];
    for (const ev of events) {
      // First row has the note, remaining rows are empty
      rows.push({
        note: ev.note,
        instrument: ev.instrId,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0,
      });
      for (let d = 1; d < ev.duration; d++) {
        rows.push(emptyCell());
      }
    }
    return rows.length > 0 ? rows : [emptyCell()];
  }

  const flatChannelRows = channelEvents.map(eventsToRows);

  // Calculate total rows
  const maxRows = Math.max(...flatChannelRows.map(r => r.length), 1);
  const numPatterns = Math.ceil(maxRows / ROWS_PER_PATTERN);

  const trackerPatterns: Pattern[] = [];

  for (let p = 0; p < numPatterns; p++) {
    const startRow = p * ROWS_PER_PATTERN;
    const endRow = Math.min(startRow + ROWS_PER_PATTERN, maxRows);
    const patLen = endRow - startRow;

    const channelRows: TrackerCell[][] = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows: TrackerCell[] = [];
      const src = flatChannelRows[ch];
      for (let r = 0; r < patLen; r++) {
        const globalRow = startRow + r;
        rows.push(globalRow < src.length ? src[globalRow] : emptyCell());
      }
      channelRows.push(rows);
    }

    trackerPatterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: patLen,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: AMIGA_PAN[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'PSF',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instrConfigs.length,
      },
    });
  }

  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, NUM_CHANNELS, ROWS_PER_PATTERN));
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name: moduleName,
    format: 'PSF' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeEmptyPattern(filename: string, numChannels: number, rowCount: number): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: rowCount,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rowCount }, () => emptyCell()),
    })),
    importMetadata: {
      sourceFormat: 'PSF',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0,
    },
  };
}
