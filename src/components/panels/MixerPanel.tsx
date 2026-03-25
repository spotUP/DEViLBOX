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
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';

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
  /** Mobile compact mode — larger touch targets, simplified layout */
  compact?: boolean;
  // DAW features
  sendLevels?: number[];
  onSendLevelChange?: (sendIdx: number, level: number) => void;
  insertEffectCount?: number;
  armRecord?: boolean;
  onArmRecordToggle?: () => void;
}

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
  compact = false,
  sendLevels,
  onSendLevelChange,
  insertEffectCount,
  armRecord,
  onArmRecordToggle,
}) => {
  const vuH = compact ? 100 : 80;
  const stripW = compact ? 72 : 60;

  return (
    <div
      className="flex flex-col items-center gap-1 select-none"
      style={{
        width: stripW,
        padding: compact ? '8px 4px' : '8px 2px',
        opacity: dimmed ? 0.35 : 1,
        transition: 'opacity 0.1s',
      }}
    >
      {/* Channel name */}
      <div className={`${compact ? 'text-[11px]' : 'text-[9px]'} font-mono text-white/50 truncate text-center w-full`}>
        {name}
      </div>

      {/* VU meter */}
      <div
        className="relative rounded-sm bg-white/10"
        style={{ width: compact ? 12 : 8, height: vuH }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 rounded-sm"
          style={{
            height: Math.min(level * vuH, vuH),
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
        className="cursor-pointer touch-none"
        style={{
          writingMode: 'vertical-lr',
          direction: 'rtl',
          width: compact ? 32 : 20,
          height: vuH,
          accentColor: '#22dd66',
        }}
      />

      {/* Pan slider (horizontal) — hidden in compact mode to save space */}
      {!compact && (
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
      )}

      {/* Mute / Solo buttons */}
      <div className={`flex ${compact ? 'flex-col gap-1.5' : 'gap-1'}`}>
        <button
          onClick={onMuteToggle}
          className={`${compact ? 'text-[11px] min-w-[44px] min-h-[36px]' : 'text-[9px] px-1 py-0.5'} font-mono font-bold rounded leading-none border transition-colors`}
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
            className={`${compact ? 'text-[11px] min-w-[44px] min-h-[36px]' : 'text-[9px] px-1 py-0.5'} font-mono font-bold rounded leading-none border transition-colors`}
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

      {/* Send knobs (compact horizontal row) */}
      {!isMaster && sendLevels && onSendLevelChange && !compact && (
        <div className="flex gap-0.5 mt-0.5">
          {sendLevels.slice(0, 4).map((lvl, i) => (
            <input
              key={i}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={lvl}
              onChange={(e) => onSendLevelChange(i, parseFloat(e.target.value))}
              className="cursor-pointer"
              style={{ width: 12, height: 28, writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#14b8a6' }}
              title={`Send ${i + 1}: ${Math.round(lvl * 100)}%`}
            />
          ))}
        </div>
      )}

      {/* FX indicator */}
      {insertEffectCount !== undefined && insertEffectCount > 0 && (
        <div className="text-[8px] font-mono text-accent-primary mt-0.5">FX:{insertEffectCount}</div>
      )}

      {/* Record arm button */}
      {!isMaster && onArmRecordToggle && (
        <button
          onClick={onArmRecordToggle}
          className="text-[9px] font-mono font-bold rounded leading-none border px-1 py-0.5 mt-0.5 transition-colors"
          style={{
            backgroundColor: armRecord ? '#dc2626' : 'transparent',
            borderColor: armRecord ? '#dc2626' : 'rgba(255,255,255,0.2)',
            color: armRecord ? '#fff' : 'rgba(255,255,255,0.5)',
          }}
          title={armRecord ? 'Disarm recording' : 'Arm for recording'}
        >
          R
        </button>
      )}
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
  compact?: boolean;
}

const MixerContent: React.FC<MixerContentProps> = ({
  channels, master, isSoloing, levels,
  onVolumeChange, onPanChange, onMuteToggle, onSoloToggle, onMasterVolumeChange,
  compact = false,
}) => {
  const masterLevel = Math.max(...levels, 0);
  return (
    <div className="flex flex-row overflow-x-auto items-start pb-2 scrollbar-none">
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
          compact={compact}
          sendLevels={ch.sendLevels}
          onSendLevelChange={(sendIdx, level) => useMixerStore.getState().setChannelSendLevel(i, sendIdx, level)}
          insertEffectCount={ch.insertEffects?.length ?? 0}
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
        compact={compact}
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

  // Live VU levels (rAF-driven)
  const [levels, setLevels] = useState<number[]>(() => new Array(NUM_CHANNELS).fill(0));
  const prevLevelsRef = useRef(levels);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const engine = getToneEngine();
      const patterns = useTrackerStore.getState().patterns;
      const patternIndex = useTrackerStore.getState().currentPatternIndex;
      const pattern = patterns[patternIndex];
      const numCh = pattern?.channels.length ?? NUM_CHANNELS;
      const allLevels = engine.getChannelLevels?.(numCh) ?? [];
      const next: number[] = [];
      for (let i = 0; i < numCh; i++) {
        const chLevel = allLevels[i] ?? 0;
        const prev = prevLevelsRef.current[i] ?? 0;
        // Smooth decay
        next.push(chLevel > prev ? chLevel : prev * 0.92);
      }
      prevLevelsRef.current = next;
      setLevels(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleVolumeChange = useCallback((i: number, v: number) => {
    setChannelVolume(i, v);
  }, [setChannelVolume]);

  const handlePanChange = useCallback((i: number, p: number) => {
    setChannelPan(i, p);
  }, [setChannelPan]);

  const handleMuteToggle = useCallback((i: number) => {
    const ch = useMixerStore.getState().channels[i];
    if (ch) setChannelMute(i, !ch.muted);
  }, [setChannelMute]);

  const handleSoloToggle = useCallback((i: number) => {
    const ch = useMixerStore.getState().channels[i];
    if (ch) setChannelSolo(i, !ch.soloed);
  }, [setChannelSolo]);

  return {
    channels,
    master,
    isSoloing,
    levels,
    onVolumeChange: handleVolumeChange,
    onPanChange: handlePanChange,
    onMuteToggle: handleMuteToggle,
    onSoloToggle: handleSoloToggle,
    onMasterVolumeChange: setMasterVolume,
  };
}

// ─── MixerView — full-page view for the DOM UI ────────────────────────────────

export const MixerView: React.FC = () => {
  const state = useMixerState();
  const { isMobile } = useResponsiveSafe();
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0e0e14]">
      <MixerContent {...state} compact={isMobile} />
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
