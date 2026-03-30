/**
 * lucideIcons — Pre-defined Lucide icon node data for use in Pixi.
 *
 * These are extracted from lucide-react's __iconNode exports.
 * Use with getLucideTexture() from lucideToTexture.ts.
 *
 * We store the raw path data here to avoid importing lucide-react
 * (which is a React dependency) into pure Pixi code.
 */

export type IconNode = [string, Record<string, string>][];

// ---------------------------------------------------------------------------
// Icons used by other Pixi components (mixer, channel strip, etc.)
// ---------------------------------------------------------------------------

/** Volume speaker (unmuted) — used for mute button */
export const ICON_VOLUME_2: IconNode = [
  ["path", { d: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" }],
  ["path", { d: "M16 9a5 5 0 0 1 0 6" }],
  ["path", { d: "M19.364 18.364a9 9 0 0 0 0-12.728" }],
];

/** Volume muted — used for muted state */
export const ICON_VOLUME_X: IconNode = [
  ["path", { d: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" }],
  ["line", { x1: "22", x2: "16", y1: "9", y2: "15" }],
  ["line", { x1: "16", x2: "22", y1: "9", y2: "15" }],
];

/** Headphones — used for solo button */
export const ICON_HEADPHONES: IconNode = [
  ["path", { d: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" }],
];

/** Palette — used for color picker */
export const ICON_PALETTE: IconNode = [
  ["path", { d: "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" }],
  ["circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor" }],
  ["circle", { cx: "17", cy: "10", r: ".5", fill: "currentColor" }],
  ["circle", { cx: "8.5", cy: "7.5", r: ".5", fill: "currentColor" }],
  ["circle", { cx: "6.5", cy: "12", r: ".5", fill: "currentColor" }],
];

/** Chevron left — used for collapse */
export const ICON_CHEVRON_LEFT: IconNode = [
  ["path", { d: "m15 18-6-6 6-6" }],
];

/** Chevron right — used for expand */
export const ICON_CHEVRON_RIGHT: IconNode = [
  ["path", { d: "m9 18 6-6-6-6" }],
];

/** Ellipsis vertical — used for context menu */
export const ICON_ELLIPSIS_V: IconNode = [
  ["circle", { cx: "12", cy: "12", r: "1" }],
  ["circle", { cx: "12", cy: "5", r: "1" }],
  ["circle", { cx: "12", cy: "19", r: "1" }],
];

/** Plus — used for add channel */
export const ICON_PLUS: IconNode = [
  ["path", { d: "M5 12h14" }],
  ["path", { d: "M12 5v14" }],
];

/** X / Close */
export const ICON_X: IconNode = [
  ["path", { d: "M18 6 6 18" }],
  ["path", { d: "m6 6 12 12" }],
];

/** Log In — used for sign in */
export const ICON_LOG_IN: IconNode = [
  ["path", { d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" }],
  ["polyline", { points: "10 17 15 12 10 7" }],
  ["line", { x1: "15", x2: "3", y1: "12", y2: "12" }],
];

/** Users — used for collab */
export const ICON_USERS: IconNode = [
  ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
  ["circle", { cx: "9", cy: "7", r: "4" }],
  ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }],
  ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }],
];

/** Download — used for desktop app button */
export const ICON_DOWNLOAD: IconNode = [
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
  ["polyline", { points: "7 10 12 15 17 10" }],
  ["line", { x1: "12", x2: "12", y1: "15", y2: "3" }],
];

/** Info circle */
export const ICON_INFO: IconNode = [
  ["circle", { cx: "12", cy: "12", r: "10" }],
  ["path", { d: "M12 16v-4" }],
  ["path", { d: "M12 8h.01" }],
];

/** Music — used for MIDI */
export const ICON_MUSIC: IconNode = [
  ["path", { d: "M9 18V5l12-2v13" }],
  ["circle", { cx: "6", cy: "18", r: "3" }],
  ["circle", { cx: "18", cy: "16", r: "3" }],
];

/** Monitor — used for DOM switch */
export const ICON_MONITOR: IconNode = [
  ["rect", { width: "20", height: "14", x: "2", y: "3", rx: "2" }],
  ["line", { x1: "8", x2: "16", y1: "21", y2: "21" }],
  ["line", { x1: "12", x2: "12", y1: "17", y2: "21" }],
];

// ---------------------------------------------------------------------------
// Icons used by PixiButton (FontAudio name -> Lucide equivalent)
// ---------------------------------------------------------------------------

/** Play */
export const ICON_PLAY: IconNode = [
  ["path", { d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" }],
];

/** Square (stop) */
export const ICON_SQUARE: IconNode = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
];

/** Circle (record) */
export const ICON_CIRCLE: IconNode = [
  ["circle", { cx: "12", cy: "12", r: "10" }],
];

/** SkipBack (prev) */
export const ICON_SKIP_BACK: IconNode = [
  ["path", { d: "M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" }],
  ["path", { d: "M3 20V4" }],
];

/** SkipForward (next) */
export const ICON_SKIP_FORWARD: IconNode = [
  ["path", { d: "M21 4v16" }],
  ["path", { d: "M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z" }],
];

/** FastForward (forward) */
export const ICON_FAST_FORWARD: IconNode = [
  ["path", { d: "M12 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 12 18z" }],
  ["path", { d: "M2 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 2 18z" }],
];

/** Repeat (loop) */
export const ICON_REPEAT: IconNode = [
  ["path", { d: "m17 2 4 4-4 4" }],
  ["path", { d: "M3 11v-1a4 4 0 0 1 4-4h14" }],
  ["path", { d: "m7 22-4-4 4-4" }],
  ["path", { d: "M21 13v1a4 4 0 0 1-4 4H3" }],
];

/** Save */
export const ICON_SAVE: IconNode = [
  ["path", { d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" }],
  ["path", { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" }],
  ["path", { d: "M7 3v4a1 1 0 0 0 1 1h7" }],
];

/** FolderOpen (open) */
export const ICON_FOLDER_OPEN: IconNode = [
  ["path", { d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" }],
];

/** Copy */
export const ICON_COPY: IconNode = [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }],
];

/** Redo */
export const ICON_REDO: IconNode = [
  ["path", { d: "M21 7v6h-6" }],
  ["path", { d: "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" }],
];

/** Undo */
export const ICON_UNDO: IconNode = [
  ["path", { d: "M3 7v6h6" }],
  ["path", { d: "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" }],
];

/** Settings (cog) */
export const ICON_SETTINGS: IconNode = [
  ["path", { d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" }],
  ["circle", { cx: "12", cy: "12", r: "3" }],
];

/** SlidersHorizontal (preset-a) */
export const ICON_SLIDERS_HORIZONTAL: IconNode = [
  ["path", { d: "M10 5H3" }],
  ["path", { d: "M12 19H3" }],
  ["path", { d: "M14 3v4" }],
  ["path", { d: "M16 17v4" }],
  ["path", { d: "M21 12h-9" }],
  ["path", { d: "M21 19h-5" }],
  ["path", { d: "M21 5h-7" }],
  ["path", { d: "M8 10v4" }],
  ["path", { d: "M8 12H3" }],
];

/** Pencil (pen) */
export const ICON_PENCIL: IconNode = [
  ["path", { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }],
  ["path", { d: "m15 5 4 4" }],
];

/** HardDrive (diskio) */
export const ICON_HARD_DRIVE: IconNode = [
  ["line", { x1: "22", x2: "2", y1: "12", y2: "12" }],
  ["path", { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" }],
  ["line", { x1: "6", x2: "6.01", y1: "16", y2: "16" }],
  ["line", { x1: "10", x2: "10.01", y1: "16", y2: "16" }],
];

/** Zap (thunderbolt) */
export const ICON_ZAP: IconNode = [
  ["path", { d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" }],
];

/** Activity (waveform) */
export const ICON_ACTIVITY: IconNode = [
  ["path", { d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" }],
];

/** Cpu */
export const ICON_CPU: IconNode = [
  ["path", { d: "M12 20v2" }],
  ["path", { d: "M12 2v2" }],
  ["path", { d: "M17 20v2" }],
  ["path", { d: "M17 2v2" }],
  ["path", { d: "M2 12h2" }],
  ["path", { d: "M2 17h2" }],
  ["path", { d: "M2 7h2" }],
  ["path", { d: "M20 12h2" }],
  ["path", { d: "M20 17h2" }],
  ["path", { d: "M20 7h2" }],
  ["path", { d: "M7 20v2" }],
  ["path", { d: "M7 2v2" }],
  ["rect", { x: "4", y: "4", width: "16", height: "16", rx: "2" }],
  ["rect", { x: "8", y: "8", width: "8", height: "8", rx: "1" }],
];

/** ZoomIn (zoomin) */
export const ICON_ZOOM_IN: IconNode = [
  ["circle", { cx: "11", cy: "11", r: "8" }],
  ["line", { x1: "21", x2: "16.65", y1: "21", y2: "16.65" }],
  ["line", { x1: "11", x2: "11", y1: "8", y2: "14" }],
  ["line", { x1: "8", x2: "14", y1: "11", y2: "11" }],
];

/** ArrowLeftRight (arrows-horz) */
export const ICON_ARROW_LEFT_RIGHT: IconNode = [
  ["path", { d: "M8 3 4 7l4 4" }],
  ["path", { d: "M4 7h16" }],
  ["path", { d: "m16 21 4-4-4-4" }],
  ["path", { d: "M20 17H4" }],
];

/** Pause */
export const ICON_PAUSE: IconNode = [
  ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1" }],
  ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1" }],
];

/** Disc3 (turntable/cue) */
export const ICON_DISC_3: IconNode = [
  ["circle", { cx: "12", cy: "12", r: "10" }],
  ["path", { d: "M6 12c0-1.7.7-3.2 1.8-4.2" }],
  ["circle", { cx: "12", cy: "12", r: "2" }],
  ["path", { d: "M18 12c0 1.7-.7 3.2-1.8 4.2" }],
];

/** Lock (key lock / master tempo) */
export const ICON_LOCK: IconNode = [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }],
];

/** Link (sync) */
export const ICON_LINK: IconNode = [
  ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
  ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }],
];

/** Timer */
export const ICON_TIMER: IconNode = [
  ["line", { x1: "10", x2: "14", y1: "2", y2: "2" }],
  ["line", { x1: "12", x2: "15", y1: "14", y2: "11" }],
  ["circle", { cx: "12", cy: "14", r: "8" }],
];

/** Grid3x3 */
export const ICON_GRID_3X3: IconNode = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
  ["path", { d: "M3 9h18" }],
  ["path", { d: "M3 15h18" }],
  ["path", { d: "M9 3v18" }],
  ["path", { d: "M15 3v18" }],
];

// ---------------------------------------------------------------------------
// Map from FontAudio icon names to Lucide IconNode data.
// Used by PixiButton to render Lucide SVG textures instead of bitmap text.
// ---------------------------------------------------------------------------

export const FONTAUDIO_TO_LUCIDE: Record<string, IconNode> = {
  'play':         ICON_PLAY,
  'stop':         ICON_SQUARE,
  'record':       ICON_CIRCLE,
  'prev':         ICON_SKIP_BACK,
  'next':         ICON_SKIP_FORWARD,
  'forward':      ICON_FAST_FORWARD,
  'loop':         ICON_REPEAT,
  'save':         ICON_SAVE,
  'open':         ICON_FOLDER_OPEN,
  'close':        ICON_X,
  'copy':         ICON_COPY,
  'redo':         ICON_REDO,
  'undo':         ICON_UNDO,
  'cog':          ICON_SETTINGS,
  'preset-a':     ICON_SLIDERS_HORIZONTAL,
  'pen':          ICON_PENCIL,
  'diskio':       ICON_HARD_DRIVE,
  'thunderbolt':  ICON_ZAP,
  'waveform':     ICON_ACTIVITY,
  'cpu':          ICON_CPU,
  'zoomin':       ICON_ZOOM_IN,
  'caret-left':   ICON_CHEVRON_LEFT,
  'caret-right':  ICON_CHEVRON_RIGHT,
  'arrows-horz':  ICON_ARROW_LEFT_RIGHT,
  'pause':        ICON_PAUSE,
  'disc-3':       ICON_DISC_3,
  'link':         ICON_LINK,
  'lock':         ICON_LOCK,
};
