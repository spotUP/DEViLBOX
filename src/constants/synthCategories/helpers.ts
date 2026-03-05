/**
 * Helper functions and utilities for synth categories
 */

import type { SynthType } from '@typedefs/instrument';
import type { SynthInfo, SynthCategory } from './types';
import { SYNTH_INFO } from './synthInfo';
import { SYNTH_CATEGORIES } from './categories';

// Get all synth types as a flat list (sorted A-Z by short name)
export const ALL_SYNTH_TYPES: SynthType[] = (Object.keys(SYNTH_INFO) as SynthType[]).sort((a, b) =>
  SYNTH_INFO[a].shortName.localeCompare(SYNTH_INFO[b].shortName)
);

// Helper to get category for a synth type (returns primary category)
export function getCategoryForSynth(synthType: SynthType): SynthCategory | undefined {
  return SYNTH_CATEGORIES.find((cat) => cat.synths.some((s) => s.type === synthType));
}

// Helper to get synth info (returns fallback for unknown types)
const UNKNOWN_SYNTH_INFO: SynthInfo = { type: 'Synth' as any, name: 'Unknown', shortName: '???', description: '', bestFor: [], icon: 'Music2', color: 'text-gray-400' };
export function getSynthInfo(synthType: SynthType): SynthInfo {
  return SYNTH_INFO[synthType] ?? UNKNOWN_SYNTH_INFO;
}

// Map Tailwind color classes to CSS hex values
const TAILWIND_HEX: Record<string, string> = {
  'text-accent-primary': '#ef4444',
  'text-red-300': '#fca5a5', 'text-red-400': '#f87171', 'text-red-500': '#ef4444', 'text-red-600': '#dc2626',
  'text-orange-300': '#fdba74', 'text-orange-400': '#fb923c', 'text-orange-500': '#f97316', 'text-orange-600': '#ea580c',
  'text-amber-300': '#fcd34d', 'text-amber-400': '#fbbf24', 'text-amber-500': '#f59e0b', 'text-amber-600': '#d97706',
  'text-yellow-300': '#fde047', 'text-yellow-400': '#facc15', 'text-yellow-500': '#eab308',
  'text-lime-400': '#a3e635', 'text-lime-500': '#84cc16',
  'text-green-300': '#86efac', 'text-green-400': '#4ade80', 'text-green-500': '#22c55e',
  'text-emerald-400': '#34d399', 'text-emerald-500': '#10b981',
  'text-teal-300': '#5eead4', 'text-teal-400': '#2dd4bf', 'text-teal-500': '#14b8a6',
  'text-cyan-300': '#67e8f9', 'text-cyan-400': '#22d3ee', 'text-cyan-500': '#06b6d4',
  'text-sky-400': '#38bdf8', 'text-sky-500': '#0ea5e9',
  'text-blue-300': '#93c5fd', 'text-blue-400': '#60a5fa', 'text-blue-500': '#3b82f6',
  'text-indigo-400': '#818cf8', 'text-indigo-500': '#6366f1',
  'text-violet-400': '#a78bfa', 'text-violet-500': '#8b5cf6', 'text-violet-600': '#7c3aed',
  'text-purple-300': '#d8b4fe', 'text-purple-400': '#c084fc', 'text-purple-500': '#a855f7',
  'text-fuchsia-400': '#e879f9', 'text-fuchsia-500': '#d946ef',
  'text-pink-300': '#f9a8d4', 'text-pink-400': '#f472b6', 'text-pink-500': '#ec4899',
  'text-rose-400': '#fb7185', 'text-rose-500': '#f43f5e',
  'text-gray-300': '#d1d5db', 'text-gray-400': '#9ca3af', 'text-gray-500': '#6b7280',
  'text-slate-300': '#cbd5e1', 'text-slate-400': '#94a3b8',
  'text-stone-300': '#d6d3d1', 'text-stone-400': '#a8a29e',
  'text-white': '#ffffff',
};

export function tailwindToHex(twClass: string): string {
  return TAILWIND_HEX[twClass] ?? '#ef4444';
}
