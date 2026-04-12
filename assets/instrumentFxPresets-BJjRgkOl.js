const INSTRUMENT_FX_PRESETS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // SPACE — Reverb + delay combos for placing sounds in a space
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Small Room",
    description: "Tight early reflections — drums and percussive sounds",
    category: "Space",
    effects: [
      {
        category: "wasm",
        type: "MVerb",
        enabled: true,
        wet: 30,
        parameters: { damping: 0.7, density: 0.4, bandwidth: 0.8, decay: 0.2, predelay: 0, size: 0.25, gain: 1, mix: 0.4, earlyMix: 0.8 }
      }
    ]
  },
  {
    name: "Plate Shimmer",
    description: "Lush plate reverb with long tail — pads and vocals",
    category: "Space",
    effects: [
      {
        category: "wasm",
        type: "MVerb",
        enabled: true,
        wet: 45,
        parameters: { damping: 0.3, density: 0.8, bandwidth: 0.6, decay: 0.75, predelay: 0.02, size: 0.9, gain: 1, mix: 0.5, earlyMix: 0.3 }
      }
    ]
  },
  {
    name: "Cathedral",
    description: "Massive reverb for epic, cavernous sound",
    category: "Space",
    effects: [
      {
        category: "tonejs",
        type: "JCReverb",
        enabled: true,
        wet: 55,
        parameters: { roomSize: 0.9 }
      },
      {
        category: "tonejs",
        type: "Delay",
        enabled: true,
        wet: 18,
        parameters: { delayTime: 0.25, feedback: 0.3 }
      }
    ]
  },
  {
    name: "Spring Tank",
    description: "Classic dub spring reverb — metallic drip and splash",
    category: "Space",
    effects: [
      {
        category: "wasm",
        type: "SpringReverb",
        enabled: true,
        wet: 50,
        parameters: { decay: 0.6, damping: 0.35, tension: 0.5, mix: 0.4, drip: 0.7, diffusion: 0.6 }
      }
    ]
  },
  {
    name: "Ping Pong Hall",
    description: "Stereo bouncing delay into lush reverb — big stereo image",
    category: "Space",
    effects: [
      {
        category: "tonejs",
        type: "PingPongDelay",
        enabled: true,
        wet: 30,
        parameters: { delayTime: 0.3, feedback: 0.45, bpmSync: 1, syncDivision: "1/8" }
      },
      {
        category: "tonejs",
        type: "Reverb",
        enabled: true,
        wet: 35,
        parameters: { decay: 4, preDelay: 0.05 }
      }
    ]
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // DUB — Echo, delay, and filter effects for dub/reggae production
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Dub Siren Echo",
    description: "Space Echo with spring reverb — classic dub siren treatment",
    category: "Dub",
    effects: [
      {
        category: "tonejs",
        type: "SpaceEcho",
        enabled: true,
        wet: 50,
        parameters: { mode: 4, rate: 300, intensity: 0.65, echoVolume: 0.85, reverbVolume: 0.25, bpmSync: 1, syncDivision: "1/4" }
      },
      {
        category: "wasm",
        type: "SpringReverb",
        enabled: true,
        wet: 25,
        parameters: { decay: 0.5, damping: 0.4, tension: 0.45, mix: 0.35, drip: 0.6, diffusion: 0.7 }
      }
    ]
  },
  {
    name: "King Tubby Filter",
    description: "Resonant dub filter + echo — dramatic sweeps and drops",
    category: "Dub",
    effects: [
      {
        category: "tonejs",
        type: "DubFilter",
        enabled: true,
        wet: 100,
        parameters: { cutoff: 30, resonance: 20, gain: 1.3 }
      },
      {
        category: "tonejs",
        type: "SpaceEcho",
        enabled: true,
        wet: 35,
        parameters: { mode: 4, rate: 375, intensity: 0.5, echoVolume: 0.7, reverbVolume: 0.15, bpmSync: 1, syncDivision: "1/8d" }
      }
    ]
  },
  {
    name: "Phaser Dub",
    description: "Bi-Phase swirl + tape echo — spacey dub modulation",
    category: "Dub",
    effects: [
      {
        category: "tonejs",
        type: "BiPhase",
        enabled: true,
        wet: 35,
        parameters: { rateA: 0.3, depthA: 0.7, rateB: 3, depthB: 0.5, feedback: 0.4, routing: 0 }
      },
      {
        category: "tonejs",
        type: "SpaceEcho",
        enabled: true,
        wet: 40,
        parameters: { mode: 4, rate: 500, intensity: 0.6, echoVolume: 0.8, reverbVolume: 0.2, bpmSync: 1, syncDivision: "1/4" }
      }
    ]
  },
  {
    name: "Tape Echo Wash",
    description: "RE Tape Echo with wow and flutter — degraded repeats",
    category: "Dub",
    effects: [
      {
        category: "tonejs",
        type: "RETapeEcho",
        enabled: true,
        wet: 45,
        parameters: { mode: 3, repeatRate: 0.5, intensity: 0.6, echoVolume: 0.8, wow: 0.3, flutter: 0.2, dirt: 0.15, inputBleed: 0.05, loopAmount: 0, playheadFilter: 1 }
      }
    ]
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // LO-FI — Degradation, bit-crushing, vinyl, tape artifacts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "VHS Tape",
    description: "Wobbly vibrato + bit reduction + rolloff — old VHS audio",
    category: "Lo-Fi",
    effects: [
      {
        category: "tonejs",
        type: "BitCrusher",
        enabled: true,
        wet: 25,
        parameters: { bits: 12 }
      },
      {
        category: "tonejs",
        type: "Vibrato",
        enabled: true,
        wet: 30,
        parameters: { frequency: 4, depth: 0.08 }
      },
      {
        category: "tonejs",
        type: "Filter",
        enabled: true,
        wet: 100,
        parameters: { frequency: 6e3, type: "lowpass", Q: 0.5 }
      }
    ]
  },
  {
    name: "Vinyl Record",
    description: "Full vinyl simulation — crackle, dust, RIAA EQ, worn stylus",
    category: "Lo-Fi",
    effects: [
      {
        category: "wasm",
        type: "VinylNoise",
        enabled: true,
        wet: 40,
        parameters: { hiss: 40, dust: 50, age: 40, speed: 5.5, riaa: 55, stylusResonance: 45, wornStylus: 30, pinch: 30, innerGroove: 20, ghostEcho: 15, dropout: 8, warp: 8, eccentricity: 15 }
      }
    ]
  },
  {
    name: "Broken Sampler",
    description: "Heavy bit-crush + distortion — 8-bit destruction",
    category: "Lo-Fi",
    effects: [
      {
        category: "tonejs",
        type: "BitCrusher",
        enabled: true,
        wet: 55,
        parameters: { bits: 6 }
      },
      {
        category: "tonejs",
        type: "Distortion",
        enabled: true,
        wet: 30,
        parameters: { distortion: 0.4 }
      },
      {
        category: "tonejs",
        type: "Filter",
        enabled: true,
        wet: 100,
        parameters: { frequency: 5e3, type: "lowpass", Q: 1.5 }
      }
    ]
  },
  {
    name: "Cassette Dub",
    description: "Tape sim + delay — dubbed-to-tape degradation with echo",
    category: "Lo-Fi",
    effects: [
      {
        category: "wasm",
        type: "TapeSimulator",
        enabled: true,
        wet: 50,
        parameters: { drive: 35, character: 50, bias: 50, shame: 30, hiss: 25, speed: 0 }
      },
      {
        category: "tonejs",
        type: "FeedbackDelay",
        enabled: true,
        wet: 22,
        parameters: { delayTime: 0.3, feedback: 0.3 }
      }
    ]
  },
  {
    name: "Turntable",
    description: "ToneArm vinyl playback — wow, flutter, cartridge coloring",
    category: "Lo-Fi",
    effects: [
      {
        category: "wasm",
        type: "ToneArm",
        enabled: true,
        wet: 50,
        parameters: { wow: 25, coil: 55, flutter: 20, riaa: 60, stylus: 35, hiss: 15, pops: 12, rpm: 33.333 }
      }
    ]
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // GRIT — Distortion, saturation, overdrive for adding edge
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Warm Overdrive",
    description: "Tape saturation + gentle filter — warm crunch without harshness",
    category: "Grit",
    effects: [
      {
        category: "tonejs",
        type: "TapeSaturation",
        enabled: true,
        wet: 60,
        parameters: { drive: 55, tone: 9e3 }
      },
      {
        category: "tonejs",
        type: "Filter",
        enabled: true,
        wet: 100,
        parameters: { frequency: 1e4, type: "lowpass", Q: 0.7 }
      }
    ]
  },
  {
    name: "Industrial",
    description: "Harsh distortion + hard compression — aggressive and metallic",
    category: "Grit",
    effects: [
      {
        category: "tonejs",
        type: "Distortion",
        enabled: true,
        wet: 50,
        parameters: { distortion: 0.65 }
      },
      {
        category: "tonejs",
        type: "Compressor",
        enabled: true,
        wet: 100,
        parameters: { threshold: -10, ratio: 8, attack: 1e-3, release: 0.08 }
      },
      {
        category: "tonejs",
        type: "EQ3",
        enabled: true,
        wet: 100,
        parameters: { low: 3, mid: 2, high: 4 }
      }
    ]
  },
  {
    name: "Fuzz Box",
    description: "Chebyshev waveshaper — thick fuzzy harmonics",
    category: "Grit",
    effects: [
      {
        category: "tonejs",
        type: "Chebyshev",
        enabled: true,
        wet: 55,
        parameters: { order: 6 }
      },
      {
        category: "tonejs",
        type: "Filter",
        enabled: true,
        wet: 100,
        parameters: { frequency: 7e3, type: "lowpass", Q: 1 }
      }
    ]
  },
  {
    name: "Acid Screamer",
    description: "Moog filter + distortion — resonant acid squelch",
    category: "Grit",
    effects: [
      {
        category: "wasm",
        type: "MoogFilter",
        enabled: true,
        wet: 100,
        parameters: { cutoff: 2e3, resonance: 70, drive: 0.6, model: 0, filterMode: 0 }
      },
      {
        category: "tonejs",
        type: "Distortion",
        enabled: true,
        wet: 25,
        parameters: { distortion: 0.3 }
      }
    ]
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // MODULATION — Chorus, phaser, tremolo, rotary for movement
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Thick Chorus",
    description: "Deep chorus + widener — lush detuned thickening",
    category: "Modulation",
    effects: [
      {
        category: "tonejs",
        type: "Chorus",
        enabled: true,
        wet: 45,
        parameters: { frequency: 0.5, depth: 0.6 }
      },
      {
        category: "tonejs",
        type: "StereoWidener",
        enabled: true,
        wet: 100,
        parameters: { width: 0.6 }
      }
    ]
  },
  {
    name: "Leslie Cabinet",
    description: "Rotary speaker simulation — organ/keys dream effect",
    category: "Modulation",
    effects: [
      {
        category: "wasm",
        type: "Leslie",
        enabled: true,
        wet: 60,
        parameters: { speed: 1, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.7, drumDepth: 0.5, doppler: 0.6, width: 0.8, acceleration: 0.5 }
      }
    ]
  },
  {
    name: "Phaser Jet",
    description: "Deep bi-phase sweep — classic jet phaser sound",
    category: "Modulation",
    effects: [
      {
        category: "tonejs",
        type: "BiPhase",
        enabled: true,
        wet: 50,
        parameters: { rateA: 0.2, depthA: 0.8, rateB: 0.15, depthB: 0.9, feedback: 0.6, routing: 1 }
      }
    ]
  },
  {
    name: "Tremolo Gate",
    description: "Fast tremolo + auto-panner — rhythmic gating and movement",
    category: "Modulation",
    effects: [
      {
        category: "tonejs",
        type: "Tremolo",
        enabled: true,
        wet: 70,
        parameters: { frequency: 8, depth: 0.8 }
      },
      {
        category: "tonejs",
        type: "AutoPanner",
        enabled: true,
        wet: 40,
        parameters: { frequency: 2 }
      }
    ]
  },
  {
    name: "Wah Sweep",
    description: "Auto-wah + phaser — funky envelope-following filter",
    category: "Modulation",
    effects: [
      {
        category: "tonejs",
        type: "AutoWah",
        enabled: true,
        wet: 65,
        parameters: { baseFrequency: 300, octaves: 4, sensitivity: -20, Q: 4 }
      },
      {
        category: "tonejs",
        type: "Phaser",
        enabled: true,
        wet: 20,
        parameters: { frequency: 0.5, octaves: 3, baseFrequency: 500, Q: 4 }
      }
    ]
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // AMBIENT — Ethereal, atmospheric, otherworldly
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Ambient Space",
    description: "Long reverb + ping-pong delay — infinite soundscape",
    category: "Ambient",
    effects: [
      {
        category: "tonejs",
        type: "Reverb",
        enabled: true,
        wet: 50,
        parameters: { decay: 6, preDelay: 0.06 }
      },
      {
        category: "tonejs",
        type: "PingPongDelay",
        enabled: true,
        wet: 30,
        parameters: { delayTime: 0.4, feedback: 0.5, bpmSync: 1, syncDivision: "1/4d" }
      }
    ]
  },
  {
    name: "Dreamy Haze",
    description: "Chorus + long reverb + LP filter — soft and floaty",
    category: "Ambient",
    effects: [
      {
        category: "tonejs",
        type: "Chorus",
        enabled: true,
        wet: 35,
        parameters: { frequency: 0.3, depth: 0.5 }
      },
      {
        category: "tonejs",
        type: "Reverb",
        enabled: true,
        wet: 55,
        parameters: { decay: 6, preDelay: 0.08 }
      },
      {
        category: "tonejs",
        type: "Filter",
        enabled: true,
        wet: 100,
        parameters: { frequency: 5e3, type: "lowpass", Q: 0.5 }
      }
    ]
  },
  {
    name: "Underwater",
    description: "Deep LP filter + chorus + reverb — submerged and murky",
    category: "Ambient",
    effects: [
      {
        category: "tonejs",
        type: "Filter",
        enabled: true,
        wet: 100,
        parameters: { frequency: 1200, type: "lowpass", Q: 2 }
      },
      {
        category: "tonejs",
        type: "Chorus",
        enabled: true,
        wet: 40,
        parameters: { frequency: 0.4, depth: 0.6 }
      },
      {
        category: "tonejs",
        type: "Reverb",
        enabled: true,
        wet: 50,
        parameters: { decay: 4, preDelay: 0.03 }
      }
    ]
  },
  {
    name: "Frozen",
    description: "Massive plate + pitch shift + delay — glacial, crystalline",
    category: "Ambient",
    effects: [
      {
        category: "tonejs",
        type: "PitchShift",
        enabled: true,
        wet: 20,
        parameters: { pitch: 12, windowSize: 0.1, delayTime: 0, feedback: 0.1 }
      },
      {
        category: "wasm",
        type: "MVerb",
        enabled: true,
        wet: 60,
        parameters: { damping: 0.2, density: 0.9, bandwidth: 0.4, decay: 0.9, predelay: 0.05, size: 1, gain: 1, mix: 0.5, earlyMix: 0.2 }
      },
      {
        category: "tonejs",
        type: "FeedbackDelay",
        enabled: true,
        wet: 25,
        parameters: { delayTime: 0.5, feedback: 0.55 }
      }
    ]
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // TEXTURE — Complex layered processing for unique character
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Radiowave",
    description: "Bandpass filter + bit-crush + tremolo — AM radio transmission",
    category: "Texture",
    effects: [
      {
        category: "tonejs",
        type: "Filter",
        enabled: true,
        wet: 100,
        parameters: { frequency: 2e3, type: "bandpass", Q: 3 }
      },
      {
        category: "tonejs",
        type: "BitCrusher",
        enabled: true,
        wet: 20,
        parameters: { bits: 10 }
      },
      {
        category: "tonejs",
        type: "Tremolo",
        enabled: true,
        wet: 15,
        parameters: { frequency: 0.2, depth: 0.3 }
      }
    ]
  },
  {
    name: "Haunted",
    description: "Pitch shift down + spring reverb + distortion — horror texture",
    category: "Texture",
    effects: [
      {
        category: "tonejs",
        type: "PitchShift",
        enabled: true,
        wet: 30,
        parameters: { pitch: -5, windowSize: 0.08, delayTime: 0.05, feedback: 0.2 }
      },
      {
        category: "wasm",
        type: "SpringReverb",
        enabled: true,
        wet: 40,
        parameters: { decay: 0.7, damping: 0.3, tension: 0.6, mix: 0.4, drip: 0.8, diffusion: 0.5 }
      },
      {
        category: "tonejs",
        type: "Distortion",
        enabled: true,
        wet: 15,
        parameters: { distortion: 0.2 }
      }
    ]
  },
  {
    name: "Cosmic",
    description: "Frequency shifter + delay + reverb — alien transmission",
    category: "Texture",
    effects: [
      {
        category: "tonejs",
        type: "FrequencyShifter",
        enabled: true,
        wet: 35,
        parameters: { frequency: 50 }
      },
      {
        category: "tonejs",
        type: "PingPongDelay",
        enabled: true,
        wet: 35,
        parameters: { delayTime: 0.3, feedback: 0.5 }
      },
      {
        category: "tonejs",
        type: "Reverb",
        enabled: true,
        wet: 40,
        parameters: { decay: 5, preDelay: 0.04 }
      }
    ]
  },
  {
    name: "Moog Acid",
    description: "Moog ladder filter + Leslie rotary — squelchy and swirling",
    category: "Texture",
    effects: [
      {
        category: "wasm",
        type: "MoogFilter",
        enabled: true,
        wet: 100,
        parameters: { cutoff: 1500, resonance: 60, drive: 0.4, model: 0, filterMode: 0 }
      },
      {
        category: "wasm",
        type: "Leslie",
        enabled: true,
        wet: 30,
        parameters: { speed: 1, hornRate: 6, drumRate: 5.5, hornDepth: 0.5, drumDepth: 0.3, doppler: 0.4, width: 0.7, acceleration: 0.5 }
      }
    ]
  },
  {
    name: "Shoegaze",
    description: "Chorus + distortion + massive reverb — wall of sound",
    category: "Texture",
    effects: [
      {
        category: "tonejs",
        type: "Chorus",
        enabled: true,
        wet: 40,
        parameters: { frequency: 0.8, depth: 0.7 }
      },
      {
        category: "tonejs",
        type: "TapeSaturation",
        enabled: true,
        wet: 40,
        parameters: { drive: 50, tone: 8e3 }
      },
      {
        category: "tonejs",
        type: "Reverb",
        enabled: true,
        wet: 60,
        parameters: { decay: 7, preDelay: 0.04 }
      }
    ]
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // AMP — Neural amp modeling and amp simulations
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Clean Fender",
    description: "Princeton clean — sparkling Fender cleans with tube shimmer",
    category: "Amp",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 80,
        neuralModelIndex: 14,
        parameters: { drive: 25, level: 75, presence: 55, dryWet: 80 }
      },
      {
        category: "wasm",
        type: "SpringReverb",
        enabled: true,
        wet: 25,
        parameters: { decay: 0.4, damping: 0.5, tension: 0.4, mix: 0.3, drip: 0.3, diffusion: 0.6 }
      }
    ]
  },
  {
    name: "Crunch Marshall",
    description: "Blackstar HT40 gain channel — British crunch and growl",
    category: "Amp",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 85,
        neuralModelIndex: 16,
        parameters: { drive: 55, level: 65, presence: 60, dryWet: 85 }
      },
      {
        category: "tonejs",
        type: "EQ3",
        enabled: true,
        wet: 100,
        parameters: { low: 2, mid: 1, high: 2 }
      }
    ]
  },
  {
    name: "High Gain Mesa",
    description: "Mesa Mini Rectifier — tight modern high gain with aggressive mids",
    category: "Amp",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 90,
        neuralModelIndex: 11,
        parameters: { drive: 70, level: 60, presence: 55, dryWet: 90 }
      },
      {
        category: "tonejs",
        type: "Compressor",
        enabled: true,
        wet: 100,
        parameters: { threshold: -12, ratio: 4, attack: 3e-3, release: 0.1 }
      }
    ]
  },
  {
    name: "Dumble Lead",
    description: "Dumble high gain — smooth, singing lead tones with infinite sustain",
    category: "Amp",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 85,
        neuralModelIndex: 15,
        parameters: { drive: 65, level: 65, presence: 50, dryWet: 85 }
      },
      {
        category: "tonejs",
        type: "FeedbackDelay",
        enabled: true,
        wet: 20,
        parameters: { delayTime: 0.35, feedback: 0.3 }
      },
      {
        category: "wasm",
        type: "MVerb",
        enabled: true,
        wet: 20,
        parameters: { damping: 0.4, density: 0.6, bandwidth: 0.6, decay: 0.4, predelay: 0.02, size: 0.5, gain: 1, mix: 0.35, earlyMix: 0.5 }
      }
    ]
  },
  {
    name: "Sovtek Doom",
    description: "Sovtek 50 + DOD boost — massive Russian tube doom/stoner sound",
    category: "Amp",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 90,
        neuralModelIndex: 27,
        parameters: { drive: 75, level: 55, presence: 40, dryWet: 90 }
      },
      {
        category: "tonejs",
        type: "EQ3",
        enabled: true,
        wet: 100,
        parameters: { low: 5, mid: 2, high: -1 }
      }
    ]
  },
  {
    name: "BadCat Jazz",
    description: "BadCat 50 clean — warm, round jazz tones with lush reverb",
    category: "Amp",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 75,
        neuralModelIndex: 23,
        parameters: { drive: 15, level: 80, presence: 40, dryWet: 75 }
      },
      {
        category: "tonejs",
        type: "Chorus",
        enabled: true,
        wet: 15,
        parameters: { frequency: 0.3, depth: 0.2 }
      },
      {
        category: "wasm",
        type: "MVerb",
        enabled: true,
        wet: 30,
        parameters: { damping: 0.3, density: 0.7, bandwidth: 0.5, decay: 0.5, predelay: 0.03, size: 0.6, gain: 1, mix: 0.4, earlyMix: 0.4 }
      }
    ]
  },
  {
    name: "ENGL Metal",
    description: "ENGL E645 with boost — tight European metal tone",
    category: "Amp",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 90,
        neuralModelIndex: 28,
        parameters: { drive: 70, level: 60, presence: 65, dryWet: 90 }
      },
      {
        category: "tonejs",
        type: "Compressor",
        enabled: true,
        wet: 100,
        parameters: { threshold: -10, ratio: 6, attack: 2e-3, release: 0.08 }
      },
      {
        category: "tonejs",
        type: "EQ3",
        enabled: true,
        wet: 100,
        parameters: { low: 3, mid: 2, high: 3 }
      }
    ]
  },
  {
    name: "Supro Bold Crunch",
    description: "Supro Bold amp — gritty vintage American crunch with character",
    category: "Amp",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 80,
        neuralModelIndex: 32,
        parameters: { drive: 50, level: 70, presence: 50, dryWet: 80 }
      },
      {
        category: "tonejs",
        type: "Tremolo",
        enabled: true,
        wet: 20,
        parameters: { frequency: 3.5, depth: 0.3 }
      },
      {
        category: "wasm",
        type: "SpringReverb",
        enabled: true,
        wet: 20,
        parameters: { decay: 0.4, damping: 0.5, tension: 0.5, mix: 0.25, drip: 0.4, diffusion: 0.6 }
      }
    ]
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // GUITAR — Pedalboard chains (neural pedals + amps + FX)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "TS9 + Spring",
    description: "Tube Screamer into spring reverb — classic blues/rock pedalboard",
    category: "Guitar",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 70,
        neuralModelIndex: 0,
        parameters: { drive: 50, tone: 55, level: 70, dryWet: 70 }
      },
      {
        category: "wasm",
        type: "SpringReverb",
        enabled: true,
        wet: 30,
        parameters: { decay: 0.5, damping: 0.4, tension: 0.5, mix: 0.35, drip: 0.5, diffusion: 0.6 }
      }
    ]
  },
  {
    name: "Big Muff Doom",
    description: "Big Muff V6 + massive reverb — wall of fuzzy doom",
    category: "Guitar",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 85,
        neuralModelIndex: 36,
        parameters: { drive: 70, tone: 40, level: 60, dryWet: 85 }
      },
      {
        category: "tonejs",
        type: "EQ3",
        enabled: true,
        wet: 100,
        parameters: { low: 4, mid: 1, high: -1 }
      },
      {
        category: "tonejs",
        type: "Reverb",
        enabled: true,
        wet: 35,
        parameters: { decay: 5, preDelay: 0.04 }
      }
    ]
  },
  {
    name: "RAT + Delay",
    description: "ProCo RAT distortion into feedback delay — aggressive post-punk",
    category: "Guitar",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 80,
        neuralModelIndex: 4,
        parameters: { drive: 60, tone: 50, level: 65, dryWet: 80 }
      },
      {
        category: "tonejs",
        type: "FeedbackDelay",
        enabled: true,
        wet: 30,
        parameters: { delayTime: 0.35, feedback: 0.45 }
      }
    ]
  },
  {
    name: "Prince Of Tone",
    description: "Analog Man Prince of Tone — transparent overdrive for any genre",
    category: "Guitar",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 75,
        neuralModelIndex: 18,
        parameters: { drive: 45, tone: 55, level: 70, dryWet: 75 }
      },
      {
        category: "tonejs",
        type: "Chorus",
        enabled: true,
        wet: 15,
        parameters: { frequency: 0.5, depth: 0.3 }
      }
    ]
  },
  {
    name: "Revv G3 Chug",
    description: "Revv G3 tight distortion — modern metal chug machine",
    category: "Guitar",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 90,
        neuralModelIndex: 7,
        parameters: { drive: 70, tone: 55, level: 60, dryWet: 90 }
      },
      {
        category: "tonejs",
        type: "Compressor",
        enabled: true,
        wet: 100,
        parameters: { threshold: -10, ratio: 6, attack: 2e-3, release: 0.08 }
      }
    ]
  },
  {
    name: "Friedman Sizzle",
    description: "Friedman BE-OD — searing high-gain overdrive with presence",
    category: "Guitar",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 85,
        neuralModelIndex: 9,
        parameters: { drive: 65, tone: 60, level: 65, dryWet: 85 }
      },
      {
        category: "tonejs",
        type: "PingPongDelay",
        enabled: true,
        wet: 15,
        parameters: { delayTime: 0.3, feedback: 0.3, bpmSync: 1, syncDivision: "1/8" }
      },
      {
        category: "wasm",
        type: "MVerb",
        enabled: true,
        wet: 15,
        parameters: { damping: 0.5, density: 0.5, bandwidth: 0.7, decay: 0.3, predelay: 0, size: 0.35, gain: 1, mix: 0.3, earlyMix: 0.7 }
      }
    ]
  },
  {
    name: "Aguilar Bass Grit",
    description: "Aguilar Agro bright + compressor — punchy bass distortion",
    category: "Guitar",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 70,
        neuralModelIndex: 21,
        parameters: { drive: 45, tone: 55, level: 70, dryWet: 70 }
      },
      {
        category: "tonejs",
        type: "Compressor",
        enabled: true,
        wet: 100,
        parameters: { threshold: -14, ratio: 4, attack: 5e-3, release: 0.12 }
      },
      {
        category: "tonejs",
        type: "EQ3",
        enabled: true,
        wet: 100,
        parameters: { low: 4, mid: 1, high: 0 }
      }
    ]
  },
  {
    name: "Goat + Leslie",
    description: "Goat Pedal fuzz into Leslie rotary — psychedelic swirl",
    category: "Guitar",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 75,
        neuralModelIndex: 33,
        parameters: { drive: 55, tone: 50, level: 65, dryWet: 75 }
      },
      {
        category: "wasm",
        type: "Leslie",
        enabled: true,
        wet: 45,
        parameters: { speed: 1, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.7, drumDepth: 0.5, doppler: 0.6, width: 0.8, acceleration: 0.5 }
      }
    ]
  },
  {
    name: "Rain Ambience",
    description: "Tumult rain noise layer — subtle rain texture behind the instrument",
    category: "Texture",
    effects: [
      {
        category: "wasm",
        type: "Tumult",
        enabled: true,
        wet: 30,
        parameters: { noiseGain: -18, mix: 0.3, noiseMode: 0, sourceMode: 0, switchBranch: 0, duckThreshold: -25, duckAttack: 0, duckRelease: 20, followThreshold: -20, followAttack: 0, followRelease: 15, followAmount: 0.5, clipAmount: 0.3, hpEnable: 1, hpFreq: 400, hpQ: 0.7, peak1Enable: 0, peak1Type: 0, peak1Freq: 20, peak1Gain: 0, peak1Q: 0.7, peak2Enable: 0, peak2Freq: 600, peak2Gain: 0, peak2Q: 1, peak3Enable: 0, peak3Type: 1, peak3Freq: 2500, peak3Gain: 0, peak3Q: 1, lpEnable: 1, lpFreq: 6e3, lpQ: 0.7, sampleIndex: 0, playerStart: 0, playerEnd: 1, playerFade: 0.01, playerGain: 0 }
      }
    ]
  },
  {
    name: "Spacey Delay",
    description: "SpaceyDelayer multi-tap shimmer — celestial delay trails",
    category: "Space",
    effects: [
      {
        category: "tonejs",
        type: "SpaceyDelayer",
        enabled: true,
        wet: 45,
        parameters: { time: 0.4, feedback: 0.55, tone: 0.6, modDepth: 0.3, modRate: 0.5, shimmer: 0.4, width: 0.7, mix: 0.5 }
      },
      {
        category: "wasm",
        type: "MVerb",
        enabled: true,
        wet: 20,
        parameters: { damping: 0.3, density: 0.7, bandwidth: 0.5, decay: 0.6, predelay: 0.04, size: 0.7, gain: 1, mix: 0.35, earlyMix: 0.3 }
      }
    ]
  },
  {
    name: "Buzz Chorus Wash",
    description: "FSM White Chorus + Freeverb — shimmering Buzz machine FX",
    category: "Modulation",
    effects: [
      {
        category: "buzzmachine",
        type: "BuzzWhiteChorus",
        enabled: true,
        wet: 45,
        parameters: {}
      },
      {
        category: "buzzmachine",
        type: "BuzzFreeverb",
        enabled: true,
        wet: 30,
        parameters: {}
      }
    ]
  },
  {
    name: "El Coyote Blues",
    description: "El Coyote crunch amp + spring + tremolo — desert blues tone",
    category: "Amp",
    effects: [
      {
        category: "neural",
        type: "Neural",
        enabled: true,
        wet: 80,
        neuralModelIndex: 31,
        parameters: { drive: 45, level: 70, presence: 50, dryWet: 80 }
      },
      {
        category: "tonejs",
        type: "Tremolo",
        enabled: true,
        wet: 25,
        parameters: { frequency: 4, depth: 0.4 }
      },
      {
        category: "wasm",
        type: "SpringReverb",
        enabled: true,
        wet: 25,
        parameters: { decay: 0.5, damping: 0.4, tension: 0.5, mix: 0.3, drip: 0.5, diffusion: 0.6 }
      }
    ]
  }
];
export {
  INSTRUMENT_FX_PRESETS as I
};
