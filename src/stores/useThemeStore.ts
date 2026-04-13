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
  trackerBorder: string;     // Channel dividers / borders inside pattern editor

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

  // Piano keyboard colors — 7-element array for white key groups.
  // Index 0=C, 1=D, 2=E, 3=F, 4=G, 5=A, 6=B (H in German notation).
  // Only white keys are colored; black keys stay dark.
  pianoKeyColors?: string[];

  // Theme-specific typography — when set, overrides the default Inter/JetBrains Mono fonts.
  // Uses CSS font-family syntax (comma-separated fallback stack).
  fontFamily?: string;
  monoFontFamily?: string;
  fontSize?: string;        // Base font size (e.g., '13px', '12px')

  // Theme-specific control styles
  knobStyle?: 'default' | 'metallic' | 'rubber' | 'vintage' | 'led';
  buttonRadius?: string;    // CSS border-radius (e.g., '2px', '8px', '50%')
  buttonStyle?: 'default' | 'raised' | 'flat' | 'beveled';
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
    trackerRowEven: '#1a1a2e',
    trackerRowOdd: '#1e1e34',
    trackerRowHighlight: '#222244',
    trackerRowCurrent: '#2a2a50',
    trackerRowCursor: '#1a1a40',
    trackerBorder: '#222244',
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
    trackerBorder: '#061414',

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
// Inspired by Behringer TD-3 "Red Devil" hi-res reference
// Body: bold matte red #c4282e, knobs: brushed silver #b0b0b0,
// labels: cream silk #e8e0d8, keys: charcoal #2a2a2a, shadow: burgundy #6e1418
const devilboxTheme: Theme = {
  id: 'red-devil',
  name: 'Red Devil',
  colors: {
    // Backgrounds — IT'S A RED THEME. The TD-3 body IS the background.
    bg: '#6e1418',            // deep burgundy — darkest shadow on the body
    bgSecondary: '#7c1a1e',   // panels: body red in shadow
    bgTertiary: '#8c2028',    // toolbars: body red mid-tone
    bgHover: '#a02430',       // hover: brighter body red
    bgActive: '#b52838',      // active: full lit body red

    // Borders — darker grooves and lighter edges on the chassis
    border: '#581014',        // recessed groove — darker than bg
    borderLight: '#9c2028',   // raised edge — catches light

    // Accent — bright highlights and interactive elements
    accent: '#e84850',        // hot red — LEDs, active controls
    accentSecondary: '#c4282e', // TD-3 body red at full brightness
    accentHighlight: '#ff6b6b', // glowing red — lit LED
    accentGlow: 'rgba(232, 72, 80, 0.35)',

    // Text — white with varying opacity on red (grey looks muddy on red)
    text: 'rgba(255,255,255,0.95)',          // primary: near-white
    textSecondary: 'rgba(255,255,255,0.65)', // secondary: white at 65%
    textMuted: 'rgba(255,255,255,0.35)',     // muted: white at 35%
    textInverse: '#6e1418',

    // Semantic
    error: '#ff8888',         // lighter red on red bg needs to pop
    success: '#5eeaa0',       // bright green to contrast red
    warning: '#ffd060',       // warm gold

    // Tracker rows — deep navy for the pattern/matrix editor (matches GTOrderMatrix)
    trackerRowEven: '#1a1a2e',
    trackerRowOdd: '#1e1e34',
    trackerRowHighlight: '#222244',
    trackerRowCurrent: '#2a2a50',
    trackerRowCursor: '#1a1a40',
    trackerBorder: '#222244',

    // Cell colors — vivid on red, white-based where possible
    cellNote: 'rgba(255,255,255,0.92)',
    cellInstrument: '#ffd060', // warm gold — amber LED
    cellVolume: '#5eeaa0',     // bright green
    cellEffect: '#ffb0b0',     // light pink — effect on red bg
    cellAccent: '#ff6b6b',     // glowing red
    cellSlide: '#ffb8c8',      // soft pink
    cellEmpty: 'rgba(255,255,255,0.2)', // subtle on red
    playbackCursor: '#e84850', // hot red
    currentRowText: '#ffffff',
    panelShadow: '#480c10',
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
    trackerBorder: '#282828',

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

// ─── Vintage Drum Machine Themes ─────────────────────────────────────────────
// Color palettes sampled from vintage drum machine hardware.
// Hex values sourced from public.tableau.com/VintageDrumMachinesColourPalettes
// Layout analysis from actual machine photographs.
// pianoKeyColors: 7-element array [C, D, E, F, G, A, B] — one color per white key group.
// Only WHITE keys are colored; black keys stay dark in the keyboard renderers.

/**
 * Roland TR-808 (1980)
 * Colors from io808.com reference: dark charcoal body (#232425),
 * signature orange stencil (#ff5a00), cream labels (#f6edc6).
 * Step buttons: red (#d03933), orange (#e98e2f), yellow (#dfd442), white (#e9e8e7).
 */
const tr808Theme: Theme = {
  id: 'tr-808',
  name: 'Roland TR-808',
  colors: {
    bg: '#232425',
    bgSecondary: '#2a2b2c',
    bgTertiary: '#313335',
    bgHover: '#3a3c3e',
    bgActive: '#454748',
    border: '#4a4c4e',
    borderLight: '#5e6062',
    accent: '#ff5a00',
    accentSecondary: '#d03933',
    accentHighlight: '#dfd442',
    accentGlow: 'rgba(255, 90, 0, 0.3)',
    text: '#f6edc6',
    textSecondary: '#9b9fa0',
    textMuted: '#6a6c6e',
    textInverse: '#232425',
    error: '#FE0000',
    success: '#dfd442',
    warning: '#e98e2f',
    trackerRowEven: '#232425',
    trackerRowOdd: '#282a2b',
    trackerRowHighlight: '#2e3032',
    trackerRowCurrent: '#3a2810',
    trackerRowCursor: '#4a1808',
    trackerBorder: '#2e3032',
    cellNote: '#f6edc6',
    cellInstrument: '#dfd442',
    cellVolume: '#e98e2f',
    cellEffect: '#ff5a00',
    cellAccent: '#d03933',
    cellSlide: '#e98e2f',
    cellEmpty: '#3a3c3e',
    playbackCursor: '#FE0000',
    currentRowText: '#f6edc6',
    panelShadow: '#111111',
    pianoKeyColors: [
      '#d03933', '#e98e2f', '#dfd442', '#e9e8e7', '#d03933', '#e98e2f', '#dfd442',
    ],
    // TR-808: Clean Swiss/Japanese design — Helvetica-inspired, warm analog feel
    fontFamily: "'Chakra Petch', 'Helvetica Neue', 'Helvetica', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'rubber',
    buttonRadius: '2px',
    buttonStyle: 'raised',
  },
};

/**
 * Roland TR-909 (1983)
 * Industrial techno weapon. Silver METAL panel on dark navy-slate base.
 * Signature ORANGE stripe. Cold, precise, METALLIC.
 */
const tr909Theme: Theme = {
  id: 'tr-909',
  name: 'Roland TR-909',
  colors: {
    bg: '#2a2e38',
    bgSecondary: '#323844',
    bgTertiary: '#3e4450',
    bgHover: '#4a5060',
    bgActive: '#545c6c',
    border: '#5a6270',
    borderLight: '#6e7888',
    accent: '#FB9250',
    accentSecondary: '#DFDBDA',
    accentHighlight: '#FFFFFF',
    accentGlow: 'rgba(251, 146, 80, 0.3)',
    text: '#DFDBDA',
    textSecondary: '#a0a4ac',
    textMuted: '#6a7080',
    textInverse: '#2a2e38',
    error: '#e04040',
    success: '#FB9250',
    warning: '#DFDBDA',
    trackerRowEven: '#2c3040',
    trackerRowOdd: '#323844',
    trackerRowHighlight: '#3c4250',
    trackerRowCurrent: '#443828',
    trackerRowCursor: '#4a3018',
    trackerBorder: '#3c4250',
    cellNote: '#DFDBDA',
    cellInstrument: '#FB9250',
    cellVolume: '#8D8885',
    cellEffect: '#FB9250',
    cellAccent: '#FB9250',
    cellSlide: '#DFDBDA',
    cellEmpty: '#4a5060',
    playbackCursor: '#FB9250',
    currentRowText: '#FFFFFF',
    panelShadow: '#1a1e28',
    pianoKeyColors: [
      '#FB9250', '#DFDBDA', '#FB9250', '#DFDBDA', '#FB9250', '#DFDBDA', '#FB9250',
    ],
    // TR-909: Industrial precision — geometric sans, cold metallic
    fontFamily: "'Rajdhani', 'Futura', 'Century Gothic', sans-serif",
    monoFontFamily: "'IBM Plex Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'metallic',
    buttonRadius: '3px',
    buttonStyle: 'beveled',
  },
};

/**
 * Oberheim DMX (1981)
 * Dark pro studio machine. Black body, white upper panel,
 * blue graphics, red LEDs, WOOD side cheeks.
 */
const dmxTheme: Theme = {
  id: 'dmx',
  name: 'Oberheim DMX',
  colors: {
    bg: '#141318',
    bgSecondary: '#1c1b22',
    bgTertiary: '#26242e',
    bgHover: '#302e38',
    bgActive: '#3a3842',
    border: '#3a3444',
    borderLight: '#4a4454',
    accent: '#4785B4',
    accentSecondary: '#D00E0E',
    accentHighlight: '#F8FCFB',
    accentGlow: 'rgba(71, 133, 180, 0.3)',
    text: '#F8FCFB',
    textSecondary: '#a8acb4',
    textMuted: '#5e6068',
    textInverse: '#141318',
    error: '#D00E0E',
    success: '#4785B4',
    warning: '#613614',
    trackerRowEven: '#161520',
    trackerRowOdd: '#1c1b24',
    trackerRowHighlight: '#22202c',
    trackerRowCurrent: '#1a2438',
    trackerRowCursor: '#2a1018',
    trackerBorder: '#22202c',
    cellNote: '#F8FCFB',
    cellInstrument: '#4785B4',
    cellVolume: '#D00E0E',
    cellEffect: '#613614',
    cellAccent: '#D00E0E',
    cellSlide: '#4785B4',
    cellEmpty: '#2e2c38',
    playbackCursor: '#D00E0E',
    currentRowText: '#F8FCFB',
    panelShadow: '#0a0a10',
    pianoKeyColors: [
      '#4785B4', '#D00E0E', '#F8FCFB', '#613614', '#4785B4', '#D00E0E', '#F8FCFB',
    ],
    // DMX: Early digital sampling era — bold monospace, clinical
    fontFamily: "'Orbitron', 'Arial Black', 'Impact', sans-serif",
    monoFontFamily: "'VT323', 'Courier New', monospace",
    fontSize: '12px',
    knobStyle: 'vintage',
    buttonRadius: '2px',
    buttonStyle: 'raised',
  },
};

/**
 * Linn LM-1 (1980)
 * First great drum machine. ALL BLACK, minimal.
 * Orange buttons, red indicators, grey buttons, wood cheeks.
 */
const linnLm1Theme: Theme = {
  id: 'linn-lm1',
  name: 'Linn LM-1',
  colors: {
    bg: '#141312',
    bgSecondary: '#1c1b1a',
    bgTertiary: '#262524',
    bgHover: '#302f2e',
    bgActive: '#3a3938',
    border: '#383634',
    borderLight: '#4a4846',
    accent: '#FC650C',
    accentSecondary: '#CA1B20',
    accentHighlight: '#FFFFFF',
    accentGlow: 'rgba(252, 101, 12, 0.3)',
    text: '#d8d4d0',
    textSecondary: '#908c88',
    textMuted: '#585450',
    textInverse: '#141312',
    error: '#CA1B20',
    success: '#FC650C',
    warning: '#513B2E',
    trackerRowEven: '#161514',
    trackerRowOdd: '#1c1b1a',
    trackerRowHighlight: '#242322',
    trackerRowCurrent: '#2c1c0a',
    trackerRowCursor: '#301008',
    trackerBorder: '#242322',
    cellNote: '#d8d4d0',
    cellInstrument: '#FC650C',
    cellVolume: '#CA1B20',
    cellEffect: '#424242',
    cellAccent: '#FC650C',
    cellSlide: '#CA1B20',
    cellEmpty: '#2e2c2a',
    playbackCursor: '#FC650C',
    currentRowText: '#FFFFFF',
    panelShadow: '#080808',
    pianoKeyColors: [
      '#FC650C', '#424242', '#CA1B20', '#513B2E', '#FC650C', '#424242', '#CA1B20',
    ],
    // Linn LM-1: First sample drum machine — warm analog, woody character
    fontFamily: "'Chakra Petch', 'Helvetica', 'Arial', sans-serif",
    monoFontFamily: "'DM Mono', 'Monaco', monospace",
    fontSize: '12px',
    knobStyle: 'vintage',
    buttonRadius: '3px',
    buttonStyle: 'raised',
  },
};

/**
 * AKAI MPC 60 (1988)
 * Light grey body, baby blue LCD, salmon buttons.
 * LIGHT, CLEAN, JAPANESE PRECISION.
 */
const mpc60Theme: Theme = {
  id: 'mpc-60',
  name: 'AKAI MPC 60',
  colors: {
    bg: '#3a3840',
    bgSecondary: '#444250',
    bgTertiary: '#4e4c5a',
    bgHover: '#585664',
    bgActive: '#62606e',
    border: '#6a6878',
    borderLight: '#7a7888',
    accent: '#8AAAC3',
    accentSecondary: '#E0635D',
    accentHighlight: '#E6E4E7',
    accentGlow: 'rgba(138, 170, 195, 0.3)',
    text: '#E6E4E7',
    textSecondary: '#B6B4B7',
    textMuted: '#7a7880',
    textInverse: '#3a3840',
    error: '#E0635D',
    success: '#8AAAC3',
    warning: '#F2EBE3',
    trackerRowEven: '#3c3a44',
    trackerRowOdd: '#444250',
    trackerRowHighlight: '#4c4a58',
    trackerRowCurrent: '#3a4858',
    trackerRowCursor: '#4a3838',
    trackerBorder: '#4c4a58',
    cellNote: '#E6E4E7',
    cellInstrument: '#8AAAC3',
    cellVolume: '#E0635D',
    cellEffect: '#B6B4B7',
    cellAccent: '#E0635D',
    cellSlide: '#8AAAC3',
    cellEmpty: '#4e4c58',
    playbackCursor: '#8AAAC3',
    currentRowText: '#E6E4E7',
    panelShadow: '#2a2830',
    pianoKeyColors: [
      '#8AAAC3', '#E0635D', '#B6B4B7', '#E6E4E7', '#8AAAC3', '#E0635D', '#B6B4B7',
    ],
    // MPC 60: J Dilla's weapon — utilitarian Japanese design, LCD blue feel
    fontFamily: "'Rajdhani', 'Arial', 'Helvetica', sans-serif",
    monoFontFamily: "'IBM Plex Mono', 'Menlo', monospace",
    fontSize: '12px',
    knobStyle: 'rubber',
    buttonRadius: '4px',
    buttonStyle: 'flat',
  },
};

/**
 * Roland CompuRhythm CR-78 (1978)
 * First programmable Roland drum machine. Black body,
 * FESTIVAL of colorful buttons: gold, blue, green, red.
 */
const cr78Theme: Theme = {
  id: 'cr-78',
  name: 'Roland CR-78',
  colors: {
    bg: '#141618',
    bgSecondary: '#1c1e22',
    bgTertiary: '#26282e',
    bgHover: '#303238',
    bgActive: '#3a3c42',
    border: '#383a40',
    borderLight: '#4a4c52',
    accent: '#FFC631',
    accentSecondary: '#5E9CD9',
    accentHighlight: '#2FB270',
    accentGlow: 'rgba(255, 198, 49, 0.3)',
    text: '#e8e6e0',
    textSecondary: '#a8a6a0',
    textMuted: '#686660',
    textInverse: '#141618',
    error: '#C91611',
    success: '#2FB270',
    warning: '#FFC631',
    trackerRowEven: '#161820',
    trackerRowOdd: '#1c1e24',
    trackerRowHighlight: '#24262e',
    trackerRowCurrent: '#282410',
    trackerRowCursor: '#281010',
    trackerBorder: '#24262e',
    cellNote: '#e8e6e0',
    cellInstrument: '#FFC631',
    cellVolume: '#5E9CD9',
    cellEffect: '#2FB270',
    cellAccent: '#C91611',
    cellSlide: '#FFC631',
    cellEmpty: '#303238',
    playbackCursor: '#FFC631',
    currentRowText: '#FFFFFF',
    panelShadow: '#0a0c0e',
    pianoKeyColors: [
      '#FFC631', '#5E9CD9', '#2FB270', '#C91611', '#FFC631', '#5E9CD9', '#2FB270',
    ],
    // CR-78: First programmable drum machine — retro-futuristic, space age
    fontFamily: "'Space Mono', 'Courier New', monospace",
    monoFontFamily: "'Space Mono', 'Courier New', monospace",
    fontSize: '12px',
    knobStyle: 'vintage',
    buttonRadius: '6px',
    buttonStyle: 'raised',
  },
};

/**
 * E-mu SP-12 (1985)
 * Grey metal sampling drum machine. BLUE buttons. Hip-hop legend.
 * CLINICAL, INDUSTRIAL, BLUE STEEL.
 */
const emuSp12Theme: Theme = {
  id: 'emu-sp12',
  name: 'E-mu SP-12',
  colors: {
    bg: '#1e2028',
    bgSecondary: '#262830',
    bgTertiary: '#30323c',
    bgHover: '#3a3c48',
    bgActive: '#444652',
    border: '#404450',
    borderLight: '#505462',
    accent: '#144F9D',
    accentSecondary: '#448ABD',
    accentHighlight: '#FFFFFF',
    accentGlow: 'rgba(20, 79, 157, 0.3)',
    text: '#EAE6E5',
    textSecondary: '#A5A3A6',
    textMuted: '#606268',
    textInverse: '#1e2028',
    error: '#c44040',
    success: '#448ABD',
    warning: '#A5A3A6',
    trackerRowEven: '#202430',
    trackerRowOdd: '#282c36',
    trackerRowHighlight: '#303440',
    trackerRowCurrent: '#1a2c50',
    trackerRowCursor: '#102860',
    trackerBorder: '#303440',
    cellNote: '#EAE6E5',
    cellInstrument: '#448ABD',
    cellVolume: '#A5A3A6',
    cellEffect: '#144F9D',
    cellAccent: '#448ABD',
    cellSlide: '#144F9D',
    cellEmpty: '#3a3c48',
    playbackCursor: '#144F9D',
    currentRowText: '#FFFFFF',
    panelShadow: '#101218',
    pianoKeyColors: [
      '#144F9D', '#448ABD', '#A5A3A6', '#EAE6E5', '#144F9D', '#448ABD', '#A5A3A6',
    ],
    // SP-12: Digital sampling precision — clean corporate, blue-tinted
    fontFamily: "'IBM Plex Mono', 'Menlo', monospace",
    monoFontFamily: "'IBM Plex Mono', 'Menlo', monospace",
    fontSize: '12px',
    knobStyle: 'rubber',
    buttonRadius: '3px',
    buttonStyle: 'flat',
  },
};

/**
 * Maestro Rhythm King MK-2 (1971)
 * Funky rhythm box. Dark body with red, gold, baby blue buttons.
 * Sly Stone vibes. FUNKY, SOULFUL.
 */
const maestroRhythmKingTheme: Theme = {
  id: 'maestro-rk',
  name: 'Maestro Rhythm King',
  colors: {
    bg: '#12101a',
    bgSecondary: '#1a1620',
    bgTertiary: '#241e2a',
    bgHover: '#2e2634',
    bgActive: '#38303e',
    border: '#3e3448',
    borderLight: '#504458',
    accent: '#D94C45',
    accentSecondary: '#F7BE29',
    accentHighlight: '#ACE0F8',
    accentGlow: 'rgba(217, 76, 69, 0.25)',
    text: '#F2ECEE',
    textSecondary: '#c4bec0',
    textMuted: '#6e6470',
    textInverse: '#12101a',
    error: '#D94C45',
    success: '#ACE0F8',
    warning: '#F7BE29',
    trackerRowEven: '#14101c',
    trackerRowOdd: '#1a1622',
    trackerRowHighlight: '#22182a',
    trackerRowCurrent: '#2e1818',
    trackerRowCursor: '#381414',
    trackerBorder: '#22182a',
    cellNote: '#F2ECEE',
    cellInstrument: '#F7BE29',
    cellVolume: '#ACE0F8',
    cellEffect: '#D94C45',
    cellAccent: '#D94C45',
    cellSlide: '#F7BE29',
    cellEmpty: '#302838',
    playbackCursor: '#D94C45',
    currentRowText: '#F2ECEE',
    panelShadow: '#080610',
    pianoKeyColors: [
      '#D94C45', '#F7BE29', '#ACE0F8', '#D94C45', '#F7BE29', '#ACE0F8', '#D94C45',
    ],
    // Maestro Rhythm King: 70s funk machine — warm soulful typography
    fontFamily: "'Chakra Petch', 'Georgia', 'Palatino', serif",
    monoFontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: '13px',
    knobStyle: 'vintage',
    buttonRadius: '6px',
    buttonStyle: 'raised',
  },
};

/**
 * Maestro Rhythm & Sound (1972)
 * Psychedelic. Black body, VIVID orange, teal/mint, bright yellow.
 * HIGH-CONTRAST, ELECTRIC.
 */
const maestroRhythmSoundTheme: Theme = {
  id: 'maestro-rs',
  name: 'Maestro Rhythm & Sound',
  colors: {
    bg: '#0c0a14',
    bgSecondary: '#141020',
    bgTertiary: '#1c1628',
    bgHover: '#261e32',
    bgActive: '#30283c',
    border: '#382e44',
    borderLight: '#483e54',
    accent: '#F97101',
    accentSecondary: '#FBE900',
    accentHighlight: '#B8E9E3',
    accentGlow: 'rgba(249, 113, 1, 0.3)',
    text: '#FEFCFF',
    textSecondary: '#c8c4cc',
    textMuted: '#6a6470',
    textInverse: '#0C0A0D',
    error: '#F97101',
    success: '#B8E9E3',
    warning: '#FBE900',
    trackerRowEven: '#0e0c16',
    trackerRowOdd: '#141020',
    trackerRowHighlight: '#1c1428',
    trackerRowCurrent: '#281808',
    trackerRowCursor: '#302004',
    trackerBorder: '#1c1428',
    cellNote: '#FEFCFF',
    cellInstrument: '#FBE900',
    cellVolume: '#B8E9E3',
    cellEffect: '#F97101',
    cellAccent: '#F97101',
    cellSlide: '#FBE900',
    cellEmpty: '#2a2238',
    playbackCursor: '#F97101',
    currentRowText: '#FEFCFF',
    panelShadow: '#060410',
    pianoKeyColors: [
      '#F97101', '#FBE900', '#B8E9E3', '#F97101', '#FBE900', '#B8E9E3', '#F97101',
    ],
    // Maestro Rhythm & Sound: Psychedelic — vivid, electric, high contrast
    fontFamily: "'Orbitron', 'Impact', 'Arial Black', sans-serif",
    monoFontFamily: "'VT323', 'Courier New', monospace",
    fontSize: '12px',
    knobStyle: 'vintage',
    buttonRadius: '4px',
    buttonStyle: 'beveled',
  },
};

/**
 * Ace Tone Rhythm Ace FR-8L (1967)
 * Grandfather of Roland. Warm WOODEN cabinet.
 * Gold, green, deep red buttons. VINTAGE, ORGANIC.
 */
const aceToneTheme: Theme = {
  id: 'ace-tone',
  name: 'Ace Tone Rhythm Ace',
  colors: {
    bg: '#1e1408',
    bgSecondary: '#28200e',
    bgTertiary: '#342a16',
    bgHover: '#3e3220',
    bgActive: '#483c2a',
    border: '#54421e',
    borderLight: '#6a5830',
    accent: '#E19907',
    accentSecondary: '#4F8632',
    accentHighlight: '#FBE6AF',
    accentGlow: 'rgba(225, 153, 7, 0.25)',
    text: '#FBE6AF',
    textSecondary: '#c4a870',
    textMuted: '#7a6438',
    textInverse: '#1e1408',
    error: '#8E0402',
    success: '#4F8632',
    warning: '#E19907',
    trackerRowEven: '#201608',
    trackerRowOdd: '#28200e',
    trackerRowHighlight: '#322814',
    trackerRowCurrent: '#342408',
    trackerRowCursor: '#3a1406',
    trackerBorder: '#322814',
    cellNote: '#FBE6AF',
    cellInstrument: '#E19907',
    cellVolume: '#4F8632',
    cellEffect: '#8E0402',
    cellAccent: '#E19907',
    cellSlide: '#4F8632',
    cellEmpty: '#3e3218',
    playbackCursor: '#E19907',
    currentRowText: '#FBE6AF',
    panelShadow: '#100c04',
    pianoKeyColors: [
      '#E19907', '#4F8632', '#8E0402', '#FBE6AF', '#E19907', '#4F8632', '#8E0402',
    ],
    // Ace Tone: Japanese craftsmanship, warm wooden feel — elegant serif
    fontFamily: "'Chakra Petch', 'Optima', 'Palatino', serif",
    monoFontFamily: "'DM Mono', 'Menlo', monospace",
    fontSize: '13px',
    knobStyle: 'vintage',
    buttonRadius: '8px',
    buttonStyle: 'raised',
  },
};

/**
 * Hammond Auto-Vari 64 (1976)
 * Elegant cream/beige organ rhythm unit. WARM, LIGHT, ELEGANT.
 * Cream body, peach/salmon and orange buttons.
 */
const hammondAutoVariTheme: Theme = {
  id: 'hammond-av64',
  name: 'Hammond Auto-Vari 64',
  colors: {
    bg: '#2c2820',
    bgSecondary: '#363228',
    bgTertiary: '#403c30',
    bgHover: '#4a4638',
    bgActive: '#545040',
    border: '#5e5844',
    borderLight: '#706850',
    accent: '#FBA02E',
    accentSecondary: '#E1806D',
    accentHighlight: '#F1F0EC',
    accentGlow: 'rgba(251, 160, 46, 0.25)',
    text: '#F1F0EC',
    textSecondary: '#EAE4C4',
    textMuted: '#908870',
    textInverse: '#2c2820',
    error: '#E1806D',
    success: '#FBA02E',
    warning: '#EAE4C4',
    trackerRowEven: '#2e2a22',
    trackerRowOdd: '#363228',
    trackerRowHighlight: '#3e3a2e',
    trackerRowCurrent: '#3e3418',
    trackerRowCursor: '#402c18',
    trackerBorder: '#3e3a2e',
    cellNote: '#F1F0EC',
    cellInstrument: '#FBA02E',
    cellVolume: '#E1806D',
    cellEffect: '#EAE4C4',
    cellAccent: '#FBA02E',
    cellSlide: '#E1806D',
    cellEmpty: '#504a3a',
    playbackCursor: '#FBA02E',
    currentRowText: '#F1F0EC',
    panelShadow: '#1e1c14',
    pianoKeyColors: [
      '#FBA02E', '#E1806D', '#EAE4C4', '#FBA02E', '#E1806D', '#EAE4C4', '#FBA02E',
    ],
    // Hammond: 60s/70s organ company elegance — warm serif corporate
    fontFamily: "'Georgia', 'Palatino Linotype', 'Book Antiqua', serif",
    monoFontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: '13px',
    knobStyle: 'vintage',
    buttonRadius: '6px',
    buttonStyle: 'raised',
  },
};

/**
 * Boss HC-2 Hand Clapper (1984)
 * Clean Japanese digital. Black body, blue buttons, grey accents.
 * CLEAN, DIGITAL, BLUE ON BLACK.
 */
const bossHc2Theme: Theme = {
  id: 'boss-hc2',
  name: 'Boss HC-2',
  colors: {
    bg: '#0e0e12',
    bgSecondary: '#16161c',
    bgTertiary: '#202026',
    bgHover: '#2a2a32',
    bgActive: '#34343c',
    border: '#32323c',
    borderLight: '#424250',
    accent: '#329BD4',
    accentSecondary: '#496F9C',
    accentHighlight: '#5bbfe8',
    accentGlow: 'rgba(50, 155, 212, 0.3)',
    text: '#BDBEB8',
    textSecondary: '#8e8f8a',
    textMuted: '#5a5c58',
    textInverse: '#0e0e12',
    error: '#c44040',
    success: '#329BD4',
    warning: '#496F9C',
    trackerRowEven: '#101018',
    trackerRowOdd: '#16161e',
    trackerRowHighlight: '#1e1e28',
    trackerRowCurrent: '#102838',
    trackerRowCursor: '#0a2040',
    trackerBorder: '#1e1e28',
    cellNote: '#BDBEB8',
    cellInstrument: '#329BD4',
    cellVolume: '#496F9C',
    cellEffect: '#5bbfe8',
    cellAccent: '#329BD4',
    cellSlide: '#496F9C',
    cellEmpty: '#2a2a34',
    playbackCursor: '#329BD4',
    currentRowText: '#e8f4ff',
    panelShadow: '#060608',
    pianoKeyColors: [
      '#329BD4', '#496F9C', '#BDBEB8', '#5bbfe8', '#329BD4', '#496F9C', '#BDBEB8',
    ],
    // Boss HC-2: Clean 80s Japanese digital — sharp, readable, precise
    fontFamily: "'Rajdhani', 'Verdana', 'Tahoma', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'rubber',
    buttonRadius: '3px',
    buttonStyle: 'flat',
  },
};

/**
 * Wurlitzer Side Man (1959)
 * The first commercially successful drum machine. Wood-grain cabinet, warm cream/ivory
 * control panel, amber VU meter glow, dark mahogany brown structural elements.
 * Warm, analogue, tube-era 1950s styling — like a living room hi-fi, not a studio machine.
 * WARM WOOD, IVORY CREAM, AMBER GLOW.
 */
const wurlitzerSideManTheme: Theme = {
  id: 'wurlitzer-sideman',
  name: 'Wurlitzer Side Man',
  colors: {
    bg: '#1c1008',               // dark mahogany — the cabinet wood
    bgSecondary: '#251608',      // slightly lighter wood grain
    bgTertiary: '#2e1e0a',       // mid-tone walnut
    bgHover: '#3a2810',
    bgActive: '#4a3418',
    border: '#5c3e18',           // warm brown border
    borderLight: '#7a5428',      // lighter warm wood
    accent: '#C88B30',           // amber VU meter glow
    accentSecondary: '#8C6020',  // darker amber / brass
    accentHighlight: '#E8A840',  // bright warm gold
    accentGlow: 'rgba(200, 139, 48, 0.35)',
    text: '#F0E0C0',             // warm ivory / cream
    textSecondary: '#C0A878',    // aged parchment
    textMuted: '#7a6040',        // faded brown
    textInverse: '#1c1008',
    error: '#c04040',
    success: '#C88B30',
    warning: '#8C6020',
    trackerRowEven: '#1e1108',
    trackerRowOdd: '#261508',
    trackerRowHighlight: '#301c08',
    trackerRowCurrent: '#3c2408',
    trackerRowCursor: '#4e2e00',
    trackerBorder: '#301c08',
    cellNote: '#F0E0C0',         // ivory text
    cellInstrument: '#C88B30',   // amber
    cellVolume: '#8C6020',       // brass
    cellEffect: '#E8A840',       // bright gold
    cellAccent: '#C88B30',
    cellSlide: '#8C6020',
    cellEmpty: '#302010',
    playbackCursor: '#C88B30',
    currentRowText: '#fff8e8',
    panelShadow: '#0c0804',
    pianoKeyColors: [
      '#C88B30', '#8C6020', '#F0E0C0', '#E8A840', '#C88B30', '#8C6020', '#F0E0C0',
    ],
    // Wurlitzer Side Man: Warm 50s hi-fi serif — like a console television
    fontFamily: "'Georgia', 'Palatino', serif",
    monoFontFamily: "'Courier New', 'Courier', monospace",
    fontSize: '12px',
    knobStyle: 'vintage',
    buttonRadius: '4px',
    buttonStyle: 'raised',
  },
};

// Roland TR-606 Drumatix (1981)
// Candy-apple red body, black panel. Acid techno sibling of the TB-303.
const tr606Theme: Theme = {
  id: 'tr-606',
  name: 'Roland TR-606',
  colors: {
    bg: '#150404',
    bgSecondary: '#1E0808',
    bgTertiary: '#280C0C',
    bgHover: '#381010',
    bgActive: '#481414',
    border: '#3A1010',
    borderLight: '#541818',
    accent: '#E02010',
    accentSecondary: '#E86020',
    accentHighlight: '#FF6040',
    accentGlow: 'rgba(224, 32, 16, 0.20)',
    text: '#F0E8E0',
    textSecondary: '#C09888',
    textMuted: '#785048',
    textInverse: '#150404',
    error: '#FF4040',
    success: '#40B870',
    warning: '#E86020',
    trackerRowEven: '#170606',
    trackerRowOdd: '#1E0808',
    trackerRowHighlight: '#240C0C',
    trackerRowCurrent: '#3A1000',
    trackerRowCursor: '#4A1000',
    trackerBorder: '#240C0C',
    cellNote: '#F0E8E0',
    cellInstrument: '#E86020',
    cellVolume: '#E02010',
    cellEffect: '#FF6040',
    cellAccent: '#E02010',
    cellSlide: '#904030',
    cellEmpty: '#3C1010',
    playbackCursor: '#FF4020',
    currentRowText: '#FFFFFF',
    panelShadow: '#080202',
    pianoKeyColors: ['#E02010', '#E86020', '#FF6040', '#E02010', '#E86020', '#FF6040', '#E02010'],
    fontFamily: "'Chakra Petch', 'Helvetica Neue', 'Helvetica', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'rubber',
    buttonRadius: '2px',
    buttonStyle: 'raised',
  },
};

// Roland TR-707 (1984)
// Putty/tan body, dark brown panel, red transport section. Clinical 80s computer aesthetic.
const tr707Theme: Theme = {
  id: 'tr-707',
  name: 'Roland TR-707',
  colors: {
    bg: '#1A1410',
    bgSecondary: '#221C16',
    bgTertiary: '#2C241C',
    bgHover: '#382E24',
    bgActive: '#44382C',
    border: '#3A3020',
    borderLight: '#504030',
    accent: '#CC2820',
    accentSecondary: '#A87840',
    accentHighlight: '#E86040',
    accentGlow: 'rgba(204, 40, 32, 0.20)',
    text: '#E8DCC8',
    textSecondary: '#A89878',
    textMuted: '#706050',
    textInverse: '#1A1410',
    error: '#CC2820',
    success: '#40A860',
    warning: '#A87840',
    trackerRowEven: '#1C1612',
    trackerRowOdd: '#221C16',
    trackerRowHighlight: '#282018',
    trackerRowCurrent: '#3A2010',
    trackerRowCursor: '#4A2808',
    trackerBorder: '#282018',
    cellNote: '#E8DCC8',
    cellInstrument: '#A87840',
    cellVolume: '#CC2820',
    cellEffect: '#E86040',
    cellAccent: '#CC2820',
    cellSlide: '#805838',
    cellEmpty: '#3C2C1C',
    playbackCursor: '#CC2820',
    currentRowText: '#FFFFFF',
    panelShadow: '#0C0A08',
    fontFamily: "'Inter', 'Helvetica Neue', 'Helvetica', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'default',
    buttonRadius: '3px',
    buttonStyle: 'flat',
  },
};

// Roland TR-77 CompuRhythm (1972)
// Olive/tan brushed metal, cream labels, brown housing. Early-70s Japanese analogue warmth.
const tr77Theme: Theme = {
  id: 'tr-77',
  name: 'Roland TR-77',
  colors: {
    bg: '#141208',
    bgSecondary: '#1C1A0C',
    bgTertiary: '#262210',
    bgHover: '#322C14',
    bgActive: '#3E3618',
    border: '#342E10',
    borderLight: '#4A4018',
    accent: '#A8901C',
    accentSecondary: '#7A6810',
    accentHighlight: '#D4B828',
    accentGlow: 'rgba(168, 144, 28, 0.25)',
    text: '#E0D8B0',
    textSecondary: '#A89870',
    textMuted: '#686040',
    textInverse: '#141208',
    error: '#C84020',
    success: '#608020',
    warning: '#A8901C',
    trackerRowEven: '#161408',
    trackerRowOdd: '#1C1A0C',
    trackerRowHighlight: '#222010',
    trackerRowCurrent: '#302808',
    trackerRowCursor: '#3C3000',
    trackerBorder: '#222010',
    cellNote: '#E0D8B0',
    cellInstrument: '#A8901C',
    cellVolume: '#7A6810',
    cellEffect: '#D4B828',
    cellAccent: '#A8901C',
    cellSlide: '#685808',
    cellEmpty: '#302C10',
    playbackCursor: '#D4B828',
    currentRowText: '#FFFFF0',
    panelShadow: '#080600',
    fontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
    monoFontFamily: "'Courier New', 'Courier', monospace",
    fontSize: '12px',
    knobStyle: 'vintage',
    buttonRadius: '4px',
    buttonStyle: 'raised',
  },
};

// Linn LM-2 LinnDrum (1982)
// Dark charcoal panel, multicolored velocity pads. Prince, MJ, Bowie.
const linnDrumTheme: Theme = {
  id: 'linndrum',
  name: 'Linn LM-2 LinnDrum',
  colors: {
    bg: '#141414',
    bgSecondary: '#1C1C1C',
    bgTertiary: '#242424',
    bgHover: '#2E2E2E',
    bgActive: '#383838',
    border: '#303030',
    borderLight: '#444444',
    accent: '#E06020',
    accentSecondary: '#CC2020',
    accentHighlight: '#D4B820',
    accentGlow: 'rgba(224, 96, 32, 0.25)',
    text: '#E8E0D0',
    textSecondary: '#A09888',
    textMuted: '#686058',
    textInverse: '#141414',
    error: '#CC2020',
    success: '#40A860',
    warning: '#D4B820',
    trackerRowEven: '#161616',
    trackerRowOdd: '#1C1C1C',
    trackerRowHighlight: '#222222',
    trackerRowCurrent: '#2E1C08',
    trackerRowCursor: '#3A2000',
    trackerBorder: '#222222',
    cellNote: '#E8E0D0',
    cellInstrument: '#E06020',
    cellVolume: '#D4B820',
    cellEffect: '#4488CC',
    cellAccent: '#E06020',
    cellSlide: '#8844CC',
    cellEmpty: '#383030',
    playbackCursor: '#E06020',
    currentRowText: '#FFFFFF',
    panelShadow: '#080808',
    // Bass=orange, Snare=red, Hi-hat=yellow, Tom=blue shades, purple, cyan
    pianoKeyColors: ['#E06020', '#CC2020', '#D4B820', '#4488CC', '#E06020', '#8844CC', '#2288CC'],
    fontFamily: "'Inter', 'Helvetica Neue', 'Helvetica', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'rubber',
    buttonRadius: '3px',
    buttonStyle: 'raised',
  },
};

// Simmons SDS-V (1981)
// White hexagonal pads, silver brain, electric blue rings. Space-age futurism.
const simmonsSdsVTheme: Theme = {
  id: 'simmons-sds-v',
  name: 'Simmons SDS-V',
  colors: {
    bg: '#F0F0F4',
    bgSecondary: '#E4E4EC',
    bgTertiary: '#D8D8E4',
    bgHover: '#C8C8D8',
    bgActive: '#B8B8CC',
    border: '#C0C0D0',
    borderLight: '#D0D0DE',
    accent: '#1848C8',
    accentSecondary: '#0898D0',
    accentHighlight: '#3868E8',
    accentGlow: 'rgba(24, 72, 200, 0.15)',
    text: '#101018',
    textSecondary: '#404050',
    textMuted: '#8080A0',
    textInverse: '#FFFFFF',
    error: '#CC2020',
    success: '#20A050',
    warning: '#D09010',
    trackerRowEven: '#EBEBF0',
    trackerRowOdd: '#E4E4EC',
    trackerRowHighlight: '#DDDDE8',
    trackerRowCurrent: '#C8D8F0',
    trackerRowCursor: '#B8CCE8',
    trackerBorder: '#DDDDE8',
    cellNote: '#101018',
    cellInstrument: '#1848C8',
    cellVolume: '#0898D0',
    cellEffect: '#3868E8',
    cellAccent: '#1848C8',
    cellSlide: '#6080C0',
    cellEmpty: '#B0B0C8',
    playbackCursor: '#1848C8',
    currentRowText: '#101018',
    panelShadow: '#C0C0D4',
    fontFamily: "'Rajdhani', 'Helvetica Neue', 'Helvetica', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'metallic',
    buttonRadius: '0px',
    buttonStyle: 'flat',
  },
};

// Korg KR-55 (1979)
// All-black body, warm amber LED display, orange buttons. Japanese analogue minimalism.
const korgKr55Theme: Theme = {
  id: 'korg-kr55',
  name: 'Korg KR-55',
  colors: {
    bg: '#0C0C0A',
    bgSecondary: '#141412',
    bgTertiary: '#1C1C18',
    bgHover: '#282820',
    bgActive: '#343428',
    border: '#2A2820',
    borderLight: '#3C3828',
    accent: '#D47820',
    accentSecondary: '#C05010',
    accentHighlight: '#F09030',
    accentGlow: 'rgba(212, 120, 32, 0.30)',
    text: '#F0E8D0',
    textSecondary: '#B09060',
    textMuted: '#706040',
    textInverse: '#0C0C0A',
    error: '#C84020',
    success: '#608020',
    warning: '#D47820',
    trackerRowEven: '#0E0E0C',
    trackerRowOdd: '#141412',
    trackerRowHighlight: '#1A1A16',
    trackerRowCurrent: '#281E08',
    trackerRowCursor: '#342400',
    trackerBorder: '#1A1A16',
    cellNote: '#F0E8D0',
    cellInstrument: '#D47820',
    cellVolume: '#C05010',
    cellEffect: '#F09030',
    cellAccent: '#D47820',
    cellSlide: '#885020',
    cellEmpty: '#302820',
    playbackCursor: '#F09030',
    currentRowText: '#FFF8E8',
    panelShadow: '#040402',
    fontFamily: "'Rajdhani', 'Helvetica Neue', 'Helvetica', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Courier New', monospace",
    fontSize: '12px',
    knobStyle: 'vintage',
    buttonRadius: '3px',
    buttonStyle: 'raised',
  },
};

// Boss DR-55 Dr. Rhythm (1979)
// Pale cream body, orange/red/green accent buttons. First Boss drum machine.
const bossDr55Theme: Theme = {
  id: 'boss-dr55',
  name: 'Boss DR-55',
  colors: {
    bg: '#F4EED0',
    bgSecondary: '#EAE4C4',
    bgTertiary: '#DDD8B8',
    bgHover: '#CEC8A8',
    bgActive: '#C0BA98',
    border: '#C8C2A0',
    borderLight: '#D4CEB0',
    accent: '#E05010',
    accentSecondary: '#C01818',
    accentHighlight: '#208030',
    accentGlow: 'rgba(224, 80, 16, 0.20)',
    text: '#1C1408',
    textSecondary: '#4A3820',
    textMuted: '#7A6840',
    textInverse: '#FFFFFF',
    error: '#C01818',
    success: '#208030',
    warning: '#E05010',
    trackerRowEven: '#EEE8CC',
    trackerRowOdd: '#EAE4C4',
    trackerRowHighlight: '#E4DEBC',
    trackerRowCurrent: '#D8C890',
    trackerRowCursor: '#CCBC80',
    trackerBorder: '#E4DEBC',
    cellNote: '#1C1408',
    cellInstrument: '#E05010',
    cellVolume: '#208030',
    cellEffect: '#C01818',
    cellAccent: '#E05010',
    cellSlide: '#806020',
    cellEmpty: '#C8C0A0',
    playbackCursor: '#E05010',
    currentRowText: '#1C1408',
    panelShadow: '#C0B890',
    pianoKeyColors: ['#E05010', '#C01818', '#D4A010', '#208030', '#E05010', '#6030A0', '#208030'],
    fontFamily: "'Nunito', 'Helvetica Neue', 'Helvetica', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'rubber',
    buttonRadius: '6px',
    buttonStyle: 'raised',
  },
};

// E-mu Drumulator (1983)
// Dark grey/black metal, red LEDs, cream silkscreen. First affordable sampled drum machine.
const emuDrumulatorTheme: Theme = {
  id: 'emu-drumulator',
  name: 'E-mu Drumulator',
  colors: {
    bg: '#0E0E10',
    bgSecondary: '#161618',
    bgTertiary: '#1E1E20',
    bgHover: '#2A2A2C',
    bgActive: '#343438',
    border: '#2C2C30',
    borderLight: '#404044',
    accent: '#CC1818',
    accentSecondary: '#884444',
    accentHighlight: '#E83030',
    accentGlow: 'rgba(204, 24, 24, 0.20)',
    text: '#E8E0D0',
    textSecondary: '#A09888',
    textMuted: '#686060',
    textInverse: '#0E0E10',
    error: '#E83030',
    success: '#40A860',
    warning: '#C08020',
    trackerRowEven: '#101012',
    trackerRowOdd: '#161618',
    trackerRowHighlight: '#1C1C1E',
    trackerRowCurrent: '#2A1010',
    trackerRowCursor: '#381010',
    trackerBorder: '#1C1C1E',
    cellNote: '#E8E0D0',
    cellInstrument: '#CC1818',
    cellVolume: '#884444',
    cellEffect: '#E83030',
    cellAccent: '#CC1818',
    cellSlide: '#664040',
    cellEmpty: '#363030',
    playbackCursor: '#E83030',
    currentRowText: '#FFFFFF',
    panelShadow: '#060608',
    fontFamily: "'Rajdhani', 'Helvetica Neue', 'Helvetica', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'default',
    buttonRadius: '2px',
    buttonStyle: 'flat',
  },
};

// Casio RZ-1 (1986)
// Light grey consumer electronics, rainbow pad buttons. Affordable 80s Japanese sampling.
const casioRz1Theme: Theme = {
  id: 'casio-rz1',
  name: 'Casio RZ-1',
  colors: {
    bg: '#D8D8DC',
    bgSecondary: '#CCCCCE',
    bgTertiary: '#C0C0C4',
    bgHover: '#B0B0B8',
    bgActive: '#A0A0AA',
    border: '#A8A8B4',
    borderLight: '#B8B8C4',
    accent: '#CC1818',
    accentSecondary: '#1868C0',
    accentHighlight: '#E8B010',
    accentGlow: 'rgba(204, 24, 24, 0.15)',
    text: '#141420',
    textSecondary: '#404050',
    textMuted: '#6A6A80',
    textInverse: '#FFFFFF',
    error: '#CC1818',
    success: '#18A030',
    warning: '#E8B010',
    trackerRowEven: '#D4D4D8',
    trackerRowOdd: '#CCCCCE',
    trackerRowHighlight: '#C4C4C8',
    trackerRowCurrent: '#B8C4D8',
    trackerRowCursor: '#A8B8D0',
    trackerBorder: '#C4C4C8',
    cellNote: '#141420',
    cellInstrument: '#CC1818',
    cellVolume: '#1868C0',
    cellEffect: '#E8B010',
    cellAccent: '#CC1818',
    cellSlide: '#8820B0',
    cellEmpty: '#A8A8B8',
    playbackCursor: '#CC1818',
    currentRowText: '#141420',
    panelShadow: '#A0A0B0',
    pianoKeyColors: ['#CC1818', '#E8B010', '#1868C0', '#18A030', '#CC1818', '#8820B0', '#1868C0'],
    fontFamily: "'Inter', 'Helvetica Neue', 'Helvetica', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'default',
    buttonRadius: '4px',
    buttonStyle: 'flat',
  },
};

// Sequential Circuits Tom (1985)
// Matte black, red accents, cream legends. Dave Smith's last drum machine.
const sequentialTomTheme: Theme = {
  id: 'sequential-tom',
  name: 'Sequential Tom',
  colors: {
    bg: '#0A0A0C',
    bgSecondary: '#121214',
    bgTertiary: '#1A1A1C',
    bgHover: '#252528',
    bgActive: '#303034',
    border: '#282828',
    borderLight: '#383840',
    accent: '#C81818',
    accentSecondary: '#904040',
    accentHighlight: '#E83018',
    accentGlow: 'rgba(200, 24, 24, 0.20)',
    text: '#E8E4DC',
    textSecondary: '#A09890',
    textMuted: '#686058',
    textInverse: '#0A0A0C',
    error: '#E83018',
    success: '#40A860',
    warning: '#C08020',
    trackerRowEven: '#0C0C0E',
    trackerRowOdd: '#121214',
    trackerRowHighlight: '#181818',
    trackerRowCurrent: '#280808',
    trackerRowCursor: '#340808',
    trackerBorder: '#181818',
    cellNote: '#E8E4DC',
    cellInstrument: '#C81818',
    cellVolume: '#904040',
    cellEffect: '#E83018',
    cellAccent: '#C81818',
    cellSlide: '#804040',
    cellEmpty: '#383030',
    playbackCursor: '#E83018',
    currentRowText: '#FFFFFF',
    panelShadow: '#040404',
    fontFamily: "'Rajdhani', 'Roboto Condensed', 'Helvetica Neue', sans-serif",
    monoFontFamily: "'Share Tech Mono', 'Consolas', monospace",
    fontSize: '12px',
    knobStyle: 'metallic',
    buttonRadius: '2px',
    buttonStyle: 'beveled',
  },
};

// Built-in themes (immutable)
const builtinThemes: Theme[] = [
  devilboxTheme, neoDarkTheme, cyanLineartTheme, modernTheme,
  tr808Theme, tr909Theme, dmxTheme, linnLm1Theme, mpc60Theme, cr78Theme,
  emuSp12Theme, maestroRhythmKingTheme, maestroRhythmSoundTheme,
  aceToneTheme, hammondAutoVariTheme, bossHc2Theme, wurlitzerSideManTheme,
  tr606Theme, tr707Theme, tr77Theme, linnDrumTheme, simmonsSdsVTheme,
  korgKr55Theme, bossDr55Theme, emuDrumulatorTheme, casioRz1Theme, sequentialTomTheme,
];

// Placeholder custom theme (uses NeoDark colors until user customizes)
const defaultCustomTheme: Theme = { id: 'custom', name: 'Custom', colors: { ...neoDarkTheme.colors } };

// Exported themes list — always includes Custom
export let themes: Theme[] = [...builtinThemes, defaultCustomTheme];

/** Rebuild the exported themes array when custom theme changes */
function rebuildThemesList(customColors: ThemeColors | null) {
  // Merge with defaults so persisted colors missing newer keys still have values
  const colors = customColors ? { ...neoDarkTheme.colors, ...customColors } : { ...neoDarkTheme.colors };
  const customTheme: Theme = { id: 'custom', name: 'Custom', colors };
  themes = [...builtinThemes, customTheme];
}

/** Default custom theme — clone of NeoDark as starting point */
export function getDefaultCustomColors(): ThemeColors {
  return { ...neoDarkTheme.colors };
}

/** Labels for each ThemeColors token, grouped for UI display */
export const THEME_TOKEN_GROUPS: { label: string; tokens: { key: ThemeColorKey; label: string }[] }[] = [
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

/** Keys in ThemeColors that are actual color values (excludes arrays, fonts, and style fields) */
type ThemeStyleKey = 'pianoKeyColors' | 'fontFamily' | 'monoFontFamily' | 'fontSize' | 'knobStyle' | 'buttonRadius' | 'buttonStyle';
export type ThemeColorKey = NonNullable<{ [K in keyof ThemeColors]-?: K extends ThemeStyleKey ? never : ThemeColors[K] extends string ? K : never }[keyof ThemeColors]>;

interface ThemeStore {
  currentThemeId: string;
  customThemeColors: ThemeColors | null;
  setTheme: (themeId: string) => void;
  getCurrentTheme: () => Theme;
  setCustomColor: (key: ThemeColorKey, value: string) => void;
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
  root.style.setProperty('--color-tracker-border', colors.trackerBorder);
  root.style.setProperty('--color-cell-note', colors.cellNote);
  root.style.setProperty('--color-cell-instrument', colors.cellInstrument);
  root.style.setProperty('--color-cell-volume', colors.cellVolume);
  root.style.setProperty('--color-cell-effect', colors.cellEffect);
  root.style.setProperty('--color-cell-accent', colors.cellAccent);
  root.style.setProperty('--color-cell-slide', colors.cellSlide);
  root.style.setProperty('--color-cell-empty', colors.cellEmpty);
  root.style.setProperty('--color-tracker-cursor', colors.playbackCursor);
  root.style.setProperty('--ft2-shadow', colors.panelShadow);

  // Theme-specific fonts (fall back to defaults when not set)
  const defaultSans = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif";
  const defaultMono = "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', monospace";
  root.style.setProperty('--theme-font-sans', colors.fontFamily || defaultSans);
  root.style.setProperty('--theme-font-mono', colors.monoFontFamily || defaultMono);
  root.style.setProperty('--theme-font-size', colors.fontSize || '12px');

  // Theme-specific control styles
  root.style.setProperty('--theme-button-radius', colors.buttonRadius || '4px');
  root.style.setProperty('--theme-knob-style', colors.knobStyle || 'default');
  root.style.setProperty('--theme-button-style', colors.buttonStyle || 'default');

  // Persist accent for pre-React loading screen (index.html reads this synchronously)
  try { localStorage.setItem('devilbox-accent', colors.accent); } catch { /* quota */ }
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      currentThemeId: 'modern',
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
        return themes.find(t => t.id === currentThemeId) || modernTheme;
      },

      setCustomColor: (key: ThemeColorKey, value: string) => {
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
        // Migrate old 'devilbox' theme ID to 'red-devil'
        if (state && state.currentThemeId === 'devilbox') {
          state.currentThemeId = 'red-devil';
        }
        // Apply theme after rehydration
        if (state) {
          const theme = themes.find(t => t.id === state.currentThemeId) || modernTheme;
          applyTheme(theme);
        }
      },
    }
  )
);

// Initialize theme on load
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('devilbox-theme');
  let themeId = 'modern';
  let customColors: ThemeColors | null = null;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      themeId = parsed.state?.currentThemeId || 'modern';
      // Migrate old 'devilbox' theme ID to 'red-devil'
      if (themeId === 'devilbox') themeId = 'red-devil';
      customColors = parsed.state?.customThemeColors || null;
    } catch {
      // Use default
    }
  }
  if (customColors) rebuildThemesList(customColors);
  const theme = themes.find(t => t.id === themeId) || modernTheme;
  applyTheme(theme);
}
