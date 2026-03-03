/**
 * GTUltra Visual↔Hex Mapping Layer
 *
 * Bidirectional mapping between human-readable visual representations
 * and the raw hex values stored in GoatTracker's SID data structures.
 *
 * This enables Studio Mode to show friendly labels, sliders, and
 * visualizations while the underlying data remains compatible with
 * Pro Mode and the .sng file format.
 */

// ── SID ADSR timing tables (from SID datasheet) ──

/** Attack time in milliseconds for SID attack values 0-15 */
export const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];

/** Decay/Release time in milliseconds for SID decay/release values 0-15 */
export const DECAY_MS = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000];

// ── Waveform mappings ──

export interface WaveformInfo {
  name: string;
  shortName: string;
  icon: string;
  bit: number;
  description: string;
}

export const WAVEFORMS: WaveformInfo[] = [
  { name: 'Triangle', shortName: 'TRI', icon: '△', bit: 0x10, description: 'Pure, flute-like tone' },
  { name: 'Sawtooth', shortName: 'SAW', icon: '⊿', bit: 0x20, description: 'Bright, buzzy tone rich in harmonics' },
  { name: 'Pulse',    shortName: 'PUL', icon: '⊓', bit: 0x40, description: 'Variable-width square wave' },
  { name: 'Noise',    shortName: 'NOI', icon: '⊕', bit: 0x80, description: 'White noise for percussion/effects' },
];

// ── ADSR helpers ──

/** Decode attack/decay byte into individual 4-bit values */
export function decodeAD(ad: number): { attack: number; decay: number } {
  return { attack: (ad >> 4) & 0x0F, decay: ad & 0x0F };
}

/** Encode attack/decay into single byte */
export function encodeAD(attack: number, decay: number): number {
  return ((attack & 0x0F) << 4) | (decay & 0x0F);
}

/** Decode sustain/release byte */
export function decodeSR(sr: number): { sustain: number; release: number } {
  return { sustain: (sr >> 4) & 0x0F, release: sr & 0x0F };
}

/** Encode sustain/release into single byte */
export function encodeSR(sustain: number, release: number): number {
  return ((sustain & 0x0F) << 4) | (release & 0x0F);
}

/** Get attack time label */
export function attackLabel(value: number): string {
  const ms = ATTACK_MS[value & 0x0F];
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/** Get decay/release time label */
export function decayLabel(value: number): string {
  const ms = DECAY_MS[value & 0x0F];
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/** Get sustain level as percentage */
export function sustainLabel(value: number): string {
  return `${Math.round((value / 15) * 100)}%`;
}

// ── Waveform helpers ──

/** Get active waveforms from control register byte */
export function activeWaveforms(control: number): WaveformInfo[] {
  return WAVEFORMS.filter(wf => (control & wf.bit) !== 0);
}

/** Get waveform name string (e.g., "Saw+Pulse") */
export function waveformName(control: number): string {
  const active = activeWaveforms(control);
  if (active.length === 0) return 'None';
  return active.map(wf => wf.shortName).join('+');
}

/** Check if gate bit is set */
export function isGateOn(control: number): boolean {
  return (control & 0x01) !== 0;
}

/** Check if sync bit is set */
export function isSyncOn(control: number): boolean {
  return (control & 0x02) !== 0;
}

/** Check if ring modulation bit is set */
export function isRingModOn(control: number): boolean {
  return (control & 0x04) !== 0;
}

/** Check if test bit is set (mutes voice) */
export function isTestOn(control: number): boolean {
  return (control & 0x08) !== 0;
}

// ── Filter helpers ──

export interface FilterInfo {
  cutoff: number;
  resonance: number;
  filterVoice1: boolean;
  filterVoice2: boolean;
  filterVoice3: boolean;
  filterExt: boolean;
  lowPass: boolean;
  bandPass: boolean;
  highPass: boolean;
  mute3: boolean;
  volume: number;
}

/** Decode filter registers (0x15-0x18) into friendly structure */
export function decodeFilter(regs: Uint8Array, offset = 0x15): FilterInfo {
  const cutoffLo = regs[offset] & 0x07;
  const cutoffHi = regs[offset + 1];
  const filterRes = regs[offset + 2];
  const modeVol = regs[offset + 3];

  return {
    cutoff: (cutoffHi << 3) | cutoffLo,
    resonance: (filterRes >> 4) & 0x0F,
    filterVoice1: (filterRes & 0x01) !== 0,
    filterVoice2: (filterRes & 0x02) !== 0,
    filterVoice3: (filterRes & 0x04) !== 0,
    filterExt: (filterRes & 0x08) !== 0,
    lowPass: (modeVol & 0x10) !== 0,
    bandPass: (modeVol & 0x20) !== 0,
    highPass: (modeVol & 0x40) !== 0,
    mute3: (modeVol & 0x80) !== 0,
    volume: modeVol & 0x0F,
  };
}

/** Get filter mode name */
export function filterModeName(info: FilterInfo): string {
  const modes: string[] = [];
  if (info.lowPass) modes.push('LP');
  if (info.bandPass) modes.push('BP');
  if (info.highPass) modes.push('HP');
  return modes.length > 0 ? modes.join('+') : 'Off';
}

// ── Note helpers ──

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** Convert GoatTracker note value to display string */
export function noteToString(note: number): string {
  if (note === 0) return '...';
  if (note === 0xBE) return '===';
  if (note === 0xBF) return '+++';
  const v = note - 1;
  const name = NOTE_NAMES[v % 12];
  const octave = Math.floor(v / 12);
  return `${name}${octave}`;
}

/** Convert display string back to GoatTracker note value */
export function stringToNote(str: string): number {
  if (str === '...' || str === '') return 0;
  if (str === '===') return 0xBE;
  if (str === '+++') return 0xBF;

  const match = str.match(/^([A-G][#-])(\d)$/);
  if (!match) return 0;

  const noteIdx = NOTE_NAMES.indexOf(match[1]);
  if (noteIdx === -1) return 0;

  const octave = parseInt(match[2], 10);
  return noteIdx + octave * 12 + 1;
}

// ── Command helpers ──

export interface GTCommand {
  hex: number;
  name: string;
  description: string;
  paramDesc: string;
}

export const GT_COMMANDS: GTCommand[] = [
  { hex: 0x00, name: '---', description: 'No command', paramDesc: '' },
  { hex: 0x01, name: 'PrtUp', description: 'Portamento up', paramDesc: 'Speed (00-FF)' },
  { hex: 0x02, name: 'PrtDn', description: 'Portamento down', paramDesc: 'Speed (00-FF)' },
  { hex: 0x03, name: 'TnPrt', description: 'Tone portamento', paramDesc: 'Speed (00-FF)' },
  { hex: 0x04, name: 'Vibra', description: 'Vibrato', paramDesc: 'Speed/Depth (xy)' },
  { hex: 0x05, name: 'ADset', description: 'Set Attack/Decay', paramDesc: 'AD value (00-FF)' },
  { hex: 0x06, name: 'SRset', description: 'Set Sustain/Release', paramDesc: 'SR value (00-FF)' },
  { hex: 0x07, name: 'WvTbl', description: 'Set wave table pointer', paramDesc: 'Table index (00-FF)' },
  { hex: 0x08, name: 'PlTbl', description: 'Set pulse table pointer', paramDesc: 'Table index (00-FF)' },
  { hex: 0x09, name: 'FiTbl', description: 'Set filter table pointer', paramDesc: 'Table index (00-FF)' },
  { hex: 0x0A, name: 'FiCut', description: 'Set filter cutoff', paramDesc: 'Cutoff (00-FF)' },
  { hex: 0x0B, name: 'FiRes', description: 'Set filter resonance', paramDesc: 'Resonance (00-F0)' },
  { hex: 0x0C, name: 'Vol  ', description: 'Set volume', paramDesc: 'Volume (00-0F)' },
  { hex: 0x0D, name: 'SpTbl', description: 'Set speed table pointer', paramDesc: 'Table index (00-FF)' },
  { hex: 0x0E, name: 'Tempo', description: 'Set tempo', paramDesc: 'Tempo value' },
  { hex: 0x0F, name: 'GtTmr', description: 'Set gate timer', paramDesc: 'Timer value (00-FF)' },
];

/** Get command info by hex value */
export function getCommandInfo(cmd: number): GTCommand {
  return GT_COMMANDS.find(c => c.hex === cmd) || GT_COMMANDS[0];
}

/** Format command for display (friendly name) */
export function commandLabel(cmd: number, data: number): string {
  const info = getCommandInfo(cmd);
  if (cmd === 0 && data === 0) return '--- --';
  return `${info.name} ${data.toString(16).toUpperCase().padStart(2, '0')}`;
}
