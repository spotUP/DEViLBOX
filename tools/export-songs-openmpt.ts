/**
 * export-songs-openmpt.ts — Export parsed TrackerSong objects to ProTracker .mod
 * or FastTracker 2 .xm binary format.
 *
 * Self-contained tool that parses source files using the project's format parsers,
 * bakes synth instruments to PCM waveforms, and writes binary .mod or .xm files.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.app.json tools/export-songs-openmpt.ts [filter]
 *   npx tsx --tsconfig tsconfig.app.json tools/export-songs-openmpt.ts "a sleep"
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

// Import types
import type { TrackerSong } from '../src/engine/TrackerReplayer.ts';
import type { InstrumentConfig } from '../src/types/instrument/defaults.ts';
import type { Pattern, TrackerCell } from '../src/types/tracker.ts';
import { bakeSynthInstruments } from './synth-prerender/index.ts';

// ============================================================================
// PERIOD TABLE & NOTE CONVERSION
// ============================================================================

/** 7-octave ProTracker period table (C-0 .. B-6) */
const PT_PERIODS = [
  3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1812, // C-0..B-0
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  907, // C-1..B-1
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453, // C-2..B-2
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226, // C-3..B-3
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113, // C-4..B-4
   107,  101,   95,   90,   85,   80,   75,   71,   67,   63,   60,   56, // C-5..B-5
    53,   50,   47,   45,   42,   40,   37,   35,   33,   31,   30,   28, // C-6..B-6
];

/** Standard ProTracker periods (3 octaves only: C-1..B-3, indices 12..47) for snapping */
const STANDARD_PT_PERIODS = PT_PERIODS.slice(12, 48);

/** Snap an out-of-range period to the nearest standard PT period (113-856) */
function snapToNearestPeriod(period: number): number {
  if (period <= 0) return 0;
  // Bring into range by halving or doubling
  let p = period;
  while (p > 856) p = Math.round(p / 2);
  while (p < 113 && p > 0) p = Math.round(p * 2);
  // Snap to nearest standard period
  let best = STANDARD_PT_PERIODS[0];
  let bestDist = Math.abs(p - best);
  for (let i = 1; i < STANDARD_PT_PERIODS.length; i++) {
    const dist = Math.abs(p - STANDARD_PT_PERIODS[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = STANDARD_PT_PERIODS[i];
    }
  }
  return best;
}

/** Returns true for effects that affect global playback (speed, tempo, position, break). */
function isGlobalEffect(effTyp: number): boolean {
  return effTyp === 0x0F || effTyp === 0x0B || effTyp === 0x0D;
}

/** Convert XM note value to MOD period. noteExportOffset is added before lookup. */
function noteToMODPeriod(note: number, noteExportOffset: number): number {
  if (note === 0 || note === 97) return 0; // empty or note-off
  const adjusted = note + noteExportOffset;
  const idx = adjusted - 25; // MOD period table index
  if (idx >= 0 && idx < PT_PERIODS.length) {
    const period = PT_PERIODS[idx];
    // Clamp to standard PT range
    if (period >= 113 && period <= 856) return period;
    return snapToNearestPeriod(period);
  }
  // Out of table range — try to snap
  if (idx < 0) return 856; // lowest note
  return 113; // highest note
}

// ============================================================================
// WAV HELPERS
// ============================================================================

interface WavData {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Int8Array | Int16Array;
  loopStart: number;
  loopEnd: number;
}

/** Parse a WAV file (PCM only). Returns sample data as Int8Array for 8-bit. */
function parseWav(ab: ArrayBuffer): WavData | null {
  const dv = new DataView(ab);
  if (ab.byteLength < 44) return null;
  const riff = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (riff !== 'RIFF') return null;
  const wave = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
  if (wave !== 'WAVE') return null;

  let offset = 12;
  let sampleRate = 44100;
  let channels = 1;
  let bitsPerSample = 8;
  let dataStart = 0;
  let dataSize = 0;
  let loopStart = 0;
  let loopEnd = 0;

  while (offset + 8 <= ab.byteLength) {
    const chunkId = String.fromCharCode(dv.getUint8(offset), dv.getUint8(offset + 1),
      dv.getUint8(offset + 2), dv.getUint8(offset + 3));
    const chunkSize = dv.getUint32(offset + 4, true);
    offset += 8;

    if (chunkId === 'fmt ') {
      channels = dv.getUint16(offset + 2, true);
      sampleRate = dv.getUint32(offset + 4, true);
      bitsPerSample = dv.getUint16(offset + 14, true);
    } else if (chunkId === 'data') {
      dataStart = offset;
      dataSize = chunkSize;
    } else if (chunkId === 'smpl' && chunkSize >= 36 + 24) {
      // Parse sampler chunk for loop points
      const numLoops = dv.getUint32(offset + 28, true);
      if (numLoops > 0) {
        loopStart = dv.getUint32(offset + 36 + 8, true);
        loopEnd = dv.getUint32(offset + 36 + 12, true);
      }
    }
    offset += chunkSize;
    if (chunkSize % 2 !== 0) offset++; // pad
  }

  if (dataStart === 0 || dataSize === 0) return null;

  if (bitsPerSample === 8) {
    // Unsigned 8-bit → signed
    const raw = new Uint8Array(ab, dataStart, dataSize);
    const pcm = new Int8Array(raw.length);
    for (let i = 0; i < raw.length; i++) pcm[i] = raw[i] - 128;
    return { sampleRate, channels, bitsPerSample, pcm, loopStart, loopEnd };
  } else if (bitsPerSample === 16) {
    const numSamples = dataSize / 2;
    const pcm = new Int16Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      pcm[i] = dv.getInt16(dataStart + i * 2, true);
    }
    // Convert loop points from frames to samples
    return { sampleRate, channels, bitsPerSample, pcm, loopStart, loopEnd };
  }
  return null;
}

/** Build a looping WAV buffer from PCM data */
function buildLoopingWAV(pcm: Int8Array | number[], loopStart: number, loopEnd: number, sampleRate: number): ArrayBuffer {
  const len = pcm.length;
  const dataSize = len;
  const bufSize = 44 + dataSize;
  const ab = new ArrayBuffer(bufSize);
  const dv = new DataView(ab);
  const u8 = new Uint8Array(ab);

  // RIFF header
  u8.set([0x52, 0x49, 0x46, 0x46]); // "RIFF"
  dv.setUint32(4, bufSize - 8, true);
  u8.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt chunk
  u8.set([0x66, 0x6D, 0x74, 0x20], 12); // "fmt "
  dv.setUint32(16, 16, true); // chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate, true); // byte rate
  dv.setUint16(32, 1, true); // block align
  dv.setUint16(34, 8, true); // bits per sample

  // data chunk
  u8.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  dv.setUint32(40, dataSize, true);

  // Write unsigned 8-bit PCM
  for (let i = 0; i < len; i++) {
    u8[44 + i] = ((pcm[i] as number) + 128) & 0xFF;
  }

  return ab;
}

// ============================================================================
// SYNTH BAKERS
// ============================================================================

/** AHX/HVL waveform generators (sine, triangle, square, noise, etc.) */
function generateAHXWaveform(waveNum: number, length: number): Float32Array {
  const buf = new Float32Array(length);
  switch (waveNum & 0x03) {
    case 0: // Triangle
      for (let i = 0; i < length; i++) {
        const phase = i / length;
        buf[i] = phase < 0.25 ? phase * 4 :
                 phase < 0.75 ? 2 - phase * 4 :
                 phase * 4 - 4;
      }
      break;
    case 1: // Sawtooth
      for (let i = 0; i < length; i++) {
        buf[i] = 1 - 2 * (i / length);
      }
      break;
    case 2: // Square (PWM center)
      for (let i = 0; i < length; i++) {
        buf[i] = i < length / 2 ? 1 : -1;
      }
      break;
    case 3: // White noise
      for (let i = 0; i < length; i++) {
        buf[i] = Math.random() * 2 - 1;
      }
      break;
  }
  return buf;
}

/**
 * Bake Hively/AHX instruments into single-cycle PCM waveforms.
 * Simulates the performance list tick-by-tick to produce a sustain waveform.
 */
function bakeHivelyInstruments(song: TrackerSong): void {
  const isHVL = song.format === 'HVL';
  const sampleRate = isHVL ? 44100 : 8287;

  for (const inst of song.instruments) {
    const hv = inst.hively;
    if (!hv) continue;

    // Determine waveform length from waveLength field (0-5 → 4,8,16,32,64,128)
    const waveLengths = [4, 8, 16, 32, 64, 128];
    const waveLen = waveLengths[Math.min(hv.waveLength, 5)] || 32;

    // Start with the base waveform from perf list
    let currentWave = 0;
    let currentFilterPos = hv.filterLowerLimit;
    let currentSquarePos = hv.squareLowerLimit;
    let filterDir = 1;
    let squareDir = 1;

    // Simulate performance list for up to 64 ticks to find sustain state
    const perfEntries = hv.performanceList?.entries ?? [];
    const perfSpeed = hv.performanceList?.speed ?? 1;
    let perfPos = 0;
    let perfWait = perfSpeed;

    for (let tick = 0; tick < 64 && perfPos < perfEntries.length; tick++) {
      perfWait--;
      if (perfWait <= 0) {
        const entry = perfEntries[perfPos];
        if (entry) {
          // Process fixed waveform command
          if (entry.fixed !== undefined && entry.fixed >= 0) {
            currentWave = entry.fixed & 0x03;
          }
          // Process waveform command
          if (entry.waveform !== undefined && entry.waveform >= 0) {
            currentWave = entry.waveform & 0x03;
          }
        }
        perfPos++;
        perfWait = perfSpeed;
      }

      // Filter sweep
      if (hv.filterSpeed > 0) {
        currentFilterPos += filterDir * hv.filterSpeed;
        if (currentFilterPos >= hv.filterUpperLimit) { currentFilterPos = hv.filterUpperLimit; filterDir = -1; }
        if (currentFilterPos <= hv.filterLowerLimit) { currentFilterPos = hv.filterLowerLimit; filterDir = 1; }
      }

      // Square sweep (PWM)
      if (hv.squareSpeed > 0) {
        currentSquarePos += squareDir * hv.squareSpeed;
        if (currentSquarePos >= hv.squareUpperLimit) { currentSquarePos = hv.squareUpperLimit; squareDir = -1; }
        if (currentSquarePos <= hv.squareLowerLimit) { currentSquarePos = hv.squareLowerLimit; squareDir = 1; }
      }
    }

    // Generate the final waveform
    const cycleLen = waveLen;
    const wave = generateAHXWaveform(currentWave, cycleLen);

    // Apply simple low-pass filter approximation based on filterPos
    const filterAmount = currentFilterPos / 127;
    if (filterAmount < 0.95) {
      let prev = wave[0];
      const fc = 0.1 + filterAmount * 0.9;
      for (let i = 1; i < wave.length; i++) {
        wave[i] = prev + fc * (wave[i] - prev);
        prev = wave[i];
      }
    }

    // Apply PWM for square wave
    if ((currentWave & 0x03) === 2) {
      const duty = currentSquarePos / 255;
      for (let i = 0; i < wave.length; i++) {
        wave[i] = (i / wave.length) < duty ? 1 : -1;
      }
    }

    // Convert to signed 8-bit PCM
    const pcm = new Int8Array(cycleLen);
    for (let i = 0; i < cycleLen; i++) {
      pcm[i] = Math.max(-128, Math.min(127, Math.round(wave[i] * 127)));
    }

    // Build WAV and attach as sample
    const wavBuf = buildLoopingWAV(pcm, 0, cycleLen, sampleRate);
    if (!inst.sample) {
      inst.sample = {
        audioBuffer: wavBuf,
        url: '',
        baseNote: 'C-4',
        detune: 0,
        loop: true,
        loopStart: 0,
        loopEnd: cycleLen,
        loopType: 'forward',
        sampleRate,
        reverse: false,
        playbackRate: 1,
      };
    } else {
      inst.sample.audioBuffer = wavBuf;
      inst.sample.sampleRate = sampleRate;
      inst.sample.loop = true;
      inst.sample.loopStart = 0;
      inst.sample.loopEnd = cycleLen;
      inst.sample.loopType = 'forward';
    }
  }
}

/**
 * Bake SidMon 1 instruments into PCM waveforms.
 * Uses mainWave + arpeggio resampling to produce multi-cycle waveforms.
 */
function bakeSidMon1Instruments(song: TrackerSong): void {
  const sampleRate = 8287; // Amiga PAL rate

  for (const inst of song.instruments) {
    const sm = inst.sidmon1;
    if (!sm || !sm.mainWave || sm.mainWave.length === 0) continue;

    const baseWave = sm.mainWave;
    const arpeggio = sm.arpeggio ?? [0];

    // Generate multiple cycles at different pitches
    const cyclesPerArp = 1;
    const totalCycles = Math.max(1, arpeggio.length) * cyclesPerArp;
    const cycleLen = baseWave.length;
    const totalLen = cycleLen * totalCycles;
    const pcm = new Int8Array(totalLen);

    for (let arpIdx = 0; arpIdx < arpeggio.length; arpIdx++) {
      const semitoneOff = arpeggio[arpIdx] ?? 0;
      const pitchRatio = Math.pow(2, semitoneOff / 12);

      for (let c = 0; c < cyclesPerArp; c++) {
        const destOffset = (arpIdx * cyclesPerArp + c) * cycleLen;
        for (let i = 0; i < cycleLen; i++) {
          const srcPos = (i * pitchRatio) % cycleLen;
          const idx0 = Math.floor(srcPos);
          const frac = srcPos - idx0;
          const s0 = baseWave[idx0 % cycleLen] ?? 0;
          const s1 = baseWave[(idx0 + 1) % cycleLen] ?? 0;
          pcm[destOffset + i] = Math.max(-128, Math.min(127, Math.round(s0 + frac * (s1 - s0))));
        }
      }
    }

    const wavBuf = buildLoopingWAV(pcm, 0, totalLen, sampleRate);
    if (!inst.sample) {
      inst.sample = {
        audioBuffer: wavBuf,
        url: '',
        baseNote: 'C-4',
        detune: 0,
        loop: true,
        loopStart: 0,
        loopEnd: totalLen,
        loopType: 'forward',
        sampleRate,
        reverse: false,
        playbackRate: 1,
      };
    } else {
      inst.sample.audioBuffer = wavBuf;
      inst.sample.sampleRate = sampleRate;
      inst.sample.loop = true;
      inst.sample.loopStart = 0;
      inst.sample.loopEnd = totalLen;
      inst.sample.loopType = 'forward';
    }
  }
}

/**
 * Bake generic synth instruments (FC, SoundMon, DigMug, etc.) into PCM waveforms.
 * Checks for wavePCM data on various config types, falls back to sawtooth.
 */
function bakeGenericSynthInstruments(song: TrackerSong): void {
  const sampleRate = 8287;

  for (const inst of song.instruments) {
    // Skip if already has audio data
    if (inst.sample?.audioBuffer && inst.sample.audioBuffer.byteLength > 44) continue;

    let wavePCM: number[] | Uint8Array | undefined;
    let cycleLen = 32;

    // Check for wavePCM on various synth configs
    if (inst.fc?.wavePCM && inst.fc.wavePCM.length > 0) {
      wavePCM = inst.fc.wavePCM;
      cycleLen = inst.fc.wavePCM.length;
    } else if (inst.soundMon?.wavePCM && inst.soundMon.wavePCM.length > 0) {
      wavePCM = inst.soundMon.wavePCM;
      cycleLen = inst.soundMon.wavePCM.length;
    } else if (inst.digMug?.waveformData && inst.digMug.waveformData.length > 0) {
      wavePCM = inst.digMug.waveformData;
      cycleLen = inst.digMug.waveformData.length;
    } else if (inst.digMug?.pcmData && inst.digMug.pcmData.length > 0) {
      wavePCM = inst.digMug.pcmData;
      cycleLen = inst.digMug.pcmData.length;
    }

    if (!wavePCM) {
      // Check if there is any sample URL — if so, skip (will be loaded at runtime)
      if (inst.sample?.url) continue;
      // Check for raw binary data
      if (inst.rawBinaryData && inst.rawBinaryData.length > 0) continue;
      // No waveform data — generate a sawtooth fallback
      wavePCM = new Array(32);
      for (let i = 0; i < 32; i++) {
        (wavePCM as number[])[i] = Math.round(127 - (255 * i / 31));
      }
      cycleLen = 32;
    }

    const pcm = new Int8Array(cycleLen);
    for (let i = 0; i < cycleLen; i++) {
      const v = wavePCM[i] ?? 0;
      pcm[i] = Math.max(-128, Math.min(127, typeof v === 'number' ? v : v));
    }

    const wavBuf = buildLoopingWAV(pcm, 0, cycleLen, sampleRate);
    if (!inst.sample) {
      inst.sample = {
        audioBuffer: wavBuf,
        url: '',
        baseNote: 'C-4',
        detune: 0,
        loop: true,
        loopStart: 0,
        loopEnd: cycleLen,
        loopType: 'forward',
        sampleRate,
        reverse: false,
        playbackRate: 1,
      };
    } else {
      inst.sample.audioBuffer = wavBuf;
      inst.sample.sampleRate = sampleRate;
      inst.sample.loop = true;
      inst.sample.loopStart = 0;
      inst.sample.loopEnd = cycleLen;
      inst.sample.loopType = 'forward';
    }
  }
}

// ============================================================================
// MOD BINARY WRITER
// ============================================================================

/**
 * Export a TrackerSong to ProTracker .mod format.
 * 31 samples max, 4 channels, 64 rows per pattern, M.K./M!K! tag.
 */
function exportToMOD(song: TrackerSong): ArrayBuffer {
  const numChannels = Math.min(song.numChannels, 4);
  const noteOff = song.noteExportOffset ?? 0;

  // Collect sample data from instruments (max 31)
  interface SampleInfo {
    name: string;
    length: number;    // in words (2 bytes each)
    finetune: number;
    volume: number;
    loopStart: number; // in words
    loopLen: number;   // in words
    pcm: Int8Array;
  }

  const samples: SampleInfo[] = [];

  for (let i = 0; i < 31; i++) {
    const inst = song.instruments[i];
    if (!inst || !inst.sample?.audioBuffer) {
      // Empty sample slot
      samples.push({ name: '', length: 0, finetune: 0, volume: 0, loopStart: 0, loopLen: 1, pcm: new Int8Array(0) });
      continue;
    }

    const wav = parseWav(inst.sample.audioBuffer);
    let pcm: Int8Array;
    let sr = 8363;
    let loopStartFrames = 0;
    let loopEndFrames = 0;

    if (wav) {
      sr = wav.sampleRate;
      if (wav.bitsPerSample === 16) {
        // Downsample 16-bit to 8-bit
        pcm = new Int8Array(wav.pcm.length);
        for (let j = 0; j < wav.pcm.length; j++) {
          pcm[j] = (wav.pcm[j] as number) >> 8;
        }
      } else {
        pcm = wav.pcm as Int8Array;
      }
      loopStartFrames = wav.loopStart;
      loopEndFrames = wav.loopEnd;
    } else {
      // Treat raw buffer as signed 8-bit PCM
      const raw = new Uint8Array(inst.sample.audioBuffer);
      pcm = new Int8Array(raw.length);
      for (let j = 0; j < raw.length; j++) pcm[j] = raw[j] - 128;
      sr = inst.sample.sampleRate ?? 8363;
    }

    // Use sample config loop points if WAV didn't have them
    if (loopStartFrames === 0 && loopEndFrames === 0 && inst.sample.loop) {
      loopStartFrames = inst.sample.loopStart ?? 0;
      loopEndFrames = inst.sample.loopEnd ?? pcm.length;
    }

    // Truncate to 128KB (65535 words)
    if (pcm.length > 131070) {
      pcm = pcm.slice(0, 131070);
    }
    // Ensure even length
    if (pcm.length % 2 !== 0) {
      const padded = new Int8Array(pcm.length + 1);
      padded.set(pcm);
      pcm = padded;
    }

    const lengthWords = pcm.length / 2;
    const finetune = inst.metadata?.modPlayback?.finetune ?? 0;
    const defVol = inst.metadata?.modPlayback?.defaultVolume;
    const volume = (typeof defVol === 'number' && defVol >= 0) ? Math.min(64, Math.round(defVol)) : 64;

    let loopStartWords = 0;
    let loopLenWords = 1; // ProTracker convention: loopLen=1 word = no loop
    if (inst.sample.loop && loopEndFrames > loopStartFrames) {
      loopStartWords = Math.floor(loopStartFrames / 2);
      loopLenWords = Math.max(1, Math.floor((loopEndFrames - loopStartFrames) / 2));
    }

    samples.push({
      name: (inst.name || '').slice(0, 22),
      length: lengthWords,
      finetune: finetune & 0x0F,
      volume: Math.min(64, Math.max(0, volume)),
      loopStart: loopStartWords,
      loopLen: loopLenWords,
      pcm,
    });
  }

  // Build pattern order
  const songLen = Math.min(128, song.songLength);
  const orderList = new Uint8Array(128);
  let maxPattern = 0;
  for (let i = 0; i < songLen; i++) {
    const patIdx = song.songPositions[i] ?? 0;
    orderList[i] = patIdx;
    if (patIdx > maxPattern) maxPattern = patIdx;
  }
  const numPatterns = maxPattern + 1;
  const modTag = numPatterns > 64 ? 'M!K!' : 'M.K.';

  // Build pattern data
  // Each pattern = 64 rows * numChannels * 4 bytes
  const patternDataSize = numPatterns * 64 * numChannels * 4;
  const patternData = new Uint8Array(patternDataSize);

  // Determine if we need speed/BPM injection
  const needSpeed = song.initialSpeed !== 6;
  const needBPM = song.initialBPM !== 125;

  for (let p = 0; p < numPatterns; p++) {
    const pattern = song.patterns[p];
    const patLen = pattern ? pattern.length : 64;

    for (let row = 0; row < 64; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const offset = (p * 64 * numChannels + row * numChannels + ch) * 4;

        // Inject speed/BPM on first row of first pattern, first channel(s)
        const firstPlayedPattern = song.songPositions?.[0] ?? 0;
        if (p === firstPlayedPattern && row === 0 && ch === 0) {
          if (needSpeed) {
            // Check if this cell already has an effect
            const cell = pattern?.channels[ch]?.rows[row];
            if (cell && cell.effTyp === 0 && cell.eff === 0) {
              // Write speed command (Fxx, xx < 0x20)
              const note = cell.note > 0 && cell.note !== 97 ? noteToMODPeriod(cell.note, noteOff) : 0;
              const inst_ = cell.instrument ?? 0;
              const period = note;
              patternData[offset] = ((inst_ & 0xF0) | ((period >> 8) & 0x0F));
              patternData[offset + 1] = period & 0xFF;
              patternData[offset + 2] = ((inst_ & 0x0F) << 4) | 0x0F;
              patternData[offset + 3] = Math.min(31, song.initialSpeed);
              continue;
            }
          }
        }
        if (p === 0 && row === 0 && ch === 1 && numChannels > 1) {
          if (needBPM) {
            const cell = pattern?.channels[ch]?.rows[row];
            if (cell && cell.effTyp === 0 && cell.eff === 0) {
              const note = cell.note > 0 && cell.note !== 97 ? noteToMODPeriod(cell.note, noteOff) : 0;
              const inst_ = cell.instrument ?? 0;
              patternData[offset] = ((inst_ & 0xF0) | ((note >> 8) & 0x0F));
              patternData[offset + 1] = note & 0xFF;
              patternData[offset + 2] = ((inst_ & 0x0F) << 4) | 0x0F;
              patternData[offset + 3] = Math.max(32, Math.min(255, song.initialBPM));
              continue;
            }
          }
        }

        if (!pattern || !pattern.channels[ch] || row >= patLen) {
          // Empty cell — but check if we need pattern break
          if (row === patLen && patLen < 64 && ch === 0) {
            // Inject pattern break (D00)
            patternData[offset + 2] = 0x0D;
            patternData[offset + 3] = 0x00;
          }
          continue;
        }

        const cell = pattern.channels[ch].rows[row];
        if (!cell) continue;

        let period = 0;
        if (cell.note > 0 && cell.note !== 97) {
          period = noteToMODPeriod(cell.note, noteOff);
        }

        const inst_ = cell.instrument ?? 0;
        let effTyp = cell.effTyp ?? 0;
        let effParam = cell.eff ?? 0;

        // MOD supports one effect per cell. Merge secondary effect if present.
        const eff2Typ = cell.effTyp2 ?? 0;
        const eff2Par = cell.eff2 ?? 0;
        if (eff2Typ > 0) {
          if (effTyp === 0) {
            effTyp = eff2Typ;
            effParam = eff2Par;
          } else if (isGlobalEffect(eff2Typ) && !isGlobalEffect(effTyp)) {
            effTyp = eff2Typ;
            effParam = eff2Par;
          } else if ((eff2Typ === 0x0D || eff2Typ === 0x0B) && effTyp === 0x0F) {
            effTyp = eff2Typ;
            effParam = eff2Par;
          }
        }

        // Convert XM effect types to MOD
        // XM and MOD share most effects 0-F
        if (effTyp > 15) {
          effTyp = 0;
          effParam = 0;
        }

        // Encode MOD cell: 4 bytes
        // Byte 0: upper 4 bits of instrument | upper 4 bits of period
        // Byte 1: lower 8 bits of period
        // Byte 2: lower 4 bits of instrument | effect type
        // Byte 3: effect parameter
        patternData[offset] = ((inst_ & 0xF0) | ((period >> 8) & 0x0F));
        patternData[offset + 1] = period & 0xFF;
        patternData[offset + 2] = ((inst_ & 0x0F) << 4) | (effTyp & 0x0F);
        patternData[offset + 3] = effParam & 0xFF;
      }

      // Pattern break injection for short patterns
      if (row === patLen - 1 && patLen < 64 && pattern) {
        // Check if any channel already has a pattern break on this row
        let hasBreak = false;
        for (let ch = 0; ch < numChannels; ch++) {
          const cell = pattern.channels[ch]?.rows[row];
          if (cell && cell.effTyp === 0x0D) { hasBreak = true; break; }
        }
        if (!hasBreak) {
          // Find an empty effect slot on this row
          let injected = false;
          for (let ch = 0; ch < numChannels && !injected; ch++) {
            const cellOff = (p * 64 * numChannels + row * numChannels + ch) * 4;
            const effByte = patternData[cellOff + 2] & 0x0F;
            const effPByte = patternData[cellOff + 3];
            if (effByte === 0 && effPByte === 0) {
              patternData[cellOff + 2] = (patternData[cellOff + 2] & 0xF0) | 0x0D;
              patternData[cellOff + 3] = 0x00;
              injected = true;
            }
          }
          // Fallback: inject on next row if all channels occupied
          if (!injected && patLen < 63) {
            const nextRow = row + 1;
            const cellOff = (p * 64 * numChannels + nextRow * numChannels + 0) * 4;
            patternData[cellOff + 2] = 0x0D;
            patternData[cellOff + 3] = 0x00;
          }
        }
      }
    }
  }

  // Calculate total file size
  const headerSize = 20; // title
  const sampleHeadersSize = 31 * 30;
  const songInfoSize = 2; // song length + restart position
  const orderSize = 128;
  const tagSize = 4;
  let sampleDataSize = 0;
  for (const s of samples) sampleDataSize += s.pcm.length;

  const totalSize = headerSize + sampleHeadersSize + songInfoSize + orderSize + tagSize + patternDataSize + sampleDataSize;
  const buf = new ArrayBuffer(totalSize);
  const dv = new DataView(buf);
  const out = new Uint8Array(buf);
  let pos = 0;

  // Title (20 bytes, null-padded)
  const titleBytes = new TextEncoder().encode((song.name || '').slice(0, 20));
  out.set(titleBytes, pos);
  pos += 20;

  // 31 sample headers (30 bytes each)
  for (const s of samples) {
    const nameBytes = new TextEncoder().encode(s.name.slice(0, 22));
    out.set(nameBytes, pos);
    pos += 22;
    dv.setUint16(pos, s.length, false); // big-endian
    pos += 2;
    out[pos] = s.finetune & 0x0F;
    pos += 1;
    out[pos] = s.volume;
    pos += 1;
    dv.setUint16(pos, s.loopStart, false);
    pos += 2;
    dv.setUint16(pos, s.loopLen, false);
    pos += 2;
  }

  // Song length & restart position
  out[pos] = songLen;
  pos += 1;
  out[pos] = song.restartPosition ?? 0;
  pos += 1;

  // Pattern order table
  out.set(orderList, pos);
  pos += 128;

  // M.K. or M!K! tag
  const tagBytes = new TextEncoder().encode(modTag);
  out.set(tagBytes, pos);
  pos += 4;

  // Pattern data
  out.set(patternData, pos);
  pos += patternDataSize;

  // Sample data (signed 8-bit PCM)
  for (const s of samples) {
    if (s.pcm.length > 0) {
      out.set(new Uint8Array(s.pcm.buffer, s.pcm.byteOffset, s.pcm.byteLength), pos);
      pos += s.pcm.length;
    }
  }

  return buf;
}

// ============================================================================
// XM BINARY WRITER
// ============================================================================

/**
 * Export a TrackerSong to FastTracker 2 .xm format.
 * Linear frequency mode, 5 bytes per cell uncompressed.
 */
function exportToXM(song: TrackerSong): ArrayBuffer {
  const numChannels = Math.min(song.numChannels, 32);
  const noteOff = (song as Record<string, unknown>).xmNoteExportOffset as number ??
                  song.noteExportOffset ?? 0;
  const xmRelNoteOff = (song as Record<string, unknown>).xmRelNoteOffset as number ?? 0;
  const isXMFormat = song.format === 'XM';

  // Build pattern data buffers
  const songLen = Math.min(256, song.songLength);
  const orderList: number[] = [];
  let maxPattern = 0;
  for (let i = 0; i < songLen; i++) {
    const patIdx = song.songPositions[i] ?? 0;
    orderList.push(patIdx);
    if (patIdx > maxPattern) maxPattern = patIdx;
  }
  const numPatterns = maxPattern + 1;

  // Pre-build pattern binary data
  const patternBuffers: Uint8Array[] = [];
  for (let p = 0; p < numPatterns; p++) {
    const pattern = song.patterns[p];
    const patLen = pattern ? pattern.length : 64;

    // Uncompressed: 5 bytes per cell
    const cellData = new Uint8Array(patLen * numChannels * 5);
    let cellPos = 0;

    for (let row = 0; row < patLen; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = pattern?.channels[ch]?.rows[row];
        if (!cell) {
          cellPos += 5;
          continue;
        }

        let note = cell.note ?? 0;
        if (note > 0 && note !== 97) {
          note = note + noteOff;
          if (note < 1) note = 1;
          if (note > 96) note = 96;
        }

        // XM supports one effect per cell. If cell has a secondary effect (effTyp2),
        // merge them: prefer pattern break/position jump (critical for song structure)
        // over speed/tempo (which can be moved to another channel).
        let effTyp = cell.effTyp ?? 0;
        let effPar = cell.eff ?? 0;
        const eff2Typ = cell.effTyp2 ?? 0;
        const eff2Par = cell.eff2 ?? 0;
        if (eff2Typ > 0) {
          if (effTyp === 0) {
            // Primary empty — use secondary
            effTyp = eff2Typ;
            effPar = eff2Par;
          } else if (isGlobalEffect(eff2Typ) && !isGlobalEffect(effTyp)) {
            // Secondary is global, primary is local — swap
            effTyp = eff2Typ;
            effPar = eff2Par;
          } else if ((eff2Typ === 0x0D || eff2Typ === 0x0B) && effTyp === 0x0F) {
            // Secondary is pattern break/jump, primary is speed/tempo — prefer break
            effTyp = eff2Typ;
            effPar = eff2Par;
          }
        }

        cellData[cellPos] = note;
        cellData[cellPos + 1] = cell.instrument ?? 0;
        cellData[cellPos + 2] = cell.volume ?? 0;
        cellData[cellPos + 3] = effTyp;
        cellData[cellPos + 4] = effPar;
        cellPos += 5;
      }
    }

    patternBuffers.push(cellData.slice(0, cellPos));
  }

  // Collect instruments
  interface XMSampleData {
    name: string;
    pcm: Int8Array;
    loopStart: number;
    loopLen: number;
    loopType: number; // 0=none, 1=forward, 2=pingpong
    volume: number;
    finetune: number;
    relNote: number;
    panning: number;
  }

  interface XMInstrumentData {
    name: string;
    samples: XMSampleData[];
    metadata?: Record<string, unknown>;
  }

  const xmInstruments: XMInstrumentData[] = [];

  for (const inst of song.instruments) {
    const xmSamples: XMSampleData[] = [];

    // Get audio buffer — decode data URL fallback if audioBuffer is missing
    let sampleBuf = inst.sample?.audioBuffer;
    if ((!sampleBuf || sampleBuf.byteLength === 0) && inst.sample?.url?.startsWith('data:')) {
      const b64 = inst.sample.url.split(',')[1];
      if (b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        sampleBuf = bytes.buffer;
      }
    }

    if (sampleBuf && sampleBuf.byteLength > 0) {
      const wav = parseWav(sampleBuf);
      let pcm: Int8Array;
      let sr = 8363;

      if (wav) {
        sr = wav.sampleRate;
        if (wav.bitsPerSample === 16) {
          pcm = new Int8Array(wav.pcm.length);
          for (let j = 0; j < wav.pcm.length; j++) {
            pcm[j] = (wav.pcm[j] as number) >> 8;
          }
        } else {
          pcm = wav.pcm as Int8Array;
        }
      } else {
        const raw = new Uint8Array(inst.sample.audioBuffer);
        pcm = new Int8Array(raw.length);
        for (let j = 0; j < raw.length; j++) pcm[j] = raw[j] - 128;
        sr = inst.sample.sampleRate ?? 8363;
      }

      // Loop info
      let loopStart = 0;
      let loopLen = 0;
      let loopType = 0;

      if (inst.sample.loop) {
        const ls = inst.sample.loopStart ?? (wav?.loopStart ?? 0);
        const le = inst.sample.loopEnd ?? (wav?.loopEnd ?? pcm.length);
        loopStart = ls;
        loopLen = Math.max(0, le - ls);
        loopType = inst.sample.loopType === 'pingpong' ? 2 : 1;
      }

      // Compute relNote
      let relNote: number;
      let finetune: number;

      if (isXMFormat && inst.metadata?.modPlayback?.relativeNote !== undefined) {
        // Preserve native relativeNote and finetune for XM source format
        relNote = inst.metadata.modPlayback.relativeNote;
        finetune = inst.metadata.modPlayback.finetune ?? 0;
      } else {
        // Compute from sample rate
        relNote = Math.round(12 * Math.log2(sr / 8363)) + xmRelNoteOff;
        finetune = 0;
      }

      // Delta-encode PCM
      const deltaPcm = new Int8Array(pcm.length);
      let prev = 0;
      for (let i = 0; i < pcm.length; i++) {
        deltaPcm[i] = (pcm[i] - prev) & 0xFF;
        prev = pcm[i];
      }

      xmSamples.push({
        name: (inst.name || '').slice(0, 22),
        pcm: deltaPcm,
        loopStart,
        loopLen,
        loopType,
        volume: (() => { const dv = inst.metadata?.modPlayback?.defaultVolume; return (typeof dv === 'number' && dv >= 0) ? Math.min(64, Math.round(dv)) : 64; })(),
        finetune: Math.max(-128, Math.min(127, finetune)),
        relNote: Math.max(-96, Math.min(95, relNote)),
        panning: 128,
      });
    }

    xmInstruments.push({
      name: (inst.name || '').slice(0, 22),
      samples: xmSamples,
      metadata: inst.metadata,
    });
  }

  // Calculate sizes
  const XM_HEADER_SIZE = 336;

  // Pattern sizes: 9-byte header + data per pattern
  let totalPatternBytes = 0;
  for (let p = 0; p < numPatterns; p++) {
    totalPatternBytes += 9 + patternBuffers[p].length;
  }

  // Instrument sizes
  let totalInstrumentBytes = 0;
  for (const xinst of xmInstruments) {
    if (xinst.samples.length > 0) {
      totalInstrumentBytes += 263; // instrument header with samples
      for (const s of xinst.samples) {
        totalInstrumentBytes += 40 + s.pcm.length; // sample header + data
      }
    } else {
      totalInstrumentBytes += 29; // empty instrument header (minimal)
    }
  }

  const totalSize = XM_HEADER_SIZE + totalPatternBytes + totalInstrumentBytes;
  const buf = new ArrayBuffer(totalSize);
  const dv = new DataView(buf);
  const out = new Uint8Array(buf);
  let pos = 0;

  // === XM File Header (336 bytes) ===

  // ID text (17 bytes)
  const idText = 'Extended Module: ';
  for (let i = 0; i < 17; i++) out[pos + i] = idText.charCodeAt(i);
  pos += 17;

  // Module name (20 bytes, space-padded)
  const modName = (song.name || '').slice(0, 20);
  for (let i = 0; i < 20; i++) {
    out[pos + i] = i < modName.length ? modName.charCodeAt(i) : 0x20;
  }
  pos += 20;

  // 0x1A separator
  out[pos] = 0x1A;
  pos += 1;

  // Tracker name (20 bytes)
  const trackerName = 'DEViLBOX            ';
  for (let i = 0; i < 20; i++) out[pos + i] = trackerName.charCodeAt(i);
  pos += 20;

  // Version (1.04)
  dv.setUint16(pos, 0x0104, true);
  pos += 2;

  // Header size (from this point): 276 bytes = 336 - 60
  dv.setUint32(pos, 276, true);
  pos += 4;

  // Song length
  dv.setUint16(pos, songLen, true);
  pos += 2;

  // Restart position
  dv.setUint16(pos, song.restartPosition ?? 0, true);
  pos += 2;

  // Number of channels
  dv.setUint16(pos, numChannels, true);
  pos += 2;

  // Number of patterns
  dv.setUint16(pos, numPatterns, true);
  pos += 2;

  // Number of instruments
  dv.setUint16(pos, xmInstruments.length, true);
  pos += 2;

  // Flags: bit 0 = linear frequency table
  dv.setUint16(pos, 1, true); // linear frequency mode
  pos += 2;

  // Default tempo (speed)
  dv.setUint16(pos, Math.max(1, song.initialSpeed), true);
  pos += 2;

  // Default BPM
  dv.setUint16(pos, Math.max(32, Math.min(255, song.initialBPM)), true);
  pos += 2;

  // Pattern order table (256 bytes)
  for (let i = 0; i < 256; i++) {
    out[pos + i] = i < orderList.length ? orderList[i] : 0;
  }
  pos += 256;

  // === Patterns ===
  for (let p = 0; p < numPatterns; p++) {
    const pattern = song.patterns[p];
    const patLen = pattern ? pattern.length : 64;
    const patData = patternBuffers[p];

    // Pattern header length (9 bytes)
    dv.setUint32(pos, 9, true);
    pos += 4;

    // Packing type (0 = always)
    out[pos] = 0;
    pos += 1;

    // Number of rows
    dv.setUint16(pos, patLen, true);
    pos += 2;

    // Packed pattern data size
    dv.setUint16(pos, patData.length, true);
    pos += 2;

    // Pattern data
    out.set(patData, pos);
    pos += patData.length;
  }

  // === Instruments ===
  for (const xinst of xmInstruments) {
    if (xinst.samples.length > 0) {
      // Instrument header size = 263
      const instHeaderStart = pos;
      dv.setUint32(pos, 263, true);
      pos += 4;

      // Instrument name (22 bytes)
      const iName = xinst.name.slice(0, 22);
      for (let i = 0; i < 22; i++) {
        out[pos + i] = i < iName.length ? iName.charCodeAt(i) : 0;
      }
      pos += 22;

      // Instrument type (always 0)
      out[pos] = 0;
      pos += 1;

      // Number of samples
      dv.setUint16(pos, xinst.samples.length, true);
      pos += 2;

      // Sample header size (40)
      dv.setUint32(pos, 40, true);
      pos += 4;

      // Sample-to-note mapping (96 bytes, all point to sample 0)
      for (let i = 0; i < 96; i++) out[pos + i] = 0;
      pos += 96;

      // Volume envelope points (48 bytes — 12 points × 4 bytes)
      const volEnv = (xinst.metadata as Record<string, unknown>)?.originalEnvelope as { enabled?: boolean; points?: Array<{tick: number; value: number}>; sustainPoint?: number | null; loopStartPoint?: number | null; loopEndPoint?: number | null } | undefined;
      const volEnvPoints = volEnv?.enabled ? volEnv.points.slice(0, 12) : [];
      if (volEnvPoints.length >= 2) {
        for (let ep = 0; ep < 12; ep++) {
          const pt = volEnvPoints[ep];
          dv.setUint16(pos + ep * 4, pt?.tick ?? 0, true);
          dv.setUint16(pos + ep * 4 + 2, pt?.value ?? 0, true);
        }
      } else {
        // Default: 2 points, full volume
        dv.setUint16(pos, 0, true); dv.setUint16(pos + 2, 64, true);
        dv.setUint16(pos + 4, 1, true); dv.setUint16(pos + 6, 64, true);
      }
      pos += 48;

      // Panning envelope points (48 bytes)
      dv.setUint16(pos, 0, true); dv.setUint16(pos + 2, 32, true);
      dv.setUint16(pos + 4, 1, true); dv.setUint16(pos + 6, 32, true);
      pos += 48;

      // Number of volume points
      out[pos] = volEnvPoints.length >= 2 ? volEnvPoints.length : 2;
      pos += 1;
      // Number of panning points
      out[pos] = 2;
      pos += 1;

      // Vol sustain point
      out[pos] = volEnv?.sustainPoint ?? 0;
      pos += 1;
      // Vol loop start
      out[pos] = volEnv?.loopStartPoint ?? 0;
      pos += 1;
      // Vol loop end
      out[pos] = volEnv?.loopEndPoint ?? 0;
      pos += 1;

      // Pan sustain point
      out[pos] = 0;
      pos += 1;
      // Pan loop start
      out[pos] = 0;
      pos += 1;
      // Pan loop end
      out[pos] = 0;
      pos += 1;

      // Volume type flags: bit 0=on, bit 1=sustain, bit 2=loop
      let volType = 0;
      if (volEnv?.enabled && volEnvPoints.length >= 2) {
        volType |= 0x01; // ON
        if (volEnv.sustainPoint !== null && volEnv.sustainPoint !== undefined) volType |= 0x02; // SUSTAIN
        if (volEnv.loopStartPoint !== null && volEnv.loopStartPoint !== undefined &&
            volEnv.loopEndPoint !== null && volEnv.loopEndPoint !== undefined) volType |= 0x04; // LOOP
      }
      out[pos] = volType;
      pos += 1;
      // Panning type (0 = off)
      out[pos] = 0;
      pos += 1;

      // Vibrato type, sweep, depth, rate
      out[pos] = 0; pos += 1;
      out[pos] = 0; pos += 1;
      out[pos] = 0; pos += 1;
      out[pos] = 0; pos += 1;

      // Volume fadeout
      dv.setUint16(pos, 0, true);
      pos += 2;

      // Reserved (2 bytes padding to reach 263)
      const written = pos - instHeaderStart;
      const padNeeded = 263 - written;
      for (let i = 0; i < padNeeded; i++) out[pos + i] = 0;
      pos += padNeeded;

      // Sample headers (40 bytes each)
      for (const s of xinst.samples) {
        // Sample length
        dv.setUint32(pos, s.pcm.length, true);
        pos += 4;
        // Loop start
        dv.setUint32(pos, s.loopStart, true);
        pos += 4;
        // Loop length
        dv.setUint32(pos, s.loopLen, true);
        pos += 4;
        // Volume
        out[pos] = s.volume;
        pos += 1;
        // Finetune (signed)
        dv.setInt8(pos, s.finetune);
        pos += 1;
        // Type: bits 0-1 = loop type, bit 4 = 16-bit
        out[pos] = s.loopType & 0x03;
        pos += 1;
        // Panning
        out[pos] = s.panning;
        pos += 1;
        // Relative note (signed)
        dv.setInt8(pos, s.relNote);
        pos += 1;
        // Reserved
        out[pos] = 0;
        pos += 1;
        // Sample name (22 bytes)
        const sName = s.name.slice(0, 22);
        for (let i = 0; i < 22; i++) {
          out[pos + i] = i < sName.length ? sName.charCodeAt(i) : 0;
        }
        pos += 22;
      }

      // Sample data (delta-encoded 8-bit)
      for (const s of xinst.samples) {
        out.set(new Uint8Array(s.pcm.buffer, s.pcm.byteOffset, s.pcm.byteLength), pos);
        pos += s.pcm.length;
      }
    } else {
      // Empty instrument (minimal header)
      dv.setUint32(pos, 29, true); // header size
      pos += 4;
      // Name (22 bytes)
      const iName = xinst.name.slice(0, 22);
      for (let i = 0; i < 22; i++) {
        out[pos + i] = i < iName.length ? iName.charCodeAt(i) : 0;
      }
      pos += 22;
      // Type
      out[pos] = 0;
      pos += 1;
      // Number of samples = 0
      dv.setUint16(pos, 0, true);
      pos += 2;
    }
  }

  return buf.slice(0, pos);
}

// ============================================================================
// TEST CASES
// ============================================================================

interface TestCase {
  file: string;
  format: string;
  parserModule: string;
  parseFn: string;
  isAsync: boolean;
  args?: 'bytes' | 'buffer';  // 'bytes' = Uint8Array, 'buffer' = ArrayBuffer (default)
  exportAs?: 'xm' | 'mod';
  noteExportOffset?: number;
  xmRelNoteOffset?: number;
  xmNoteExportOffset?: number;
  bpm?: number;
  speed?: number;
}

const SONGS_DIR = join(process.cwd(), 'public/data/songs');
const FORMATS_DIR = join(SONGS_DIR, 'formats');
const EXPORTS_DIR = join(SONGS_DIR, 'exports');

const TEST_CASES: TestCase[] = [
  // === MOD / ProTracker ===
  { file: 'formats/a sleep so deep.mod', format: 'MOD', parserModule: 'MODParser', parseFn: 'parseMODFile', isAsync: true, noteExportOffset: 36 },

  // === AHX / Hively ===
  { file: 'formats/aces_high.ahx', format: 'AHX', parserModule: 'HivelyParser', parseFn: 'parseHivelyFile', isAsync: false, noteExportOffset: 36, xmNoteExportOffset: 12 },
  { file: 'formats/hexplosion.hvl', format: 'HVL', parserModule: 'HivelyParser', parseFn: 'parseHivelyFile', isAsync: false, noteExportOffset: 36, xmNoteExportOffset: 12 },

  // === PC Formats (→ XM) ===
  { file: 'formats/flo boarding - level 1.xm', format: 'XM', parserModule: 'XMParser', parseFn: 'parseXMFile', isAsync: true, exportAs: 'xm' },
  { file: 'formats/andante.s3m', format: 'S3M', parserModule: 'S3MParser', parseFn: 'parseS3MFile', isAsync: false, exportAs: 'xm', xmRelNoteOffset: -12 },
  { file: 'formats/nightmare on acid.s3m', format: 'S3M', parserModule: 'S3MParser', parseFn: 'parseS3MFile', isAsync: false, exportAs: 'xm', xmRelNoteOffset: -12 },
  { file: 'formats/absm chain mod.it', format: 'IT', parserModule: 'ITParser', parseFn: 'parseITFile', isAsync: false, exportAs: 'xm', xmRelNoteOffset: -12 },
  { file: 'formats/slideshow i.stm', format: 'STM', parserModule: 'STMParser', parseFn: 'parseSTMFile', isAsync: true, exportAs: 'xm', xmRelNoteOffset: -12 },
  { file: 'formats/fonetag.669', format: '669', parserModule: 'Format669Parser', parseFn: 'parse669File', isAsync: true, exportAs: 'xm', xmRelNoteOffset: -12, bpm: 78 },
  { file: 'formats/m31.far', format: 'FAR', parserModule: 'FARParser', parseFn: 'parseFARFile', isAsync: true, exportAs: 'xm', xmRelNoteOffset: -12 },
  { file: 'formats/seasons.ult', format: 'ULT', parserModule: 'ULTParser', parseFn: 'parseULTFile', isAsync: true, exportAs: 'xm', xmRelNoteOffset: -12 },
  { file: 'formats/anonymous in 4ce.mtm', format: 'MTM', parserModule: 'MTMParser', parseFn: 'parseMTMFile', isAsync: true, exportAs: 'xm' },

  // === MED ===
  { file: 'formats/med.sadman', format: 'MED', parserModule: 'MEDParser', parseFn: 'parseMEDFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/funky nightmare.mmd1', format: 'MED', parserModule: 'MEDParser', parseFn: 'parseMEDFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/universal monsters - dracula.mmd0', format: 'MED', parserModule: 'MEDParser', parseFn: 'parseMEDFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/bounty hunter - outro (remixed).mmd3', format: 'MED', parserModule: 'MEDParser', parseFn: 'parseMEDFile', isAsync: false, noteExportOffset: 36 },

  // === Amiga Synth Formats (→ MOD) ===
  { file: 'formats/anthrox.fc', format: 'FC', parserModule: 'FCParser', parseFn: 'parseFCFile', isAsync: false, exportAs: 'xm' },
  { file: 'formats/adept.smod', format: 'FC', parserModule: 'FCParser', parseFn: 'parseFCFile', isAsync: false, exportAs: 'xm' },
  { file: 'formats/antidust.bp3', format: 'SMON', parserModule: 'SoundMonParser', parseFn: 'parseSoundMonFile', isAsync: true, exportAs: 'xm', xmNoteExportOffset: 12 },
  { file: 'formats/aquarivs.bp', format: 'SMON', parserModule: 'SoundMonParser', parseFn: 'parseSoundMonFile', isAsync: true, exportAs: 'xm', xmNoteExportOffset: 12 },
  { file: 'formats/45.okta', format: 'OKT', parserModule: 'OktalyzerParser', parseFn: 'parseOktalyzerFile', isAsync: false, noteExportOffset: 36, xmNoteExportOffset: 24 },
  { file: 'formats/analogue_vibes.jam', format: 'JAM', parserModule: 'JamCrackerParser', parseFn: 'parseJamCrackerFile', isAsync: true, noteExportOffset: 36 },
  { file: 'formats/crusaders1.dm', format: 'DM1', parserModule: 'DeltaMusic1Parser', parseFn: 'parseDeltaMusic1File', isAsync: true, exportAs: 'xm', xmNoteExportOffset: 12 },
  { file: 'formats/anthrox_intro.dm2', format: 'DM2', parserModule: 'DeltaMusic2Parser', parseFn: 'parseDeltaMusic2File', isAsync: false, args: 'bytes', exportAs: 'xm', xmNoteExportOffset: 12 },
  { file: 'formats/cockwise.mug', format: 'DMUG', parserModule: 'DigitalMugicianParser', parseFn: 'parseDigitalMugicianFile', isAsync: true, exportAs: 'xm', xmNoteExportOffset: 12 },
  { file: 'formats/snickle.mug2', format: 'DMUG', parserModule: 'DigitalMugicianParser', parseFn: 'parseDigitalMugicianFile', isAsync: true, exportAs: 'xm', xmNoteExportOffset: 12 },
  { file: 'formats/flight.dmu', format: 'DMUG', parserModule: 'DigitalMugicianParser', parseFn: 'parseDigitalMugicianFile', isAsync: true, exportAs: 'xm', xmNoteExportOffset: 12 },
  { file: 'formats/anarchy.sid1', format: 'SIDMON1', parserModule: 'SidMon1Parser', parseFn: 'parseSidMon1File', isAsync: false, exportAs: 'xm', xmNoteExportOffset: 12 },
  { file: 'formats/bruno_time.sid2', format: 'SIDMON2', parserModule: 'SidMon2Parser', parseFn: 'parseSidMon2File', isAsync: true, noteExportOffset: 36 },
  { file: 'formats/fantasi8.is', format: 'IS1', parserModule: 'InStereo1Parser', parseFn: 'parseInStereo1File', isAsync: false, args: 'bytes', noteExportOffset: 36 },
  { file: 'formats/stereo_feeling.is20', format: 'IS2', parserModule: 'InStereo2Parser', parseFn: 'parseInStereo2File', isAsync: false, args: 'bytes', noteExportOffset: 36 },
  { file: 'formats/synth_corn.emod', format: 'QC', parserModule: 'QuadraComposerParser', parseFn: 'parseQuadraComposerFile', isAsync: true, noteExportOffset: 36 },
  { file: 'formats/prehistoric_tale.hipc', format: 'HIPC', parserModule: 'HippelCoSoParser', parseFn: 'parseHippelCoSoFile', isAsync: true, exportAs: 'xm', xmNoteExportOffset: 12 },
  { file: 'formats/dynablaster.ast', format: 'APS', parserModule: 'ActionamicsParser', parseFn: 'parseActionamicsFile', isAsync: false, args: 'bytes', noteExportOffset: 36 },
  { file: 'formats/almighty.sa', format: 'SA', parserModule: 'SonicArrangerParser', parseFn: 'parseSonicArrangerFile', isAsync: true, noteExportOffset: 36 },
  { file: 'formats/offroad.jpo', format: 'TW', parserModule: 'SteveTurnerParser', parseFn: 'parseSteveTurnerFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/hybris.fp', format: 'FP', parserModule: 'FuturePlayerParser', parseFn: 'parseFuturePlayerFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/apb.dw', format: 'DW', parserModule: 'DavidWhittakerParser', parseFn: 'parseDavidWhittakerFile', isAsync: false, exportAs: 'xm', xmNoteExportOffset: 12 },
  { file: 'formats/action_section.aon', format: 'AON', parserModule: 'ArtOfNoiseParser', parseFn: 'parseArtOfNoiseFile', isAsync: false, args: 'bytes' },
  { file: 'formats/cannonfodder.tcb', format: 'TCB', parserModule: 'TCBTrackerParser', parseFn: 'parseTCBTrackerFile', isAsync: true },
  { file: 'formats/doxtro3.dss', format: 'DSS', parserModule: 'DigitalSoundStudioParser', parseFn: 'parseDigitalSoundStudioFile', isAsync: false, args: 'bytes', noteExportOffset: 36 },
  { file: 'formats/baseheads.ma', format: 'MA', parserModule: 'MusicAssemblerParser', parseFn: 'parseMusicAssemblerFile', isAsync: false, args: 'bytes', noteExportOffset: 36 },

  // === Previously missing formats (added from user) ===
  { file: "formats/breakin's chipsong.gdm", format: 'GDM', parserModule: 'GDMParser', parseFn: 'parseGDMFile', isAsync: true, exportAs: 'xm', xmRelNoteOffset: -12 },
  { file: 'formats/Epic Pinball - Song 0 - Title.psm', format: 'PSM', parserModule: 'PSMParser', parseFn: 'parsePSMFile', isAsync: false, args: 'bytes', exportAs: 'xm', xmRelNoteOffset: -12 },
  { file: 'formats/harmonic disorder.ml', format: 'ML', parserModule: 'MusicLineParser', parseFn: 'parseMusicLineFile', isAsync: false, args: 'bytes', noteExportOffset: 36 },

  // === PC Tracker Formats (batch 2) ===
  { file: 'formats/invisibility.dbm', format: 'DBM', parserModule: 'DigiBoosterParser', parseFn: 'parseDigiBoosterFile', isAsync: false, exportAs: 'xm' },
  // DigiBooster original (.digi "DIGI Booster module" magic) — needs OpenMPT (browser only), no Node.js path
  // { file: 'formats/the_day_after.digi', format: 'DIGI', ... },
  { file: 'formats/mayday.mdl', format: 'MDL', parserModule: 'MDLParser', parseFn: 'parseMDLFile', isAsync: true, exportAs: 'xm' },
  { file: 'formats/noname.stp', format: 'STP', parserModule: 'STPParser', parseFn: 'parseSTPFile', isAsync: true, exportAs: 'xm' },
  { file: 'formats/gimmekuh.gt2', format: 'GT2', parserModule: 'GraoumfTracker2Parser', parseFn: 'parseGraoumfTracker2File', isAsync: false, args: 'bytes', exportAs: 'xm' },
  { file: 'formats/odyssey.rtm', format: 'RTM', parserModule: 'RTMParser', parseFn: 'parseRTMFile', isAsync: true, exportAs: 'xm' },
  { file: 'formats/parity_error.plm', format: 'PLM', parserModule: 'PLMParser', parseFn: 'parsePLMFile', isAsync: true, exportAs: 'xm' },

  // === Amiga UADE Formats (batch 2 — full parsers with pattern data) ===
  { file: 'formats/staticoscillations.ftm', format: 'FTM', parserModule: 'FaceTheMusicParser', parseFn: 'parseFaceTheMusicFile', isAsync: false, args: 'bytes', noteExportOffset: 36 },
  { file: 'formats/knights_of_sky.gmc', format: 'GMC', parserModule: 'GameMusicCreatorParser', parseFn: 'parseGameMusicCreatorFile', isAsync: false, args: 'bytes', noteExportOffset: 36 },
  { file: 'formats/gettysburg.avp', format: 'AVP', parserModule: 'ActivisionProParser', parseFn: 'parseActivisionProFile', isAsync: false, args: 'bytes', noteExportOffset: 36 },
  // Digital Symphony — no valid test file available (Reference Music file is mislabeled MED)
  // { file: 'formats/binary_reality.dss', format: 'DSYM', ... },
  { file: 'formats/memphis.glue', format: 'GLUE', parserModule: 'GlueMonParser', parseFn: 'parseGlueMonFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/north_sea_inferno.sc', format: 'SC', parserModule: 'SoundControlParser', parseFn: 'parseSoundControlFile', isAsync: false, args: 'bytes', noteExportOffset: 36 },
  { file: 'formats/operation_stealth.sfx', format: 'SFX', parserModule: 'SoundFXParser', parseFn: 'parseSoundFXFile', isAsync: true, noteExportOffset: 36 },
  { file: 'formats/wildwheels_ingame.jd', format: 'SPFX', parserModule: 'SpecialFXParser', parseFn: 'parseSpecialFXFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/batmanreturns.dsr', format: 'DSR', parserModule: 'DesireParser', parseFn: 'parseDesireFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/skythebest.ea', format: 'EA', parserModule: 'EarAcheParser', parseFn: 'parseEarAcheFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/okolaNUKE.st', format: 'SAWT', parserModule: 'SawteethParser', parseFn: 'parseSawteethFile', isAsync: false, args: 'bytes', noteExportOffset: 36 },
  { file: 'formats/dragon\'sbreath_fanfares.dsc', format: 'DSC', parserModule: 'DigitalSonixChromeParser', parseFn: 'parseDscFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/centurion_battle.rh', format: 'RH', parserModule: 'RobHubbardParser', parseFn: 'parseRobHubbardFile', isAsync: true, noteExportOffset: 36 },
  { file: 'formats/mickey_mouse.bd', format: 'BD', parserModule: 'BenDaglishParser', parseFn: 'parseBenDaglishFile', isAsync: true, noteExportOffset: 36 },
  { file: 'formats/grand_national-title.mc', format: 'MC', parserModule: 'MarkCookseyParser', parseFn: 'parseMarkCookseyFile', isAsync: true, noteExportOffset: 36 },
  { file: 'formats/jpn.virocop-14', format: 'JP', parserModule: 'JasonPageParser', parseFn: 'parseJasonPageFile', isAsync: true, noteExportOffset: 36 },
  { file: 'formats/dawnpatrol-sad.dat', format: 'PR', parserModule: 'PaulRobothamParser', parseFn: 'parsePaulRobothamFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/bob4e.dum', format: 'INFO', parserModule: 'InfogramesParser', parseFn: 'parseInfogramesFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/insects_in_space.jt', format: 'JT', parserModule: 'JeroenTelParser', parseFn: 'parseJeroenTelFile', isAsync: true, noteExportOffset: 36 },
  // CustomMade / Anders0land — format detection heuristics reject all available test files
  // These formats use voice-clear signatures / chunk-based detection that's very specific
  // { file: 'formats/viking_child.cm', format: 'CM', ... },
  // { file: 'formats/primemover_01.hot', format: 'AO', ... },
  { file: 'formats/redoctober-sub-docking.ims', format: 'IMS', parserModule: 'ImagesMusicSystemParser', parseFn: 'parseImagesMusicSystemFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/ghostbattle_gameover.hip7', format: 'HIP7', parserModule: 'JochenHippel7VParser', parseFn: 'parseJochenHippel7VFile', isAsync: false, noteExportOffset: 36 },
  // Synth Dream — parser expects "Synth4.0"/"Synth4.2" magic, test files don't have it
  // { file: 'formats/sdr.nobuddiesland_jigsaw', format: 'SDR', ... },
  { file: 'formats/centerbase_soft.osp', format: 'OSP', parserModule: 'SynthPackParser', parseFn: 'parseSynthPackFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/mdat.rocknroll', format: 'TFMX', parserModule: 'TFMXParser', parseFn: 'parseTFMXFile', isAsync: false, noteExportOffset: 36 },
  { file: 'formats/warlock_the_avenger.sqt', format: 'QRT', parserModule: 'QuartetParser', parseFn: 'parseQuartetFile', isAsync: true, noteExportOffset: 36 },
  { file: 'formats/cave_story_-_42_-_xxxx.org', format: 'ORG', parserModule: 'OrganyaParser', parseFn: 'parseOrganyaFile', isAsync: true, noteExportOffset: 36 },
];

// ============================================================================
// DYNAMIC PARSER LOADING
// ============================================================================

async function loadParser(tc: TestCase): Promise<((data: ArrayBuffer | Uint8Array, filename: string, ...extra: number[]) => TrackerSong | TrackerSong | null) | ((data: ArrayBuffer | Uint8Array, filename: string, ...extra: number[]) => Promise<TrackerSong | TrackerSong | null>)> {
  // Dynamic import from the formats directory
  const mod = await import(`../src/lib/import/formats/${tc.parserModule}.ts`);
  const fn = mod[tc.parseFn];
  if (!fn) {
    throw new Error(`Parser function ${tc.parseFn} not found in ${tc.parserModule}`);
  }
  return fn;
}

// ============================================================================
// MAIN EXPORT PIPELINE
// ============================================================================

async function processTestCase(tc: TestCase): Promise<{ ok: boolean; outPath?: string; error?: string }> {
  const filePath = join(SONGS_DIR, tc.file);
  if (!existsSync(filePath)) {
    return { ok: false, error: `File not found: ${filePath}` };
  }

  try {
    const fileData = readFileSync(filePath);
    const buffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
    const bytes = new Uint8Array(buffer);
    const filename = basename(filePath);

    // Load and invoke parser
    const parseFn = await loadParser(tc);
    const inputData = tc.args === 'bytes' ? bytes : buffer;
    let song: TrackerSong | null;

    if (tc.isAsync) {
      song = await (parseFn as (data: ArrayBuffer | Uint8Array, filename: string) => Promise<TrackerSong | null>)(inputData, filename);
    } else {
      song = (parseFn as (data: ArrayBuffer | Uint8Array, filename: string) => TrackerSong | null)(inputData, filename);
    }

    if (!song) {
      return { ok: false, error: 'Parser returned null' };
    }

    // Apply test case overrides
    if (tc.noteExportOffset !== undefined) {
      song.noteExportOffset = tc.noteExportOffset;
    }
    if (tc.xmNoteExportOffset !== undefined) {
      (song as Record<string, unknown>).xmNoteExportOffset = tc.xmNoteExportOffset;
    }
    if (tc.xmRelNoteOffset !== undefined) {
      (song as Record<string, unknown>).xmRelNoteOffset = tc.xmRelNoteOffset;
    }
    if (tc.bpm !== undefined) {
      song.initialBPM = tc.bpm;
    }
    if (tc.speed !== undefined) {
      song.initialSpeed = tc.speed;
    }

    // Decide export format
    let exportFormat: 'mod' | 'xm';
    if (tc.exportAs) {
      exportFormat = tc.exportAs;
    } else if (song.numChannels > 4) {
      exportFormat = 'xm';
    } else {
      exportFormat = 'mod';
    }

    // Bake synth instruments (pass export format for XM envelope support)
    bakeSynthInstruments(song, exportFormat);

    // Export
    let exportBuf: ArrayBuffer;
    if (exportFormat === 'mod') {
      exportBuf = exportToMOD(song);
    } else {
      exportBuf = exportToXM(song);
    }

    // Write output
    const outName = basename(filePath).replace(/\.[^.]+$/, '') + '.' + exportFormat;
    const outPath = join(EXPORTS_DIR, outName);
    writeFileSync(outPath, Buffer.from(exportBuf));

    return { ok: true, outPath };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const filterArg = process.argv[2]?.toLowerCase();

  // Ensure output directory exists
  mkdirSync(EXPORTS_DIR, { recursive: true });
  mkdirSync(FORMATS_DIR, { recursive: true });

  let cases = TEST_CASES;
  if (filterArg) {
    cases = cases.filter(tc =>
      tc.file.toLowerCase().includes(filterArg) ||
      tc.format.toLowerCase().includes(filterArg) ||
      tc.parserModule.toLowerCase().includes(filterArg)
    );
  }

  if (cases.length === 0) {
    console.log(`No test cases match filter: "${filterArg}"`);
    console.log(`Available: ${TEST_CASES.map(t => t.format).join(', ')}`);
    return;
  }

  console.log(`Processing ${cases.length} test case(s)...\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const tc of cases) {
    const filePath = join(SONGS_DIR, tc.file);
    if (!existsSync(filePath)) {
      console.log(`  SKIP  ${tc.format.padEnd(8)} ${tc.file} (file not found)`);
      skipped++;
      continue;
    }

    const result = await processTestCase(tc);
    if (result.ok) {
      console.log(`  OK    ${tc.format.padEnd(8)} → ${basename(result.outPath!)}`);
      passed++;
    } else {
      console.log(`  FAIL  ${tc.format.padEnd(8)} ${tc.file}: ${result.error}`);
      failed++;
    }
  }

  console.log(`\nDone: ${passed} passed, ${failed} failed, ${skipped} skipped`);
}

// Run if invoked directly
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
