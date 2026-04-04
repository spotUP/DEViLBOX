export interface AutomationParamDef {
  id: string;              // "sid.0.0.pulseWidth" — format.chip.voice.param
  label: string;           // "Pulse Width"
  group: string;           // "Voice 1", "Filter", "Global"
  channel?: number;        // voice/channel index
  min: number;             // raw register min
  max: number;             // raw register max
  unit: string;            // "12-bit", "4-bit", "0-64"
  sourceType: 'table' | 'effect' | 'macro' | 'register';
  color: string;           // CSS color variable
}

export interface AutomationParamGroup {
  label: string;
  params: AutomationParamDef[];
}

// ── SID parameters (per chip) ──

function sidVoiceParams(chip: number, voice: number): AutomationParamDef[] {
  const prefix = `sid.${chip}.${voice}`;
  const group = `${chip > 0 ? `SID ${chip + 1} ` : ''}Voice ${voice + 1}`;
  return [
    { id: `${prefix}.frequency`, label: 'Frequency', group, min: 0, max: 65535, unit: '16-bit', sourceType: 'table', color: 'var(--color-synth-synthesis)' },
    { id: `${prefix}.pulseWidth`, label: 'Pulse Width', group, min: 0, max: 4095, unit: '12-bit', sourceType: 'table', color: 'var(--color-synth-synthesis)' },
    { id: `${prefix}.waveNoise`, label: 'Noise', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-synthesis)' },
    { id: `${prefix}.wavePulse`, label: 'Pulse', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-synthesis)' },
    { id: `${prefix}.waveSaw`, label: 'Sawtooth', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-synthesis)' },
    { id: `${prefix}.waveTri`, label: 'Triangle', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-synthesis)' },
    { id: `${prefix}.test`, label: 'Test', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-synthesis)' },
    { id: `${prefix}.ringMod`, label: 'Ring Mod', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-modulation)' },
    { id: `${prefix}.sync`, label: 'Sync', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-modulation)' },
    { id: `${prefix}.gate`, label: 'Gate', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-envelope)' },
    { id: `${prefix}.attack`, label: 'Attack', group, min: 0, max: 15, unit: '4-bit', sourceType: 'register', color: 'var(--color-synth-envelope)' },
    { id: `${prefix}.decay`, label: 'Decay', group, min: 0, max: 15, unit: '4-bit', sourceType: 'register', color: 'var(--color-synth-envelope)' },
    { id: `${prefix}.sustain`, label: 'Sustain', group, min: 0, max: 15, unit: '4-bit', sourceType: 'register', color: 'var(--color-synth-envelope)' },
    { id: `${prefix}.release`, label: 'Release', group, min: 0, max: 15, unit: '4-bit', sourceType: 'register', color: 'var(--color-synth-envelope)' },
  ];
}

function sidFilterParams(chip: number): AutomationParamDef[] {
  const prefix = `sid.${chip}.filter`;
  const group = `${chip > 0 ? `SID ${chip + 1} ` : ''}Filter`;
  return [
    { id: `${prefix}.cutoff`, label: 'Cutoff', group, min: 0, max: 2047, unit: '11-bit', sourceType: 'table', color: 'var(--color-synth-filter)' },
    { id: `${prefix}.resonance`, label: 'Resonance', group, min: 0, max: 15, unit: '4-bit', sourceType: 'table', color: 'var(--color-synth-filter)' },
    { id: `${prefix}.voice1`, label: 'Route Voice 1', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-filter)' },
    { id: `${prefix}.voice2`, label: 'Route Voice 2', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-filter)' },
    { id: `${prefix}.voice3`, label: 'Route Voice 3', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-filter)' },
    { id: `${prefix}.extIn`, label: 'Ext Input', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-filter)' },
    { id: `${prefix}.lp`, label: 'Low-Pass', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-filter)' },
    { id: `${prefix}.bp`, label: 'Band-Pass', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-filter)' },
    { id: `${prefix}.hp`, label: 'High-Pass', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-filter)' },
    { id: `${prefix}.voice3off`, label: '3OFF', group, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-filter)' },
  ];
}

function sidGlobalParams(chip: number): AutomationParamDef[] {
  const prefix = `sid.${chip}.global`;
  const group = `${chip > 0 ? `SID ${chip + 1} ` : ''}Global`;
  return [
    { id: `${prefix}.volume`, label: 'Master Volume', group, min: 0, max: 15, unit: '4-bit', sourceType: 'register', color: 'var(--color-synth-output)' },
  ];
}

export function getSIDParams(chipCount = 1): AutomationParamDef[] {
  const params: AutomationParamDef[] = [];
  for (let chip = 0; chip < chipCount; chip++) {
    for (let voice = 0; voice < 3; voice++) {
      params.push(...sidVoiceParams(chip, voice));
    }
    params.push(...sidFilterParams(chip));
    params.push(...sidGlobalParams(chip));
  }
  return params;
}

// ── Paula parameters (4 channels) ──

export function getPaulaParams(): AutomationParamDef[] {
  const params: AutomationParamDef[] = [];
  for (let ch = 0; ch < 4; ch++) {
    const prefix = `paula.${ch}`;
    const group = `Channel ${ch + 1}`;
    params.push(
      { id: `${prefix}.period`, label: 'Period', group, channel: ch, min: 0, max: 65535, unit: '16-bit', sourceType: 'effect', color: 'var(--color-synth-synthesis)' },
      { id: `${prefix}.volume`, label: 'Volume', group, channel: ch, min: 0, max: 64, unit: '0-64', sourceType: 'effect', color: 'var(--color-synth-output)' },
      { id: `${prefix}.sampleAddrHi`, label: 'Sample Addr Hi', group, channel: ch, min: 0, max: 65535, unit: '16-bit', sourceType: 'register', color: 'var(--color-synth-synthesis)' },
      { id: `${prefix}.sampleAddrLo`, label: 'Sample Addr Lo', group, channel: ch, min: 0, max: 65535, unit: '16-bit', sourceType: 'register', color: 'var(--color-synth-synthesis)' },
      { id: `${prefix}.sampleLen`, label: 'Sample Length', group, channel: ch, min: 0, max: 65535, unit: '16-bit', sourceType: 'register', color: 'var(--color-synth-synthesis)' },
      { id: `${prefix}.dma`, label: 'DMA', group, channel: ch, min: 0, max: 1, unit: 'bit', sourceType: 'register', color: 'var(--color-synth-envelope)' },
    );
  }
  return params;
}

// ── Furnace parameters (chip-dependent) ──

export function getFurnaceUniversalParams(channelCount: number): AutomationParamDef[] {
  const params: AutomationParamDef[] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const prefix = `fur.${ch}`;
    const group = `Channel ${ch + 1}`;
    params.push(
      { id: `${prefix}.volume`, label: 'Volume', group, channel: ch, min: 0, max: 127, unit: '7-bit', sourceType: 'macro', color: 'var(--color-synth-output)' },
      { id: `${prefix}.pitch`, label: 'Pitch', group, channel: ch, min: -128, max: 127, unit: 'semitones', sourceType: 'macro', color: 'var(--color-synth-synthesis)' },
      { id: `${prefix}.panL`, label: 'Pan L', group, channel: ch, min: 0, max: 127, unit: '7-bit', sourceType: 'effect', color: 'var(--color-synth-output)' },
      { id: `${prefix}.panR`, label: 'Pan R', group, channel: ch, min: 0, max: 127, unit: '7-bit', sourceType: 'effect', color: 'var(--color-synth-output)' },
      { id: `${prefix}.duty`, label: 'Duty', group, channel: ch, min: 0, max: 4095, unit: '12-bit', sourceType: 'macro', color: 'var(--color-synth-synthesis)' },
    );
  }
  return params;
}

export function getFurnaceFMOperatorParams(channelCount: number, opCount = 4): AutomationParamDef[] {
  const params: AutomationParamDef[] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    for (let op = 0; op < opCount; op++) {
      const prefix = `fur.${ch}.op${op}`;
      const group = `Ch ${ch + 1} Op ${op + 1}`;
      params.push(
        { id: `${prefix}.tl`, label: 'TL', group, channel: ch, min: 0, max: 127, unit: '7-bit', sourceType: 'macro', color: 'var(--color-synth-output)' },
        { id: `${prefix}.ar`, label: 'AR', group, channel: ch, min: 0, max: 31, unit: '5-bit', sourceType: 'macro', color: 'var(--color-synth-envelope)' },
        { id: `${prefix}.dr`, label: 'DR', group, channel: ch, min: 0, max: 31, unit: '5-bit', sourceType: 'macro', color: 'var(--color-synth-envelope)' },
        { id: `${prefix}.sl`, label: 'SL', group, channel: ch, min: 0, max: 15, unit: '4-bit', sourceType: 'macro', color: 'var(--color-synth-envelope)' },
        { id: `${prefix}.d2r`, label: 'D2R', group, channel: ch, min: 0, max: 31, unit: '5-bit', sourceType: 'macro', color: 'var(--color-synth-envelope)' },
        { id: `${prefix}.rr`, label: 'RR', group, channel: ch, min: 0, max: 15, unit: '4-bit', sourceType: 'macro', color: 'var(--color-synth-envelope)' },
        { id: `${prefix}.dt`, label: 'DT', group, channel: ch, min: 0, max: 7, unit: '3-bit', sourceType: 'macro', color: 'var(--color-synth-synthesis)' },
        { id: `${prefix}.mult`, label: 'MULT', group, channel: ch, min: 0, max: 15, unit: '4-bit', sourceType: 'macro', color: 'var(--color-synth-synthesis)' },
        { id: `${prefix}.rs`, label: 'RS', group, channel: ch, min: 0, max: 3, unit: '2-bit', sourceType: 'macro', color: 'var(--color-synth-envelope)' },
        { id: `${prefix}.am`, label: 'AM', group, channel: ch, min: 0, max: 1, unit: 'bit', sourceType: 'macro', color: 'var(--color-synth-modulation)' },
        { id: `${prefix}.ssg`, label: 'SSG-EG', group, channel: ch, min: 0, max: 15, unit: '4-bit', sourceType: 'macro', color: 'var(--color-synth-envelope)' },
        { id: `${prefix}.ws`, label: 'Waveform', group, channel: ch, min: 0, max: 7, unit: '3-bit', sourceType: 'macro', color: 'var(--color-synth-synthesis)' },
      );
    }
    const chPrefix = `fur.${ch}`;
    const chGroup = `Ch ${ch + 1} FM`;
    params.push(
      { id: `${chPrefix}.fb`, label: 'Feedback', group: chGroup, channel: ch, min: 0, max: 7, unit: '3-bit', sourceType: 'macro', color: 'var(--color-synth-synthesis)' },
      { id: `${chPrefix}.alg`, label: 'Algorithm', group: chGroup, channel: ch, min: 0, max: 7, unit: '3-bit', sourceType: 'macro', color: 'var(--color-synth-synthesis)' },
      { id: `${chPrefix}.fms`, label: 'FMS', group: chGroup, channel: ch, min: 0, max: 7, unit: '3-bit', sourceType: 'macro', color: 'var(--color-synth-modulation)' },
      { id: `${chPrefix}.ams`, label: 'AMS', group: chGroup, channel: ch, min: 0, max: 3, unit: '2-bit', sourceType: 'macro', color: 'var(--color-synth-modulation)' },
    );
  }
  return params;
}

export function getFurnaceSIDParams(channelCount: number): AutomationParamDef[] {
  const params = getFurnaceUniversalParams(channelCount);
  for (let ch = 0; ch < channelCount; ch++) {
    const prefix = `fur.${ch}`;
    const group = `Ch ${ch + 1} SID`;
    params.push(
      { id: `${prefix}.c64Cutoff`, label: 'Filter Cutoff', group, channel: ch, min: 0, max: 2047, unit: '11-bit', sourceType: 'effect', color: 'var(--color-synth-filter)' },
      { id: `${prefix}.c64Reso`, label: 'Resonance', group, channel: ch, min: 0, max: 15, unit: '4-bit', sourceType: 'effect', color: 'var(--color-synth-filter)' },
      { id: `${prefix}.c64FilterMode`, label: 'Filter Mode', group, channel: ch, min: 0, max: 7, unit: '3-bit', sourceType: 'effect', color: 'var(--color-synth-filter)' },
      { id: `${prefix}.c64FineDuty`, label: 'Fine Duty', group, channel: ch, min: 0, max: 4095, unit: '12-bit', sourceType: 'effect', color: 'var(--color-synth-synthesis)' },
      { id: `${prefix}.c64FineCutoff`, label: 'Fine Cutoff', group, channel: ch, min: 0, max: 2047, unit: '11-bit', sourceType: 'effect', color: 'var(--color-synth-filter)' },
      { id: `${prefix}.c64PwSlide`, label: 'PW Slide', group, channel: ch, min: -128, max: 127, unit: 'signed', sourceType: 'effect', color: 'var(--color-synth-synthesis)' },
      { id: `${prefix}.c64CutoffSlide`, label: 'Cutoff Slide', group, channel: ch, min: -128, max: 127, unit: 'signed', sourceType: 'effect', color: 'var(--color-synth-filter)' },
    );
  }
  return params;
}

export function getFurnaceAYParams(channelCount: number): AutomationParamDef[] {
  const params = getFurnaceUniversalParams(channelCount);
  for (let ch = 0; ch < channelCount; ch++) {
    const prefix = `fur.${ch}`;
    const group = `Ch ${ch + 1} AY`;
    params.push(
      { id: `${prefix}.ayEnvShape`, label: 'Env Shape', group, channel: ch, min: 0, max: 15, unit: '4-bit', sourceType: 'effect', color: 'var(--color-synth-envelope)' },
      { id: `${prefix}.ayEnvLo`, label: 'Env Freq Lo', group, channel: ch, min: 0, max: 255, unit: '8-bit', sourceType: 'effect', color: 'var(--color-synth-envelope)' },
      { id: `${prefix}.ayEnvHi`, label: 'Env Freq Hi', group, channel: ch, min: 0, max: 255, unit: '8-bit', sourceType: 'effect', color: 'var(--color-synth-envelope)' },
      { id: `${prefix}.ayNoiseMaskAnd`, label: 'Noise AND', group, channel: ch, min: 0, max: 31, unit: '5-bit', sourceType: 'effect', color: 'var(--color-synth-synthesis)' },
      { id: `${prefix}.ayNoiseMaskOr`, label: 'Noise OR', group, channel: ch, min: 0, max: 31, unit: '5-bit', sourceType: 'effect', color: 'var(--color-synth-synthesis)' },
    );
  }
  return params;
}

export function getFurnaceGBParams(channelCount: number): AutomationParamDef[] {
  const params = getFurnaceUniversalParams(channelCount);
  for (let ch = 0; ch < Math.min(channelCount, 4); ch++) {
    const prefix = `fur.${ch}`;
    const group = `Ch ${ch + 1} GB`;
    params.push(
      { id: `${prefix}.gbSweepTime`, label: 'Sweep Time', group, channel: ch, min: 0, max: 7, unit: '3-bit', sourceType: 'effect', color: 'var(--color-synth-modulation)' },
      { id: `${prefix}.gbSweepDir`, label: 'Sweep Dir', group, channel: ch, min: 0, max: 1, unit: 'bit', sourceType: 'effect', color: 'var(--color-synth-modulation)' },
    );
  }
  return params;
}

export function getFurnaceNESParams(channelCount: number): AutomationParamDef[] {
  const params = getFurnaceUniversalParams(channelCount);
  for (let ch = 0; ch < channelCount; ch++) {
    const prefix = `fur.${ch}`;
    const group = `Ch ${ch + 1} NES`;
    params.push(
      { id: `${prefix}.nesSweep`, label: 'Sweep', group, channel: ch, min: 0, max: 255, unit: '8-bit', sourceType: 'effect', color: 'var(--color-synth-modulation)' },
      { id: `${prefix}.nesDmc`, label: 'DMC', group, channel: ch, min: 0, max: 127, unit: '7-bit', sourceType: 'effect', color: 'var(--color-synth-synthesis)' },
      { id: `${prefix}.nesEnvMode`, label: 'Env Mode', group, channel: ch, min: 0, max: 3, unit: '2-bit', sourceType: 'effect', color: 'var(--color-synth-envelope)' },
      { id: `${prefix}.nesLength`, label: 'Length', group, channel: ch, min: 0, max: 255, unit: '8-bit', sourceType: 'effect', color: 'var(--color-synth-envelope)' },
    );
  }
  return params;
}

export function getFurnaceSNESParams(channelCount: number): AutomationParamDef[] {
  const params = getFurnaceUniversalParams(channelCount);
  for (let ch = 0; ch < channelCount; ch++) {
    const prefix = `fur.${ch}`;
    const group = `Ch ${ch + 1} SNES`;
    params.push(
      { id: `${prefix}.snesEcho`, label: 'Echo', group, channel: ch, min: 0, max: 1, unit: 'bit', sourceType: 'effect', color: 'var(--color-synth-effects)' },
      { id: `${prefix}.snesPitchMod`, label: 'Pitch Mod', group, channel: ch, min: 0, max: 1, unit: 'bit', sourceType: 'effect', color: 'var(--color-synth-modulation)' },
      { id: `${prefix}.snesInvert`, label: 'Invert', group, channel: ch, min: 0, max: 1, unit: 'bit', sourceType: 'effect', color: 'var(--color-synth-synthesis)' },
      { id: `${prefix}.snesGainMode`, label: 'Gain Mode', group, channel: ch, min: 0, max: 7, unit: '3-bit', sourceType: 'effect', color: 'var(--color-synth-envelope)' },
      { id: `${prefix}.snesGain`, label: 'Gain', group, channel: ch, min: 0, max: 127, unit: '7-bit', sourceType: 'effect', color: 'var(--color-synth-envelope)' },
      { id: `${prefix}.snesEchoDelay`, label: 'Echo Delay', group, channel: ch, min: 0, max: 15, unit: '4-bit', sourceType: 'effect', color: 'var(--color-synth-effects)' },
      { id: `${prefix}.snesEchoFeedback`, label: 'Echo FB', group, channel: ch, min: -128, max: 127, unit: 'signed', sourceType: 'effect', color: 'var(--color-synth-effects)' },
      { id: `${prefix}.snesEchoVolL`, label: 'Echo Vol L', group, channel: ch, min: -128, max: 127, unit: 'signed', sourceType: 'effect', color: 'var(--color-synth-effects)' },
      { id: `${prefix}.snesEchoVolR`, label: 'Echo Vol R', group, channel: ch, min: -128, max: 127, unit: 'signed', sourceType: 'effect', color: 'var(--color-synth-effects)' },
    );
  }
  return params;
}

// ── Grouped params for dropdown UI ──

export function groupParams(params: AutomationParamDef[]): AutomationParamGroup[] {
  const groupMap = new Map<string, AutomationParamDef[]>();
  for (const p of params) {
    const existing = groupMap.get(p.group);
    if (existing) existing.push(p);
    else groupMap.set(p.group, [p]);
  }
  return Array.from(groupMap.entries()).map(([label, params]) => ({ label, params }));
}

// ── Format → params lookup ──

export type AutomationFormat = 'gtultra' | 'uade' | 'furnace';

export function getParamsForFormat(format: AutomationFormat, config?: {
  sidCount?: number;
  channelCount?: number;
  chipType?: string;
}): AutomationParamDef[] {
  switch (format) {
    case 'gtultra':
      return getSIDParams(config?.sidCount ?? 1);
    case 'uade':
      return getPaulaParams();
    case 'furnace': {
      const chCount = config?.channelCount ?? 4;
      const chip = config?.chipType ?? 'generic';
      if (chip.includes('ym') || chip.includes('opn') || chip.includes('opl') || chip.includes('opm')) {
        return [...getFurnaceUniversalParams(chCount), ...getFurnaceFMOperatorParams(chCount)];
      }
      if (chip.includes('sid') || chip.includes('c64')) {
        return getFurnaceSIDParams(chCount);
      }
      if (chip.includes('ay') || chip.includes('sn76')) {
        return getFurnaceAYParams(chCount);
      }
      if (chip.includes('gb') || chip.includes('gameboy')) {
        return getFurnaceGBParams(chCount);
      }
      if (chip.includes('nes') || chip.includes('2a03')) {
        return getFurnaceNESParams(chCount);
      }
      if (chip.includes('snes') || chip.includes('spc')) {
        return getFurnaceSNESParams(chCount);
      }
      return getFurnaceUniversalParams(chCount);
    }
    default:
      return [];
  }
}
