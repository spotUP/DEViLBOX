/**
 * PixiDJSetBrowser — Nav bar button that opens a dropdown menu listing saved DJ sets.
 *
 * Clicking a set starts playback; clicking the currently-playing set stops it.
 * Disabled while recording is in progress.
 */

import React, { useCallback, useRef } from 'react';
import type { Container as ContainerType } from 'pixi.js';
import { PixiButton } from '../../components/PixiButton';
import { useDJSetStore } from '@stores/useDJSetStore';
import { usePixiDropdownStore } from '../../stores/usePixiDropdownStore';
import type { MenuItem } from '../../components/PixiMenuBar';

const DROPDOWN_ID = 'nav-dj-sets';
const NAV_ROW_H = 52;

export const PixiDJSetBrowser: React.FC = () => {
  const containerRef = useRef<ContainerType>(null);

  const isRecording = useDJSetStore((s) => s.isRecording);
  const isPlayingSet = useDJSetStore((s) => s.isPlayingSet);
  const total = useDJSetStore((s) => s.total);

  const handleClick = useCallback(async () => {
    if (isRecording) return;

    const el = containerRef.current;
    if (!el) return;

    // Fetch latest sets before opening
    await useDJSetStore.getState().fetchSets({ limit: 20 });

    const pos = el.toGlobal({ x: 0, y: NAV_ROW_H });
    const currentList = useDJSetStore.getState().setList;
    const currentTotal = useDJSetStore.getState().total;
    const playingId = useDJSetStore.getState().currentSetId;
    const playing = useDJSetStore.getState().isPlayingSet;

    const items: MenuItem[] = [];

    if (currentList.length === 0) {
      items.push({
        type: 'action',
        label: 'No saved sets',
        onClick: () => {},
        disabled: true,
      });
    } else {
      // Header
      items.push({
        type: 'action',
        label: `DJ SETS (${currentTotal})`,
        onClick: () => {},
        disabled: true,
      });
      items.push({ type: 'separator' });

      for (const s of currentList) {
        const isActive = playing && playingId === s.id;
        const durationSec = Math.round(s.durationMs / 1000);
        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        const dur = `${mins}:${String(secs).padStart(2, '0')}`;
        const prefix = isActive ? '>> ' : '';
        const label = `${prefix}${s.name} (${dur})`;

        items.push({
          type: 'action',
          label,
          onClick: () => {
            if (isActive) {
              useDJSetStore.getState().stopSetPlayback();
            } else {
              useDJSetStore.getState().playSet(s.id);
            }
          },
        });
      }
    }

    requestAnimationFrame(() => {
      usePixiDropdownStore.getState().openDropdown({
        kind: 'menu',
        id: DROPDOWN_ID,
        x: pos.x,
        y: pos.y,
        width: 260,
        items,
        onClose: () => usePixiDropdownStore.getState().closeDropdown(DROPDOWN_ID),
      });
    });
  }, [isRecording]);

  const label = isPlayingSet
    ? 'SETS >>'
    : total > 0
      ? `SETS (${total})`
      : 'SETS';

  return (
    <pixiContainer ref={containerRef} layout={{ flexShrink: 0 }}>
      <PixiButton
        label={label}
        variant={isPlayingSet ? 'ft2' : 'ghost'}
        size="sm"
        disabled={isRecording}
        active={isPlayingSet}
        onClick={handleClick}
        width={56}
      />
    </pixiContainer>
  );
};
