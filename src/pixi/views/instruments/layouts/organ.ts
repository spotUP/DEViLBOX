import type { SynthPanelLayout } from '../synthPanelTypes';

// OrganConfig lives at config.organ
// drawbars is a 9-element array: [16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1']
// Each drawbar value: 0-8 (9 positions)

const fmtDrawbar = (v: number) => `${Math.round(v)}`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const ORGAN_LAYOUT: SynthPanelLayout = {
  name: 'Organ',
  configKey: 'organ',
  tabs: [
    {
      id: 'drawbars',
      label: 'DRAW',
      sections: [
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
            { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
          ],
        },
        {
          label: 'DRAWBARS',
          controls: [
            // 9 drawbars as vertical sliders: 16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1'
            { type: 'slider', key: 'drawbars.0', label: "16'", min: 0, max: 8, orientation: 'vertical', centerDetent: false },
            { type: 'slider', key: 'drawbars.1', label: "5⅓'", min: 0, max: 8, orientation: 'vertical', centerDetent: false },
            { type: 'slider', key: 'drawbars.2', label: "8'", min: 0, max: 8, orientation: 'vertical', centerDetent: false },
            { type: 'slider', key: 'drawbars.3', label: "4'", min: 0, max: 8, orientation: 'vertical', centerDetent: false },
            { type: 'slider', key: 'drawbars.4', label: "2⅔'", min: 0, max: 8, orientation: 'vertical', centerDetent: false },
            { type: 'slider', key: 'drawbars.5', label: "2'", min: 0, max: 8, orientation: 'vertical', centerDetent: false },
            { type: 'slider', key: 'drawbars.6', label: "1⅗'", min: 0, max: 8, orientation: 'vertical', centerDetent: false },
            { type: 'slider', key: 'drawbars.7', label: "1⅓'", min: 0, max: 8, orientation: 'vertical', centerDetent: false },
            { type: 'slider', key: 'drawbars.8', label: "1'", min: 0, max: 8, orientation: 'vertical', centerDetent: false },
          ],
        },
      ],
    },
    {
      id: 'mod',
      label: 'MOD',
      sections: [
        {
          label: 'PERCUSSION',
          controls: [
            { type: 'toggle', key: 'percussion.enabled', label: 'PERC' },
            { type: 'knob', key: 'percussion.volume', label: 'P VOL', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
        {
          label: 'VIBRATO',
          controls: [
            { type: 'knob', key: 'vibrato.depth', label: 'VIB DEPTH', color: '#cc66ff', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'keyClick', label: 'KEY CLICK', color: '#33ccff', min: 0, max: 100, defaultValue: 30, formatValue: fmtPct },
          ],
        },
        {
          label: 'ROTARY',
          controls: [
            { type: 'toggle', key: 'rotary.enabled', label: 'ROTARY' },
          ],
        },
      ],
    },
  ],
};
