/**
 * SynthesisExporter.ts — Export TrackerSong as Synthesis (.syn) Synth4.0 format
 *
 * Reconstructs a valid Synthesis module from TrackerSong data.
 * Only Synth4.0 (no prefixed player) is produced.
 *
 * File layout (all big-endian):
 *   +0x00  "Synth4.0" magic (8 bytes)
 *   +0x08  NOP(u16), NOR(u16), skip(4), NOS(u8), NOW(u8), NOI(u8), NSS(u8),
 *          NOE(u8), NOADSR(u8), noise(u8)
 *   +0x13  padding (13 bytes)
 *   +0x20  module name (28 bytes)
 *   +0x3C  comment (140 bytes)
 *   +0xC8  sample info: NOS x 28 bytes [1 unknown + 27 name]
 *   +      sample lengths: NOS x u32 BE
 *   +      EG tables: NOE x 128 bytes
 *   +      ADSR tables: NOADSR x 256 bytes
 *   +      instruments: NOI x 28 bytes
 *   +      arpeggio tables: 16 x 16 bytes
 *   +      sub-songs: NSS x 14 bytes + 14 extra
 *   +      waveforms: NOW x 256 bytes
 *   +      positions: NOP x 16 bytes
 *   +      track rows: (NOR + 64) x 4 bytes
 *   +      sample PCM: NOS x sampleLength bytes
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Utility ────────────────────────────────────────────────────────────────

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val >>> 0, false);
}

function writeString(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

/**
 * Reverse of synNoteToXM from the parser.
 * Parser: xmNote = XM_REFERENCE_NOTE + (synIdx - SYN_REFERENCE_IDX) = 13 + (synIdx - 49)
 * Reverse: synIdx = xmNote - 13 + 49 = xmNote + 36
 */
function xmNoteToSynIdx(xmNote: number): number {
  if (xmNote <= 0) return 0;
  const synIdx = xmNote + 36;
  return Math.max(1, Math.min(108, synIdx));
}

/**
 * Reverse-map XM effects back to Synthesis effects.
 * Parser mapping:
 *   Synthesis 0x1 (Slide)     -> XM 0x03 (tone portamento)
 *   Synthesis 0x8 (SetSpeed)  -> XM 0x0F (set speed)
 *   Synthesis 0xF (SetVolume) -> XM 0x0C (set volume)
 */
function xmEffectToSyn(effTyp: number, eff: number): { effect: number; effectArg: number } {
  switch (effTyp) {
    case 0x03: return { effect: 0x1, effectArg: eff };
    case 0x0F: return { effect: 0x8, effectArg: eff };
    case 0x0C: return { effect: 0xF, effectArg: Math.min(0xFF, eff) };
    default:   return { effect: 0, effectArg: 0 };
  }
}

/**
 * Extract 8-bit signed PCM from a WAV audioBuffer stored on an instrument.
 * Returns the raw signed bytes as Uint8Array (two's complement).
 */
function extractPCM(audioBuffer: ArrayBuffer): Uint8Array {
  const wav = new DataView(audioBuffer);
  // Standard WAV: data chunk at offset 44, sample data as 16-bit LE signed
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const pcm = new Uint8Array(frames);
  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    pcm[j] = (s16 >> 8) & 0xFF; // 16-bit signed -> 8-bit signed (two's complement)
  }
  return pcm;
}

// ── Exporter ───────────────────────────────────────────────────────────────

export async function exportSynthesis(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const numChannels = 4;

  if (song.numChannels > numChannels) {
    warnings.push(`Synthesis supports 4 channels; ${song.numChannels - numChannels} channels were dropped.`);
  }

  // ── Collect instrument/sample data ─────────────────────────────────────
  // Each TrackerSong instrument becomes a Synthesis instrument.
  // If the instrument has a sample audioBuffer, we treat it as a PCM sample.
  // Otherwise, we create a minimal placeholder.

  const instruments = song.instruments;
  const NOI = instruments.length;

  // Build sample PCM data and waveform data
  const samplePCMs: Uint8Array[] = [];
  const sampleNames: string[] = [];
  const sampleLengths: number[] = [];
  const waveformData: Uint8Array[] = [];

  // Instrument definitions: tracks which instruments use samples vs waveforms
  interface SynInstrDef {
    waveformNumber: number;
    synthesisEnabled: boolean;
    waveformLength: number;
    repeatLength: number;
    volume: number;
  }
  const instrDefs: SynInstrDef[] = [];

  for (let i = 0; i < NOI; i++) {
    const inst = instruments[i];
    const vol = Math.min(64, Math.round((inst.volume ?? 100) * 64 / 100));

    if (inst.sample?.audioBuffer) {
      // PCM sample instrument
      const pcm = extractPCM(inst.sample.audioBuffer);
      const sampleIdx = samplePCMs.length;
      samplePCMs.push(pcm);
      sampleNames.push((inst.name ?? `Sample ${sampleIdx}`).substring(0, 27));
      sampleLengths.push(pcm.length);

      // Determine loop
      const loopStart = inst.sample.loopStart ?? 0;
      const loopEnd = inst.sample.loopEnd ?? 0;
      let waveformLength = 0;
      let repeatLength = 2; // default: no loop

      if (loopEnd > loopStart && loopStart === 0 && loopEnd >= pcm.length) {
        // Full loop
        repeatLength = 0;
        waveformLength = 0;
      } else if (loopEnd > loopStart) {
        // Partial loop: loop from waveformLength for repeatLength bytes
        waveformLength = loopStart;
        repeatLength = loopEnd - loopStart;
      }
      // else repeatLength = 2 (no loop)

      instrDefs.push({
        waveformNumber: sampleIdx,
        synthesisEnabled: false,
        waveformLength,
        repeatLength,
        volume: vol,
      });
    } else {
      // No sample — create a silent placeholder instrument pointing to waveform 0
      instrDefs.push({
        waveformNumber: 0,
        synthesisEnabled: true,
        waveformLength: 256,
        repeatLength: 0, // full loop
        volume: vol,
      });
    }
  }

  const NOS = samplePCMs.length;
  // Ensure at least one waveform exists if any instrument references one
  const NOW = waveformData.length > 0 ? waveformData.length : (instrDefs.some(d => d.synthesisEnabled) ? 1 : 0);
  if (NOW > 0 && waveformData.length === 0) {
    // Create a default sine-ish waveform
    const wave = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      wave[i] = Math.round(Math.sin((i / 256) * 2 * Math.PI) * 127) & 0xFF;
    }
    waveformData.push(wave);
  }

  // ── Build positions and track rows from patterns ───────────────────────
  // In Synthesis format:
  //   - "positions" define which track row each voice starts at for that song position
  //   - "track rows" are a flat pool of single-voice note data
  //
  // Strategy: For each pattern, lay out 4 channels sequentially in the track pool.
  // Each channel's rows go into the pool at a unique offset.

  const songLen = song.songPositions.length;
  const rowsPerTrack = song.patterns.length > 0 ? song.patterns[0].length : 16;

  // Build flat track row pool: all pattern data, 4 channels, rowsPerTrack rows each
  interface SynTrackRow {
    note: number;       // Synthesis note index (0 = none, 1-108)
    instrument: number; // instrument number (1-based)
    arpeggio: number;   // arpeggio nibble (high nibble of byte 2)
    effect: number;     // effect nibble (low nibble of byte 2)
    effectArg: number;  // effect argument byte
  }
  const trackRows: SynTrackRow[] = [];

  // Map: (patternIdx, channel) -> starting track row index
  const trackRowStartMap: number[][] = [];

  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    const channelStarts: number[] = [];

    for (let ch = 0; ch < numChannels; ch++) {
      const startRow = trackRows.length;
      channelStarts.push(startRow);

      const rows = pat.channels[ch]?.rows ?? [];
      const patLen = pat.length || rowsPerTrack;

      for (let row = 0; row < patLen; row++) {
        const cell = rows[row];
        const xmNote = cell?.note ?? 0;
        const instrNum = cell?.instrument ?? 0;
        const effTyp = cell?.effTyp ?? 0;
        const eff = cell?.eff ?? 0;

        const synNote = xmNoteToSynIdx(xmNote);
        const { effect, effectArg } = xmEffectToSyn(effTyp, eff);

        trackRows.push({
          note: synNote,
          instrument: instrNum,
          arpeggio: 0,
          effect,
          effectArg,
        });
      }
    }

    trackRowStartMap.push(channelStarts);
  }

  // NOR: number of track rows minus the 64-row base
  // File stores (NOR + 64) total track rows
  // We need totalRows >= 64, so NOR = max(0, trackRows.length - 64)
  // But we must ensure at least 64 rows exist
  while (trackRows.length < 64) {
    trackRows.push({ note: 0, instrument: 0, arpeggio: 0, effect: 0, effectArg: 0 });
  }
  const NOR = trackRows.length - 64;

  // ── Build positions ────────────────────────────────────────────────────
  // Each position = 4 voices x (startTrackRow u16BE + soundTranspose s8 + noteTranspose s8)
  interface SynPosition {
    startTrackRow: number;
    soundTranspose: number;
    noteTranspose: number;
  }
  const positionsData: SynPosition[][] = [];

  for (let i = 0; i < songLen; i++) {
    const patIdx = song.songPositions[i] ?? 0;
    const chMap = trackRowStartMap[patIdx];
    const voices: SynPosition[] = [];

    for (let ch = 0; ch < numChannels; ch++) {
      voices.push({
        startTrackRow: chMap ? chMap[ch] : 0,
        soundTranspose: 0,
        noteTranspose: 0,
      });
    }

    positionsData.push(voices);
  }

  const NOP = positionsData.length;

  // ── Sub-song ──────────────────────────────────────────────────────────
  const NSS = 1;
  const NOE = 0;  // no EG tables
  const NOADSR = 0; // no ADSR tables

  // ── Calculate file size ───────────────────────────────────────────────
  const headerSize = 8 + 2 + 2 + 4 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 13 + 28 + 140;
  // = 8 (magic) + 11 (count fields) + 13 (padding) + 28 (name) + 140 (comment) = 200 = 0xC8
  const sampleInfoSize = NOS * 28;
  const sampleLengthsSize = NOS * 4;
  const egSize = NOE * 128;
  const adsrSize = NOADSR * 256;
  const instrSize = NOI * 28;
  const arpeggioSize = 16 * 16;
  const subSongSize = NSS * 14 + 14; // NSS entries + 1 extra
  const waveformSize = NOW * 256;
  const positionSize = NOP * 16;
  const trackRowSize = trackRows.length * 4;
  const totalSamplePCM = sampleLengths.reduce((a, b) => a + b, 0);

  const totalSize = headerSize + sampleInfoSize + sampleLengthsSize +
    egSize + adsrSize + instrSize + arpeggioSize + subSongSize +
    waveformSize + positionSize + trackRowSize + totalSamplePCM;

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let pos = 0;

  // ── Magic ──────────────────────────────────────────────────────────────
  writeString(output, pos, 'Synth4.0', 8);
  pos = 8;

  // ── Header counts ──────────────────────────────────────────────────────
  writeU16BE(view, pos, NOP);  pos += 2; // number of positions
  writeU16BE(view, pos, NOR);  pos += 2; // number of track rows (minus 64)
  pos += 4;                              // skip 4 bytes
  output[pos++] = NOS;                   // number of samples
  output[pos++] = NOW;                   // number of waveforms
  output[pos++] = NOI;                   // number of instruments
  output[pos++] = NSS;                   // number of sub-songs
  output[pos++] = NOE;                   // number of EG tables
  output[pos++] = NOADSR;               // number of ADSR tables
  output[pos++] = 0;                     // noise length

  // Padding (13 bytes)
  pos += 13;

  // ── Module name (28 bytes) ─────────────────────────────────────────────
  writeString(output, pos, song.name ?? 'Untitled', 28);
  pos += 28;

  // ── Comment (140 bytes) ────────────────────────────────────────────────
  pos += 140; // leave as zeros

  // ── Sample info: NOS x 28 bytes ────────────────────────────────────────
  for (let i = 0; i < NOS; i++) {
    output[pos++] = 0; // unknown byte
    writeString(output, pos, sampleNames[i] ?? '', 27);
    pos += 27;
  }

  // ── Sample lengths: NOS x u32 BE ──────────────────────────────────────
  for (let i = 0; i < NOS; i++) {
    writeU32BE(view, pos, sampleLengths[i]);
    pos += 4;
  }

  // ── EG tables: NOE x 128 bytes (none) ─────────────────────────────────
  // (skipped, NOE = 0)

  // ── ADSR tables: NOADSR x 256 bytes (none) ────────────────────────────
  // (skipped, NOADSR = 0)

  // ── Instruments: NOI x 28 bytes ───────────────────────────────────────
  for (let i = 0; i < NOI; i++) {
    const def = instrDefs[i];
    const instrOff = pos;

    output[instrOff + 0] = def.waveformNumber & 0xFF;           // WaveformNumber
    output[instrOff + 1] = def.synthesisEnabled ? 1 : 0;        // SynthesisEnabled
    view.setUint16(instrOff + 2, def.waveformLength & 0xFFFF, false); // WaveformLength
    view.setUint16(instrOff + 4, def.repeatLength & 0xFFFF, false);   // RepeatLength
    output[instrOff + 6] = def.volume & 0xFF;                   // Volume
    // Remaining 21 bytes: portamentoSpeed(1), adsrEnabled(1), adsrTableNumber(1),
    // adsrTableLength(2), skip(1), arpeggioStart(1), arpeggioLength(1),
    // arpeggioRepeatLength(1), effect(1), effectArg1(1), effectArg2(1),
    // effectArg3(1), vibratoDelay(1), vibratoSpeed(1), vibratoLevel(1),
    // egcOffset(1), egcMode(1), egcTableNumber(1), egcTableLength(2)
    // All zeros (already initialized)

    pos += 28;
  }

  // ── Arpeggio tables: 16 x 16 bytes (all zeros) ────────────────────────
  pos += 16 * 16;

  // ── Sub-songs: NSS x 14 bytes + 14 extra ──────────────────────────────
  for (let i = 0; i < NSS; i++) {
    pos += 4; // skip 4 bytes
    output[pos++] = song.initialSpeed ?? 6;     // startSpeed
    output[pos++] = rowsPerTrack & 0xFF;         // rowsPerTrack
    writeU16BE(view, pos, 0);                    // firstPosition
    pos += 2;
    writeU16BE(view, pos, Math.max(0, NOP - 1)); // lastPosition
    pos += 2;
    writeU16BE(view, pos, song.restartPosition ?? 0); // restartPosition
    pos += 2;
    pos += 2; // skip 2
  }
  // Extra 14-byte entry (all zeros)
  pos += 14;

  // ── Waveforms: NOW x 256 bytes ────────────────────────────────────────
  for (let i = 0; i < NOW; i++) {
    if (i < waveformData.length) {
      output.set(waveformData[i].subarray(0, 256), pos);
    }
    pos += 256;
  }

  // ── Positions: NOP x 16 bytes ─────────────────────────────────────────
  for (let p = 0; p < NOP; p++) {
    const voices = positionsData[p];
    for (let v = 0; v < 4; v++) {
      const voice = voices[v];
      writeU16BE(view, pos, voice.startTrackRow); pos += 2;
      output[pos++] = voice.soundTranspose & 0xFF;
      output[pos++] = voice.noteTranspose & 0xFF;
    }
  }

  // ── Track rows: (NOR + 64) x 4 bytes ──────────────────────────────────
  for (let i = 0; i < trackRows.length; i++) {
    const tr = trackRows[i];
    output[pos++] = tr.note & 0xFF;
    output[pos++] = tr.instrument & 0xFF;
    output[pos++] = ((tr.arpeggio & 0x0F) << 4) | (tr.effect & 0x0F);
    output[pos++] = tr.effectArg & 0xFF;
  }

  // ── Sample PCM data ───────────────────────────────────────────────────
  for (let i = 0; i < NOS; i++) {
    output.set(samplePCMs[i], pos);
    pos += samplePCMs[i].length;
  }

  // ── Warnings ──────────────────────────────────────────────────────────
  if (NOI > 255) {
    warnings.push(`Synthesis supports up to 255 instruments; ${NOI - 255} were dropped.`);
  }
  if (NOP > 65535) {
    warnings.push('Position count exceeds 65535; truncated.');
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.syn`,
    warnings,
  };
}
