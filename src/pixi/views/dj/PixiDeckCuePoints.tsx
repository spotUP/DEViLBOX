/**
 * PixiDeckCuePoints — Native GL hot cue button strip (8 slots).
 *
 * - Empty slot + click: set hot cue at current position
 * - Filled slot + click: jump to cue position
 * - Filled slot + Shift+click: delete hot cue
 */

import React, { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { usePixiTheme } from '@/pixi/theme';
import { useDJStore, type HotCue } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

const HOT_CUE_COLORS = [
  0xE91E63, 0xFF9800, 0x2196F3, 0x4CAF50,
  0x9C27B0, 0x00BCD4, 0xFFEB3B, 0xF44336,
];

const CUE_W = 30;
const CUE_H = 20;
const CUE_GAP = 2;

interface Props {
  deckId: 'A' | 'B' | 'C';
  width?: number;
  height?: number;
  layout?: Record<string, unknown>;
}

export const PixiDeckCuePoints: React.FC<Props> = ({ deckId, width = 280, height = 36, layout: layoutProp }) => {
  const theme = usePixiTheme();
  const hotCues = useDJStore((s) => s.decks[deckId].hotCues);
  const seratoCues = useDJStore((s) => s.decks[deckId].seratoCuePoints);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);

  const mergedSlots = useMemo(() => hotCues.map((native, i) => {
    if (native) return { position: native.position, color: HOT_CUE_COLORS[i], name: native.name, isNative: true };
    const serato = seratoCues.find(c => c.index === i);
    if (serato) return { position: serato.position, color: HOT_CUE_COLORS[i], name: serato.name, isNative: false };
    return null;
  }), [hotCues, seratoCues]);

  const hasAnyCues = mergedSlots.some(s => s !== null);

  const handleClick = useCallback((index: number, e: FederatedPointerEvent) => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const store = useDJStore.getState();
      const cue = store.decks[deckId].hotCues[index];

      if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.shiftKey && cue) {
        store.deleteHotCue(deckId, index);
        return;
      }

      if (cue) {
        const seconds = cue.position / 1000;
        if (deck.playbackMode === 'audio') {
          deck.audioPlayer.seek(seconds);
          store.setDeckState(deckId, { audioPosition: seconds, elapsedMs: cue.position });
        } else {
          const state = store.decks[deckId];
          if (state.durationMs > 0 && state.totalPositions > 0) {
            const pos = Math.floor((cue.position / state.durationMs) * state.totalPositions);
            deck.cue(Math.max(0, Math.min(pos, state.totalPositions - 1)), 0);
          }
        }
      } else {
        let positionMs = 0;
        const state = store.decks[deckId];
        if (deck.playbackMode === 'audio') {
          positionMs = deck.audioPlayer.getPosition() * 1000;
        } else {
          positionMs = state.elapsedMs;
        }
        const newCue: HotCue = { position: positionMs, color: `#${HOT_CUE_COLORS[index].toString(16).padStart(6, '0')}`, name: '' };
        store.setHotCue(deckId, index, newCue);
      }
    } catch { /* engine not ready */ }
  }, [deckId]);

  // Hide in tracker mode when no cues
  if (playbackMode !== 'audio' && !hasAnyCues) {
    return <pixiContainer layout={layoutProp ?? { width, height: 0 }} />;
  }

  return (
    <pixiContainer layout={layoutProp ?? { width, height, paddingTop: 4, paddingLeft: 2, flexDirection: 'row', gap: CUE_GAP, alignItems: 'center' }}>
      {mergedSlots.map((cue, i) => {
        const color = HOT_CUE_COLORS[i];
        return (
          <pixiContainer
            key={i}
            layout={{ width: CUE_W, height: CUE_H }}
            eventMode="static"
            cursor="pointer"
            onPointerUp={(e: FederatedPointerEvent) => handleClick(i, e)}
          >
            <pixiGraphics draw={(g: GraphicsType) => {
              g.clear();
              if (cue) {
                g.roundRect(0, 0, CUE_W, CUE_H, 3).fill({ color, alpha: 0.2 });
                g.roundRect(0, 0, CUE_W, CUE_H, 3).stroke({ color, alpha: 0.5, width: 1 });
              } else {
                g.roundRect(0, 0, CUE_W, CUE_H, 3).fill({ color: theme.bgTertiary.color, alpha: 0.05 });
                g.roundRect(0, 0, CUE_W, CUE_H, 3).stroke({ color: theme.border.color, alpha: 0.08, width: 1 });
              }
            }} />
            <pixiBitmapText
              text={cue?.name || String(i + 1)}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
              tint={cue ? color : 0x666666}
              alpha={cue ? 1 : 0.3}
              layout={{ position: 'absolute', left: CUE_W / 2 - 4, top: 4 }}
            />
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};
