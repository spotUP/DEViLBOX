/**
 * PixiDeckTransport — Play/Cue/Sync buttons for a DJ deck.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useDJStore } from '@/stores/useDJStore';

interface PixiDeckTransportProps {
  deckId: 'A' | 'B';
}

const BTN_SIZE = 36;

export const PixiDeckTransport: React.FC<PixiDeckTransportProps> = ({ deckId }) => {
  const theme = usePixiTheme();
  const isPlaying = useDJStore(s => s.decks[deckId].isPlaying);

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {/* Play/Pause */}
      <PixiTransportButton
        label={isPlaying ? 'PAUSE' : 'PLAY'}
        color={isPlaying ? theme.success.color : theme.textMuted.color}
        isActive={isPlaying}
        onClick={() => {}} // Placeholder — engine play/pause wiring
      />

      {/* Cue */}
      <PixiTransportButton
        label="CUE"
        color={theme.warning.color}
        onClick={() => {}} // Placeholder — engine cue wiring
      />

      {/* Sync */}
      <PixiTransportButton
        label="SYNC"
        color={theme.accent.color}
        onClick={() => {}} // Placeholder — sync wiring
      />
    </pixiContainer>
  );
};

// ─── Transport Button ───────────────────────────────────────────────────────

interface TransportBtnProps {
  label: string;
  color: number;
  isActive?: boolean;
  onClick: () => void;
}

const PixiTransportButton: React.FC<TransportBtnProps> = ({ label, color, isActive, onClick }) => {
  const theme = usePixiTheme();

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6);
    if (isActive) {
      g.fill({ color, alpha: 0.2 });
      g.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6);
      g.stroke({ color, alpha: 0.6, width: 1 });
    } else {
      g.fill({ color: theme.bgTertiary.color });
      g.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6);
      g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });
    }
  }, [color, isActive, theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={onClick}
      layout={{
        width: BTN_SIZE,
        height: BTN_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: BTN_SIZE, height: BTN_SIZE }} />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
        tint={isActive ? color : theme.textMuted.color}
        layout={{}}
      />
    </pixiContainer>
  );
};
