/** SID chip ADSR timing tables (from MOS 6581/8580 datasheet) */

export const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
export const DECAY_MS = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000];
export const RELEASE_MS = DECAY_MS;

export const WAVEFORM_BITS = [
  { bit: 4, label: 'TRI', name: 'Triangle' },
  { bit: 5, label: 'SAW', name: 'Sawtooth' },
  { bit: 6, label: 'PUL', name: 'Pulse' },
  { bit: 7, label: 'NOI', name: 'Noise' },
] as const;

export const CONTROL_BITS = [
  { bit: 1, label: 'SYNC', name: 'Sync' },
  { bit: 2, label: 'RING', name: 'Ring Mod' },
  { bit: 3, label: 'TEST', name: 'Test Bit' },
] as const;

export const SID_VOICE_REGS = [
  { offset: 0, label: 'Freq Lo' }, { offset: 1, label: 'Freq Hi' },
  { offset: 2, label: 'PW Lo' }, { offset: 3, label: 'PW Hi' },
  { offset: 4, label: 'Control' }, { offset: 5, label: 'AD' }, { offset: 6, label: 'SR' },
] as const;

export const SID_FILTER_REGS = [
  { offset: 21, label: 'FC Lo' }, { offset: 22, label: 'FC Hi' },
  { offset: 23, label: 'Res/Filt' }, { offset: 24, label: 'Mode/Vol' },
] as const;

export const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

export function timeLabel(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
