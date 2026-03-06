/**
 * SIDTransportBar — Enhanced transport controls for SID playback.
 * Play/pause, stop, fast-forward, loop, subtune nav, time display, volume.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTick } from '@pixi/react';
import type { BitmapText as BitmapTextType, Graphics as GraphicsType } from 'pixi.js';
import { PixiButton, PixiSlider } from '../../components';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { useFormatStore } from '@stores/useFormatStore';
import { useAudioStore } from '@stores/useAudioStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { isRapidScrolling } from '../../scrollPerf';

interface SIDTransportBarProps {
  width: number;
  height?: number;
}

/** Format seconds as MM:SS */
function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const SIDTransportBar: React.FC<SIDTransportBarProps> = ({ width, height = 40 }) => {
  const theme = usePixiTheme();

  // --- Store state ---
  const sidMeta = useFormatStore((s) => s.sidMetadata);
  const masterVolume = useAudioStore((s) => s.masterVolume);
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume);

  // --- Local state ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [currentSub, setCurrentSub] = useState(sidMeta?.currentSubsong ?? 0);
  const [fastFwd, setFastFwd] = useState(false);

  // Refs for imperative time display
  const timeRef = useRef<BitmapTextType | null>(null);
  const scrubRef = useRef<GraphicsType | null>(null);
  const playStartRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  const subsongs = sidMeta?.subsongs ?? 1;

  // Sync currentSub when sidMetadata changes externally
  useEffect(() => {
    if (sidMeta) setCurrentSub(sidMeta.currentSubsong);
  }, [sidMeta?.currentSubsong]);

  // Helper: get engine (may be null)
  const getEngine = useCallback(() => {
    try {
      return getTrackerReplayer().getC64SIDEngine();
    } catch {
      return null;
    }
  }, []);

  // --- Transport handlers ---
  const handlePlayPause = useCallback(() => {
    const engine = getEngine();
    if (!engine) return;
    if (engine.isPlaying()) {
      engine.pause();
      setIsPlaying(false);
    } else {
      // Resume or start
      if (elapsedRef.current > 0) {
        engine.resume();
      } else {
        engine.play().catch(() => {});
        playStartRef.current = performance.now();
      }
      setIsPlaying(true);
    }
  }, [getEngine]);

  const handleStop = useCallback(() => {
    const engine = getEngine();
    if (engine) engine.stop();
    setIsPlaying(false);
    elapsedRef.current = 0;
    playStartRef.current = 0;
    setFastFwd(false);
  }, [getEngine]);

  const handleFastFwd = useCallback(() => {
    setFastFwd((prev) => !prev);
    // Fast-forward is visual-only; engine doesn't expose setSpeed at C64SIDEngine level
  }, []);

  const handleLoop = useCallback(() => {
    setLoopEnabled((prev) => !prev);
  }, []);

  const handlePrevSub = useCallback(() => {
    const engine = getEngine();
    if (!engine || subsongs <= 1) return;
    const next = currentSub > 0 ? currentSub - 1 : subsongs - 1;
    engine.setSubsong(next);
    setCurrentSub(next);
    elapsedRef.current = 0;
    playStartRef.current = performance.now();
  }, [getEngine, currentSub, subsongs]);

  const handleNextSub = useCallback(() => {
    const engine = getEngine();
    if (!engine || subsongs <= 1) return;
    const next = currentSub < subsongs - 1 ? currentSub + 1 : 0;
    engine.setSubsong(next);
    setCurrentSub(next);
    elapsedRef.current = 0;
    playStartRef.current = performance.now();
  }, [getEngine, currentSub, subsongs]);

  // Volume: store uses dB (-60..0), slider uses 0..1
  const volumeNorm = Math.pow(10, masterVolume / 60); // dB to linear approx
  const handleVolume = useCallback((v: number) => {
    const db = v > 0.001 ? 60 * Math.log10(v) : -60;
    setMasterVolume(db);
  }, [setMasterVolume]);

  // --- Imperative time update via useTick ---
  useTick(() => {
    if (isRapidScrolling()) return;
    if (!isPlaying || !playStartRef.current) return;
    const now = performance.now();
    elapsedRef.current = (now - playStartRef.current) / 1000;
    const txt = fmtTime(elapsedRef.current);
    if (timeRef.current && timeRef.current.text !== txt) {
      timeRef.current.text = txt;
    }
    // Scrub bar: simple elapsed indicator (no total duration from engine)
    if (scrubRef.current) {
      const barW = Math.max(0, width * 0.18);
      const maxSec = 300; // 5 min cap for visual progress
      const pct = Math.min(elapsedRef.current / maxSec, 1);
      const g = scrubRef.current;
      g.clear();
      g.roundRect(0, 0, barW, 6, 3);
      g.fill({ color: theme.bgTertiary.color });
      if (pct > 0) {
        g.roundRect(0, 0, Math.max(4, barW * pct), 6, 3);
        g.fill({ color: theme.accent.color, alpha: 0.8 });
      }
    }
  });

  // --- Layout sizes ---
  const btnW = 28;
  const btnH = 28;
  const sepW = 1;
  const volSliderW = Math.max(50, width * 0.1);
  const scrubW = Math.max(60, width * 0.18);

  return (
    <layoutContainer
      layout={{
        width,
        height,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingLeft: 8,
        paddingRight: 8,
        backgroundColor: theme.bgSecondary.color,
        borderRadius: 4,
      }}
    >
      {/* Transport buttons */}
      <PixiButton icon="prev" label="" variant="ghost" size="sm" onClick={handlePrevSub} width={btnW} height={btnH} />
      <PixiButton
        icon={isPlaying ? 'pause' : 'play'}
        label=""
        variant={isPlaying ? 'primary' : 'ghost'}
        size="sm"
        onClick={handlePlayPause}
        width={btnW}
        height={btnH}
      />
      <PixiButton icon="stop" label="" variant="ghost" size="sm" onClick={handleStop} width={btnW} height={btnH} />
      <PixiButton
        icon="forward"
        label=""
        variant="ghost"
        size="sm"
        active={fastFwd}
        onClick={handleFastFwd}
        width={btnW}
        height={btnH}
      />
      <PixiButton icon="next" label="" variant="ghost" size="sm" onClick={handleNextSub} width={btnW} height={btnH} />

      {/* Separator */}
      <layoutContainer alpha={0.3} layout={{ width: sepW, height: 24, alignSelf: 'center', marginLeft: 2, marginRight: 2, backgroundColor: theme.border.color }} />

      {/* Loop toggle */}
      <PixiButton
        icon="loop"
        label=""
        variant="ghost"
        size="sm"
        active={loopEnabled}
        onClick={handleLoop}
        width={btnW}
        height={btnH}
      />

      {/* Separator */}
      <layoutContainer alpha={0.3} layout={{ width: sepW, height: 24, alignSelf: 'center', marginLeft: 2, marginRight: 2, backgroundColor: theme.border.color }} />

      {/* Subtune selector */}
      {subsongs > 1 && (
        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <PixiButton label="<" variant="ghost" size="sm" onClick={handlePrevSub} width={20} height={btnH} />
          <layoutContainer
            layout={{
              width: 48,
              height: 22,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: theme.bg.color,
              borderRadius: 3,
              borderWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            <pixiBitmapText
              text={`${currentSub + 1}/${subsongs}`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{}}
            />
          </layoutContainer>
          <PixiButton label=">" variant="ghost" size="sm" onClick={handleNextSub} width={20} height={btnH} />
        </layoutContainer>
      )}

      {/* Separator */}
      <layoutContainer alpha={0.3} layout={{ width: sepW, height: 24, alignSelf: 'center', marginLeft: 2, marginRight: 2, backgroundColor: theme.border.color }} />

      {/* Scrub bar + time */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <pixiGraphics ref={scrubRef as any} draw={() => {}} layout={{ width: scrubW, height: 6, alignSelf: 'center' }} />
        <pixiBitmapText
          ref={timeRef as any}
          text="0:00"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
          tint={theme.textSecondary.color}
          layout={{}}
        />
      </layoutContainer>

      {/* Spacer */}
      <layoutContainer layout={{ flex: 1 }} />

      {/* Volume */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <pixiBitmapText
          text="Vol"
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <PixiSlider
          value={volumeNorm}
          min={0}
          max={1}
          step={0.01}
          onChange={handleVolume}
          orientation="horizontal"
          length={volSliderW}
          thickness={4}
          handleWidth={10}
          handleHeight={16}
          layout={{ alignSelf: 'center' }}
        />
      </layoutContainer>
    </layoutContainer>
  );
};
