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

export const SYNTH_HELP: Partial<Record<SynthType, SynthHelp>> = {
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

  DubSiren: {
    overview: `A classic dub sound system siren generator. It uses a single oscillator
modulated by an LFO to create rising and falling alert tones, processed through
delay and reverb for that signature "space" echo effect.`,
    keyParameters: [
      { name: 'Oscillator Type', description: 'Waveform shape: Sine (smooth), Square (harsh), Sawtooth (bright), Triangle (warm).' },
      { name: 'Frequency', description: 'Base pitch of the siren.' },
      { name: 'LFO Rate', description: 'Speed of the pitch modulation.' },
      { name: 'LFO Depth', description: 'Amount of pitch variation - higher values create wider sweeps.' },
      { name: 'Delay Time', description: 'Echo spacing - essential for the dub character.' },
      { name: 'Delay Feedback', description: 'Number of echo repeats - high values create infinite trails.' },
    ],
    tips: [
      'Use high LFO depth and medium rate for classic rising/falling alerts.',
      'Square LFO with high depth creates a trilling "police" siren effect.',
      'High delay feedback (70%+) creates the signature dub "wash" sound.',
      'Modulate the frequency manually while the siren is playing for extra expression.',
      'Use the filter to thin out the sound for more "lo-fi" sound system vibes.',
    ],
    trackerUsage: 'Trigger notes to start the siren. Use pitch bend or vibrato commands for extra modulation.',
  },

  Synare: {
    overview: `The Synare 3 is a classic analog electronic percussion synthesizer from the 1970s.
It is famous for the "disco tom" sound—a resonant, descending pitch sweep—and is a staple of
classic Dub and Reggae percussion. It combines dual square/pulse oscillators with a noise generator
and a highly resonant 24dB low-pass filter.`,
    keyParameters: [
      { name: 'Tune', description: 'Base frequency of the oscillators.' },
      { name: 'Pitch Sweep', description: 'Enables the signature descending "pyiuuu" sound. Range controls the drop amount, Time controls the speed.' },
      { name: 'Noise Mix', description: 'Adds white/pink noise for snare-like or gritty textures.' },
      { name: 'Filter Resonance', description: 'Emphasis at the cutoff frequency. High resonance creates the "singing" tom sound.' },
      { name: 'Decay', description: 'How long the sound lasts. Use short decay for clicks, long for deep toms.' },
    ],
    tips: [
      'For classic disco toms, use a square wave, high resonance, and a wide pitch sweep.',
      'Add a small amount of noise to make the percussion sound more like a real drum hit.',
      'Use the LFO on pitch for strange, sci-fi percussive effects.',
      'The Synare is perfect for adding "flavor" hits on top of your main drum pattern.',
    ],
    trackerUsage: 'Trigger with short notes. Use velocity to control the impact level.',
  },

  MAMEVFX: {
    overview: `Ensoniq VFX engine using bit-perfect MAME emulation of the ES5506 (OTTO) chip.
This engine requires the official MAME ROM set to function. It provides 32 voices of
advanced wavetable synthesis with high-fidelity interpolation.`,
    keyParameters: [
      { name: 'Clock', description: 'Emulation speed. Standard is 16MHz.' },
      { name: 'ROM ZIP', description: 'Requires standard MAME ensvfx.zip or vfx.zip archive.' },
    ],
    tips: [
      'Upload the official ensvfx.zip from your MAME ROMs collection.',
      'The engine will automatically extract the OS and wavetable ROMs.',
      'Great for early 90s digital pads and atmospheric sounds.',
    ],
  },

  MAMEDOC: {
    overview: `Ensoniq ESQ-1 / SQ-80 engine using bit-perfect MAME emulation of the ES5503 (DOC) chip.
This classic 8-bit wavetable engine is famous for its gritty, warm digital character and 
analog-style modulation.`,
    keyParameters: [
      { name: 'Clock', description: 'Emulation speed. Standard is 16MHz.' },
      { name: 'ROM ZIP', description: 'Requires standard MAME esq1.zip archive.' },
    ],
    tips: [
      'Upload the official esq1.zip from your MAME ROMs collection.',
      'Includes the original factory waveforms and OS.',
      'Perfect for vintage synthwave bass and crystalline bells.',
    ],
  },

  MAMERSA: {
    overview: `Roland Structured Adaptive (SA) synthesis engine from the MKS-20 and RD-1000.
Famous for the iconic "SA Piano" and "EP" sounds that defined 80s pop and gospel.`,
    keyParameters: [
      { name: 'Clock', description: 'Emulation speed. Standard is 20MHz.' },
      { name: 'ROM ZIP', description: 'Requires standard MAME mks20.zip archive.' },
    ],
    tips: [
      'Upload the official mks20.zip from your MAME ROMs collection.',
      'Provides bit-accurate reproduction of Roland\'s signature SA piano algorithm.',
      'Essential for that classic 80s studio piano sound.',
    ],
  },
};

/**
 * Get help for a specific synth type
 */
export function getSynthHelp(synthType: SynthType): SynthHelp | undefined {
  return SYNTH_HELP[synthType];
}
