/**
 * PixiInstrumentPanel — GL-native instrument list.
 * Replaces the previous PixiDOMOverlay bridge with a direct ScrollList.
 * Feature parity with the DOM InstrumentList (preset/edit/drag) is deferred.
 */

import React, { useCallback, useMemo } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { ScrollList } from '../../../ui/components/ScrollList';
import type { ScrollListItem } from '../../../ui/components/ScrollList';
import { getSynthInfo } from '@constants/synthCategories';

interface PixiInstrumentPanelProps {
  width: number;
  height: number;
}

/** Map Tailwind color classes used in synthCategories → Pixi hex colors */
const TAILWIND_HEX: Record<string, number> = {
  'text-accent-primary': 0x00ff88,
  'text-blue-300':   0x93c5fd, 'text-blue-400':   0x60a5fa, 'text-blue-500':   0x3b82f6,
  'text-purple-300': 0xd8b4fe, 'text-purple-400': 0xc084fc, 'text-purple-500': 0xa855f7,
  'text-indigo-400': 0x818cf8, 'text-indigo-500': 0x6366f1,
  'text-violet-400': 0xa78bfa, 'text-violet-500': 0x8b5cf6, 'text-violet-600': 0x7c3aed,
  'text-fuchsia-400': 0xe879f9, 'text-fuchsia-500': 0xd946ef,
  'text-pink-300':   0xf9a8d4, 'text-pink-400':   0xf472b6, 'text-pink-500':   0xec4899,
  'text-rose-400':   0xfb7185, 'text-rose-500':   0xf43f5e,
  'text-red-300':    0xfca5a5, 'text-red-400':    0xf87171, 'text-red-500':    0xef4444, 'text-red-600': 0xdc2626,
  'text-orange-300': 0xfdba74, 'text-orange-400': 0xfb923c, 'text-orange-500': 0xf97316, 'text-orange-600': 0xea580c,
  'text-amber-300':  0xfcd34d, 'text-amber-400':  0xfbbf24, 'text-amber-500':  0xf59e0b, 'text-amber-600': 0xd97706,
  'text-yellow-300': 0xfde047, 'text-yellow-400': 0xfacc15, 'text-yellow-500': 0xeab308,
  'text-lime-400':   0xa3e635, 'text-lime-500':   0x84cc16,
  'text-green-300':  0x86efac, 'text-green-400':  0x4ade80, 'text-green-500':  0x22c55e,
  'text-emerald-400': 0x34d399, 'text-emerald-500': 0x10b981,
  'text-teal-300':   0x5eead4, 'text-teal-400':   0x2dd4bf, 'text-teal-500':   0x14b8a6,
  'text-cyan-300':   0x67e8f9, 'text-cyan-400':   0x22d3ee, 'text-cyan-500':   0x06b6d4,
  'text-sky-400':    0x38bdf8, 'text-sky-500':    0x0ea5e9,
  'text-gray-300':   0xd1d5db, 'text-gray-400':   0x9ca3af, 'text-gray-500':   0x6b7280,
  'text-slate-300':  0xcbd5e1, 'text-slate-400':  0x94a3b8,
  'text-stone-300':  0xd6d3d1, 'text-stone-400':  0xa8a29e,
  'text-white':      0xffffff,
};

export const PixiInstrumentPanel: React.FC<PixiInstrumentPanelProps> = ({ width, height }) => {
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentId   = useInstrumentStore((s) => s.currentInstrumentId);
  const select      = useInstrumentStore((s) => s.setCurrentInstrument);

  const items = useMemo<ScrollListItem[]>(() => {
    const sorted = [...instruments].sort((a, b) => a.id - b.id);
    return sorted.map((inst, idx) => {
      const synthInfo = getSynthInfo(inst.synthType);
      const dotColor = TAILWIND_HEX[synthInfo?.color ?? ''] ?? 0x888888;
      const displayNum = String(idx + 1).padStart(2, '0');
      return {
        id: String(inst.id),
        label: `${displayNum} ${inst.name || `Instrument ${inst.id}`}`,
        sublabel: inst.metadata?.displayType || synthInfo?.shortName || inst.synthType,
        dotColor,
      };
    });
  }, [instruments]);

  const handleSelect = useCallback((id: string) => {
    select(Number(id));
  }, [select]);

  return (
    <ScrollList
      items={items}
      selectedId={currentId !== null ? String(currentId) : null}
      onSelect={handleSelect}
      height={height}
      width={width}
    />
  );
};
