import type { SynthPanelLayout } from '../synthPanelTypes';

// DrumKitConfig has no audio synthesis parameters (only sample mappings).
// Expose volume/pan only; the keymap editor is handled in a separate UI.
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const DRUM_KIT_LAYOUT: SynthPanelLayout = {
  name: 'Drum Kit',
  configKey: '',
  sections: [
    {
      label: 'AMP',
      controls: [
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
        { type: 'knob', key: 'pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
      ],
    },
  ],
};
