/**
 * Synth pre-rendering registry.
 *
 * Provides bakeSynthInstruments() which replaces the three separate bake
 * functions in export-songs-openmpt.ts with a unified, format-aware system
 * that simulates each format's synth engine tick-by-tick.
 */

import type { TrackerSong } from '../../src/engine/TrackerReplayer';
import {
  renderSynthInstrument,
  buildLoopingWAV,
  DEFAULT_SAMPLE_RATE,
} from './SynthSimulator';
import { FCSynthSim } from './FCSynthSim';
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
  const wavBuf = buildLoopingWAV(pcm, loopStart, loopEnd, sampleRate);
  if (!inst.sample) {
    inst.sample = {
      audioBuffer: wavBuf,
      url: '',
      baseNote: 'C-4',
      detune: 0,
      loop: true,
      loopStart,
      loopEnd,
      loopType: 'forward',
      sampleRate,
      reverse: false,
      playbackRate: 1,
    };
  } else {
    inst.sample.audioBuffer = wavBuf;
    inst.sample.sampleRate = sampleRate;
    inst.sample.loop = true;
    inst.sample.loopStart = loopStart;
    inst.sample.loopEnd = loopEnd;
    inst.sample.loopType = 'forward';
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
export function bakeSynthInstruments(song: TrackerSong): void {
  const isHVL = song.format === 'HVL';
  const hvlSampleRate = isHVL ? 44100 : 8287;

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
      const result = renderSynthInstrument(
        fcSim, inst.fc, 24, DEFAULT_SAMPLE_RATE,
      );
      attachSampleToInstrument(inst, result.pcm, result.loopStart, result.loopEnd, result.sampleRate);
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
