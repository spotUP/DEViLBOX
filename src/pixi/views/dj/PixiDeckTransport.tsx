/**
 * PixiDeckTransport — Play/Cue/Sync buttons for a DJ deck.
 * Uses Lucide icon textures matching the DOM version's Lucide icons.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { Texture } from 'pixi.js';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { useDJStore } from '@/stores/useDJStore';
import { ICON_PLAY, ICON_PAUSE, ICON_DISC_3, ICON_LINK } from '../../utils/lucideIcons';
import { getLucideTexture, preloadLucideIcons } from '../../utils/lucideToTexture';
import * as DJActions from '@/engine/dj/DJActions';

interface PixiDeckTransportProps {
  deckId: 'A' | 'B' | 'C';
}

const BTN_SIZE = 40;
const ICON_SIZE = 20;

// Preload transport icons once
let _transportIconsPreloaded = false;
function ensureTransportIconsPreloaded(): void {
  if (_transportIconsPreloaded) return;
  _transportIconsPreloaded = true;
  preloadLucideIcons([
    { name: 'transport-play', iconNode: ICON_PLAY, size: ICON_SIZE, color: 0xffffff },
    { name: 'transport-pause', iconNode: ICON_PAUSE, size: ICON_SIZE, color: 0xffffff },
    { name: 'transport-disc3', iconNode: ICON_DISC_3, size: ICON_SIZE, color: 0xffffff },
    { name: 'transport-link', iconNode: ICON_LINK, size: ICON_SIZE, color: 0xffffff },
  ]);
}

export const PixiDeckTransport: React.FC<PixiDeckTransportProps> = ({ deckId }) => {
  const theme = usePixiTheme();
  const isPlaying = useDJStore(s => s.decks[deckId].isPlaying);
  const cuePoint = useDJStore(s => s.decks[deckId].cuePoint);
  const otherDeckId = deckId === 'A' ? 'B' : 'A';
  const thisBPM = useDJStore(s => s.decks[deckId].effectiveBPM);
  const otherBPM = useDJStore(s => s.decks[otherDeckId].effectiveBPM);
  const isSynced = Math.abs(thisBPM - otherBPM) < 0.5;

  useEffect(() => { ensureTransportIconsPreloaded(); }, []);

  const handlePlayPause = useCallback(async () => {
    await DJActions.togglePlay(deckId);
  }, [deckId]);

  const handleCue = useCallback(() => {
    DJActions.cueDeck(deckId, cuePoint);
  }, [deckId, cuePoint]);

  const handleSync = useCallback(() => {
    DJActions.syncDeckBPM(deckId, otherDeckId);
  }, [deckId, otherDeckId]);

  const playTex = useMemo(() => getLucideTexture(
    isPlaying ? 'transport-pause' : 'transport-play',
    isPlaying ? ICON_PAUSE : ICON_PLAY,
    ICON_SIZE, 0xffffff,
  ), [isPlaying]);

  const cueTex = useMemo(() => getLucideTexture('transport-disc3', ICON_DISC_3, ICON_SIZE, 0xffffff), []);
  const syncTex = useMemo(() => getLucideTexture('transport-link', ICON_LINK, ICON_SIZE, 0xffffff), []);

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {/* Play/Pause */}
      <PixiTransportButton
        iconTexture={playTex}
        color={isPlaying ? theme.success.color : theme.textMuted.color}
        isActive={isPlaying}
        onClick={handlePlayPause}
      />

      {/* Cue */}
      <PixiTransportButton
        iconTexture={cueTex}
        color={theme.warning.color}
        onClick={handleCue}
      />

      {/* Sync */}
      <PixiTransportButton
        iconTexture={syncTex}
        color={isSynced ? theme.success.color : theme.accent.color}
        isActive={isSynced}
        onClick={handleSync}
      />
    </pixiContainer>
  );
};

// --- Transport Button ---

interface TransportBtnProps {
  iconTexture: Texture;
  color: number;
  isActive?: boolean;
  onClick: () => void;
}

const PixiTransportButton: React.FC<TransportBtnProps> = ({ iconTexture, color, isActive, onClick }) => {
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
      <pixiSprite
        texture={iconTexture}
        width={ICON_SIZE}
        height={ICON_SIZE}
        tint={isActive ? color : theme.textMuted.color}
        eventMode="none"
        layout={{}}
      />
    </pixiContainer>
  );
};
