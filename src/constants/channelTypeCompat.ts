/**
 * Channel-Type Compatibility Map
 *
 * Maps SynthType → compatible DivChanType[] to validate that instruments
 * are placed in appropriate hardware channels when a system preset is active.
 *
 * DivChanType values: FM(0) PULSE(1) NOISE(2) WAVE(3) PCM(4) OP(5)
 */

import { DivChanType } from '@/constants/systemPresets';
import type { SynthType } from '@typedefs/instrument';

// ── Badge display info ────────────────────────────────────────────────────────

export interface ChannelTypeBadge {
  label: string;       // Short label: FM, PSG, PCM, WAV, NOI, OP, ANY
  color: number;       // Pixi hex color
  cssColor: string;    // CSS color for DOM
}

const BADGE_FM:    ChannelTypeBadge = { label: 'FM',  color: 0x60a5fa, cssColor: '#60a5fa' };
const BADGE_PSG:   ChannelTypeBadge = { label: 'PSG', color: 0xf87171, cssColor: '#f87171' };
const BADGE_NOISE: ChannelTypeBadge = { label: 'NOI', color: '#9ca3af' as any, cssColor: '#9ca3af' };
const BADGE_WAVE:  ChannelTypeBadge = { label: 'WAV', color: 0xfbbf24, cssColor: '#fbbf24' };
const BADGE_PCM:   ChannelTypeBadge = { label: 'PCM', color: 0x34d399, cssColor: '#34d399' };
const BADGE_OP:    ChannelTypeBadge = { label: 'OP',  color: 0x22d3ee, cssColor: '#22d3ee' };
const BADGE_ANY:   ChannelTypeBadge = { label: 'ANY', color: 0xa78bfa, cssColor: '#a78bfa' };

// Fix the NOISE hex
(BADGE_NOISE as any).color = 0x9ca3af;

export const CHAN_TYPE_BADGES: Record<number, ChannelTypeBadge> = {
  [DivChanType.FM]:    BADGE_FM,
  [DivChanType.PULSE]: BADGE_PSG,
  [DivChanType.NOISE]: BADGE_NOISE,
  [DivChanType.WAVE]:  BADGE_WAVE,
  [DivChanType.PCM]:   BADGE_PCM,
  [DivChanType.OP]:    BADGE_OP,
};

// ── SynthType → compatible DivChanType[] ──────────────────────────────────────

// null = compatible with ALL channel types (no hardware constraint)
const compatMap = new Map<string, number[] | null>();

// ── FM synth types → FM, OP channels ──────────────────────────────────────────
const FM_TYPES = [
  'FurnaceOPN', 'FurnaceOPM', 'FurnaceOPL', 'FurnaceOPLL', 'FurnaceESFM',
  'FurnaceOPZ', 'FurnaceOPNA', 'FurnaceOPNB', 'FurnaceOPL4', 'FurnaceY8950',
  'FurnaceVRC7', 'FurnaceOPN2203', 'FurnaceOPNBB',
  'DX7', 'OPL3',
];
for (const t of FM_TYPES) compatMap.set(t, [DivChanType.FM, DivChanType.OP]);

// ── Pulse/PSG synth types → PULSE, NOISE channels ────────────────────────────
const PSG_TYPES = [
  'FurnaceNES', 'FurnaceGB', 'FurnacePSG', 'FurnaceVRC6', 'FurnaceMMC5',
  'FurnaceAY', 'FurnaceAY8930', 'FurnaceVIC', 'FurnaceSAA', 'FurnaceTED',
  'FurnaceVERA', 'FurnaceTIA', 'FurnaceSM8521', 'FurnaceT6W28',
  'FurnaceSUPERVISION', 'FurnaceUPD1771', 'FurnacePOKEMINI', 'FurnacePET',
  'FurnacePOKEY', 'FurnacePCSPKR', 'FurnacePONG', 'FurnacePV1000',
  'FurnaceDAVE', 'FurnaceSU', 'FurnacePOWERNOISE', 'FurnaceZXBEEPER',
  'FurnaceSCVTONE',
  'C64SID', 'FurnaceC64', 'FurnaceSID6581', 'FurnaceSID8580', 'FurnaceSID3',
];
for (const t of PSG_TYPES) compatMap.set(t, [DivChanType.PULSE, DivChanType.NOISE]);

// ── Wavetable synth types → WAVE channels ─────────────────────────────────────
const WAVE_TYPES = [
  'FurnaceSCC', 'FurnaceN163', 'FurnaceFDS', 'FurnacePCE', 'FurnaceVB',
  'FurnaceLynx', 'FurnaceSWAN', 'FurnaceBUBBLE', 'FurnaceNAMCO',
  'FurnaceMSM5232', 'FurnaceX1_010',
  'HivelySynth', 'SoundMonSynth',
];
for (const t of WAVE_TYPES) compatMap.set(t, [DivChanType.WAVE]);

// ── PCM/sample synth types → PCM channels ─────────────────────────────────────
const PCM_TYPES = [
  'Sampler', 'Player', 'DrumKit',
  'FurnaceSNES', 'FurnaceSEGAPCM', 'FurnaceQSOUND', 'FurnaceES5506',
  'FurnaceRF5C68', 'FurnaceC140', 'FurnaceK007232', 'FurnaceK053260',
  'FurnaceGA20', 'FurnaceOKI', 'FurnaceYMZ280B', 'FurnaceNDS', 'FurnaceGBA',
  'FurnaceMSM6258', 'FurnaceMULTIPCM', 'FurnaceAMIGA', 'FurnacePCMDAC',
];
for (const t of PCM_TYPES) compatMap.set(t, [DivChanType.PCM]);

// All Tone.js / generic synths → null (compatible with everything)
// They're software synths with no hardware constraint.

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get compatible DivChanType values for a synth type.
 * Returns null if the synth has no hardware constraint (works everywhere).
 */
export function getCompatibleChannelTypes(synthType: SynthType | string): number[] | null {
  return compatMap.get(synthType) ?? null;
}

/**
 * Check if a synth type is compatible with a specific DivChanType.
 * Returns true if compatible, or if the synth has no hardware constraint.
 */
export function isSynthCompatibleWithChannel(
  synthType: SynthType | string,
  channelType: number
): boolean {
  const compat = compatMap.get(synthType);
  if (compat === null || compat === undefined) return true; // no constraint
  return compat.includes(channelType);
}

/**
 * Get the badge info for a synth type based on its primary channel affinity.
 */
export function getSynthBadge(synthType: SynthType | string): ChannelTypeBadge {
  const compat = compatMap.get(synthType);
  if (!compat) return BADGE_ANY;
  // Use first compatible type as primary badge
  return CHAN_TYPE_BADGES[compat[0]] ?? BADGE_ANY;
}

/**
 * Get channel type badge for a DivChanType value.
 */
export function getChannelBadge(channelType: number): ChannelTypeBadge {
  return CHAN_TYPE_BADGES[channelType] ?? BADGE_ANY;
}
