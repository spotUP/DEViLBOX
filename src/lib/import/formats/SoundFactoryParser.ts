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
import { soundFactoryPcmBytes } from './soundFactoryInstrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeSoundFactoryCell } from '@/engine/uade/encoders/SoundFactoryEncoder';
import { createSamplerInstrument } from './AmigaUtils';
import { readSfInstrParams, SF_INSTR_HEADER_SIZE, type SfInstrParams } from './soundFactoryInstrumentParams';
import { buildSfGrid, type SfEffect } from './soundFactoryGrid';
import { sfDecodeOperands, sfPresenceEffect } from './soundFactoryEffects';
import {
  soundFactoryGridNote, soundFactoryOpcodeFor, soundFactoryPeriodMultiplier,
  SOUND_FACTORY_EMPTY_INSTRUMENT, type SoundFactoryPitchParams,
} from './soundFactoryPitch';

// ── Constants ──────────────────────────────────────────────────────────────

const HEADER_SIZE = 276;       // 4 + 16 + 256
const PAL_CLOCK = 3546895;

// Opcode constants (matches SoundFactory/Containers/Opcode.cs)
const Op = {
  Pause        : 0x80,
  SetVolume    : 0x81,
  SetFineTune  : 0x82,
  UseInstrument: 0x83,
  DefineInstrument: 0x84,
  Return       : 0x85,
  GoSub        : 0x86,
  Goto         : 0x87,
  For          : 0x88,
  Next         : 0x89,
  FadeOut      : 0x8A,
  Nop          : 0x8B,
  Request      : 0x8C,
  Loop         : 0x8D,
  End          : 0x8E,
  FadeIn       : 0x8F,
  SetAdsr      : 0x90,
  OneShot      : 0x91,
  Looping      : 0x92,
  Vibrato      : 0x93,
  Arpeggio     : 0x94,
  Phasing      : 0x95,
  Portamento   : 0x96,
  Tremolo      : 0x97,
  Filter       : 0x98,
  StopAndPause : 0x99,
  Led          : 0x9A,
  WaitForRequest: 0x9B,
  SetTranspose : 0x9C,
} as const;
type Op = typeof Op[keyof typeof Op];


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

/** The header fields the replayer's period math reads (soundFactoryPitch.ts). */
function pitchParams(instr: PSFInstrument): SoundFactoryPitchParams {
  return {
    samplingPeriod: instr.samplingPeriod,
    octave: instr.octave,
    waveCount: instr.waveCount,
    sampleLength: instr.sampleLength,
    looped: (instr.effectByte & 0x01) === 0 && instr.sampleData.length > 0,
  };
}

/** soundfactory.c's sf_default_instrument_template (sample_length 1, sampling_period 0, wave_count 1, octave 0): plays before any instrument is selected. */
const EMPTY_INSTRUMENT_PITCH = SOUND_FACTORY_EMPTY_INSTRUMENT;

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
  waveCount: number;      // header +24
  octave: number;         // header +25: octave at which samplingPeriod plays unchanged
  params: SfInstrParams;  // every record field (soundFactoryInstrumentParams.ts)
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

/** The editable record of an instrument: its parameters and the file offset of its DefineInstr record. */
function sfInstrumentMeta(instr: PSFInstrument): { params: SfInstrParams; recordOffset: number } {
  return { params: { ...instr.params }, recordOffset: HEADER_SIZE + instr.offset };
}

function fetchInstrument(opcodes: Uint8Array, offset: number): PSFInstrument {
  const maxOff = opcodes.length;
  const params = readSfInstrParams(opcodes, offset);
  const { sampleLength, samplingPeriod, effectByte, octave } = params;
  const waveCount = offset + 24 < maxOff ? params.waveCount : 1;
  const off = offset + SF_INSTR_HEADER_SIZE;

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

  return { offset, sampleLength, samplingPeriod, effectByte, waveCount, octave, params, sampleData, name: '' };
}

// ── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse a Sound Factory (.psf) file and return a TrackerSong.
 * Returns null if the file cannot be parsed.
 */
export function parseSoundFactoryFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  return parseSoundFactoryWithEffects(bytes, filename)?.song ?? null;
}

/** The parse plus, per voice, the file offset of every effect operand cell (global row -> slot offsets, -1 none). */
export interface NoteEvent {
  note: number;       // XM note number (0 = no note)
  instrId: number;    // instrument ID (0 = no instrument)
  volume: number;     // 0-64
  duration: number;   // ticks
  isNote: boolean;    // false: a pause
  fileOffset: number; // absolute file offset of this opcode (-1 if none)
  effects?: SfEffect[]; // effect opcodes that take effect at this event
}

export interface SoundFactoryParse {
  song: TrackerSong;
  effectOffsets: Array<Map<number, number[]>>;
  /** Per voice, the events of the walk in stream order (the lossless writer's view of the voice). */
  voiceEvents: NoteEvent[][];
  /** Per voice and global row: index into voiceEvents of the event the row's file offset names, -1 none. */
  anchors: number[][];
  /** Per event opcode file offset: the instrument pitch and transpose in force there. */
  eventContext: Map<number, { pitch: SoundFactoryPitchParams; transpose: number }>;
  /** Effect operands in the stream walk vs. placed in a cell slot, and per effect id. */
  effectsSeen: number;
  effectsPlaced: number;
  effectCounts: Map<number, { seen: number; placed: number }>;
}

export function parseSoundFactoryWithEffects(bytes: Uint8Array, filename: string): SoundFactoryParse | null {
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
  // Replayer pitch inputs per instrument id-1 (grid naming, playback rate, codec inverse).
  const instrPitch: SoundFactoryPitchParams[] = instrArray.map(pitchParams);
  // Per note-opcode file offset: the instrument pitch and transpose in force there, so
  // decodeCell names a stored opcode exactly as the import walk did.
  const cellContext = new Map<number, { pitch: SoundFactoryPitchParams; transpose: number }>();
  const pitchForInstrument = (instrument: number): SoundFactoryPitchParams =>
    instrument > 0 && instrument <= instrPitch.length ? instrPitch[instrument - 1] : EMPTY_INSTRUMENT_PITCH;

  // ── Build InstrumentConfig[] ──────────────────────────────────────────
  const instrConfigs: InstrumentConfig[] = [];

  for (let idx = 0; idx < instrArray.length; idx++) {
    const instr = instrArray[idx];
    const id = idx + 1;
    const isOneShot = (instr.effectByte & 0x01) !== 0;

    if (instr.sampleData.length > 0) {
      // Raw two's-complement bytes, as createSamplerInstrument expects (soundFactoryInstrument.ts)
      const rawPcm = soundFactoryPcmBytes(instr.sampleData);

      const c3Rate = instr.samplingPeriod > 0
        ? periodToFreq(instr.samplingPeriod)
        : periodToFreq(214);

      const loopStart = isOneShot ? 0 : 0;
      const loopEnd   = isOneShot ? 0 : rawPcm.length;

      // Period playback at the instrument's own multiplier: grid notes name the audible pitch
      // (soundFactoryPitch.ts), so note N must play the replayer's byte rate, not N's MOD rate.
      const pitch = instrPitch[idx];
      const cfg = createSamplerInstrument(id, '', rawPcm, 64, c3Rate, loopStart, loopEnd);
      if (cfg.metadata?.modPlayback) cfg.metadata.modPlayback.periodMultiplier = soundFactoryPeriodMultiplier(pitch);
      cfg.metadata = { ...cfg.metadata, soundFactoryPitch: pitch, soundFactoryInstrument: sfInstrumentMeta(instr) };
      instrConfigs.push(cfg);
    } else {
      instrConfigs.push({
        id,
        name: '',
        type: 'synth' as const,
        synthType: 'SoundFactory2WasmSynth' as const,
        effects: [],
        volume: 0,
        pan: 0,
        metadata: { soundFactoryInstrument: sfInstrumentMeta(instr) },
      } as InstrumentConfig);
    }
  }

  // ── Extract notes from opcode stream ──────────────────────────────────
  // Walk the opcode stream for each channel of the first sub-song and extract
  // note events with their durations. Convert to a flat sequence of rows.

  /** Walk one voice's stream into `events`; effect opcodes wait in `pending` for the next note or pause. */
  function walkVoice(startOffset: number, events: NoteEvent[], pending: SfEffect[]): void {
    let offset = startOffset;
    let currentInstrId = 0;
    let currentTranspose = 0; // SetTranspose: signed, added to every note opcode (soundfactory.c:549)
    let currentVolume = 64;
    const callStack: number[] = [];
    const forStack: Array<{ count: number; returnOffset: number }> = [];
    const visitedCmd = new Set<number>(); // start offset of every command walked so far
    let steps = 0;

    while (offset < opcodes.length && steps < 65536) {
      steps++;

      visitedCmd.add(offset);
      const opcode = u8(opcodes, offset++);

      if (opcode < 0x80) {
        // Note (0x00-0x7F) followed by uint16 duration
        if (offset + 2 > opcodes.length) break;
        const noteFileOff = HEADER_SIZE + (offset - 1); // file offset of note opcode byte
        const duration = u16BE(opcodes, offset); offset += 2;
        const pitch = pitchForInstrument(currentInstrId);
        const xmNote = soundFactoryGridNote(pitch, opcode + currentTranspose);
        cellContext.set(noteFileOff, { pitch, transpose: currentTranspose });
        events.push({ note: xmNote, instrId: currentInstrId, volume: currentVolume, duration, isNote: true, fileOffset: noteFileOff, effects: pending.splice(0) });
        continue;
      }

      switch (opcode) {
        case Op.Pause:
        case Op.StopAndPause: {
          if (offset + 2 > opcodes.length) return;
          const pauseFileOff = HEADER_SIZE + (offset - 1); // file offset of pause opcode
          cellContext.set(pauseFileOff, { pitch: pitchForInstrument(currentInstrId), transpose: currentTranspose });
          const dur = u16BE(opcodes, offset); offset += 2;
          events.push({ note: 0, instrId: 0, volume: 0, duration: dur, isNote: false, fileOffset: pauseFileOff, effects: pending.splice(0) });
          if (opcode === Op.StopAndPause) return;
          break;
        }

        case Op.UseInstrument: {
          if (offset < opcodes.length) {
            const slot = u8(opcodes, offset++);
            // Find instrument by slot index (sequential order)
            if (slot < instrArray.length) currentInstrId = slot + 1;
          }
          break;
        }

        case Op.DefineInstrument: {
          if (offset + 3 > opcodes.length) return;
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
            return;
          }
          break;

        case Op.GoSub: {
          if (offset + 4 > opcodes.length) return;
          const rel = s32BE(opcodes, offset); offset += 4;
          callStack.push(offset);
          offset = (offset + rel) >>> 0; // relative to the end of the operand (soundfactory.c:744-757)
          break;
        }

        case Op.Goto: {
          if (offset + 4 > opcodes.length) return;
          const rel = s32BE(opcodes, offset); offset += 4;
          const target = (offset + rel) >>> 0; // relative to the end of the operand (soundfactory.c:744-757)
          // Goto outside any sub-routine or For loop that lands on a command already walked is the song's loop
          // point: one pass of the voice is done.
          if (callStack.length === 0 && forStack.length === 0 && visitedCmd.has(target)) return;
          offset = target;
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
          return;

        case Op.End:
          return;

        case Op.Nop:
        case Op.Request:
          break;

        case Op.WaitForRequest:
          if (offset < opcodes.length) offset++;
          break;

        case Op.SetVolume:
        case Op.SetFineTune:
        case Op.SetTranspose:
        case Op.FadeOut:
        case Op.FadeIn:
        case Op.Led:
        case Op.OneShot:
        case Op.Looping:
        case Op.Portamento:
        case Op.Tremolo:
        case Op.Filter:
        case Op.Arpeggio:
        case Op.Vibrato:
        case Op.Phasing:
        case Op.SetAdsr: {
          // One effect per operand byte (soundFactoryEffects.ts), kept with its file offset for write-back.
          const base = offset;
          const ops = sfDecodeOperands(opcode, (i) => (base + i < opcodes.length ? u8(opcodes, base + i) : undefined));
          if (!ops) return;
          const presence = sfPresenceEffect(opcode) !== undefined;
          ops.forEach((o, i) => pending.push({ id: o.id, value: o.value, fileOffset: HEADER_SIZE + (presence ? base - 1 : base + i) }));
          if (!presence) offset += ops.length;
          if (opcode === Op.SetVolume) currentVolume = Math.min(64, ops[0].value);
          if (opcode === Op.SetTranspose) currentTranspose = (ops[0].value << 24) >> 24;
          break;
        }

        default:
          break;
      }
    }

    return;
  }

  /** The events of a voice; effects after the last note or pause ride a zero-length trailing event. */
  function extractNotesFromVoice(startOffset: number): NoteEvent[] {
    const events: NoteEvent[] = [];
    const pending: SfEffect[] = [];
    walkVoice(startOffset, events, pending);
    if (pending.length > 0) {
      events.push({ note: 0, instrId: 0, volume: 0, duration: 0, isNote: false, fileOffset: -1, effects: pending.splice(0) });
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

  // Step grid (soundFactoryGrid.ts): 1 row = 1 song step on one fixed clock, notes off the step carry a delay,
  // a second note in a row goes to note column 2. File offsets stay parallel to the rows for getCellFileOffset.
  const MAX_ROWS = 16384; // safety cap to prevent browser freeze
  const sfGrid = buildSfGrid(channelEvents, MAX_ROWS);
  const flatChannelRows = sfGrid.rows;
  const flatChannelOffsets = sfGrid.offsets;

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
        channelMeta: { importedFromMOD: false, effectCols: sfGrid.effectCols[ch], noteCols: sfGrid.noteCols[ch], noteColDelay: true },
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

  // Build uadePatternLayout with getCellFileOffset for opcode stream editing
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'soundFactory',
    patternDataFileOffset: HEADER_SIZE, // opcodes start at HEADER_SIZE
    bytesPerCell: 3, // note(1) + duration(2) or pause(1) + duration(2)
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: NUM_CHANNELS,
    numPatterns: trackerPatterns.length,
    moduleSize: bytes.byteLength,
    // Edited cells have no transpose context: they encode with transpose 0 (the opcode that
    // plays the grid note on the cell's instrument when the voice is not transposed).
    encodeCell: (cell: TrackerCell): Uint8Array =>
      encodeSoundFactoryCell(cell, (note, instrument) => soundFactoryOpcodeFor(pitchForInstrument(instrument), note)),
    decodeCell: (raw: Uint8Array, fileOffset?: number): TrackerCell => {
      // 3 bytes: opcode, durationHi, durationLo
      const opcode = raw[0];
      // Byte-exact carriers: the note is a clamped lookup, the pause opcode flattens to an
      // empty cell, and the uint16 duration (raw[1..2]) is dropped from the XM view, so none
      // of the 3 bytes invert. Stash all three in the invisible period/pan carriers;
      // encodeSoundFactoryCell reproduces them verbatim. Private to the round-trip path —
      // the grid loop sets no period/pan, so edited cells fall back to the derivation.
      const carriers = { period: (raw[0] << 8) | raw[1], pan: raw[2] };
      if (opcode >= 0x80) {
        // Pause/rest (0x80+)
        return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, ...carriers };
      }
      // Audible-pitch naming in the instrument/transpose context the import walk recorded.
      const ctx = fileOffset !== undefined ? cellContext.get(fileOffset) : undefined;
      const note = soundFactoryGridNote(ctx?.pitch ?? EMPTY_INSTRUMENT_PITCH, opcode + (ctx?.transpose ?? 0));
      return { note, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, ...carriers };
    },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      const globalRow = pattern * ROWS_PER_PATTERN + row;
      if (channel < 0 || channel >= flatChannelOffsets.length) return -1;
      const offsets = flatChannelOffsets[channel];
      if (globalRow < 0 || globalRow >= offsets.length) return -1;
      return offsets[globalRow];
    },
  };

  const song: TrackerSong = {
    name: moduleName,
    format: 'PSF' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: sfGrid.step,
    initialBPM: 125, // a tick is 20 ms (50 Hz CIA): speed = step ticks per row at 125 BPM
    linearPeriods: false,
    soundFactoryFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    uadePatternLayout,
  };
  return {
    song, effectOffsets: sfGrid.effectOffsets, voiceEvents: channelEvents, anchors: sfGrid.anchors, eventContext: cellContext,
    effectsSeen: sfGrid.effectsSeen, effectsPlaced: sfGrid.effectsPlaced, effectCounts: sfGrid.effectCounts,
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
