/**
 * modExport.ts — Export TrackerSong as ProTracker MOD format
 *
 * Produces a valid ProTracker (or compatible) MOD binary from any TrackerSong
 * whose patterns are in XM-compatible note/effect encoding.
 *
 * OctaMED, JamCracker AM, and SonicArranger synth instruments are baked to PCM on export.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types/instrument';
// SynthBaker is imported dynamically to avoid pulling in Tone.js in headless/Node.js contexts
import { extractFC13Wave } from '@/lib/import/formats/FCParser';

// SoundMon built-in waveforms (16 shapes, 64 samples each)
// Mirrors BUILTIN_WAVES[] from soundmon-wasm/src/soundmon_synth.c exactly.
const SM_BUILTIN_WAVES: Int8Array[] = [
  /* 0: Sawtooth */
  new Int8Array([ 127,123,119,115,111,107,103,99,95,91,87,83,79,75,71,67,
    63,59,55,51,47,43,39,35,31,27,23,19,15,11,7,3,
    -1,-5,-9,-13,-17,-21,-25,-29,-33,-37,-41,-45,-49,-53,-57,-61,
    -65,-69,-73,-77,-81,-85,-89,-93,-97,-101,-105,-109,-113,-117,-121,-125 ]),
  /* 1: Square */
  new Int8Array([ 127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128 ]),
  /* 2: Triangle */
  new Int8Array([ 0,8,16,24,32,40,48,56,64,72,80,88,96,104,112,120,
    127,120,112,104,96,88,80,72,64,56,48,40,32,24,16,8,
    0,-8,-16,-24,-32,-40,-48,-56,-64,-72,-80,-88,-96,-104,-112,-120,
    -128,-120,-112,-104,-96,-88,-80,-72,-64,-56,-48,-40,-32,-24,-16,-8 ]),
  /* 3: Sine */
  new Int8Array([ 0,12,25,37,49,60,71,81,90,98,106,112,117,122,125,127,
    127,125,122,117,112,106,98,90,81,71,60,49,37,25,12,0,
    -12,-25,-37,-49,-60,-71,-81,-90,-98,-106,-112,-117,-122,-125,-127,-127,
    -127,-125,-122,-117,-112,-106,-98,-90,-81,-71,-60,-49,-37,-25,-12,-1 ]),
  /* 4: Noise */
  new Int8Array([ 45,-67,23,112,-89,34,-12,78,-56,91,-23,67,-44,99,-78,55,
    -33,88,-11,102,-44,77,-22,66,-88,33,-77,22,-99,44,-55,88,
    -66,11,-102,44,-77,22,-66,88,-33,77,-22,99,-44,55,-88,33,
    66,-11,102,-44,77,-22,66,-88,33,-77,22,-99,44,-55,88,-66 ]),
  /* 5: Pulse 25% */
  new Int8Array([ 127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128 ]),
  /* 6: Pulse 75% */
  new Int8Array([ 127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128 ]),
  /* 7: Ramp up */
  new Int8Array([ -128,-124,-120,-116,-112,-108,-104,-100,-96,-92,-88,-84,-80,-76,-72,-68,
    -64,-60,-56,-52,-48,-44,-40,-36,-32,-28,-24,-20,-16,-12,-8,-4,
    0,4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,
    64,68,72,76,80,84,88,92,96,100,104,108,112,116,120,124 ]),
  /* 8: Soft sine */
  new Int8Array([ 0,6,12,19,25,31,37,43,48,53,58,63,67,71,74,77,
    79,80,80,79,77,74,71,67,63,58,53,48,43,37,31,25,
    19,12,6,0,-6,-12,-19,-25,-31,-37,-43,-48,-53,-58,-63,-67,
    -71,-74,-77,-79,-80,-80,-79,-77,-74,-71,-67,-63,-58,-53,-48,-43 ]),
  /* 9: Double saw */
  new Int8Array([ 127,115,103,91,79,67,55,43,31,19,7,-5,-17,-29,-41,-53,
    -65,-77,-89,-101,-113,-125,-125,-113,-101,-89,-77,-65,-53,-41,-29,-17,
    -5,7,19,31,43,55,67,79,91,103,115,127,115,103,91,79,
    67,55,43,31,19,7,-5,-17,-29,-41,-53,-65,-77,-89,-101,-113 ]),
  /* 10: Organ */
  new Int8Array([ 0,20,38,54,67,76,81,82,79,72,62,49,33,16,-1,-18,
    -35,-50,-62,-71,-77,-79,-77,-71,-62,-50,-35,-18,-1,16,33,49,
    62,72,79,82,81,76,67,54,38,20,0,-20,-38,-54,-67,-76,
    -81,-82,-79,-72,-62,-49,-33,-16,1,18,35,50,62,71,77,79 ]),
  /* 11: Clavinet */
  new Int8Array([ 127,90,63,44,31,22,15,11,7,5,3,2,1,1,0,0,
    0,-1,-1,-2,-3,-5,-7,-11,-15,-22,-31,-44,-63,-90,-127,-90,
    -63,-44,-31,-22,-15,-11,-7,-5,-3,-2,-1,-1,0,0,0,1,
    1,2,3,5,7,11,15,22,31,44,63,90,127,90,63,44 ]),
  /* 12: Wobble */
  new Int8Array([ 64,68,72,76,80,84,88,92,96,100,104,108,112,116,120,124,
    -128,-114,-100,-86,-72,-58,-44,-30,-16,-2,12,26,40,54,68,82,
    96,82,68,54,40,26,12,-2,-16,-30,-44,-58,-72,-86,-100,-114,
    -128,124,120,116,112,108,104,100,96,92,88,84,80,76,72,68 ]),
  /* 13: Buzzy */
  new Int8Array([ 0,48,80,96,80,48,0,-48,-80,-96,-80,-48,0,48,80,96,
    80,48,0,-48,-80,-96,-80,-48,0,48,80,96,80,48,0,-48,
    -80,-96,-80,-48,0,48,80,96,80,48,0,-48,-80,-96,-80,-48,
    0,48,80,96,80,48,0,-48,-80,-96,-80,-48,0,48,80,96 ]),
  /* 14: Reed */
  new Int8Array([ 0,25,49,70,86,96,99,94,82,63,38,10,-20,-49,-73,-90,
    -99,-99,-90,-73,-49,-20,10,38,63,82,94,99,96,86,70,49,
    25,0,-25,-49,-70,-86,-96,-99,-94,-82,-63,-38,-10,20,49,73,
    90,99,99,90,73,49,20,-10,-38,-63,-82,-94,-99,-96,-86,-70 ]),
  /* 15: Pluck */
  new Int8Array([ 127,108,91,76,64,53,44,36,29,23,18,14,10,7,5,3,
    1,0,-2,-3,-5,-7,-10,-14,-18,-23,-29,-36,-44,-53,-64,-76,
    -91,-76,-64,-53,-44,-36,-29,-23,-18,-14,-10,-7,-5,-3,-1,0,
    2,3,5,7,10,14,18,23,29,36,44,53,64,76,91,108 ]),
];

// ── ProTracker period table ────────────────────────────────────────────────
// XM note 13 = Amiga C-1 (period 856), index 0 in this table.
// Amiga parsers (amigaNoteToXM, periodToNote) now output note 13 for C-1.
// ProTracker standard 3 octaves: C-1(856)..B-3(113) = indices 0..35.
// Extended range continues to C-4(56) = index 47.
const PT_PERIODS = [
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453, // C-1..B-1
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226, // C-2..B-2
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113, // C-3..B-3
   107,  101,   95,   90,   85,   80,   75,   71,   67,   63,   60,   56, // C-4..B-4 (extended)
] as const;

// note 13 = Amiga C-1 = PT period 856 (index 0 in PT_PERIODS)
function noteToPeriod(xmNote: number): number {
  if (xmNote === 0 || xmNote === 97) return 0; // empty or note-off
  const idx = xmNote - 13;
  if (idx < 0 || idx >= PT_PERIODS.length) return 0;
  return PT_PERIODS[idx];
}

// Extract 8-bit signed PCM from a 16-bit LE WAV ArrayBuffer
function extractPCM8FromWAV(audioBuffer: ArrayBuffer): Int8Array {
  const view = new DataView(audioBuffer);
  const dataLen = view.getUint32(40, true); // little-endian
  const frames = Math.floor(dataLen / 2);   // 16-bit → frames
  const result = new Int8Array(frames);
  for (let i = 0; i < frames; i++) {
    const s16 = view.getInt16(44 + i * 2, true);
    result[i] = s16 >> 8; // keep high byte (8-bit signed)
  }
  return result;
}

// Linear-interpolation resampler: produce newLength 8-bit signed samples from src
function resamplePCM8(src: Int8Array, newLength: number): Int8Array {
  if (newLength <= 0) return new Int8Array(2);
  if (newLength === src.length) return src;
  const dst = new Int8Array(newLength);
  const ratio = (src.length - 1) / Math.max(1, newLength - 1);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, src.length - 1);
    const frac = pos - lo;
    dst[i] = Math.round(src[lo] * (1 - frac) + src[hi] * frac);
  }
  return dst;
}

// Convert an AudioBuffer (Float32, mono or stereo) to 8-bit signed PCM
function audioBufferToPCM8(ab: AudioBuffer): Int8Array {
  const ch0 = ab.getChannelData(0);
  const ch1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : null;
  const out = new Int8Array(ch0.length);
  for (let i = 0; i < ch0.length; i++) {
    const mono = ch1 !== null ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
    out[i] = Math.round(Math.max(-1, Math.min(1, mono)) * 127);
  }
  return out;
}

// Wrap Int8Array PCM in a minimal 16-bit WAV for round-trip through extractPCM8FromWAV
function makePCM8WAV(pcm8: Int8Array, sampleRate: number): ArrayBuffer {
  const dataSize = pcm8.length * 2; // upscale to 16-bit for storage
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 36 + dataSize, true);
  out.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  out.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);  // PCM
  view.setUint16(22, 1, true);  // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  out.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < pcm8.length; i++) {
    view.setInt16(44 + i * 2, pcm8[i] * 256, true);
  }
  return buf;
}

// Map DEViLBOX/XM effTyp+eff → [modCmd, modParam]
// DEViLBOX effTyp 0x00-0x0F are identical to ProTracker effect codes.
// Effects > 0x0F are XM-only (G, H, K, L, ...) — silently dropped.
function mapEffect(effTyp: number, eff: number): [number, number] {
  if (effTyp > 0x0F) return [0, 0];

  let cmd = effTyp;
  let param = eff;

  if (cmd === 0x0C) {
    // Set volume: clamp to 64 (MOD max volume)
    param = Math.min(0x40, param);
  }

  return [cmd, param];
}

/**
 * Merge XM volume-column byte into (effTyp, eff) if the effect slot is empty.
 * Returns updated [effTyp, eff] pair.
 *
 * XM volume column encoding:
 *   0x00       — none
 *   0x10-0x50  — set volume (v = byte-0x10, range 0-64) → MOD Cxx
 *   0x60-0x6F  — vol slide down by nibble               → MOD A0y
 *   0x70-0x7F  — vol slide up by nibble                 → MOD Ax0
 *   0xF0-0xFF  — tone portamento (speed = nibble)        → MOD 3xx
 */
function mergeVolumeColumn(
  volCol: number,
  effTyp: number,
  eff: number,
): [number, number] {
  // Only fill in the effect if the cell has no existing effect
  if (effTyp !== 0 || eff !== 0 || volCol === 0) return [effTyp, eff];

  if (volCol >= 0x10 && volCol <= 0x50) {
    return [0x0C, volCol - 0x10];           // set volume → Cxx
  }
  if (volCol >= 0x60 && volCol <= 0x6F) {
    const n = volCol & 0x0F;
    if (n > 0) return [0x0A, n];            // slide down by n → A0n
  }
  if (volCol >= 0x70 && volCol <= 0x7F) {
    const n = volCol & 0x0F;
    if (n > 0) return [0x0A, n << 4];       // slide up by n → An0
  }
  if (volCol >= 0xF0 && volCol <= 0xFF) {
    const n = volCol & 0x0F;
    if (n > 0) return [0x03, n];            // tone portamento → 3xx
  }

  return [effTyp, eff];
}

// ── Public types ──────────────────────────────────────────────────────────

export interface MODExportOptions {
  bakeSynths?: boolean;
}

export interface MODExportResult {
  blob: Blob;
  filename: string;
  warnings: string[];
  instrumentCount: number;
  patternCount: number;
  orderCount: number;
}

// ── Synth baking ──────────────────────────────────────────────────────────

/**
 * Returns a copy of the song with all known synth instruments replaced by
 * PCM samples ready for MOD export.
 *
 * Handled directly (waveform bytes extracted from config, no audio rendering needed):
 *   OctaMED synths    — uses waveforms[0] as a looping sample
 *   JamCracker AM     — uses waveformData (64 bytes) as a looping sample
 *   SonicArranger     — uses waveformData (128 values) as a looping sample
 *
 * Other synth types: attempt SynthBaker (OfflineAudioContext). Falls back silently
 * if the synth relies on AudioWorklets (which cannot render offline).
 */
export async function bakeAllSynthInstruments(song: TrackerSong): Promise<TrackerSong> {
  const updatedInstruments: InstrumentConfig[] = [...song.instruments];

  for (let i = 0; i < updatedInstruments.length; i++) {
    const inst = updatedInstruments[i];
    if (!inst) continue;

    if (inst.synthType === 'OctaMEDSynth') {
      const oct = inst.octamed;
      if (!oct?.waveforms?.length) continue;

      // Use the first waveform as the MOD sample; loop the whole thing so the
      // note sustains exactly as the OctaMED synth would (cycling the waveform).
      const wf0 = oct.waveforms[0];
      if (!wf0 || wf0.length === 0) continue;

      const pcm8 = new Int8Array(wf0); // already 8-bit signed
      // Amiga standard C-3 sample rate (PAL: 8287 Hz)
      const wavBuf = makePCM8WAV(pcm8, 8287);

      updatedInstruments[i] = {
        ...inst,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        sample: {
          audioBuffer: wavBuf,
          url: '',
          baseNote: 'C3',
          detune: 0,
          loop: true,
          loopType: 'forward' as const,
          loopStart: 0,
          loopEnd: pcm8.length,
          sampleRate: 8287,
          reverse: false,
          playbackRate: 1.0,
        },
        metadata: {
          ...inst.metadata,
          modPlayback: {
            usePeriodPlayback: true,
            periodMultiplier: 3546895,
            finetune: 0,
            defaultVolume: oct.volume,
          },
        },
      } as InstrumentConfig;

    } else if (inst.synthType === 'JamCrackerSynth') {
      // JamCracker AM synths store their 64-byte waveform directly in config.
      // Use it as a looping MOD sample (the AM synthesis loops this waveform).
      const jc = inst.jamCracker;
      if (!jc?.isAM || !jc.waveformData || jc.waveformData.length === 0) continue;

      const pcm8 = new Int8Array(jc.waveformData.buffer, jc.waveformData.byteOffset, jc.waveformData.byteLength);
      const wavBuf = makePCM8WAV(pcm8, 8287);
      updatedInstruments[i] = {
        ...inst,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        sample: {
          audioBuffer: wavBuf,
          url: '',
          baseNote: 'C3',
          detune: 0,
          loop: true,
          loopType: 'forward' as const,
          loopStart: 0,
          loopEnd: pcm8.length,
          sampleRate: 8287,
          reverse: false,
          playbackRate: 1.0,
        },
      } as InstrumentConfig;

    } else if (inst.synthType === 'SonicArrangerSynth') {
      // SonicArranger synths have a waveformData number[] (signed -128..+127).
      // Use the waveform as a looping MOD sample (the synth loops this).
      const sa = inst.sonicArranger;
      if (!sa?.waveformData || sa.waveformData.length === 0) continue;

      const waveLen = Math.min(128, sa.waveformData.length);
      const pcm8 = new Int8Array(waveLen);
      for (let j = 0; j < waveLen; j++) {
        pcm8[j] = Math.max(-128, Math.min(127, Math.round(sa.waveformData[j])));
      }
      const wavBuf = makePCM8WAV(pcm8, 8287);
      updatedInstruments[i] = {
        ...inst,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        sample: {
          audioBuffer: wavBuf,
          url: '',
          baseNote: 'C3',
          detune: 0,
          loop: true,
          loopType: 'forward' as const,
          loopStart: 0,
          loopEnd: waveLen,
          sampleRate: 8287,
          reverse: false,
          playbackRate: 1.0,
        },
      } as InstrumentConfig;

    } else if (inst.synthType === 'FCSynth') {
      // Future Composer instruments reference a built-in waveform by index (0-46).
      // extractFC13Wave() returns the raw waveform bytes as Uint8Array (unsigned 0-255).
      // Treat them as signed int8 (two's complement) for MOD PCM.
      const fc = inst.fc;
      const waveNum = fc?.waveNumber ?? 0;
      const rawWave = extractFC13Wave(waveNum);
      if (rawWave.length === 0) continue;

      const pcm8 = new Int8Array(rawWave.buffer, rawWave.byteOffset, rawWave.byteLength);
      const wavBuf = makePCM8WAV(pcm8, 8287);
      updatedInstruments[i] = {
        ...inst,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        sample: {
          audioBuffer: wavBuf,
          url: '',
          baseNote: 'C3',
          detune: 0,
          loop: true,
          loopType: 'forward' as const,
          loopStart: 0,
          loopEnd: pcm8.length,
          sampleRate: 8287,
          reverse: false,
          playbackRate: 1.0,
        },
      } as InstrumentConfig;

    } else if (inst.synthType === 'SoundMonSynth') {
      // SoundMon synth instruments reference one of 16 built-in oscillator waveforms
      // via waveType (0-15). These are the same 64-sample tables used in the WASM C module.
      const sm = inst.soundMon;
      const waveType = Math.max(0, Math.min(15, sm?.waveType ?? 0));
      const pcm8 = SM_BUILTIN_WAVES[waveType];
      if (!pcm8 || pcm8.length === 0) continue;

      const wavBuf = makePCM8WAV(pcm8, 8287);
      updatedInstruments[i] = {
        ...inst,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        sample: {
          audioBuffer: wavBuf,
          url: '',
          baseNote: 'C3',
          detune: 0,
          loop: true,
          loopType: 'forward' as const,
          loopStart: 0,
          loopEnd: pcm8.length,
          sampleRate: 8287,
          reverse: false,
          playbackRate: 1.0,
        },
      } as InstrumentConfig;

    } else if (inst.type === 'synth' && !inst.sample?.audioBuffer) {
      // Other synth types: try SynthBaker (dynamic import to avoid loading Tone.js in headless envs)
      const bpm = song.initialBPM || 125;
      const speed = song.initialSpeed || 6;
      const maxRows = Math.max(64, ...song.patterns.map(p => p.length));
      const rowsPerSec = (bpm * 24) / (speed * 60);
      const duration = Math.max(2.0, Math.min(4.0, maxRows / rowsPerSec));

      try {
        const { SynthBaker } = await import('@/lib/audio/SynthBaker');
        const audioBuffer = await SynthBaker.bakeToSample(inst, duration, 'C4');
        const pcm8 = audioBufferToPCM8(audioBuffer);
        const wavBuf = makePCM8WAV(pcm8, audioBuffer.sampleRate);

        updatedInstruments[i] = {
          ...inst,
          type: 'sample' as const,
          synthType: 'Sampler' as const,
          sample: {
            audioBuffer: wavBuf,
            url: '',
            baseNote: 'C3',
            detune: 0,
            loop: false,
            loopType: 'off' as const,
            loopStart: 0,
            loopEnd: pcm8.length,
            sampleRate: audioBuffer.sampleRate,
            reverse: false,
            playbackRate: 1.0,
          },
        } as InstrumentConfig;
      } catch (err) {
        console.warn(`[MODExport] Failed to bake instrument ${i + 1}:`, err);
      }
    }
  }

  return { ...song, instruments: updatedInstruments };
}

// ── Core MOD exporter ─────────────────────────────────────────────────────

export async function exportSongToMOD(
  song: TrackerSong,
  options: MODExportOptions = {},
): Promise<MODExportResult> {
  const warnings: string[] = [];

  let workSong = song;
  if (options.bakeSynths) {
    workSong = await bakeAllSynthInstruments(song);
  }

  const MAX_INSTRUMENTS = 31;
  const MAX_ORDERS = 128;
  const MAX_PATTERNS_MK = 64;  // M.K. limit (patterns 0-63)
  const MAX_PATTERNS = 128;    // M!K! limit
  const ROWS_PER_PATTERN = 64; // MOD always writes 64 rows per pattern
  const BYTES_PER_CELL = 4;

  // ── Instruments ──────────────────────────────────────────────────────────
  if (workSong.instruments.length > MAX_INSTRUMENTS) {
    warnings.push(
      `Song has ${workSong.instruments.length} instruments; only first ${MAX_INSTRUMENTS} included in MOD.`,
    );
  }
  const usedInstruments = workSong.instruments.slice(0, MAX_INSTRUMENTS);

  // Extract PCM (8-bit signed) from each instrument
  const pcmData: Int8Array[] = [];
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const inst = usedInstruments[i];
    if (inst?.sample?.audioBuffer) {
      try {
        pcmData.push(extractPCM8FromWAV(inst.sample.audioBuffer));
      } catch {
        warnings.push(`Instrument ${i + 1}: PCM extraction failed, using empty sample.`);
        pcmData.push(new Int8Array(0));
      }
    } else {
      pcmData.push(new Int8Array(0));
    }
  }

  // ── Order list ───────────────────────────────────────────────────────────
  const orders = workSong.songPositions.length > 0
    ? workSong.songPositions.slice(0, MAX_ORDERS)
    : [0];
  if (workSong.songPositions.length > MAX_ORDERS) {
    warnings.push(
      `Song has ${workSong.songPositions.length} orders; truncated to ${MAX_ORDERS}.`,
    );
  }

  // ── Pattern count ─────────────────────────────────────────────────────────
  const maxOrderedPattern = orders.reduce((m, p) => Math.max(m, p), 0);
  const patternCount = Math.min(maxOrderedPattern + 1, MAX_PATTERNS);
  if (maxOrderedPattern + 1 > MAX_PATTERNS) {
    warnings.push(
      `Song references patterns beyond index ${MAX_PATTERNS - 1}; those orders will play silence.`,
    );
  }

  // ── MOD magic (channel/pattern-count encoding) ────────────────────────────
  const nChannels = workSong.numChannels || 4;
  let magic: string;
  if (nChannels === 4) {
    magic = patternCount <= MAX_PATTERNS_MK ? 'M.K.' : 'M!K!';
  } else if (nChannels < 10) {
    magic = `${nChannels}CHN`;
  } else {
    magic = `${nChannels}CH`;
  }
  if (nChannels > 8) {
    warnings.push(
      `${nChannels}-channel MOD is non-standard; most players only support up to 8 channels.`,
    );
  }

  // ── Out-of-range note correction: pre-scan + resampled slot allocation ───────
  // For cells with notes below C-1 or above B-6 we create a resampled copy of
  // the instrument in a free slot so those specific cells can play at an
  // in-range note that produces the same output frequency.  Only the affected
  // cells are remapped; in-range cells keep using the original slot.
  const MOD_NOTE_MIN = 13; // C-1 (XM) — Amiga period 856, first ProTracker entry
  const MOD_NOTE_MAX = 60; // B-4 (XM) — last entry in extended PT_PERIODS table (period 56)
  // PT_PERIODS covers C-1..B-4 (XM notes 13-60, 48 entries).
  // Notes in C-4..B-4 (49-60) produce extended hardware periods (107-56) that play correctly
  // on Amiga hardware and in most trackers, but display as "???" in ProTracker 2.x.
  // Notes above B-4 (>60) have no valid Amiga hardware period → silence.

  type SlotEntry = { newSlot1: number; shift: number };
  const belowSlot: (SlotEntry | null)[] = new Array(MAX_INSTRUMENTS + 1).fill(null);
  const aboveSlot: (SlotEntry | null)[] = new Array(MAX_INSTRUMENTS + 1).fill(null);

  // Collect min/max out-of-range note per instrument across all patterns
  const instMinBelow: number[] = new Array(MAX_INSTRUMENTS + 1).fill(MOD_NOTE_MIN);
  const instMaxAbove: number[] = new Array(MAX_INSTRUMENTS + 1).fill(MOD_NOTE_MAX);

  for (let patIdx = 0; patIdx < patternCount; patIdx++) {
    const pat = workSong.patterns[patIdx];
    if (!pat) continue;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < nChannels; ch++) {
        const cell = pat.channels[ch]?.rows[row];
        const note = cell?.note ?? 0;
        const inst1 = cell?.instrument ?? 0;
        if (note > 0 && note < 97 && inst1 >= 1 && inst1 <= MAX_INSTRUMENTS) {
          if (note < MOD_NOTE_MIN) instMinBelow[inst1] = Math.min(instMinBelow[inst1], note);
          if (note > MOD_NOTE_MAX) instMaxAbove[inst1] = Math.max(instMaxAbove[inst1], note);
        }
      }
    }
  }

  // First free slot after the song's original instruments
  let nextSlot1 = Math.min(workSong.instruments.length, MAX_INSTRUMENTS) + 1;

  function allocResampledSlot(inst1: number, shift: number): SlotEntry | null {
    if (nextSlot1 > MAX_INSTRUMENTS) return null;
    const origPCM = pcmData[inst1 - 1];
    if (origPCM.length === 0) return null;
    const newSlot1 = nextSlot1++;
    // shift > 0 → notes move up → DMA runs faster → shorten the sample (ratio > 1 divides)
    const ratio = Math.pow(2, shift / 12);
    const newLen = Math.max(2, Math.round(origPCM.length / ratio));
    pcmData[newSlot1 - 1] = resamplePCM8(origPCM, newLen);
    const origInst = usedInstruments[inst1 - 1];
    if (origInst) {
      const loopScale = 1 / ratio;
      usedInstruments[newSlot1 - 1] = {
        ...origInst,
        name: `${(origInst.name ?? '').substring(0, 21)}~`,
        sample: origInst.sample
          ? {
              ...origInst.sample,
              loopStart: Math.round((origInst.sample.loopStart ?? 0) * loopScale),
              loopEnd: Math.round((origInst.sample.loopEnd ?? newLen * ratio) * loopScale),
            }
          : origInst.sample,
      } as InstrumentConfig;
    }
    return { newSlot1, shift };
  }

  for (let inst1 = 1; inst1 <= MAX_INSTRUMENTS; inst1++) {
    if (instMinBelow[inst1] < MOD_NOTE_MIN) {
      const shift = MOD_NOTE_MIN - instMinBelow[inst1]; // positive
      const entry = allocResampledSlot(inst1, shift);
      if (entry) {
        belowSlot[inst1] = entry;
        warnings.push(
          `Instrument ${inst1}: resampled +${shift} semitones into slot ${entry.newSlot1} for below-range notes.`,
        );
      } else {
        warnings.push(`Instrument ${inst1}: no free slot — below-range notes will be silenced.`);
      }
    }
    if (instMaxAbove[inst1] > MOD_NOTE_MAX) {
      const shift = MOD_NOTE_MAX - instMaxAbove[inst1]; // negative
      const entry = allocResampledSlot(inst1, shift);
      if (entry) {
        aboveSlot[inst1] = entry;
        warnings.push(
          `Instrument ${inst1}: resampled ${shift} semitones into slot ${entry.newSlot1} for above-range notes.`,
        );
      } else {
        warnings.push(`Instrument ${inst1}: no free slot — above-range notes will be silenced.`);
      }
    }
  }

  // ── Binary layout ─────────────────────────────────────────────────────────
  // Header: 20 + 31×30 + 1 + 1 + 128 + 4 = 1084 bytes (0x43C)
  const HEADER_SIZE = 20 + 31 * 30 + 1 + 1 + 128 + 4;
  const BYTES_PER_PATTERN = ROWS_PER_PATTERN * nChannels * BYTES_PER_CELL;
  const patternDataSize = patternCount * BYTES_PER_PATTERN;

  const MAX_SAMPLE_BYTES = 131070; // 65535 words × 2 bytes/word
  let sampleDataSize = 0;
  const sampleByteCount: number[] = [];
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const pcm = pcmData[i];
    let bytes = Math.min(pcm.length, MAX_SAMPLE_BYTES);
    if (bytes & 1) bytes--; // must be even (word-aligned)
    if (pcm.length > MAX_SAMPLE_BYTES) {
      warnings.push(`Instrument ${i + 1}: sample too long; truncated.`);
    }
    sampleByteCount.push(bytes);
    sampleDataSize += bytes;
  }

  const totalSize = HEADER_SIZE + patternDataSize + sampleDataSize;
  const output = new Uint8Array(totalSize); // zero-initialised
  const view = new DataView(output.buffer);

  // ── Song name (20 bytes, space-padded) ────────────────────────────────────
  const songName = (workSong.name || 'Untitled').substring(0, 20);
  for (let i = 0; i < 20; i++) {
    output[i] = i < songName.length ? (songName.charCodeAt(i) & 0xFF) : 0x20;
  }

  // ── Sample headers (31 × 30 bytes) at offset 0x014 ───────────────────────
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const base = 20 + i * 30;
    const inst = usedInstruments[i];
    const pcmBytes = sampleByteCount[i];

    // Name: 22 bytes, null-padded
    const name = (inst?.name ?? '').substring(0, 22);
    for (let j = 0; j < 22; j++) {
      output[base + j] = j < name.length ? (name.charCodeAt(j) & 0xFF) : 0;
    }

    // Length in words (big-endian)
    const lengthWords = Math.floor(pcmBytes / 2);
    view.setUint16(base + 22, lengthWords, false);

    // Finetune: 0-15 (signed -8..+7, stored as 0x0-0xF)
    const finetune = Math.max(-8, Math.min(7, inst?.metadata?.modPlayback?.finetune ?? 0));
    output[base + 24] = (finetune < 0 ? finetune + 16 : finetune) & 0x0F;

    // Volume: 0-64
    const defaultVol = inst?.metadata?.modPlayback?.defaultVolume ?? 64;
    output[base + 25] = Math.min(64, Math.max(0, defaultVol));

    // Loop start (words, big-endian)
    const loopStartFrames = inst?.sample?.loopStart ?? 0;
    const loopStartWords = Math.min(65535, Math.floor(loopStartFrames / 2));
    view.setUint16(base + 26, loopStartWords, false);

    // Loop length (words, big-endian); 1 = no loop in ProTracker
    const hasLoop = inst?.sample?.loop ?? false;
    if (hasLoop) {
      const loopEndFrames = inst?.sample?.loopEnd ?? 0;
      const loopLenFrames = Math.max(0, loopEndFrames - loopStartFrames);
      const loopLenWords = Math.max(1, Math.min(65535, Math.floor(loopLenFrames / 2)));
      view.setUint16(base + 28, loopLenWords, false);
    } else {
      view.setUint16(base + 28, 1, false); // 1 word = no loop
    }
  }

  // ── Order table at offset 0x3B6 ───────────────────────────────────────────
  let off = 20 + 31 * 30; // 0x3B6
  output[off++] = Math.min(128, orders.length);
  output[off++] = 0x7F; // restart position (ProTracker convention)
  for (let i = 0; i < 128; i++) {
    output[off + i] = i < orders.length ? (orders[i] & 0x7F) : 0;
  }
  off += 128;

  // ── Magic at offset 0x438 ─────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    output[off + i] = magic.charCodeAt(i) & 0xFF;
  }
  off += 4; // now at 0x43C

  // ── Pattern data ──────────────────────────────────────────────────────────
  const injectSpeed = workSong.initialSpeed !== undefined && workSong.initialSpeed !== 6;
  const injectBPM = workSong.initialBPM !== undefined && workSong.initialBPM !== 125;

  // Track note-out-of-range occurrences to avoid warning spam
  let outOfRangeCount = 0;

  for (let patIdx = 0; patIdx < patternCount; patIdx++) {
    const pat = workSong.patterns[patIdx];
    const patBase = off + patIdx * BYTES_PER_PATTERN;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < nChannels; ch++) {
        const cell = pat?.channels[ch]?.rows[row];
        const cellBase = patBase + (row * nChannels + ch) * BYTES_PER_CELL;

        let note = cell?.note ?? 0;
        let inst = cell?.instrument ?? 0;
        let effTyp = cell?.effTyp ?? 0;
        let eff = cell?.eff ?? 0;
        const volCol = cell?.volume ?? 0;

        // Merge XM volume column into effect slot if the slot is empty
        [effTyp, eff] = mergeVolumeColumn(volCol, effTyp, eff);

        // Clamp instrument to MOD range
        if (inst > MAX_INSTRUMENTS) inst = 0;

        // Remap out-of-range notes to resampled instrument slots
        if (note !== 0 && note !== 97) {
          if (note < MOD_NOTE_MIN) {
            const entry = belowSlot[inst];
            if (entry) {
              const adj = note + entry.shift;
              if (adj >= MOD_NOTE_MIN && adj <= MOD_NOTE_MAX) {
                note = adj;
                inst = entry.newSlot1;
              } else {
                outOfRangeCount++;
                note = 0; // truly unplayable (below C-1 even after resampling)
              }
            } else {
              outOfRangeCount++;
              note = 0; // below C-1, no free slot — must silence
            }
          } else if (note > MOD_NOTE_MAX) {
            const entry = aboveSlot[inst];
            if (entry) {
              const adj = note + entry.shift;
              if (adj >= MOD_NOTE_MIN && adj <= MOD_NOTE_MAX) {
                note = adj;
                inst = entry.newSlot1;
              } else {
                outOfRangeCount++;
                note = 0; // still out of range after resampling → silence
              }
            } else {
              outOfRangeCount++;
              note = 0; // no free slot → silence
            }
          }
        }

        // Inject speed / BPM into pattern 0, row 0 (only if cell has no effect)
        if (patIdx === 0 && row === 0) {
          if (ch === 0 && injectSpeed && effTyp === 0 && eff === 0) {
            effTyp = 0x0F;
            eff = Math.min(0x1F, workSong.initialSpeed ?? 6);
          } else if (ch === 1 && injectBPM && effTyp === 0 && eff === 0) {
            effTyp = 0x0F;
            eff = Math.max(0x20, Math.min(0xFF, workSong.initialBPM ?? 125));
          }
        }

        const [modCmd, modParam] = mapEffect(effTyp, eff);
        const period = noteToPeriod(note === 97 ? 0 : note);

        // 4-byte MOD cell encoding
        output[cellBase + 0] = ((inst & 0x10) << 0) | ((period >> 8) & 0x0F);
        output[cellBase + 1] = period & 0xFF;
        output[cellBase + 2] = ((inst & 0x0F) << 4) | (modCmd & 0x0F);
        output[cellBase + 3] = modParam;
      }
    }
  }

  if (outOfRangeCount > 0) {
    warnings.push(
      `${outOfRangeCount} note(s) could not be resampled into range and were silenced.`,
    );
  }

  off += patternCount * BYTES_PER_PATTERN;

  // ── Sample PCM data ───────────────────────────────────────────────────────
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const pcm = pcmData[i];
    const bytes = sampleByteCount[i];
    for (let j = 0; j < bytes; j++) {
      output[off + j] = pcm[j] & 0xFF; // two's complement byte (signed stored as unsigned)
    }
    off += bytes;
  }

  const safeName = (workSong.name || 'untitled')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 32);

  return {
    blob: new Blob([output.buffer], { type: 'application/octet-stream' }),
    filename: `${safeName}.mod`,
    warnings,
    instrumentCount: usedInstruments.filter(Boolean).length,
    patternCount,
    orderCount: orders.length,
  };
}
