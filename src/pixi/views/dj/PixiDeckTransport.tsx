/**
 * PixiDeckTransport — Play/Cue/Sync buttons for a DJ deck.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { DJBeatSync } from '@/engine/dj/DJBeatSync';

interface PixiDeckTransportProps {
  deckId: 'A' | 'B' | 'C';
}

const BTN_SIZE = 36;

export const PixiDeckTransport: React.FC<PixiDeckTransportProps> = ({ deckId }) => {
  const theme = usePixiTheme();
  const isPlaying = useDJStore(s => s.decks[deckId].isPlaying);
  const cuePoint = useDJStore(s => s.decks[deckId].cuePoint);
  const otherDeckId = deckId === 'A' ? 'B' : 'A';
  const thisBPM = useDJStore(s => s.decks[deckId].effectiveBPM);
  const otherBPM = useDJStore(s => s.decks[otherDeckId].effectiveBPM);
  const isSynced = Math.abs(thisBPM - otherBPM) < 0.5;

  const handlePlayPause = useCallback(async () => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    if (isPlaying) {
      deck.pause();
      useDJStore.getState().setDeckPlaying(deckId, false);
    } else {
      await deck.play();
      useDJStore.getState().setDeckPlaying(deckId, true);
    }
  }, [deckId, isPlaying]);

  const handleCue = useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    deck.cue(cuePoint);
  }, [deckId, cuePoint]);

  const handleSync = useCallback(() => {
    try {
      const engine = getDJEngine();
      const thisDeck = engine.getDeck(deckId);
      const otherDeck = engine.getDeck(otherDeckId);
      const otherState = useDJStore.getState().decks[otherDeckId];

      if (!otherState.fileName) return;

      if (otherDeck.playbackMode === 'audio' || thisDeck.playbackMode === 'audio') {
        const targetBPM = otherState.detectedBPM;
        const thisBPMBase = useDJStore.getState().decks[deckId].detectedBPM;
        if (targetBPM > 0 && thisBPMBase > 0) {
          const ratio = targetBPM / thisBPMBase;
          const semitones = 12 * Math.log2(ratio);
          useDJStore.getState().setDeckPitch(deckId, semitones);
        }
      } else {
        if (!otherDeck.replayer.getSong()) return;
        const semitones = DJBeatSync.syncBPM(otherDeck, thisDeck);
        useDJStore.getState().setDeckPitch(deckId, semitones);
      }
    } catch {
      // Engine might not be initialized yet
    }
  }, [deckId, otherDeckId]);

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {/* Play/Pause */}
      <PixiTransportButton
        label={isPlaying ? 'PAUSE' : 'PLAY'}
        color={isPlaying ? theme.success.color : theme.textMuted.color}
        isActive={isPlaying}
        onClick={handlePlayPause}
      />

      {/* Cue */}
      <PixiTransportButton
        label="CUE"
        color={theme.warning.color}
        onClick={handleCue}
      />

      {/* Sync */}
      <PixiTransportButton
        label={isSynced ? 'SYNC' : 'SYNC'}
        color={isSynced ? theme.success.color : theme.accent.color}
        isActive={isSynced}
        onClick={handleSync}
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
