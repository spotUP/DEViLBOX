import type { InstrumentPreset } from '../../types/instrument';


export const WAM_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'Web Audio Module (WAM)',
    synthType: 'WAM',
    wam: { moduleUrl: '', pluginState: null },
    effects: [],
    volume: -12,
    pan: 0,
  }
];
