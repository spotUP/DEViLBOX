import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

/** Minimal layout shared by all Furnace chip types (volume + pan). */
export const FURNACE_LAYOUT: SynthPanelLayout = {
  name: 'Furnace Chip',
  configKey: 'furnace',
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
