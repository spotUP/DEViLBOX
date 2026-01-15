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
  },
};

export const themes: Theme[] = [devilboxTheme, neoDarkTheme];

interface ThemeStore {
  currentThemeId: string;
  setTheme: (themeId: string) => void;
  getCurrentTheme: () => Theme;
}

// Apply theme to CSS variables
const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  const { colors } = theme;

  root.style.setProperty('--color-bg', colors.bg);
  root.style.setProperty('--color-bg-secondary', colors.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--color-bg-hover', colors.bgHover);
  root.style.setProperty('--color-bg-active', colors.bgActive);
  root.style.setProperty('--color-border', colors.border);
  root.style.setProperty('--color-border-light', colors.borderLight);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-accent-secondary', colors.accentSecondary);
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
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      currentThemeId: 'devilbox', // DEViLBOX is the default

      setTheme: (themeId: string) => {
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
    }),
    {
      name: 'devilbox-theme',
      onRehydrateStorage: () => (state) => {
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
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      themeId = parsed.state?.currentThemeId || 'devilbox';
    } catch {
      // Use default
    }
  }
  const theme = themes.find(t => t.id === themeId) || devilboxTheme;
  applyTheme(theme);
}
