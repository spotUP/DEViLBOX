/**
 * SonicArrangerExporter.ts — Export TrackerSong as Sonic Arranger (.sa) SOARV1.0 format
 *
 * Reconstructs a valid Sonic Arranger binary with the SOARV1.0 chunk layout:
 *   [SOARV1.0] magic (8 bytes)
 *   [STBL] uint32 count + count x 12-byte sub-song descriptors
 *   [OVTB] uint32 count + count x 16-byte position entries (4 channels x 4 bytes)
 *   [NTBL] uint32 count + count x 4-byte track row entries
 *   [INST] uint32 count + count x 152-byte instrument descriptors
 *   [SD8B] int32 count + 38-byte sample info x count + uint32 lengths x count + PCM data
 *   [SYWT] uint32 count + count x 128-byte signed waveforms
 *   [SYAR] uint32 count + count x 128-byte ADSR tables (unsigned uint8)
 *   [SYAF] uint32 count + count x 128-byte AMF tables (signed int8)
 *
 * Note mapping: XM note = SA note - 36, so SA note = XM note + 36.
 * XM note-off (97) maps to SA 0x7F (force quiet).
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { SonicArrangerConfig } from '@/types/instrument';

// -- Binary write helpers (big-endian) ----------------------------------------

function writeStr(buf: Uint8Array, off: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    buf[off + i] = str.charCodeAt(i) & 0xFF;
  }
}

function writeU8(view: DataView, off: number, val: number): void {
  view.setUint8(off, val & 0xFF);
}

function writeI8(view: DataView, off: number, val: number): void {
  view.setInt8(off, val);
}

function writeU16(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, false);
}

function writeI16(view: DataView, off: number, val: number): void {
  view.setInt16(off, val, false);
}

function writeU32(view: DataView, off: number, val: number): void {
  view.setUint32(off, val >>> 0, false);
}

function writeI32(view: DataView, off: number, val: number): void {
  view.setInt32(off, val, false);
}

function writeStrPadded(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? (str.charCodeAt(i) & 0xFF) : 0;
  }
}

// -- Sample PCM extraction from WAV audioBuffer --------------------------------

function extractPCM8FromWAV(audioBuffer: ArrayBuffer): Int8Array {
  const view = new DataView(audioBuffer);
  // Standard WAV: data chunk starts at offset 44, 16-bit samples
  // Find "data" chunk
  let dataOff = 12;
  while (dataOff + 8 < audioBuffer.byteLength) {
    const chunkId =
      String.fromCharCode(view.getUint8(dataOff)) +
      String.fromCharCode(view.getUint8(dataOff + 1)) +
      String.fromCharCode(view.getUint8(dataOff + 2)) +
      String.fromCharCode(view.getUint8(dataOff + 3));
    const chunkSize = view.getUint32(dataOff + 4, true);
    if (chunkId === 'data') {
      const numSamples = Math.floor(chunkSize / 2);
      const pcm = new Int8Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        const s16 = view.getInt16(dataOff + 8 + i * 2, true);
        pcm[i] = s16 >> 8; // Convert 16-bit to 8-bit signed
      }
      return pcm;
    }
    dataOff += 8 + chunkSize;
    if (chunkSize & 1) dataOff++; // Pad byte
  }
  return new Int8Array(0);
}

// -- XM note -> SA note -------------------------------------------------------

function xmNoteToSA(xmNote: number): number {
  if (xmNote === 0) return 0;
  if (xmNote === 97) return 0x7F; // note-off -> force quiet
  const sa = xmNote + 36;
  return (sa >= 1 && sa <= 108) ? sa : 0;
}

// -- XM effect -> SA effect ---------------------------------------------------

function xmEffectToSA(
  cell: { effTyp: number; eff: number; volume: number; saEffect?: number; saEffectArg?: number },
): { effect: number; effArg: number } {
  // If original SA effect data is preserved, use it for lossless round-trip
  if (cell.saEffect !== undefined && cell.saEffect !== 0) {
    return { effect: cell.saEffect, effArg: cell.saEffectArg ?? 0 };
  }
  if (cell.saEffectArg !== undefined && cell.saEffectArg !== 0) {
    return { effect: cell.saEffect ?? 0, effArg: cell.saEffectArg };
  }

  const effTyp = cell.effTyp;
  const effVal = cell.eff;

  // Map XM effects back to SA effects
  switch (effTyp) {
    case 0x00: // Arpeggio
      if (effVal !== 0) return { effect: 0x0, effArg: effVal };
      break;
    case 0x0B: // Position jump
      return { effect: 0xB, effArg: effVal };
    case 0x0D: // Pattern break
      return { effect: 0xD, effArg: 0 };
    case 0x0E: // E0x = set filter
      return { effect: 0xE, effArg: effVal & 0x01 };
    case 0x0F: // Set speed
      return { effect: 0xF, effArg: effVal };
    case 0x10: // Gxx = set global volume
      return { effect: 0x6, effArg: Math.min(effVal, 64) };
    default:
      break;
  }

  // Check volume column for SetVolume (0xC)
  if (cell.volume >= 0x10 && cell.volume <= 0x50) {
    return { effect: 0xC, effArg: cell.volume - 0x10 };
  }

  return { effect: 0, effArg: 0 };
}

// -- Main export function -----------------------------------------------------

export async function exportSonicArranger(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const numChannels = 4;

  if (song.numChannels > 4) {
    warnings.push(`Sonic Arranger supports 4 channels; channels 5-${song.numChannels} will be dropped.`);
  }

  // -- Collect instruments and separate into sample vs synth -------------------
  const instruments = song.instruments;
  const numInstruments = instruments.length;

  // Collect sample PCM data for sample-type instruments
  // SA uses a flat sample array; each sample instrument references an index into it
  const samplePCMs: Int8Array[] = [];
  const sampleInstrMap = new Map<number, number>(); // instrument index -> sample PCM index

  // Collect synth waveforms, ADSR tables, AMF tables
  const allWaveforms: number[][] = [];
  const allAdsrTables: number[][] = [];
  const allAmfTables: number[][] = [];

  for (let i = 0; i < numInstruments; i++) {
    const inst = instruments[i];
    const saConfig = inst.sonicArranger as SonicArrangerConfig | undefined;

    if (saConfig && inst.synthType === 'SonicArrangerSynth') {
      // Synth instrument - collect waveform/ADSR/AMF data
      // Ensure waveform is in the allWaveforms array
      if (saConfig.allWaveforms && saConfig.allWaveforms.length > 0) {
        // Merge all waveforms from this instrument's config
        for (const wf of saConfig.allWaveforms) {
          // Check if this waveform already exists (by reference or content)
          const existsIdx = allWaveforms.findIndex(existing =>
            existing.length === wf.length && existing.every((v, j) => v === wf[j]),
          );
          if (existsIdx === -1) {
            allWaveforms.push(wf);
          }
        }
      }
      // Add individual waveform if not already there
      if (saConfig.waveformData && saConfig.waveformData.length > 0) {
        const existsIdx = allWaveforms.findIndex(existing =>
          existing.length === saConfig.waveformData.length &&
          existing.every((v, j) => v === saConfig.waveformData[j]),
        );
        if (existsIdx === -1) {
          allWaveforms.push(saConfig.waveformData);
        }
      }

      // ADSR table
      if (saConfig.adsrTable && saConfig.adsrTable.length > 0) {
        const existsIdx = allAdsrTables.findIndex(existing =>
          existing.length === saConfig.adsrTable.length &&
          existing.every((v, j) => v === saConfig.adsrTable[j]),
        );
        if (existsIdx === -1) {
          allAdsrTables.push(saConfig.adsrTable);
        }
      }

      // AMF table
      if (saConfig.amfTable && saConfig.amfTable.length > 0) {
        const existsIdx = allAmfTables.findIndex(existing =>
          existing.length === saConfig.amfTable.length &&
          existing.every((v, j) => v === saConfig.amfTable[j]),
        );
        if (existsIdx === -1) {
          allAmfTables.push(saConfig.amfTable);
        }
      }
    } else if (inst.sample?.audioBuffer) {
      // Sample instrument
      const pcm = extractPCM8FromWAV(inst.sample.audioBuffer);
      sampleInstrMap.set(i, samplePCMs.length);
      samplePCMs.push(pcm);
    } else {
      // Empty instrument - still create a zero-length sample entry
      sampleInstrMap.set(i, samplePCMs.length);
      samplePCMs.push(new Int8Array(0));
    }
  }

  // Ensure at least one entry in waveform/ADSR/AMF tables
  if (allWaveforms.length === 0) allWaveforms.push(new Array(128).fill(0));
  if (allAdsrTables.length === 0) allAdsrTables.push(new Array(128).fill(255));
  if (allAmfTables.length === 0) allAmfTables.push(new Array(128).fill(0));

  // -- Build track rows (NTBL) -----------------------------------------------
  // SA uses a flat pool of track rows. Each position entry references a starting
  // index into this pool per channel. We build one block of rows per pattern-channel.
  const trackRows: number[] = []; // flat array of 4-byte packed values
  // positionEntries[posIdx][ch] = { startTrackRow, soundTranspose, noteTranspose }
  interface PosEntry { startTrackRow: number; soundTranspose: number; noteTranspose: number }
  const positionEntries: PosEntry[][] = [];

  for (let patIdx = 0; patIdx < song.patterns.length; patIdx++) {
    const pat = song.patterns[patIdx];
    const patLen = pat.length;
    const channels: PosEntry[] = [];

    for (let ch = 0; ch < numChannels; ch++) {
      const startRow = trackRows.length / 4; // Each row is 4 values = 4 bytes
      const chanData = ch < pat.channels.length ? pat.channels[ch] : null;

      for (let row = 0; row < patLen; row++) {
        const cell = chanData?.rows[row];
        if (!cell || (cell.note === 0 && cell.instrument === 0 && cell.effTyp === 0 && cell.eff === 0 && cell.volume === 0)) {
          trackRows.push(0, 0, 0, 0);
          continue;
        }

        // Byte 0: SA note
        const saNote = xmNoteToSA(cell.note);

        // Byte 1: instrument (1-based)
        const instrByte = (cell.instrument ?? 0) & 0xFF;

        // Byte 2: flags + effect
        const cellAny = cell as unknown as Record<string, unknown>;
        const arpTable = (typeof cellAny.saArpTable === 'number' ? cellAny.saArpTable : 0) & 0x03;
        const { effect, effArg } = xmEffectToSA({
          effTyp: cell.effTyp,
          eff: cell.eff,
          volume: cell.volume,
          saEffect: typeof cellAny.saEffect === 'number' ? cellAny.saEffect : undefined,
          saEffectArg: typeof cellAny.saEffectArg === 'number' ? cellAny.saEffectArg : undefined,
        });
        const byte2 = ((arpTable & 0x03) << 4) | (effect & 0x0F);
        const byte3 = effArg & 0xFF;

        trackRows.push(saNote, instrByte, byte2, byte3);
      }

      channels.push({
        startTrackRow: startRow,
        soundTranspose: 0,
        noteTranspose: 0,
      });
    }

    positionEntries.push(channels);
  }

  const numTrackRows = trackRows.length / 4;

  // -- Build song order (positions used) ------------------------------------
  const songPositions = song.songPositions.length > 0 ? song.songPositions : [0];
  const firstPos = 0;
  const lastPos = songPositions.length - 1;

  // Build full position table: we need entries for every pattern referenced
  // Build a consolidated OVTB from songPositions
  const ovtbEntries: PosEntry[][] = [];
  for (const posIdx of songPositions) {
    if (posIdx < positionEntries.length) {
      ovtbEntries.push(positionEntries[posIdx]);
    } else {
      // Fallback empty entry
      ovtbEntries.push(
        Array.from({ length: numChannels }, () => ({ startTrackRow: 0, soundTranspose: 0, noteTranspose: 0 })),
      );
    }
  }
  const numPositions = ovtbEntries.length;

  // -- Calculate BPM -> SA tempo ----------------------------------------------
  // SA BPM = tempo * 125 / 50, so tempo = BPM * 50 / 125 = BPM * 2 / 5
  const bpm = song.initialBPM || 125;
  const saTempo = Math.max(1, Math.min(255, Math.round(bpm * 50 / 125)));
  const saSpeed = Math.max(1, Math.min(255, song.initialSpeed || 6));
  const rowsPerTrack = song.patterns.length > 0 ? song.patterns[0].length : 64;

  // -- Calculate total file size -----------------------------------------------
  const MAGIC_SIZE = 8; // "SOARV1.0"

  // STBL: marker(4) + count(4) + numSubSongs * 12
  const numSubSongs = 1;
  const stblSize = 4 + 4 + numSubSongs * 12;

  // OVTB: marker(4) + count(4) + numPositions * 16
  const ovtbSize = 4 + 4 + numPositions * 16;

  // NTBL: marker(4) + count(4) + numTrackRows * 4
  const ntblSize = 4 + 4 + numTrackRows * 4;

  // INST: marker(4) + count(4) + numInstruments * 152
  const instSize = 4 + 4 + numInstruments * 152;

  // SD8B: marker(4) + count(4) + numSamples * 38 (info) + numSamples * 4 (lengths) + PCM data
  const numSamples = samplePCMs.length;
  const totalPCMBytes = samplePCMs.reduce((sum, pcm) => sum + pcm.length, 0);
  const sd8bSize = 4 + 4 + numSamples * 38 + numSamples * 4 + totalPCMBytes;

  // SYWT: marker(4) + count(4) + numWaveforms * 128
  const numWaveforms = allWaveforms.length;
  const sywtSize = 4 + 4 + numWaveforms * 128;

  // SYAR: marker(4) + count(4) + numAdsrTables * 128
  const numAdsrTablesOut = allAdsrTables.length;
  const syarSize = 4 + 4 + numAdsrTablesOut * 128;

  // SYAF: marker(4) + count(4) + numAmfTables * 128
  const numAmfTablesOut = allAmfTables.length;
  const syafSize = 4 + 4 + numAmfTablesOut * 128;

  const totalSize = MAGIC_SIZE + stblSize + ovtbSize + ntblSize + instSize + sd8bSize + sywtSize + syarSize + syafSize;

  // -- Allocate and fill buffer ------------------------------------------------
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let pos = 0;

  // -- Magic -------------------------------------------------------------------
  writeStr(output, pos, 'SOARV1.0');
  pos += 8;

  // -- STBL: sub-song table ---------------------------------------------------
  writeStr(output, pos, 'STBL'); pos += 4;
  writeU32(view, pos, numSubSongs); pos += 4;

  // Sub-song descriptor (12 bytes):
  // startSpeed(u16), rowsPerTrack(u16), firstPosition(u16),
  // lastPosition(u16), restartPosition(u16), tempo(u16)
  writeU16(view, pos, saSpeed); pos += 2;
  writeU16(view, pos, rowsPerTrack); pos += 2;
  writeU16(view, pos, firstPos); pos += 2;
  writeU16(view, pos, lastPos); pos += 2;
  writeU16(view, pos, song.restartPosition ?? 0); pos += 2;
  writeU16(view, pos, saTempo); pos += 2;

  // -- OVTB: position/order table ---------------------------------------------
  writeStr(output, pos, 'OVTB'); pos += 4;
  writeU32(view, pos, numPositions); pos += 4;

  for (let p = 0; p < numPositions; p++) {
    const entry = ovtbEntries[p];
    for (let ch = 0; ch < numChannels; ch++) {
      const pe = entry[ch];
      writeU16(view, pos, pe.startTrackRow); pos += 2;
      writeI8(view, pos, pe.soundTranspose); pos += 1;
      writeI8(view, pos, pe.noteTranspose); pos += 1;
    }
  }

  // -- NTBL: track rows -------------------------------------------------------
  writeStr(output, pos, 'NTBL'); pos += 4;
  writeU32(view, pos, numTrackRows); pos += 4;

  for (let i = 0; i < trackRows.length; i++) {
    writeU8(view, pos, trackRows[i]); pos += 1;
  }

  // -- INST: instruments (152 bytes each) -------------------------------------
  writeStr(output, pos, 'INST'); pos += 4;
  writeU32(view, pos, numInstruments); pos += 4;

  for (let i = 0; i < numInstruments; i++) {
    const inst = instruments[i];
    const saConfig = inst.sonicArranger as SonicArrangerConfig | undefined;
    const base = pos;

    if (saConfig && inst.synthType === 'SonicArrangerSynth') {
      // Synth instrument
      writeU16(view, base, 1); // type = Synth
      writeU16(view, base + 2, saConfig.waveformNumber);
      writeU16(view, base + 4, saConfig.waveformLength);
      // repeatLength: synth instruments typically loop all (0)
      writeU16(view, base + 6, 0);
      // +8: 8 bytes skip (zeros)
      writeU16(view, base + 16, saConfig.volume & 0xFF);
      writeI16(view, base + 18, saConfig.fineTuning);
      writeU16(view, base + 20, saConfig.portamentoSpeed);
      writeU16(view, base + 22, saConfig.vibratoDelay);
      writeU16(view, base + 24, saConfig.vibratoSpeed);
      writeU16(view, base + 26, saConfig.vibratoLevel);
      writeU16(view, base + 28, saConfig.amfNumber);
      writeU16(view, base + 30, saConfig.amfDelay);
      writeU16(view, base + 32, saConfig.amfLength);
      writeU16(view, base + 34, saConfig.amfRepeat);
      writeU16(view, base + 36, saConfig.adsrNumber);
      writeU16(view, base + 38, saConfig.adsrDelay);
      writeU16(view, base + 40, saConfig.adsrLength);
      writeU16(view, base + 42, saConfig.adsrRepeat);
      writeU16(view, base + 44, saConfig.sustainPoint);
      writeU16(view, base + 46, saConfig.sustainDelay);
      // +48: 16 bytes skip (zeros)
      writeU16(view, base + 64, saConfig.effectArg1);
      writeU16(view, base + 66, saConfig.effect);
      writeU16(view, base + 68, saConfig.effectArg2);
      writeU16(view, base + 70, saConfig.effectArg3);
      writeU16(view, base + 72, saConfig.effectDelay);

      // 3 arpeggio sub-tables at +74, each 16 bytes
      for (let a = 0; a < 3; a++) {
        const arpBase = base + 74 + a * 16;
        const arp = saConfig.arpeggios[a];
        if (arp) {
          writeU8(view, arpBase, arp.length);
          writeU8(view, arpBase + 1, arp.repeat);
          for (let j = 0; j < 14; j++) {
            writeI8(view, arpBase + 2 + j, j < arp.values.length ? arp.values[j] : 0);
          }
        }
      }

      // Name at +122, 30 bytes
      writeStrPadded(output, base + 122, saConfig.name || inst.name || '', 30);
    } else {
      // Sample instrument
      const sampleIdx = sampleInstrMap.get(i) ?? 0;
      const pcm = samplePCMs[sampleIdx] ?? new Int8Array(0);

      writeU16(view, base, 0); // type = Sample
      writeU16(view, base + 2, sampleIdx); // waveformNumber = sample index

      // Compute waveformLength and repeatLength in words
      const sampleConfig = inst.sample;
      let waveformLenWords = 0;
      let repeatLenWords = 1; // 1 = no loop

      if (pcm.length > 0) {
        if (sampleConfig && sampleConfig.loop && sampleConfig.loopEnd > sampleConfig.loopStart) {
          // Looping sample
          waveformLenWords = Math.floor(sampleConfig.loopStart / 2);
          repeatLenWords = Math.max(1, Math.floor((sampleConfig.loopEnd - sampleConfig.loopStart) / 2));
          if (waveformLenWords === 0 && repeatLenWords * 2 >= pcm.length) {
            repeatLenWords = 0; // 0 = loop all
          }
        } else {
          // Non-looping: one-shot = full length, repeat = 1 (no loop)
          waveformLenWords = Math.floor(pcm.length / 2);
          repeatLenWords = 1;
        }
      }

      writeU16(view, base + 4, waveformLenWords);
      writeU16(view, base + 6, repeatLenWords);
      // +8: 8 bytes skip
      // Volume: convert dB back to 0-64
      const volLinear = inst.volume >= 0 ? 64 : Math.round(64 * Math.pow(10, inst.volume / 20));
      writeU16(view, base + 16, Math.min(64, Math.max(0, volLinear)));
      writeI16(view, base + 18, 0); // fineTuning
      // +20..+72: zeros (no vibrato/portamento/effects for sample instruments)
      // +74..+121: zeros (no arpeggios)

      // Name at +122, 30 bytes
      writeStrPadded(output, base + 122, inst.name || '', 30);
    }

    pos += 152;
  }

  // -- SD8B: sample data ------------------------------------------------------
  writeStr(output, pos, 'SD8B'); pos += 4;
  writeI32(view, pos, numSamples); pos += 4;

  // 38-byte sample info headers (zeroed — the parser skips these for SOARV1.0)
  for (let i = 0; i < numSamples; i++) {
    // 38 bytes of zeros per sample info entry
    pos += 38;
  }

  // Per-sample byte lengths (uint32 each)
  for (let i = 0; i < numSamples; i++) {
    writeU32(view, pos, samplePCMs[i].length); pos += 4;
  }

  // PCM data (signed int8)
  for (let i = 0; i < numSamples; i++) {
    const pcm = samplePCMs[i];
    for (let j = 0; j < pcm.length; j++) {
      writeI8(view, pos, pcm[j]); pos += 1;
    }
  }

  // -- SYWT: waveform data (128 signed int8 bytes each) -----------------------
  writeStr(output, pos, 'SYWT'); pos += 4;
  writeU32(view, pos, numWaveforms); pos += 4;

  for (let i = 0; i < numWaveforms; i++) {
    const wf = allWaveforms[i];
    for (let j = 0; j < 128; j++) {
      writeI8(view, pos, j < wf.length ? wf[j] : 0); pos += 1;
    }
  }

  // -- SYAR: ADSR tables (128 unsigned uint8 bytes each) ----------------------
  writeStr(output, pos, 'SYAR'); pos += 4;
  writeU32(view, pos, numAdsrTablesOut); pos += 4;

  for (let i = 0; i < numAdsrTablesOut; i++) {
    const table = allAdsrTables[i];
    for (let j = 0; j < 128; j++) {
      writeU8(view, pos, j < table.length ? table[j] : 255); pos += 1;
    }
  }

  // -- SYAF: AMF tables (128 signed int8 bytes each) --------------------------
  writeStr(output, pos, 'SYAF'); pos += 4;
  writeU32(view, pos, numAmfTablesOut); pos += 4;

  for (let i = 0; i < numAmfTablesOut; i++) {
    const table = allAmfTables[i];
    for (let j = 0; j < 128; j++) {
      writeI8(view, pos, j < table.length ? table[j] : 0); pos += 1;
    }
  }

  // -- Construct filename and return ------------------------------------------
  const baseName = song.name?.replace(/[^a-zA-Z0-9_\- ]/g, '') || 'untitled';
  const filename = `${baseName}.sa`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
