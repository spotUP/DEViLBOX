/**
 * PixiCollaborationSplitView — Layout for collab mode, driven by listenMode.
 *
 * shared  → both panels, navigation synced (Google Docs style)
 * both    → two full views side by side: YOUR pattern left, friend's right
 * mine    → only your editor (full width)
 * theirs  → only friend's view (full width, read-only)
 */

import React from 'react';
import { PixiLabel } from '../../components';
import { usePixiTheme } from '../../theme';
import { usePixiResponsive } from '../../hooks/usePixiResponsive';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useTransportStore } from '@stores/useTransportStore';
import { PixiRemotePatternView } from './PixiRemotePatternView';
import { PixiLocalPatternView } from './PixiLocalPatternView';

const TOOLBAR_HEIGHT = 32;
const DIVIDER_WIDTH = 2;

export const PixiCollaborationSplitView: React.FC = () => {
  const theme = usePixiTheme();
  const status = useCollaborationStore(s => s.status);
  const listenMode = useCollaborationStore(s => s.listenMode);
  const { width, height } = usePixiResponsive();
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);

  const visible = status === 'connected' && (listenMode === 'both' || listenMode === 'theirs');

  if (!visible) return null;

  const availableHeight = height - TOOLBAR_HEIGHT;

  if (listenMode === 'theirs') {
    return (
      <pixiContainer
        layout={{
          position: 'absolute',
          top: TOOLBAR_HEIGHT,
          left: 0,
          width,
          height: availableHeight,
        }}
      >
        <PixiRemotePatternView width={width} height={availableHeight} />
      </pixiContainer>
    );
  }

  // listenMode === 'both' — side-by-side: YOUR view left, friend's right
  const halfWidth = Math.floor((width - DIVIDER_WIDTH) / 2);

  return (
    <pixiContainer
      layout={{
        position: 'absolute',
        top: TOOLBAR_HEIGHT,
        left: 0,
        width,
        height: availableHeight,
        flexDirection: 'row',
      }}
    >
      {/* Left: Your pattern view */}
      <layoutContainer layout={{ width: halfWidth, height: availableHeight, flexDirection: 'column' }}>
        <layoutContainer
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            height: 20,
            paddingLeft: 8,
            backgroundColor: theme.bgSecondary.color,
          }}
        >
          <PixiLabel text="Your View" size="xs" weight="bold" color="accent" />
        </layoutContainer>
        <PixiLocalPatternView
          width={halfWidth}
          height={availableHeight - 20}
          isPlaying={isPlaying}
          currentRow={currentRow}
        />
      </layoutContainer>

      {/* Divider */}
      <pixiGraphics
        draw={(g) => { g.clear(); g.rect(0, 0, DIVIDER_WIDTH, availableHeight).fill(0x444444); }}
        layout={{ width: DIVIDER_WIDTH, height: availableHeight }}
      />

      {/* Right: Friend's pattern view */}
      <layoutContainer layout={{ width: halfWidth, height: availableHeight, flexDirection: 'column' }}>
        <layoutContainer
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            height: 20,
            paddingLeft: 8,
            backgroundColor: theme.bgSecondary.color,
          }}
        >
          <PixiLabel text="Friend's View" size="xs" weight="bold" color="accent" />
        </layoutContainer>
        <PixiRemotePatternView width={halfWidth} height={availableHeight - 20} />
      </layoutContainer>
    </pixiContainer>
  );
};
