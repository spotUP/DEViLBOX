/**
 * PixiDeckScopes — Native GL per-channel waveform oscilloscope display + mute toggles.
 *
 * 4 per-channel scopes + 1 combined "ALL" scope, horizontally stacked.
 * Click a scope to mute/unmute. Shift+click to solo. Click ALL to enable all.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { usePixiTheme } from '@/pixi/theme';
import { useDJStore } from '@/stores/useDJStore';
import { useDeckVisualizationData } from '@/hooks/dj/useDeckVisualizationData';

const NUM_CHANNELS = 4;

interface Props {
  deckId: 'A' | 'B' | 'C';
  size?: number;
  layout?: Record<string, unknown>;
}

const ScopeBox: React.FC<{
  deckId: 'A' | 'B' | 'C';
  channel: number; // 0-3 or -1 for ALL
  size: number;
  muted: boolean;
  onClick: (e: FederatedPointerEvent) => void;
}> = ({ deckId, channel, size, muted, onClick }) => {
  const theme = usePixiTheme();
  const viz = useDeckVisualizationData(deckId);
  const graphicsRef = useRef<GraphicsType | null>(null);
  const rafRef = useRef(0);
  const isAll = channel === -1;

  useEffect(() => {
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) { rafRef.current = requestAnimationFrame(draw); return; }
      g.clear();

      // Background
      g.rect(0, 0, size, size).fill({ color: theme.bg.color, alpha: 0.8 });
      // Border
      g.rect(0, 0, size, size).stroke({ color: muted ? theme.error.color : theme.border.color, alpha: muted ? 0.6 : 0.3, width: muted ? 1 : 0.5 });
      // Center line
      const midY = size / 2;
      g.moveTo(1, midY).lineTo(size - 1, midY).stroke({ color: theme.border.color, alpha: 0.3, width: 0.5 });

      // Muted overlay
      if (muted && !isAll) {
        g.rect(0, 0, size, size).fill({ color: theme.error.color, alpha: 0.08 });
      }

      // Waveform — read from shared visualization cache
      const isPlaying = useDJStore.getState().decks[deckId]?.isPlaying ?? false;

      if (isPlaying) {
        const waveColor = muted ? theme.textMuted.color : theme.success.color;
        const waveAlpha = muted ? 0.3 : 1;

        if (isAll) {
          const waveform = viz.getWaveform();
          if (waveform && waveform.length >= 256) {
            g.moveTo(1, midY - (waveform[0] || 0) * (size / 2 - 2));
            for (let i = 1; i < 256; i++) {
              const x = 1 + (i / 255) * (size - 2);
              const y = midY - (waveform[i] || 0) * (size / 2 - 2);
              g.lineTo(x, y);
            }
            g.stroke({ color: waveColor, alpha: waveAlpha, width: 1 });
          }
        } else {
          const channelWaveforms = viz.getChannelWaveforms();
          const chData = channelWaveforms?.[channel];
          if (chData && chData.length > 0) {
            const len = chData.length;
            g.moveTo(1, midY - (chData[0] || 0) * (size / 2 - 2));
            for (let i = 1; i < len; i++) {
              const x = 1 + (i / (len - 1)) * (size - 2);
              const y = midY - (chData[i] || 0) * (size / 2 - 2);
              g.lineTo(x, y);
            }
            g.stroke({ color: waveColor, alpha: waveAlpha, width: 1 });
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deckId, channel, size, muted, isAll, theme]);

  return (
    <pixiContainer
      layout={{ width: size, height: size }}
      eventMode="static"
      cursor="pointer"
      onPointerUp={onClick}
    >
      <pixiGraphics ref={graphicsRef} draw={() => {}} />
      <pixiBitmapText
        text={isAll ? 'ALL' : `CH${channel + 1}`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={muted ? theme.error.color : theme.textMuted.color}
        alpha={muted ? 0.8 : 0.5}
        layout={{ position: 'absolute', left: 3, top: 2 }}
      />
    </pixiContainer>
  );
};

export const PixiDeckScopes: React.FC<Props> = ({ deckId, size = 48, layout: layoutProp }) => {
  const channelMask = useDJStore((s) => s.decks[deckId].channelMask);

  const isEnabled = useCallback((i: number) => (channelMask & (1 << i)) !== 0, [channelMask]);

  const handleChannelClick = useCallback((channelIndex: number, e: FederatedPointerEvent) => {
    const store = useDJStore.getState();
    if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.shiftKey) {
      store.setAllDeckChannels(deckId, false);
      store.toggleDeckChannel(deckId, channelIndex);
    } else {
      store.toggleDeckChannel(deckId, channelIndex);
    }
  }, [deckId]);

  const handleAllClick = useCallback(() => {
    useDJStore.getState().setAllDeckChannels(deckId, true);
  }, [deckId]);

  return (
    <pixiContainer layout={layoutProp ?? { flexDirection: 'row', gap: 2, paddingLeft: 2, paddingTop: 2 }}>
      {Array.from({ length: NUM_CHANNELS }, (_, i) => (
        <ScopeBox key={i} deckId={deckId} channel={i} size={size} muted={!isEnabled(i)} onClick={(e) => handleChannelClick(i, e)} />
      ))}
      <ScopeBox deckId={deckId} channel={-1} size={size} muted={false} onClick={handleAllClick} />
    </pixiContainer>
  );
};
