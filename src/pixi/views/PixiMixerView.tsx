// src/pixi/views/PixiMixerView.tsx
// Full GL mixer: 16 channel strips + master, scrollable, live VU meters

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useMixerStore } from '../../stores/useMixerStore';
import { getToneEngine } from '@engine/ToneEngine';
import { PixiMixerChannelStrip } from '../mixer/PixiMixerChannelStrip';
import { PixiLabel } from '../components/PixiLabel';
import { PixiButton } from '../components/PixiButton';
import { usePixiTheme } from '../theme';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { PixiInstrumentEditor } from './PixiInstrumentEditor';
import { PixiMasterFxView } from './PixiMasterFxView';

// ─── Constants ────────────────────────────────────────────────────────────────

const NUM_CHANNELS = 16;

type DetailTab = 'device' | 'master-fx';

// Instrument editor wrapper — reads current instrument from store
const InstrumentEditorPanel: React.FC = () => {
  const instrument = useInstrumentStore((s) =>
    s.instruments.find((i) => i.id === s.currentInstrumentId) ?? s.instruments[0]
  );
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);
  if (!instrument) return null;
  return (
    <PixiInstrumentEditor
      synthType={instrument.synthType}
      config={instrument as unknown as Record<string, unknown>}
      onChange={(updates) => updateInstrument(instrument.id, updates)}
      instrumentName={instrument.name}
    />
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const PixiMixerView: React.FC = () => {
  const theme = usePixiTheme();

  // Detail panel tab (device / master-fx)
  const [detailTab, setDetailTab] = useState<DetailTab>('device');

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

  // ── VU meter refs (no React state — avoids re-renders on every frame) ────

  const levelsRef = useRef<number[]>(Array(NUM_CHANNELS).fill(0));
  const masterLevelRef = useRef(0);
  const mountedRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      if (!mountedRef.current) return;

      try {
        const channelLevels = getToneEngine().getChannelLevels(NUM_CHANNELS);
        levelsRef.current = channelLevels;
        masterLevelRef.current = Math.max(...channelLevels);
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

  const drawHDivider = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 2000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme.border.color, theme.border.alpha]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* ── Top: mixer strips row ──────────────────────────────────────────── */}
      <pixiContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        {/* CHANNELS */}
        <pixiContainer layout={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <PixiLabel text="CHANNELS" size="xs" color="textMuted" layout={{ paddingLeft: 4, paddingBottom: 2 }} />
          <pixiContainer layout={{ flexDirection: 'row', alignItems: 'flex-start', gap: 2 }}>
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
                getLevelCallback={() => levelsRef.current[i] ?? 0}
                isSoloing={isSoloing}
                onVolumeChange={setChannelVolume}
                onPanChange={setChannelPan}
                onMuteToggle={handleMuteToggle}
                onSoloToggle={handleSoloToggle}
                effects={ch.effects ?? [null, null]}
                onEffectChange={(slot, type) => useMixerStore.getState().setChannelEffect(i, slot, type)}
              />
            ))}
          </pixiContainer>
        </pixiContainer>

        {/* Divider */}
        <pixiGraphics draw={drawDivider} layout={{ width: 1, height: 240 }} />

        {/* MASTER */}
        <pixiContainer layout={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <PixiLabel text="MASTER" size="xs" color="textMuted" layout={{ paddingLeft: 4, paddingBottom: 2 }} />
          <PixiMixerChannelStrip
            channelIndex={-1}
            name="MASTER"
            volume={master.volume}
            pan={0}
            muted={false}
            soloed={false}
            getLevelCallback={() => masterLevelRef.current}
            isSoloing={isSoloing}
            onVolumeChange={(_, v) => setMasterVol(v)}
            onPanChange={() => {}}
            onMuteToggle={() => {}}
            onSoloToggle={() => {}}
            isMaster={true}
          />
        </pixiContainer>
      </pixiContainer>

      {/* ── Horizontal divider ─────────────────────────────────────────────── */}
      <pixiGraphics draw={drawHDivider} layout={{ width: '100%', height: 1 }} />

      {/* ── Bottom: Device / Master FX panel ───────────────────────────────── */}
      <pixiContainer
        layout={{
          flexDirection: 'column',
          flexGrow: 1,
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Tab bar */}
        <pixiContainer
          layout={{
            flexDirection: 'row',
            gap: 2,
            paddingLeft: 8,
            paddingTop: 4,
            paddingBottom: 4,
          }}
        >
          <PixiButton
            label="DEVICE"
            variant="ft2"
            size="sm"
            active={detailTab === 'device'}
            onClick={() => setDetailTab('device')}
            width={56}
          />
          <PixiButton
            label="MASTER FX"
            variant="ft2"
            size="sm"
            active={detailTab === 'master-fx'}
            onClick={() => setDetailTab('master-fx')}
            width={72}
          />
        </pixiContainer>

        {/* Tab content */}
        <pixiContainer
          layout={{
            flexGrow: 1,
            width: '100%',
            overflow: 'hidden',
            paddingLeft: 8,
            paddingRight: 8,
            paddingBottom: 8,
          }}
        >
          <pixiContainer
            visible={detailTab === 'device'}
            eventMode={detailTab === 'device' ? 'auto' : 'none'}
            layout={{ display: detailTab === 'device' ? 'flex' : 'none', width: '100%' }}
          >
            <InstrumentEditorPanel />
          </pixiContainer>
          <pixiContainer
            visible={detailTab === 'master-fx'}
            eventMode={detailTab === 'master-fx' ? 'auto' : 'none'}
            layout={{ display: detailTab === 'master-fx' ? 'flex' : 'none', width: '100%' }}
          >
            <PixiMasterFxView />
          </pixiContainer>
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};
