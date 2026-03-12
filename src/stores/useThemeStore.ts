/**
 * Theme Store - Manages application themes
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ThemeColors {
  // Background colors
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  bgActive: string;

  // Border colors
  border: string;
  borderLight: string;

  // Accent colors
  accent: string;
  accentSecondary: string;
  accentHighlight: string;
  accentGlow: string;

  // Text colors
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Status colors
  error: string;
  success: string;
  warning: string;

  // Tracker-specific colors
  trackerRowEven: string;
  trackerRowOdd: string;
  trackerRowHighlight: string;
  trackerRowCurrent: string;
  trackerRowCursor: string;

  // Cell colors
  cellNote: string;
  cellInstrument: string;
  cellVolume: string;
  cellEffect: string;
  cellAccent: string;
  cellSlide: string;
  cellEmpty: string;

  // Playback / UI chrome
  playbackCursor: string;   // Playback position line (default: cyan)
  currentRowText: string;   // Text color on the active playback row
  panelShadow: string;      // FT2 panel inset shadow
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
}

// NeoDark Theme - The original dark theme with teal accent
const neoDarkTheme: Theme = {
  id: 'neodark',
  name: 'NeoDark',
  colors: {
    bg: '#0a0a0b',
    bgSecondary: '#111113',
    bgTertiary: '#1a1a1d',
    bgHover: '#222226',
    bgActive: '#2a2a2f',
    border: '#2a2a2f',
    borderLight: '#3a3a40',
    accent: '#00d4aa',
    accentSecondary: '#7c3aed',
    accentHighlight: '#22d3ee',
    accentGlow: 'rgba(0, 212, 170, 0.15)',
    text: '#f0f0f2',
    textSecondary: '#a0a0a8',
    textMuted: '#606068',
    textInverse: '#0a0a0b',
    error: '#ef4444',
    success: '#10b981',
    warning: '#f59e0b',
    trackerRowEven: '#0d0d0f',
    trackerRowOdd: '#111113',
    trackerRowHighlight: '#151518',
    trackerRowCurrent: '#1a2a25',
    trackerRowCursor: '#0d2520',
    cellNote: '#f0f0f2',
    cellInstrument: '#fbbf24',
    cellVolume: '#34d399',
    cellEffect: '#f97316',
    cellAccent: '#00d4aa',
    cellSlide: '#a78bfa',
    cellEmpty: '#404048',
    playbackCursor: '#00ffff',
    currentRowText: '#ffffff',
    panelShadow: '#282830',
  },
};

// Cyan Lineart Theme - Monochrome wireframe style
const cyanLineartTheme: Theme = {
  id: 'cyan-lineart',
  name: 'Cyan Lineart',
  colors: {
    // Very dark cyan backgrounds instead of pure black
    bg: '#030808',
    bgSecondary: '#051010',
    bgTertiary: '#071414',
    bgHover: '#0a1a1a',
    bgActive: '#0c2020',

    // Cyan borders for wireframe look
    border: '#00808080',      // Semi-transparent cyan
    borderLight: '#00b8b8',   // Brighter cyan for emphasis

    // All accents are cyan
    accent: '#00ffff',
    accentSecondary: '#00e0e0',
    accentHighlight: '#00ffff',
    accentGlow: 'rgba(0, 255, 255, 0.12)',

    // Monochrome text - all cyan variants
    text: '#00ffff',          // Primary text - bright cyan
    textSecondary: '#00c8c8', // Secondary - slightly dimmer
    textMuted: '#006060',     // Muted - dark cyan
    textInverse: '#030808',   // Inverse for active states

    // Status colors - all cyan based
    error: '#ff4080',         // Pink-red for errors (stands out from cyan)
    success: '#00ff88',       // Green-cyan for success
    warning: '#00ffaa',       // Cyan-green for warnings

    // Tracker rows - very subtle dark cyan distinctions
    trackerRowEven: '#030808',
    trackerRowOdd: '#041010',
    trackerRowHighlight: '#061414',
    trackerRowCurrent: '#081818',
    trackerRowCursor: '#0a1c1c',

    // Cell colors - monochrome cyan palette
    cellNote: '#00ffff',      // Bright cyan
    cellInstrument: '#00e8e8', // Slightly different cyan
    cellVolume: '#00d0d0',    // Volume
    cellEffect: '#00b8b8',    // Effect
    cellAccent: '#00ffff',    // Accent bright
    cellSlide: '#00a0a0',     // Slide dimmer
    cellEmpty: '#003838',     // Empty very dim
    playbackCursor: '#00ffff',
    currentRowText: '#ffffff',
    panelShadow: '#021010',
  },
};

// DEViLBOX Theme - Red-tinted dark theme
const devilboxTheme: Theme = {
  id: 'devilbox',
  name: 'DEViLBOX',
  colors: {
    bg: '#0b0909',
    bgSecondary: '#131010',
    bgTertiary: '#1d1818',
    bgHover: '#262020',
    bgActive: '#2f2828',
    border: '#2f2525',
    borderLight: '#403535',
    accent: '#ef4444',
    accentSecondary: '#f97316',
    accentHighlight: '#22d3ee',
    accentGlow: 'rgba(239, 68, 68, 0.15)',
    text: '#f2f0f0',
    textSecondary: '#a8a0a0',
    textMuted: '#686060',
    textInverse: '#0b0909',
    error: '#ef4444',
    success: '#10b981',
    warning: '#f59e0b',
    trackerRowEven: '#0f0c0c',
    trackerRowOdd: '#131010',
    trackerRowHighlight: '#181414',
    trackerRowCurrent: '#2a1a1a',
    trackerRowCursor: '#251010',
    cellNote: '#f2f0f0',
    cellInstrument: '#fbbf24',
    cellVolume: '#34d399',
    cellEffect: '#f97316',
    cellAccent: '#ef4444',
    cellSlide: '#fb7185',
    cellEmpty: '#484040',
    playbackCursor: '#ef4444',
    currentRowText: '#ffffff',
    panelShadow: '#1a0808',
  },
};

// DEViLBOX Modern Theme — Ableton-inspired, warm amber accent, spacious layout
const modernTheme: Theme = {
  id: 'modern',
  name: 'Modern',
  colors: {
    // Background layers (light → dark: bg, surface, elevated, raised, hover, active)
    bg: '#1a1a1a',
    bgSecondary: '#222222',   // bgSurface — panels, strips
    bgTertiary: '#2c2c2c',    // bgElevated — toolbars, dock
    bgHover: '#404040',
    bgActive: '#4c4c4c',

    // Borders
    border: '#383838',
    borderLight: '#505050',   // borderMid — separators

    // Accent: warm amber
    accent: '#f59e0b',
    accentSecondary: '#b45309',   // accentDim
    accentHighlight: '#22d3ee',
    accentGlow: 'rgba(245, 158, 11, 0.25)',

    // Text
    text: '#f0f0f0',
    textSecondary: '#a0a0a0',
    textMuted: '#606060',
    textInverse: '#1a1a1a',

    // Semantic
    error: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',

    // Tracker rows — warm amber-tinted backgrounds
    trackerRowEven: '#1e1e1e',
    trackerRowOdd: '#222222',
    trackerRowHighlight: '#282828',
    trackerRowCurrent: '#2a2219',
    trackerRowCursor: '#f59e0b33',

    // Cell colors
    cellNote: '#f0f0f0',
    cellInstrument: '#fbbf24',
    cellVolume: '#22c55e',
    cellEffect: '#f59e0b',
    cellAccent: '#fbbf24',
    cellSlide: '#a0a0a0',
    cellEmpty: '#404040',
    playbackCursor: '#f59e0b',
    currentRowText: '#ffffff',
    panelShadow: '#111111',
  },
};

// Built-in themes (immutable)
const builtinThemes: Theme[] = [devilboxTheme, neoDarkTheme, cyanLineartTheme, modernTheme];

// Placeholder custom theme (uses NeoDark colors until user customizes)
const defaultCustomTheme: Theme = { id: 'custom', name: 'Custom', colors: { ...neoDarkTheme.colors } };

// Exported themes list — always includes Custom
export let themes: Theme[] = [...builtinThemes, defaultCustomTheme];

/** Rebuild the exported themes array when custom theme changes */
function rebuildThemesList(customColors: ThemeColors | null) {
  const customTheme: Theme = { id: 'custom', name: 'Custom', colors: customColors || { ...neoDarkTheme.colors } };
  themes = [...builtinThemes, customTheme];
}

/** Default custom theme — clone of NeoDark as starting point */
export function getDefaultCustomColors(): ThemeColors {
  return { ...neoDarkTheme.colors };
}

/** Labels for each ThemeColors token, grouped for UI display */
export const THEME_TOKEN_GROUPS: { label: string; tokens: { key: keyof ThemeColors; label: string }[] }[] = [
  {
    label: 'Backgrounds',
    tokens: [
      { key: 'bg', label: 'Primary' },
      { key: 'bgSecondary', label: 'Secondary' },
      { key: 'bgTertiary', label: 'Tertiary' },
      { key: 'bgHover', label: 'Hover' },
      { key: 'bgActive', label: 'Active' },
    ],
  },
  {
    label: 'Borders',
    tokens: [
      { key: 'border', label: 'Border' },
      { key: 'borderLight', label: 'Border Light' },
    ],
  },
  {
    label: 'Accent',
    tokens: [
      { key: 'accent', label: 'Primary' },
      { key: 'accentSecondary', label: 'Secondary' },
      { key: 'accentHighlight', label: 'Highlight' },
      { key: 'accentGlow', label: 'Glow' },
    ],
  },
  {
    label: 'Text',
    tokens: [
      { key: 'text', label: 'Primary' },
      { key: 'textSecondary', label: 'Secondary' },
      { key: 'textMuted', label: 'Muted' },
      { key: 'textInverse', label: 'Inverse' },
    ],
  },
  {
    label: 'Status',
    tokens: [
      { key: 'error', label: 'Error' },
      { key: 'success', label: 'Success' },
      { key: 'warning', label: 'Warning' },
    ],
  },
  {
    label: 'Tracker Rows',
    tokens: [
      { key: 'trackerRowEven', label: 'Even' },
      { key: 'trackerRowOdd', label: 'Odd' },
      { key: 'trackerRowHighlight', label: 'Highlight' },
      { key: 'trackerRowCurrent', label: 'Current' },
      { key: 'trackerRowCursor', label: 'Cursor' },
    ],
  },
  {
    label: 'Cell Colors',
    tokens: [
      { key: 'cellNote', label: 'Note' },
      { key: 'cellInstrument', label: 'Instrument' },
      { key: 'cellVolume', label: 'Volume' },
      { key: 'cellEffect', label: 'Effect' },
      { key: 'cellAccent', label: 'Accent' },
      { key: 'cellSlide', label: 'Slide' },
      { key: 'cellEmpty', label: 'Empty' },
    ],
  },
  {
    label: 'Playback / Chrome',
    tokens: [
      { key: 'playbackCursor', label: 'Playback Cursor' },
      { key: 'currentRowText', label: 'Current Row Text' },
      { key: 'panelShadow', label: 'Panel Shadow' },
    ],
  },
];

interface ThemeStore {
  currentThemeId: string;
  customThemeColors: ThemeColors | null;
  setTheme: (themeId: string) => void;
  getCurrentTheme: () => Theme;
  setCustomColor: (key: keyof ThemeColors, value: string) => void;
  resetCustomTheme: () => void;
  copyThemeToCustom: (themeId: string) => void;
}

// Apply theme to CSS variables
const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  const { colors } = theme;

  // Set data-theme attribute for theme-specific CSS
  root.setAttribute('data-theme', theme.id);

  root.style.setProperty('--color-bg', colors.bg);
  root.style.setProperty('--color-bg-secondary', colors.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--color-bg-hover', colors.bgHover);
  root.style.setProperty('--color-bg-active', colors.bgActive);
  root.style.setProperty('--color-border', colors.border);
  root.style.setProperty('--color-border-light', colors.borderLight);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-accent-secondary', colors.accentSecondary);
  root.style.setProperty('--color-accent-highlight', colors.accentHighlight);
  root.style.setProperty('--color-accent-glow', colors.accentGlow);
  root.style.setProperty('--color-text', colors.text);
  root.style.setProperty('--color-text-secondary', colors.textSecondary);
  root.style.setProperty('--color-text-muted', colors.textMuted);
  root.style.setProperty('--color-text-inverse', colors.textInverse);
  root.style.setProperty('--color-error', colors.error);
  root.style.setProperty('--color-success', colors.success);
  root.style.setProperty('--color-warning', colors.warning);
  root.style.setProperty('--color-tracker-row-even', colors.trackerRowEven);
  root.style.setProperty('--color-tracker-row-odd', colors.trackerRowOdd);
  root.style.setProperty('--color-tracker-row-highlight', colors.trackerRowHighlight);
  root.style.setProperty('--color-tracker-row-current', colors.trackerRowCurrent);
  root.style.setProperty('--color-tracker-row-cursor', colors.trackerRowCursor);
  root.style.setProperty('--color-cell-note', colors.cellNote);
  root.style.setProperty('--color-cell-instrument', colors.cellInstrument);
  root.style.setProperty('--color-cell-volume', colors.cellVolume);
  root.style.setProperty('--color-cell-effect', colors.cellEffect);
  root.style.setProperty('--color-cell-accent', colors.cellAccent);
  root.style.setProperty('--color-cell-slide', colors.cellSlide);
  root.style.setProperty('--color-cell-empty', colors.cellEmpty);
  root.style.setProperty('--color-tracker-cursor', colors.playbackCursor);
  root.style.setProperty('--ft2-shadow', colors.panelShadow);
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      currentThemeId: 'devilbox', // DEViLBOX is the default
      customThemeColors: null,

      setTheme: (themeId: string) => {
        if (themeId === 'custom') {
          // Initialize custom colors if not yet created
          const { customThemeColors } = get();
          if (!customThemeColors) {
            const colors = getDefaultCustomColors();
            rebuildThemesList(colors);
            set({ customThemeColors: colors, currentThemeId: 'custom' });
            const customTheme = themes.find(t => t.id === 'custom');
            if (customTheme) applyTheme(customTheme);
            return;
          }
        }
        const theme = themes.find(t => t.id === themeId);
        if (theme) {
          applyTheme(theme);
          set({ currentThemeId: themeId });
        }
      },

      getCurrentTheme: () => {
        const { currentThemeId } = get();
        return themes.find(t => t.id === currentThemeId) || devilboxTheme;
      },

      setCustomColor: (key: keyof ThemeColors, value: string) => {
        const { customThemeColors, currentThemeId } = get();
        const colors = customThemeColors ? { ...customThemeColors } : getDefaultCustomColors();
        colors[key] = value;
        rebuildThemesList(colors);
        set({ customThemeColors: colors });
        // Live-update if currently viewing custom theme
        if (currentThemeId === 'custom') {
          const customTheme = themes.find(t => t.id === 'custom');
          if (customTheme) applyTheme(customTheme);
        }
      },

      resetCustomTheme: () => {
        const colors = getDefaultCustomColors();
        rebuildThemesList(colors);
        set({ customThemeColors: colors });
        const { currentThemeId } = get();
        if (currentThemeId === 'custom') {
          const customTheme = themes.find(t => t.id === 'custom');
          if (customTheme) applyTheme(customTheme);
        }
      },

      copyThemeToCustom: (themeId: string) => {
        const source = builtinThemes.find(t => t.id === themeId);
        if (!source) return;
        const colors = { ...source.colors };
        rebuildThemesList(colors);
        set({ customThemeColors: colors, currentThemeId: 'custom' });
        const customTheme = themes.find(t => t.id === 'custom');
        if (customTheme) applyTheme(customTheme);
      },
    }),
    {
      name: 'devilbox-theme',
      onRehydrateStorage: () => (state) => {
        // Rebuild themes list from persisted custom colors
        if (state?.customThemeColors) {
          rebuildThemesList(state.customThemeColors);
        }
        // Apply theme after rehydration
        if (state) {
          const theme = themes.find(t => t.id === state.currentThemeId) || devilboxTheme;
          applyTheme(theme);
        }
      },
    }
  )
);

// Initialize theme on load
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('devilbox-theme');
  let themeId = 'devilbox';
  let customColors: ThemeColors | null = null;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      themeId = parsed.state?.currentThemeId || 'devilbox';
      customColors = parsed.state?.customThemeColors || null;
    } catch {
      // Use default
    }
  }
  if (customColors) rebuildThemesList(customColors);
  const theme = themes.find(t => t.id === themeId) || devilboxTheme;
  applyTheme(theme);
}
