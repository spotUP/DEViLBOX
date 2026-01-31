import type { MappableParameter, KnobBankMode } from './types';

export interface KnobAssignment {
  cc: number;
  param: MappableParameter;
  label: string;
}

export const KNOB_BANKS: Record<KnobBankMode, KnobAssignment[]> = {
  '303': [
    { cc: 70, param: 'cutoff', label: 'Cutoff' },
    { cc: 71, param: 'resonance', label: 'Resonance' },
    { cc: 72, param: 'envMod', label: 'Env Mod' },
    { cc: 73, param: 'decay', label: 'Decay' },
    { cc: 74, param: 'accent', label: 'Accent' },
    { cc: 75, param: 'overdrive', label: 'Drive' },
    { cc: 76, param: 'slideTime', label: 'Slide' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  'Siren': [
    { cc: 70, param: 'siren.osc.frequency', label: 'Osc Freq' },
    { cc: 71, param: 'siren.lfo.rate', label: 'LFO Rate' },
    { cc: 72, param: 'siren.lfo.depth', label: 'LFO Depth' },
    { cc: 73, param: 'siren.delay.time', label: 'Delay Time' },
    { cc: 74, param: 'siren.delay.feedback', label: 'Feedback' },
    { cc: 75, param: 'siren.delay.wet', label: 'Delay Mix' },
    { cc: 76, param: 'siren.filter.frequency', label: 'Filter' },
    { cc: 77, param: 'siren.reverb.wet', label: 'Reverb' },
  ],
  'FX': [
    { cc: 70, param: 'echo.rate', label: 'Echo Rate' },
    { cc: 71, param: 'echo.intensity', label: 'Intensity' },
    { cc: 72, param: 'echo.echoVolume', label: 'Echo Vol' },
    { cc: 73, param: 'echo.reverbVolume', label: 'Rev Vol' },
    { cc: 74, param: 'echo.mode', label: 'Echo Mode' },
    { cc: 75, param: 'biphase.rateA', label: 'Phase A' },
    { cc: 76, param: 'biphase.feedback', label: 'Phase FB' },
    { cc: 77, param: 'biphase.routing', label: 'Routing' },
  ],
  'Mixer': [
    { cc: 70, param: 'mixer.volume', label: 'Vol 1' },
    { cc: 71, param: 'mixer.volume', label: 'Vol 2' },
    { cc: 72, param: 'mixer.volume', label: 'Vol 3' },
    { cc: 73, param: 'mixer.volume', label: 'Vol 4' },
    { cc: 74, param: 'mixer.pan', label: 'Pan 1' },
    { cc: 75, param: 'mixer.pan', label: 'Pan 2' },
    { cc: 76, param: 'mixer.pan', label: 'Pan 3' },
    { cc: 77, param: 'mixer.pan', label: 'Pan 4' },
  ],
};
