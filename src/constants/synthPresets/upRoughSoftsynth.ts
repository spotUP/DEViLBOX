import type { SynthPreset } from './types';
import { SOFTSYNTH_VOICES } from '@/engine/uprough/voiceRegistry';
import { voiceDefaults } from '@/engine/uprough/softsynthVoice';

const MELODIC_VOICES: Record<string, SynthPreset['category']> = {
  bass808: 'bass',
  piano: 'key',
};

/**
 * "Golden Era" kit: one preset per voice. The voice defaults ARE the golden_era values of the Python
 * style tables, so the kit follows the registry (a new voice is a new preset, no list to keep in step).
 */
export const UPROUGH_SOFTSYNTH_PRESETS: SynthPreset[] = SOFTSYNTH_VOICES.map((voice) => ({
  id: `uprough-golden-era-${voice.id}`,
  name: `Golden Era ${voice.label.replace(/^Up Rough /, '')}`,
  description: `Up Rough golden-era ${voice.label} at the demo system's default parameters`,
  category: MELODIC_VOICES[voice.id] ?? 'drum',
  config: { voice: voice.id, params: voiceDefaults(voice), seed: 0 },
}));
