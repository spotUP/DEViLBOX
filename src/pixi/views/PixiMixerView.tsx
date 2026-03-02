// src/pixi/views/PixiMixerView.tsx
// Full GL mixer: 16 channel strips + master, scrollable, live VU meters

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useMixerStore } from '../../stores/useMixerStore';
import { getToneEngine } from '@engine/ToneEngine';
import { PixiMixerChannelStrip } from '../mixer/PixiMixerChannelStrip';
import { PixiLabel } from '../components/PixiLabel';
import { usePixiTheme } from '../theme';
import { useInstrumentStore } from '@stores/useInstrumentStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const NUM_CHANNELS = 16;

// ─── Component ────────────────────────────────────────────────────────────────

export const PixiMixerView: React.FC = () => {
  const theme = usePixiTheme();

  // ── Store subscriptions ───────────────────────────────────────────────────

  const channels       = useMixerStore(s => s.channels);
  const master         = useMixerStore(s => s.master);
  const isSoloing      = useMixerStore(s => s.isSoloing);
  const instruments    = useInstrumentStore(s => s.instruments);
  const setChannelVolume = useMixerStore(s => s.setChannelVolume);
  const setChannelPan    = useMixerStore(s => s.setChannelPan);
  const setMute          = useMixerStore(s => s.setChannelMute);
  const setSolo          = useMixerStore(s => s.setChannelSolo);
  const setMasterVol     = useMixerStore(s => s.setMasterVolume);

  // ── VU meter state ────────────────────────────────────────────────────────

  const [levels, setLevels] = useState<number[]>(() => Array(NUM_CHANNELS).fill(0));
  const [masterLevel, setMasterLevel] = useState(0);
  const mountedRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      if (!mountedRef.current) return;

      try {
        const channelLevels = getToneEngine().getChannelLevels(NUM_CHANNELS);
        setLevels(channelLevels);
        setMasterLevel(Math.max(...channelLevels));
      } catch {
        // Engine not ready — ignore
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // ── channelsRef — avoids stale closures in mute/solo handlers ────────────

  const channelsRef = useRef(channels);
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleMuteToggle = useCallback((ch: number) => {
    setMute(ch, !channelsRef.current[ch].muted);
  }, [setMute]);

  const handleSoloToggle = useCallback((ch: number) => {
    setSolo(ch, !channelsRef.current[ch].soloed);
  }, [setSolo]);

  // ── Divider draw ─────────────────────────────────────────────────────────

  const drawDivider = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 1, 240);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme.border.color, theme.border.alpha]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <pixiContainer
      layout={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      {/* ── CHANNELS section ─────────────────────────────────────────────── */}
      <pixiContainer
        layout={{
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 4,
        }}
      >
        {/* Section header */}
        <PixiLabel
          text="CHANNELS"
          size="xs"
          color="textMuted"
          layout={{ paddingLeft: 4, paddingBottom: 2 }}
        />

        {/* 16 channel strips in a horizontal row */}
        <pixiContainer
          layout={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 2,
          }}
        >
          {channels.map((ch, i) => (
            <PixiMixerChannelStrip
              key={i}
              channelIndex={i}
              name={ch.name}
              instrumentName={instruments[i]?.name ?? ''}
              volume={ch.volume}
              pan={ch.pan}
              muted={ch.muted}
              soloed={ch.soloed}
              level={levels[i] ?? 0}
              isSoloing={isSoloing}
              onVolumeChange={setChannelVolume}
              onPanChange={setChannelPan}
              onMuteToggle={handleMuteToggle}
              onSoloToggle={handleSoloToggle}
            />
          ))}
        </pixiContainer>
      </pixiContainer>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <pixiGraphics
        draw={drawDivider}
        layout={{ width: 1, height: 240, marginTop: 16 }}
      />

      {/* ── MASTER section ───────────────────────────────────────────────── */}
      <pixiContainer
        layout={{
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 4,
        }}
      >
        {/* Section header */}
        <PixiLabel
          text="MASTER"
          size="xs"
          color="textMuted"
          layout={{ paddingLeft: 4, paddingBottom: 2 }}
        />

        {/* Master strip */}
        <PixiMixerChannelStrip
          channelIndex={-1}
          name="MASTER"
          volume={master.volume}
          pan={0}
          muted={false}
          soloed={false}
          level={masterLevel}
          isSoloing={isSoloing}
          onVolumeChange={(_, v) => setMasterVol(v)}
          onPanChange={() => {}}
          onMuteToggle={() => {}}
          onSoloToggle={() => {}}
          isMaster={true}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
