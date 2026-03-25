/**
 * DAW Mode Colors — CSS variable references for DOM DAW views.
 * These respond to theme changes automatically.
 */

export const DAW_CSS = {
  bg:          'var(--color-bg)',
  panelBg:     'var(--color-bg-secondary)',
  panelBorder: 'var(--color-border)',
  surface:     'var(--color-bg-tertiary)',
  surfaceHover:'var(--color-bg-hover)',

  accent:      'var(--color-accent)',
  accentWarm:  'var(--color-warning)',
  success:     'var(--color-success)',
  error:       'var(--color-error)',

  text:        'var(--color-text)',
  textSec:     'var(--color-text-secondary)',
  textMuted:   'var(--color-text-muted)',
} as const;

export const DAW_CH_CSS = [
  '#6366f1', // CH1 indigo
  '#f59e0b', // CH2 amber
  '#10b981', // CH3 emerald
  '#ec4899', // CH4 pink
  '#06b6d4', // CH5 cyan
  '#a855f7', // CH6 purple
];
