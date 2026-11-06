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

import { cellNoteColumns, columnNotes } from '@/lib/tracker/noteColumns';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import { SF_FX_ROW_OFFSET } from '@/lib/import/formats/soundFactoryGrid';
import { sfEncodeEffects } from '@/lib/import/formats/soundFactoryEffects';
import { BD_FX } from '@/lib/import/formats/benDaglishEffectGlyphs';
import { writeSoundFactory } from '@/lib/import/formats/soundFactoryEdits';
import {
  soundFactoryOpcodeFor, SOUND_FACTORY_EMPTY_INSTRUMENT, type SoundFactoryPitchParams,
} from '@/lib/import/formats/soundFactoryPitch';

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

/**
 * Note opcode for a grid note on an instrument: the inverse of the parser's
 * audible-pitch naming (soundFactoryGridNote). The exporter writes no
 * SetTranspose, so transpose is 0.
 */
function xmNoteToPsf(xmNote: number, pitch: SoundFactoryPitchParams): number {
  if (xmNote <= 0 || xmNote > 96) return -1;
  return soundFactoryOpcodeFor(pitch, xmNote);
}

/**
 * The replayer pitch fields written for an instrument. An instrument imported from
 * a .psf keeps its own (metadata.soundFactoryPitch); any other gets the sampling
 * period from its sample rate at octave 0.
 */
function instrumentPitch(
  inst: TrackerSong['instruments'][number] | undefined,
  pcmLength: number,
): SoundFactoryPitchParams {
  const sampleLength = Math.floor(pcmLength / 2);
  const looped = (inst?.sample?.loop ?? false) && sampleLength > 0;
  const stored = inst?.metadata?.soundFactoryPitch;
  if (stored) return { ...stored, sampleLength, looped };
  const period = freqToPeriod(inst?.sample?.sampleRate ?? 8287);
  return { samplingPeriod: period, octave: 0, waveCount: 1, sampleLength, looped };
}

/** Convert C3 sample rate (Hz) back to Amiga period */
function freqToPeriod(freq: number): number {
  if (freq <= 0) return 214; // default period
  return Math.round(PAL_CLOCK / (2 * freq));
}

/** Extract 8-bit signed PCM from an instrument's sample audioBuffer (WAV format) */
function extractPcm(inst: { sample?: { audioBuffer?: ArrayBuffer; loop?: boolean; loopEnd?: number } }): Int8Array {
  const buf = inst.sample?.audioBuffer;
  if (!buf || buf.byteLength < 44) return new Int8Array(0);

  const wav = new DataView(buf);
  const dataLen = wav.getUint32(40, true);
  // A Sound Factory instrument loops its whole sample, so a looped sample ends at its
  // loop end. pcm8ToWAV tiles short looped waves up to 512 frames for the browser;
  // without this cut an 8-word wave was written back as 512 words, which moves the
  // replayer's pitch (the cycle length) and its table-mode period.
  const wavFrames = Math.floor(dataLen / 2);
  const loopEnd = inst.sample?.loop ? Math.floor(inst.sample.loopEnd ?? 0) : 0;
  const frames = loopEnd > 0 && loopEnd < wavFrames ? loopEnd : wavFrames;
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
  warnings: string[],
  pitchById: Map<number, SoundFactoryPitchParams>,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let currentInstrId = 0;
  let currentVolume = 64;
  let currentTranspose = 0;

  // Walk all patterns in song order
  for (let posIdx = 0; posIdx < song.songPositions.length; posIdx++) {
    const patIdx = song.songPositions[posIdx];
    const pattern = song.patterns[patIdx];
    if (!pattern || channelIdx >= pattern.channels.length) continue;

    const channel = pattern.channels[channelIdx];
    const rows = channel.rows;

    // One grid row = `step` ticks (the parser's main step, song.initialSpeed). A cell with the
    // row-offset effect starts its note that many ticks into the row. Every event's duration
    // is the tick gap to the next event (or the pattern end), so the file keeps the song's timing.
    const step = Math.max(1, Math.floor(song.initialSpeed || 1));
    const isEvent = (c: TrackerCell): boolean =>
      (c.note ?? 0) > 0 || (c.instrument ?? 0) > 0 || (c.effTyp ?? 0) > 0 || (c.volume ?? 0) > 0;
    const events: { cell: TrackerCell; tick: number }[] = [];
    rows.forEach((c, r) => {
      if (!isEvent(c)) return;
      events.push({ cell: c, tick: r * step + (c.effTyp === SF_FX_ROW_OFFSET ? (c.eff ?? 0) : 0) });
    });
    if ((rows.some((c) => cellNoteColumns(c) > 1 && columnNotes(c).slice(1).some((n) => n > 0)))) warnings.push(`Ch${channelIdx + 1}: further note columns are not exported`);
    const patternEnd = rows.length * step;
    const pushPause = (ticks: number): void => {
      if (ticks <= 0) return;
      const pauseBytes = new Uint8Array(3);
      pauseBytes[0] = Op.Pause;
      pauseBytes[1] = (ticks >> 8) & 0xFF;
      pauseBytes[2] = ticks & 0xFF;
      chunks.push(pauseBytes);
    };
    let cursor = 0;
    for (let i = 0; i < events.length; i++) {
      const { cell, tick } = events[i];
      pushPause(tick - cursor);
      const nextTick = i + 1 < events.length ? events[i + 1].tick : patternEnd;
      const duration = Math.max(1, nextTick - tick);
      cursor = tick + duration;
      const xmNote = cell.note ?? 0;
      const instrId = cell.instrument ?? 0;

      // Instrument change: select via UseInstrument. All instruments are pre-defined
      // once, in id order, in the channel-0 preamble (see exportSoundFactory), so the
      // parser's discovery-order id equals the original id and slot = id-1 round-trips.
      if (instrId > 0 && instrId !== currentInstrId) {
        const useBytes = new Uint8Array(2);
        useBytes[0] = Op.UseInstrument;
        useBytes[1] = (instrId - 1) & 0xFF; // slot index (0-based)
        chunks.push(useBytes);
        currentInstrId = instrId;
      }

      // Effect commands of the cell (every slot but the row-offset delay), written before the note they precede.
      const cellFx: { id: number; value: number }[] = [];
      const cellRec = cell as unknown as Record<string, number | undefined>;
      for (const [typKey, valKey] of CELL_FX_SLOTS) {
        const id = cellRec[typKey] ?? 0;
        if (id !== 0 && id !== SF_FX_ROW_OFFSET) cellFx.push({ id, value: cellRec[valKey] ?? 0 });
      }
      if (cellFx.length) {
        const fxBytes = sfEncodeEffects(cellFx, warnings, `Ch${channelIdx + 1} row ${Math.floor(tick / step) + 1}`);
        if (fxBytes.length) chunks.push(Uint8Array.from(fxBytes));
        // A SetVolume command already set the volume; the volume column must not write it a second time.
        const volFx = cellFx.filter((f) => f.id === BD_FX.channelVolume).pop();
        if (volFx) currentVolume = volFx.value;
        const trFx = cellFx.filter((f) => f.id === BD_FX.transpose).pop();
        if (trFx) currentTranspose = (trFx.value << 24) >> 24;
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
        // The replayer adds the SetTranspose value to every note opcode, so write the opcode without it.
        const rawByte = xmNoteToPsf(xmNote, pitchById.get(currentInstrId) ?? SOUND_FACTORY_EMPTY_INSTRUMENT);
        const noteByte = rawByte >= 0 && rawByte - currentTranspose >= 0 && rawByte - currentTranspose < 0x80 ? rawByte - currentTranspose : -1;
        if (noteByte >= 0) {
          const noteBytes = new Uint8Array(3);
          noteBytes[0] = noteByte;
          noteBytes[1] = (duration >> 8) & 0xFF;
          noteBytes[2] = duration & 0xFF;
          chunks.push(noteBytes);
        } else {
          warnings.push(`Ch${channelIdx + 1}: Note ${xmNote} out of PSF range, converted to pause`);
          pushPause(duration);
        }
      } else {
        // Note off, or a cell with no note: a pause to the next event.
        pushPause(duration);
      }
    }
    pushPause(patternEnd - cursor);
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
  pitch: SoundFactoryPitchParams,
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
  out[off++] = (pitch.samplingPeriod >> 8) & 0xFF;
  out[off++] = pitch.samplingPeriod & 0xFF;

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
  // waveCount(1) + octave(1): the replayer's period math reads both
  out[off++] = pitch.waveCount & 0xFF;
  out[off++] = pitch.octave & 0xFF;
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

const CELL_FX_SLOTS = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5'], ['effTyp6', 'eff6'], ['effTyp7', 'eff7'], ['effTyp8', 'eff8']] as const;

export async function exportSoundFactory(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const NUM_CHANNELS = 4;

  // A loaded module goes through the one lossless writer: the source stream, byte-exact, with the grid edits
  // applied to it and every stored offset and length recomputed. The rebuild below is for songs made in the editor.
  if (song.soundFactoryFileData) {
    const written = writeSoundFactory(new Uint8Array(song.soundFactoryFileData), song.patterns, song.instruments);
    const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '_');
    return { data: new Blob([written.data.buffer as ArrayBuffer], { type: 'application/octet-stream' }), filename: `${baseName}.psf`, warnings: written.warnings };
  }

  // Prepare instrument sample data
  const instrumentPcms = new Map<number, Int8Array>();
  const pitchById = new Map<number, SoundFactoryPitchParams>();

  for (let i = 0; i < song.instruments.length; i++) {
    const inst = song.instruments[i];
    const id = i + 1; // 1-based
    const pcm = extractPcm(inst);
    instrumentPcms.set(id, pcm);

    pitchById.set(id, instrumentPitch(inst, pcm.length));
  }

  // Define EVERY instrument once, up front, in id order (slot 0..N-1), as a preamble
  // to channel 0. The parser assigns instrument ids by the order DefineInstrument
  // opcodes are discovered while walking channels 0..3 (SoundFactoryParser.ts:433-440),
  // so emitting the full table in id order makes the re-parsed discovery id equal the
  // original id — and UseInstrument's `slot+1` decode (bounded by the discovered count)
  // then round-trips exactly. Inline first-use definition reordered the table and
  // dropped references whose slot exceeded the shrunken discovered count.
  const preambleChunks: Uint8Array[] = [];
  for (let i = 0; i < song.instruments.length; i++) {
    const def = buildDefineInstrument(
      i, // slot is 0-based (= id-1)
      instrumentPcms.get(i + 1) ?? new Int8Array(0),
      pitchById.get(i + 1) ?? SOUND_FACTORY_EMPTY_INSTRUMENT,
      song.instruments[i],
    );
    if (def) preambleChunks.push(def);
  }
  const preambleLen = preambleChunks.reduce((s, c) => s + c.length, 0);
  const preamble = new Uint8Array(preambleLen);
  {
    let off = 0;
    for (const c of preambleChunks) { preamble.set(c, off); off += c.length; }
  }

  // Build opcode streams for each channel (UseInstrument only; all defs are in preamble)
  const channelOpcodes: Uint8Array[] = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const opcodes = buildChannelOpcodes(song, ch, warnings, pitchById);
    if (ch === 0) {
      const merged = new Uint8Array(preamble.length + opcodes.length);
      merged.set(preamble, 0);
      merged.set(opcodes, preamble.length);
      channelOpcodes.push(merged);
    } else {
      channelOpcodes.push(opcodes);
    }
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
