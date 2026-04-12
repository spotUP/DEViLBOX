let presetId$1 = 0;
function fxId$1() {
  return `cfp-${presetId$1++}`;
}
const CHANNEL_FX_PRESETS = [
  // ── Bass ──────────────────────────────────────────────────────────────
  {
    name: "Warm Bass",
    description: "Tape saturation + gentle compression",
    category: "Bass",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "TapeSaturation", enabled: true, wet: 60, parameters: { drive: 40, tone: 8e3 } },
      { id: fxId$1(), category: "tonejs", type: "Compressor", enabled: true, wet: 100, parameters: { threshold: -20, ratio: 4, attack: 0.01, release: 0.15 } }
    ]
  },
  {
    name: "Acid Bass",
    description: "Filter + distortion for TB-303",
    category: "Bass",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "Filter", enabled: true, wet: 100, parameters: { type: "lowpass", frequency: 1200, rolloff: -24, Q: 8 } },
      { id: fxId$1(), category: "tonejs", type: "Distortion", enabled: true, wet: 50, parameters: { drive: 0.6, oversample: "2x" } }
    ]
  },
  {
    name: "Sub Bass",
    description: "Low-pass filter + compressor for clean sub",
    category: "Bass",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "Filter", enabled: true, wet: 100, parameters: { type: "lowpass", frequency: 200, rolloff: -24, Q: 1 } },
      { id: fxId$1(), category: "tonejs", type: "Compressor", enabled: true, wet: 100, parameters: { threshold: -15, ratio: 8, attack: 5e-3, release: 0.1 } }
    ]
  },
  // ── Drums ─────────────────────────────────────────────────────────────
  {
    name: "Punchy Drums",
    description: "Compression + EQ boost for attack",
    category: "Drums",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "Compressor", enabled: true, wet: 100, parameters: { threshold: -24, ratio: 6, attack: 2e-3, release: 0.08 } },
      { id: fxId$1(), category: "tonejs", type: "EQ3", enabled: true, wet: 100, parameters: { low: 2, mid: -1, high: 3, lowFrequency: 200, highFrequency: 4e3 } }
    ]
  },
  {
    name: "Gated Snare",
    description: "80s gated reverb snare",
    category: "Drums",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "Reverb", enabled: true, wet: 70, parameters: { decay: 0.8, preDelay: 0 } },
      { id: fxId$1(), category: "tonejs", type: "Compressor", enabled: true, wet: 100, parameters: { threshold: -35, ratio: 20, attack: 1e-3, release: 0.05 } }
    ]
  },
  {
    name: "Lo-Fi Drums",
    description: "BitCrusher + tape for crunchy beats",
    category: "Drums",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "BitCrusher", enabled: true, wet: 60, parameters: { bits: 10 } },
      { id: fxId$1(), category: "tonejs", type: "TapeDegradation", enabled: true, wet: 40, parameters: { wow: 15, flutter: 10, hiss: 0, dropouts: 0, saturation: 30, toneShift: 40 } }
    ]
  },
  // ── Leads ─────────────────────────────────────────────────────────────
  {
    name: "Chorus Lead",
    description: "Stereo chorus + subtle delay for width",
    category: "Leads",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "Chorus", enabled: true, wet: 50, parameters: { frequency: 1.5, delayTime: 3.5, depth: 0.7 } },
      { id: fxId$1(), category: "tonejs", type: "StereoWidener", enabled: true, wet: 100, parameters: { width: 0.7 } }
    ]
  },
  {
    name: "Phaser Lead",
    description: "Classic phaser sweep",
    category: "Leads",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "Phaser", enabled: true, wet: 60, parameters: { frequency: 0.5, octaves: 3, baseFrequency: 1e3 } }
    ]
  },
  // ── Pads ──────────────────────────────────────────────────────────────
  {
    name: "Shimmer Pad",
    description: "Tape warmth + shimmer reverb for ethereal pads",
    category: "Pads",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "TapeSaturation", enabled: true, wet: 30, parameters: { drive: 25, tone: 1e4 } },
      { id: fxId$1(), category: "tonejs", type: "Chorus", enabled: true, wet: 40, parameters: { frequency: 0.3, delayTime: 5, depth: 0.8 } }
    ]
  },
  {
    name: "Dark Pad",
    description: "Low-pass filter + tape degradation",
    category: "Pads",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "Filter", enabled: true, wet: 100, parameters: { type: "lowpass", frequency: 3e3, rolloff: -12, Q: 1 } },
      { id: fxId$1(), category: "tonejs", type: "TapeDegradation", enabled: true, wet: 50, parameters: { wow: 25, flutter: 15, hiss: 10, dropouts: 0, saturation: 20, toneShift: 30 } }
    ]
  },
  // ── Vocals ────────────────────────────────────────────────────────────
  {
    name: "Clean Vocal",
    description: "Compression + EQ for clean vocal chain",
    category: "Vocals",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "Compressor", enabled: true, wet: 100, parameters: { threshold: -18, ratio: 3, attack: 0.01, release: 0.2 } },
      { id: fxId$1(), category: "tonejs", type: "EQ3", enabled: true, wet: 100, parameters: { low: -3, mid: 2, high: 1, lowFrequency: 300, highFrequency: 5e3 } }
    ]
  },
  {
    name: "Crystal Castles Vocal",
    description: "BitCrush + tape + heavy reverb send",
    category: "Vocals",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "BitCrusher", enabled: true, wet: 70, parameters: { bits: 8 } },
      { id: fxId$1(), category: "tonejs", type: "TapeDegradation", enabled: true, wet: 60, parameters: { wow: 40, flutter: 30, hiss: 20, dropouts: 5, saturation: 45, toneShift: 25 } }
    ]
  },
  // ── Lo-Fi ─────────────────────────────────────────────────────────────
  {
    name: "Cassette Deck",
    description: "Full cassette simulation — everything through tape",
    category: "Lo-Fi",
    effects: [
      { id: fxId$1(), category: "tonejs", type: "TapeDegradation", enabled: true, wet: 80, parameters: { wow: 35, flutter: 25, hiss: 15, dropouts: 5, saturation: 35, toneShift: 35 } }
    ]
  },
  {
    name: "Vinyl Record",
    description: "Vinyl noise + tone arm coloring",
    category: "Lo-Fi",
    effects: [
      { id: fxId$1(), category: "wasm", type: "VinylNoise", enabled: true, wet: 30, parameters: { hiss: 40, dust: 50, age: 45, speed: 5.5 } }
    ]
  },
  // ── Creative ──────────────────────────────────────────────────────────
  {
    name: "Frozen Texture",
    description: "Granular freeze ready to capture a moment",
    category: "Creative",
    effects: [
      { id: fxId$1(), category: "wasm", type: "GranularFreeze", enabled: true, wet: 100, parameters: { freeze: 0, grainSize: 80, density: 12, scatter: 40, pitch: 0, spray: 25, shimmer: 15, stereoWidth: 70, feedback: 0, captureLen: 500, attack: 5, release: 40, thru: 1 } }
    ]
  },
  {
    name: "Leslie Cabinet",
    description: "Rotary speaker for organ/keys",
    category: "Creative",
    effects: [
      { id: fxId$1(), category: "wasm", type: "Leslie", enabled: true, wet: 70, parameters: { speed: 0, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.7, drumDepth: 0.5, doppler: 0.5, width: 0.8, acceleration: 0.5 } }
    ]
  }
];
function getChannelFxPresetsByCategory() {
  const groups = {};
  for (const p of CHANNEL_FX_PRESETS) {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  }
  return groups;
}
let presetId = 0;
function fxId() {
  return `sbp-${presetId++}`;
}
const SEND_BUS_PRESETS = [
  // ── Reverb ────────────────────────────────────────────────────────────
  {
    name: "Shimmer Wash",
    description: "Ethereal ascending reverb — *wave, ambient",
    category: "Reverb",
    effects: [{
      id: fxId(),
      category: "wasm",
      type: "ShimmerReverb",
      enabled: true,
      wet: 100,
      parameters: { decay: 80, shimmer: 60, pitch: 12, damping: 40, size: 75, predelay: 30, modRate: 25, modDepth: 15 }
    }]
  },
  {
    name: "Dark Plate",
    description: "Dense, dark plate reverb — darkwave, industrial",
    category: "Reverb",
    effects: [{
      id: fxId(),
      category: "wasm",
      type: "MVerb",
      enabled: true,
      wet: 100,
      parameters: { damping: 0.8, density: 0.7, bandwidth: 0.3, decay: 0.85, predelay: 0.02, size: 0.9, gain: 1, mix: 1, earlyMix: 0.3 }
    }]
  },
  {
    name: "Spring Tank",
    description: "Dub spring reverb with drip",
    category: "Reverb",
    effects: [{
      id: fxId(),
      category: "wasm",
      type: "SpringReverb",
      enabled: true,
      wet: 100,
      parameters: { decay: 0.7, damping: 0.4, tension: 0.5, mix: 1, drip: 0.6, diffusion: 0.7 }
    }]
  },
  {
    name: "Tight Room",
    description: "Short, natural room — drums, percussion",
    category: "Reverb",
    effects: [{
      id: fxId(),
      category: "wasm",
      type: "MVerb",
      enabled: true,
      wet: 100,
      parameters: { damping: 0.6, density: 0.4, bandwidth: 0.7, decay: 0.3, predelay: 0, size: 0.3, gain: 1, mix: 1, earlyMix: 0.7 }
    }]
  },
  // ── Delay ─────────────────────────────────────────────────────────────
  {
    name: "Ambient Echo",
    description: "Filtered, darkening delay — ambient, *wave",
    category: "Delay",
    effects: [{
      id: fxId(),
      category: "tonejs",
      type: "AmbientDelay",
      enabled: true,
      wet: 100,
      parameters: { time: 375, feedback: 55, taps: 2, filterType: "lowpass", filterFreq: 2500, filterQ: 1.5, modRate: 25, modDepth: 15, stereoSpread: 50, diffusion: 25 }
    }]
  },
  {
    name: "Tape Echo",
    description: "Warm tape delay with wow/flutter — dub, lo-fi",
    category: "Delay",
    effects: [{
      id: fxId(),
      category: "wasm",
      type: "RETapeEcho",
      enabled: true,
      wet: 100,
      parameters: { mode: 3, repeatRate: 0.45, intensity: 0.55, echoVolume: 0.8, wow: 0.15, flutter: 0.1, dirt: 0.2, inputBleed: 0, loopAmount: 0, playheadFilter: 1 }
    }]
  },
  {
    name: "Stereo Ping Pong",
    description: "Bouncing L/R delay — wide stereo spread",
    category: "Delay",
    effects: [{
      id: fxId(),
      category: "tonejs",
      type: "PingPongDelay",
      enabled: true,
      wet: 100,
      parameters: { time: 250, feedback: 45 }
    }]
  },
  {
    name: "Space Echo",
    description: "Roland RE-201 multi-head — psychedelic, dub",
    category: "Delay",
    effects: [{
      id: fxId(),
      category: "tonejs",
      type: "SpaceEcho",
      enabled: true,
      wet: 100,
      parameters: { mode: 3, rate: 350, intensity: 0.55, echoVolume: 0.8, reverbVolume: 0.3, bass: 0.5, treble: 0.6 }
    }]
  },
  // ── Compression ───────────────────────────────────────────────────────
  {
    name: "Parallel Crush",
    description: "Heavy parallel compression — drums, full mix",
    category: "Compression",
    effects: [{
      id: fxId(),
      category: "tonejs",
      type: "Compressor",
      enabled: true,
      wet: 100,
      parameters: { threshold: -30, ratio: 20, attack: 3e-3, release: 0.1 }
    }]
  },
  {
    name: "Glue Bus",
    description: "Gentle bus compression — cohesion",
    category: "Compression",
    effects: [{
      id: fxId(),
      category: "tonejs",
      type: "Compressor",
      enabled: true,
      wet: 100,
      parameters: { threshold: -18, ratio: 4, attack: 0.01, release: 0.25 }
    }]
  },
  // ── Creative ──────────────────────────────────────────────────────────
  {
    name: "Granular Cloud",
    description: "Freeze moments into evolving textures",
    category: "Creative",
    effects: [{
      id: fxId(),
      category: "wasm",
      type: "GranularFreeze",
      enabled: true,
      wet: 100,
      parameters: { freeze: 0, grainSize: 80, density: 12, scatter: 40, pitch: 0, spray: 25, shimmer: 20, stereoWidth: 70, feedback: 10, captureLen: 600, attack: 5, release: 40, thru: 0 }
    }]
  },
  {
    name: "Lo-Fi Tape",
    description: "Worn cassette degradation on the bus",
    category: "Creative",
    effects: [{
      id: fxId(),
      category: "tonejs",
      type: "TapeDegradation",
      enabled: true,
      wet: 100,
      parameters: { wow: 35, flutter: 25, hiss: 20, dropouts: 5, saturation: 40, toneShift: 35 }
    }]
  },
  // ── Genre ─────────────────────────────────────────────────────────────
  {
    name: "*Wave Landscape",
    description: "Shimmer + ambient delay — complete *wave bus",
    category: "Genre",
    effects: [
      {
        id: fxId(),
        category: "wasm",
        type: "ShimmerReverb",
        enabled: true,
        wet: 100,
        parameters: { decay: 80, shimmer: 55, pitch: 12, damping: 45, size: 70, predelay: 25, modRate: 20, modDepth: 15 }
      },
      {
        id: fxId(),
        category: "tonejs",
        type: "AmbientDelay",
        enabled: true,
        wet: 40,
        parameters: { time: 500, feedback: 50, taps: 2, filterType: "lowpass", filterFreq: 2e3, filterQ: 1.2, modRate: 20, modDepth: 10, stereoSpread: 60, diffusion: 30 }
      }
    ]
  },
  {
    name: "Dub Chamber",
    description: "Spring reverb + tape echo — classic dub",
    category: "Genre",
    effects: [
      {
        id: fxId(),
        category: "wasm",
        type: "SpringReverb",
        enabled: true,
        wet: 100,
        parameters: { decay: 0.65, damping: 0.45, tension: 0.5, mix: 1, drip: 0.5, diffusion: 0.65 }
      },
      {
        id: fxId(),
        category: "tonejs",
        type: "SpaceEcho",
        enabled: true,
        wet: 60,
        parameters: { mode: 2, rate: 300, intensity: 0.5, echoVolume: 0.7, reverbVolume: 0.2, bass: 0.6, treble: 0.4 }
      }
    ]
  },
  {
    name: "Crystal Castles Void",
    description: "Shimmer + tape degradation — noisy, ethereal",
    category: "Genre",
    effects: [
      {
        id: fxId(),
        category: "wasm",
        type: "ShimmerReverb",
        enabled: true,
        wet: 100,
        parameters: { decay: 90, shimmer: 70, pitch: 12, damping: 30, size: 80, predelay: 10, modRate: 35, modDepth: 25 }
      },
      {
        id: fxId(),
        category: "tonejs",
        type: "TapeDegradation",
        enabled: true,
        wet: 50,
        parameters: { wow: 40, flutter: 30, hiss: 25, dropouts: 10, saturation: 45, toneShift: 25 }
      }
    ]
  }
];
function getSendBusPresetsByCategory() {
  const groups = {};
  for (const p of SEND_BUS_PRESETS) {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  }
  return groups;
}
export {
  CHANNEL_FX_PRESETS as C,
  SEND_BUS_PRESETS as S,
  getSendBusPresetsByCategory as a,
  getChannelFxPresetsByCategory as g
};
