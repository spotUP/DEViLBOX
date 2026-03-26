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

/** Ellipsis vertical (⋮) — used for context menu */
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
