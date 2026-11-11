/**
 * Settings dialog search: one pure predicate plus the searchable index.
 * Each entry is one visible section of the Settings dialog. `keywords` holds the
 * row labels and description texts of that section (kept beside the section name
 * so the filter has a single source of searchable text).
 */

export interface SettingsSearchEntry {
  /** Stable id; SettingsSection in SettingsModal uses it to look itself up. */
  id: string;
  /** Tab the section lives in (matches SettingsTab). */
  tab: string;
  /** Section name as shown in the dialog. */
  section: string;
  /** Row labels and descriptions of the section. */
  keywords: string[];
}

/** True when the trimmed, lower-cased query is empty or occurs in any text. */
export function matchesSettingsQuery(query: string, texts: readonly string[]): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return texts.some((t) => t.toLowerCase().includes(q));
}

/** Entries whose section name or any keyword contains the query. Empty query returns all. */
export function filterSettingsEntries(
  entries: readonly SettingsSearchEntry[],
  query: string,
): SettingsSearchEntry[] {
  return entries.filter((e) => matchesSettingsQuery(query, [e.section, ...e.keywords]));
}

export const SETTINGS_SEARCH_INDEX: readonly SettingsSearchEntry[] = [
  { id: 'theme', tab: 'general', section: 'Theme', keywords: ['Theme', 'Copy colors from', 'custom colors'] },
  { id: 'display', tab: 'general', section: 'Display', keywords: ['Number Format', 'Blank Empty Cells', 'Hide empty rows', 'Fullscreen', 'Ghost Patterns', 'Show adjacent patterns dimmed behind current', 'Smooth Scrolling', 'Interpolated scrolling instead of stepped rows'] },
  { id: 'layout', tab: 'general', section: 'Layout', keywords: ['Knob Panel', 'Oscilloscope'] },
  { id: 'engine', tab: 'audio', section: 'Engine', keywords: ['Amiga Limits', 'Clamp periods to 113-856', 'Sample Interpolation', 'Linear (clean) vs None (crunchy)', 'BLEP Synthesis', 'Band-limited (reduces aliasing)', 'Startup Jingle', 'Disable when using MCP', 'Welcome Dialog', 'Tips and what is new at start', 'Next Subsong at End', 'the song stops when its subsong ends'] },
  { id: 'stereo', tab: 'audio', section: 'Stereo Separation', keywords: ['Algorithm', 'Headphones'] },
  { id: 'bus-gain', tab: 'audio', section: 'Bus Gain Balance', keywords: ['Auto-balance', 'Samples', 'Synths'] },
  { id: 'vu', tab: 'visual', section: 'VU Meters', keywords: ['Mode', 'Style', 'Swing Animation', 'Mirror (both directions)'] },
  { id: 'pattern-views', tab: 'visual', section: 'Pattern Views', keywords: ['Fit all channels in the tracker', 'Shrinks the pattern text so every channel fits the width', 'Fit all channels on the decks', 'Same for the DJ deck pattern views', 'Show unused channels', 'channels with no data in any pattern are hidden'] },
  { id: 'visual-background', tab: 'visual', section: 'Visual Background', keywords: ['Enable', 'WebGL audio-reactive effects', 'Mode', 'Channel Color Blend'] },
  { id: 'recording', tab: 'recording', section: 'Recording', keywords: ['Edit Step', 'Edit Mode', 'Record Key-Off', 'Record === when keys are released', 'Quantization'] },
  { id: 'keyboard', tab: 'input', section: 'Keyboard', keywords: ['Scheme', 'Edit behaviour', 'Where the cursor goes after typing an instrument, volume or effect', 'Platform', 'Override Cmd/Ctrl detection', 'Keyboard shortcuts', 'Key bindings'] },
  { id: 'vinyl-scratch', tab: 'input', section: 'Vinyl Scratch', keywords: ['Always On', 'Scratch when stopped', 'Velocity Curve', 'Smooth momentum', 'Platter Weight', 'Scratch Sensitivity', 'How fast the record responds to drag'] },
  { id: 'midi-devices', tab: 'midi', section: 'MIDI Devices', keywords: ['input device', 'output device'] },
  { id: 'midi-settings', tab: 'midi', section: 'MIDI Settings', keywords: ['Polyphonic Mode', 'Play multiple notes simultaneously'] },
  { id: 'midi-tools', tab: 'midi', section: 'MIDI Tools', keywords: ['Controller Setup Wizard', 'Detect and configure MIDI controller', 'Controller Mapper', 'Visual mapping editor for knobs, faders, buttons', 'NKS'] },
  { id: 'kk-light-guide', tab: 'midi', section: 'KK Light Guide', keywords: ['Komplete Kontrol', 'keyboard lights'] },
  { id: 'sid-engine', tab: 'sid', section: 'SID Player Engine', keywords: ['Choose emulation engine for C64 SID music', '.sid files', 'Commodore 64'] },
  { id: 'sid-hardware', tab: 'sid', section: 'SID Hardware Output', keywords: ['Route to real MOS 6581/8580 chips via USB-SID-Pico', 'Transport', 'ASID', 'USB'] },
  { id: 'about', tab: 'about', section: 'About', keywords: ['DEViLBOX', 'TB-303 Acid Tracker', 'Settings are saved automatically', 'version'] },
  { id: 'modland', tab: 'about', section: 'Modland Integration', keywords: ['Contribution modal for unknown modules', 'Clear dismissed files'] },
  { id: 'workbench', tab: 'about', section: 'Workbench', keywords: ['Tab', 'hold for Expose (fit all windows)'] },
  { id: 'danger-zone', tab: 'about', section: 'Danger Zone', keywords: ['Clear all state', 'reset to factory defaults', 'reload'] },
];
