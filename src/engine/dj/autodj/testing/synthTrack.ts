/**
 * Synthetic test tracks for the Auto DJ: a small arrangement language
 * rendered to PCM with known beats, downbeats, keys and structure, so the
 * analysis can be checked against ground truth (reachability protocol 3:
 * check the instrument on a case whose answer is known).
 *
 * Test support only. Not imported by product code.
 */

export interface SynthSectionSpec {
  bars: number;
  kick?: boolean;
  bass?: boolean;
  hats?: boolean;
  vocal?: boolean;
  pad?: boolean;
  /** 0..1 overall level of the section (default 1). */
  level?: number;
  /** Rising level across the section (build). */
  ramp?: boolean;
  /** Silence regardless of the other flags. */
  silent?: boolean;
}

export interface SynthTrackSpec {
  name: string;
  bpm: number;
  /** Root midi note of the key, e.g. 57 = A. */
  root: number;
  mode: 'major' | 'minor';
  sections: SynthSectionSpec[];
  sampleRate?: number;
  /** Silence before the first beat (seconds). */
  leadInSec?: number;
  /** Beats of pickup before the first downbeat (anacrusis). */
  anacrusisBeats?: number;
  /** Beats per bar (default 4). */
  beatsPerBar?: number;
  /** Tempo change (ratio) applied from this bar on, for the tempo-change case. */
  tempoChangeAtBar?: number;
  tempoChangeRatio?: number;
  /** Shift the bassline to the off-beats (syncopation). */
  syncopated?: boolean;
}

export interface SynthTrack {
  spec: SynthTrackSpec;
  pcm: Float32Array;
  sampleRate: number;
  durationSec: number;
  /** Ground-truth beat times. */
  beats: number[];
  /** Ground-truth downbeat times. */
  downbeats: number[];
  /** Ground truth: seconds at which each section starts. */
  sectionStarts: number[];
}

/** Deterministic noise. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return (s % 100000) / 100000;
  };
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function renderSyntheticTrack(spec: SynthTrackSpec): SynthTrack {
  const sr = spec.sampleRate ?? 22050;
  const bpb = spec.beatsPerBar ?? 4;
  const leadIn = spec.leadInSec ?? 0;
  const anacrusis = spec.anacrusisBeats ?? 0;
  const totalBars = spec.sections.reduce((a, s) => a + s.bars, 0);
  const totalBeats = totalBars * bpb + anacrusis;

  // Beat times with an optional tempo change.
  const beats: number[] = [];
  let t = leadIn;
  let period = 60 / spec.bpm;
  for (let i = 0; i < totalBeats; i++) {
    const bar = Math.floor((i - anacrusis) / bpb);
    if (spec.tempoChangeAtBar !== undefined && bar >= spec.tempoChangeAtBar) period = (60 / spec.bpm) / (spec.tempoChangeRatio ?? 1);
    beats.push(t);
    t += period;
  }
  const durationSec = t + 1;
  const pcm = new Float32Array(Math.ceil(durationSec * sr));
  const downbeats: number[] = [];
  for (let i = anacrusis; i < beats.length; i += bpb) downbeats.push(beats[i]);

  const scale = spec.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const chordTones = spec.mode === 'major' ? [0, 4, 7] : [0, 3, 7];
  const rng = makeRng(spec.name.length * 7919 + spec.bpm);

  const sectionStarts: number[] = [];
  let barCursor = 0;
  // Vibrato is frequency modulation: integrate the phase, never multiply t by
  // a time-varying frequency (that is FM with an index that grows with t).
  let voxPhase = 0;
  const bassOffset = spec.syncopated ? 0.5 : 0;

  for (const section of spec.sections) {
    const firstBeatIdx = anacrusis + barCursor * bpb;
    sectionStarts.push(beats[Math.min(beats.length - 1, firstBeatIdx)]);
    for (let b = 0; b < section.bars * bpb; b++) {
      const beatIdx = firstBeatIdx + b;
      if (beatIdx >= beats.length) break;
      const beatStart = beats[beatIdx];
      const beatLen = (beats[beatIdx + 1] ?? beatStart + period) - beatStart;
      const progress = b / (section.bars * bpb);
      const level = (section.level ?? 1) * (section.ramp ? 0.3 + 0.7 * progress : 1);
      if (section.silent || level <= 0) continue;
      const s0 = Math.floor(beatStart * sr);
      const sN = Math.floor((beatStart + beatLen) * sr);
      const barInSection = Math.floor(b / bpb);
      const bassDegree = scale[(barInSection * 2) % scale.length];
      const bassHz = midiHz(spec.root - 12 + bassDegree);
      for (let i = s0; i < sN && i < pcm.length; i++) {
        const tt = (i - s0) / sr;
        const phaseInBeat = tt / beatLen;
        let v = 0;
        const beatInBar = ((beatIdx - anacrusis) % bpb + bpb) % bpb;
        if (section.kick && (b % bpb !== 1 || !spec.syncopated)) {
          // Downbeat accent: the first beat of the bar is louder and longer.
          const accent = beatInBar === 0 ? 1 : 0.65;
          const env = Math.exp(-tt * (beatInBar === 0 ? 12 : 18));
          v += 0.9 * accent * env * Math.sin(2 * Math.PI * (45 + 60 * env) * tt);
        }
        if (section.bass) {
          const local = ((phaseInBeat + bassOffset) % 1);
          const gate = local < 0.45 ? 1 : 0;
          const tb = (local * beatLen);
          const env = gate * Math.exp(-tb * 3) * (beatInBar === 0 ? 1 : 0.6);
          const ph = 2 * Math.PI * bassHz * ((i - s0) / sr + beatIdx);
          v += 0.45 * env * (Math.sin(ph) + 0.3 * Math.sin(2 * ph));
        }
        if (section.hats) {
          const local = (phaseInBeat * 2) % 1;
          if (local < 0.12) v += 0.18 * (rng() * 2 - 1) * (1 - local / 0.12);
        }
        if (section.pad) {
          for (const ct of chordTones) v += 0.08 * Math.sin(2 * Math.PI * midiHz(spec.root + ct) * (i / sr));
          v += 0.05 * Math.sin(2 * Math.PI * midiHz(spec.root + 12 + chordTones[1]) * (i / sr));
        }
        if (section.vocal) {
          const syllable = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * (i / sr));
          // An alto line: f0 between the root and a fifth above, six partials.
          const f0 = midiHz(spec.root + scale[(Math.floor((i / sr) * 2)) % scale.length]) * (1 + 0.01 * Math.sin(2 * Math.PI * 5.5 * (i / sr)));
          voxPhase += (2 * Math.PI * f0) / sr;
          let vox = 0;
          for (let h = 1; h <= 6; h++) vox += Math.sin(voxPhase * h) / h;
          v += 0.4 * syllable * vox;
        }
        pcm[i] += v * level;
      }
    }
    barCursor += section.bars;
  }
  // Gentle limiter: scale first so the clip stays nearly linear (a hard
  // tanh on the full mix grew overtones on every pad tone).
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.tanh(pcm[i] * 0.55) / 0.55 * 0.8;
  return { spec, pcm, sampleRate: sr, durationSec, beats, downbeats, sectionStarts };
}
