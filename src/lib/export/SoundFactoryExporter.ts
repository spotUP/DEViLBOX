/**
 * SoundFactoryExporter.ts — Export TrackerSong as Sound Factory (.psf) format
 *
 * Reconstructs the binary opcode-stream format from TrackerSong pattern data.
 *
 * File layout (big-endian):
 *   0x000   4 bytes   Module length (uint32 BE)
 *   0x004  16 bytes   Voice count for sub-songs 0-15 (1 byte each; 0 = unused)
 *   0x014 256 bytes   Subsong opcode start offsets: 16 subsongs x 4 channels x uint32
 *   0x114   N bytes   Opcodes stream
 *
 * Each channel's opcode stream contains:
 *   - DefineInstrument opcodes (0x84) with inline sample data
 *   - UseInstrument (0x83), SetVolume (0x81) for state changes
 *   - Note bytes (0x00-0x7F) followed by uint16 BE duration
 *   - Pause (0x80) + uint16 BE duration for rests
 *   - Loop (0x8D) at the end to restart, or End (0x8E) to stop
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

const HEADER_SIZE = 276; // 4 + 16 + 256
const PAL_CLOCK = 3546895;
const INSTR_HEADER_SIZE = 34; // bytes before sample data in DefineInstrument payload

// Opcodes
const Op = {
  Pause:            0x80,
  SetVolume:        0x81,
  UseInstrument:    0x83,
  DefineInstrument: 0x84,
  Loop:             0x8D,
  End:              0x8E,
} as const;

/** Reverse of parser's psfNoteToXm: xmNote = noteByte + 13 */
function xmNoteToPsf(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return -1;
  const noteByte = xmNote - 13;
  return (noteByte >= 0 && noteByte <= 0x7F) ? noteByte : -1;
}

/** Convert C3 sample rate (Hz) back to Amiga period */
function freqToPeriod(freq: number): number {
  if (freq <= 0) return 214; // default period
  return Math.round(PAL_CLOCK / (2 * freq));
}

/** Extract 8-bit signed PCM from an instrument's sample audioBuffer (WAV format) */
function extractPcm(inst: { sample?: { audioBuffer?: ArrayBuffer } }): Int8Array {
  const buf = inst.sample?.audioBuffer;
  if (!buf || buf.byteLength < 44) return new Int8Array(0);

  const wav = new DataView(buf);
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const pcm = new Int8Array(frames);
  for (let i = 0; i < frames; i++) {
    const s16 = wav.getInt16(44 + i * 2, true);
    pcm[i] = s16 >> 8; // 16-bit signed -> 8-bit signed
  }
  return pcm;
}

/**
 * Build the opcode stream for one channel.
 * Returns a Uint8Array of opcodes.
 */
function buildChannelOpcodes(
  song: TrackerSong,
  channelIdx: number,
  definedInstrSlots: Set<number>,
  instrumentPcms: Map<number, Int8Array>,
  instrumentPeriods: Map<number, number>,
  warnings: string[],
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let currentInstrId = 0;
  let currentVolume = 64;

  // Walk all patterns in song order
  for (let posIdx = 0; posIdx < song.songPositions.length; posIdx++) {
    const patIdx = song.songPositions[posIdx];
    const pattern = song.patterns[patIdx];
    if (!pattern || channelIdx >= pattern.channels.length) continue;

    const channel = pattern.channels[channelIdx];
    const rows = channel.rows;

    let rowIdx = 0;
    while (rowIdx < rows.length) {
      const cell = rows[rowIdx];
      const xmNote = cell.note ?? 0;
      const instrId = cell.instrument ?? 0;

      // Instrument change: define it inline if first use, then select it
      if (instrId > 0 && instrId !== currentInstrId) {
        if (!definedInstrSlots.has(instrId)) {
          // Emit DefineInstrument for this instrument
          const defBytes = buildDefineInstrument(
            instrId - 1, // slot is 0-based
            instrumentPcms.get(instrId) ?? new Int8Array(0),
            instrumentPeriods.get(instrId) ?? 214,
            song.instruments[instrId - 1],
          );
          if (defBytes) {
            chunks.push(defBytes);
            definedInstrSlots.add(instrId);
          }
        } else {
          // Already defined — emit UseInstrument
          const useBytes = new Uint8Array(2);
          useBytes[0] = Op.UseInstrument;
          useBytes[1] = instrId - 1; // slot index (0-based)
          chunks.push(useBytes);
        }
        currentInstrId = instrId;
      }

      // Volume change (only emit if instrument is active and cell has volume-like info)
      // PSF volume range is 0-64
      const cellVol = cell.volume ?? 0;
      if (cellVol > 0 && cellVol !== currentVolume) {
        const vol = Math.min(64, cellVol);
        const volBytes = new Uint8Array(2);
        volBytes[0] = Op.SetVolume;
        volBytes[1] = vol;
        chunks.push(volBytes);
        currentVolume = vol;
      }

      if (xmNote > 0 && xmNote <= 96) {
        // Note event — collect consecutive empty rows after as duration
        const noteByte = xmNoteToPsf(xmNote);
        if (noteByte >= 0) {
          let duration = 1;
          // Look ahead for empty rows that extend this note's duration
          while (rowIdx + duration < rows.length) {
            const next = rows[rowIdx + duration];
            if ((next.note ?? 0) > 0 || (next.instrument ?? 0) > 0 ||
                (next.effTyp ?? 0) > 0 || (next.volume ?? 0) > 0) {
              break;
            }
            duration++;
          }
          const noteBytes = new Uint8Array(3);
          noteBytes[0] = noteByte;
          noteBytes[1] = (duration >> 8) & 0xFF;
          noteBytes[2] = duration & 0xFF;
          chunks.push(noteBytes);
          rowIdx += duration;
          continue;
        } else {
          // Note out of range — treat as pause
          warnings.push(`Ch${channelIdx + 1}: Note ${xmNote} out of PSF range, converted to pause`);
          const pauseBytes = new Uint8Array(3);
          pauseBytes[0] = Op.Pause;
          pauseBytes[1] = 0;
          pauseBytes[2] = 1;
          chunks.push(pauseBytes);
          rowIdx++;
          continue;
        }
      } else if (xmNote === 97) {
        // Note off — emit pause
        const pauseBytes = new Uint8Array(3);
        pauseBytes[0] = Op.Pause;
        pauseBytes[1] = 0;
        pauseBytes[2] = 1;
        chunks.push(pauseBytes);
        rowIdx++;
        continue;
      } else {
        // Empty row — collect consecutive empty rows as a single pause
        let duration = 1;
        while (rowIdx + duration < rows.length) {
          const next = rows[rowIdx + duration];
          if ((next.note ?? 0) > 0 || (next.instrument ?? 0) > 0 ||
              (next.effTyp ?? 0) > 0 || (next.volume ?? 0) > 0) {
            break;
          }
          duration++;
        }
        const pauseBytes = new Uint8Array(3);
        pauseBytes[0] = Op.Pause;
        pauseBytes[1] = (duration >> 8) & 0xFF;
        pauseBytes[2] = duration & 0xFF;
        chunks.push(pauseBytes);
        rowIdx += duration;
        continue;
      }
    }
  }

  // End the channel
  const endByte = new Uint8Array(1);
  endByte[0] = Op.End;
  chunks.push(endByte);

  // Concatenate all chunks
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let off = 0;
  for (const chunk of chunks) {
    result.set(chunk, off);
    off += chunk.length;
  }
  return result;
}

/**
 * Build a DefineInstrument opcode block.
 * Layout: 0x84 + slot(1) + wordCount(2) + instrumentHeader(34) + sampleData
 */
function buildDefineInstrument(
  slot: number,
  pcm: Int8Array,
  period: number,
  inst: { sample?: { loop?: boolean; loopStart?: number; loopEnd?: number } } | undefined,
): Uint8Array | null {
  const sampleLengthWords = Math.floor(pcm.length / 2);
  // Total instrument data = header(34) + sample(sampleLengthWords * 2)
  // wordCount includes the 4 bytes (slot + wordCount) that are already consumed
  // From parser: remaining = wordCount * 2 - 4
  // So: wordCount * 2 = INSTR_HEADER_SIZE + sampleLengthWords * 2 + 4
  // => wordCount = (INSTR_HEADER_SIZE + sampleLengthWords * 2 + 4) / 2
  const totalPayload = INSTR_HEADER_SIZE + sampleLengthWords * 2;
  const wordCount = (totalPayload + 4) / 2;

  // Opcode: 0x84(1) + slot(1) + wordCount(2) + instrHeader(34) + sampleData
  const totalSize = 1 + 1 + 2 + totalPayload;
  const out = new Uint8Array(totalSize);
  let off = 0;

  out[off++] = Op.DefineInstrument;
  out[off++] = slot & 0xFF;
  out[off++] = (wordCount >> 8) & 0xFF;
  out[off++] = wordCount & 0xFF;

  // Instrument header (34 bytes):
  // sampleLength(2) + samplingPeriod(2) + effectByte(1) + tremoloSpeed(1) + tremoloStep(1) + tremoloRange(1)
  // + portamentoStep(2) + portamentoSpeed(1) + arpeggioSpeed(1)
  // + vibratoDelay(1) + vibratoSpeed(1) + vibratoStep(1) + vibratoAmount(1)
  // + attackTime(1) + decayTime(1) + sustainLevel(1) + releaseTime(1)
  // + phasingStart(1) + phasingEnd(1) + phasingSpeed(1) + phasingStep(1)
  // + waveCount(1) + octave(1) + filterFrequency(1) + filterEnd(1) + filterSpeed(1)
  // + padding(1) + DASR_SustainOffset(2) + DASR_ReleaseOffset(2)

  // sampleLength (words, big-endian)
  out[off++] = (sampleLengthWords >> 8) & 0xFF;
  out[off++] = sampleLengthWords & 0xFF;

  // samplingPeriod (big-endian)
  out[off++] = (period >> 8) & 0xFF;
  out[off++] = period & 0xFF;

  // effectByte — bit0 = oneShot (no loop)
  const isLoop = inst?.sample?.loop ?? false;
  out[off++] = isLoop ? 0x00 : 0x01; // oneShot if not looping

  // Rest of instrument header: all zeros (default values)
  // tremoloSpeed(1) + tremoloStep(1) + tremoloRange(1) = 3
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

  // Sample data (signed 8-bit)
  for (let i = 0; i < pcm.length; i++) {
    out[off++] = pcm[i] & 0xFF;
  }

  return out;
}

export async function exportSoundFactory(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const NUM_CHANNELS = 4;

  // Prepare instrument sample data
  const instrumentPcms = new Map<number, Int8Array>();
  const instrumentPeriods = new Map<number, number>();

  for (let i = 0; i < song.instruments.length; i++) {
    const inst = song.instruments[i];
    const id = i + 1; // 1-based
    const pcm = extractPcm(inst);
    instrumentPcms.set(id, pcm);

    // Use sample rate from the sample config to derive the Amiga period
    const sampleRate = inst.sample?.sampleRate ?? 8287;
    const period = freqToPeriod(sampleRate);
    instrumentPeriods.set(id, period);
  }

  // Build opcode streams for each channel
  // Instruments are defined inline on first use per channel; subsequent channels reuse via UseInstrument
  const definedInstrSlots = new Set<number>();
  const channelOpcodes: Uint8Array[] = [];

  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const opcodes = buildChannelOpcodes(
      song, ch, definedInstrSlots, instrumentPcms, instrumentPeriods, warnings,
    );
    channelOpcodes.push(opcodes);
  }

  // Calculate total opcode stream length
  const totalOpcodeLen = channelOpcodes.reduce((s, c) => s + c.length, 0);

  // Build the file
  const moduleLength = HEADER_SIZE + totalOpcodeLen;
  const fileSize = moduleLength;
  const output = new Uint8Array(fileSize);
  const view = new DataView(output.buffer);

  // Module length (uint32 BE at offset 0)
  view.setUint32(0, moduleLength, false);

  // Voice counts: sub-song 0 uses all 4 channels, rest unused
  // Voice count is a 4-bit channel enable mask
  let voiceMask = 0;
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    // Check if channel has any content
    if (channelOpcodes[ch].length > 1) { // more than just End opcode
      voiceMask |= (1 << ch);
    }
  }
  output[4] = voiceMask; // sub-song 0
  // sub-songs 1-15 remain 0 (unused)

  // Opcode start offsets: 16 subsongs x 4 channels x uint32
  // Only sub-song 0 has valid offsets
  let opcodeOffset = 0; // relative to start of opcodes section
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    // File-absolute offset = HEADER_SIZE + opcodeOffset
    const fileOffset = HEADER_SIZE + opcodeOffset;
    view.setUint32(20 + ch * 4, fileOffset, false);
    opcodeOffset += channelOpcodes[ch].length;
  }
  // Remaining subsong offsets (sub-songs 1-15) stay 0

  // Write opcode streams
  let writeOff = HEADER_SIZE;
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    output.set(channelOpcodes[ch], writeOff);
    writeOff += channelOpcodes[ch].length;
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '_');
  const data = new Blob([output.buffer], { type: 'application/octet-stream' });

  if (song.instruments.length > 256) {
    warnings.push(`Song has ${song.instruments.length} instruments; PSF supports up to 256 slots.`);
  }

  return { data, filename: `${baseName}.psf`, warnings };
}
