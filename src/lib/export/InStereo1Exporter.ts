/**
 * InStereo1Exporter.ts — Export TrackerSong to InStereo! 1.0 (IS10/ISM!V1.2) native format
 *
 * Reconstructs a valid IS10 binary from the TrackerSong's patterns, instruments, and metadata.
 *
 * File layout (all big-endian):
 *   "ISM!V1.2" magic (8 bytes)
 *   Header fields (offset 8-35)
 *   Module name (28 bytes) + padding (140 bytes)
 *   Sample info (numberOfSamples x 28 bytes)
 *   Sample lengths (numberOfSamples x 4 bytes)
 *   EGC tables (numberOfEGC x 128 bytes)
 *   ADSR tables (numberOfADSR x 128 bytes)
 *   Instrument info (numberOfInstruments x 28 bytes)
 *   Arpeggio tables (16 x 16 bytes = 256 bytes)
 *   Sub-song info (numberOfSubSongs x 16 bytes)
 *   14 bytes extra sub-song padding
 *   Waveforms (numberOfWaveforms x 256 bytes)
 *   Positions (totalPositions x 4 channels x 4 bytes)
 *   Track rows ((totalTrackRows + 64) x 4 bytes)
 *   Sample PCM data
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Write helpers (big-endian) ──────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     = (val >>> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     = (val >>> 24) & 0xFF;
  buf[off + 1] = (val >>> 16) & 0xFF;
  buf[off + 2] = (val >>> 8)  & 0xFF;
  buf[off + 3] = val & 0xFF;
}

function writeS8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeString(buf: Uint8Array, off: number, str: string, maxLen: number): void {
  for (let i = 0; i < maxLen; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

// ── XM note to IS10 note index ──────────────────────────────────────────────

/** Reverse of parser's is10NoteToXm: noteIndex = xmNote + 36 */
function xmNoteToIS10(xmNote: number): number {
  if (xmNote === 0) return 0;
  if (xmNote === 97) return 0x7F; // note-off
  const noteIdx = xmNote + 36;
  return (noteIdx >= 1 && noteIdx <= 108) ? noteIdx : 0;
}

// ── XM effect to IS10 effect ────────────────────────────────────────────────

function xmEffectToIS10(effTyp: number, eff: number): { effect: number; effectArg: number } {
  switch (effTyp) {
    case 0x0C: // SetVolume -> IS10 effect 7
      return { effect: 0x07, effectArg: Math.min(63, eff) & 0x3F };
    case 0x0F: // SetSpeed -> IS10 effect F
      if (eff > 0 && eff <= 31) return { effect: 0x0F, effectArg: eff };
      return { effect: 0, effectArg: 0 };
    default:
      return { effect: 0, effectArg: 0 };
  }
}

// ── Extract 8-bit signed PCM from WAV audioBuffer ───────────────────────────

function extractPCMFromWAV(audioBuffer: ArrayBuffer): Uint8Array {
  const view = new DataView(audioBuffer);
  // Standard WAV: data chunk at offset 36, length at 40, data at 44
  // Find "data" chunk
  let dataOffset = 12;
  while (dataOffset + 8 <= audioBuffer.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(dataOffset),
      view.getUint8(dataOffset + 1),
      view.getUint8(dataOffset + 2),
      view.getUint8(dataOffset + 3),
    );
    const chunkSize = view.getUint32(dataOffset + 4, true);
    if (chunkId === 'data') {
      const frames = Math.floor(chunkSize / 2); // 16-bit samples
      const pcm = new Uint8Array(frames);
      for (let i = 0; i < frames; i++) {
        const s16 = view.getInt16(dataOffset + 8 + i * 2, true);
        // Convert 16-bit signed to 8-bit signed (stored as unsigned byte)
        pcm[i] = (s16 >> 8) & 0xFF;
      }
      return pcm;
    }
    dataOffset += 8 + chunkSize;
    if (chunkSize & 1) dataOffset++; // WAV chunks are word-aligned
  }
  return new Uint8Array(0);
}

export interface InStereo1ExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export async function exportInStereo1(song: TrackerSong): Promise<InStereo1ExportResult> {
  const warnings: string[] = [];
  const NUM_CHANNELS = 4;

  // ── Gather instruments ──────────────────────────────────────────────────

  // Separate synth vs PCM instruments, collect waveforms, EGC/ADSR tables
  const waveformsList: number[][] = [];    // unique waveforms (256 signed bytes each)
  const egcTablesList: number[][] = [];    // unique EGC tables (128 bytes each)
  const adsrTablesList: number[][] = [];   // unique ADSR tables (256 bytes each)
  const waveformMap = new Map<string, number>(); // hash -> index
  const egcMap = new Map<string, number>();
  const adsrMap = new Map<string, number>();

  function getOrAddWaveform(wave: number[]): number {
    const key = wave.slice(0, 256).join(',');
    if (waveformMap.has(key)) return waveformMap.get(key)!;
    const idx = waveformsList.length;
    const padded = new Array(256).fill(0);
    for (let i = 0; i < Math.min(256, wave.length); i++) padded[i] = wave[i];
    waveformsList.push(padded);
    waveformMap.set(key, idx);
    return idx;
  }

  function getOrAddEGC(tbl: number[]): number {
    const key = tbl.slice(0, 128).join(',');
    if (egcMap.has(key)) return egcMap.get(key)!;
    const idx = egcTablesList.length;
    const padded = new Array(128).fill(0);
    for (let i = 0; i < Math.min(128, tbl.length); i++) padded[i] = tbl[i];
    egcTablesList.push(padded);
    egcMap.set(key, idx);
    return idx;
  }

  function getOrAddADSR(tbl: number[]): number {
    const key = tbl.slice(0, 256).join(',');
    if (adsrMap.has(key)) return adsrMap.get(key)!;
    const idx = adsrTablesList.length;
    const padded = new Array(256).fill(0);
    for (let i = 0; i < Math.min(256, tbl.length); i++) padded[i] = tbl[i];
    adsrTablesList.push(padded);
    adsrMap.set(key, idx);
    return idx;
  }

  // Sample PCM data (raw 8-bit signed) and sample info
  interface SampleEntry {
    name: string;
    pcmData: Uint8Array;
  }
  const samples: SampleEntry[] = [];
  const sampleMap = new Map<number, number>(); // instrumentId -> sampleIndex

  // IS10 instrument entries (28 bytes each)
  interface IS10InstrEntry {
    waveformNumber: number;
    synthesisEnabled: boolean;
    waveformLength: number;
    repeatLength: number;
    volume: number;
    portamentoSpeed: number;
    adsrEnabled: boolean;
    adsrTableNumber: number;
    adsrTableLength: number;
    portamentoEnabled: boolean;
    vibratoDelay: number;
    vibratoSpeed: number;
    vibratoLevel: number;
    egcOffset: number;
    egcMode: number;
    egcTableNumber: number;
    egcTableLength: number;
  }
  const instrEntries: IS10InstrEntry[] = [];

  for (const inst of song.instruments) {
    const is10 = inst.inStereo1;

    if (is10 && inst.synthType === 'InStereo1Synth') {
      // Synth instrument
      const waveIdx = is10.waveform1 ? getOrAddWaveform(is10.waveform1) : 0;
      const egcIdx = is10.egTable ? getOrAddEGC(is10.egTable) : 0;
      const adsrIdx = is10.adsrTable ? getOrAddADSR(is10.adsrTable) : 0;

      instrEntries.push({
        waveformNumber: waveIdx,
        synthesisEnabled: true,
        waveformLength: is10.waveformLength ?? 256,
        repeatLength: 0,
        volume: is10.volume ?? 64,
        portamentoSpeed: is10.portamentoSpeed > 0 ? is10.portamentoSpeed : 0,
        adsrEnabled: (is10.adsrLength ?? 0) > 0,
        adsrTableNumber: adsrIdx,
        adsrTableLength: is10.adsrLength ?? 0,
        portamentoEnabled: (is10.portamentoSpeed ?? 0) > 0,
        vibratoDelay: is10.vibratoDelay ?? 0,
        vibratoSpeed: is10.vibratoSpeed ?? 0,
        vibratoLevel: is10.vibratoLevel ?? 0,
        egcOffset: is10.egStartLen ?? 0,
        egcMode: is10.egMode ?? 0,
        egcTableNumber: egcIdx,
        egcTableLength: is10.egTable ? is10.egTable.length : 0,
      });
    } else if (inst.sample?.audioBuffer) {
      // PCM sample instrument
      const pcmData = extractPCMFromWAV(inst.sample.audioBuffer);
      if (pcmData.length > 0) {
        const sampleIdx = samples.length;
        sampleMap.set(inst.id, sampleIdx);
        samples.push({
          name: inst.name || `Sample ${inst.id}`,
          pcmData,
        });

        const loopStart = inst.sample.loopStart ?? 0;
        const loopEnd = inst.sample.loopEnd ?? 0;
        const hasLoop = inst.sample.loop && loopEnd > loopStart;

        // repeatLength: 0 = full loop, 2 = no loop, else actual loop length
        let repeatLength = 2; // no loop
        let waveformLength = 0;
        if (hasLoop) {
          if (loopStart === 0 && loopEnd >= pcmData.length) {
            repeatLength = 0; // full loop
          } else {
            waveformLength = loopStart;
            repeatLength = loopEnd - loopStart;
          }
        }

        // Volume: convert from dB (-60..0) to Amiga 0..64
        const vol = inst.volume != null
          ? Math.round(Math.pow(10, inst.volume / 20) * 64)
          : 64;

        instrEntries.push({
          waveformNumber: sampleIdx,
          synthesisEnabled: false,
          waveformLength,
          repeatLength,
          volume: Math.max(0, Math.min(64, vol)),
          portamentoSpeed: 0,
          adsrEnabled: false,
          adsrTableNumber: 0,
          adsrTableLength: 0,
          portamentoEnabled: false,
          vibratoDelay: 0,
          vibratoSpeed: 0,
          vibratoLevel: 0,
          egcOffset: 0,
          egcMode: 0,
          egcTableNumber: 0,
          egcTableLength: 0,
        });
      } else {
        // Empty instrument
        instrEntries.push(emptyInstrEntry());
        warnings.push(`Instrument ${inst.id} "${inst.name}" has no audio data`);
      }
    } else {
      // Placeholder / empty
      instrEntries.push(emptyInstrEntry());
    }
  }

  // Ensure at least 1 instrument
  if (instrEntries.length === 0) {
    instrEntries.push(emptyInstrEntry());
    warnings.push('No instruments found; added empty placeholder');
  }

  // ── Build track rows from patterns ────────────────────────────────────────

  // IS10 uses indirect referencing: positions reference track rows by index.
  // We flatten all pattern channel columns into a single track row pool.
  const trackRowPool: Array<{ note: number; instrument: number; arpeggio: number; effect: number; effectArg: number }> = [];

  // Positions: one per song position, each with 4 channel entries
  interface IS10PosEntry {
    startTrackRow: number;
    soundTranspose: number;
    noteTranspose: number;
  }
  const positionEntries: IS10PosEntry[][] = [];

  const songLen = song.songPositions.length;
  const rowsPerTrack = songLen > 0 && song.patterns.length > 0
    ? (song.patterns[0]?.length ?? 64)
    : 64;

  for (let posIdx = 0; posIdx < songLen; posIdx++) {
    const patIdx = song.songPositions[posIdx] ?? 0;
    const pat = song.patterns[patIdx];
    const posRow: IS10PosEntry[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const startTrackRow = trackRowPool.length;
      const channel = pat?.channels[ch];

      for (let row = 0; row < rowsPerTrack; row++) {
        const cell = channel?.rows[row];
        if (!cell || (cell.note === 0 && cell.instrument === 0 && cell.effTyp === 0)) {
          trackRowPool.push({ note: 0, instrument: 0, arpeggio: 0, effect: 0, effectArg: 0 });
          continue;
        }

        const note = xmNoteToIS10(cell.note ?? 0);
        const instrument = cell.instrument ?? 0;
        const { effect, effectArg } = xmEffectToIS10(cell.effTyp ?? 0, cell.eff ?? 0);

        trackRowPool.push({ note, instrument, arpeggio: 0, effect, effectArg });
      }

      posRow.push({ startTrackRow, soundTranspose: 0, noteTranspose: 0 });
    }
    positionEntries.push(posRow);
  }

  // Ensure at least one position
  if (positionEntries.length === 0) {
    const posRow: IS10PosEntry[] = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const startTrackRow = trackRowPool.length;
      for (let row = 0; row < rowsPerTrack; row++) {
        trackRowPool.push({ note: 0, instrument: 0, arpeggio: 0, effect: 0, effectArg: 0 });
      }
      posRow.push({ startTrackRow, soundTranspose: 0, noteTranspose: 0 });
    }
    positionEntries.push(posRow);
  }

  // totalNumberOfTrackRows = actual rows in pool (without the 64 padding)
  const totalNumberOfTrackRows = trackRowPool.length;
  const totalNumberOfPositions = positionEntries.length;

  // ── Arpeggio tables (16 x 16 bytes, default all zeros) ────────────────────
  const arpTables: number[][] = [];
  for (let i = 0; i < 16; i++) {
    arpTables.push(new Array(16).fill(0));
  }

  // ── Sub-song info ─────────────────────────────────────────────────────────
  const numberOfSubSongs = 1;
  const startSpeed = song.initialSpeed ?? 6;

  // ── Calculate total file size ──────────────────────────────────────────────

  const numberOfSamples = samples.length;
  const numberOfWaveforms = waveformsList.length;
  const numberOfInstruments = instrEntries.length;
  const numberOfEGC = egcTablesList.length;
  const numberOfADSR = adsrTablesList.length;

  let fileSize = 0;
  fileSize += 8;                                         // magic
  fileSize += 2 + 2 + 4;                                // totalPositions, totalTrackRows, reserved
  fileSize += 6;                                         // counts (samples, waves, instr, subsongs, egc, adsr)
  fileSize += 14;                                        // reserved
  fileSize += 28;                                        // module name
  fileSize += 140;                                       // extra text/padding
  fileSize += numberOfSamples * 28;                      // sample info
  fileSize += numberOfSamples * 4;                       // sample lengths
  fileSize += numberOfEGC * 128;                         // EGC tables
  fileSize += numberOfADSR * 256;                        // ADSR tables
  fileSize += numberOfInstruments * 28;                  // instrument info
  fileSize += 16 * 16;                                   // arpeggio tables (256 bytes)
  fileSize += numberOfSubSongs * 16;                     // sub-song info
  fileSize += 14;                                        // extra sub-song padding
  fileSize += numberOfWaveforms * 256;                   // waveforms
  fileSize += totalNumberOfPositions * NUM_CHANNELS * 4; // positions
  fileSize += (totalNumberOfTrackRows + 64) * 4;         // track rows + 64 padding rows
  for (const s of samples) {
    fileSize += s.pcmData.length;                        // sample PCM data
  }

  // ── Write the file ────────────────────────────────────────────────────────

  const output = new Uint8Array(fileSize);
  let off = 0;

  // Magic: "ISM!V1.2"
  const magic = [0x49, 0x53, 0x4D, 0x21, 0x56, 0x31, 0x2E, 0x32];
  for (let i = 0; i < 8; i++) output[off++] = magic[i];

  // Header fields at offset 8
  writeU16BE(output, off, totalNumberOfPositions); off += 2;
  writeU16BE(output, off, totalNumberOfTrackRows); off += 2;
  off += 4; // reserved (zeros)

  writeU8(output, off++, numberOfSamples);
  writeU8(output, off++, numberOfWaveforms);
  writeU8(output, off++, numberOfInstruments);
  writeU8(output, off++, numberOfSubSongs);
  writeU8(output, off++, numberOfEGC);
  writeU8(output, off++, numberOfADSR);

  off += 14; // reserved

  // Module name (28 bytes)
  writeString(output, off, song.name || 'Untitled', 28);
  off += 28;

  // Extra text/padding (140 bytes, zeros)
  off += 140;

  // ── Sample info: numberOfSamples x 28 bytes ─────────────────────────────
  for (let i = 0; i < numberOfSamples; i++) {
    off += 1; // reserved byte
    writeString(output, off, samples[i].name, 23);
    off += 23;
    off += 4; // reserved
  }

  // ── Sample lengths: numberOfSamples x uint32 ───────────────────────────
  for (let i = 0; i < numberOfSamples; i++) {
    writeU32BE(output, off, samples[i].pcmData.length);
    off += 4;
  }

  // ── EGC tables: numberOfEGC x 128 bytes ───────────────────────────────
  for (let i = 0; i < numberOfEGC; i++) {
    for (let j = 0; j < 128; j++) {
      writeU8(output, off++, egcTablesList[i][j] ?? 0);
    }
  }

  // ── ADSR tables: numberOfADSR x 256 bytes ─────────────────────────────
  for (let i = 0; i < numberOfADSR; i++) {
    for (let j = 0; j < 256; j++) {
      writeU8(output, off++, adsrTablesList[i][j] ?? 0);
    }
  }

  // ── Instrument info: numberOfInstruments x 28 bytes ────────────────────
  for (const instr of instrEntries) {
    writeU8(output, off++, instr.waveformNumber);
    writeU8(output, off++, instr.synthesisEnabled ? 1 : 0);
    writeU16BE(output, off, instr.waveformLength); off += 2;
    writeU16BE(output, off, instr.repeatLength); off += 2;
    writeU8(output, off++, instr.volume);
    writeS8(output, off++, instr.portamentoSpeed); // signed byte
    writeU8(output, off++, instr.adsrEnabled ? 1 : 0);
    writeU8(output, off++, instr.adsrTableNumber);
    writeU16BE(output, off, instr.adsrTableLength); off += 2;
    off += 2; // skip (zeros)
    writeU8(output, off++, instr.portamentoEnabled ? 1 : 0);
    off += 5; // skip (zeros)
    writeU8(output, off++, instr.vibratoDelay);
    writeU8(output, off++, instr.vibratoSpeed);
    writeU8(output, off++, instr.vibratoLevel);
    writeU8(output, off++, instr.egcOffset);
    writeU8(output, off++, instr.egcMode);
    writeU8(output, off++, instr.egcTableNumber);
    writeU16BE(output, off, instr.egcTableLength); off += 2;
  }

  // ── Arpeggio tables: 16 x 16 bytes ────────────────────────────────────
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      writeS8(output, off++, arpTables[i][j]);
    }
  }

  // ── Sub-song info: numberOfSubSongs x 16 bytes ────────────────────────
  for (let i = 0; i < numberOfSubSongs; i++) {
    off += 4; // reserved (zeros)
    writeU8(output, off++, startSpeed);
    writeU8(output, off++, rowsPerTrack);
    writeU16BE(output, off, 0); off += 2;                              // firstPosition = 0
    writeU16BE(output, off, totalNumberOfPositions - 1); off += 2;     // lastPosition
    writeU16BE(output, off, 0); off += 2;                              // restartPosition
    off += 2; // skip (zeros)
  }

  // Extra sub-song padding (14 bytes)
  off += 14;

  // ── Waveforms: numberOfWaveforms x 256 signed bytes ────────────────────
  for (let i = 0; i < numberOfWaveforms; i++) {
    for (let j = 0; j < 256; j++) {
      writeS8(output, off++, waveformsList[i][j]);
    }
  }

  // ── Positions: totalPositions x 4 channels x 4 bytes ──────────────────
  for (let i = 0; i < totalNumberOfPositions; i++) {
    const posRow = positionEntries[i];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const pos = posRow[ch];
      writeU16BE(output, off, pos.startTrackRow); off += 2;
      writeS8(output, off++, pos.soundTranspose);
      writeS8(output, off++, pos.noteTranspose);
    }
  }

  // ── Track rows: (totalTrackRows + 64) x 4 bytes ───────────────────────
  // Write actual track row data
  for (const line of trackRowPool) {
    output[off++] = line.note & 0xFF;
    output[off++] = line.instrument & 0xFF;
    output[off++] = ((line.arpeggio & 0x0F) << 4) | (line.effect & 0x0F);
    output[off++] = line.effectArg & 0xFF;
  }
  // Write 64 empty padding rows
  for (let i = 0; i < 64; i++) {
    off += 4; // zeros
  }

  // ── Sample PCM data ───────────────────────────────────────────────────
  for (const s of samples) {
    output.set(s.pcmData, off);
    off += s.pcmData.length;
  }

  // ── Build result ──────────────────────────────────────────────────────

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '_');
  const data = new Blob([output.buffer as ArrayBuffer], { type: 'application/octet-stream' });

  return {
    data,
    filename: `${baseName}.is`,
    warnings,
  };
}

// ── Helper ──────────────────────────────────────────────────────────────────

function emptyInstrEntry() {
  return {
    waveformNumber: 0,
    synthesisEnabled: false,
    waveformLength: 0,
    repeatLength: 2,
    volume: 0,
    portamentoSpeed: 0,
    adsrEnabled: false,
    adsrTableNumber: 0,
    adsrTableLength: 0,
    portamentoEnabled: false,
    vibratoDelay: 0,
    vibratoSpeed: 0,
    vibratoLevel: 0,
    egcOffset: 0,
    egcMode: 0,
    egcTableNumber: 0,
    egcTableLength: 0,
  };
}
