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

// ─── MixerPanel ───────────────────────────────────────────────────────────────

export const MixerPanel: React.FC = () => {
  // ── Store ────────────────────────────────────────────────────────────────

  const channels        = useMixerStore(s => s.channels);
  const master          = useMixerStore(s => s.master);
  const isSoloing       = useMixerStore(s => s.isSoloing);
  const domPanelVisible = useMixerStore(s => s.domPanelVisible);
  const toggleDomPanel  = useMixerStore(s => s.toggleDomPanel);
  const setChannelVolume = useMixerStore(s => s.setChannelVolume);
  const setChannelPan    = useMixerStore(s => s.setChannelPan);
  const setMasterVolume  = useMixerStore(s => s.setMasterVolume);
  const setChannelMute   = useMixerStore(s => s.setChannelMute);
  const setChannelSolo   = useMixerStore(s => s.setChannelSolo);

  // ── VU meter rAF loop ─────────────────────────────────────────────────

  const [levels, setLevels] = useState<number[]>(() => Array(NUM_CHANNELS).fill(0));
  const rafRef     = useRef<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      if (!mountedRef.current) return;
      try {
        setLevels(getToneEngine().getChannelLevels(NUM_CHANNELS));
      } catch {
        // Engine not yet ready — ignore
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Stale-closure guards ──────────────────────────────────────────────

  const channelsRef = useRef(channels);
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleMuteToggle = useCallback((ch: number) => {
    setChannelMute(ch, !channelsRef.current[ch].muted);
  }, [setChannelMute]);

  const handleSoloToggle = useCallback((ch: number) => {
    setChannelSolo(ch, !channelsRef.current[ch].soloed);
  }, [setChannelSolo]);

  // ── Master VU (max of all channels) ──────────────────────────────────

  const masterLevel = Math.max(...levels, 0);

  // ── Early-out when hidden ─────────────────────────────────────────────

  if (!domPanelVisible) return null;

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#0e0e14] border border-white/10 rounded-lg shadow-2xl"
      style={{ minWidth: 'min(98vw, 1100px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <span className="text-[10px] font-mono text-white/40 tracking-widest">
          MIXER
        </span>
        <button
          onClick={toggleDomPanel}
          className="text-[12px] text-white/30 hover:text-white/70 transition-colors leading-none px-1"
          title="Close mixer"
        >
          ✕
        </button>
      </div>

      {/* Strip area — horizontally scrollable */}
      <div className="flex flex-row overflow-x-auto items-start pb-2">
        {/* 16 channel strips */}
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
            onVolumeChange={(v) => setChannelVolume(i, v)}
            onPanChange={(p) => setChannelPan(i, p)}
            onMuteToggle={() => handleMuteToggle(i)}
            onSoloToggle={() => handleSoloToggle(i)}
          />
        ))}

        {/* Divider */}
        <div className="self-stretch w-px bg-white/10 mx-1 my-2" />

        {/* Master strip */}
        <DOMChannelStrip
          index={-1}
          name="MASTER"
          volume={master.volume}
          pan={0}
          muted={false}
          soloed={false}
          level={masterLevel}
          dimmed={false}
          onVolumeChange={(v) => setMasterVolume(v)}
          onPanChange={() => {}}
          onMuteToggle={() => {}}
          onSoloToggle={() => {}}
          isMaster={true}
        />
      </div>
    </div>
  );
};
