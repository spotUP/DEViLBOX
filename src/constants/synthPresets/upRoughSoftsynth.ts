import type { SynthPreset } from './types';
import type { UpRoughSoftsynthConfig } from '@typedefs/instrument';
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
export const GOLDEN_ERA_KIT: (Omit<SynthPreset, 'config'> & { config: UpRoughSoftsynthConfig })[] = SOFTSYNTH_VOICES.map((voice) => ({
  id: `uprough-golden-era-${voice.id}`,
  name: `Golden Era ${voice.label.replace(/^Up Rough /, '')}`,
  description: `Up Rough golden-era ${voice.label} at the demo system's default parameters`,
  category: MELODIC_VOICES[voice.id] ?? 'drum',
  config: { voice: voice.id, params: voiceDefaults(voice), seed: 0 },
}));

/** The kit in the SynthPreset shape (synthPresets/ registry, drumpad). FACTORY_PRESETS maps GOLDEN_ERA_KIT. */
export const UPROUGH_SOFTSYNTH_PRESETS: SynthPreset[] = GOLDEN_ERA_KIT.map((p) => ({ ...p, config: { ...p.config } }));
