const WOBBLE_BASS_PRESETS = [
  {
    id: "wobble-classic-dubstep",
    name: "Classic Dubstep",
    description: "Standard half-time wobble bass",
    category: "bass",
    config: {
      mode: "classic",
      osc1: { type: "sawtooth", octave: 0, detune: 0, level: 100 },
      osc2: { type: "square", octave: 0, detune: 7, level: 80 },
      sub: { enabled: true, octave: -1, level: 60 },
      fm: { enabled: false, amount: 0, ratio: 1, envelope: 0 },
      unison: { voices: 1, detune: 0, stereoSpread: 0 },
      filter: { type: "lowpass", cutoff: 800, resonance: 60, rolloff: -24, drive: 30, keyTracking: 0 },
      filterEnvelope: { amount: 50, attack: 0, decay: 300, sustain: 20, release: 200 },
      wobbleLFO: { enabled: true, sync: "1/4", rate: 4, shape: "sine", amount: 70, pitchAmount: 0, fmAmount: 0, phase: 0, retrigger: true },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.1 },
      distortion: { enabled: false, type: "soft", drive: 0, tone: 50 },
      formant: { enabled: false, vowel: "A", morph: 0, lfoAmount: 0 }
    }
  },
  {
    id: "wobble-reese",
    name: "Reese Bass",
    description: "Dark detuned DnB reese",
    category: "bass",
    config: {
      mode: "reese",
      osc1: { type: "sawtooth", octave: 0, detune: -12, level: 100 },
      osc2: { type: "sawtooth", octave: 0, detune: 12, level: 100 },
      sub: { enabled: true, octave: -1, level: 70 },
      fm: { enabled: false, amount: 0, ratio: 1, envelope: 0 },
      unison: { voices: 3, detune: 15, stereoSpread: 50 },
      filter: { type: "lowpass", cutoff: 1200, resonance: 30, rolloff: -24, drive: 20, keyTracking: 0 },
      filterEnvelope: { amount: 30, attack: 10, decay: 500, sustain: 40, release: 300 },
      wobbleLFO: { enabled: false, sync: "free", rate: 2, shape: "sine", amount: 0, pitchAmount: 0, fmAmount: 0, phase: 0, retrigger: false },
      envelope: { attack: 0.02, decay: 0.5, sustain: 0.9, release: 0.2 },
      distortion: { enabled: true, type: "soft", drive: 25, tone: 40 },
      formant: { enabled: false, vowel: "A", morph: 0, lfoAmount: 0 }
    }
  },
  {
    id: "wobble-filthy-growl",
    name: "Filthy Growl",
    description: "Aggressive modulated growl bass",
    category: "bass",
    config: {
      mode: "growl",
      osc1: { type: "sawtooth", octave: 0, detune: 0, level: 100 },
      osc2: { type: "square", octave: 0, detune: -5, level: 90 },
      sub: { enabled: true, octave: -1, level: 50 },
      fm: { enabled: true, amount: 40, ratio: 2, envelope: 60 },
      unison: { voices: 2, detune: 10, stereoSpread: 30 },
      filter: { type: "bandpass", cutoff: 600, resonance: 70, rolloff: -24, drive: 60, keyTracking: 0 },
      filterEnvelope: { amount: 70, attack: 0, decay: 200, sustain: 10, release: 150 },
      wobbleLFO: { enabled: true, sync: "1/8", rate: 8, shape: "saw", amount: 80, pitchAmount: 5, fmAmount: 30, phase: 0, retrigger: true },
      envelope: { attack: 5e-3, decay: 0.2, sustain: 0.7, release: 0.1 },
      distortion: { enabled: true, type: "hard", drive: 50, tone: 60 },
      formant: { enabled: true, vowel: "O", morph: 50, lfoAmount: 40 }
    }
  },
  {
    id: "wobble-neuro",
    name: "Neuro Bass",
    description: "Metallic neurofunk bass",
    category: "bass",
    config: {
      mode: "fm",
      osc1: { type: "sawtooth", octave: 0, detune: 0, level: 100 },
      osc2: { type: "sine", octave: 0, detune: 0, level: 60 },
      sub: { enabled: true, octave: -1, level: 80 },
      fm: { enabled: true, amount: 60, ratio: 3, envelope: 80 },
      unison: { voices: 1, detune: 0, stereoSpread: 0 },
      filter: { type: "lowpass", cutoff: 2e3, resonance: 50, rolloff: -24, drive: 40, keyTracking: 20 },
      filterEnvelope: { amount: 60, attack: 0, decay: 150, sustain: 15, release: 100 },
      wobbleLFO: { enabled: true, sync: "1/8T", rate: 6, shape: "triangle", amount: 50, pitchAmount: 0, fmAmount: 50, phase: 0, retrigger: true },
      envelope: { attack: 5e-3, decay: 0.15, sustain: 0.6, release: 0.08 },
      distortion: { enabled: true, type: "soft", drive: 35, tone: 70 },
      formant: { enabled: false, vowel: "A", morph: 0, lfoAmount: 0 }
    }
  },
  {
    id: "wobble-riddim",
    name: "Riddim Wobble",
    description: "Deep minimal riddim bass",
    category: "bass",
    config: {
      mode: "classic",
      osc1: { type: "square", octave: 0, detune: 0, level: 100 },
      osc2: { type: "square", octave: 0, detune: 3, level: 70 },
      sub: { enabled: true, octave: -1, level: 80 },
      fm: { enabled: false, amount: 0, ratio: 1, envelope: 0 },
      unison: { voices: 1, detune: 0, stereoSpread: 0 },
      filter: { type: "lowpass", cutoff: 500, resonance: 80, rolloff: -24, drive: 20, keyTracking: 0 },
      filterEnvelope: { amount: 80, attack: 0, decay: 250, sustain: 0, release: 100 },
      wobbleLFO: { enabled: true, sync: "1/2", rate: 2, shape: "square", amount: 90, pitchAmount: 0, fmAmount: 0, phase: 0, retrigger: true },
      envelope: { attack: 5e-3, decay: 0.1, sustain: 0.9, release: 0.05 },
      distortion: { enabled: false, type: "soft", drive: 0, tone: 50 },
      formant: { enabled: false, vowel: "A", morph: 0, lfoAmount: 0 }
    }
  },
  {
    id: "wobble-fm-grind",
    name: "FM Grind",
    description: "Harsh FM modulated bass",
    category: "bass",
    config: {
      mode: "fm",
      osc1: { type: "sine", octave: 0, detune: 0, level: 100 },
      osc2: { type: "sine", octave: 1, detune: 0, level: 80 },
      sub: { enabled: true, octave: -1, level: 60 },
      fm: { enabled: true, amount: 80, ratio: 4, envelope: 70 },
      unison: { voices: 1, detune: 0, stereoSpread: 0 },
      filter: { type: "lowpass", cutoff: 3e3, resonance: 40, rolloff: -24, drive: 50, keyTracking: 10 },
      filterEnvelope: { amount: 40, attack: 0, decay: 200, sustain: 20, release: 150 },
      wobbleLFO: { enabled: true, sync: "1/4", rate: 4, shape: "sine", amount: 60, pitchAmount: 0, fmAmount: 60, phase: 0, retrigger: true },
      envelope: { attack: 5e-3, decay: 0.2, sustain: 0.7, release: 0.1 },
      distortion: { enabled: true, type: "hard", drive: 40, tone: 55 },
      formant: { enabled: false, vowel: "A", morph: 0, lfoAmount: 0 }
    }
  },
  {
    id: "wobble-vowel-yoi",
    name: "Vowel Yoi",
    description: "Formant-morphing yoi bass",
    category: "bass",
    config: {
      mode: "growl",
      osc1: { type: "sawtooth", octave: 0, detune: 0, level: 100 },
      osc2: { type: "sawtooth", octave: 0, detune: 5, level: 85 },
      sub: { enabled: true, octave: -1, level: 55 },
      fm: { enabled: false, amount: 0, ratio: 1, envelope: 0 },
      unison: { voices: 2, detune: 8, stereoSpread: 20 },
      filter: { type: "lowpass", cutoff: 1e3, resonance: 50, rolloff: -24, drive: 25, keyTracking: 0 },
      filterEnvelope: { amount: 50, attack: 0, decay: 300, sustain: 20, release: 200 },
      wobbleLFO: { enabled: true, sync: "1/4", rate: 4, shape: "sine", amount: 60, pitchAmount: 0, fmAmount: 0, phase: 0, retrigger: true },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.1 },
      distortion: { enabled: true, type: "soft", drive: 20, tone: 50 },
      formant: { enabled: true, vowel: "A", morph: 70, lfoAmount: 80 }
    }
  },
  {
    id: "wobble-hybrid-monster",
    name: "Hybrid Monster",
    description: "Complex layered hybrid bass",
    category: "bass",
    config: {
      mode: "hybrid",
      osc1: { type: "sawtooth", octave: 0, detune: -7, level: 100 },
      osc2: { type: "square", octave: 0, detune: 7, level: 90 },
      sub: { enabled: true, octave: -1, level: 70 },
      fm: { enabled: true, amount: 30, ratio: 2, envelope: 40 },
      unison: { voices: 3, detune: 12, stereoSpread: 40 },
      filter: { type: "lowpass", cutoff: 1500, resonance: 55, rolloff: -24, drive: 35, keyTracking: 10 },
      filterEnvelope: { amount: 60, attack: 0, decay: 250, sustain: 15, release: 180 },
      wobbleLFO: { enabled: true, sync: "1/4", rate: 4, shape: "triangle", amount: 65, pitchAmount: 3, fmAmount: 20, phase: 0, retrigger: true },
      envelope: { attack: 0.01, decay: 0.25, sustain: 0.75, release: 0.1 },
      distortion: { enabled: true, type: "soft", drive: 30, tone: 55 },
      formant: { enabled: true, vowel: "E", morph: 40, lfoAmount: 30 }
    }
  },
  {
    id: "wobble-tearout",
    name: "Tearout",
    description: "Heavy distorted tear-out bass",
    category: "bass",
    config: {
      mode: "growl",
      osc1: { type: "sawtooth", octave: 0, detune: 0, level: 100 },
      osc2: { type: "sawtooth", octave: -1, detune: -10, level: 95 },
      sub: { enabled: true, octave: -2, level: 50 },
      fm: { enabled: true, amount: 50, ratio: 1.5, envelope: 50 },
      unison: { voices: 2, detune: 20, stereoSpread: 60 },
      filter: { type: "bandpass", cutoff: 900, resonance: 65, rolloff: -24, drive: 80, keyTracking: 0 },
      filterEnvelope: { amount: 80, attack: 0, decay: 180, sustain: 5, release: 120 },
      wobbleLFO: { enabled: true, sync: "1/8", rate: 8, shape: "saw", amount: 85, pitchAmount: 8, fmAmount: 40, phase: 0, retrigger: true },
      envelope: { attack: 3e-3, decay: 0.15, sustain: 0.6, release: 0.08 },
      distortion: { enabled: true, type: "fuzz", drive: 70, tone: 45 },
      formant: { enabled: false, vowel: "A", morph: 0, lfoAmount: 0 }
    }
  },
  {
    id: "wobble-liquid-dnb",
    name: "Liquid DnB",
    description: "Smooth rolling DnB bass",
    category: "bass",
    config: {
      mode: "reese",
      osc1: { type: "sawtooth", octave: 0, detune: -8, level: 100 },
      osc2: { type: "sawtooth", octave: 0, detune: 8, level: 100 },
      sub: { enabled: true, octave: -1, level: 75 },
      fm: { enabled: false, amount: 0, ratio: 1, envelope: 0 },
      unison: { voices: 2, detune: 6, stereoSpread: 35 },
      filter: { type: "lowpass", cutoff: 2500, resonance: 25, rolloff: -24, drive: 10, keyTracking: 20 },
      filterEnvelope: { amount: 20, attack: 5, decay: 400, sustain: 50, release: 300 },
      wobbleLFO: { enabled: false, sync: "free", rate: 1, shape: "sine", amount: 0, pitchAmount: 0, fmAmount: 0, phase: 0, retrigger: false },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.85, release: 0.25 },
      distortion: { enabled: false, type: "soft", drive: 0, tone: 50 },
      formant: { enabled: false, vowel: "A", morph: 0, lfoAmount: 0 }
    }
  },
  {
    id: "wobble-foghorn",
    name: "Foghorn",
    description: "Massive low-end foghorn wobble",
    category: "bass",
    config: {
      mode: "classic",
      osc1: { type: "sawtooth", octave: -1, detune: 0, level: 100 },
      osc2: { type: "square", octave: -1, detune: 5, level: 90 },
      sub: { enabled: true, octave: -2, level: 80 },
      fm: { enabled: false, amount: 0, ratio: 1, envelope: 0 },
      unison: { voices: 3, detune: 10, stereoSpread: 20 },
      filter: { type: "lowpass", cutoff: 400, resonance: 70, rolloff: -48, drive: 40, keyTracking: 0 },
      filterEnvelope: { amount: 90, attack: 0, decay: 400, sustain: 10, release: 250 },
      wobbleLFO: { enabled: true, sync: "1/2", rate: 2, shape: "sine", amount: 90, pitchAmount: 0, fmAmount: 0, phase: 0, retrigger: true },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.9, release: 0.15 },
      distortion: { enabled: true, type: "soft", drive: 35, tone: 30 },
      formant: { enabled: false, vowel: "A", morph: 0, lfoAmount: 0 }
    }
  },
  {
    id: "wobble-skrillex-style",
    name: "Scary Monsters",
    description: "Aggressive mid-range screech",
    category: "bass",
    config: {
      mode: "growl",
      osc1: { type: "sawtooth", octave: 0, detune: 0, level: 100 },
      osc2: { type: "square", octave: 1, detune: -3, level: 70 },
      sub: { enabled: true, octave: -1, level: 60 },
      fm: { enabled: true, amount: 45, ratio: 3, envelope: 55 },
      unison: { voices: 2, detune: 15, stereoSpread: 50 },
      filter: { type: "bandpass", cutoff: 1800, resonance: 75, rolloff: -24, drive: 70, keyTracking: 15 },
      filterEnvelope: { amount: 75, attack: 0, decay: 150, sustain: 10, release: 100 },
      wobbleLFO: { enabled: true, sync: "1/4", rate: 4, shape: "square", amount: 85, pitchAmount: 10, fmAmount: 35, phase: 0, retrigger: true },
      envelope: { attack: 3e-3, decay: 0.2, sustain: 0.7, release: 0.08 },
      distortion: { enabled: true, type: "hard", drive: 60, tone: 65 },
      formant: { enabled: true, vowel: "I", morph: 60, lfoAmount: 50 }
    }
  }
];
export {
  WOBBLE_BASS_PRESETS as W
};
