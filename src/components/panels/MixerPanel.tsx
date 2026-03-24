/**
 * MixerPanel — Floating HTML/Tailwind DOM mixer panel.
 *
 * Reads from useMixerStore (same store as the GL mixer). Renders 16 channel
 * strips + a master strip with live VU meters driven by a rAF loop.
 *
 * Only mounts when domPanelVisible === true.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMixerStore } from '../../stores/useMixerStore';
import { useTrackerStore } from '../../stores/useTrackerStore';
import { getToneEngine } from '../../engine/ToneEngine';

// ─── Constants ────────────────────────────────────────────────────────────────

const NUM_CHANNELS = 16;

// ─── DOMChannelStrip ─────────────────────────────────────────────────────────

interface DOMStripProps {
  index: number;       // channel index (-1 for master)
  name: string;
  volume: number;      // 0-1
  pan: number;         // -1..1
  muted: boolean;
  soloed: boolean;
  level: number;       // 0-1 VU
  dimmed: boolean;     // isSoloing && !soloed && !isMaster
  onVolumeChange: (v: number) => void;
  onPanChange: (p: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  isMaster?: boolean;
}

const VU_HEIGHT = 80;

function vuColor(level: number): string {
  if (level > 0.9) return '#ff3333';
  if (level > 0.7) return '#ffcc00';
  return '#22dd66';
}

const DOMChannelStrip: React.FC<DOMStripProps> = ({
  name,
  volume,
  pan,
  muted,
  soloed,
  level,
  dimmed,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  isMaster = false,
}) => {
  return (
    <div
      className="flex flex-col items-center gap-1 px-1 py-2 select-none"
      style={{ width: 60, opacity: dimmed ? 0.35 : 1, transition: 'opacity 0.1s' }}
    >
      {/* Channel name */}
      <div className="text-[9px] font-mono text-white/50 truncate text-center w-full">
        {name}
      </div>

      {/* VU meter */}
      <div
        className="relative rounded-sm bg-white/10"
        style={{ width: 8, height: VU_HEIGHT }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 rounded-sm"
          style={{
            height: Math.min(level * VU_HEIGHT, VU_HEIGHT),
            backgroundColor: vuColor(level),
            transition: 'height 40ms linear, background-color 40ms linear',
          }}
        />
      </div>

      {/* Volume fader (vertical) */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        title={Math.round(volume * 100) + '%'}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        className="h-20 cursor-pointer"
        style={{
          writingMode: 'vertical-lr',
          direction: 'rtl',
          width: 20,
          height: VU_HEIGHT,
          accentColor: '#22dd66',
        }}
      />

      {/* Pan slider (horizontal) */}
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={pan}
        title={`Pan: ${pan >= 0 ? '+' : ''}${pan.toFixed(2)}`}
        onChange={(e) => onPanChange(parseFloat(e.target.value))}
        className="cursor-pointer"
        style={{ width: 44, accentColor: '#60a5fa' }}
      />

      {/* Mute / Solo buttons */}
      <div className="flex gap-1">
        <button
          onClick={onMuteToggle}
          className="text-[9px] font-mono font-bold rounded px-1 py-0.5 leading-none border transition-colors"
          style={{
            backgroundColor: muted ? '#dc2626' : 'transparent',
            borderColor: muted ? '#dc2626' : 'rgba(255,255,255,0.2)',
            color: muted ? '#fff' : 'rgba(255,255,255,0.5)',
          }}
          title={muted ? 'Unmute' : 'Mute'}
        >
          M
        </button>

        {!isMaster && (
          <button
            onClick={onSoloToggle}
            className="text-[9px] font-mono font-bold rounded px-1 py-0.5 leading-none border transition-colors"
            style={{
              backgroundColor: soloed ? '#ca8a04' : 'transparent',
              borderColor: soloed ? '#ca8a04' : 'rgba(255,255,255,0.2)',
              color: soloed ? '#fff' : 'rgba(255,255,255,0.5)',
            }}
            title={soloed ? 'Unsolo' : 'Solo'}
          >
            S
          </button>
        )}
      </div>
    </div>
  );
};

// ─── MixerContent (shared strip area) ─────────────────────────────────────────

interface MixerContentProps {
  channels: ReturnType<typeof useMixerStore.getState>['channels'];
  master: ReturnType<typeof useMixerStore.getState>['master'];
  isSoloing: boolean;
  levels: number[];
  onVolumeChange: (i: number, v: number) => void;
  onPanChange: (i: number, p: number) => void;
  onMuteToggle: (i: number) => void;
  onSoloToggle: (i: number) => void;
  onMasterVolumeChange: (v: number) => void;
}

const MixerContent: React.FC<MixerContentProps> = ({
  channels, master, isSoloing, levels,
  onVolumeChange, onPanChange, onMuteToggle, onSoloToggle, onMasterVolumeChange,
}) => {
  const masterLevel = Math.max(...levels, 0);
  return (
    <div className="flex flex-row overflow-x-auto items-start pb-2">
      {channels.map((ch, i) => (
        <DOMChannelStrip
          key={i}
          index={i}
          name={ch.name}
          volume={ch.volume}
          pan={ch.pan}
          muted={ch.muted}
          soloed={ch.soloed}
          level={levels[i] ?? 0}
          dimmed={isSoloing && !ch.soloed}
          onVolumeChange={(v) => onVolumeChange(i, v)}
          onPanChange={(p) => onPanChange(i, p)}
          onMuteToggle={() => onMuteToggle(i)}
          onSoloToggle={() => onSoloToggle(i)}
        />
      ))}
      <div className="self-stretch w-px bg-white/10 mx-1 my-2" />
      <DOMChannelStrip
        index={-1}
        name="MASTER"
        volume={master.volume}
        pan={0}
        muted={false}
        soloed={false}
        level={masterLevel}
        dimmed={false}
        onVolumeChange={onMasterVolumeChange}
        onPanChange={() => {}}
        onMuteToggle={() => {}}
        onSoloToggle={() => {}}
        isMaster={true}
      />
    </div>
  );
};

function useMixerState() {
  const channels        = useMixerStore(s => s.channels);
  const master          = useMixerStore(s => s.master);
  const isSoloing       = useMixerStore(s => s.isSoloing);
  const setChannelVolume = useMixerStore(s => s.setChannelVolume);
  const setChannelPan    = useMixerStore(s => s.setChannelPan);
  const setMasterVolume  = useMixerStore(s => s.setMasterVolume);
  const setChannelMute   = useMixerStore(s => s.setChannelMute);
  const setChannelSolo   = useMixerStore(s => s.setChannelSolo);

  const [levels, setLevels] = useState<number[]>(() => Array(NUM_CHANNELS).fill(0));
  const rafRef     = useRef<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const tick = () => {
      if (!mountedRef.current) return;
      try {
        const engine = getToneEngine();
        const chLevels = engine.getChannelLevels(NUM_CHANNELS);
        // If all per-channel levels are 0 (WASM engines bypass channel routing),
        // fall back to synthBus level on active channels only
        const hasSignal = chLevels.some(l => l > 0);
        if (!hasSignal) {
          const busLevel = engine.getSynthBusLevel();
          if (busLevel > 0) {
            const activeChannels = useTrackerStore.getState().patterns[0]?.channels.length ?? 4;
            for (let i = 0; i < Math.min(activeChannels, chLevels.length); i++) chLevels[i] = busLevel;
          }
        }
        setLevels(chLevels);
      } catch { /* not ready */ }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { mountedRef.current = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  const channelsRef = useRef(channels);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const handleMuteToggle = useCallback((ch: number) => {
    setChannelMute(ch, !channelsRef.current[ch].muted);
  }, [setChannelMute]);
  const handleSoloToggle = useCallback((ch: number) => {
    setChannelSolo(ch, !channelsRef.current[ch].soloed);
  }, [setChannelSolo]);

  return {
    channels, master, isSoloing, levels,
    onVolumeChange: setChannelVolume,
    onPanChange: setChannelPan,
    onMuteToggle: handleMuteToggle,
    onSoloToggle: handleSoloToggle,
    onMasterVolumeChange: setMasterVolume,
  };
}

// ─── MixerView — full-page view for the DOM UI ────────────────────────────────

export const MixerView: React.FC = () => {
  const state = useMixerState();
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0e0e14]">
      <MixerContent {...state} />
    </div>
  );
};

// ─── MixerPanel ───────────────────────────────────────────────────────────────

export const MixerPanel: React.FC = () => {
  const state = useMixerState();
  const domPanelVisible = useMixerStore(s => s.domPanelVisible);
  const toggleDomPanel  = useMixerStore(s => s.toggleDomPanel);

  if (!domPanelVisible) return null;

  return (
    <div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[99990] bg-[#0e0e14] border border-white/10 rounded-lg shadow-2xl"
      style={{ minWidth: 'min(98vw, 1100px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <span className="text-[10px] font-mono text-white/40 tracking-widest">
          MIXER
        </span>
        <button
          onClick={toggleDomPanel}
          className="text-[12px] text-white/30 hover:text-text-primary/70 transition-colors leading-none px-1"
          title="Close mixer"
        >
          ✕
        </button>
      </div>
      <MixerContent {...state} />
    </div>
  );
};
