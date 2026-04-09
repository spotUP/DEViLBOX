/**
 * UADESubsongSelector — subsong dropdown for UADE-editable native-parsed formats
 * (e.g. Steve Turner .jpo) where the native parser decoded multiple subsongs.
 *
 * Switching subsong:
 *  1. Updates the pattern order to point at the new subsong's pattern
 *  2. Updates the transport speed from that subsong's speed byte
 *  3. Tells UADEEngine to jump to the new subsong
 */

import React, { useCallback } from 'react';
import { useFormatStore, useTransportStore, useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { Music2 } from 'lucide-react';
import { notify } from '@stores/useNotificationStore';
import { CustomSelect } from '@components/common/CustomSelect';

export const UADESubsongSelector: React.FC = React.memo(() => {
  const { uadeEditableSubsongs, uadeEditableCurrentSubsong } = useFormatStore(
    useShallow((state) => ({
      uadeEditableSubsongs: state.uadeEditableSubsongs,
      uadeEditableCurrentSubsong: state.uadeEditableCurrentSubsong,
    }))
  );

  const setPatternOrder = useTrackerStore((state) => state.setPatternOrder);
  const setCurrentPattern = useTrackerStore((state) => state.setCurrentPattern);
  const setSpeed = useTransportStore((state) => state.setSpeed);

  const handleSubsongChange = useCallback(
    async (newIdx: number) => {
      if (!uadeEditableSubsongs || newIdx === uadeEditableCurrentSubsong) return;

      // Update store, pattern view, and transport
      useFormatStore.setState({ uadeEditableCurrentSubsong: newIdx });
      setPatternOrder([newIdx]);
      setCurrentPattern(newIdx);
      setSpeed(uadeEditableSubsongs.speeds[newIdx] ?? 6);

      // Switch UADE subsong in-place (no full reload — avoids double-init)
      try {
        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        if (UADEEngine.hasInstance()) {
          const engine = UADEEngine.getInstance();
          engine.setSubsong(newIdx);
          engine.play();
        }
      } catch {
        // UADEEngine not loaded yet — will pick up on next play
      }

      notify.success(`Subsong ${newIdx + 1}/${uadeEditableSubsongs.count}`);
    },
    [uadeEditableSubsongs, uadeEditableCurrentSubsong, setPatternOrder, setCurrentPattern, setSpeed]
  );

  if (!uadeEditableSubsongs || uadeEditableSubsongs.count <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-dark-border">
      <Music2 size={14} className="shrink-0 text-accent-primary" />
      <span className="text-[10px] text-text-secondary font-medium">SUBSONG:</span>
      <CustomSelect
        value={String(uadeEditableCurrentSubsong)}
        onChange={(v) => handleSubsongChange(Number(v))}
        options={Array.from({ length: uadeEditableSubsongs.count }, (_, i) => ({
          value: String(i),
          label: `${i + 1}. Subsong ${i + 1}`,
        }))}
        className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer"
        title="Select subsong"
      />
      <span className="text-[10px] text-text-muted">
        ({uadeEditableCurrentSubsong + 1}/{uadeEditableSubsongs.count})
      </span>
    </div>
  );
});

UADESubsongSelector.displayName = 'UADESubsongSelector';
