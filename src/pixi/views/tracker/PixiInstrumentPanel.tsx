/**
 * PixiInstrumentPanel — GL-native instrument list.
 * Replaces the previous PixiDOMOverlay bridge with a direct ScrollList.
 * Feature parity with the DOM InstrumentList (preset/edit/drag) is deferred.
 */

import React, { useCallback } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { ScrollList } from '../../../ui/components/ScrollList';
import type { ScrollListItem } from '../../../ui/components/ScrollList';

interface PixiInstrumentPanelProps {
  width: number;
  height: number;
}

export const PixiInstrumentPanel: React.FC<PixiInstrumentPanelProps> = ({ width, height }) => {
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentId   = useInstrumentStore((s) => s.currentInstrumentId);
  const select      = useInstrumentStore((s) => s.setCurrentInstrument);

  const items: ScrollListItem[] = instruments.map((inst) => ({
    id: String(inst.id),
    label: inst.name || `Instrument ${inst.id}`,
    sublabel: inst.synthType,
  }));

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
      layout={{ width, height }}
    />
  );
};
