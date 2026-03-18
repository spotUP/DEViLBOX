/**
 * export-songs-openmpt.ts — Re-export all test songs as ProTracker MOD files (Node.js)
 *
 * Uses a pure TypeScript MOD binary serializer (same algorithm as OpenMPT SaveMod)
 * instead of the WASM bridge, which has a bug where _osl_set_order() updates slot
 * values but not the internal order list count, causing SaveMod() to write a
 * 1084-byte empty header.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.app.json tools/export-songs-openmpt.ts
 *   npx tsx --tsconfig tsconfig.app.json tools/export-songs-openmpt.ts anthrox.fc
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { readFileSync } from 'fs';
import { join, basename } from 'path';

const ROOT      = join(import.meta.dirname, '..');
const TEST_DIR  = join(ROOT, 'public/data/songs/formats');
const OUT_DIR   = join(ROOT, 'public/data/songs/exports');

// ── ProTracker period table (7 octaves, from OpenMPT Tables.cpp) ──────────
// Index = note - 25  (note is OpenMPT 1-based: NOTE_MIN=1, C-0=1, C-1=13 ...)
// Valid notes: 25..108  (C-0 extension through B-6)
const PT_PERIODS = new Uint16Array([
  3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1812, // C-0..B-0 (2×C-1)
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  907, // C-1..B-1
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453, // C-2..B-2
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226, // C-3..B-3
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113, // C-4..B-4
   107,  101,   95,   90,   85,   80,   75,   71,   67,   63,   60,   56, // C-5..B-5
    53,   50,   47,   45,   42,   40,   37,   35,   33,   31,   30,   28, // C-6..B-6
]);

export function noteToMODPeriod(note: number): number {
  // OpenMPT MOD reader: note = idx + NOTE_MIN + 24 = idx + 25
  // Therefore:          idx  = note - 25
  // Valid range: note 25..108 (XM C-2..B-7)
  const idx = note - 25;
  if (idx < 0 || idx >= PT_PERIODS.length) return 0;
  return PT_PERIODS[idx];
}

function writeBE16(buf: Uint8Array, offset: number, val: number): void {
  buf[offset]     = (val >> 8) & 0xFF;
  buf[offset + 1] = val & 0xFF;
}

function padString(str: string, len: number): Uint8Array {
  const buf = new Uint8Array(len); // zero-filled = space for names, but MOD uses null-terminated
  for (let i = 0; i < Math.min(str.length, len); i++) {
    buf[i] = str.charCodeAt(i) & 0x7F;
  }
  return buf;
}

// ── Hively/AHX waveform baker ────────────────────────────────────────────
// Tick-level performance list simulator based on NostalgicPlayer's
// HivelyTrackerWorker.cs. Generates PCM by stepping through the instrument's
// performance list one tick at a time, applying filter sweeps, PWM sweeps,
// vibrato, envelope, and hard cut — producing a multi-cycle waveform that
// captures the instrument's full timbral evolution.

const AMIGA_RATE = 8287; // Amiga Paula C-3 rate (3546895 / 2 / 214)
const HIVELY_WAVE_SIZES = [4, 8, 16, 32, 64, 128];

// Vibrato table (64 entries, sine wave -255..+255)
const VIBRATO_TABLE = (() => {
  const t = new Int16Array(64);
  for (let i = 0; i < 64; i++) t[i] = Math.round(255 * Math.sin(i * Math.PI * 2 / 64));
  return t;
})();

/** Generate one cycle of an AHX waveform as 16-bit PCM. */
function generateAHXCycle(waveform: number, waveSize: number, squarePulse: number): Int16Array {
  const pcm  = new Int16Array(waveSize);
  const half = waveSize >> 1;
  switch (waveform & 3) {
    case 0: // triangle
      for (let i = 0; i < half; i++)        pcm[i] = Math.round(-32768 + i * 65536 / half);
      for (let i = half; i < waveSize; i++) pcm[i] = Math.round(32767 - (i - half) * 65536 / half);
      break;
    case 1: // sawtooth
      for (let i = 0; i < waveSize; i++) pcm[i] = Math.round(-32768 + i * 65536 / waveSize);
      break;
    case 2: { // square/pulse
      const pw = Math.max(1, Math.round(squarePulse * waveSize / 256));
      for (let i = 0; i < waveSize; i++) pcm[i] = i < pw ? 32767 : -32768;
      break;
    }
    case 3: // noise
      for (let i = 0; i < waveSize; i++) pcm[i] = ((Math.random() * 65536 - 32768) | 0);
      break;
  }
  return pcm;
}

/** One-pole IIR lowpass to approximate AHX filter bank (cutoffNorm 0=DC, 1=flat). */
function applyAHXFilter(pcm: Int16Array, filterPos: number): Int16Array {
  // filterPos 1-63: 1-31 = lowpass (lower = more filtered), 32 = unfiltered, 33-63 = highpass
  if (filterPos === 32 || filterPos <= 0 || filterPos > 63) return pcm;
  const isLP = filterPos < 32;
  const strength = isLP ? (32 - filterPos) / 31 : (filterPos - 32) / 31;
  const cutoff = isLP
    ? Math.max(0.01, 1 - strength * 0.98) // LP: lower filterPos = more muffled
    : Math.max(0.01, strength * 0.98);     // HP: higher filterPos = more treble
  const out = new Int16Array(pcm.length);
  if (isLP) {
    let prev = 0;
    for (let i = 0; i < pcm.length; i++) { prev += cutoff * (pcm[i] - prev); out[i] = Math.round(prev); }
  } else {
    let prev = 0;
    for (let i = 0; i < pcm.length; i++) { prev += cutoff * (pcm[i] - prev); out[i] = Math.round(pcm[i] - prev); }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateHivelyWaveformWAV(hively: any, sampleRate: number): ArrayBuffer {
  const waveSize = HIVELY_WAVE_SIZES[Math.max(0, Math.min(5, hively.waveLength ?? 2))];
  const rawEntries = (hively.performanceList?.entries as any[]) ?? [];
  const perfSpeed  = Math.max(1, hively.performanceList?.speed ?? 1);

  // Instrument params
  const filterLower  = hively.filterLowerLimit ?? 0;
  const filterUpper  = Math.min(63, (hively.filterUpperLimit ?? 0) + 32); // upper is 0-63, add 32 for full range
  const filterSpeedI = hively.filterSpeed ?? 0;
  const sqLower      = (hively.squareLowerLimit ?? 32) >> (5 - Math.max(0, Math.min(5, hively.waveLength ?? 2)));
  const sqUpper      = (hively.squareUpperLimit ?? 32) >> (5 - Math.max(0, Math.min(5, hively.waveLength ?? 2)));
  const sqSpeed      = hively.squareSpeed ?? 0;
  const vibDelay     = hively.vibratoDelay ?? 0;
  const vibSpeed     = hively.vibratoSpeed ?? 0;
  const vibDepth     = hively.vibratoDepth ?? 0;
  const env          = hively.envelope ?? { aFrames: 1, aVolume: 64, dFrames: 1, dVolume: 64, sFrames: 32, rFrames: 1, rVolume: 0 };
  const hardCut      = hively.hardCutReleaseFrames ?? 0;
  const hardCutRel   = hively.hardCutRelease ?? false;

  const entries = rawEntries.length > 0 ? rawEntries
    : [{ waveform: 1, note: 0, fixed: false, fx: [0, 0], fxParam: [0, 0] }];

  // ── Tick-level state ──
  let perfCurrent = 0, perfWait = 0;
  let curWaveform = 1; // 0=tri,1=saw,2=sq,3=noise (internal 0-based)
  let filterOn = false, filterPos = 32, filterSign = 1, filterWait = 0;
  let filterSlidingIn = false;
  let squareOn = false, squarePos = Math.round((sqLower + sqUpper) / 2);
  let squareSign = 1, squareWait = 0, squareInit = false, squareSlidingIn = false;
  let vibCurrent = 0, vibDelayCount = vibDelay;
  let perfSlideSpeed = 0, perfSlidePeriod = 0;
  let perfSubVolume = 64;
  // ADSR state (fixed-point 8:8)
  let adsrVolume = 0;
  let aFrames = env.aFrames || 1, dFrames = env.dFrames || 1;
  let sFrames = env.sFrames || 32, rFrames = env.rFrames || 1;
  const aStep = aFrames > 0 ? Math.round(env.aVolume * 256 / aFrames) : env.aVolume * 256;
  const dStep = dFrames > 0 ? Math.round((env.dVolume - env.aVolume) * 256 / dFrames) : 0;
  const rStep = rFrames > 0 ? Math.round((env.rVolume - env.dVolume) * 256 / env.rFrames) : 0;
  let noteMaxVolume = hively.volume ?? 64;
  let inRelease = false;

  // Total ticks to simulate: enough to cover attack+decay+sustain (skip release for looping)
  const totalTicks = Math.max(32, (env.aFrames || 1) + (env.dFrames || 1) + (env.sFrames || 16) + 4);
  const sustainStart = (env.aFrames || 1) + (env.dFrames || 1); // tick where sustain begins

  // Generate one cycle per tick
  const tickCycles: { pcm: Int16Array; volume: number }[] = [];

  for (let tick = 0; tick < totalTicks; tick++) {
    // ── ADSR envelope ──
    if (aFrames > 0) {
      adsrVolume += aStep; aFrames--;
      if (aFrames === 0) adsrVolume = env.aVolume * 256;
    } else if (dFrames > 0) {
      adsrVolume += dStep; dFrames--;
      if (dFrames === 0) adsrVolume = env.dVolume * 256;
    } else if (sFrames > 0) {
      sFrames--;
    } else if (!inRelease && rFrames > 0) {
      adsrVolume += rStep; rFrames--;
      if (rFrames === 0) adsrVolume = env.rVolume * 256;
      inRelease = true;
    }
    const envVol = Math.max(0, Math.min(64, adsrVolume >> 8));

    // ── Vibrato ──
    let vibPeriodOff = 0;
    if (vibDepth > 0 && vibDelayCount <= 0) {
      vibPeriodOff = (VIBRATO_TABLE[vibCurrent & 0x3f] * vibDepth) >> 7;
      vibCurrent = (vibCurrent + vibSpeed) & 0x3f;
    } else if (vibDelayCount > 0) {
      vibDelayCount--;
    }

    // ── Performance list step ──
    if (perfCurrent < entries.length) {
      if (perfWait <= 0) {
        const entry = entries[perfCurrent] as any;
        perfCurrent++;
        perfWait = perfSpeed;

        // Waveform change (waveform field: 0=hold, 1-4=set)
        const wf = (entry.waveform as number) ?? 0;
        if (wf > 0) curWaveform = wf - 1;
        perfSlideSpeed = 0; // reset perf slide on new entry

        // Process FX commands
        for (let fxi = 0; fxi < 2; fxi++) {
          const fx = entry.fx?.[fxi] ?? 0;
          const fp = entry.fxParam?.[fxi] ?? 0;
          switch (fx) {
            case 0: if (fp > 0 && fp <= 63) filterPos = fp; break; // Set filter pos
            case 1: perfSlideSpeed = fp; break;  // Perf slide up
            case 2: perfSlideSpeed = -fp; break; // Perf slide down
            case 3: squarePos = fp >> (5 - Math.max(0, Math.min(5, hively.waveLength ?? 2))); break; // Init square
            case 4: // Toggle mod
              if ((fp & 0x0F) !== 0) { squareOn = !squareOn; squareInit = true; }
              if ((fp & 0xF0) !== 0) { filterOn = !filterOn; filterSlidingIn = true; }
              break;
            case 5: perfCurrent = fp; break; // Jump in perf list
            case 12: // Volume
              if (fp <= 64) noteMaxVolume = fp;
              else if (fp >= 0x50 && fp <= 0x90) perfSubVolume = fp - 0x50;
              break;
            case 15: perfWait = fp; break; // Set speed
          }
        }
      }
      perfWait--;
    }

    // ── Perf portamento ──
    perfSlidePeriod += perfSlideSpeed;

    // ── Square PWM sweep ──
    if (curWaveform === 2 && squareOn) {
      if (squareWait <= 0) {
        if (squareInit) {
          squareInit = false;
          if (squarePos <= sqLower) { squareSlidingIn = true; squareSign = 1; }
          else if (squarePos >= sqUpper) { squareSlidingIn = true; squareSign = -1; }
        }
        if (squarePos <= sqLower || squarePos >= sqUpper) {
          if (squareSlidingIn) squareSlidingIn = false;
          else squareSign = -squareSign;
        }
        squarePos = Math.max(1, Math.min(63, squarePos + squareSign));
        squareWait = sqSpeed;
      } else {
        squareWait--;
      }
    }

    // ── Filter sweep ──
    if (filterOn && filterSpeedI > 0) {
      if (filterWait <= 0) {
        const fMax = filterSpeedI < 4 ? (5 - filterSpeedI) : 1;
        for (let fi = 0; fi < fMax; fi++) {
          if (filterPos <= filterLower || filterPos >= filterUpper) {
            if (filterSlidingIn) filterSlidingIn = false;
            else filterSign = -filterSign;
          }
          filterPos = Math.max(1, Math.min(63, filterPos + filterSign));
        }
        filterWait = Math.max(1, filterSpeedI - 3);
      } else {
        filterWait--;
      }
    }

    // ── Generate waveform cycle for this tick ──
    const sqPulseForCycle = Math.round(squarePos * 256 / 64);
    let cycle = generateAHXCycle(curWaveform, waveSize, sqPulseForCycle);

    // Apply filter
    if (filterOn || filterPos !== 32) {
      cycle = applyAHXFilter(cycle, filterPos);
    }

    // Volume: (envVol * noteMaxVolume / 64 * perfSubVolume / 64)
    const vol = Math.round((envVol * noteMaxVolume * perfSubVolume) / (64 * 64));

    tickCycles.push({ pcm: cycle, volume: Math.max(0, Math.min(64, vol)) });
  }

  // ── Assemble final PCM ──
  // MOD samples are played by the Amiga Paula at a rate determined by the period.
  // The period applies to the ENTIRE sample length, so a multi-cycle buffer would
  // play at an extremely low fundamental. Instead, output only the sustain waveform
  // (last tick's cycle) as a short looping sample. The Amiga period directly
  // controls the pitch of this single-cycle waveform.
  //
  // Pick the sustain cycle (or the last cycle with non-zero volume if sustain is silent).
  let bestCycle = tickCycles[tickCycles.length - 1];
  for (let i = tickCycles.length - 1; i >= 0; i--) {
    if (tickCycles[i].volume > 0) { bestCycle = tickCycles[i]; break; }
  }
  const scale = bestCycle.volume / 64;
  const pcm = new Int16Array(waveSize);
  for (let i = 0; i < waveSize; i++) {
    pcm[i] = Math.round(bestCycle.pcm[i] * scale);
  }

  return buildLoopingWAV(pcm, 0, waveSize, sampleRate);
}

/**
 * Bake synthesized Hively/AHX instruments to PCM waveforms so they can be
 * exported to MOD format. Mutates song.instruments in place.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bakeHivelyInstruments(song: any): void {
  // AHX is original Amiga format — samples at Paula rate (8287 Hz).
  // HVL is the modern extension — can use high sample rates.
  const isAHX = (song.format === 'AHX') ||
    (song.name ?? '').toLowerCase().includes('ahx') ||
    (song.metadata?.sourceFormat === 'AHX');
  const sampleRate = isAHX ? 8287 : 44100;

  const instruments = song.instruments ?? [];
  for (const inst of instruments) {
    if (inst.synthType !== 'HivelySynth') continue;
    const hively = inst.hively;
    if (!hively) continue;
    // Skip if already has PCM data
    if (inst.sample?.audioBuffer) continue;

    const wav = generateHivelyWaveformWAV(hively, sampleRate);
    if (!inst.sample) inst.sample = {};
    inst.sample.audioBuffer = wav;
    inst.sample.loop = true;
    inst.sample.loopStart = 0;
    // loopEnd is carried in the WAV smpl chunk; this fallback is ignored by exportSongToMOD
    inst.sample.loopEnd = 0;
    // Volume from instrument config (0-64 scale)
    if (!inst.metadata) inst.metadata = {};
    if (!inst.metadata.modPlayback) inst.metadata.modPlayback = {};
    if (inst.metadata.modPlayback.defaultVolume === undefined) {
      inst.metadata.modPlayback.defaultVolume = Math.min(64, hively.volume ?? 64);
    }
  }
}

/**
 * Export: Bake SidMon1 synthesized instruments using the extracted mainWave[32] data
 * AND arpeggio tables. SidMon1's characteristic sound comes from rapid arpeggio cycling.
 * We bake multiple waveform cycles at different pitches (by resampling) to capture this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bakeSidMon1Instruments(song: any): void {
  const instruments = song.instruments ?? [];
  for (const inst of instruments) {
    if (inst.synthType !== 'SidMon1Synth') continue;
    if (inst.sample?.audioBuffer) continue;
    const sm1 = inst.sidmon1 as any;
    const rawWave: number[] = sm1?.mainWave ?? sm1?.phaseWave ?? [];
    const waveSize = rawWave.length > 0 ? rawWave.length : 32;

    // Scale int8 → int16
    const baseCycle = new Int16Array(waveSize);
    if (rawWave.length > 0) {
      for (let i = 0; i < waveSize; i++) {
        const v = rawWave[i];
        baseCycle[i] = ((v & 0xFF) < 128 ? (v & 0xFF) : (v & 0xFF) - 256) * 256;
      }
    } else {
      for (let i = 0; i < waveSize; i++) baseCycle[i] = Math.round(-32768 + i * 65536 / waveSize);
    }

    // Arpeggio: array of semitone offsets (0-15 range values, cycled every tick)
    const arp: number[] = sm1?.arpeggio ?? [];
    const hasArp = arp.length > 0 && arp.some((v: number) => v !== 0);

    if (!hasArp) {
      // No arpeggio — just use single cycle
      if (!inst.sample) inst.sample = {};
      inst.sample.audioBuffer = buildLoopingWAV(baseCycle, 0, waveSize, AMIGA_RATE);
    } else {
      // Bake arpeggio: generate one cycle per arp entry, resampled for pitch shift.
      // Each arpeggio value is a semitone offset. Resample the base cycle accordingly.
      // Repeat the full arpeggio sequence several times for sustain, loop on the sequence.
      const arpLen = arp.length;
      const repeats = 4; // repeat arpeggio 4 times for sustain
      const totalCycles = arpLen * repeats;
      const sections: Int16Array[] = [];

      for (let c = 0; c < totalCycles; c++) {
        const semitoneOff = arp[c % arpLen] ?? 0;
        if (semitoneOff === 0) {
          sections.push(baseCycle);
        } else {
          // Resample: pitch up by semitoneOff means shorter cycle
          const ratio = Math.pow(2, semitoneOff / 12);
          const newLen = Math.max(4, Math.round(waveSize / ratio));
          const resampled = new Int16Array(newLen);
          for (let i = 0; i < newLen; i++) {
            const srcIdx = (i * ratio) % waveSize;
            const idx0 = Math.floor(srcIdx);
            const frac = srcIdx - idx0;
            const s0 = baseCycle[idx0 % waveSize];
            const s1 = baseCycle[(idx0 + 1) % waveSize];
            resampled[i] = Math.round(s0 + frac * (s1 - s0));
          }
          sections.push(resampled);
        }
      }

      const totalSamples = sections.reduce((s, a) => s + a.length, 0);
      const pcm = new Int16Array(totalSamples);
      let off = 0;
      const loopStart = 0; // loop from start of first repeat
      for (const sec of sections) { pcm.set(sec, off); off += sec.length; }

      if (!inst.sample) inst.sample = {};
      inst.sample.audioBuffer = buildLoopingWAV(pcm, loopStart, totalSamples, AMIGA_RATE);
    }

    inst.sample.loop = true;
    inst.sample.loopStart = 0;
    inst.sample.loopEnd = 0;
    if (!inst.metadata) inst.metadata = {};
    if (!inst.metadata.modPlayback) inst.metadata.modPlayback = {};
    if (inst.metadata.modPlayback.defaultVolume === undefined)
      inst.metadata.modPlayback.defaultVolume = 64;
  }
}

/**
 * Fallback baker: any synthesis instrument with no audioBuffer gets baked.
 * Checks for format-specific waveform data (wavePCM on FC/SoundMon configs,
 * waveformData on DigitalMugician, pcmData on SidMon2) before falling back
 * to a generic sawtooth. All are Amiga-origin — use Paula rate.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bakeGenericSynthInstruments(song: any): void {
  const instruments = song.instruments ?? [];
  for (const inst of instruments) {
    if (inst.type !== 'synth') continue;
    if (inst.sample?.audioBuffer) continue;

    // Try to find actual waveform data on the instrument config
    const wavePCM: number[] | Uint8Array | undefined =
      inst.fc?.wavePCM ??                     // FutureComposer
      inst.soundMon?.wavePCM ??               // SoundMon
      inst.digMug?.waveformData ??            // Digital Mugician
      inst.sidMon?.pcmData ??                 // SidMon2
      inst.hippelCoso?.wavePCM ??             // HippelCoSo
      inst.davidWhittaker?.wavePCM ??         // DavidWhittaker
      undefined;

    let waveSize: number;
    let pcm: Int16Array;

    if (wavePCM && wavePCM.length > 0) {
      // Use actual waveform data (signed 8-bit → 16-bit)
      waveSize = wavePCM.length;
      pcm = new Int16Array(waveSize);
      for (let i = 0; i < waveSize; i++) {
        const s8 = wavePCM[i] < 128 ? wavePCM[i] : wavePCM[i] - 256;
        pcm[i] = s8 * 256;
      }
    } else {
      // Generic sawtooth fallback
      waveSize = 32;
      pcm = new Int16Array(waveSize);
      for (let i = 0; i < waveSize; i++) pcm[i] = Math.round(-32768 + i * 65536 / waveSize);
    }

    if (!inst.sample) inst.sample = {};
    inst.sample.audioBuffer = buildLoopingWAV(pcm, 0, waveSize, AMIGA_RATE);
    inst.sample.loop = true;
    inst.sample.loopStart = 0;
    inst.sample.loopEnd = 0;
    if (!inst.metadata) inst.metadata = {};
    if (!inst.metadata.modPlayback) inst.metadata.modPlayback = {};
    if (inst.metadata.modPlayback.defaultVolume === undefined)
      inst.metadata.modPlayback.defaultVolume = 48;
  }
}

/** Build a minimal looping WAV (PCM + smpl loop chunk). */
function buildLoopingWAV(pcm: Int16Array, loopStart: number, loopEnd: number, sampleRate = 44100): ArrayBuffer {
  const dataBytes = pcm.length * 2;
  const smplSize  = 60;
  const totalSize = 12 + 24 + (8 + dataBytes) + (8 + smplSize);
  const buf  = new ArrayBuffer(totalSize);
  const u8   = new Uint8Array(buf);
  const view = new DataView(buf);
  let p = 0;
  const wr4  = (s: string) => { for (let i = 0; i < 4; i++) u8[p++] = s.charCodeAt(i); };
  const wu32 = (v: number) => { view.setUint32(p, v, true); p += 4; };
  const wu16 = (v: number) => { view.setUint16(p, v, true); p += 2; };
  wr4('RIFF'); wu32(totalSize - 8); wr4('WAVE');
  wr4('fmt '); wu32(16); wu16(1); wu16(1); wu32(sampleRate); wu32(sampleRate * 2); wu16(2); wu16(16);
  wr4('data'); wu32(dataBytes);
  for (let i = 0; i < pcm.length; i++) { view.setInt16(p, pcm[i], true); p += 2; }
  wr4('smpl'); wu32(smplSize);
  wu32(0); wu32(0); wu32(Math.round(1e9 / sampleRate)); wu32(60); wu32(0); wu32(0); wu32(0);
  wu32(1); wu32(0);
  wu32(0); wu32(0); wu32(loopStart); wu32(loopEnd); wu32(0); wu32(0);
  return buf;
}

// ── WAV parser (audioBuffer is a WAV file, not raw PCM) ──────────────────

interface WavInfo {
  sampleRate: number;
  bitsPerSample: number;
  numChannels: number;
  pcm: Int16Array;       // always Int16 (8-bit samples are scaled ×256 by InstrumentConverter)
  loopStart: number;     // in samples, 0 if no loop
  loopEnd:   number;     // in samples, 0 if no loop
}

function parseWav(ab: ArrayBuffer): WavInfo | null {
  const view = new DataView(ab);
  if (ab.byteLength < 44) return null;

  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') return null;

  let sampleRate = 0, bitsPerSample = 16, numChannels = 1;
  let dataOffset = 0, dataSize = 0;
  let loopStart = 0, loopEnd = 0;

  let pos = 12; // skip RIFF header
  while (pos + 8 <= ab.byteLength) {
    const id   = String.fromCharCode(view.getUint8(pos), view.getUint8(pos+1), view.getUint8(pos+2), view.getUint8(pos+3));
    const size = view.getUint32(pos + 4, true);
    pos += 8;

    if (id === 'fmt ') {
      numChannels   = view.getUint16(pos + 2, true);
      sampleRate    = view.getUint32(pos + 4, true);
      bitsPerSample = view.getUint16(pos + 14, true);
    } else if (id === 'data') {
      dataOffset = pos;
      dataSize   = size;
    } else if (id === 'smpl' && size >= 60) {
      const numLoops = view.getUint32(pos + 28, true);
      if (numLoops > 0) {
        loopStart = view.getUint32(pos + 44, true);
        loopEnd   = view.getUint32(pos + 48, true);
      }
    }
    pos += (size + 1) & ~1; // word-align
  }

  if (!dataOffset || !sampleRate) return null;

  // InstrumentConverter always writes 16-bit PCM internally (8-bit × 256)
  const raw16 = new Int16Array(ab, dataOffset, dataSize >> 1);

  // Mix stereo to mono if needed
  let pcm: Int16Array;
  if (numChannels === 2) {
    const frames = raw16.length >> 1;
    pcm = new Int16Array(frames);
    for (let i = 0; i < frames; i++) pcm[i] = (raw16[i*2] >> 1) + (raw16[i*2+1] >> 1);
  } else {
    pcm = Int16Array.from(raw16);
  }

  return { sampleRate, bitsPerSample, numChannels, pcm, loopStart, loopEnd };
}

// ── ProTracker magic bytes (channel-count aware) ─────────────────────────
function modMagic(channels: number, patternCount: number): string {
  if (channels === 4) return patternCount > 64 ? 'M!K!' : 'M.K.';
  if (channels <= 9) return `${channels}CHN`;
  return `${channels}CH`; // two-digit: "10CH", "12CH"
}

// ── Pure TypeScript MOD binary serializer ────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportSongToMOD(song: any, outPath: string): string[] {
  const warnings: string[] = [];
  const patterns:    unknown[]  = song.patterns    ?? [];
  const instruments: unknown[]  = song.instruments ?? [];
  const rawOrder: number[] = (song.songPositions && song.songPositions.length > 0)
    ? song.songPositions
    : patterns.map((_: unknown, i: number) => i);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // MOD supports up to 32 channels (nCHN/nCH magic). OctaMED uses 8-10+ channels.
  const NUM_CHANNELS: number = Math.min(32, song.numChannels || (patterns[0] as any)?.channels?.length || 4);
  const MAX_SAMPLES   = 31;
  const MAX_ORDERS    = 128;
  const PAT_ROWS      = 64; // MOD always has exactly 64 rows per pattern

  // Clamp order list
  const orders = rawOrder.slice(0, MAX_ORDERS);
  if (rawOrder.length > MAX_ORDERS)
    warnings.push(`Order list truncated from ${rawOrder.length} to ${MAX_ORDERS}`);

  const orderLen = Math.max(1, Math.min(orders.length, 128));

  // How many patterns must be written (0..maxPatIdx inclusive)
  const maxPatIdx = orders.reduce((m, v) => Math.max(m, v), 0);
  const writePatCount = Math.min(maxPatIdx + 1, 128);
  if (maxPatIdx >= 128)
    warnings.push(`Pattern index ${maxPatIdx} >= 128, some orders will be clamped`);

  // Magic
  const magic = modMagic(NUM_CHANNELS, writePatCount);

  // ── Initial speed / BPM ───────────────────────────────────────────────
  // MOD default: speed=6 ticks/row, BPM=125. Inject Fxx effects into the
  // first available (no-effect) cells in row 0 of pattern 0 if different.
  const initSpeed = typeof song.initialSpeed === 'number' ? song.initialSpeed : 6;
  const initBPM   = typeof song.initialBPM   === 'number' ? song.initialBPM   : 125;
  // Always inject both F-speed and F-BPM so the MOD is self-contained regardless
  // of what ProTracker's playback state was before loading.
  // BUT: skip injection if the source already has an Fxx speed/BPM command at
  // row 0 of the first played pattern — injecting would create conflicting Fxx
  // commands where the LAST channel's value wins, corrupting the source timing.
  // Only inject speed/BPM if they differ from ProTracker defaults (speed=6, BPM=125)
  let injectSpeed = initSpeed >= 1  && initSpeed <= 31 && initSpeed !== 6;
  let injectBPM   = initBPM  >= 32 && initBPM  <= 255 && initBPM !== 125;
  {
    const firstPat = patterns[orders[0]] as any;
    if (firstPat) {
      const allCh: number = firstPat?.channels?.length ?? NUM_CHANNELS;
      for (let c = 0; c < allCh; c++) {
        const cell = firstPat?.channels?.[c]?.rows?.[0] as any;
        if (!cell) continue;
        const et = cell.effTyp ?? 0;
        const ef = cell.eff    ?? 0;
        if (et === 0x0F) {
          if (ef >= 1 && ef <= 31)  injectSpeed = false; // source already sets speed
          if (ef >= 32 && ef <= 255) injectBPM  = false; // source already sets BPM
        }
      }
    }
  }

  // ── Pre-scan patterns: determine per-instrument period usage ─────────
  // ProTracker display range: 113 ≤ period ≤ 856 (C-1 to B-3).
  // Notes outside this range show ??? in ProTracker.
  // For instruments with ONLY out-of-range notes, we resample the PCM and clamp periods.
  // For mixed-range instruments, we create a duplicate resampled instrument for the
  // out-of-range notes and remap those cells to use the duplicate.
  const PT_MIN_PERIOD = 113, PT_MAX_PERIOD = 856;
  const noteOff = (song as any).noteExportOffset ?? 0;
  const instrPeriodFlags: { low: boolean; high: boolean; ok: boolean }[] =
    Array.from({ length: MAX_SAMPLES + 1 }, () => ({ low: false, high: false, ok: false }));
  const ALL_SRC_CHANNELS: number = song.numChannels || (patterns[0] as any)?.channels?.length || 4;
  for (let p = 0; p < writePatCount; p++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pat = p < patterns.length ? (patterns[p] as any) : null;
    const numRows = Math.min(pat?.length || pat?.channels?.[0]?.rows?.length || 64, 64);
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < ALL_SRC_CHANNELS; c++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cell = pat?.channels?.[c]?.rows?.[r] as any;
        if (!cell) continue;
        const note = cell.note ?? 0;
        if (note <= 0 || note >= 97) continue;
        const period = noteToMODPeriod(note + noteOff); // apply same offset as export
        if (period === 0) continue;
        const instrIdx = Math.min(cell.instrument ?? 0, MAX_SAMPLES);
        if (instrIdx < 1) continue;
        const flags = instrPeriodFlags[instrIdx];
        if (period > PT_MAX_PERIOD) flags.low = true;
        else if (period < PT_MIN_PERIOD) flags.high = true;
        else flags.ok = true;
      }
    }
  }
  // ── Build resample plan and duplicate instrument map ─────────────────
  // instrResample[i]: +1 = double PCM (notes too low), -1 = halve (too high), 0 = no change
  // For exclusively out-of-range instruments: resample the original in place.
  // For mixed instruments: create duplicate resampled sample slots and remap cells.
  const instrResample: (1 | -1 | 0)[] = new Array(MAX_SAMPLES + 1).fill(0);
  // instrDupLow[origInstr] = duplicate instrument index for low (period>856) notes
  // instrDupHigh[origInstr] = duplicate instrument index for high (period<113) notes
  const instrDupLow:  number[] = new Array(MAX_SAMPLES + 1).fill(0);
  const instrDupHigh: number[] = new Array(MAX_SAMPLES + 1).fill(0);
  let nextDupSlot = instruments.length + 1; // 1-based, after all real instruments

  for (let i = 1; i <= Math.min(instruments.length, MAX_SAMPLES); i++) {
    const f = instrPeriodFlags[i];
    if (f.low && !f.ok && !f.high) {
      instrResample[i] = 1;  // only low → resample original
    } else if (f.high && !f.ok && !f.low) {
      instrResample[i] = -1; // only high → resample original
    } else if (f.low && f.ok && nextDupSlot <= MAX_SAMPLES) {
      // Mixed low+ok: create duplicate for low notes (doubled PCM, period ÷2)
      instrDupLow[i] = nextDupSlot++;
    } else if (f.high && f.ok && nextDupSlot <= MAX_SAMPLES) {
      // Mixed high+ok: create duplicate for high notes (halved PCM, period ×2)
      instrDupHigh[i] = nextDupSlot++;
    }
    // Both low+high on same instrument: very rare, skip for now
  }

  // ── Sample headers + PCM data ─────────────────────────────────────────
  interface SampleHdr {
    name: string; lengthWords: number;
    finetune: number; volume: number;
    loopStartWords: number; loopLenWords: number;
  }
  const smpHdrs: SampleHdr[]  = [];
  const smpPCM:  Uint8Array[] = [];

  for (let i = 0; i < MAX_SAMPLES; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst = i < instruments.length ? (instruments[i] as any) : null;
    const ab   = inst?.sample?.audioBuffer as ArrayBuffer | undefined;

    if (!ab || ab.byteLength === 0) {
      smpHdrs.push({ name: inst?.name ?? '', lengthWords: 0, finetune: 0, volume: 0, loopStartWords: 0, loopLenWords: 0 });
      smpPCM.push(new Uint8Array(0));
      continue;
    }

    // audioBuffer is a WAV file — parse it to get real PCM
    const wav = parseWav(ab);
    if (!wav || wav.pcm.length === 0) {
      smpHdrs.push({ name: inst?.name ?? '', lengthWords: 0, finetune: 0, volume: 0, loopStartWords: 0, loopLenWords: 0 });
      smpPCM.push(new Uint8Array(0));
      continue;
    }

    // Convert Int16 → Int8 (8-bit signed PCM for MOD).
    // For instruments exclusively used at out-of-range periods (instrResample[i+1] != 0),
    // resample by 2× or ÷2 so pitch stays correct after the period octave-clamp below.
    //   instrResample = +1 → double PCM (all notes were 1 octave too low → shift period/2)
    //   instrResample = -1 → halve PCM (all notes were 1 octave too high → shift period*2)
    let workPcm = wav.pcm;
    const resampleDir = instrResample[i + 1]; // i+1 because instruments are 1-indexed
    if (resampleDir === 1) {
      // Double: repeat each sample's cycle by concatenating with itself.
      // Keeps the loop sustain on the last macro section by just duplicating the whole buffer.
      const doubled = new Int16Array(workPcm.length * 2);
      doubled.set(workPcm, 0);
      doubled.set(workPcm, workPcm.length);
      workPcm = doubled;
    } else if (resampleDir === -1 && workPcm.length >= 4) {
      // Halve: take every other sample (simple 2× downsample, fine for single-cycle waveforms).
      const halved = new Int16Array(Math.floor(workPcm.length / 2));
      for (let j = 0; j < halved.length; j++) halved[j] = workPcm[j * 2];
      workPcm = halved;
    }
    let len = Math.min(workPcm.length, 131070);
    if (len & 1) len--;
    if (wav.pcm.length > 131070) warnings.push(`Sample ${i + 1} "${inst?.name}" truncated`);

    const pcm8 = new Uint8Array(len);
    for (let j = 0; j < len; j++) pcm8[j] = (workPcm[j] >> 8) & 0xFF;

    const lengthWords = len >> 1;
    // metadata.modPlayback.defaultVolume holds the original 0-64 volume
    // for both Amiga (createSamplerInstrument) and PC tracker (InstrumentConverter) formats.
    // inst.volume is in dB which is unusable here directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defaultVol = (inst as any)?.metadata?.modPlayback?.defaultVolume;
    const volume = (typeof defaultVol === 'number' && defaultVol >= 0)
      ? Math.min(64, Math.round(defaultVol))
      : 64; // fallback: full volume

    // Loop points — prefer SMPL chunk data, fall back to inst.sample fields.
    // Only use inst.sample loop if the instrument actually loops (loop=true).
    // createSamplerInstrument stores loopEnd=pcm.length even for non-looping samples.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instSample = (inst as any)?.sample;
    const instHasLoop = instSample?.loop === true && instSample?.loopType !== 'off';
    let ls = wav.loopStart > 0 ? wav.loopStart : (instHasLoop ? (instSample?.loopStart ?? 0) : 0);
    let le = wav.loopEnd   > 0 ? wav.loopEnd   : (instHasLoop ? (instSample?.loopEnd   ?? 0) : 0);
    // Adjust loop points for resampled instruments.
    if (resampleDir === 1) {
      // PCM was doubled: original loop → second copy (offset by original length).
      // Sustaining on the second copy is equivalent to sustaining on the original.
      const origLen = wav.pcm.length;
      ls = ls + origLen;
      le = le + origLen;
    } else if (resampleDir === -1) {
      // PCM was halved: scale loop points down by 2.
      ls = Math.floor(ls / 2);
      le = Math.floor(le / 2);
    }
    let loopStartWords = 0, loopLenWords = 1;
    const safeLoopEnd = Math.min(le, len);
    if (safeLoopEnd > ls && ls >= 0 && lengthWords > 1) {
      loopStartWords = Math.min(ls >> 1, lengthWords - 1);
      loopLenWords   = Math.max(1, Math.floor((safeLoopEnd - ls) / 2));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fineRaw: number = (inst as any)?.metadata?.modPlayback?.finetune ?? 0;
    const fineClamped = Math.max(-8, Math.min(7, fineRaw));
    const finetune = (fineClamped < 0 ? fineClamped + 16 : fineClamped) & 0x0F;
    smpHdrs.push({ name: inst?.name ?? '', lengthWords, finetune, volume, loopStartWords, loopLenWords });
    smpPCM.push(pcm8);
  }

  // ── Generate duplicate samples for mixed-range instruments ───────────
  // For instruments with both in-range and out-of-range notes, we created duplicate
  // slot IDs above. Now fill those slots with resampled PCM.
  for (let orig = 1; orig <= Math.min(instruments.length, MAX_SAMPLES); orig++) {
    const lowDup  = instrDupLow[orig];
    const highDup = instrDupHigh[orig];
    if (!lowDup && !highDup) continue;
    const srcIdx = orig - 1; // 0-based index into smpHdrs/smpPCM
    const srcPCM = smpPCM[srcIdx];
    const srcHdr = smpHdrs[srcIdx];
    if (!srcPCM || srcPCM.length === 0) continue;

    if (lowDup) {
      // Duplicate for low notes: double the PCM (1 octave up in sample domain).
      // When used with period ÷2, pitch stays correct.
      const doubled = new Uint8Array(Math.min(srcPCM.length * 2, 131070));
      doubled.set(srcPCM, 0);
      if (srcPCM.length * 2 <= 131070) doubled.set(srcPCM, srcPCM.length);
      const dupLen = doubled.length;
      const dupLenW = dupLen >> 1;
      // Scale loop points
      const dls = srcHdr.loopStartWords * 2 + srcHdr.loopStartWords; // offset into second copy
      const dle = srcHdr.loopLenWords;
      const dupIdx = lowDup - 1;
      while (smpHdrs.length <= dupIdx) {
        smpHdrs.push({ name: '', lengthWords: 0, finetune: 0, volume: 0, loopStartWords: 0, loopLenWords: 0 });
        smpPCM.push(new Uint8Array(0));
      }
      smpHdrs[dupIdx] = {
        name: (srcHdr.name + ' ^').slice(0, 22),
        lengthWords: dupLenW,
        finetune: srcHdr.finetune,
        volume: srcHdr.volume,
        loopStartWords: srcHdr.loopStartWords + (srcPCM.length >> 1),
        loopLenWords: srcHdr.loopLenWords,
      };
      smpPCM[dupIdx] = doubled;
    }

    if (highDup) {
      // Duplicate for high notes: halve the PCM (1 octave down in sample domain).
      // When used with period ×2, pitch stays correct.
      const halfLen = Math.floor(srcPCM.length / 2);
      const halved = new Uint8Array(halfLen);
      for (let j = 0; j < halfLen; j++) halved[j] = srcPCM[j * 2];
      const dupIdx = highDup - 1;
      while (smpHdrs.length <= dupIdx) {
        smpHdrs.push({ name: '', lengthWords: 0, finetune: 0, volume: 0, loopStartWords: 0, loopLenWords: 0 });
        smpPCM.push(new Uint8Array(0));
      }
      smpHdrs[dupIdx] = {
        name: (srcHdr.name + ' v').slice(0, 22),
        lengthWords: halfLen >> 1,
        finetune: srcHdr.finetune,
        volume: srcHdr.volume,
        loopStartWords: Math.floor(srcHdr.loopStartWords / 2),
        loopLenWords: Math.max(1, Math.floor(srcHdr.loopLenWords / 2)),
      };
      smpPCM[dupIdx] = halved;
    }
  }
  // Pad remaining slots to MAX_SAMPLES
  while (smpHdrs.length < MAX_SAMPLES) {
    smpHdrs.push({ name: '', lengthWords: 0, finetune: 0, volume: 0, loopStartWords: 0, loopLenWords: 0 });
    smpPCM.push(new Uint8Array(0));
  }

  const totalSampleBytes = smpPCM.reduce((acc, b) => acc + b.length, 0);

  // ── Allocate buffer ───────────────────────────────────────────────────
  const patDataBytes = writePatCount * NUM_CHANNELS * PAT_ROWS * 4;
  const totalSize    = 20 + MAX_SAMPLES * 30 + 2 + 128 + 4 + patDataBytes + totalSampleBytes;
  const buf = new Uint8Array(totalSize);
  let off = 0;

  // ── Song title (20 bytes) ─────────────────────────────────────────────
  buf.set(padString(song.name ?? 'DEViLBOX Export', 20), off); off += 20;

  // ── 31 sample headers (30 bytes each) ────────────────────────────────
  for (const sh of smpHdrs) {
    buf.set(padString(sh.name, 22), off); off += 22;
    writeBE16(buf, off, sh.lengthWords); off += 2;
    buf[off++] = sh.finetune & 0x0F;
    buf[off++] = Math.min(sh.volume, 64);
    writeBE16(buf, off, sh.loopStartWords); off += 2;
    writeBE16(buf, off, sh.loopLenWords);   off += 2;
  }

  // ── Number of orders + restart pos ───────────────────────────────────
  buf[off++] = orderLen;
  const restartPos = Math.min((song as any).restartPosition ?? 0x7F, 127);
  buf[off++] = restartPos;

  // ── Order list (128 bytes) ────────────────────────────────────────────
  for (let i = 0; i < 128; i++) {
    buf[off++] = i < orders.length ? Math.min(orders[i], 127) : 0;
  }

  // ── Magic ─────────────────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) buf[off++] = magic.charCodeAt(i);

  // ── Pattern data ──────────────────────────────────────────────────────
  for (let p = 0; p < writePatCount; p++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pat = p < patterns.length ? (patterns[p] as any) : null;

    const patLen = pat?.length || pat?.channels?.[0]?.rows?.length || 64;
    const numRows = Math.min(patLen, 64);
    if (patLen > 64) warnings.push(`Pattern ${p}: ${patLen} rows truncated to 64 (MOD limit)`);

    // Determine if pattern needs a break command. Only inject D00 when the pattern's
    // declared length (from the parser) is genuinely < 64. Do NOT use content scanning
    // to second-guess — MOD patterns always play 64 rows, and other formats set the
    // length field explicitly when patterns are shorter.
    const declaredLen = pat?.length ?? numRows;
    const actualContentRows = Math.min(typeof declaredLen === 'number' ? declaredLen : numRows, PAT_ROWS);
    const needPatBreak = actualContentRows > 0 && actualContentRows < PAT_ROWS;
    let patBreakInjected = false;

    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < NUM_CHANNELS; c++) {
        const cell = pat?.channels?.[c]?.rows?.[r];

        let period = 0, instr = 0, cmd = 0, param = 0;

        if (cell) {
          const note = cell.note ?? 0;
          // For S3M-origin formats (GDM/S3M), notes use OpenMPT numbering where
          // C-5 is the standard sample rate (8363 Hz). ProTracker MOD uses C-3.
          // noteExportOffset shifts S3M C-5 (note=61) → MOD C-3 (note=37, -24)
          // so that periods match the correct ProTracker frequencies.
          const noteOff = (song as any).noteExportOffset ?? 0;
          const expNote = note + noteOff;
          const expPeriod = noteToMODPeriod(expNote);
          if (note !== 0 && expPeriod > 0) {
            period = expPeriod;
            // Handle out-of-range periods:
            // 1. Exclusively out-of-range: resample was applied, clamp period.
            // 2. Mixed with duplicate slot: swap to duplicate, clamp period.
            // 3. Synth waveforms (looping single-cycle): always safe to clamp —
            //    halving/doubling period just shifts the octave, timbre is preserved.
            // 4. PCM samples without duplicates: leave as-is (??? display, correct pitch).
            const cellInstr = Math.min(cell.instrument ?? 0, MAX_SAMPLES);
            if (period > PT_MAX_PERIOD || (period > 0 && period < PT_MIN_PERIOD)) {
              // Check if we have a duplicate to swap to
              if (period > PT_MAX_PERIOD && cellInstr >= 1 && instrDupLow[cellInstr] > 0) {
                instr = instrDupLow[cellInstr];
              } else if (period < PT_MIN_PERIOD && cellInstr >= 1 && instrDupHigh[cellInstr] > 0) {
                instr = instrDupHigh[cellInstr];
              }
              // Clamp by octave-shifting, then snap to nearest standard PT period
              while (period > PT_MAX_PERIOD && period > 0) period = (period + 1) >> 1;
              while (period > 0 && period < PT_MIN_PERIOD) period = period << 1;
              // Snap to nearest standard period to avoid ??? in ProTracker
              let bestPeriod = period, bestDist = 9999;
              for (let pi = 0; pi < PT_PERIODS.length; pi++) {
                const d = Math.abs(PT_PERIODS[pi] - period);
                if (d < bestDist) { bestDist = d; bestPeriod = PT_PERIODS[pi]; }
              }
              period = bestPeriod;
            }
          }

          instr = Math.min(cell.instrument ?? 0, 31);

          const et = cell.effTyp ?? 0;
          const ef = cell.eff    ?? 0;

          if (et >= 0 && et <= 15) {
            // DEViLBOX effTyp 0-15 maps directly to MOD effect nibble
            if (et !== 0 || ef !== 0) { cmd = et; param = ef & 0xFF; }
          }
          // Effects 16+ (global vol, set env pos, etc.) → drop

          // If no effect, promote volume column "Set Volume" → 0xC
          if (cmd === 0 && param === 0) {
            const vol = cell.volume ?? 0;
            if (vol >= 0x10 && vol <= 0x50) { cmd = 0xC; param = vol - 0x10; }
          }
        }

        // Inject initial speed/BPM into the first free effect slots in row0 of
        // the first PLAYED pattern (orders[0]), not necessarily pattern index 0.
        if (p === orders[0] && r === 0 && cmd === 0 && param === 0) {
          if (injectSpeed) { cmd = 0xF; param = initSpeed; injectSpeed = false; }
          else if (injectBPM) { cmd = 0xF; param = initBPM;   injectBPM   = false; }
        }

        // Inject D00 (pattern break to row 0) at the last content row of short patterns.
        // Use the first channel that has no effect already — this ensures the player
        // jumps to the next order instead of playing the trailing empty rows.
        if (needPatBreak && !patBreakInjected && r === actualContentRows - 1 && cmd === 0 && param === 0) {
          cmd = 0xD; param = 0;
          patBreakInjected = true;
        }

        buf[off++] = ((period >> 8) & 0x0F) | (instr & 0x10);
        buf[off++] = period & 0xFF;
        buf[off++] = ((instr & 0x0F) << 4) | (cmd & 0x0F);
        buf[off++] = param & 0xFF;
      }
    }
    // If pattern break was needed but couldn't be injected on the last content row
    // (all channels had effects), write it on the row right after content.
    if (needPatBreak && !patBreakInjected && actualContentRows < PAT_ROWS) {
      // Row actualContentRows was already written (empty). Patch it with D00 on ch0.
      const patStartOff = off - numRows * NUM_CHANNELS * 4;
      const breakRowOff = patStartOff + actualContentRows * NUM_CHANNELS * 4;
      buf[breakRowOff + 2] = 0x0D;
      buf[breakRowOff + 3] = 0x00;
      patBreakInjected = true;
    }
    // MOD always has exactly PAT_ROWS (64) rows per pattern.
    // If source has fewer rows, advance past the remaining empty rows.
    off += (PAT_ROWS - numRows) * NUM_CHANNELS * 4;
  }

  // ── Sample PCM data ───────────────────────────────────────────────────
  for (const pcm of smpPCM) {
    buf.set(pcm, off);
    off += pcm.length;
  }

  writeFileSync(outPath, Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
  return warnings;
}

// ── XM exporter ────────────────────────────────────────────────────────────
//
// XM (FastTracker 2) binary serializer for PC tracker formats.
// Notes are stored directly as 1-based values (0=empty, 1=C-0 … 96=B-7),
// which matches TrackerSong's internal convention — no period conversion needed.
//
// XM file layout:
//   File header   : 336 bytes (17-byte sig + 20 name + 1 + 20 tracker + 2 ver + 276 module header)
//   Patterns      : 9-byte header + uncompressed rows (5 bytes/cell)
//   Instruments   : 263-byte header (if samples) + 40-byte sample header + delta-PCM

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportSongToXM(song: any, outPath: string): string[] {
  const warnings: string[]   = [];
  const patterns: unknown[]  = song.patterns    ?? [];
  const instruments: unknown[] = song.instruments ?? [];
  const rawOrder: number[]   = (song.songPositions && song.songPositions.length > 0)
    ? song.songPositions
    : patterns.map((_: unknown, i: number) => i);

  const NUM_CHANNELS = Math.max(2, Math.min(32,
    song.numChannels || (patterns[0] as any)?.channels?.length || 4));
  const MAX_INSTR = 128;

  const orders   = rawOrder.slice(0, 256);
  if (rawOrder.length > 256) warnings.push(`Order list truncated from ${rawOrder.length} to 256`);
  const orderLen = Math.max(1, orders.length);

  const maxPatIdx    = orders.reduce((m, v) => Math.max(m, v), 0);
  const numPatterns  = Math.min(maxPatIdx + 1, 256);
  const numInstr     = Math.min(instruments.length, MAX_INSTR);
  const initTempo    = typeof song.initialSpeed === 'number' ? Math.max(1, song.initialSpeed) : 6;
  const initBPM      = typeof song.initialBPM   === 'number' ? Math.max(32, song.initialBPM)  : 125;

  // ── Build pattern data (uncompressed: 5 bytes per cell) ────────────────
  // XM note offset: for Amiga formats whose notes come from amigaNoteToXM (rawNote+12),
  // add +12 so Amiga C-3 (period 214, ~8287 Hz) aligns with XM C-4 (note 49, 8363 Hz).
  // For PC formats (GDM/S3M with noteExportOffset=-12), pass through as-is.
  const noteOff: number = (song as any).xmNoteExportOffset ?? (song as any).noteExportOffset ?? 0;
  const xmRelNoteOff: number = (song as any).xmRelNoteOffset ?? 0;
  const patternBuffers: Uint8Array[]  = [];
  const patternRowCounts: number[]    = [];

  for (let p = 0; p < numPatterns; p++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pat     = p < patterns.length ? (patterns[p] as any) : null;
    const patLen  = pat?.length || pat?.channels?.[0]?.rows?.length || 64;
    const numRows = Math.max(1, Math.min(256, patLen));
    patternRowCounts.push(numRows);

    const data = new Uint8Array(numRows * NUM_CHANNELS * 5);
    let di = 0;

    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < NUM_CHANNELS; c++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cell    = pat?.channels?.[c]?.rows?.[r] as any;
        let note = 0, instr = 0, vol = 0, effType = 0, effParam = 0;

        if (cell) {
          // XM note: 0=empty, 1=C-0 … 96=B-7, 97=key-off
          // Apply noteExportOffset for formats with different note numbering (e.g. GDM/S3M)
          const n = cell.note ?? 0;
          const shifted = n > 0 && n <= 96 ? n + noteOff : n;
          note = (shifted >= 1 && shifted <= 97) ? shifted : 0;
          instr   = Math.min(cell.instrument ?? 0, 128);
          // Volume column: DEViLBOX 0x10-0x50 = volume 0-64 — same as XM spec
          const cv = cell.volume ?? 0;
          vol = (cv >= 0 && cv <= 0xFF) ? cv : 0;
          const et = cell.effTyp ?? 0;
          const ef = cell.eff    ?? 0;
          if (et !== 0 || ef !== 0) { effType = et & 0xFF; effParam = ef & 0xFF; }
        }

        data[di++] = note;
        data[di++] = instr;
        data[di++] = vol;
        data[di++] = effType;
        data[di++] = effParam;
      }
    }
    patternBuffers.push(data);
  }

  // ── Build sample data ─────────────────────────────────────────────────
  interface XMSample {
    name:        string;
    deltaBytes:  Uint8Array; // delta-encoded signed 8-bit, stored as raw bytes
    loopStart:   number;     // bytes
    loopLength:  number;     // bytes (0 = no loop)
    volume:      number;     // 0-64
    finetune:    number;     // -128..127, stored as uint8 (two's complement)
    panning:     number;     // 0-255 (128 = centre)
    relNote:     number;     // signed relative note (-128..127), stored as uint8
  }

  const instrSamples: (XMSample | null)[] = [];
  for (let i = 0; i < numInstr; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst = instruments[i] as any;
    const ab   = inst?.sample?.audioBuffer as ArrayBuffer | undefined;
    if (!ab || ab.byteLength === 0) { instrSamples.push(null); continue; }

    const wav = parseWav(ab);
    if (!wav || wav.pcm.length === 0) { instrSamples.push(null); continue; }

    const len = Math.min(wav.pcm.length, 262143);

    // Int16 PCM → signed Int8 (take high byte), then delta-encode
    const raw8 = new Int8Array(len);
    for (let j = 0; j < len; j++) raw8[j] = wav.pcm[j] >> 8;

    const delta8 = new Int8Array(len);
    let prev8 = 0;
    for (let j = 0; j < len; j++) {
      delta8[j] = raw8[j] - prev8; // Int8Array auto-truncates to signed 8-bit
      prev8 = raw8[j];
    }

    const instSmp    = inst?.sample;
    const instHasLoop = instSmp?.loop === true && instSmp?.loopType !== 'off';
    const ls = wav.loopStart > 0 ? wav.loopStart : (instHasLoop ? (instSmp?.loopStart ?? 0) : 0);
    const le = wav.loopEnd   > 0 ? wav.loopEnd   : (instHasLoop ? (instSmp?.loopEnd   ?? 0) : 0);
    const loopStart  = ls > 0 ? Math.min(ls, len - 1) : 0;
    const loopEnd    = le > loopStart ? Math.min(le, len) : 0;
    const loopLength = loopEnd > loopStart ? loopEnd - loopStart : 0;

    const defVol = inst?.metadata?.modPlayback?.defaultVolume;
    const volume = (typeof defVol === 'number' && defVol >= 0) ? Math.min(64, Math.round(defVol)) : 64;

    // Use stored XM-native relativeNote/finetune when available (XM/IT/S3M formats
    // store these via InstrumentConverter). Otherwise compute from WAV sample rate.
    const storedRelNote: number | undefined = inst?.metadata?.modPlayback?.relativeNote;
    const fineRaw: number = inst?.metadata?.modPlayback?.finetune ?? 0;
    let finetune: number;
    let relNoteClamped: number;

    const songFormat = ((song as any).format ?? '').toUpperCase();
    if (typeof storedRelNote === 'number' && songFormat === 'XM') {
      // XM format natively stores relativeNote + finetune. Preserve exactly.
      finetune = Math.max(-128, Math.min(127, fineRaw)) & 0xFF;
      relNoteClamped = Math.max(-128, Math.min(127, storedRelNote + xmRelNoteOff)) & 0xFF;
    } else {
      // MOD/Amiga finetune (-8..7) → XM finetune (-128..127): multiply by 16
      finetune = Math.max(-128, Math.min(127, Math.round(fineRaw) * 16)) & 0xFF;
      // Compute relNote from WAV sample rate
      const actualRate = wav.sampleRate > 0 ? wav.sampleRate : 8363;
      const rateRelNote = actualRate !== 8363
        ? Math.round(12 * Math.log2(actualRate / 8363))
        : 0;
      relNoteClamped = Math.max(-128, Math.min(127, rateRelNote + xmRelNoteOff)) & 0xFF;
    }

    instrSamples.push({
      name:       inst?.name ?? '',
      deltaBytes: new Uint8Array(delta8.buffer, delta8.byteOffset, delta8.byteLength),
      loopStart,
      loopLength,
      volume,
      finetune:   finetune & 0xFF, // store as uint8 (two's complement for negatives)
      panning:    128,
      relNote:    relNoteClamped & 0xFF,
    });
  }

  // ── Calculate sizes ───────────────────────────────────────────────────
  const totalPatBytes = patternBuffers.reduce((sum, b, i) => sum + 9 + patternBuffers[i].length, 0);

  let totalInstrBytes = 0;
  for (let i = 0; i < numInstr; i++) {
    const smp = instrSamples[i];
    totalInstrBytes += smp ? (263 + 40 + smp.deltaBytes.length) : 29;
  }

  const totalSize = 336 + totalPatBytes + totalInstrBytes;
  const buf  = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 0;

  // ── File header (336 bytes) ───────────────────────────────────────────
  // "Extended Module: "  (17 bytes)
  const sig = 'Extended Module: ';
  for (let i = 0; i < 17; i++) buf[off++] = sig.charCodeAt(i);

  // Module name (20 bytes, zero-padded)
  const modName = (song.name ?? 'DEViLBOX Export').substring(0, 20);
  for (let i = 0; i < 20; i++) buf[off++] = i < modName.length ? modName.charCodeAt(i) : 0;

  buf[off++] = 0x1A; // separator

  // Tracker name (20 bytes)
  const tracker = 'DEViLBOX           ';
  for (let i = 0; i < 20; i++) buf[off++] = tracker.charCodeAt(i);

  // Version 1.04 (LE)
  view.setUint16(off, 0x0104, true); off += 2;

  // ── Module header (starts at file offset 60, size = 276) ─────────────
  view.setUint32(off, 276, true);  off += 4;  // header size (not counting 60-byte file sig)
  view.setUint16(off, orderLen, true);    off += 2;  // song length
  view.setUint16(off, 0, true);           off += 2;  // restart position
  view.setUint16(off, NUM_CHANNELS, true); off += 2;
  view.setUint16(off, numPatterns, true); off += 2;
  view.setUint16(off, numInstr, true);    off += 2;
  view.setUint16(off, 1, true);           off += 2;  // flags (1 = linear frequency table)
  view.setUint16(off, initTempo, true);   off += 2;  // default tempo (ticks/row)
  view.setUint16(off, initBPM, true);     off += 2;  // default BPM

  // Pattern order table (256 bytes) — file offset now at 80, need 256 more = 336
  for (let i = 0; i < 256; i++) {
    buf[off++] = i < orders.length ? Math.min(orders[i], 255) : 0;
  }
  // off === 336 here

  // ── Patterns ─────────────────────────────────────────────────────────
  for (let p = 0; p < numPatterns; p++) {
    const rows = patternRowCounts[p];
    const data = patternBuffers[p];
    view.setUint32(off, 9, true);           off += 4; // pattern header size
    buf[off++] = 0;                                    // packing type
    view.setUint16(off, rows, true);        off += 2; // number of rows
    view.setUint16(off, data.length, true); off += 2; // packed data size
    buf.set(data, off); off += data.length;
  }

  // ── Instruments ───────────────────────────────────────────────────────
  for (let i = 0; i < numInstr; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst = instruments[i] as any;
    const smp  = instrSamples[i];
    const name = (inst?.name ?? '').substring(0, 22);

    if (!smp) {
      // Empty instrument: 29 bytes
      view.setUint32(off, 29, true); off += 4;
      for (let j = 0; j < 22; j++) buf[off++] = j < name.length ? name.charCodeAt(j) : 0;
      buf[off++] = 0;                  // type
      view.setUint16(off, 0, true); off += 2; // num samples
      continue;
    }

    // Full instrument: 263-byte header
    view.setUint32(off, 263, true); off += 4; // instrument size
    for (let j = 0; j < 22; j++) buf[off++] = j < name.length ? name.charCodeAt(j) : 0;
    buf[off++] = 0;                            // type
    view.setUint16(off, 1, true); off += 2;   // num samples = 1
    view.setUint32(off, 40, true); off += 4;  // sample header size

    // Note-to-sample map: 96 bytes, all → sample index 0
    for (let j = 0; j < 96; j++) buf[off++] = 0;

    // Volume envelope: 24 × uint16 pairs (all zero = no envelope)
    for (let j = 0; j < 48; j++) buf[off++] = 0;

    // Panning envelope: 24 × uint16 pairs
    for (let j = 0; j < 48; j++) buf[off++] = 0;

    // Per-spec bytes (offsets 225-240 within instrument):
    // numVolEnvPts, numPanEnvPts, volSustain, volLoopStart, volLoopEnd,
    // panSustain, panLoopStart, panLoopEnd, volFlags, panFlags,
    // vibType, vibSweep, vibDepth, vibRate (14 bytes)
    for (let j = 0; j < 14; j++) buf[off++] = 0;

    view.setUint16(off, 0, true); off += 2; // volFadeout

    // Reserved: 22 bytes  (29 + 4+96+48+48+14+2+22 = 263 ✓)
    for (let j = 0; j < 22; j++) buf[off++] = 0;

    // ── Sample header (40 bytes) ─────────────────────────────────────
    view.setUint32(off, smp.deltaBytes.length, true); off += 4; // sample length
    view.setUint32(off, smp.loopStart, true);          off += 4; // loop start (bytes)
    view.setUint32(off, smp.loopLength, true);         off += 4; // loop length (0=no loop)
    buf[off++] = smp.volume;
    buf[off++] = smp.finetune;
    buf[off++] = smp.loopLength > 0 ? 1 : 0; // type: bit0-1=loop(0=no,1=fwd), bit4=16-bit
    buf[off++] = smp.panning;
    buf[off++] = smp.relNote & 0xFF;          // relative note (signed as uint8)
    buf[off++] = 0;                            // reserved
    const sName = smp.name.substring(0, 22);
    for (let j = 0; j < 22; j++) buf[off++] = j < sName.length ? sName.charCodeAt(j) : 0;
    // total: 4+4+4+1+1+1+1+1+1+22 = 40 ✓

    // ── Sample PCM data (delta-encoded 8-bit) ────────────────────────
    buf.set(smp.deltaBytes, off); off += smp.deltaBytes.length;
  }

  writeFileSync(outPath, Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
  return warnings;
}

// ── Test cases ────────────────────────────────────────────────────────────

export interface TestCase {
  file:           string;
  format:         string;
  parserModule:   string;
  parseFn:        string;
  isAsync:        boolean;
  args?:          'buffer' | 'bytes';
  filename?:      string;
  /** 'mod' (default) = ProTracker export for Amiga formats.
   *  'xm'            = FastTracker 2 export for PC tracker formats. */
  exportAs?:      'mod' | 'xm';
  /** Override the default 0.90 envelope-correlation threshold for the audio check.
   *  Use when the reference renderer (openmpt123) diverges from our parser due to
   *  known format quirks (e.g. BWSB out-of-range channel handling in GDM files). */
  audioThreshold?: number;
}

export const TEST_CASES: TestCase[] = [
  { file: '45.okta',             format: 'Oktalyzer',        parserModule: '../src/lib/import/formats/OktalyzerParser',              parseFn: 'parseOktalyzerFile',              isAsync: false, args: 'buffer' },
  { file: 'analogue_vibes.jam',  format: 'JamCracker',       parserModule: '../src/lib/import/formats/JamCrackerParser',             parseFn: 'parseJamCrackerFile',             isAsync: true,  args: 'buffer' },
  { file: 'beast_busters.ims',   format: 'IMS',              parserModule: '../src/lib/import/formats/ImagesMusicSystemParser',      parseFn: 'parseImagesMusicSystemFile',      isAsync: false, args: 'buffer' },
  { file: 'anthrox.fc',          format: 'FutureComposer',   parserModule: '../src/lib/import/formats/FCParser',                    parseFn: 'parseFCFile',                     isAsync: false, args: 'buffer' },
  { file: 'antidust.bp3',        format: 'SoundMon',         parserModule: '../src/lib/import/formats/SoundMonParser',              parseFn: 'parseSoundMonFile',               isAsync: true,  args: 'buffer' },
  { file: 'aquarivs.bp',         format: 'SoundMon',         parserModule: '../src/lib/import/formats/SoundMonParser',              parseFn: 'parseSoundMonFile',               isAsync: true,  args: 'buffer' },
  { file: 'almighty.sa',         format: 'SonicArranger',    parserModule: '../src/lib/import/formats/SonicArrangerParser',         parseFn: 'parseSonicArrangerFile',          isAsync: true,  args: 'buffer' },
  { file: 'synth_corn.emod',     format: 'QuadraComposer',   parserModule: '../src/lib/import/formats/QuadraComposerParser',        parseFn: 'parseQuadraComposerFile',         isAsync: true,  args: 'buffer' },
  { file: 'fantasi8.is',         format: 'InStereo1',        parserModule: '../src/lib/import/formats/InStereo1Parser',             parseFn: 'parseInStereo1File',              isAsync: false, args: 'bytes'  },
  { file: 'stereo_feeling.is20', format: 'InStereo2',        parserModule: '../src/lib/import/formats/InStereo2Parser',             parseFn: 'parseInStereo2File',              isAsync: false, args: 'bytes'  },
  { file: 'anthrox_intro.dm2',   format: 'DeltaMusic2',      parserModule: '../src/lib/import/formats/DeltaMusic2Parser',           parseFn: 'parseDeltaMusic2File',            isAsync: false, args: 'bytes'  },
  { file: 'med.sadman',          format: 'MED',              parserModule: '../src/lib/import/formats/MEDParser',                   parseFn: 'parseMEDFile',                    isAsync: false, args: 'buffer' },
  { file: '5th_gear.hip',        format: 'JochenHippelST',   parserModule: '../src/lib/import/formats/JochenHippelSTParser',        parseFn: 'parseJochenHippelSTFile',         isAsync: false, args: 'buffer' },
  { file: 'aces_high.ahx',       format: 'AHX',              parserModule: '../src/lib/import/formats/HivelyParser',                parseFn: 'parseHivelyFile',                 isAsync: false, args: 'buffer' },
  { file: 'action_section.aon',  format: 'ArtOfNoise',       parserModule: '../src/lib/import/formats/ArtOfNoiseParser',            parseFn: 'parseArtOfNoiseFile',             isAsync: false, args: 'bytes'  },
  { file: 'adept.smod',          format: 'FC-SMOD',          parserModule: '../src/lib/import/formats/FCParser',                    parseFn: 'parseFCFile',                     isAsync: false, args: 'buffer' },
  { file: 'adreamoffish.prt',    format: 'PreTracker',       parserModule: '../src/lib/import/formats/PreTrackerParser',            parseFn: 'parsePreTrackerFile',             isAsync: true,  args: 'buffer' },
  { file: 'afterburner.dl',      format: 'DaveLowe',         parserModule: '../src/lib/import/formats/DaveLoweParser',              parseFn: 'parseDaveLoweFile',               isAsync: true,  args: 'buffer' },
  { file: 'afterburner2.jb',     format: 'JasonBrooke',      parserModule: '../src/lib/import/formats/JasonBrookeParser',           parseFn: 'parseJasonBrookeFile',            isAsync: false, args: 'buffer' },
  { file: 'airball.ps',          format: 'PaulShields',      parserModule: '../src/lib/import/formats/PaulShieldsParser',           parseFn: 'parsePaulShieldsFile',            isAsync: false, args: 'buffer' },
  { file: 'airballtest.sog',     format: 'JochenHippelST',   parserModule: '../src/lib/import/formats/JochenHippelSTParser',        parseFn: 'parseJochenHippelSTFile',         isAsync: false, args: 'buffer' },
  { file: 'amberstar.hip7',      format: 'JochenHippel7V',   parserModule: '../src/lib/import/formats/JochenHippel7VParser',        parseFn: 'parseJochenHippel7VFile',         isAsync: false, args: 'buffer' },
  { file: 'anarchy.sid1',        format: 'SidMon1',          parserModule: '../src/lib/import/formats/SidMon1Parser',               parseFn: 'parseSidMon1File',                isAsync: false, args: 'buffer' },
  { file: 'apb.dw',              format: 'DavidWhittaker',   parserModule: '../src/lib/import/formats/DavidWhittakerParser',        parseFn: 'parseDavidWhittakerFile',         isAsync: false, args: 'buffer' },
  { file: 'artura.bd',           format: 'BenDaglish',       parserModule: '../src/lib/import/formats/BenDaglishParser',            parseFn: 'parseBenDaglishFile',             isAsync: true,  args: 'buffer' },
  { file: 'axelf.mm4',           format: 'MusicMaker4V',     parserModule: '../src/lib/import/formats/MusicMakerParser',            parseFn: 'parseMusicMaker4VFile',           isAsync: false, args: 'buffer' },
  { file: 'balrog.dln',          format: 'DaveLoweNew',      parserModule: '../src/lib/import/formats/DaveLoweNewParser',           parseFn: 'parseDaveLoweNewFile',            isAsync: false, args: 'buffer' },
  { file: 'baseheads.ma',        format: 'MusicAssembler',   parserModule: '../src/lib/import/formats/MusicAssemblerParser',        parseFn: 'parseMusicAssemblerFile',         isAsync: false, args: 'bytes'  },
  { file: 'batmanreturns.dsr',   format: 'Desire',           parserModule: '../src/lib/import/formats/DesireParser',                parseFn: 'parseDesireFile',                 isAsync: false, args: 'buffer' },
  { file: 'batmanthemovie.doda', format: 'SpecialFX',        parserModule: '../src/lib/import/formats/SpecialFXParser',             parseFn: 'parseSpecialFXFile',              isAsync: false, args: 'buffer' },
  { file: 'battlecommand.jd',    format: 'SpecialFX',        parserModule: '../src/lib/import/formats/SpecialFXParser',             parseFn: 'parseSpecialFXFile',              isAsync: false, args: 'buffer' },
  { file: 'battleships.rho',     format: 'RobHubbardST',     parserModule: '../src/lib/import/formats/RobHubbardSTParser',          parseFn: 'parseRobHubbardSTFile',           isAsync: false, args: 'buffer' },
  { file: 'blacklamp.gray',      format: 'FredGray',         parserModule: '../src/lib/import/formats/FredGrayParser',              parseFn: 'parseFredGrayFile',               isAsync: false, args: 'buffer' },
  { file: 'bombjack.jmf',        format: 'JankoMrsicFlogel', parserModule: '../src/lib/import/formats/JankoMrsicFlogelParser',      parseFn: 'parseJankoMrsicFlogelFile',       isAsync: false, args: 'buffer' },
  { file: 'bruno_time.sid2',     format: 'SidMon2',          parserModule: '../src/lib/import/formats/SidMon2Parser',               parseFn: 'parseSidMon2File',                isAsync: true,  args: 'buffer' },
  { file: 'cannonfodder.tcb',    format: 'TCBTracker',       parserModule: '../src/lib/import/formats/TCBTrackerParser',            parseFn: 'parseTCBTrackerFile',             isAsync: true,  args: 'buffer' },
  { file: 'captain_planet.mmdc', format: 'MMDC',             parserModule: '../src/lib/import/formats/MMDCParser',                  parseFn: 'parseMMDCFile',                   isAsync: false, args: 'buffer' },
  { file: 'chubbygristle.bds',   format: 'BenDaglishSID',    parserModule: '../src/lib/import/formats/BenDaglishSIDParser',         parseFn: 'parseBenDaglishSIDFile',          isAsync: true,  args: 'buffer' },
  { file: 'cockwise.mug',        format: 'DigitalMugician',  parserModule: '../src/lib/import/formats/DigitalMugicianParser',       parseFn: 'parseDigitalMugicianFile',        isAsync: true,  args: 'buffer' },
  { file: 'commando.mc',         format: 'MarkCooksey',      parserModule: '../src/lib/import/formats/MarkCookseyParser',           parseFn: 'parseMarkCookseyFile',            isAsync: true,  args: 'buffer' },
  { file: 'count_duckula.scr',   format: 'SeanConran',       parserModule: '../src/lib/import/formats/SeanConranParser',            parseFn: 'parseSeanConranFile',             isAsync: true,  args: 'buffer' },
  { file: 'crockett8.mm8',       format: 'MusicMaker8V',     parserModule: '../src/lib/import/formats/MusicMakerParser',            parseFn: 'parseMusicMaker8VFile',           isAsync: false, args: 'buffer' },
  { file: 'crusaders1.dm',       format: 'DeltaMusic1',      parserModule: '../src/lib/import/formats/DeltaMusic1Parser',           parseFn: 'parseDeltaMusic1File',            isAsync: true,  args: 'buffer' },
  { file: 'doofus.sm',           format: 'SoundMaster',      parserModule: '../src/lib/import/formats/SoundMasterParser',           parseFn: 'parseSoundMasterFile',            isAsync: true,  args: 'buffer' },
  { file: 'doxtro3.dss',         format: 'DigSoundStudio',   parserModule: '../src/lib/import/formats/DigitalSoundStudioParser',    parseFn: 'parseDigitalSoundStudioFile',     isAsync: false, args: 'bytes'  },
  { file: 'dragonsbreath.dsc',   format: 'DigSonixChrome',   parserModule: '../src/lib/import/formats/DigitalSonixChromeParser',    parseFn: 'parseDscFile',                    isAsync: false, args: 'buffer' },
  { file: 'dynablaster.ast',     format: 'Actionamics',      parserModule: '../src/lib/import/formats/ActionamicsParser',           parseFn: 'parseActionamicsFile',            isAsync: false, args: 'bytes'  },
  { file: 'fashionating1.ex',    format: 'FashionTracker',   parserModule: '../src/lib/import/formats/FashionTrackerParser',        parseFn: 'parseFashionTrackerFile',         isAsync: false, args: 'buffer' },
  { file: 'fiendish_freddys.kh', format: 'KrisHatleLid',     parserModule: '../src/lib/import/formats/KrisHatlelidParser',          parseFn: 'parseKrisHatlelidFile',           isAsync: false, args: 'buffer' },
  { file: 'flight.dmu',          format: 'DigitalMugician',  parserModule: '../src/lib/import/formats/DigitalMugicianParser',       parseFn: 'parseDigitalMugicianFile',        isAsync: true,  args: 'buffer' },
  { file: 'flimbos_quest.sqt',   format: 'Quartet',          parserModule: '../src/lib/import/formats/QuartetParser',               parseFn: 'parseQuartetFile',                isAsync: true,  args: 'buffer' },
  { file: 'flood.glue',          format: 'GlueMon',          parserModule: '../src/lib/import/formats/GlueMonParser',               parseFn: 'parseGlueMonFile',                isAsync: false, args: 'buffer' },
  { file: 'hybris.fp',           format: 'FuturePlayer',     parserModule: '../src/lib/import/formats/FuturePlayerParser',          parseFn: 'parseFuturePlayerFile',           isAsync: false, args: 'buffer' },
  { file: 'inconvenient.sg',     format: 'TomyTracker',      parserModule: '../src/lib/import/formats/TomyTrackerParser',           parseFn: 'parseTomyTrackerFile',            isAsync: false, args: 'buffer' },
  { file: 'mco.aquestion',       format: 'MarkCooksey',      parserModule: '../src/lib/import/formats/MarkCookseyParser',           parseFn: 'parseMarkCookseyFile',            isAsync: true,  args: 'buffer' },
  { file: 'offroad.jpo',         format: 'SteveTurner',      parserModule: '../src/lib/import/formats/SteveTurnerParser',           parseFn: 'parseSteveTurnerFile',            isAsync: false, args: 'buffer' },
  { file: 'prehistoric_tale.hipc', format: 'HippelCoSo',     parserModule: '../src/lib/import/formats/HippelCoSoParser',            parseFn: 'parseHippelCoSoFile',             isAsync: true,  args: 'buffer' },
  { file: 'primemover.hot',      format: 'Anders0land',      parserModule: '../src/lib/import/formats/Anders0landParser',           parseFn: 'parseAnders0landFile',            isAsync: true,  args: 'buffer', filename: 'hot.primemover' },
  { file: 'punisher.psa',        format: 'PSA',              parserModule: '../src/lib/import/formats/PSAParser',                   parseFn: 'parsePSAFile',                    isAsync: false, args: 'buffer' },
  { file: 'rick_dangerous.core', format: 'CoreDesign',       parserModule: '../src/lib/import/formats/CoreDesignParser',            parseFn: 'parseCoreDesignFile',             isAsync: false, args: 'buffer' },
  { file: 'sanxion.rh',          format: 'RobHubbard',       parserModule: '../src/lib/import/formats/RobHubbardParser',            parseFn: 'parseRobHubbardFile',             isAsync: true,  args: 'buffer' },
  { file: 'sjs.awesome',         format: 'SoundPlayer',      parserModule: '../src/lib/import/formats/SoundPlayerParser',           parseFn: 'parseSoundPlayerFile',            isAsync: false, args: 'buffer' },
  { file: 'snickle.mug2',        format: 'DigitalMugician2', parserModule: '../src/lib/import/formats/DigitalMugicianParser',       parseFn: 'parseDigitalMugicianFile',        isAsync: true,  args: 'buffer' },
  { file: 'tearaway.dh',         format: 'DavidHanney',      parserModule: '../src/lib/import/formats/DavidHanneyParser',           parseFn: 'parseDavidHanneyFile',            isAsync: false, args: 'buffer' },
  { file: 'tusker_ingame.jt',    format: 'JeroenTel',        parserModule: '../src/lib/import/formats/JeroenTelParser',             parseFn: 'parseJeroenTelFile',              isAsync: true,  args: 'buffer' },
  { file: 'wicked.wb',           format: 'WallyBeben',       parserModule: '../src/lib/import/formats/WallyBebenParser',            parseFn: 'parseWallyBebenFile',             isAsync: false, args: 'buffer' },
  { file: 'artificial_dreams.sb', format: 'SteveBarrett',   parserModule: '../src/lib/import/formats/SteveBarrettParser',          parseFn: 'parseSteveBarrettFile',           isAsync: false, args: 'buffer' },
  { file: 'funky nightmare.mmd1',              format: 'MED',            parserModule: '../src/lib/import/formats/MEDParser',                parseFn: 'parseMEDFile',                  isAsync: false, args: 'buffer' },
  { file: 'bounty hunter - outro (remixed).mmd3', format: 'MED',        parserModule: '../src/lib/import/formats/MEDParser',                parseFn: 'parseMEDFile',                  isAsync: false, args: 'buffer' },
  { file: 'universal monsters - dracula.mmd0', format: 'MED',           parserModule: '../src/lib/import/formats/MEDParser',                parseFn: 'parseMEDFile',                  isAsync: false, args: 'buffer' },
  { file: 'hexplosion.hvl',                    format: 'Hively',         parserModule: '../src/lib/import/formats/HivelyParser',             parseFn: 'parseHivelyFile',               isAsync: false, args: 'buffer' },
  { file: 'invisibility.dbm',                  format: 'DigiBoosterPro', parserModule: '../src/lib/import/formats/DigiBoosterParser',        parseFn: 'parseDigiBoosterFile',          isAsync: false, args: 'buffer' },
  { file: 'mco.overlander',                    format: 'MarkCooksey',    parserModule: '../src/lib/import/formats/MarkCookseyParser',        parseFn: 'parseMarkCookseyFile',          isAsync: true,  args: 'buffer' },
  { file: 'kris.hatlelid-songplay',            format: 'KrisHatlelid',   parserModule: '../src/lib/import/formats/KRISParser',               parseFn: 'parseKRISFile',                 isAsync: true,  args: 'buffer' },
  { file: 'lollypop-subgame 01.jo',            format: 'JesperOlsen',    parserModule: '../src/lib/import/formats/JesperOlsenParser',        parseFn: 'parseJesperOlsenFile',          isAsync: false, args: 'buffer' },
  // 'the viking child crack.cm' is a compiled 68k binary, not a text-based Custom Made module
  { file: 'rush.ml',                           format: 'MusicLine',      parserModule: '../src/lib/import/formats/MusicLineParser',          parseFn: 'parseMusicLineFile',            isAsync: false, args: 'bytes'  },
  // PC tracker formats → XM
  // (audioThreshold 0.45 for GDM: BWSB out-of-range channel data causes render mismatch vs OpenMPT)
  { file: 'tilbury fair (remix).gdm',          format: 'GDM',            parserModule: '../src/lib/import/formats/GDMParser',                parseFn: 'parseGDMFile',                  isAsync: true,  args: 'buffer', audioThreshold: 0.45, exportAs: 'xm' },
  { file: 'fonetag.669',                       format: '669',            parserModule: '../src/lib/import/formats/Format669Parser',          parseFn: 'parse669File',                  isAsync: true,  args: 'buffer', exportAs: 'xm' },
  { file: 'andante.s3m',                       format: 'S3M',            parserModule: '../src/lib/import/formats/S3MParser',                parseFn: 'parseS3MFile',                  isAsync: false, args: 'buffer', exportAs: 'xm' },
  { file: 'nightmare on acid.s3m',             format: 'S3M',            parserModule: '../src/lib/import/formats/S3MParser',                parseFn: 'parseS3MFile',                  isAsync: false, args: 'buffer', exportAs: 'xm' },
  { file: 'flo boarding - level 1.xm',         format: 'XM',             parserModule: '../src/lib/import/formats/XMParser',                 parseFn: 'parseXMFile',                   isAsync: true,  args: 'buffer', exportAs: 'xm' },
  { file: 'absm chain mod.it',                 format: 'IT',             parserModule: '../src/lib/import/formats/ITParser',                  parseFn: 'parseITFile',                   isAsync: false, args: 'buffer', exportAs: 'xm' },
  { file: 'anonymous in 4ce.mtm',              format: 'MTM',            parserModule: '../src/lib/import/formats/MTMParser',                parseFn: 'parseMTMFile',                  isAsync: true,  args: 'buffer', exportAs: 'xm' },
  { file: 'm31.far',                           format: 'FAR',            parserModule: '../src/lib/import/formats/FARParser',                parseFn: 'parseFARFile',                  isAsync: true,  args: 'buffer', exportAs: 'xm' },
  { file: 'seasons.ult',                       format: 'ULT',            parserModule: '../src/lib/import/formats/ULTParser',                parseFn: 'parseULTFile',                  isAsync: true,  args: 'buffer', exportAs: 'xm' },
  { file: 'Silver-Song0.psm',                  format: 'PSM',            parserModule: '../src/lib/import/formats/PSMParser',                parseFn: 'parsePSMFile',                  isAsync: false, args: 'bytes',  exportAs: 'xm' },
  { file: 'slideshow i.stm',                   format: 'STM',            parserModule: '../src/lib/import/formats/STMParser',                parseFn: 'parseSTMFile',                  isAsync: true,  args: 'buffer', exportAs: 'xm' },
  // Amiga MOD → ProTracker
  { file: 'a sleep so deep.mod',               format: 'MOD',            parserModule: '../src/lib/import/formats/MODParser',                parseFn: 'parseMODFile',                  isAsync: true,  args: 'buffer' },
];

// ── Main (only when run directly) ─────────────────────────────────────────

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('export-songs-openmpt.ts') ||
  process.argv[1]?.endsWith('export-songs-openmpt.js');

if (isMain) {
  const cliArgs = process.argv.slice(2);
  const filter  = cliArgs[0];
  const cases   = filter
    ? TEST_CASES.filter(tc => tc.file.includes(filter) || tc.format.toLowerCase().includes(filter.toLowerCase()))
    : TEST_CASES;

  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\nExport (Amiga → MOD, PC → XM) — ${cases.length} format(s)`);
  console.log('='.repeat(72));
  console.log(`Source : ${TEST_DIR}`);
  console.log(`Output : ${OUT_DIR}`);
  console.log();

  let exported = 0, skipped = 0, errors = 0;

  for (const tc of cases) {
    const filePath = join(TEST_DIR, tc.file);
    if (!existsSync(filePath)) {
      console.log(`  SKIP  ${tc.file} (not found)`);
      skipped++;
      continue;
    }

    // Parse source format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let song: any;
    try {
      const mod       = await import(tc.parserModule);
      const parseFnFn = mod[tc.parseFn];
      if (!parseFnFn) throw new Error(`No export '${tc.parseFn}'`);
      const fileData  = readFileSync(filePath);
      const buffer    = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer;
      const arg       = tc.args === 'bytes' ? new Uint8Array(buffer) : buffer;
      const name      = tc.filename ?? tc.file;
      song            = tc.isAsync ? await parseFnFn(arg, name) : parseFnFn(arg, name);
      if (!song) throw new Error('Parser returned null');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ERROR ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} parse: ${msg.substring(0, 80)}`);
      errors++;
      continue;
    }

    // Skip UADE-backed formats with no pattern data
    const hasNotes = (song.patterns ?? []).some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pat: any) => (pat.channels ?? []).some((ch: any) => (ch.rows ?? []).some((row: any) => row.note > 0))
    );
    if (!hasNotes) {
      console.log(`  SKIP  ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} (no pattern data)`);
      skipped++;
      continue;
    }

    // Bake synthesized instruments to looping PCM waveforms
    bakeHivelyInstruments(song);       // AHX/HVL: full macro + noise + filter
    bakeSidMon1Instruments(song);      // SidMon1: extracted 32-byte mainWave
    bakeGenericSynthInstruments(song); // all others: sawtooth fallback

    const stem    = basename(tc.file).replace(/\.[^.]+$/, '').replace(/[^a-z0-9_\-. ]/gi, '_');
    // MOD supports max 4 channels; songs with more must export to XM
    const numCh   = song.numChannels ?? (song.patterns?.[0]?.channels?.length ?? 4);
    const useXM   = tc.exportAs === 'xm' || numCh > 4;
    const outName = stem + (useXM ? '.xm' : '.mod');
    const outPath = join(OUT_DIR, outName);

    try {
      const warnings = useXM ? exportSongToXM(song, outPath) : exportSongToMOD(song, outPath);
      const warnStr  = warnings.length > 0 ? ` (${warnings.length} warnings)` : '';
      const size     = (existsSync(outPath) ? readFileSync(outPath).length : 0);
      console.log(`  OK    ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} → ${outName} [${size} bytes]${warnStr}`);
      exported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ERROR ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} export: ${msg.substring(0, 80)}`);
      errors++;
    }
  }

  console.log(`\nDone: ${exported} exported, ${skipped} skipped, ${errors} errors`);
}
