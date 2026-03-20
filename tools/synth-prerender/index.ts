/**
 * Synth pre-rendering registry.
 *
 * Provides bakeSynthInstruments() which replaces the three separate bake
 * functions in export-songs-openmpt.ts with a unified, format-aware system
 * that simulates each format's synth engine tick-by-tick.
 */

import type { TrackerSong } from '../../src/engine/TrackerReplayer';
import type { FCConfig } from '../../src/types/instrument/exotic';
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

  const wavBuf = buildLoopingWAV(waveform, 0, waveform.length, 8287);
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
      sampleRate: 8287,
      reverse: false,
      playbackRate: 1,
    };
  } else {
    inst.sample.audioBuffer = wavBuf;
    inst.sample.sampleRate = 8287;
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
      const result = renderSynthInstrument(
        sidMon1Sim, inst.sidmon1, 24, DEFAULT_SAMPLE_RATE,
      );
      attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      continue;
    }

    if (inst.digMug) {
      const result = renderSynthInstrument(
        digMugSim, inst.digMug, 24, DEFAULT_SAMPLE_RATE,
      );
      attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      continue;
    }

    if (inst.hippelCoso) {
      const result = renderSynthInstrument(
        hippelCoSoSim, inst.hippelCoso, 24, DEFAULT_SAMPLE_RATE,
      );
      attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      continue;
    }

    if (inst.davidWhittaker) {
      const result = renderSynthInstrument(
        davidWhittakerSim, inst.davidWhittaker, 24, DEFAULT_SAMPLE_RATE,
      );
      attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      continue;
    }

    if (inst.deltaMusic1 && !inst.deltaMusic1.isSample) {
      const result = renderSynthInstrument(
        deltaMusic1Sim, inst.deltaMusic1, 24, DEFAULT_SAMPLE_RATE,
      );
      attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      continue;
    }

    if (inst.deltaMusic2 && !inst.deltaMusic2.isSample) {
      const result = renderSynthInstrument(
        deltaMusic2Sim, inst.deltaMusic2, 24, DEFAULT_SAMPLE_RATE,
      );
      attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
      continue;
    }

    // Fallback: if no config matched, generate a sawtooth
    const sawLen = 32;
    const saw = new Int8Array(sawLen);
    for (let i = 0; i < sawLen; i++) saw[i] = Math.round(127 - (255 * i / (sawLen - 1)));
    attachSampleToInstrument(inst, saw, 0, sawLen, 8287);
  }
}
