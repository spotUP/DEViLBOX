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
 */
export function getFT2EffectDescription(effectString: string | null): EffectDescription | null {
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

  // Regular command
  if (FT2_EFFECT_DESCRIPTIONS[command]) {
    // Clone and fill in actual parameter
    const desc = { ...FT2_EFFECT_DESCRIPTIONS[command] };
    desc.command = effectString;
    return desc;
  }

  return null;
}

/**
 * Format effect description for tooltip display
 */
export function formatEffectTooltip(effectString: string | null): string | null {
  const desc = getFT2EffectDescription(effectString);
  if (!desc) return null;

  let tooltip = `${desc.command}: ${desc.name}\n`;
  tooltip += `${desc.description}\n\n`;
  tooltip += `Parameters: ${desc.parameters}\n`;
  tooltip += `Timing: ${desc.tick === 'tick-0' ? 'Tick 0 (row start)' : desc.tick === 'tick-N' ? 'Continuous (every tick)' : 'Both tick-0 and tick-N'}`;

  return tooltip;
}

/**
 * Get short effect name for display
 */
export function getEffectShortName(effectString: string | null): string | null {
  const desc = getFT2EffectDescription(effectString);
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
 */
export function getEffectColorClass(effectString: string | null): string {
  const desc = getFT2EffectDescription(effectString);
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
