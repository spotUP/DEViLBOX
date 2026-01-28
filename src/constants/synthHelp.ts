/**
 * Synth Help - Detailed documentation for each synth type
 * Provides tutorials, parameter explanations, and usage tips
 */

import type { SynthType } from '@typedefs/instrument';

export interface SynthHelp {
  overview: string;
  keyParameters: { name: string; description: string }[];
  tips: string[];
  trackerUsage?: string;
}

export const SYNTH_HELP: Record<SynthType, SynthHelp> = {
  TB303: {
    overview: `The TB-303 is the legendary acid bass synthesizer. It creates squelchy, resonant bass lines
by sweeping a low-pass filter with high resonance. The filter envelope "envelope mod" (Env Mod) determines
how much the filter opens on each note, while resonance adds that characteristic "acid" squelch.`,
    keyParameters: [
      { name: 'Cutoff', description: 'Base filter frequency. Lower = darker, higher = brighter.' },
      { name: 'Resonance', description: 'Filter emphasis at cutoff. High values create the classic acid squelch.' },
      { name: 'Env Mod', description: 'How much the envelope opens the filter. The key to acid sound.' },
      { name: 'Decay', description: 'How quickly the filter closes after note attack.' },
      { name: 'Accent', description: 'Velocity sensitivity - accented notes are louder and brighter.' },
      { name: 'Slide', description: 'Portamento time - creates the classic 303 slide between notes.' },
    ],
    tips: [
      'Start with high resonance (70-90%) and medium env mod (50-70%) for classic acid.',
      'Use short decay (100-300ms) for plucky bass, longer (500ms+) for smoother lines.',
      'The 303 is monophonic - use single notes, not chords.',
      'Accent certain notes in your pattern for rhythmic variation.',
      'Enable slide between notes for smooth glides - essential for acid.',
    ],
    trackerUsage: 'Use note slides (3xx) and volume commands for accent variation.',
  },

  MonoSynth: {
    overview: `A classic monophonic synthesizer with a single oscillator, filter, and ADSR envelopes.
Perfect for bass lines and lead melodies. The portamento (glide) lets notes slide smoothly into each other.`,
    keyParameters: [
      { name: 'Waveform', description: 'Oscillator shape: Saw (bright), Square (hollow), Triangle (soft), Sine (pure).' },
      { name: 'Filter Frequency', description: 'Cutoff frequency of the low-pass filter.' },
      { name: 'Filter Q', description: 'Resonance/emphasis at the cutoff frequency.' },
      { name: 'Portamento', description: 'Time to glide between notes. 0 = instant.' },
      { name: 'ADSR', description: 'Attack, Decay, Sustain, Release - shapes the amplitude over time.' },
    ],
    tips: [
      'Saw waves are great for bass and cutting leads.',
      'Square waves work well for hollow bass and chiptune-style sounds.',
      'Use portamento for smooth legato lines.',
      'Keep attack short (0-20ms) for punchy bass.',
    ],
    trackerUsage: 'Use portamento effect (3xx) for glides between notes.',
  },

  Synth: {
    overview: `A basic polyphonic synthesizer that can play multiple notes simultaneously.
Simple but versatile, great for chords and pads.`,
    keyParameters: [
      { name: 'Waveform', description: 'Base oscillator shape - determines the raw tone character.' },
      { name: 'Detune', description: 'Slight pitch offset in cents for thickness.' },
      { name: 'ADSR', description: 'Envelope controlling volume shape of each note.' },
    ],
    tips: [
      'Use longer attack and release for smooth pads.',
      'Add slight detune (5-15 cents) for a fuller sound.',
      'Works well layered with other synths.',
    ],
  },

  DuoSynth: {
    overview: `Two oscillators with independent settings that can be mixed together.
Creates rich, harmonically complex sounds through the interplay of two voices.`,
    keyParameters: [
      { name: 'Voice 0/1 Frequency', description: 'Pitch multiplier for each oscillator (1 = unison).' },
      { name: 'Harmonicity', description: 'Frequency ratio between voices. Integer values = consonant, fractional = dissonant.' },
      { name: 'Vibrato Rate/Depth', description: 'LFO modulating pitch for expressive wobble.' },
    ],
    tips: [
      'Set harmonicity to 0.5 for sub-octave thickness.',
      'Use harmonicity of 2 for octave doubling.',
      'Slight vibrato adds life to sustained notes.',
      'Great for detuned leads and wide pads.',
    ],
  },

  FMSynth: {
    overview: `Frequency Modulation synthesis creates complex harmonic tones by using one oscillator (modulator)
to modulate another (carrier). Famous for electric pianos, bells, and metallic sounds.`,
    keyParameters: [
      { name: 'Harmonicity', description: 'Frequency ratio between modulator and carrier. Integer = harmonic, fractional = inharmonic/bell-like.' },
      { name: 'Modulation Index', description: 'Amount of FM - higher values = more harmonics/brightness.' },
      { name: 'Modulator Envelope', description: 'Controls how modulation changes over time.' },
    ],
    tips: [
      'Low modulation index (1-3) for subtle warmth.',
      'High modulation index (5+) for metallic/bell tones.',
      'Harmonicity of 1 = basic FM, 2-4 = harmonic overtones, non-integer = bells.',
      'Fast modulator decay creates plucky "DX7" sounds.',
      'Try harmonicity 3.5 or 7 for classic bell tones.',
    ],
    trackerUsage: 'Modulation index can be automated with effect commands for evolving timbres.',
  },

  AMSynth: {
    overview: `Amplitude Modulation synthesis creates tremolo and ring modulation effects.
One oscillator modulates the volume of another, creating characteristic sidebands.`,
    keyParameters: [
      { name: 'Harmonicity', description: 'Frequency ratio of modulator. Affects sideband frequencies.' },
      { name: 'Modulator Envelope', description: 'Shape of the AM intensity over time.' },
    ],
    tips: [
      'Low harmonicity (0.5-2) for subtle tremolo.',
      'Higher harmonicity for more obvious ring mod character.',
      'Works great for atmospheric and sci-fi sounds.',
    ],
  },

  PluckSynth: {
    overview: `Karplus-Strong synthesis simulates plucked strings by feeding filtered noise through a delay line.
Creates realistic plucked string sounds without samples.`,
    keyParameters: [
      { name: 'Attack Time', description: 'Initial "pluck" noise burst duration.' },
      { name: 'Damping', description: 'How quickly high frequencies decay - more damping = duller tone.' },
      { name: 'Resonance', description: 'Sustain and brightness of the string.' },
    ],
    tips: [
      'Short attack + high damping = nylon guitar.',
      'Longer attack + low damping = steel strings.',
      'Great for harps, pizzicato, and ethnic strings.',
      'Lower notes naturally sustain longer (like real strings).',
    ],
  },

  MembraneSynth: {
    overview: `Simulates drum membranes like kick drums and toms. Uses a pitched oscillator with
rapid pitch decay to create the characteristic "thump" of drum heads.`,
    keyParameters: [
      { name: 'Pitch Decay', description: 'How fast the pitch drops. Fast = punchy kick, slow = tom.' },
      { name: 'Octaves', description: 'Range of pitch sweep from high to low.' },
      { name: 'Sustain', description: 'How long the drum resonates after hit.' },
    ],
    tips: [
      'Fast pitch decay + high octaves = punchy 808-style kick.',
      'Slower decay + lower octaves = boomy floor tom.',
      'Add distortion for aggressive electronic kicks.',
      'Trigger at different pitches for tom fills.',
    ],
  },

  MetalSynth: {
    overview: `Creates metallic percussion sounds like hi-hats, cymbals, and bells.
Uses multiple harmonically-related oscillators to create complex inharmonic spectra.`,
    keyParameters: [
      { name: 'Frequency', description: 'Base pitch of the metallic sound.' },
      { name: 'Harmonicity', description: 'Spacing of harmonics - affects the metallic character.' },
      { name: 'Modulators', description: 'Number of oscillators contributing to the sound.' },
      { name: 'Resonance', description: 'Ring/sustain of the metal.' },
    ],
    tips: [
      'Higher frequency = higher pitched cymbals.',
      'More modulators = more complex/realistic metal.',
      'Short envelope = hi-hat, long = crash cymbal.',
      'Lower resonance = duller, muted hits.',
    ],
  },

  NoiseSynth: {
    overview: `Filtered noise generator perfect for snares, hi-hats, and sound effects.
The filter shapes the noise character while the envelope controls its duration.`,
    keyParameters: [
      { name: 'Noise Type', description: 'White (full spectrum), Pink (darker), Brown (very dark).' },
      { name: 'Filter Frequency', description: 'Cutoff - higher = brighter noise.' },
      { name: 'ADSR', description: 'Shape of the noise burst.' },
    ],
    tips: [
      'Fast attack/decay = snare crack or hi-hat.',
      'Longer envelope = crash or riser.',
      'Use bandpass filter for telephone/radio effect.',
      'Pink noise is less harsh for most uses.',
    ],
  },

  Wavetable: {
    overview: `Wavetable synthesis scans through different waveforms, creating evolving timbres.
Modern EDM staple for basslines, leads, and pads.`,
    keyParameters: [
      { name: 'Wavetable', description: 'The set of waveforms to scan through.' },
      { name: 'Position', description: 'Current position in the wavetable (can be modulated).' },
      { name: 'Morph', description: 'Speed/amount of automatic wavetable scanning.' },
      { name: 'Unison', description: 'Multiple detuned voices for width.' },
    ],
    tips: [
      'Automate wavetable position for evolving sounds.',
      'High unison + detune = massive EDM leads.',
      'Try different wavetables for different characters.',
      'Combine with filter movement for extra motion.',
    ],
    trackerUsage: 'Use effect commands to automate wavetable position over time.',
  },

  Sampler: {
    overview: `Plays audio samples pitched across the keyboard. The sample is mapped to a base note
and transposed chromatically. Perfect for realistic instruments and one-shots.`,
    keyParameters: [
      { name: 'Sample', description: 'The loaded audio file.' },
      { name: 'Base Note', description: 'The note at which the sample plays at original pitch (usually C4).' },
      { name: 'Loop', description: 'Enable looping for sustained notes.' },
      { name: 'ADSR', description: 'Volume envelope applied to the sample.' },
    ],
    tips: [
      'Set base note to match the original pitch of your sample.',
      'Enable loop for sustaining instruments like pads.',
      'Short samples work well for drums and percussion.',
      'Long attack smooths the sample start.',
    ],
    trackerUsage: 'Use note commands to trigger, volume column for velocity, offset (9xx) to start playback mid-sample.',
  },

  Player: {
    overview: `Simple one-shot sample player. Plays the full sample from start to end without pitch transposition.
Ideal for loops, vocal samples, and sound effects.`,
    keyParameters: [
      { name: 'Sample', description: 'The loaded audio file.' },
      { name: 'Playback Rate', description: 'Speed multiplier (1 = normal, 2 = double speed).' },
      { name: 'Loop', description: 'Loop the sample continuously.' },
    ],
    tips: [
      'Use for drum loops that should stay at original tempo.',
      'Adjust playback rate to match your song tempo.',
      'Great for vocal phrases and FX.',
    ],
  },

  GranularSynth: {
    overview: `Granular synthesis breaks a sample into tiny "grains" and reassembles them.
Creates textures, pads, and time-stretching effects impossible with normal sampling.`,
    keyParameters: [
      { name: 'Grain Size', description: 'Duration of each grain in ms. Small = glitchy, large = smoother.' },
      { name: 'Overlap', description: 'How much grains overlap. More = smoother, less = stuttery.' },
      { name: 'Scan Position', description: 'Where in the sample grains are taken from.' },
      { name: 'Scan Speed', description: 'How fast position moves through the sample.' },
      { name: 'Density', description: 'Number of simultaneous grains.' },
      { name: 'Random Pitch', description: 'Pitch variation between grains for texture.' },
    ],
    tips: [
      'Small grains (10-30ms) for glitchy textures.',
      'Large grains (100-200ms) for smooth time-stretching.',
      'Random pitch creates shimmer and width.',
      'Automate scan position for evolving pads.',
      'Try freezing on interesting moments in the sample.',
    ],
    trackerUsage: 'Automate scan position with effect commands for texture sweeps.',
  },

  SuperSaw: {
    overview: `Multiple detuned sawtooth waves layered together for massive, wide leads.
The signature sound of trance and EDM. Think "big room" and "hands in the air."`,
    keyParameters: [
      { name: 'Voice Count', description: 'Number of saw waves (more = bigger, heavier CPU).' },
      { name: 'Detune', description: 'Pitch spread between voices. More = wider/thicker.' },
      { name: 'Spread', description: 'Stereo width of the voices.' },
    ],
    tips: [
      '5-7 voices is usually enough for big sounds.',
      'Moderate detune (10-30 cents) for classic trance.',
      'High detune (40-60 cents) for modern EDM.',
      'Works great with filter sweeps and sidechain.',
      'Layer with a clean sub bass for low-end foundation.',
    ],
  },

  PolySynth: {
    overview: `True polyphonic synthesizer with multiple independent voices. Each note gets its own voice,
allowing rich chords and pads with proper note management.`,
    keyParameters: [
      { name: 'Voice Count', description: 'Maximum simultaneous notes (more = bigger, heavier CPU).' },
      { name: 'Voice Type', description: 'The synthesis type for each voice.' },
      { name: 'Portamento', description: 'Glide time between notes.' },
    ],
    tips: [
      '4-8 voices is good for most chord work.',
      'Use longer release for pad sounds.',
      'Experiment with different voice types.',
      'Great for lush string-like chords.',
    ],
  },

  Organ: {
    overview: `Hammond-style tonewheel organ with drawbar controls. Each drawbar adds a harmonic partial
at a specific interval, allowing you to sculpt the tone like a real organ.`,
    keyParameters: [
      { name: 'Drawbars', description: '9 harmonic levels: 16\', 5⅓\', 8\', 4\', 2⅔\', 2\', 1⅗\', 1⅓\', 1\'' },
      { name: 'Percussion', description: 'Adds attack transient (2nd or 3rd harmonic).' },
      { name: 'Vibrato/Chorus', description: 'Classic organ modulation effects.' },
    ],
    tips: [
      '888000000 (first three up) = classic jazz/soul organ.',
      '888888888 (all up) = full, powerful gospel sound.',
      '800000008 = hollow, spooky organ.',
      'Add percussion for attack definition.',
      'Pairs well with Leslie speaker simulation.',
    ],
  },

  DrumMachine: {
    overview: `Analog drum synthesizer in the style of TR-808 and TR-909. Each drum type uses dedicated
synthesis algorithms optimized for that sound. Select 808 or 909 mode for different characters.`,
    keyParameters: [
      { name: 'Machine Type', description: '808 = warm/boomy, 909 = punchy/bright.' },
      { name: 'Drum Type', description: 'Kick, Snare, Hi-hat, Clap, Tom, Cymbal, etc.' },
      { name: 'Pitch', description: 'Tune the drum up or down.' },
      { name: 'Decay', description: 'How long the sound rings out.' },
    ],
    tips: [
      '808 kick: long decay, low pitch for trap/hip-hop.',
      '909 kick: shorter decay for house/techno.',
      'Layer kick with 808 sub for maximum impact.',
      'Hi-hats: trigger at different pitches for variety.',
    ],
    trackerUsage: 'Different notes trigger different drums: C=kick, D=snare, F#=hi-hat, etc.',
  },

  ChipSynth: {
    overview: `8-bit video game console synthesizer with authentic lo-fi character. Features classic
pulse/triangle waves, bit crushing, and built-in arpeggiator for authentic chiptune.`,
    keyParameters: [
      { name: 'Channel', description: 'Pulse 1, Pulse 2, Triangle, or Noise (like NES channels).' },
      { name: 'Duty Cycle', description: 'For pulse waves: 12.5%, 25%, 50% - affects tone color.' },
      { name: 'Bit Depth', description: 'Resolution - lower = crunchier/more lo-fi.' },
      { name: 'Arpeggio', description: 'Built-in arpeggiator for classic chip arpeggios.' },
    ],
    tips: [
      'Pulse 50% = square wave, classic lead sound.',
      'Pulse 12.5% = thin, nasal tone for accents.',
      'Triangle = smooth bass, no harmonics.',
      'Enable arpeggio for rapid note sequences.',
      'Use the arpeggio editor for custom patterns.',
      '4-bit depth is very crunchy, 8-bit is cleaner.',
    ],
    trackerUsage: 'Arpeggio effect (0xy) for tracker-style arpeggios. Duty cycle can be automated.',
  },

  PWMSynth: {
    overview: `Pulse Width Modulation synthesis varies the duty cycle of a pulse wave over time,
creating movement and richness. Classic analog synth technique for warm, animated tones.`,
    keyParameters: [
      { name: 'Modulation Rate', description: 'How fast the pulse width changes.' },
      { name: 'Modulation Depth', description: 'How much the pulse width varies.' },
      { name: 'Base Width', description: 'Starting pulse width (50% = square).' },
    ],
    tips: [
      'Slow modulation (1-2 Hz) for subtle movement.',
      'Fast modulation for more aggressive wobble.',
      'Great for pads and warm analog leads.',
      'Stack with filter for extra animation.',
    ],
  },

  StringMachine: {
    overview: `Vintage polyphonic string synthesizer in the style of Solina/ARP String Ensemble.
Creates lush, choir-like string pads through ensemble detuning and chorus.`,
    keyParameters: [
      { name: 'Ensemble', description: 'Chorus/ensemble depth for width and shimmer.' },
      { name: 'Attack', description: 'Fade-in time for swell effects.' },
      { name: 'Release', description: 'Fade-out tail after release.' },
    ],
    tips: [
      'Long attack for swelling string pads.',
      'Layer with other synths for full arrangements.',
      'Classic sound for disco and synthwave.',
      'Works beautifully with reverb and delay.',
    ],
  },

  FormantSynth: {
    overview: `Vowel synthesis creates vocal-like sounds by emphasizing formant frequencies.
Can morph between vowels (A, E, I, O, U) for talk-box and vocal pad effects.`,
    keyParameters: [
      { name: 'Vowel', description: 'Current vowel formant (A, E, I, O, U).' },
      { name: 'Morph', description: 'Blend between vowels over time.' },
      { name: 'Octave', description: 'Pitch register of the voice.' },
    ],
    tips: [
      'Automate vowel changes for "talking" effects.',
      'Layer multiple instances for choir sounds.',
      'Great for robotic and vocoder-like tones.',
      'Combine with vibrato for more realistic voice.',
    ],
    trackerUsage: 'Automate vowel parameter with effect commands for talk-box sequences.',
  },

  Furnace: {
    overview: `4-operator FM synthesizer compatible with Furnace Tracker instruments (.fui files).
Emulates classic FM chips like YM2612 (Sega Genesis) and OPN series.`,
    keyParameters: [
      { name: 'Algorithm', description: 'How the 4 operators are connected (8 algorithms).' },
      { name: 'Operator Levels', description: 'Output level of each operator.' },
      { name: 'Ratios', description: 'Frequency multiplier for each operator.' },
      { name: 'Feedback', description: 'Self-modulation amount for operator 1.' },
    ],
    tips: [
      'Import .fui files directly for authentic Genesis sounds.',
      'Algorithm 7 (all carriers) = organ-like.',
      'Algorithm 4 = classic electric piano setup.',
      'High feedback = aggressive, distorted tones.',
      'Many Genesis game sounds available online as .fui files.',
    ],
    trackerUsage: 'Full FM parameter control via tracker macros in Furnace format.',
  },

  ChiptuneModule: {
    overview: `Module file player for classic tracker formats (MOD, XM, IT, S3M).
Plays back existing tracker music with sample-accurate accuracy using libopenmpt.`,
    keyParameters: [
      { name: 'Module File', description: 'The loaded module file.' },
      { name: 'Pattern', description: 'Current pattern in the module.' },
      { name: 'Tempo/Speed', description: 'Playback speed settings.' },
    ],
    tips: [
      'Load MOD/XM/IT/S3M files to play classic tracker music.',
      'Great for importing existing chiptune compositions.',
      'Respects all original tracker effects.',
    ],
  },

  WobbleBass: {
    overview: `Dubstep and DnB bass synthesizer with tempo-synced LFO modulation.
Features dual oscillators with Reese-style detuning, FM for growl sounds, wobble LFO with tempo sync,
built-in distortion, and formant filters for vocal-like timbres. Perfect for heavy bass music.`,
    keyParameters: [
      { name: 'Mode', description: 'Classic (wobble), Reese (detuned), FM (growl), Growl (formant), Hybrid (combined).' },
      { name: 'Osc 1/2', description: 'Dual oscillators with waveform, octave, detune, and level controls.' },
      { name: 'FM Amount', description: 'Frequency modulation intensity for metallic/growl timbres.' },
      { name: 'Filter Cutoff', description: 'Low-pass filter cutoff - the main target for LFO wobble.' },
      { name: 'Resonance', description: 'Filter resonance for that aggressive peak.' },
      { name: 'LFO Sync', description: 'Tempo division (1/4, 1/8, 1/16, triplets) for synced wobble.' },
      { name: 'LFO Amount', description: 'How much the LFO sweeps the filter cutoff.' },
      { name: 'Distortion', description: 'Soft clip, hard clip, fuzz, or bitcrush for extra grit.' },
      { name: 'Formant', description: 'Vowel filter (A-E-I-O-U) for vocal bass sounds.' },
    ],
    tips: [
      'Start with Classic mode and 1/8 or 1/4 LFO sync for standard dubstep wobble.',
      'Reese mode with 5-10 cent detune creates that classic DnB bass.',
      'FM mode with high modulation index gives aggressive growl sounds.',
      'Layer sub oscillator (-2 octaves) for massive low-end weight.',
      'Use formant morph with LFO for "talking" or "yoi" bass sounds.',
      'Triplet and dotted divisions create more complex rhythmic patterns.',
      'Stack distortion on top for extra aggression - soft clip for warmth, hard clip for edge.',
    ],
    trackerUsage: 'Use automation for filter cutoff (Zxx) to create manual wobbles. LFO tempo syncs to pattern BPM.',
  },

  DrumKit: {
    overview: `Multi-sample instrument with keymap - Impulse Tracker style.
Maps different samples to different notes, perfect for drum kits, layered instruments,
velocity splits, and chromatic sample mapping. Each key can have its own sample with
pitch, volume, and pan offsets.`,
    keyParameters: [
      { name: 'Keymap', description: 'Note-to-sample assignments. Each note can trigger a different sample.' },
      { name: 'Pitch Offset', description: 'Transpose each sample independently (-48 to +48 semitones).' },
      { name: 'Volume Offset', description: 'Per-sample volume adjustment (-12 to +12 dB).' },
      { name: 'Pan Offset', description: 'Per-sample stereo position (-100 to +100).' },
      { name: 'Polyphony', description: 'Poly (overlapping notes) or Mono (cuts previous).' },
      { name: 'Max Voices', description: 'Maximum simultaneous sounds (1-16).' },
    ],
    tips: [
      'Map C-1 = Kick, D-1 = Snare, F#1 = Closed Hat, etc. for GM drum layout.',
      'Use the Beat Slicer to auto-create drumkits from loops.',
      'Layer multiple samples on the same key for thick sounds.',
      'Use pitch offset to transpose samples to their natural key.',
      'Great for orchestral instruments with per-note sampling.',
    ],
    trackerUsage: 'Each note triggers its mapped sample. Use C00 to cut notes, note-off for release.',
  },

  // ============================================================================
  // FURNACE CHIP TYPES - WASM-emulated retro sound chips
  // ============================================================================

  // FM Synthesis Chips
  FurnaceOPN: {
    overview: `Sega Genesis / Mega Drive YM2612 (OPN2) - The iconic 16-bit FM sound.
6 channels of 4-operator FM synthesis with stereo panning. Famous for punchy bass, metallic leads,
and that unmistakable Genesis crunch. Load .fui instrument files for authentic sounds.`,
    keyParameters: [
      { name: 'Algorithm', description: '8 FM algorithms controlling operator routing.' },
      { name: 'Operators 1-4', description: 'Each operator has TL, AR, DR, SR, RR, MUL, DT.' },
      { name: 'Feedback', description: 'Self-modulation on operator 1 for harmonics.' },
      { name: 'LFO', description: 'Global LFO for vibrato and tremolo.' },
    ],
    tips: [
      'Use algorithm 7 for organ-like sounds (all carriers).',
      'High feedback (5-7) adds grit and distortion.',
      'Short attack/high TL on modulators = metallic, plucky sounds.',
      'Load .fui files from the OPN folder for authentic Genesis patches.',
    ],
  },
  FurnaceOPM: {
    overview: `Yamaha YM2151 (OPM) - Sharp X68000, arcade boards (CPS1, etc).
8 channels of 4-op FM with LFO per channel. Brighter than OPN2, famous for arcade and X68000 music.`,
    keyParameters: [
      { name: 'Algorithm', description: '8 FM algorithms.' },
      { name: 'Operators', description: '4 operators with full ADSR and detune.' },
      { name: 'LFO', description: 'Per-channel LFO with multiple waveforms.' },
    ],
    tips: [
      'OPM is slightly brighter than OPN - great for arcade leads.',
      'Use fine detune between operators for chorus effects.',
      'Load .fui files from the OPM folder for arcade-style patches.',
    ],
  },
  FurnaceOPL: {
    overview: `Yamaha YMF262 (OPL3) - AdLib, Sound Blaster, DOS games.
18 channels of 2-op FM, or 6 channels of 4-op. The sound of PC gaming in the 90s.`,
    keyParameters: [
      { name: 'Waveform', description: '8 waveforms per operator (sine, half-sine, etc.).' },
      { name: 'Operators', description: '2 or 4 operators depending on mode.' },
      { name: 'Connection', description: 'FM or additive modes.' },
    ],
    tips: [
      '4-op mode gives richer, more complex tones.',
      'Half-sine waveforms create that classic OPL "honky" sound.',
      'Great for MIDI-style instruments and DOS game covers.',
    ],
  },
  FurnaceOPLL: {
    overview: `Yamaha YM2413 (OPLL) - MSX, SMS FM Unit.
A budget 2-op FM chip with 15 preset instruments + 1 custom. Simple but charming.`,
    keyParameters: [
      { name: 'Instrument', description: '15 preset patches (0 = custom).' },
      { name: 'Custom Patch', description: '2-op parameters when using instrument 0.' },
    ],
    tips: [
      'Preset instruments save channels but limit customization.',
      'Use custom mode (instrument 0) for unique sounds.',
      'Good for MSX and early FM sound recreation.',
    ],
  },
  FurnaceESFM: {
    overview: `Enhanced Sound FM - A modern enhanced OPL3 with extra features.
Adds operator detune, expanded algorithms, and more for advanced FM synthesis.`,
    keyParameters: [
      { name: 'Detune', description: 'Per-operator fine pitch detune.' },
      { name: 'Extended Algorithms', description: 'More routing options than standard OPL3.' },
    ],
    tips: [
      'Use detune for thick, detuned supersaws in FM.',
      'Great for modern chiptune that needs more than standard OPL3.',
    ],
  },
  FurnaceOPZ: {
    overview: `Yamaha YM2414 (OPZ) - TX81Z, DX11.
8-op FM synth famous for the "Lately Bass" and complex evolving sounds.`,
    keyParameters: [
      { name: 'Operators', description: '4 operators with 8 waveforms each.' },
      { name: 'Fixed Frequency', description: 'Operators can ignore keyboard tracking.' },
    ],
    tips: [
      'The "Lately Bass" patch is iconic - try to recreate it!',
      'Fixed frequency operators create inharmonic, bell-like tones.',
    ],
  },
  FurnaceOPNA: {
    overview: `Yamaha YM2608 (OPNA) - NEC PC-98, arcade.
OPN2 + SSG (PSG) + ADPCM + rhythm. The sound of PC-98 and Touhou-style music.`,
    keyParameters: [
      { name: 'FM Channels', description: '6 channels of 4-op FM.' },
      { name: 'SSG', description: '3 channels of AY-style PSG.' },
      { name: 'ADPCM', description: 'Sample playback channel.' },
    ],
    tips: [
      'Great for Touhou-style compositions.',
      'Combine FM and SSG for layered, rich sounds.',
    ],
  },
  FurnaceOPNB: {
    overview: `Yamaha YM2610 (OPNB) - SNK Neo Geo.
Similar to OPNA but with different ADPCM configuration. The sound of fighting games.`,
    keyParameters: [
      { name: 'FM', description: '4 channels of 4-op FM.' },
      { name: 'SSG', description: '3 PSG channels.' },
      { name: 'ADPCM-A/B', description: 'Dual ADPCM banks for samples and voices.' },
    ],
    tips: [
      'Perfect for Neo Geo / SNK game music recreation.',
      'ADPCM channels are key for voice samples and drums.',
    ],
  },
  FurnaceOPL4: {
    overview: `Yamaha YMF278 (OPL4) - Advanced OPL with wavetable.
Combines OPL3 FM with wavetable sample playback.`,
    keyParameters: [
      { name: 'FM Section', description: 'Full OPL3 FM synthesis.' },
      { name: 'Wavetable', description: '24 channels of sample playback.' },
    ],
    tips: [
      'Rare chip - combine FM and samples for unique hybrid sounds.',
    ],
  },
  FurnaceY8950: {
    overview: `Yamaha Y8950 - MSX-Audio.
OPL2 with ADPCM support. Used in MSX computers with the MSX-Audio expansion.`,
    keyParameters: [
      { name: 'FM', description: '9 channels of 2-op FM.' },
      { name: 'ADPCM', description: 'Sample playback support.' },
    ],
    tips: ['Great for MSX-Audio game music recreation.'],
  },
  FurnaceVRC7: {
    overview: `Konami VRC7 - Lagrange Point.
An OPLL clone used in the Famicom game Lagrange Point for FM on NES.`,
    keyParameters: [
      { name: 'Presets', description: '15 preset instruments + 1 custom.' },
    ],
    tips: [
      'The only NES game with FM synthesis!',
      'Limited but characterful FM sound.',
    ],
  },

  // Console PSG Chips
  FurnaceNES: {
    overview: `Nintendo Entertainment System (2A03) - The classic 8-bit sound.
2 pulse waves with duty cycle, 1 triangle, 1 noise, 1 DPCM sample channel.`,
    keyParameters: [
      { name: 'Pulse Duty', description: '12.5%, 25%, 50%, 75% duty cycles.' },
      { name: 'Triangle', description: 'Fixed volume, great for bass.' },
      { name: 'Noise', description: 'Long or short loop noise modes.' },
    ],
    tips: [
      'Triangle is fixed volume - use for bass and melody.',
      'Noise channel can do hi-hats and snares with envelopes.',
      'Arpeggios are key to NES chords!',
    ],
  },
  FurnaceGB: {
    overview: `Nintendo Game Boy - DMG-01 sound chip.
2 pulse channels with sweep, 1 wavetable, 1 noise.`,
    keyParameters: [
      { name: 'Pulse', description: '12.5%, 25%, 50%, 75% duty + frequency sweep.' },
      { name: 'Wave', description: '32-sample 4-bit wavetable.' },
      { name: 'Noise', description: '7-bit and 15-bit LFSR modes.' },
    ],
    tips: [
      'Use frequency sweep for bass drum and pitch slides.',
      'Custom wavetables create unique timbres.',
      'Iconic lo-fi sound perfect for chiptune.',
    ],
  },
  FurnaceSNES: {
    overview: `Super Nintendo (SPC700) - Sony's 16-bit audio chip.
8 channels of BRR-compressed samples with echo, pitch modulation, and noise.`,
    keyParameters: [
      { name: 'Sample', description: 'BRR-compressed samples.' },
      { name: 'ADSR', description: 'Hardware envelope per voice.' },
      { name: 'Echo', description: 'Built-in delay effect.' },
    ],
    tips: [
      'The echo is iconic - 8 taps with feedback.',
      'Pitch modulation between channels for FM-like effects.',
      'Great for cinematic 16-bit game soundtracks.',
    ],
  },
  FurnacePCE: {
    overview: `PC Engine / TurboGrafx-16 - Hudson HuC6280.
6 channels of 32-sample wavetable synthesis.`,
    keyParameters: [
      { name: 'Wavetable', description: '32 4-bit samples per channel.' },
      { name: 'LFO', description: 'Channel 2 can modulate channel 1.' },
    ],
    tips: [
      'More channels than NES with richer wavetable sounds.',
      'Classic for PC Engine/TG16 game music.',
    ],
  },
  FurnacePSG: {
    overview: `TI SN76489 - Sega Master System, Game Gear, BBC Micro.
3 square wave channels + 1 noise. Simple but effective.`,
    keyParameters: [
      { name: 'Tone', description: '3 square wave channels with volume.' },
      { name: 'Noise', description: 'White or periodic noise, can use ch3 frequency.' },
    ],
    tips: [
      'Use channel 3 frequency for pitched noise/drums.',
      'Arpeggios essential for chords.',
      'Classic 8-bit Sega sound.',
    ],
  },
  FurnaceVB: {
    overview: `Nintendo Virtual Boy - VSU chip.
6 channels of 32-sample wavetable with modulation and sweep.`,
    keyParameters: [
      { name: 'Wavetable', description: '32-sample 6-bit wavetables.' },
      { name: 'Sweep', description: 'Frequency sweep per channel.' },
      { name: 'Modulation', description: 'Wave modulation effects.' },
    ],
    tips: ['Stereo chip designed for 3D audio positioning.'],
  },
  FurnaceLynx: {
    overview: `Atari Lynx - 4 channel wavetable handheld.
4 channels with 8-bit wavetables and hardware effects.`,
    keyParameters: [
      { name: 'Wavetable', description: '8-bit wavetables per channel.' },
    ],
    tips: ['Underrated chip with rich wavetable capability.'],
  },
  FurnaceSWAN: {
    overview: `Bandai WonderSwan - 4 channel wavetable + PCM.
4 wavetable channels with optional PCM on channel 2.`,
    keyParameters: [
      { name: 'Wavetable', description: '32-sample wavetables.' },
      { name: 'PCM', description: 'Channel 2 can play PCM samples.' },
    ],
    tips: ['Great handheld chip for detailed chiptune.'],
  },

  // NES Expansion
  FurnaceVRC6: {
    overview: `Konami VRC6 - Castlevania III (JP), Madara.
2 pulse channels with 8 duty cycles + 1 sawtooth. Richer than base NES.`,
    keyParameters: [
      { name: 'Pulse', description: '8 duty cycle settings (vs NES 4).' },
      { name: 'Saw', description: 'Pure sawtooth channel.' },
    ],
    tips: [
      'Sawtooth is amazing for bass and leads.',
      'More duty options than stock NES pulse.',
      'Classic for Castlevania III JP soundtrack.',
    ],
  },
  FurnaceN163: {
    overview: `Namco 163 - Up to 8 wavetable channels.
Programmable wavetable synth with 128 samples shared across channels.`,
    keyParameters: [
      { name: 'Channels', description: '1-8 channels (more = lower quality).' },
      { name: 'Wavetable', description: '128 4-bit samples shared memory.' },
    ],
    tips: [
      'Quality decreases with more channels due to multiplexing.',
      'Great for complex wavetable sounds on NES.',
    ],
  },
  FurnaceFDS: {
    overview: `Famicom Disk System - Wavetable with modulation.
64-sample wavetable with frequency modulation for vibrato/tremolo.`,
    keyParameters: [
      { name: 'Wavetable', description: '64-sample 6-bit wave.' },
      { name: 'Modulation', description: 'Built-in FM for vibrato effects.' },
    ],
    tips: [
      'The modulation unit creates signature FDS wobble.',
      'Great for bass with that distinctive FDS character.',
    ],
  },
  FurnaceMMC5: {
    overview: `MMC5 - 2 extra pulse channels for NES.
Used in Castlevania III (US) and a few other games.`,
    keyParameters: [
      { name: 'Pulse', description: '2 extra pulse channels like 2A03.' },
    ],
    tips: ['Simple expansion - 2 more pulse channels.'],
  },

  // Computer Chips
  FurnaceC64: {
    overview: `Commodore 64 SID (6581/8580) - The legendary home computer chip.
3 voices with filter, ring mod, sync. Iconic for demoscene and game music.`,
    keyParameters: [
      { name: 'Waveforms', description: 'Triangle, saw, pulse (PWM), noise per voice.' },
      { name: 'Filter', description: 'Multimode filter (LP, HP, BP, notch).' },
      { name: 'Ring Mod', description: 'Ring modulation between voices.' },
      { name: 'Sync', description: 'Hard sync between oscillators.' },
    ],
    tips: [
      'Filter sweeps are essential for SID character.',
      'PWM with modulation creates classic SID pads.',
      'Ring mod and sync for harsh, metallic sounds.',
    ],
  },
  FurnaceAY: {
    overview: `General Instrument AY-3-8910 - ZX Spectrum, MSX, Amstrad CPC.
3 square wave channels + noise + hardware envelope.`,
    keyParameters: [
      { name: 'Tone', description: '3 square wave channels.' },
      { name: 'Noise', description: 'Mixable noise per channel.' },
      { name: 'Envelope', description: 'Hardware envelope generator (8 shapes).' },
    ],
    tips: [
      'Hardware envelope creates characteristic buzzy sounds.',
      'Mix tone and noise for drums and effects.',
      'Classic for ZX Spectrum game music.',
    ],
  },
  FurnaceVIC: {
    overview: `Commodore VIC-20 - Simple 3 square + noise.
The predecessor to SID, simpler but charming.`,
    keyParameters: [
      { name: 'Voices', description: '3 square waves + noise.' },
    ],
    tips: ['Limited but nostalgic early 80s sound.'],
  },
  FurnaceSAA: {
    overview: `Philips SAA1099 - Sam Coupé, some PC sound cards.
6 tone channels + 2 noise with stereo and envelope.`,
    keyParameters: [
      { name: 'Tone', description: '6 tone generators.' },
      { name: 'Noise', description: '2 noise generators.' },
      { name: 'Envelope', description: 'Hardware envelope support.' },
    ],
    tips: ['Stereo chip with European computer heritage.'],
  },
  FurnaceTED: {
    overview: `Commodore Plus/4 TED - Built-in 2 square + noise.
Budget successor to VIC, found in Plus/4 and C16.`,
    keyParameters: [
      { name: 'Tone', description: '2 square wave channels.' },
      { name: 'Noise', description: '1 noise channel.' },
    ],
    tips: ['Simple chip from lesser-known Commodores.'],
  },
  FurnaceVERA: {
    overview: `Commander X16 VERA - Modern retro 16 channel PSG.
16 PSG channels + PCM. Designed for modern retro computing.`,
    keyParameters: [
      { name: 'PSG', description: '16 channels with multiple waveforms.' },
      { name: 'PCM', description: 'Stereo PCM playback.' },
    ],
    tips: ['Modern chip designed for retro enthusiasts.'],
  },
  FurnaceSCC: {
    overview: `Konami SCC - 5 channel wavetable (MSX cartridges).
Found in Konami MSX games like Gradius, Snatcher, and more.`,
    keyParameters: [
      { name: 'Wavetable', description: '5 channels, 32-sample 8-bit waves.' },
    ],
    tips: [
      'The Konami MSX sound - rich wavetables.',
      'Great for Gradius-style music.',
    ],
  },
  FurnaceTIA: {
    overview: `Atari 2600 TIA - Primitive but distinctive.
2 channels with 32 "waveforms" (really just divider settings).`,
    keyParameters: [
      { name: 'Voices', description: '2 channels with pitch and volume.' },
      { name: 'Waveform', description: '32 different noise/tone modes.' },
    ],
    tips: [
      'Extremely limited but iconic early 80s sound.',
      'Pitches are approximate - embrace the wonkiness!',
    ],
  },

  // Arcade PCM Chips
  FurnaceSEGAPCM: {
    overview: `Sega PCM - System 16/18/24 arcade boards.
16 channels of 8-bit PCM. Used in OutRun, After Burner, etc.`,
    keyParameters: [
      { name: 'Samples', description: '16 channels of sample playback.' },
    ],
    tips: ['The sound of Sega arcade in the late 80s.'],
  },
  FurnaceQSOUND: {
    overview: `Capcom QSound - CPS1/CPS2 with 3D audio.
16 channel PCM with panning for pseudo-3D positioning.`,
    keyParameters: [
      { name: 'Samples', description: '16 PCM channels.' },
      { name: 'QSound Pan', description: '3D audio positioning.' },
    ],
    tips: [
      'Famous for Street Fighter II onwards.',
      'QSound panning creates immersive arcade audio.',
    ],
  },
  FurnaceES5506: {
    overview: `Ensoniq ES5506 - High-end 32 voice wavetable.
Used in Taito F3, various Ensoniq synths.`,
    keyParameters: [
      { name: 'Voices', description: '32 simultaneous voices.' },
      { name: 'Filters', description: 'Per-voice digital filters.' },
    ],
    tips: ['High quality chip for late arcade and synths.'],
  },
  FurnaceRF5C68: {
    overview: `Ricoh RF5C68 - Sega CD / Mega CD.
8 channel PCM used in Sega CD games.`,
    keyParameters: [
      { name: 'Channels', description: '8 PCM channels.' },
    ],
    tips: ['The sound of Sega CD / Mega CD games.'],
  },
  FurnaceC140: {
    overview: `Namco C140 - System 2 arcade (24 channels).
High quality PCM used in games like Assault, Ordyne.`,
    keyParameters: [
      { name: 'Channels', description: '24 PCM channels.' },
    ],
    tips: ['Rich Namco arcade sound.'],
  },
  FurnaceK007232: {
    overview: `Konami K007232 - 2 channel PCM.
Used in Contra arcade, TMNT, and other Konami games.`,
    keyParameters: [
      { name: 'Channels', description: '2 PCM channels.' },
    ],
    tips: ['Classic Konami arcade samples.'],
  },
  FurnaceK053260: {
    overview: `Konami K053260 - 4 channel PCM with ADPCM.
Used in Sunset Riders, Simpsons, and more.`,
    keyParameters: [
      { name: 'Channels', description: '4 channels with ADPCM support.' },
    ],
    tips: ['The sound of 90s Konami arcade.'],
  },
  FurnaceGA20: {
    overview: `Irem GA20 - 4 channel PCM.
Used in R-Type Leo, In the Hunt.`,
    keyParameters: [
      { name: 'Channels', description: '4 PCM channels.' },
    ],
    tips: ['Irem arcade sound chip.'],
  },
  FurnaceOKI: {
    overview: `OKI MSM6295 - 4 channel ADPCM.
Very common in arcade and Neo Geo.`,
    keyParameters: [
      { name: 'Channels', description: '4 ADPCM channels.' },
    ],
    tips: [
      'ADPCM compression - smaller samples.',
      'Ubiquitous in arcade games.',
    ],
  },
  FurnaceYMZ280B: {
    overview: `Yamaha YMZ280B - 8 channel ADPCM.
Used in Cave shmups and late arcade.`,
    keyParameters: [
      { name: 'Channels', description: '8 ADPCM channels.' },
    ],
    tips: ['High quality late arcade chip.'],
  },
  FurnaceX1_010: {
    overview: `Seta X1-010 - 16 channel wavetable.
Used in various Seta/Allumer arcade games.`,
    keyParameters: [
      { name: 'Channels', description: '16 wavetable channels.' },
    ],
    tips: ['Rare but capable wavetable chip.'],
  },
  FurnaceBUBBLE: {
    overview: `Konami Bubble System - Wavetable arcade.
Used in Bubble System arcade games.`,
    keyParameters: [
      { name: 'Wavetable', description: 'Wavetable synthesis.' },
    ],
    tips: ['Obscure Konami arcade sound.'],
  },

  // Other Chips
  FurnaceSM8521: {
    overview: `Sharp SM8521 - Tiger Game.com.
Built into the ill-fated Game.com handheld.`,
    keyParameters: [
      { name: 'Channels', description: '2 wavetable channels + noise.' },
    ],
    tips: ['Extremely obscure handheld chip.'],
  },
  FurnaceT6W28: {
    overview: `NEC T6W28 - PC-6001, stereo PSG variant.
Stereo version of SN76489.`,
    keyParameters: [
      { name: 'Tone', description: '3 tone + 1 noise with stereo.' },
    ],
    tips: ['Stereo PSG for Japanese PCs.'],
  },
  FurnaceSUPERVISION: {
    overview: `Watara Supervision - 4 channel handheld.
Budget Game Boy competitor from 1992.`,
    keyParameters: [
      { name: 'Channels', description: '4 channels + noise/DMA.' },
    ],
    tips: ['Obscure handheld with its own character.'],
  },
  FurnaceUPD1771: {
    overview: `NEC μPD1771 - Super Cassette Vision.
Epoch's home console from 1984.`,
    keyParameters: [
      { name: 'Channels', description: 'Programmable sound generator.' },
    ],
    tips: ['Very rare Japanese console chip.'],
  },
};

/**
 * Get help for a specific synth type
 */
export function getSynthHelp(synthType: SynthType): SynthHelp {
  return SYNTH_HELP[synthType];
}
