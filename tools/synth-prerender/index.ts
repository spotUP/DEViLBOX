/**
 * Synth pre-rendering registry.
 *
 * Provides bakeSynthInstruments() which replaces the three separate bake
 * functions in export-songs-openmpt.ts with a unified, format-aware system
 * that simulates each format's synth engine tick-by-tick.
 */

import type { TrackerSong } from '../../src/engine/TrackerReplayer';
import type {
  FCConfig, SoundMonConfig, SidMon1Config, HippelCoSoConfig,
  DigMugConfig, DeltaMusic1Config, DeltaMusic2Config, DavidWhittakerConfig,
} from '../../src/types/instrument/exotic';
import type { EnvelopePoints, EnvelopePoint } from '../../src/types/tracker';
import {
  renderSynthInstrument,
  buildLoopingWAV,
  DEFAULT_SAMPLE_RATE,
} from './SynthSimulator';
import { FCSynthSim } from './FCSynthSim';
import { extractFC13Wave } from '../../src/lib/import/formats/FCParser';
import { SoundMonSynthSim } from './SoundMonSynthSim';
import { SidMon1SynthSim } from './SidMon1SynthSim';
import { HivelySynthSim } from './HivelySynthSim';
import { DigMugSynthSim } from './DigMugSynthSim';
import { HippelCoSoSynthSim } from './HippelCoSoSynthSim';
import { DavidWhittakerSynthSim } from './DavidWhittakerSynthSim';
import { DeltaMusic1SynthSim } from './DeltaMusic1SynthSim';
import { DeltaMusic2SynthSim } from './DeltaMusic2SynthSim';

// ── Simulator singletons ────────────────────────────────────────────────────

const fcSim = new FCSynthSim();
const soundMonSim = new SoundMonSynthSim();
const sidMon1Sim = new SidMon1SynthSim();
const hivelySim = new HivelySynthSim();
const digMugSim = new DigMugSynthSim();
const hippelCoSoSim = new HippelCoSoSynthSim();
const davidWhittakerSim = new DavidWhittakerSynthSim();
const deltaMusic1Sim = new DeltaMusic1SynthSim();
const deltaMusic2Sim = new DeltaMusic2SynthSim();

// ── Attach helpers ──────────────────────────────────────────────────────────

function attachSampleToInstrument(
  inst: TrackerSong['instruments'][number],
  pcm: Int8Array,
  loopStart: number,
  loopEnd: number,
  sampleRate: number,
): void {
  const hasLoop = loopStart >= 0 && loopEnd > loopStart;
  const wavBuf = buildLoopingWAV(pcm, loopStart, loopEnd, sampleRate);
  if (!inst.sample) {
    inst.sample = {
      audioBuffer: wavBuf,
      url: '',
      baseNote: 'C-4',
      detune: 0,
      loop: hasLoop,
      loopStart: hasLoop ? loopStart : 0,
      loopEnd: hasLoop ? loopEnd : pcm.length,
      loopType: hasLoop ? 'forward' : 'off',
      sampleRate,
      reverse: false,
      playbackRate: 1,
    };
  } else {
    inst.sample.audioBuffer = wavBuf;
    inst.sample.sampleRate = sampleRate;
    inst.sample.loop = hasLoop;
    inst.sample.loopStart = hasLoop ? loopStart : 0;
    inst.sample.loopEnd = hasLoop ? loopEnd : pcm.length;
    inst.sample.loopType = hasLoop ? 'forward' : 'off';
  }
}

// ── FC vol macro → XM envelope conversion ───────────────────────────────────

/**
 * Convert FC vol macro byte sequence into XM envelope points.
 * Processes the same opcodes as the FC replayer: direct volume values,
 * 0xE0 (loop), 0xE1 (end/hold), 0xE8 (sustain), 0xEA (volume slide).
 */
function fcVolMacroToEnvelope(cfg: FCConfig): EnvelopePoints | null {
  const vm = cfg.volMacroData;
  const speed = cfg.volMacroSpeed ?? cfg.synthSpeed ?? 1;
  if (!vm || vm.length === 0) return null;

  const points: EnvelopePoint[] = [];
  let tick = 0;
  let step = 0;
  let lastVol = -1;
  let loopTargetStep = -1; // For 0xE0 loop detection
  let sustainTick = -1;

  // Walk through the vol macro bytes, converting to envelope points
  for (let iter = 0; iter < 200 && step < vm.length && points.length < 12; iter++) {
    const info = vm[step];
    if (info === 0xE1) break; // end — hold current volume

    if (info === 0xE0) {
      // Loop back — mark the loop target for XM envelope loop
      if (step + 1 < vm.length) {
        loopTargetStep = Math.max(0, (vm[step + 1] & 0x3F) - 5);
      }
      break; // Stop here, the loop will be set in XM envelope flags
    }

    if (info === 0xE8) {
      // Sustain hold — mark sustain point
      if (step + 1 < vm.length) {
        sustainTick = tick;
        // Add a sustain point at current volume if last point isn't already here
        if (points.length > 0 && points[points.length - 1].tick !== tick) {
          points.push({ tick, value: lastVol >= 0 ? lastVol : 0 });
        }
      }
      step += 2;
      continue;
    }

    if (info === 0xEA) {
      // Volume slide — approximate as linear ramp
      if (step + 2 < vm.length) {
        const bendSpeed = vm[step + 1] < 128 ? vm[step + 1] : vm[step + 1] - 256;
        const bendTime = vm[step + 2];
        const endVol = Math.max(0, Math.min(64, (lastVol >= 0 ? lastVol : 64) + bendSpeed * bendTime));
        tick += bendTime * speed;
        points.push({ tick, value: endVol });
        lastVol = endVol;
      }
      step += 3;
      continue;
    }

    // Direct volume value (0-64)
    if (info !== lastVol) {
      points.push({ tick, value: Math.min(64, info) });
      lastVol = info;
    }
    step++;
    tick += speed;
  }

  if (points.length < 2) return null;

  // Find the loop start point index (if 0xE0 loop was encountered)
  let loopStartPoint: number | null = null;
  let loopEndPoint: number | null = null;
  if (loopTargetStep >= 0) {
    // Find the envelope point closest to the loop target tick
    // The loop target step is a vol macro index; we need to find the tick it corresponds to
    let targetTick = 0;
    for (let s = 0; s < loopTargetStep && s < vm.length; s++) {
      const b = vm[s];
      if (b === 0xE1) break;
      if (b === 0xEA) { s += 2; targetTick += (vm[s] ?? 1) * speed; continue; }
      if (b === 0xE8) { s += 1; continue; }
      if (b === 0xE0) break;
      targetTick += speed;
    }
    for (let i = 0; i < points.length; i++) {
      if (points[i].tick >= targetTick) { loopStartPoint = i; break; }
    }
    loopEndPoint = points.length - 1;
  }

  // Find sustain point index
  let sustainPoint: number | null = null;
  if (sustainTick >= 0) {
    for (let i = 0; i < points.length; i++) {
      if (points[i].tick >= sustainTick) { sustainPoint = i; break; }
    }
  }

  return {
    enabled: true,
    points,
    sustainPoint,
    loopStartPoint,
    loopEndPoint,
  };
}

/**
 * Create a short looping waveform sample from FC config for XM export.
 * The sample is just the raw waveform (no ADSR baked in) — the XM
 * volume envelope handles the volume shaping separately.
 */
function attachFCWaveformSample(
  inst: TrackerSong['instruments'][number],
  cfg: FCConfig,
): void {
  // Get the actual waveform
  let waveform: Int8Array;
  if (cfg.wavePCM && cfg.wavePCM.length > 0) {
    waveform = new Int8Array(cfg.wavePCM);
  } else {
    const raw = extractFC13Wave(cfg.waveNumber ?? 0);
    waveform = new Int8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      waveform[i] = raw[i] < 128 ? raw[i] : raw[i] - 256;
    }
  }

  if (waveform.length === 0) return;

  // Use 2× Amiga rate so the XM exporter computes relNote=+12 (one octave up).
  // FC period indices map to notes via log2(3424/period)+1, which starts at C-1
  // for period 1712. The XM sample needs to play one octave higher than the
  // raw 8287 Hz rate to match the FC replayer's pitch.
  const fcSampleRate = 16574;
  const wavBuf = buildLoopingWAV(waveform, 0, waveform.length, fcSampleRate);
  const envelope = fcVolMacroToEnvelope(cfg);

  if (!inst.sample) {
    inst.sample = {
      audioBuffer: wavBuf,
      url: '',
      baseNote: 'C-4',
      detune: 0,
      loop: true,
      loopStart: 0,
      loopEnd: waveform.length,
      loopType: 'forward',
      sampleRate: fcSampleRate,
      reverse: false,
      playbackRate: 1,
    };
  } else {
    inst.sample.audioBuffer = wavBuf;
    inst.sample.sampleRate = fcSampleRate;
    inst.sample.loop = true;
    inst.sample.loopStart = 0;
    inst.sample.loopEnd = waveform.length;
    inst.sample.loopType = 'forward';
  }

  // Store envelope in metadata for XM exporter
  if (envelope) {
    if (!inst.metadata) inst.metadata = {};
    inst.metadata.originalEnvelope = envelope;
  }
}

// ── Generic ADSR → XM envelope conversion ───────────────────────────────────

/** Convert simple ADSR parameters to XM envelope points. */
function adsrToEnvelope(
  atkVol: number, atkTicks: number,
  decVol: number, decTicks: number,
  susVol: number, susTicks: number,
  relVol: number, relTicks: number,
): EnvelopePoints | null {
  const points: EnvelopePoint[] = [];
  let tick = 0;

  // Attack: 0 → atkVol
  points.push({ tick: 0, value: 0 });
  tick += Math.max(1, atkTicks);
  points.push({ tick, value: Math.min(64, atkVol) });

  // Decay: atkVol → decVol
  if (decTicks > 0 && decVol !== atkVol) {
    tick += decTicks;
    points.push({ tick, value: Math.min(64, decVol) });
  }

  // Sustain point (hold here until note-off)
  const sustainIdx = points.length - 1;

  // If sustain has finite length, add a hold then release
  if (susTicks > 0 && susTicks < 255) {
    tick += susTicks;
    points.push({ tick, value: Math.min(64, susVol > 0 ? susVol : decVol) });
  }

  // Release: → relVol (usually 0)
  if (relTicks > 0) {
    tick += relTicks;
    points.push({ tick, value: Math.max(0, relVol) });
  } else if (points[points.length - 1].value > 0) {
    // Ensure envelope ends at 0
    tick += 10;
    points.push({ tick, value: 0 });
  }

  if (points.length < 2) return null;

  return {
    enabled: true,
    points: points.slice(0, 12),
    sustainPoint: sustainIdx,
    loopStartPoint: null,
    loopEndPoint: null,
  };
}

/** Convert a volume sequence table (per-tick values) to XM envelope points. */
function volSeqToEnvelope(
  seq: number[], speed: number = 1, maxPoints: number = 12,
): EnvelopePoints | null {
  if (!seq || seq.length === 0) return null;

  const points: EnvelopePoint[] = [];
  let lastVal = -1;
  let loopIdx = -1;

  for (let i = 0; i < seq.length && points.length < maxPoints; i++) {
    const v = seq[i];
    if (v === -128 || v === 0xE0) { // loop marker
      loopIdx = 0; // loop to start
      break;
    }
    if (v === -1 || v === 0xE1) break; // end marker
    const val = Math.max(0, Math.min(64, v));
    if (val !== lastVal) {
      points.push({ tick: i * speed, value: val });
      lastVal = val;
    }
  }

  if (points.length < 2) {
    if (points.length === 1) {
      // Single value → flat envelope
      points.push({ tick: points[0].tick + 1, value: points[0].value });
    } else {
      return null;
    }
  }

  return {
    enabled: true,
    points,
    sustainPoint: points.length > 2 ? points.length - 2 : null,
    loopStartPoint: loopIdx >= 0 ? loopIdx : null,
    loopEndPoint: loopIdx >= 0 ? points.length - 1 : null,
  };
}

/** Attach a short looping waveform sample + XM envelope to an instrument. */
function attachWaveformWithEnvelope(
  inst: TrackerSong['instruments'][number],
  waveform: Int8Array | number[],
  envelope: EnvelopePoints | null,
  sampleRate: number = 16574,
): void {
  const wave = waveform instanceof Int8Array ? waveform : new Int8Array(waveform);
  if (wave.length === 0) return;

  const wavBuf = buildLoopingWAV(wave, 0, wave.length, sampleRate);

  if (!inst.sample) {
    inst.sample = {
      audioBuffer: wavBuf, url: '', baseNote: 'C-4', detune: 0,
      loop: true, loopStart: 0, loopEnd: wave.length,
      loopType: 'forward', sampleRate, reverse: false, playbackRate: 1,
    };
  } else {
    inst.sample.audioBuffer = wavBuf;
    inst.sample.sampleRate = sampleRate;
    inst.sample.loop = true;
    inst.sample.loopStart = 0;
    inst.sample.loopEnd = wave.length;
    inst.sample.loopType = 'forward';
  }

  if (envelope) {
    if (!inst.metadata) inst.metadata = {};
    inst.metadata.originalEnvelope = envelope;
  }
}

// ── Format-specific XM waveform + envelope helpers ──────────────────────────

function attachSoundMonXM(inst: TrackerSong['instruments'][number], cfg: SoundMonConfig): void {
  // Waveform
  let wave: Int8Array;
  if (cfg.wavePCM && cfg.wavePCM.length > 0) {
    wave = new Int8Array(cfg.wavePCM);
  } else {
    wave = new Int8Array(32);
    for (let i = 0; i < 32; i++) wave[i] = Math.round(127 - (255 * i / 31)); // sawtooth
  }

  const atkTicks = (cfg.attackVolume ?? 64) * (cfg.attackSpeed || 1);
  const decTicks = ((cfg.attackVolume ?? 64) - (cfg.decayVolume ?? 0)) * (cfg.decaySpeed || 1);
  const relTicks = (cfg.decayVolume ?? 0) * (cfg.releaseSpeed || 1);

  const envelope = adsrToEnvelope(
    cfg.attackVolume ?? 64, atkTicks,
    cfg.decayVolume ?? 0, decTicks,
    cfg.sustainVolume ?? cfg.decayVolume ?? 0, cfg.sustainLength ?? 0,
    cfg.releaseVolume ?? 0, relTicks,
  );
  attachWaveformWithEnvelope(inst, wave, envelope);
}

function attachSidMon1XM(inst: TrackerSong['instruments'][number], cfg: SidMon1Config): void {
  if (!cfg.mainWave || cfg.mainWave.length === 0) return;
  const wave = new Int8Array(cfg.mainWave);

  const atkMax = cfg.attackMax ?? 64;
  const atkTicks = (cfg.attackSpeed ?? 1) > 0 ? Math.ceil(atkMax / (cfg.attackSpeed ?? 1)) : 4;
  const decMin = cfg.decayMin ?? 0;
  const decTicks = (cfg.decaySpeed ?? 1) > 0 ? Math.ceil((atkMax - decMin) / (cfg.decaySpeed ?? 1)) : 8;
  const relMin = cfg.releaseMin ?? 0;
  const relTicks = (cfg.releaseSpeed ?? 1) > 0 ? Math.ceil((decMin - relMin) / Math.max(1, cfg.releaseSpeed ?? 1)) : 8;

  const envelope = adsrToEnvelope(
    atkMax, atkTicks,
    decMin, decTicks,
    decMin, cfg.sustain ?? 0,
    relMin, Math.max(1, relTicks),
  );
  attachWaveformWithEnvelope(inst, wave, envelope);
}

function attachHippelCoSoXM(inst: TrackerSong['instruments'][number], cfg: HippelCoSoConfig): void {
  // Sawtooth waveform (HippelCoSo doesn't embed waveforms)
  const wave = new Int8Array(32);
  for (let i = 0; i < 32; i++) wave[i] = Math.round(127 - (255 * i / 31));

  const envelope = cfg.vseq ? volSeqToEnvelope(cfg.vseq, cfg.volSpeed || 1) : null;
  attachWaveformWithEnvelope(inst, wave, envelope);
}

function attachDeltaMusic1XM(inst: TrackerSong['instruments'][number], cfg: DeltaMusic1Config): void {
  const wave = new Int8Array(32);
  for (let i = 0; i < 32; i++) wave[i] = Math.round(127 - (255 * i / 31));

  const vol = cfg.volume ?? 64;
  const atkTicks = Math.ceil(vol / Math.max(1, cfg.attackStep)) * Math.max(1, cfg.attackDelay);
  const decTicks = Math.ceil((vol - (cfg.sustain ?? 0)) / Math.max(1, cfg.decayStep)) * Math.max(1, cfg.decayDelay);
  const relTicks = Math.ceil((cfg.sustain ?? 0) / Math.max(1, cfg.releaseStep)) * Math.max(1, cfg.releaseDelay);

  const envelope = adsrToEnvelope(vol, atkTicks, cfg.sustain ?? 0, decTicks, cfg.sustain ?? 0, 0, 0, relTicks);
  attachWaveformWithEnvelope(inst, wave, envelope);
}

function attachDeltaMusic2XM(inst: TrackerSong['instruments'][number], cfg: DeltaMusic2Config): void {
  let wave: Int8Array;
  if (cfg.table && cfg.table.length >= 32) {
    wave = new Int8Array(32);
    for (let i = 0; i < 32; i++) {
      const v = cfg.table[i];
      wave[i] = v > 127 ? v - 256 : v;
    }
  } else {
    wave = new Int8Array(32);
    for (let i = 0; i < 32; i++) wave[i] = Math.round(127 - (255 * i / 31));
  }

  // Convert volTable to envelope points
  let envelope: EnvelopePoints | null = null;
  if (cfg.volTable && cfg.volTable.length > 0) {
    const points: EnvelopePoint[] = [];
    let tick = 0;
    for (const entry of cfg.volTable) {
      if (points.length >= 12) break;
      const vol = Math.min(64, Math.round(entry.level * 64 / 255));
      points.push({ tick, value: vol });
      tick += (entry.speed || 1) + (entry.sustain || 0);
    }
    if (points.length >= 2) {
      envelope = { enabled: true, points, sustainPoint: null, loopStartPoint: null, loopEndPoint: null };
    }
  }
  attachWaveformWithEnvelope(inst, wave, envelope);
}

function attachDavidWhittakerXM(inst: TrackerSong['instruments'][number], cfg: DavidWhittakerConfig): void {
  const wave = new Int8Array(32);
  for (let i = 0; i < 32; i++) wave[i] = Math.round(127 - (255 * i / 31));

  const envelope = cfg.volseq ? volSeqToEnvelope(cfg.volseq, 1) : null;
  attachWaveformWithEnvelope(inst, wave, envelope);
}

function attachDigMugXM(inst: TrackerSong['instruments'][number], cfg: DigMugConfig): void {
  // DigMug has waveform data but no envelope — just use waveform with constant volume
  let wave: Int8Array;
  if (cfg.waveformData && cfg.waveformData.length >= 32) {
    wave = new Int8Array(32);
    for (let i = 0; i < 32; i++) {
      const v = cfg.waveformData[i];
      wave[i] = v > 127 ? v - 256 : v;
    }
  } else {
    wave = new Int8Array(32);
    for (let i = 0; i < 32; i++) wave[i] = Math.round(127 - (255 * i / 31));
  }
  attachWaveformWithEnvelope(inst, wave, null);
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Pre-render all synth instruments in a TrackerSong.
 *
 * Detects which format-specific config each instrument has and runs
 * the appropriate tick simulator to produce evolving PCM with ADSR,
 * arpeggio, vibrato, waveform morphing, etc.
 *
 * Replaces the old bakeHivelyInstruments(), bakeSidMon1Instruments(),
 * and bakeGenericSynthInstruments() functions.
 */
export function bakeSynthInstruments(song: TrackerSong, exportAs: 'mod' | 'xm' = 'mod'): void {
  const isHVL = song.format === 'HVL';
  const hvlSampleRate = isHVL ? 44100 : 8287;
  const useXMEnvelopes = exportAs === 'xm';

  for (const inst of song.instruments) {
    // Skip instruments that already have real sample data
    if (inst.sample?.audioBuffer && inst.sample.audioBuffer.byteLength > 44) continue;
    // Skip instruments with sample URLs (loaded at runtime)
    if (inst.sample?.url) continue;
    // Skip raw binary data instruments
    if (inst.rawBinaryData && inst.rawBinaryData.length > 0) continue;

    // Try format-specific simulators in priority order
    if (inst.hively) {
      const result = renderSynthInstrument(
        hivelySim, inst.hively, 24, hvlSampleRate,
      );
      attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      continue;
    }

    if (inst.fc) {
      if (useXMEnvelopes) {
        // XM: short looping waveform + volume envelope (ADSR independent of pitch)
        attachFCWaveformSample(inst, inst.fc);
      } else {
        // MOD: pre-render with ADSR baked into PCM
        const result = renderSynthInstrument(
          fcSim, inst.fc, 24, DEFAULT_SAMPLE_RATE,
        );
        attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      }
      continue;
    }

    if (inst.soundMon) {
      if (inst.soundMon.type === 'pcm' && inst.soundMon.pcmData) {
        // PCM instrument — use raw data directly
        const pcm = new Int8Array(inst.soundMon.pcmData.length);
        for (let i = 0; i < pcm.length; i++) {
          const v = inst.soundMon.pcmData[i];
          pcm[i] = v > 127 ? v - 256 : v;
        }
        const loopStart = inst.soundMon.loopStart ?? 0;
        const loopLen = inst.soundMon.loopLength ?? 0;
        const loopEnd = loopLen > 2 ? loopStart + loopLen : pcm.length;
        attachSampleToInstrument(inst, pcm, loopStart, loopEnd, 8287);
      } else if (useXMEnvelopes) {
        attachSoundMonXM(inst, inst.soundMon);
      } else {
        const result = renderSynthInstrument(
          soundMonSim, inst.soundMon, 24, DEFAULT_SAMPLE_RATE,
        );
        attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      }
      continue;
    }

    if (inst.sidmon1) {
      if (!inst.sidmon1.mainWave || inst.sidmon1.mainWave.length === 0) continue;
      if (useXMEnvelopes) {
        attachSidMon1XM(inst, inst.sidmon1);
      } else {
        const result = renderSynthInstrument(
          sidMon1Sim, inst.sidmon1, 24, DEFAULT_SAMPLE_RATE,
        );
        attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      }
      continue;
    }

    if (inst.digMug) {
      if (useXMEnvelopes) {
        attachDigMugXM(inst, inst.digMug);
      } else {
        const result = renderSynthInstrument(
          digMugSim, inst.digMug, 24, DEFAULT_SAMPLE_RATE,
        );
        attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      }
      continue;
    }

    if (inst.hippelCoso) {
      if (useXMEnvelopes) {
        attachHippelCoSoXM(inst, inst.hippelCoso);
      } else {
        const result = renderSynthInstrument(
          hippelCoSoSim, inst.hippelCoso, 24, DEFAULT_SAMPLE_RATE,
        );
        attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      }
      continue;
    }

    if (inst.davidWhittaker) {
      if (useXMEnvelopes) {
        attachDavidWhittakerXM(inst, inst.davidWhittaker);
      } else {
        const result = renderSynthInstrument(
          davidWhittakerSim, inst.davidWhittaker, 24, DEFAULT_SAMPLE_RATE,
        );
        attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      }
      continue;
    }

    if (inst.deltaMusic1 && !inst.deltaMusic1.isSample) {
      if (useXMEnvelopes) {
        attachDeltaMusic1XM(inst, inst.deltaMusic1);
      } else {
        const result = renderSynthInstrument(
          deltaMusic1Sim, inst.deltaMusic1, 24, DEFAULT_SAMPLE_RATE,
        );
        attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      }
      continue;
    }

    if (inst.deltaMusic2 && !inst.deltaMusic2.isSample) {
      if (useXMEnvelopes) {
        attachDeltaMusic2XM(inst, inst.deltaMusic2);
      } else {
        const result = renderSynthInstrument(
          deltaMusic2Sim, inst.deltaMusic2, 24, DEFAULT_SAMPLE_RATE,
        );
        attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      }
      continue;
    }

    // Fallback: if no config matched, generate a sawtooth
    const sawLen = 32;
    const saw = new Int8Array(sawLen);
    for (let i = 0; i < sawLen; i++) saw[i] = Math.round(127 - (255 * i / (sawLen - 1)));
    attachSampleToInstrument(inst, saw, 0, sawLen, 8287);
  }
}
