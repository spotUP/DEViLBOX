/**
 * DAW Mode Colors — shared between DOM and Pixi DAW views.
 * CSS color strings for DOM usage.
 */

export const DAW_CSS = {
  bg:          '#121218',
  panelBg:     '#1a1a24',
  panelBorder: '#2a2a3a',
  surface:     '#22222e',
  surfaceHover:'#2a2a38',

  accent:      '#6366f1',
  accentWarm:  '#f59e0b',
  success:     '#10b981',
  error:       '#ef4444',

  text:        '#e2e2e8',
  textSec:     '#6b6b80',
  textMuted:   '#44445a',
} as const;

export const DAW_CH_CSS = [
  '#6366f1', // CH1 indigo
  '#f59e0b', // CH2 amber
  '#10b981', // CH3 emerald
  '#ec4899', // CH4 pink
  '#06b6d4', // CH5 cyan
  '#a855f7', // CH6 purple
];
