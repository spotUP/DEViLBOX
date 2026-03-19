/**
 * InStereo2Exporter.ts — Export TrackerSong as InStereo! 2.0 (.is20) format
 *
 * Reconstructs a valid IS20 binary from TrackerSong patterns, instruments, and metadata.
 *
 * File layout (all big-endian):
 *   8-byte magic "IS20DF10"
 *   "STBL" + uint32 count  -> sub-song table (count x 10 bytes each)
 *   "OVTB" + uint32 count  -> position table (count x 4 channels x 4 bytes)
 *   "NTBL" + uint32 count  -> track rows (count x 4 bytes each)
 *   "SAMP" + uint32 count  -> sample descriptors + names + repeat table + lengths + PCM data
 *   "SYNT" + uint32 count  -> synth instrument descriptors (each 1010 bytes)
 *
 * Instrument numbering convention:
 *   TrackerSong IDs 1..numSamples        -> IS20 instrNum 64..63+numSamples (samples)
 *   TrackerSong IDs numSamples+1..total  -> IS20 instrNum 1..numSynths     (synths)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { InStereo2Config } from '@/types/instrument';

export interface InStereo2ExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Big-endian write helpers ──────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xff;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >> 8) & 0xff;
  buf[off + 1] = val & 0xff;
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >> 24) & 0xff;
  buf[off + 1] = (val >> 16) & 0xff;
  buf[off + 2] = (val >> 8) & 0xff;
  buf[off + 3] = val & 0xff;
}

function writeS8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xff; // two's complement
}

function writeString(buf: Uint8Array, off: number, str: string, maxLen: number): void {
  for (let i = 0; i < maxLen; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xff : 0;
  }
}

function writeTag(buf: Uint8Array, off: number, tag: string): void {
  for (let i = 0; i < 4; i++) {
    buf[off + i] = tag.charCodeAt(i);
  }
}

// ── Note / effect conversion (XM -> IS20) ─────────────────────────────────

/**
 * XM note -> IS20 period table index.
 * Parser: noteIndex - 36 = xmNote. Reverse: noteIndex = xmNote + 36.
 * noteExportOffset on the song is 36 (set by parser).
 */
function xmNoteToIs20(xmNote: number): number {
  if (xmNote === 0) return 0;
  if (xmNote === 97) return 0x7f; // note-off
  const idx = xmNote + 36;
  return Math.max(1, Math.min(108, idx));
}

/**
 * XM effect -> IS20 effect/arg.
 * Reverse of is20EffectToXm in the parser.
 */
function xmEffectToIs20(effTyp: number, eff: number): { effect: number; arg: number } {
  switch (effTyp) {
    case 0x00: // Arpeggio
      if (eff !== 0) return { effect: 0x00, arg: eff };
      return { effect: 0, arg: 0 };
    case 0x03: // Tone portamento -> IS20 effect 7
      return { effect: 0x07, arg: eff };
    case 0x0a: // Volume slide -> IS20 effect A
      if ((eff & 0xf0) !== 0) {
        // Slide up: high nibble
        return { effect: 0x0a, arg: (eff >> 4) & 0x0f };
      } else {
        // Slide down: low nibble -> negative (256 - val)
        return { effect: 0x0a, arg: (256 - (eff & 0x0f)) & 0xff };
      }
    case 0x0b: // Position jump -> IS20 effect B
      return { effect: 0x0b, arg: eff };
    case 0x0c: // Set volume -> IS20 effect C
      return { effect: 0x0c, arg: Math.min(64, eff) };
    case 0x0d: // Pattern break -> IS20 effect D
      return { effect: 0x0d, arg: 0 };
    case 0x0f: // Set speed -> IS20 effect F
      if (eff > 0 && eff <= 31) return { effect: 0x0f, arg: eff };
      return { effect: 0, arg: 0 };
    default:
      return { effect: 0, arg: 0 };
  }
}

// ── Sample extraction helpers ─────────────────────────────────────────────

/**
 * Extract 8-bit signed PCM from an instrument's sample audioBuffer (WAV container).
 * Returns empty Uint8Array if no sample data.
 */
function extractSamplePCM(inst: { sample?: { audioBuffer?: ArrayBuffer } }): Uint8Array {
  if (!inst.sample?.audioBuffer) return new Uint8Array(0);
  const wav = new DataView(inst.sample.audioBuffer);
  if (wav.byteLength < 44) return new Uint8Array(0);
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const pcm = new Uint8Array(frames);
  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    pcm[j] = (s16 >> 8) & 0xff; // 16-bit signed -> 8-bit signed (two's complement)
  }
  return pcm;
}

// ── Main export function ──────────────────────────────────────────────────

export async function exportInStereo2(song: TrackerSong): Promise<InStereo2ExportResult> {
  const warnings: string[] = [];

  // ── Classify instruments into samples and synths ──────────────────────
  // Parser convention: sample IDs = 1..numSamples, synth IDs = numSamples+1..total
  // We detect synths by checking for synthType === 'InStereo2Synth' or inStereo2 config
  const sampleInsts: typeof song.instruments = [];
  const synthInsts: typeof song.instruments = [];

  for (const inst of song.instruments) {
    if (inst.synthType === 'InStereo2Synth' || inst.inStereo2) {
      synthInsts.push(inst);
    } else {
      sampleInsts.push(inst);
    }
  }

  const numSamples = sampleInsts.length;
  const numSynths = synthInsts.length;

  // Build instrument ID -> IS20 instrument number mapping
  // In IS20: synths are 1..63, samples are 64..127
  const idToIs20Num = new Map<number, number>();
  for (let i = 0; i < sampleInsts.length; i++) {
    idToIs20Num.set(sampleInsts[i].id, 64 + i); // sample: 64-based
  }
  for (let i = 0; i < synthInsts.length; i++) {
    idToIs20Num.set(synthInsts[i].id, 1 + i); // synth: 1-based
  }

  // ── Build track rows (NTBL) ──────────────────────────────────────────
  // Each pattern position has 4 channels; each channel references a startTrackRow
  // in the global track table. We lay them out sequentially.
  const rowsPerTrack = song.patterns.length > 0 ? song.patterns[0].length : 64;
  const numPositions = song.songPositions.length;
  // Build all track rows and position table entries
  const allTrackRows: Uint8Array[] = [];
  const positionEntries: Array<{
    startTrackRow: number;
    soundTranspose: number;
    noteTranspose: number;
  }[]> = [];

  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const patIdx = song.songPositions[posIdx] ?? 0;
    const pat = song.patterns[patIdx];
    const posChannels: { startTrackRow: number; soundTranspose: number; noteTranspose: number }[] = [];

    for (let ch = 0; ch < 4; ch++) {
      const startRow = allTrackRows.length;

      if (pat && ch < pat.channels.length) {
        const rows = pat.channels[ch].rows;
        const patLen = pat.length;
        for (let row = 0; row < rowsPerTrack; row++) {
          const cell = row < patLen ? rows[row] : undefined;
          const trackRow = new Uint8Array(4);

          if (!cell || (cell.note === 0 && cell.instrument === 0 && cell.effTyp === 0 && cell.eff === 0)) {
            // Empty row: all zeros
            allTrackRows.push(trackRow);
            continue;
          }

          // Byte 0: note
          trackRow[0] = xmNoteToIs20(cell.note ?? 0);

          // Byte 1: instrument (remap from TrackerSong ID to IS20 number)
          const instId = cell.instrument ?? 0;
          trackRow[1] = instId > 0 ? (idToIs20Num.get(instId) ?? 0) : 0;

          // Byte 2: flags + effect
          const { effect, arg } = xmEffectToIs20(cell.effTyp ?? 0, cell.eff ?? 0);
          // No transpose disable flags (not stored in XM)
          trackRow[2] = effect & 0x0f;

          // Byte 3: effect argument
          trackRow[3] = arg & 0xff;

          allTrackRows.push(trackRow);
        }
      } else {
        // Channel doesn't exist in pattern, fill with empty rows
        for (let row = 0; row < rowsPerTrack; row++) {
          allTrackRows.push(new Uint8Array(4));
        }
      }

      posChannels.push({ startTrackRow: startRow, soundTranspose: 0, noteTranspose: 0 });
    }

    positionEntries.push(posChannels);
  }

  // ── Prepare sample data ──────────────────────────────────────────────
  const samplePCMs: Uint8Array[] = [];
  const sampleDescs: Array<{
    oneShotLength: number;
    repeatLength: number;
    sampleNumber: number;
    volume: number;
  }> = [];

  for (let i = 0; i < numSamples; i++) {
    const inst = sampleInsts[i];
    const pcm = extractSamplePCM(inst);
    samplePCMs.push(pcm);

    const loopStart = inst.sample?.loopStart ?? 0;
    const loopEnd = inst.sample?.loopEnd ?? 0;
    const hasLoop = loopEnd > loopStart && loopEnd > 0;

    let oneShotLength: number;
    let repeatLength: number;
    if (hasLoop) {
      oneShotLength = Math.floor(loopStart / 2); // in words
      repeatLength = Math.floor((loopEnd - loopStart) / 2); // in words
    } else {
      oneShotLength = Math.floor(pcm.length / 2); // in words
      repeatLength = 1; // 1 = no loop in IS20
    }

    sampleDescs.push({
      oneShotLength,
      repeatLength,
      sampleNumber: i, // self-referencing
      volume: Math.min(64, inst.volume ?? 64),
    });
  }

  // ── Prepare synth data ───────────────────────────────────────────────
  const synthConfigs: InStereo2Config[] = [];
  for (let i = 0; i < numSynths; i++) {
    const inst = synthInsts[i];
    if (inst.inStereo2) {
      synthConfigs.push(inst.inStereo2);
    } else {
      warnings.push(`Synth instrument ${inst.id} (${inst.name}) missing InStereo2 config, using defaults`);
      synthConfigs.push(makeDefaultSynthConfig(inst.name || `Synth ${i}`));
    }
  }

  // ── Calculate sizes ──────────────────────────────────────────────────
  const magicSize = 8;

  // STBL chunk: tag(4) + count(4) + 1 sub-song * 10 bytes
  const stblSize = 4 + 4 + 10;

  // OVTB chunk: tag(4) + count(4) + numPositions * 4 channels * 4 bytes
  const ovtbSize = 4 + 4 + numPositions * 4 * 4;

  // NTBL chunk: tag(4) + count(4) + trackRows * 4 bytes
  const ntblSize = 4 + 4 + allTrackRows.length * 4;

  // SAMP chunk: tag(4) + count(4) + descriptors(numSamples*16)
  //   + names(numSamples*20) + repeat table(numSamples*4*2)
  //   + sample lengths(numSamples*4) + PCM data (in reverse order)
  const totalPCMBytes = samplePCMs.reduce((sum, pcm) => sum + pcm.length, 0);
  const sampSize = 4 + 4 + numSamples * 16 + numSamples * 20 + numSamples * 4 * 2
    + numSamples * 4 + totalPCMBytes;

  // SYNT chunk: tag(4) + count(4) + numSynths * 1010 bytes each
  const syntSize = 4 + 4 + numSynths * 1010;

  const totalSize = magicSize + stblSize + ovtbSize + ntblSize + sampSize + syntSize;

  // ── Write output ─────────────────────────────────────────────────────
  const output = new Uint8Array(totalSize);
  let off = 0;

  // ── Magic "IS20DF10" ─────────────────────────────────────────────────
  writeString(output, off, 'IS20DF10', 8);
  off += 8;

  // ── STBL chunk ───────────────────────────────────────────────────────
  writeTag(output, off, 'STBL'); off += 4;
  writeU32BE(output, off, 1); off += 4; // 1 sub-song

  // Sub-song: startSpeed(1) + rowsPerTrack(1) + firstPosition(2) + lastPosition(2)
  //           + restartPosition(2) + tempo(2) = 10 bytes
  writeU8(output, off, song.initialSpeed); off += 1;
  writeU8(output, off, rowsPerTrack); off += 1;
  writeU16BE(output, off, 0); off += 2; // firstPosition
  writeU16BE(output, off, Math.max(0, numPositions - 1)); off += 2; // lastPosition
  writeU16BE(output, off, song.restartPosition); off += 2; // restartPosition
  // Tempo: convert BPM back to Hz. Parser: tempo = tempoHz * 125 / 50. Reverse: tempoHz = tempo * 50 / 125
  const tempoHz = Math.round(song.initialBPM * 50 / 125);
  writeU16BE(output, off, tempoHz > 0 ? tempoHz : 50); off += 2;

  // ── OVTB chunk ───────────────────────────────────────────────────────
  writeTag(output, off, 'OVTB'); off += 4;
  writeU32BE(output, off, numPositions); off += 4;

  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const posChannels = positionEntries[posIdx];
    for (let ch = 0; ch < 4; ch++) {
      const entry = posChannels[ch];
      writeU16BE(output, off, entry.startTrackRow); off += 2;
      writeS8(output, off, entry.soundTranspose); off += 1;
      writeS8(output, off, entry.noteTranspose); off += 1;
    }
  }

  // ── NTBL chunk ───────────────────────────────────────────────────────
  writeTag(output, off, 'NTBL'); off += 4;
  writeU32BE(output, off, allTrackRows.length); off += 4;

  for (const row of allTrackRows) {
    output[off] = row[0]; off += 1;
    output[off] = row[1]; off += 1;
    output[off] = row[2]; off += 1;
    output[off] = row[3]; off += 1;
  }

  // ── SAMP chunk ───────────────────────────────────────────────────────
  writeTag(output, off, 'SAMP'); off += 4;
  writeU32BE(output, off, numSamples); off += 4;

  // Sample descriptors: 16 bytes each
  // oneShotLength(2) + repeatLength(2) + sampleNumber(1 signed) + volume(1)
  // + vibratoDelay(1) + vibratoSpeed(1) + vibratoLevel(1) + portamentoSpeed(1) + reserved(6)
  for (let i = 0; i < numSamples; i++) {
    const desc = sampleDescs[i];
    writeU16BE(output, off, desc.oneShotLength); off += 2;
    writeU16BE(output, off, desc.repeatLength); off += 2;
    writeS8(output, off, desc.sampleNumber); off += 1;
    writeU8(output, off, desc.volume); off += 1;
    writeU8(output, off, 0); off += 1; // vibratoDelay
    writeU8(output, off, 0); off += 1; // vibratoSpeed
    writeU8(output, off, 0); off += 1; // vibratoLevel
    writeU8(output, off, 0); off += 1; // portamentoSpeed
    off += 6; // reserved (already zeroed)
  }

  // Sample names: 20 bytes each
  for (let i = 0; i < numSamples; i++) {
    writeString(output, off, sampleInsts[i].name || '', 20);
    off += 20;
  }

  // Repeat table: numSamples * 4 * 2 bytes (copy of lengths/loop in words)
  // Parser skips this: off += numberOfSamples * 4 * 2
  // Write oneShotLength and repeatLength pairs for each sample (2 x uint16 = 4 words = 8 bytes)
  for (let i = 0; i < numSamples; i++) {
    const desc = sampleDescs[i];
    writeU16BE(output, off, desc.oneShotLength); off += 2;
    writeU16BE(output, off, desc.repeatLength); off += 2;
    writeU16BE(output, off, desc.oneShotLength); off += 2;
    writeU16BE(output, off, desc.repeatLength); off += 2;
  }

  // Sample lengths: uint32 each
  for (let i = 0; i < numSamples; i++) {
    writeU32BE(output, off, samplePCMs[i].length);
    off += 4;
  }

  // Sample PCM data: stored in REVERSE order (last sample first)
  for (let i = numSamples - 1; i >= 0; i--) {
    const pcm = samplePCMs[i];
    output.set(pcm, off);
    off += pcm.length;
  }

  // ── SYNT chunk ───────────────────────────────────────────────────────
  writeTag(output, off, 'SYNT'); off += 4;
  writeU32BE(output, off, numSynths); off += 4;

  for (let i = 0; i < numSynths; i++) {
    const cfg = synthConfigs[i];

    // Each synth instrument is 1010 bytes total:
    // "IS20"(4) + name(20) + waveformLength(2) + volume(1) + vibratoDelay(1)
    // + vibratoSpeed(1) + vibratoLevel(1) + portamentoSpeed(1) + adsrLength(1)
    // + adsrRepeat(1) + skip(4) + sustainPoint(1) + sustainSpeed(1) + amfLength(1)
    // + amfRepeat(1) + egMode(1) + egEnabled(1) + egStartLen(1) + egStopRep(1)
    // + egSpeedUp(1) + egSpeedDown(1) + skip(19)
    // + adsrTable(128) + lfoTable(128) + arpeggios(48) + egTable(128)
    // + waveform1(256) + waveform2(256) = 1010

    // "IS20" mark
    writeTag(output, off, 'IS20'); off += 4;

    // Name (20 bytes)
    writeString(output, off, cfg.name || '', 20); off += 20;

    // Waveform length (uint16)
    writeU16BE(output, off, cfg.waveformLength); off += 2;

    // Parameters (1 byte each)
    writeU8(output, off, cfg.volume); off += 1;
    writeU8(output, off, cfg.vibratoDelay); off += 1;
    writeU8(output, off, cfg.vibratoSpeed); off += 1;
    writeU8(output, off, cfg.vibratoLevel); off += 1;
    writeU8(output, off, cfg.portamentoSpeed); off += 1;
    writeU8(output, off, cfg.adsrLength); off += 1;
    writeU8(output, off, cfg.adsrRepeat); off += 1;

    // Skip 4 bytes
    off += 4;

    writeU8(output, off, cfg.sustainPoint); off += 1;
    writeU8(output, off, cfg.sustainSpeed); off += 1;
    writeU8(output, off, cfg.amfLength); off += 1;
    writeU8(output, off, cfg.amfRepeat); off += 1;

    // EG mode/enabled: parser reads egMode then egEnabled, then computes effectiveEgMode
    // Parser: effectiveEgMode = egEnabled==0 ? 0 : (egMode==0 ? 1 : 2)
    // Reverse: cfg.egMode 0=disabled, 1=calc, 2=free
    //   disabled -> egEnabled=0, egMode=0
    //   calc     -> egEnabled=1, egMode=0
    //   free     -> egEnabled=1, egMode=1
    let fileEgMode = 0;
    let fileEgEnabled = 0;
    if (cfg.egMode === 1) { fileEgMode = 0; fileEgEnabled = 1; } // calc
    else if (cfg.egMode === 2) { fileEgMode = 1; fileEgEnabled = 1; } // free
    // else disabled: both 0

    writeU8(output, off, fileEgMode); off += 1;
    writeU8(output, off, fileEgEnabled); off += 1;

    writeU8(output, off, cfg.egStartLen); off += 1;
    writeU8(output, off, cfg.egStopRep); off += 1;
    writeU8(output, off, cfg.egSpeedUp); off += 1;
    writeU8(output, off, cfg.egSpeedDown); off += 1;

    // Skip 19 bytes
    off += 19;

    // ADSR table: 128 unsigned bytes
    for (let j = 0; j < 128; j++) {
      writeU8(output, off, cfg.adsrTable[j] ?? 0); off += 1;
    }

    // LFO table: 128 signed bytes
    for (let j = 0; j < 128; j++) {
      writeS8(output, off, cfg.lfoTable[j] ?? 0); off += 1;
    }

    // 3 arpeggios x (1 length + 1 repeat + 14 values) = 48 bytes
    for (let a = 0; a < 3; a++) {
      const arp = cfg.arpeggios[a];
      writeU8(output, off, arp?.length ?? 0); off += 1;
      writeU8(output, off, arp?.repeat ?? 0); off += 1;
      for (let v = 0; v < 14; v++) {
        writeS8(output, off, arp?.values[v] ?? 0); off += 1;
      }
    }

    // EG table: 128 unsigned bytes
    for (let j = 0; j < 128; j++) {
      writeU8(output, off, cfg.egTable[j] ?? 0); off += 1;
    }

    // Waveform 1: 256 signed bytes
    for (let j = 0; j < 256; j++) {
      writeS8(output, off, cfg.waveform1[j] ?? 0); off += 1;
    }

    // Waveform 2: 256 signed bytes
    for (let j = 0; j < 256; j++) {
      writeS8(output, off, cfg.waveform2[j] ?? 0); off += 1;
    }
  }

  // ── Build result ─────────────────────────────────────────────────────
  if (numSamples > 63) {
    warnings.push(`IS20 supports max 63 samples, song has ${numSamples}. Extras will be truncated.`);
  }
  if (numSynths > 63) {
    warnings.push(`IS20 supports max 63 synth instruments, song has ${numSynths}. Extras will be truncated.`);
  }
  if (numPositions > 65535) {
    warnings.push(`IS20 position count exceeds uint16 limit. Song may not load correctly.`);
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const filename = baseName.endsWith('.is20') ? baseName : `${baseName}.is20`;
  const data = new Blob([output], { type: 'application/octet-stream' });

  return { data, filename, warnings };
}

// ── Default synth config ──────────────────────────────────────────────────

function makeDefaultSynthConfig(name: string): InStereo2Config {
  return {
    volume: 64,
    waveformLength: 64,
    portamentoSpeed: 0,
    vibratoDelay: 0,
    vibratoSpeed: 0,
    vibratoLevel: 0,
    adsrLength: 0,
    adsrRepeat: 0,
    sustainPoint: 0,
    sustainSpeed: 0,
    amfLength: 0,
    amfRepeat: 0,
    egMode: 0,
    egStartLen: 0,
    egStopRep: 0,
    egSpeedUp: 0,
    egSpeedDown: 0,
    arpeggios: [
      { length: 0, repeat: 0, values: new Array(14).fill(0) },
      { length: 0, repeat: 0, values: new Array(14).fill(0) },
      { length: 0, repeat: 0, values: new Array(14).fill(0) },
    ],
    adsrTable: new Array(128).fill(0),
    lfoTable: new Array(128).fill(0),
    egTable: new Array(128).fill(0),
    waveform1: new Array(256).fill(0),
    waveform2: new Array(256).fill(0),
    name,
  };
}
