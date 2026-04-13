/**
 * Preset pad colors for quick assignment via context menu and wizard.
 * These are CSS hex values safe for both DOM (Tailwind) and GL (parsed to 0xRRGGBB).
 */

export interface PadColorPreset {
  id: string;
  hex: string;
  label: string;
}

export const PAD_COLOR_PRESETS: PadColorPreset[] = [
  { id: 'red',     hex: '#ef4444', label: 'Red' },
  { id: 'orange',  hex: '#f97316', label: 'Orange' },
  { id: 'amber',   hex: '#f59e0b', label: 'Amber' },
  { id: 'emerald', hex: '#10b981', label: 'Emerald' },
  { id: 'cyan',    hex: '#06b6d4', label: 'Cyan' },
  { id: 'blue',    hex: '#3b82f6', label: 'Blue' },
  { id: 'violet',  hex: '#8b5cf6', label: 'Violet' },
  { id: 'pink',    hex: '#ec4899', label: 'Pink' },
  { id: 'rose',    hex: '#f43f5e', label: 'Rose' },
  { id: 'slate',   hex: '#64748b', label: 'Slate' },
];
