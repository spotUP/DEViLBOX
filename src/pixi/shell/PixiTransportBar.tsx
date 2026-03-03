/**
 * PixiTransportBar — Transport controls for the modern NavBar center zone.
 * Play/stop/record, BPM, position, loop toggle, metronome.
 */

import React, { useCallback, useRef } from 'react';
import { useTick } from '@pixi/react';
import { isRapidScrolling } from '../scrollPerf';
import type { Graphics as GraphicsType, BitmapText as BitmapTextType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { useTransportStore } from '@stores/useTransportStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { PixiButton } from '../components/PixiButton';

interface PixiTransportBarProps {
  width: number;
  height: number;
}

export const PixiTransportBar: React.FC<PixiTransportBarProps> = ({ width, height }) => {
  const theme = usePixiTheme();

  const isPlaying = useTransportStore((s) => s.isPlaying);
  const isLooping = useTransportStore((s) => s.isLooping);
  const bpm = useTransportStore((s) => s.bpm);
  const metronomeEnabled = useTransportStore((s) => s.metronomeEnabled);
  const stop = useTransportStore((s) => s.stop);
  const togglePlayPause = useTransportStore((s) => s.togglePlayPause);
  const setIsLooping = useTransportStore((s) => s.setIsLooping);
  const toggleMetronome = useTransportStore((s) => s.toggleMetronome);

  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);

  // Imperative position text — updated every frame, no React re-render
  const posTextRef = useRef<BitmapTextType | null>(null);

  useTick(() => {
    if (isRapidScrolling()) return;
    if (!posTextRef.current) return;
    const row = useTransportStore.getState().currentRow;
    const posText = `${String(currentPatternIndex).padStart(2, '0')}:${String(row).padStart(3, '0')}`;
    if (posTextRef.current.text !== posText) posTextRef.current.text = posText;
  });

  const handlePlay = useCallback(() => { togglePlayPause(); }, [togglePlayPause]);
  const handleStop = useCallback(() => { stop(); }, [stop]);
  const handleLoop = useCallback(() => { setIsLooping(!isLooping); }, [setIsLooping, isLooping]);

  // BPM display background
  const drawBpmBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, 64, 28, 4);
    g.fill({ color: theme.bg.color });
    g.roundRect(0, 0, 64, 28, 4);
    g.stroke({ color: theme.border.color, alpha: 0.5, width: 1 });
  }, [theme]);

  // Position display background
  const drawPosBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, 72, 28, 4);
    g.fill({ color: theme.bg.color });
    g.roundRect(0, 0, 72, 28, 4);
    g.stroke({ color: theme.border.color, alpha: 0.5, width: 1 });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width,
        height,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {/* Stop */}
      <PixiButton
        label={'\u25A0'}
        variant="ghost"
        size="sm"
        onClick={handleStop}
        width={32}
      />

      {/* Play/Pause */}
      <PixiButton
        label={isPlaying ? '\u275A\u275A' : '\u25B6'}
        variant={isPlaying ? 'primary' : 'default'}
        size="sm"
        onClick={handlePlay}
        width={32}
      />

      {/* Separator */}
      <pixiContainer layout={{ width: 8 }} />

      {/* BPM display */}
      <pixiContainer layout={{ width: 64, height: 28, justifyContent: 'center', alignItems: 'center' }}>
        <pixiGraphics draw={drawBpmBg} layout={{ position: 'absolute', width: 64, height: 28 }} />
        <pixiBitmapText
          text={String(Math.round(bpm))}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 13, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{}}
        />
      </pixiContainer>
      <pixiBitmapText
        text="BPM"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ alignSelf: 'center', marginRight: 4 }}
      />

      {/* Position display */}
      <pixiContainer layout={{ width: 72, height: 28, justifyContent: 'center', alignItems: 'center' }}>
        <pixiGraphics draw={drawPosBg} layout={{ position: 'absolute', width: 72, height: 28 }} />
        <pixiBitmapText
          ref={posTextRef as any}
          text="00:000"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 13, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
      </pixiContainer>

      {/* Separator */}
      <pixiContainer layout={{ width: 8 }} />

      {/* Loop toggle */}
      <PixiButton
        label="LOOP"
        variant="ft2"
        size="sm"
        active={isLooping}
        onClick={handleLoop}
        width={48}
      />

      {/* Metronome toggle */}
      <PixiButton
        label="MET"
        variant="ft2"
        size="sm"
        active={metronomeEnabled}
        onClick={toggleMetronome}
        width={40}
      />
    </pixiContainer>
  );
};
