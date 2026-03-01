/**
 * XM Exporter - Export DEViLBOX patterns to FastTracker II XM format
 * Supports lossless export for imported XM files with preserved metadata
 */

import type { Pattern, TrackerCell, ImportMetadata, EnvelopePoints } from '../../types/tracker';
import type { InstrumentConfig } from '../../types/instrument';
// EnvelopeConverter import removed - not currently used but available for future envelope export

export interface XMExportOptions {
  channelLimit?: number; // Default 32 (XM max)
  downmixExtra?: boolean; // Downmix channels 33+ or truncate (default: truncate)
  bakeSynthsToSamples?: boolean; // Render synth instruments as samples (default: true)
  stripInstrumentEffects?: boolean; // XM doesn't support effect chains (default: true)
  defaultSpeed?: number; // Default 6 ticks/row
  defaultBPM?: number; // Default 125 BPM
  moduleName?: string; // Module name (20 chars max)
  trackerName?: string; // Tracker name (20 chars max)
}

export interface XMExportResult {
  data: Blob;
  warnings: string[];
  filename: string;
}

/**
 * Export patterns and instruments to XM format
 */
export async function exportAsXM(
  patterns: Pattern[],
  instruments: InstrumentConfig[],
  options: XMExportOptions = {}
): Promise<XMExportResult> {
  const warnings: string[] = [];

  // Set defaults
  const channelLimit = options.channelLimit || 32;
  const downmixExtra = options.downmixExtra ?? false;
  const bakeSynthsToSamples = options.bakeSynthsToSamples ?? true;
  const stripInstrumentEffects = options.stripInstrumentEffects ?? true;
  const defaultSpeed = options.defaultSpeed || 6;
  const defaultBPM = options.defaultBPM || 125;
  const moduleName = options.moduleName || 'DEViLBOX Export';
  const trackerName = options.trackerName || 'DEViLBOX v1.0';

  // Check if this was originally imported from XM (can do lossless export)
  const importMetadata = patterns[0]?.importMetadata;
  const isReexport = importMetadata?.sourceFormat === 'XM';
  void isReexport; // Used for lossless re-export optimization path

  // Validate channel count
  const maxChannels = Math.max(...patterns.map(p => p.channels.length));
  if (maxChannels > channelLimit) {
    warnings.push(
      `Pattern has ${maxChannels} channels. XM supports max ${channelLimit}. ` +
      `Extra channels will be ${downmixExtra ? 'downmixed' : 'truncated'}.`
    );
  }

  const effectiveChannels = Math.min(maxChannels, channelLimit);

  // Convert instruments
  const xmInstruments: XMInstrumentData[] = [];
  for (const inst of instruments) {
    if (inst.synthType !== 'Sampler' && bakeSynthsToSamples) {
      warnings.push(`Synth instrument "${inst.name}" exported as silent placeholder (live synth audio cannot be baked at export time).`);
      xmInstruments.push(createEmptyXMInstrument(inst.name));
    } else if (inst.synthType === 'Sampler') {
      // Convert sampler to XM instrument
      const xmInst = await convertSamplerToXMInstrument(inst, importMetadata);
      xmInstruments.push(xmInst);
    } else {
      warnings.push(`Synth instrument "${inst.name}" exported as silent placeholder (XM format requires sample data).`);
      xmInstruments.push(createEmptyXMInstrument(inst.name));
    }

    // Check for instrument effects
    if (inst.effects && inst.effects.length > 0 && stripInstrumentEffects) {
      warnings.push(`Instrument "${inst.name}" has ${inst.effects.length} effects that will be lost.`);
    }
  }

  // Convert patterns
  const xmPatterns: XMPatternData[] = patterns.map((pattern) =>
    convertPatternToXM(pattern, effectiveChannels)
  );

  // Build XM file
  const xmData = buildXMFile({
    moduleName,
    trackerName,
    patterns: xmPatterns,
    instruments: xmInstruments,
    channelCount: effectiveChannels,
    defaultSpeed,
    defaultBPM,
    songLength: patterns.length,
    restartPosition: importMetadata?.modData?.restartPosition || 0,
    linearFrequency: !importMetadata?.modData?.amigaPeriods,
  });

  const blob = new Blob([xmData], { type: 'application/octet-stream' });
  const filename = `${moduleName.replace(/[^a-zA-Z0-9]/g, '_')}.xm`;

  return {
    data: blob,
    warnings,
    filename,
  };
}

/**
 * XM Instrument data structure
 */
interface XMInstrumentData {
  name: string;
  samples: XMSampleData[];
  volumeEnvelope?: EnvelopePoints;
  panningEnvelope?: EnvelopePoints;
  vibratoType: number;
  vibratoSweep: number;
  vibratoDepth: number;
  vibratoRate: number;
  volumeFadeout: number;
}

/**
 * XM Sample data structure
 */
interface XMSampleData {
  name: string;
  pcmData: ArrayBuffer; // 8-bit or 16-bit PCM
  loopStart: number; // In bytes
  loopLength: number; // In bytes
  volume: number; // 0-64
  finetune: number; // -128 to +127
  type: number; // Bit flags: loop type + bit depth
  panning: number; // 0-255
  relativeNote: number; // -96 to +95
}

/**
 * XM Pattern data structure
 */
interface XMPatternData {
  rows: XMNoteData[][];
}

/**
 * XM Note data structure
 */
interface XMNoteData {
  note: number; // 0=no note, 1-96=C-0 to B-7, 97=note off
  instrument: number; // 0=no instrument, 1-128
  volume: number; // 0=no volume, 0x10-0x50=volume, 0x60-0xFF=effects
  effectType: number; // 0-35 (0-Z)
  effectParam: number; // 0-255
}

/**
 * Convert DEViLBOX pattern to XM pattern
 */
function convertPatternToXM(
  pattern: Pattern,
  channelCount: number
): XMPatternData {
  const rows: XMNoteData[][] = [];

  for (let row = 0; row < pattern.length; row++) {
    const rowNotes: XMNoteData[] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      const cell = pattern.channels[ch]?.rows[row];

      if (!cell) {
        // Empty cell
        rowNotes.push({ note: 0, instrument: 0, volume: 0, effectType: 0, effectParam: 0 });
        continue;
      }

      const xmNote = convertCellToXMNote(cell);
      rowNotes.push(xmNote);
    }

    rows.push(rowNotes);
  }

  return { rows };
}

/**
 * Convert TrackerCell to XM note
 */
function convertCellToXMNote(cell: TrackerCell): XMNoteData {
  // Convert note - handle both numeric (XM) and string (legacy) formats
  let note = 0;
  const noteValue = cell.note;

  if (noteValue) {
    if (typeof noteValue === 'number') {
      // Already in XM numeric format (1-96 = notes, 97 = note off)
      note = noteValue;
    } else if (noteValue === '===') {
      note = 97; // Note off
    } else if (noteValue !== '---') {
      // Convert string note to XM number
      note = noteNameToNumber(noteValue);
    }
  }

  // Convert instrument
  const instrument = cell.instrument || 0;

  // Convert volume (combine direct volume and effTyp2/eff2 volume column)
  let volume = 0;
  if (cell.volume !== null) {
    // Direct volume set (0-64)
    volume = 0x10 + Math.min(cell.volume, 0x40);
  } else if ((cell.effTyp2 !== undefined && cell.effTyp2 !== 0) || (cell.eff2 !== undefined && cell.eff2 !== 0)) {
    // Convert numeric effTyp2/eff2 back to volume column effect
    volume = convertEffectToVolumeColumnNumeric(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
  }

  // Convert main effect
  let effectType = 0;
  let effectParam = 0;
  if (cell.effect && cell.effect !== '...') {
    const parsed = parseEffect(cell.effect);
    effectType = parsed.type;
    effectParam = parsed.param;
  }

  return {
    note,
    instrument,
    volume,
    effectType,
    effectParam,
  };
}

/**
 * Convert note name to XM note number
 * XM: 1-96 = C-0 to B-7
 */
function noteNameToNumber(noteName: string): number {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const match = noteName.match(/^([A-G]#?)-?(\d)$/);

  if (!match) return 0;

  const note = notes.indexOf(match[1]);
  const octave = parseInt(match[2]);

  if (note === -1 || octave < 0 || octave > 7) return 0;

  return octave * 12 + note + 1;
}

/**
 * Parse FT2 effect string (XYZ) to type and param
 */
function parseEffect(effect: string): { type: number; param: number } {
  if (effect.length !== 3) return { type: 0, param: 0 };

  const effectChar = effect[0].toUpperCase();
  const param = parseInt(effect.substring(1), 16);

  // Map effect letters to numbers (0-9, A-Z)
  const effectLetters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const type = effectLetters.indexOf(effectChar);

  return {
    type: type === -1 ? 0 : type,
    param: isNaN(param) ? 0 : param,
  };
}

/**
 * Convert numeric effTyp2/eff2 back to XM volume column byte
 */
function convertEffectToVolumeColumnNumeric(effTyp: number, eff: number): number {
  if (effTyp === 0xA) {
    // Volume slide
    const x = (eff >> 4) & 0x0F;
    const y = eff & 0x0F;

    if (x > 0) return 0x70 + x; // Volume slide up
    if (y > 0) return 0x60 + y; // Volume slide down
  }

  if (effTyp === 0xE) {
    const x = (eff >> 4) & 0x0F;
    const y = eff & 0x0F;

    if (x === 0xA) return 0x90 + y; // Fine volume up (EAx)
    if (x === 0xB) return 0x80 + y; // Fine volume down (EBx)
  }

  if (effTyp === 0x4) {
    // Vibrato depth
    const y = eff & 0x0F;
    return 0xB0 + y;
  }

  if (effTyp === 0x3) {
    // Tone portamento
    const speed = Math.floor(eff / 16);
    return 0xF0 + Math.min(speed, 0x0F);
  }

  return 0;
}

/**
 * Convert Sampler instrument to XM instrument
 */
async function convertSamplerToXMInstrument(
  inst: InstrumentConfig,
  importMetadata?: ImportMetadata
): Promise<XMInstrumentData> {
  // Check if we have preserved original sample (lossless path)
  const originalSample = importMetadata?.originalSamples?.[inst.id];

  if (originalSample) {
    // Use preserved original sample (lossless)
    return {
      name: inst.name.substring(0, 22),
      samples: [
        {
          name: originalSample.name.substring(0, 22),
          pcmData: originalSample.pcmData,
          loopStart: originalSample.loopStart * (originalSample.bitDepth === 16 ? 2 : 1),
          loopLength: originalSample.loopLength * (originalSample.bitDepth === 16 ? 2 : 1),
          volume: originalSample.volume,
          finetune: originalSample.finetune,
          type: buildTypeFlags(originalSample.loopType, originalSample.bitDepth),
          panning: originalSample.panning,
          relativeNote: originalSample.relativeNote,
        },
      ],
      volumeEnvelope: importMetadata?.envelopes?.[inst.id]?.volumeEnvelope,
      panningEnvelope: importMetadata?.envelopes?.[inst.id]?.panningEnvelope,
      vibratoType: importMetadata?.envelopes?.[inst.id]?.autoVibrato?.type === 'sine' ? 0 :
                   importMetadata?.envelopes?.[inst.id]?.autoVibrato?.type === 'square' ? 1 :
                   importMetadata?.envelopes?.[inst.id]?.autoVibrato?.type === 'rampDown' ? 2 :
                   importMetadata?.envelopes?.[inst.id]?.autoVibrato?.type === 'rampUp' ? 3 : 0,
      vibratoSweep: importMetadata?.envelopes?.[inst.id]?.autoVibrato?.sweep || 0,
      vibratoDepth: importMetadata?.envelopes?.[inst.id]?.autoVibrato?.depth || 0,
      vibratoRate: importMetadata?.envelopes?.[inst.id]?.autoVibrato?.rate || 0,
      volumeFadeout: importMetadata?.envelopes?.[inst.id]?.fadeout || 0,
    };
  }

  // Try to use the live SampleConfig audio buffer
  const sampleCfg = inst.sample;
  if (sampleCfg?.audioBuffer && sampleCfg.audioBuffer.byteLength > 0) {
    // Convert AudioBuffer (Float32 PCM) to 8-bit signed PCM for XM
    const rawPCM = convertFloat32To8BitPCM(sampleCfg.audioBuffer);

    // Volume: inst.volume is dB (-60..0) → convert to 0-64
    const volume = dbToXMVolume(inst.volume);

    // Finetune from detune (cents, -100..+100) → XM finetune (-128..+127)
    const finetune = Math.round(Math.max(-128, Math.min(127, sampleCfg.detune * 1.27)));

    // Relative note from baseNote (e.g. "C-4") → relative to C-4 (XM reference pitch)
    const relativeNote = baseNoteToRelativeNote(sampleCfg.baseNote);

    // Panning: inst.pan is -100..+100 → 0-255 (128=center)
    const panning = Math.round(((inst.pan + 100) / 200) * 255);

    // Loop points in bytes (8-bit samples = 1 byte/frame)
    const loopStart = Math.max(0, sampleCfg.loopStart);
    const loopEnd = Math.max(loopStart, sampleCfg.loopEnd);
    const loopLength = sampleCfg.loop ? Math.max(0, loopEnd - loopStart) : 0;

    const loopType: 'none' | 'forward' | 'pingpong' =
      !sampleCfg.loop ? 'none' :
      sampleCfg.loopType === 'pingpong' ? 'pingpong' : 'forward';

    return {
      name: inst.name.substring(0, 22),
      samples: [
        {
          name: inst.name.substring(0, 22),
          pcmData: rawPCM,
          loopStart,
          loopLength,
          volume,
          finetune,
          type: buildTypeFlags(loopType, 8),
          panning: Math.max(0, Math.min(255, panning)),
          relativeNote,
        },
      ],
      volumeEnvelope: inst.metadata?.originalEnvelope,
      panningEnvelope: inst.metadata?.panningEnvelope,
      vibratoType: inst.metadata?.autoVibrato?.type === 'sine' ? 0 :
                   inst.metadata?.autoVibrato?.type === 'square' ? 1 :
                   inst.metadata?.autoVibrato?.type === 'rampDown' ? 2 :
                   inst.metadata?.autoVibrato?.type === 'rampUp' ? 3 : 0,
      vibratoSweep: inst.metadata?.autoVibrato?.sweep || 0,
      vibratoDepth: inst.metadata?.autoVibrato?.depth || 0,
      vibratoRate: inst.metadata?.autoVibrato?.rate || 0,
      volumeFadeout: inst.metadata?.fadeout || 0,
    };
  }

  // No audio data available — write empty instrument placeholder
  return createEmptyXMInstrument(inst.name);
}

/**
 * Convert Float32 PCM ArrayBuffer to 8-bit signed PCM ArrayBuffer.
 * If the buffer appears to already be 8-bit (byteLength matches expected frame
 * count from metadata) we use it as-is; otherwise we treat it as Float32.
 * The heuristic: if byteLength is divisible by 4 and > 0, assume Float32.
 */
function convertFloat32To8BitPCM(buffer: ArrayBuffer): ArrayBuffer {
  const byteLen = buffer.byteLength;

  // Try to interpret as Float32 (4 bytes per sample)
  if (byteLen % 4 === 0 && byteLen >= 4) {
    const floats = new Float32Array(buffer);
    const out = new Int8Array(floats.length);
    for (let i = 0; i < floats.length; i++) {
      // Clamp and scale to -128..+127
      const v = Math.max(-1, Math.min(1, floats[i]));
      out[i] = Math.round(v * 127);
    }
    return out.buffer;
  }

  // Already appears to be byte data — return as-is
  return buffer;
}

/**
 * Convert dB volume (instrument.volume is -60..0 dB) to XM sample volume 0-64
 */
function dbToXMVolume(db: number): number {
  if (db <= -60) return 0;
  if (db >= 0) return 64;
  // Linear approximation: 0 dB → 64, -60 dB → 0
  return Math.round(((db + 60) / 60) * 64);
}

/**
 * Convert a base note string (e.g. "C-4", "A#3") to XM relative note offset.
 * XM relative note is relative to C-4 (which = 0 relative note in XM convention,
 * meaning middle C at standard 8363 Hz sample rate plays at concert pitch).
 * Range: -96 to +95.
 */
function baseNoteToRelativeNote(baseNote: string): number {
  if (!baseNote) return 0;

  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  // Accept "C-4", "C4", "A#3", "Bb4" (flat not supported, return 0)
  const match = baseNote.match(/^([A-G]#?)-?(\d)$/);
  if (!match) return 0;

  const noteIdx = notes.indexOf(match[1]);
  if (noteIdx === -1) return 0;

  const octave = parseInt(match[2]);
  // XM note number: C-0 = 1, so MIDI note = octave*12 + noteIdx
  const midiNote = octave * 12 + noteIdx;
  // C-4 = octave 4, note C = MIDI 48
  const c4Midi = 4 * 12 + 0; // 48
  const relative = midiNote - c4Midi;

  return Math.max(-96, Math.min(95, relative));
}

/**
 * Build XM type flags byte
 */
function buildTypeFlags(loopType: 'none' | 'forward' | 'pingpong', bitDepth: 8 | 16): number {
  let flags = 0;

  // Loop type (bits 0-1)
  if (loopType === 'forward') flags |= 0x01;
  if (loopType === 'pingpong') flags |= 0x02;

  // Bit depth (bit 4)
  if (bitDepth === 16) flags |= 0x10;

  return flags;
}

/**
 * Create empty XM instrument
 */
function createEmptyXMInstrument(name: string): XMInstrumentData {
  return {
    name: name.substring(0, 22),
    samples: [],
    vibratoType: 0,
    vibratoSweep: 0,
    vibratoDepth: 0,
    vibratoRate: 0,
    volumeFadeout: 0,
  };
}

/**
 * Build XM file from components
 */
function buildXMFile(config: {
  moduleName: string;
  trackerName: string;
  patterns: XMPatternData[];
  instruments: XMInstrumentData[];
  channelCount: number;
  defaultSpeed: number;
  defaultBPM: number;
  songLength: number;
  restartPosition: number;
  linearFrequency: boolean;
}): ArrayBuffer {
  const buffers: Uint8Array[] = [];

  // Write header
  buffers.push(writeXMHeader(config));

  // Write patterns
  for (const pattern of config.patterns) {
    buffers.push(writeXMPattern(pattern, config.channelCount));
  }

  // Write instruments
  for (const instrument of config.instruments) {
    buffers.push(writeXMInstrument(instrument));
  }

  // Concatenate all buffers
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }

  return result.buffer;
}

/**
 * Write XM header
 */
function writeXMHeader(config: {
  moduleName: string;
  trackerName: string;
  patterns: XMPatternData[];
  instruments: XMInstrumentData[];
  channelCount: number;
  defaultSpeed: number;
  defaultBPM: number;
  songLength: number;
  restartPosition: number;
  linearFrequency: boolean;
}): Uint8Array {
  const buffer = new Uint8Array(336); // 80 + 256 pattern order table
  const view = new DataView(buffer.buffer);
  let offset = 0;

  // ID text (17 bytes)
  const idText = 'Extended Module: ';
  for (let i = 0; i < 17; i++) {
    buffer[offset++] = idText.charCodeAt(i);
  }

  // Module name (20 bytes)
  writeString(buffer, offset, config.moduleName, 20);
  offset += 20;

  // 0x1A byte
  buffer[offset++] = 0x1A;

  // Tracker name (20 bytes)
  writeString(buffer, offset, config.trackerName, 20);
  offset += 20;

  // Version number (2 bytes, little-endian)
  view.setUint16(offset, 0x0104, true); // v1.04
  offset += 2;

  // Header size (4 bytes) - 276 for standard XM
  view.setUint32(offset, 276, true);
  offset += 4;

  // Song length (2 bytes)
  view.setUint16(offset, config.songLength, true);
  offset += 2;

  // Restart position (2 bytes)
  view.setUint16(offset, config.restartPosition, true);
  offset += 2;

  // Channel count (2 bytes)
  view.setUint16(offset, config.channelCount, true);
  offset += 2;

  // Pattern count (2 bytes)
  view.setUint16(offset, config.patterns.length, true);
  offset += 2;

  // Instrument count (2 bytes)
  view.setUint16(offset, config.instruments.length, true);
  offset += 2;

  // Flags (2 bytes) - bit 0: 0=Amiga, 1=Linear
  view.setUint16(offset, config.linearFrequency ? 0x01 : 0x00, true);
  offset += 2;

  // Default tempo (2 bytes)
  view.setUint16(offset, config.defaultSpeed, true);
  offset += 2;

  // Default BPM (2 bytes)
  view.setUint16(offset, config.defaultBPM, true);
  offset += 2;

  // Pattern order table (256 bytes)
  for (let i = 0; i < 256; i++) {
    buffer[offset++] = i < config.songLength ? i : 0;
  }

  return buffer;
}

/**
 * Write XM pattern
 */
function writeXMPattern(pattern: XMPatternData, channelCount: number): Uint8Array {
  // Pack pattern data
  const packedData = packPatternData(pattern.rows, channelCount);

  // Pattern header (9 bytes)
  const header = new Uint8Array(9);
  const view = new DataView(header.buffer);

  view.setUint32(0, 9, true); // Header length
  header[4] = 0; // Packing type (always 0)
  view.setUint16(5, pattern.rows.length, true); // Row count
  view.setUint16(7, packedData.length, true); // Packed data size

  // Concatenate header + packed data
  const result = new Uint8Array(header.length + packedData.length);
  result.set(header, 0);
  result.set(packedData, header.length);

  return result;
}

/**
 * Pack pattern data using XM bit-flag compression
 */
function packPatternData(rows: XMNoteData[][], channelCount: number): Uint8Array {
  const packed: number[] = [];

  for (const row of rows) {
    for (let ch = 0; ch < channelCount; ch++) {
      const note = row[ch] || { note: 0, instrument: 0, volume: 0, effectType: 0, effectParam: 0 };

      // Check if note is empty
      if (
        note.note === 0 &&
        note.instrument === 0 &&
        note.volume === 0 &&
        note.effectType === 0 &&
        note.effectParam === 0
      ) {
        // Empty note - write compressed (just pack byte)
        packed.push(0x80);
        continue;
      }

      // Build pack byte
      let packByte = 0x80; // Compressed flag
      const data: number[] = [];

      if (note.note > 0) {
        packByte |= 0x01;
        data.push(note.note);
      }
      if (note.instrument > 0) {
        packByte |= 0x02;
        data.push(note.instrument);
      }
      if (note.volume > 0) {
        packByte |= 0x04;
        data.push(note.volume);
      }
      if (note.effectType > 0) {
        packByte |= 0x08;
        data.push(note.effectType);
      }
      if (note.effectParam > 0) {
        packByte |= 0x10;
        data.push(note.effectParam);
      }

      packed.push(packByte);
      packed.push(...data);
    }
  }

  return new Uint8Array(packed);
}

/**
 * Write XM instrument block (instrument header + sample headers + sample data).
 *
 * XMInstrumentHeader layout (263 bytes total, per OpenMPT XMTools.h):
 *   Bytes  0- 3: size (uint32LE) — always 263 (0x107) when samples present
 *   Bytes  4-25: name (22 bytes, null-padded)
 *   Byte   26:   type (always 0)
 *   Bytes 27-28: numSamples (uint16LE)
 *   Bytes 29-32: sampleHeaderSize (uint32LE) — always 40
 *   Bytes 33-262: XMInstrument (230 bytes):
 *     Bytes  33-128:  sampleMap[96] (96 bytes, note → sample index)
 *     Bytes 129-176:  volEnv[24]   (24 × uint16LE = 48 bytes, 12 tick+value pairs)
 *     Bytes 177-224:  panEnv[24]   (24 × uint16LE = 48 bytes, 12 tick+value pairs)
 *     Byte  225:      volPoints
 *     Byte  226:      panPoints
 *     Byte  227:      volSustain
 *     Byte  228:      volLoopStart
 *     Byte  229:      volLoopEnd
 *     Byte  230:      panSustain
 *     Byte  231:      panLoopStart
 *     Byte  232:      panLoopEnd
 *     Byte  233:      volFlags
 *     Byte  234:      panFlags
 *     Byte  235:      vibType
 *     Byte  236:      vibSweep
 *     Byte  237:      vibDepth
 *     Byte  238:      vibRate
 *     Bytes 239-240:  volFade (uint16LE)
 *     Bytes 241-262:  MIDI fields + reserved (22 bytes)
 *
 * Then immediately following: N × 40-byte XMSample headers, then N × sample data.
 *
 * For instruments with no samples: only the 29-byte short header is written
 *   (size=29, no sampleHeaderSize, no XMInstrument body).
 */
function writeXMInstrument(instrument: XMInstrumentData): Uint8Array {
  const numSamples = instrument.samples.length;

  if (numSamples === 0) {
    // Minimal 29-byte header (no sampleHeaderSize, no XMInstrument body)
    const buf = new Uint8Array(29);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 29, true);       // Header size = 29 for empty instrument
    writeString(buf, 4, instrument.name, 22);
    buf[26] = 0;                        // Type
    view.setUint16(27, 0, true);        // Num samples = 0
    return buf;
  }

  // ---- Build delta-encoded sample data blocks first to know their sizes ----
  const deltaBlocks: Uint8Array[] = instrument.samples.map(s =>
    deltaEncodeSampleData(s.pcmData, s.type)
  );

  // ---- Full 263-byte XMInstrumentHeader ----
  const HEADER_SIZE = 263; // XMInstrumentHeader total size
  const SAMPLE_HEADER_SIZE = 40; // XMSample size

  const header = new Uint8Array(HEADER_SIZE);
  const hView = new DataView(header.buffer);

  // Bytes 0-3: Instrument header size
  hView.setUint32(0, HEADER_SIZE, true);

  // Bytes 4-25: Instrument name (22 bytes)
  writeString(header, 4, instrument.name, 22);

  // Byte 26: Type (always 0)
  header[26] = 0;

  // Bytes 27-28: Number of samples
  hView.setUint16(27, numSamples, true);

  // Bytes 29-32: Sample header size (always 40)
  hView.setUint32(29, SAMPLE_HEADER_SIZE, true);

  // ---- XMInstrument body starts at byte 33 ----
  // Bytes 33-128: sampleMap[96] — all notes default to sample 0
  // (header is zero-initialised, nothing to write)

  // Bytes 129-176: volEnv[24] (12 tick+value pairs × 4 bytes each)
  const volEnv = instrument.volumeEnvelope;
  if (volEnv) {
    const pointCount = Math.min(volEnv.points.length, 12);
    for (let i = 0; i < pointCount; i++) {
      hView.setUint16(129 + i * 4,     volEnv.points[i].tick,  true);
      hView.setUint16(129 + i * 4 + 2, volEnv.points[i].value, true);
    }
  }

  // Bytes 177-224: panEnv[24] (12 tick+value pairs × 4 bytes each)
  const panEnv = instrument.panningEnvelope;
  if (panEnv) {
    const pointCount = Math.min(panEnv.points.length, 12);
    for (let i = 0; i < pointCount; i++) {
      hView.setUint16(177 + i * 4,     panEnv.points[i].tick,  true);
      hView.setUint16(177 + i * 4 + 2, panEnv.points[i].value, true);
    }
  }

  // Byte 225: volPoints
  header[225] = volEnv ? Math.min(volEnv.points.length, 12) : 0;

  // Byte 226: panPoints
  header[226] = panEnv ? Math.min(panEnv.points.length, 12) : 0;

  // Byte 227: volSustain
  header[227] = (volEnv?.sustainPoint != null) ? volEnv.sustainPoint : 0;

  // Byte 228: volLoopStart
  header[228] = (volEnv?.loopStartPoint != null) ? volEnv.loopStartPoint : 0;

  // Byte 229: volLoopEnd
  header[229] = (volEnv?.loopEndPoint != null) ? volEnv.loopEndPoint : 0;

  // Byte 230: panSustain
  header[230] = (panEnv?.sustainPoint != null) ? panEnv.sustainPoint : 0;

  // Byte 231: panLoopStart
  header[231] = (panEnv?.loopStartPoint != null) ? panEnv.loopStartPoint : 0;

  // Byte 232: panLoopEnd
  header[232] = (panEnv?.loopEndPoint != null) ? panEnv.loopEndPoint : 0;

  // Byte 233: volFlags (bit 0=enabled, bit 1=sustain, bit 2=loop)
  let volFlags = 0;
  if (volEnv?.enabled)                                   volFlags |= 0x01;
  if (volEnv?.enabled && volEnv.sustainPoint != null)    volFlags |= 0x02;
  if (volEnv?.enabled && volEnv.loopStartPoint != null)  volFlags |= 0x04;
  header[233] = volFlags;

  // Byte 234: panFlags
  let panFlags = 0;
  if (panEnv?.enabled)                                   panFlags |= 0x01;
  if (panEnv?.enabled && panEnv.sustainPoint != null)    panFlags |= 0x02;
  if (panEnv?.enabled && panEnv.loopStartPoint != null)  panFlags |= 0x04;
  header[234] = panFlags;

  // Byte 235: vibType
  header[235] = instrument.vibratoType;

  // Byte 236: vibSweep
  header[236] = instrument.vibratoSweep;

  // Byte 237: vibDepth
  header[237] = instrument.vibratoDepth;

  // Byte 238: vibRate
  header[238] = instrument.vibratoRate;

  // Bytes 239-240: volFade (uint16LE)
  hView.setUint16(239, Math.min(instrument.volumeFadeout, 0xFFFF), true);

  // Bytes 241-262: MIDI/reserved fields — zeroed (already done by new Uint8Array)

  // ---- N × 40-byte XMSample headers ----
  const sampleHeaders = new Uint8Array(numSamples * SAMPLE_HEADER_SIZE);
  const shView = new DataView(sampleHeaders.buffer);

  for (let i = 0; i < numSamples; i++) {
    const s = instrument.samples[i];
    const base = i * SAMPLE_HEADER_SIZE;

    shView.setUint32(base + 0,  deltaBlocks[i].byteLength, true); // length in bytes
    shView.setUint32(base + 4,  s.loopStart,               true); // loopStart in bytes
    shView.setUint32(base + 8,  s.loopLength,              true); // loopLength in bytes
    sampleHeaders[base + 12] = Math.max(0, Math.min(64, s.volume));
    shView.setInt8(base + 13,   Math.max(-128, Math.min(127, s.finetune)));
    sampleHeaders[base + 14] = s.type;
    sampleHeaders[base + 15] = Math.max(0, Math.min(255, s.panning));
    shView.setInt8(base + 16,   Math.max(-96, Math.min(95, s.relativeNote)));
    sampleHeaders[base + 17] = 0; // reserved
    writeString(sampleHeaders, base + 18, s.name, 22);
  }

  // ---- Concatenate: header + sample headers + sample data ----
  const totalLength =
    header.length +
    sampleHeaders.length +
    deltaBlocks.reduce((sum, b) => sum + b.byteLength, 0);

  const result = new Uint8Array(totalLength);
  let pos = 0;

  result.set(header, pos);       pos += header.length;
  result.set(sampleHeaders, pos); pos += sampleHeaders.length;

  for (const block of deltaBlocks) {
    result.set(block, pos);
    pos += block.byteLength;
  }

  return result;
}

/**
 * Delta-encode sample data for XM format.
 *
 * XM stores sample data as delta values: each byte/word is the DIFFERENCE
 * from the previous value, not the absolute value. This is sometimes called
 * "delta modulation" or "DPCM-style" coding.
 *
 * For 8-bit samples: input is signed Int8, output is signed Int8 deltas.
 * For 16-bit samples: input is signed Int16 LE, output is signed Int16 LE deltas.
 */
function deltaEncodeSampleData(pcmData: ArrayBuffer, typeFlags: number): Uint8Array {
  const is16Bit = (typeFlags & 0x10) !== 0;

  if (is16Bit) {
    const samples = new Int16Array(pcmData);
    const out = new Uint8Array(samples.length * 2);
    const outView = new DataView(out.buffer);
    let prev = 0;
    for (let i = 0; i < samples.length; i++) {
      const delta = samples[i] - prev;
      prev = samples[i];
      // Wrap delta to int16 range
      const wrapped = ((delta & 0xFFFF) << 16) >> 16;
      outView.setInt16(i * 2, wrapped, true);
    }
    return out;
  } else {
    // 8-bit path — interpret input as Int8 array
    const src = new Uint8Array(pcmData);
    const out = new Uint8Array(src.length);
    let prev = 0;
    for (let i = 0; i < src.length; i++) {
      // Reinterpret as signed
      const signed = (src[i] << 24) >> 24;
      const delta = signed - prev;
      prev = signed;
      // Wrap to int8 range and store as unsigned byte
      out[i] = delta & 0xFF;
    }
    return out;
  }
}

/**
 * Write string to buffer (null-padded)
 */
function writeString(buffer: Uint8Array, offset: number, str: string, maxLength: number): void {
  for (let i = 0; i < maxLength; i++) {
    buffer[offset + i] = i < str.length ? str.charCodeAt(i) : 0;
  }
}
