/**
 * FastTracker II Effect Descriptions
 * Provides human-readable descriptions for FT2 effect commands
 */

export type EffectCategory = 'pitch' | 'volume' | 'panning' | 'timing' | 'global' | 'sample' | 'misc';

export interface EffectDescription {
  command: string;
  name: string;
  description: string;
  parameters: string;
  tick: 'tick-0' | 'tick-N' | 'both';
  category: EffectCategory;
}

/**
 * Color class for each effect category (Tailwind)
 */
export const EFFECT_CATEGORY_COLORS: Record<EffectCategory, string> = {
  pitch:   'text-blue-400',     // Pitch slides, portamento, vibrato
  volume:  'text-emerald-400',  // Volume set, slides, tremolo
  panning: 'text-purple-400',   // Panning set, slides
  timing:  'text-yellow-400',   // Note delay, retrigger, cut
  global:  'text-red-400',      // Speed, BPM, position jump, pattern break
  sample:  'text-cyan-400',     // Sample offset, finetune
  misc:    'text-orange-400',   // Arpeggio, filter, loop
};

/**
 * FT2 Effect command descriptions
 */
export const FT2_EFFECT_DESCRIPTIONS: Record<string, EffectDescription> = {
  '0': {
    command: '0xy',
    name: 'Arpeggio',
    description: 'Rapidly cycle between note, note+x semitones, note+y semitones',
    parameters: 'x=1st offset (0-F hex), y=2nd offset (0-F hex)',
    tick: 'tick-N',
    category: 'misc',
  },
  '1': {
    command: '1xx',
    name: 'Pitch Slide Up',
    description: 'Slide pitch upward continuously',
    parameters: 'xx=speed (01-FF hex, 00=use last)',
    tick: 'tick-N',
    category: 'pitch',
  },
  '2': {
    command: '2xx',
    name: 'Pitch Slide Down',
    description: 'Slide pitch downward continuously',
    parameters: 'xx=speed (01-FF hex, 00=use last)',
    tick: 'tick-N',
    category: 'pitch',
  },
  '3': {
    command: '3xx',
    name: 'Tone Portamento',
    description: 'Slide pitch toward target note',
    parameters: 'xx=speed (01-FF hex, 00=use last)',
    tick: 'tick-N',
    category: 'pitch',
  },
  '4': {
    command: '4xy',
    name: 'Vibrato',
    description: 'Oscillate pitch up/down',
    parameters: 'x=speed (0-F hex), y=depth (0-F hex)',
    tick: 'tick-N',
    category: 'pitch',
  },
  '5': {
    command: '5xy',
    name: 'Tone Porta + Vol Slide',
    description: 'Continue tone portamento while sliding volume',
    parameters: 'x=vol slide up speed, y=vol slide down speed',
    tick: 'both',
    category: 'pitch',
  },
  '6': {
    command: '6xy',
    name: 'Vibrato + Vol Slide',
    description: 'Continue vibrato while sliding volume',
    parameters: 'x=vol slide up speed, y=vol slide down speed',
    tick: 'both',
    category: 'pitch',
  },
  '7': {
    command: '7xy',
    name: 'Tremolo',
    description: 'Oscillate volume up/down',
    parameters: 'x=speed (0-F hex), y=depth (0-F hex)',
    tick: 'tick-N',
    category: 'volume',
  },
  '8': {
    command: '8xx',
    name: 'Set Panning',
    description: 'Set channel panning position',
    parameters: 'xx=position (00=left, 80=center, FF=right)',
    tick: 'tick-0',
    category: 'panning',
  },
  '9': {
    command: '9xx',
    name: 'Sample Offset',
    description: 'Start sample playback at offset',
    parameters: 'xx=offset (multiply by 256 samples)',
    tick: 'tick-0',
    category: 'sample',
  },
  'A': {
    command: 'Axy',
    name: 'Volume Slide',
    description: 'Slide volume up or down',
    parameters: 'x=slide up speed, y=slide down speed',
    tick: 'tick-N',
    category: 'volume',
  },
  'B': {
    command: 'Bxx',
    name: 'Position Jump',
    description: 'Jump to pattern in order list',
    parameters: 'xx=position (00-FF hex)',
    tick: 'tick-0',
    category: 'global',
  },
  'C': {
    command: 'Cxx',
    name: 'Set Volume',
    description: 'Set channel volume directly',
    parameters: 'xx=volume (00-40 hex, 64 decimal)',
    tick: 'tick-0',
    category: 'volume',
  },
  'D': {
    command: 'Dxx',
    name: 'Pattern Break',
    description: 'Break pattern and jump to row in next pattern',
    parameters: 'xx=row (00-3F hex, 0-63 decimal)',
    tick: 'tick-0',
    category: 'global',
  },
  'E': {
    command: 'Exy',
    name: 'Extended Command',
    description: 'Extended effects (see E-commands)',
    parameters: 'x=sub-command (0-F), y=parameter',
    tick: 'both',
    category: 'misc',
  },
  'F': {
    command: 'Fxx',
    name: 'Set Speed/BPM',
    description: 'Set speed (01-1F) or BPM (20-FF)',
    parameters: 'xx=speed/BPM (01-1F=speed, 20-FF=BPM)',
    tick: 'tick-0',
    category: 'global',
  },
  'G': {
    command: 'Gxx',
    name: 'Set Global Volume',
    description: 'Set global volume for all channels',
    parameters: 'xx=volume (00-40 hex, 64 decimal)',
    tick: 'tick-0',
    category: 'global',
  },
  'H': {
    command: 'Hxy',
    name: 'Global Volume Slide',
    description: 'Slide global volume up or down',
    parameters: 'x=slide up speed, y=slide down speed',
    tick: 'tick-N',
    category: 'global',
  },
};

/**
 * E-command (Extended) descriptions
 */
export const FT2_E_COMMAND_DESCRIPTIONS: Record<string, EffectDescription> = {
  'E0': {
    command: 'E0x',
    name: 'Set Filter (Amiga)',
    description: 'Enable/disable Amiga LED filter',
    parameters: 'x=0 (filter on) or 1 (filter off)',
    tick: 'tick-0',
    category: 'misc',
  },
  'E1': {
    command: 'E1x',
    name: 'Fine Pitch Slide Up',
    description: 'Slide pitch up once at tick 0',
    parameters: 'x=fine slide value (1-F hex)',
    tick: 'tick-0',
    category: 'pitch',
  },
  'E2': {
    command: 'E2x',
    name: 'Fine Pitch Slide Down',
    description: 'Slide pitch down once at tick 0',
    parameters: 'x=fine slide value (1-F hex)',
    tick: 'tick-0',
    category: 'pitch',
  },
  'E3': {
    command: 'E3x',
    name: 'Glissando Control',
    description: 'Enable/disable glissando (semitone portamento)',
    parameters: 'x=0 (off) or 1 (on)',
    tick: 'tick-0',
    category: 'pitch',
  },
  'E4': {
    command: 'E4x',
    name: 'Set Vibrato Waveform',
    description: 'Set vibrato waveform type',
    parameters: 'x=waveform (0=sine, 1=ramp down, 2=square, 3=random)',
    tick: 'tick-0',
    category: 'pitch',
  },
  'E5': {
    command: 'E5x',
    name: 'Set Finetune',
    description: 'Set sample finetune',
    parameters: 'x=finetune (-8 to +7, stored as 0-F)',
    tick: 'tick-0',
    category: 'sample',
  },
  'E6': {
    command: 'E6x',
    name: 'Pattern Loop',
    description: 'Loop pattern section',
    parameters: 'x=0 (set loop start) or 1-F (loop count)',
    tick: 'tick-0',
    category: 'global',
  },
  'E7': {
    command: 'E7x',
    name: 'Set Tremolo Waveform',
    description: 'Set tremolo waveform type',
    parameters: 'x=waveform (0=sine, 1=ramp down, 2=square, 3=random)',
    tick: 'tick-0',
    category: 'volume',
  },
  'E8': {
    command: 'E8x',
    name: 'Set Panning (Fine)',
    description: 'Set panning with fine control',
    parameters: 'x=panning (0=left, 8=center, F=right)',
    tick: 'tick-0',
    category: 'panning',
  },
  'E9': {
    command: 'E9x',
    name: 'Retrigger Note',
    description: 'Retrigger note every x ticks',
    parameters: 'x=retrigger rate (1-F ticks)',
    tick: 'tick-N',
    category: 'timing',
  },
  'EA': {
    command: 'EAx',
    name: 'Fine Volume Slide Up',
    description: 'Slide volume up once at tick 0',
    parameters: 'x=fine volume value (1-F hex)',
    tick: 'tick-0',
    category: 'volume',
  },
  'EB': {
    command: 'EBx',
    name: 'Fine Volume Slide Down',
    description: 'Slide volume down once at tick 0',
    parameters: 'x=fine volume value (1-F hex)',
    tick: 'tick-0',
    category: 'volume',
  },
  'EC': {
    command: 'ECx',
    name: 'Note Cut',
    description: 'Cut note (set volume to 0) at tick x',
    parameters: 'x=tick to cut (0=immediate, 1-F=delayed)',
    tick: 'both',
    category: 'timing',
  },
  'ED': {
    command: 'EDx',
    name: 'Note Delay',
    description: 'Delay note trigger by x ticks',
    parameters: 'x=delay in ticks (0-F)',
    tick: 'tick-N',
    category: 'timing',
  },
  'EE': {
    command: 'EEx',
    name: 'Pattern Delay',
    description: 'Delay pattern by x rows',
    parameters: 'x=rows to delay (0-F)',
    tick: 'tick-0',
    category: 'global',
  },
  'EF': {
    command: 'EFx',
    name: 'Funk Repeat (Invert Loop)',
    description: 'Invert sample loop at speed x (Amiga)',
    parameters: 'x=invert speed (0-F)',
    tick: 'tick-N',
    category: 'sample',
  },
};

/**
 * Get description for an FT2 effect command
 * @param effectString - Effect string like "A00" or "10F0"
 * @param synthType - Optional synth type for platform-specific effects
 */
export function getFT2EffectDescription(effectString: string | null, synthType?: string): EffectDescription | null {
  if (!effectString || effectString === '...' || effectString.length < 3) {
    return null;
  }

  const command = effectString[0].toUpperCase();
  const param1 = effectString[1].toUpperCase();
  const param2 = effectString[2].toUpperCase();
  void param2; // Second parameter byte (used for detailed effect descriptions)

  // Check for E-command (extended)
  if (command === 'E') {
    const subCommand = param1;
    const eKey = `E${subCommand}`;
    if (FT2_E_COMMAND_DESCRIPTIONS[eKey]) {
      // Clone and fill in actual parameter
      const desc = { ...FT2_E_COMMAND_DESCRIPTIONS[eKey] };
      desc.command = effectString;
      return desc;
    }
  }

  // Regular FT2 command (0-F, G, H)
  if (FT2_EFFECT_DESCRIPTIONS[command]) {
    // Clone and fill in actual parameter
    const desc = { ...FT2_EFFECT_DESCRIPTIONS[command] };
    desc.command = effectString;
    return desc;
  }

  // Check for Furnace platform-specific effects (0x10+)
  const effectCode = parseInt(command + param1, 16);
  if (effectCode >= 0x10) {
    const furnaceDesc = getFurnaceEffectDescription(effectCode, synthType);
    if (furnaceDesc) {
      const desc = { ...furnaceDesc };
      desc.command = effectString;
      return desc;
    }
  }

  return null;
}

// ============================================================================
// FURNACE PLATFORM-SPECIFIC EFFECTS (0x10+)
// Effects vary by chip type - see FurnaceEffectRouter for routing
// ============================================================================

export type FurnacePlatformFamily = 'fm' | 'c64' | 'gb' | 'nes' | 'pce' | 'psg' | 'namco' | 'snes' | 'sample';

/**
 * Furnace FM chip effects (OPN2, OPM, OPL, OPLL, OPZ, ESFM)
 */
export const FURNACE_FM_EFFECTS: Record<string, EffectDescription> = {
  '10': {
    command: '10xx',
    name: 'Set LFO Speed',
    description: 'Set the LFO speed for FM chip vibrato/tremolo',
    parameters: 'xx=LFO speed (00-FF)',
    tick: 'tick-0',
    category: 'misc',
  },
  '11': {
    command: '11xx',
    name: 'Set TL (Total Level)',
    description: 'Set operator total level (volume)',
    parameters: 'xx=TL value (00-7F, lower=louder)',
    tick: 'tick-0',
    category: 'volume',
  },
  '12': {
    command: '12xx',
    name: 'Set AR (Attack Rate)',
    description: 'Set operator attack rate',
    parameters: 'xx=AR value (00-1F)',
    tick: 'tick-0',
    category: 'misc',
  },
  '13': {
    command: '13xx',
    name: 'Set DR (Decay Rate)',
    description: 'Set operator decay rate',
    parameters: 'xx=DR value (00-1F)',
    tick: 'tick-0',
    category: 'misc',
  },
  '14': {
    command: '14xx',
    name: 'Set MULT (Multiplier)',
    description: 'Set operator frequency multiplier',
    parameters: 'xx=MULT value (00-0F)',
    tick: 'tick-0',
    category: 'pitch',
  },
  '15': {
    command: '15xx',
    name: 'Set RR (Release Rate)',
    description: 'Set operator release rate',
    parameters: 'xx=RR value (00-0F)',
    tick: 'tick-0',
    category: 'misc',
  },
  '16': {
    command: '16xx',
    name: 'Set SL (Sustain Level)',
    description: 'Set operator sustain level',
    parameters: 'xx=SL value (00-0F)',
    tick: 'tick-0',
    category: 'volume',
  },
  '17': {
    command: '17xx',
    name: 'Set DT (Detune)',
    description: 'Set operator detune',
    parameters: 'xx=DT value (00-07)',
    tick: 'tick-0',
    category: 'pitch',
  },
  '18': {
    command: '18xx',
    name: 'Set SSG-EG',
    description: 'Set SSG envelope generator mode',
    parameters: 'xx=SSG-EG mode (00-0F)',
    tick: 'tick-0',
    category: 'misc',
  },
  '19': {
    command: '19xx',
    name: 'Set Algorithm',
    description: 'Set FM algorithm (operator routing)',
    parameters: 'xx=algorithm (00-07)',
    tick: 'tick-0',
    category: 'misc',
  },
  '1A': {
    command: '1Axx',
    name: 'Set Feedback',
    description: 'Set operator 1 feedback level',
    parameters: 'xx=feedback (00-07)',
    tick: 'tick-0',
    category: 'misc',
  },
  '1B': {
    command: '1Bxy',
    name: 'Set AM/PM Depth',
    description: 'Set amplitude/phase modulation depth',
    parameters: 'x=AM depth (0-3), y=PM depth (0-7)',
    tick: 'tick-0',
    category: 'misc',
  },
  '1C': {
    command: '1Cxx',
    name: 'FM Hard Reset',
    description: 'Force hard reset on note (key-off before key-on)',
    parameters: 'xx=01 (enable), 00 (disable)',
    tick: 'tick-0',
    category: 'misc',
  },
};

/**
 * Furnace C64/SID effects
 */
export const FURNACE_C64_EFFECTS: Record<string, EffectDescription> = {
  '10': {
    command: '10xx',
    name: 'Set Filter Cutoff',
    description: 'Set SID filter cutoff frequency',
    parameters: 'xx=cutoff (00-FF, 11-bit scaled)',
    tick: 'tick-0',
    category: 'misc',
  },
  '11': {
    command: '11xx',
    name: 'Set Filter Resonance',
    description: 'Set SID filter resonance',
    parameters: 'xx=resonance (00-0F)',
    tick: 'tick-0',
    category: 'misc',
  },
  '12': {
    command: '12xx',
    name: 'Set Filter Mode',
    description: 'Set SID filter mode',
    parameters: 'xx: 0=off, 1=LP, 2=BP, 4=HP (can combine)',
    tick: 'tick-0',
    category: 'misc',
  },
  '13': {
    command: '13xx',
    name: 'Set Ring Mod',
    description: 'Enable/disable ring modulation',
    parameters: 'xx=01 (on), 00 (off)',
    tick: 'tick-0',
    category: 'misc',
  },
  '14': {
    command: '14xx',
    name: 'Set Hard Sync',
    description: 'Enable/disable oscillator hard sync',
    parameters: 'xx=01 (on), 00 (off)',
    tick: 'tick-0',
    category: 'misc',
  },
  '15': {
    command: '15xx',
    name: 'Set Pulse Width',
    description: 'Set pulse wave width',
    parameters: 'xx=pulse width (00-FF, scaled to 12-bit)',
    tick: 'tick-0',
    category: 'misc',
  },
};

/**
 * Furnace Game Boy effects
 */
export const FURNACE_GB_EFFECTS: Record<string, EffectDescription> = {
  '10': {
    command: '10xx',
    name: 'Set Envelope',
    description: 'Set volume envelope (NRx2 register)',
    parameters: 'xx: high nibble=volume, low nibble=direction+period',
    tick: 'tick-0',
    category: 'volume',
  },
  '11': {
    command: '11xx',
    name: 'Set Wave',
    description: 'Load wavetable into wave channel',
    parameters: 'xx=wavetable index (00-FF)',
    tick: 'tick-0',
    category: 'sample',
  },
  '12': {
    command: '12xx',
    name: 'Set Duty',
    description: 'Set pulse wave duty cycle',
    parameters: 'xx: 0=12.5%, 1=25%, 2=50%, 3=75%',
    tick: 'tick-0',
    category: 'misc',
  },
  '13': {
    command: '13xy',
    name: 'Set Sweep',
    description: 'Set frequency sweep (channel 1 only)',
    parameters: 'x=period (0-7), y=direction+shift',
    tick: 'tick-0',
    category: 'pitch',
  },
  '14': {
    command: '14xx',
    name: 'Set Noise Mode',
    description: 'Set noise channel width mode',
    parameters: 'xx: 0=15-bit (normal), 1=7-bit (metallic)',
    tick: 'tick-0',
    category: 'misc',
  },
};

/**
 * Furnace NES effects
 */
export const FURNACE_NES_EFFECTS: Record<string, EffectDescription> = {
  '11': {
    command: '11xx',
    name: 'Set DMC',
    description: 'Set DMC sample parameters',
    parameters: 'xx=DMC control value',
    tick: 'tick-0',
    category: 'sample',
  },
  '12': {
    command: '12xx',
    name: 'Set Duty/Noise',
    description: 'Set pulse duty or noise mode',
    parameters: 'xx: pulse 0-3=duty, noise 0=short 1=long',
    tick: 'tick-0',
    category: 'misc',
  },
  '13': {
    command: '13xy',
    name: 'Set Sweep',
    description: 'Set frequency sweep (pulse channels)',
    parameters: 'x=period, y=direction+shift',
    tick: 'tick-0',
    category: 'pitch',
  },
  '14': {
    command: '14xx',
    name: 'Set Envelope Mode',
    description: 'Set envelope/length counter mode',
    parameters: 'xx=envelope settings',
    tick: 'tick-0',
    category: 'misc',
  },
  '18': {
    command: '18xx',
    name: 'FDS Mod Depth',
    description: 'Set FDS modulation depth',
    parameters: 'xx=mod depth (00-3F)',
    tick: 'tick-0',
    category: 'misc',
  },
  '19': {
    command: '19xx',
    name: 'FDS Mod Speed High',
    description: 'Set FDS modulation speed (high byte)',
    parameters: 'xx=speed high byte',
    tick: 'tick-0',
    category: 'misc',
  },
};

/**
 * Furnace PCE/TurboGrafx effects
 */
export const FURNACE_PCE_EFFECTS: Record<string, EffectDescription> = {
  '10': {
    command: '10xx',
    name: 'Set LFO Mode',
    description: 'Set PCE LFO mode',
    parameters: 'xx=LFO mode (00-03)',
    tick: 'tick-0',
    category: 'misc',
  },
  '11': {
    command: '11xx',
    name: 'Set LFO Speed',
    description: 'Set PCE LFO speed',
    parameters: 'xx=LFO speed (00-FF)',
    tick: 'tick-0',
    category: 'misc',
  },
  '12': {
    command: '12xx',
    name: 'Set Wave',
    description: 'Load wavetable',
    parameters: 'xx=wavetable index (00-FF)',
    tick: 'tick-0',
    category: 'sample',
  },
};

/**
 * Furnace PSG/AY effects (AY-3-8910, SN76489, etc.)
 */
export const FURNACE_PSG_EFFECTS: Record<string, EffectDescription> = {
  '10': {
    command: '10xx',
    name: 'Set Envelope Shape',
    description: 'Set AY envelope shape',
    parameters: 'xx=shape (00-0F)',
    tick: 'tick-0',
    category: 'misc',
  },
  '11': {
    command: '11xx',
    name: 'Set Envelope Period Low',
    description: 'Set AY envelope period (low byte)',
    parameters: 'xx=period low byte',
    tick: 'tick-0',
    category: 'misc',
  },
  '12': {
    command: '12xx',
    name: 'Set Envelope Period High',
    description: 'Set AY envelope period (high byte)',
    parameters: 'xx=period high byte',
    tick: 'tick-0',
    category: 'misc',
  },
  '13': {
    command: '13xx',
    name: 'Set Auto-Envelope',
    description: 'Enable auto-envelope (track note pitch)',
    parameters: 'xx=auto-envelope numerator',
    tick: 'tick-0',
    category: 'misc',
  },
  '14': {
    command: '14xx',
    name: 'Set Noise Freq',
    description: 'Set noise frequency',
    parameters: 'xx=noise period (00-1F)',
    tick: 'tick-0',
    category: 'misc',
  },
  '15': {
    command: '15xx',
    name: 'Set Noise Mode',
    description: 'Set noise/tone mixing mode',
    parameters: 'xx=mode bits (tone/noise enable)',
    tick: 'tick-0',
    category: 'misc',
  },
};

/**
 * Furnace Namco/N163 effects
 */
export const FURNACE_NAMCO_EFFECTS: Record<string, EffectDescription> = {
  '10': {
    command: '10xx',
    name: 'Set Wave',
    description: 'Load wavetable',
    parameters: 'xx=wavetable index (00-FF)',
    tick: 'tick-0',
    category: 'sample',
  },
  '11': {
    command: '11xx',
    name: 'Set Wave Position',
    description: 'Set wave position in RAM',
    parameters: 'xx=position (00-FF)',
    tick: 'tick-0',
    category: 'misc',
  },
  '12': {
    command: '12xx',
    name: 'Set Wave Length',
    description: 'Set wave length',
    parameters: 'xx=length (must be power of 2)',
    tick: 'tick-0',
    category: 'misc',
  },
  '13': {
    command: '13xx',
    name: 'Wave Load',
    description: 'Load wave from position',
    parameters: 'xx=load parameters',
    tick: 'tick-0',
    category: 'misc',
  },
  '14': {
    command: '14xx',
    name: 'Set Channel Limit',
    description: 'Set max active channels (N163)',
    parameters: 'xx=channel count (1-8)',
    tick: 'tick-0',
    category: 'misc',
  },
};

/**
 * Furnace SNES effects
 */
export const FURNACE_SNES_EFFECTS: Record<string, EffectDescription> = {
  '10': {
    command: '10xx',
    name: 'Set Echo Enable',
    description: 'Enable/disable echo for channel',
    parameters: 'xx=01 (on), 00 (off)',
    tick: 'tick-0',
    category: 'misc',
  },
  '11': {
    command: '11xx',
    name: 'Set Echo Delay',
    description: 'Set echo delay time',
    parameters: 'xx=delay (00-0F, 16ms steps)',
    tick: 'tick-0',
    category: 'misc',
  },
  '12': {
    command: '12xx',
    name: 'Set Echo Feedback',
    description: 'Set echo feedback amount',
    parameters: 'xx=feedback (-80 to 7F)',
    tick: 'tick-0',
    category: 'misc',
  },
  '13': {
    command: '13xx',
    name: 'Set Echo Volume',
    description: 'Set echo volume',
    parameters: 'xx=volume (-80 to 7F)',
    tick: 'tick-0',
    category: 'volume',
  },
  '14': {
    command: '14xx',
    name: 'Set Echo FIR',
    description: 'Set echo FIR filter coefficient',
    parameters: 'xx=coefficient index and value',
    tick: 'tick-0',
    category: 'misc',
  },
  '15': {
    command: '15xx',
    name: 'Set Pitch Mod',
    description: 'Enable pitch modulation from prev channel',
    parameters: 'xx=01 (on), 00 (off)',
    tick: 'tick-0',
    category: 'pitch',
  },
  '16': {
    command: '16xx',
    name: 'Set Gain Mode',
    description: 'Set ADSR/gain mode',
    parameters: 'xx=gain mode (see SNES docs)',
    tick: 'tick-0',
    category: 'misc',
  },
  '17': {
    command: '17xx',
    name: 'Set Invert',
    description: 'Invert waveform phase',
    parameters: 'xx: 1=left, 2=right, 3=both',
    tick: 'tick-0',
    category: 'misc',
  },
};

/**
 * Furnace sample-based effects (Amiga, SEGAPCM, QSound, etc.)
 */
export const FURNACE_SAMPLE_EFFECTS: Record<string, EffectDescription> = {
  '10': {
    command: '10xx',
    name: 'Set Sample Mode',
    description: 'Set sample playback mode',
    parameters: 'xx=mode (chip-specific)',
    tick: 'tick-0',
    category: 'sample',
  },
  '11': {
    command: '11xx',
    name: 'Set Sample Bank',
    description: 'Set sample bank',
    parameters: 'xx=bank number',
    tick: 'tick-0',
    category: 'sample',
  },
  '12': {
    command: '12xx',
    name: 'Set Direction',
    description: 'Set sample playback direction',
    parameters: 'xx: 0=forward, 1=reverse',
    tick: 'tick-0',
    category: 'sample',
  },
  '20': {
    command: '20xx',
    name: 'ES5506 Filter Mode',
    description: 'Set ES5506 filter mode',
    parameters: 'xx=filter mode (00-03)',
    tick: 'tick-0',
    category: 'misc',
  },
  '21': {
    command: '21xx',
    name: 'ES5506 Filter K1',
    description: 'Set ES5506 filter K1 coefficient',
    parameters: 'xx=K1 value',
    tick: 'tick-0',
    category: 'misc',
  },
  '22': {
    command: '22xx',
    name: 'ES5506 Filter K2',
    description: 'Set ES5506 filter K2 coefficient',
    parameters: 'xx=K2 value',
    tick: 'tick-0',
    category: 'misc',
  },
  '30': {
    command: '30xx',
    name: 'QSound Echo',
    description: 'Set QSound echo feedback',
    parameters: 'xx=echo feedback',
    tick: 'tick-0',
    category: 'misc',
  },
  '31': {
    command: '31xx',
    name: 'QSound Surround',
    description: 'Set QSound surround/3D position',
    parameters: 'xx=surround position',
    tick: 'tick-0',
    category: 'panning',
  },
};

/**
 * Map synth types to their effect tables
 */
const SYNTH_TYPE_TO_EFFECTS: Record<string, Record<string, EffectDescription>> = {
  // FM chips
  'FurnaceOPN': FURNACE_FM_EFFECTS,
  'FurnaceOPN2': FURNACE_FM_EFFECTS,
  'FurnaceOPM': FURNACE_FM_EFFECTS,
  'FurnaceOPL': FURNACE_FM_EFFECTS,
  'FurnaceOPL2': FURNACE_FM_EFFECTS,
  'FurnaceOPL3': FURNACE_FM_EFFECTS,
  'FurnaceOPLL': FURNACE_FM_EFFECTS,
  'FurnaceOPZ': FURNACE_FM_EFFECTS,
  'FurnaceESFM': FURNACE_FM_EFFECTS,
  // C64/SID
  'FurnaceC64': FURNACE_C64_EFFECTS,
  'FurnaceSID2': FURNACE_C64_EFFECTS,
  'FurnaceSID3': FURNACE_C64_EFFECTS,
  // Game Boy
  'FurnaceGB': FURNACE_GB_EFFECTS,
  // NES
  'FurnaceNES': FURNACE_NES_EFFECTS,
  'FurnaceFDS': FURNACE_NES_EFFECTS,
  'FurnaceVRC6': FURNACE_NES_EFFECTS,
  'Furnace5E01': FURNACE_NES_EFFECTS,
  // PCE
  'FurnacePCE': FURNACE_PCE_EFFECTS,
  // PSG
  'FurnaceAY': FURNACE_PSG_EFFECTS,
  'FurnaceAY8930': FURNACE_PSG_EFFECTS,
  'FurnaceSAA': FURNACE_PSG_EFFECTS,
  'FurnaceSMS': FURNACE_PSG_EFFECTS,
  'FurnaceT6W28': FURNACE_PSG_EFFECTS,
  // Namco/wavetable
  'FurnaceN163': FURNACE_NAMCO_EFFECTS,
  'FurnaceSCC': FURNACE_NAMCO_EFFECTS,
  'FurnaceVB': FURNACE_NAMCO_EFFECTS,
  'FurnaceSWAN': FURNACE_NAMCO_EFFECTS,
  'FurnaceX1_010': FURNACE_NAMCO_EFFECTS,
  // SNES
  'FurnaceSNES': FURNACE_SNES_EFFECTS,
  // Sample-based
  'FurnaceAmiga': FURNACE_SAMPLE_EFFECTS,
  'FurnaceSEGAPCM': FURNACE_SAMPLE_EFFECTS,
  'FurnaceQSOUND': FURNACE_SAMPLE_EFFECTS,
  'FurnaceES5506': FURNACE_SAMPLE_EFFECTS,
  'FurnaceRF5C68': FURNACE_SAMPLE_EFFECTS,
  'FurnaceC140': FURNACE_SAMPLE_EFFECTS,
  'FurnaceC219': FURNACE_SAMPLE_EFFECTS,
  'FurnaceK054539': FURNACE_SAMPLE_EFFECTS,
  'FurnaceYMZ280B': FURNACE_SAMPLE_EFFECTS,
  'FurnaceGA20': FURNACE_SAMPLE_EFFECTS,
  'FurnaceK007232': FURNACE_SAMPLE_EFFECTS,
  'FurnaceK053260': FURNACE_SAMPLE_EFFECTS,
  'FurnaceOKI': FURNACE_SAMPLE_EFFECTS,
};

/**
 * Get Furnace platform-specific effect description
 */
export function getFurnaceEffectDescription(effectCode: number, synthType?: string): EffectDescription | null {
  const hexCode = effectCode.toString(16).toUpperCase().padStart(2, '0');

  // If synth type provided, try to get chip-specific description
  if (synthType) {
    const effectTable = SYNTH_TYPE_TO_EFFECTS[synthType];
    if (effectTable && effectTable[hexCode]) {
      return effectTable[hexCode];
    }
  }

  // Fall back to FM effects (most common)
  if (FURNACE_FM_EFFECTS[hexCode]) {
    return FURNACE_FM_EFFECTS[hexCode];
  }

  return null;
}

/**
 * Get all Furnace effects for a synth type
 */
export function getAllFurnaceEffects(synthType?: string): EffectDescription[] {
  if (synthType && SYNTH_TYPE_TO_EFFECTS[synthType]) {
    return Object.values(SYNTH_TYPE_TO_EFFECTS[synthType]);
  }
  // Return FM effects as default
  return Object.values(FURNACE_FM_EFFECTS);
}

/**
 * Check if a synth type has platform-specific effects
 */
export function hasFurnaceEffects(synthType: string): boolean {
  return synthType.startsWith('Furnace') || synthType in SYNTH_TYPE_TO_EFFECTS;
}

/**
 * Format effect description for tooltip display
 * @param effectString - Effect string like "A00" or "10F0"
 * @param synthType - Optional synth type for platform-specific effects
 */
export function formatEffectTooltip(effectString: string | null, synthType?: string): string | null {
  const desc = getFT2EffectDescription(effectString, synthType);
  if (!desc) return null;

  let tooltip = `${desc.command}: ${desc.name}\n`;
  tooltip += `${desc.description}\n\n`;
  tooltip += `Parameters: ${desc.parameters}\n`;
  tooltip += `Timing: ${desc.tick === 'tick-0' ? 'Tick 0 (row start)' : desc.tick === 'tick-N' ? 'Continuous (every tick)' : 'Both tick-0 and tick-N'}`;

  return tooltip;
}

/**
 * Get short effect name for display
 * @param effectString - Effect string like "A00" or "10F0"
 * @param synthType - Optional synth type for platform-specific effects
 */
export function getEffectShortName(effectString: string | null, synthType?: string): string | null {
  const desc = getFT2EffectDescription(effectString, synthType);
  return desc ? desc.name : null;
}

/**
 * Get all FT2 effect commands for autocomplete/help
 */
export function getAllFT2EffectCommands(): EffectDescription[] {
  const commands = Object.values(FT2_EFFECT_DESCRIPTIONS);
  const eCommands = Object.values(FT2_E_COMMAND_DESCRIPTIONS);
  return [...commands, ...eCommands];
}

/**
 * Get color class for an FT2 effect command (by category)
 * @param effectString - Effect string like "A00" or "10F0"
 * @param synthType - Optional synth type for platform-specific effects
 */
export function getEffectColorClass(effectString: string | null, synthType?: string): string {
  const desc = getFT2EffectDescription(effectString, synthType);
  if (!desc) return 'text-orange-400'; // default
  return EFFECT_CATEGORY_COLORS[desc.category];
}

/**
 * Get description for XM volume column value
 * XM volume column format:
 * - 0x00-0x0F: Nothing (empty)
 * - 0x10-0x50: Set volume (0-64)
 * - 0x60-0x6F: Volume slide down
 * - 0x70-0x7F: Volume slide up
 * - 0x80-0x8F: Fine volume slide down
 * - 0x90-0x9F: Fine volume slide up
 * - 0xA0-0xAF: Set vibrato speed
 * - 0xB0-0xBF: Vibrato (depth)
 * - 0xC0-0xCF: Set panning (0-F)
 * - 0xD0-0xDF: Panning slide left
 * - 0xE0-0xEF: Panning slide right
 * - 0xF0-0xFF: Tone portamento
 */
export function getVolumeColumnDescription(value: number): string | null {
  if (value === null || value === undefined || value < 0x10) {
    return null;
  }

  if (value >= 0x10 && value <= 0x50) {
    const vol = value - 0x10;
    return `Set Volume: ${vol}`;
  }

  if (value >= 0x60 && value <= 0x6F) {
    const speed = value & 0x0F;
    return `Volume Slide Down: -${speed}`;
  }

  if (value >= 0x70 && value <= 0x7F) {
    const speed = value & 0x0F;
    return `Volume Slide Up: +${speed}`;
  }

  if (value >= 0x80 && value <= 0x8F) {
    const speed = value & 0x0F;
    return `Fine Volume Slide Down: -${speed}`;
  }

  if (value >= 0x90 && value <= 0x9F) {
    const speed = value & 0x0F;
    return `Fine Volume Slide Up: +${speed}`;
  }

  if (value >= 0xA0 && value <= 0xAF) {
    const speed = value & 0x0F;
    return `Set Vibrato Speed: ${speed}`;
  }

  if (value >= 0xB0 && value <= 0xBF) {
    const depth = value & 0x0F;
    return `Vibrato Depth: ${depth}`;
  }

  if (value >= 0xC0 && value <= 0xCF) {
    const pan = value & 0x0F;
    return `Set Panning: ${pan} (0=left, F=right)`;
  }

  if (value >= 0xD0 && value <= 0xDF) {
    const speed = value & 0x0F;
    return `Panning Slide Left: ${speed}`;
  }

  if (value >= 0xE0 && value <= 0xEF) {
    const speed = value & 0x0F;
    return `Panning Slide Right: ${speed}`;
  }

  if (value >= 0xF0 && value <= 0xFF) {
    const speed = value & 0x0F;
    return `Tone Portamento: speed ${speed}`;
  }

  return null;
}
