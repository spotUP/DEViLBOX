/**
 * KLYS-PRESETS: every factory preset of the klystrack bank, rendered through the real Klystrack worklet + WASM
 * (setInstrumentData, previewNoteOn, process) and measured.
 *
 *  - every preset is audible, never clips, and behaves as its shape says (a hit dies away by itself, a sustained
 *    sound holds while the key is down and stops after the release);
 *  - the drums meet MEASURED acceptance numbers (kick pitch drop and end pitch, snare tone and noise, hat brightness
 *    and decay, tom drop, ...), not taste;
 *  - presets are distinguishable: the minimum pairwise distance of the feature vector (RMS envelope + spectral
 *    centroid at two times) stays above a floor.
 *
 * The table of measured numbers is printed with the prefix "KLYS-PRESET" so the numbers can be read from a run.
 */
import { describe, it, expect } from 'vitest';
import { KLYS_PRESETS, type KlysPreset } from '@constants/klysPresets';
import {
  loadKlysWorklet, renderKlysInstrument, rmsOf, dbOf, peakOf, centroidAt, flatnessAt, bandPeak,
  decayTime, peakTimeMs, featuresOf, featureDistance, pitchTrack, trackMax, trackMedian,
} from './klysPresetRender';

interface Measured {
  preset: KlysPreset; samples: Float32Array; peak: number; loudest: number; decay40: number;
  fStart: number; fEnd: number; fAt5: number; fAt30: number; fAt100: number; peakMs: number;
  centroidOnset: number; centroidBody: number; flat: number; features: number[];
}

const HIT_SECONDS = 1.6;
const HELD_SECONDS = 3.2;

function measure(preset: KlysPreset, samples: Float32Array): Measured {
  const loudest = Math.max(...Array.from({ length: 60 }, (_, i) => rmsOf(samples, i * 0.025, i * 0.025 + 0.025)));
  const track = pitchTrack(samples, 450);
  return {
    preset, samples, peak: peakOf(samples), loudest, decay40: decayTime(samples, 40),
    fStart: trackMax(track.filter(([, hz]) => hz <= 800), 0.003, 0.06), fEnd: trackMedian(track, 0.1, 0.15), fAt5: trackMedian(track, 0.002, 0.012), fAt30: trackMedian(track, 0.025, 0.035), fAt100: trackMedian(track, 0.09, 0.11),
    peakMs: peakTimeMs(samples),
    centroidOnset: centroidAt(samples, 0, 1024), centroidBody: centroidAt(samples, 0.1, 4096),
    flat: flatnessAt(samples, 0.02),
    features: featuresOf(samples),
  };
}

describe('the klystrack preset bank, rendered by the real engine', () => {
  it('every preset sounds as its category says, the drums meet their measured numbers, and no two are alike', { timeout: 900_000 }, async () => {
    const results: Measured[] = [];
    for (const preset of KLYS_PRESETS) {
      // A fresh engine per preset: a buzz instrument retriggered after any released note stays silent in the core (reported, not worked around in the bank).
      const w = await loadKlysWorklet();
      const held = preset.shape === 'sustained';
      const samples = await renderKlysInstrument(w, 1, preset.instrument, preset.note, held ? 1.4 : HIT_SECONDS, held ? HELD_SECONDS : HIT_SECONDS);
      results.push(measure(preset, samples));
    }

    const problems: string[] = [];
    const bad = (m: Measured, why: string): void => { problems.push(`${m.preset.name} (${m.preset.category}): ${why}`); };

    for (const m of results) {
      const { preset: p } = m;
      const line = [
        p.category.padEnd(12), p.name.padEnd(22), `peak ${m.peak.toFixed(2)}`, `loud ${dbOf(m.loudest).toFixed(1)}dB`,
        `peak@${m.peakMs.toFixed(1)}ms`, `dec40 ${m.decay40.toFixed(2)}s`, `f@5/30/100ms ${m.fAt5.toFixed(0)}/${m.fAt30.toFixed(0)}/${m.fAt100.toFixed(0)} start ${m.fStart.toFixed(0)} end ${m.fEnd.toFixed(0)}`,
        `cen ${m.centroidOnset.toFixed(0)}->${m.centroidBody.toFixed(0)}`, `flat ${m.flat.toFixed(2)}`,
      ].join(' | ');
      console.log(`KLYS-PRESET ${line}`);

      // Every preset: audible, no clipping.
      if (m.loudest < 0.01) bad(m, `too quiet (${dbOf(m.loudest).toFixed(1)} dB)`);
      if (m.peak >= 1) bad(m, `clips (peak ${m.peak.toFixed(2)})`);

      if (p.shape === 'hit') {
        if (m.decay40 < 0 || m.decay40 > 1.5) bad(m, `a hit must fall 40 dB within 1.5 s (${m.decay40})`);
      } else {
        const sustain = rmsOf(m.samples, 0.9, 1.3);
        if (sustain < 0.003 || dbOf(sustain) < dbOf(m.loudest) - 30) bad(m, `does not hold for 1 s (${dbOf(sustain).toFixed(1)} dB vs ${dbOf(m.loudest).toFixed(1)})`);
        const tail = rmsOf(m.samples, HELD_SECONDS - 0.3, HELD_SECONDS);
        if (tail > 0.003) bad(m, `still sounding ${(tail).toFixed(4)} long after the key is up`);
      }

      switch (p.category) {
        case 'Kick':
          if (m.fEnd < 40 || m.fEnd > 70) bad(m, `kick fundamental must end 40-70 Hz (${m.fEnd.toFixed(1)})`);
          if (m.fStart < 3 * m.fEnd) bad(m, `kick must start at least 3x its end pitch within 60 ms (${m.fStart.toFixed(0)} vs ${m.fEnd.toFixed(0)})`);
          if (m.peakMs > 5) bad(m, `kick peak must be in the first 5 ms (${m.peakMs.toFixed(1)})`);
          if (m.decay40 < 0 || m.decay40 > 0.4) bad(m, `kick must be 40 dB down within 0.4 s (${m.decay40})`);
          if (m.centroidOnset < 2 * m.centroidBody) bad(m, `kick onset centroid must be 2x the body (${m.centroidOnset.toFixed(0)} vs ${m.centroidBody.toFixed(0)})`);
          break;
        case 'Snare': {
          const tone = bandPeak(m.samples, 0.005, 120, 300);
          if (tone.freq < 150 || tone.freq > 250 || tone.prominence < 3) bad(m, `snare needs a 150-250 Hz tone (${tone.freq.toFixed(0)} Hz, prominence ${tone.prominence.toFixed(1)})`);
          if (m.decay40 < 0 || m.decay40 > 0.35) bad(m, `snare must decay within 0.35 s (${m.decay40})`);
          if (flatnessAt(m.samples, 0.03) < 0.2) bad(m, `snare needs a noise burst at 20-100 ms (flatness ${flatnessAt(m.samples, 0.03).toFixed(2)})`);
          break;
        }
        case 'Hi-Hat': {
          if (m.centroidOnset < 5000 && centroidAt(m.samples, 0.005, 2048) < 5000) bad(m, `hat centroid must exceed 5 kHz (${centroidAt(m.samples, 0.005, 2048).toFixed(0)})`);
          const limit = p.name.startsWith('Open') ? 0.4 : 0.08;
          if (m.decay40 < 0 || m.decay40 > limit) bad(m, `hat must decay within ${limit} s (${m.decay40})`);
          if (flatnessAt(m.samples, 0.005) < 0.2) bad(m, `hat must be noise (flatness ${flatnessAt(m.samples, 0.005).toFixed(2)})`);
          break;
        }
        case 'Tom': {
          const ratio = m.fStart / Math.max(m.fEnd, 1);
          if (m.fEnd <= 0 || ratio < 1.15 || ratio >= 3) bad(m, `tom drop must be real but smaller than a kick's (${m.fStart.toFixed(0)} -> ${m.fEnd.toFixed(0)})`);
          if (m.decay40 < 0 || m.decay40 > 0.6) bad(m, `tom must decay within 0.6 s (${m.decay40})`);
          break;
        }
        case 'Clap':
          if (m.decay40 < 0 || m.decay40 > 0.4) bad(m, `clap must decay within 0.4 s (${m.decay40})`);
          if (flatnessAt(m.samples, 0.01) < 0.15) bad(m, `clap must be noise (flatness ${flatnessAt(m.samples, 0.01).toFixed(2)})`);
          break;
        default:
      }
    }

    // Distinguishability: the closest pair of the whole bank.
    const pairs: Array<{ d: number; names: string }> = [];
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        pairs.push({ d: featureDistance(results[i].features, results[j].features), names: `${results[i].preset.name} / ${results[j].preset.name}` });
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    for (const pr of pairs.slice(0, 6)) console.log(`KLYS-PRESET closest ${pr.d.toFixed(2)} ${pr.names}`);
    const minDistance = pairs[0].d;
    const closest = pairs[0].names;
    console.log(`KLYS-PRESET minimum pairwise distance ${minDistance.toFixed(2)} (${closest}) over ${results.length} presets`);
    if (minDistance < 1.5) problems.push(`two presets are too alike: ${closest} (distance ${minDistance.toFixed(2)})`);

    expect(problems, problems.join('\n')).toEqual([]);
  });
});
