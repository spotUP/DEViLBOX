export interface SynthPreset {
  id: string;
  name: string;
  description: string;
  category: 'bass' | 'lead' | 'pad' | 'key' | 'fx' | 'drum' | 'pluck' | 'string';
  config: Record<string, unknown>;
}
