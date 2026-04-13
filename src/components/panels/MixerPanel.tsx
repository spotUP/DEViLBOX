/**
 * MixerPanel — Floating HTML/Tailwind DOM mixer panel.
 *
 * Visually matches the GL mixer 1:1. Reads from useMixerStore (same store as
 * the GL mixer). Renders 16 channel strips + 4 send bus return strips + master
 * with live VU meters driven by a rAF loop.
 *
 * Only mounts when domPanelVisible === true (MixerPanel) or always (MixerView).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMixerStore } from '../../stores/useMixerStore';
import type { SendBusState } from '../../stores/useMixerStore';
import { useTrackerStore } from '../../stores/useTrackerStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { getToneEngine } from '../../engine/ToneEngine';
import { getSendBusPresetsByCategory, getChannelFxPresetsByCategory } from '../../constants/fxPresets';

import { ChannelInsertEffectsModal } from '@components/effects/ChannelInsertEffectsModal';
import { CustomSelect } from '@components/common/CustomSelect';

// ─── Constants ────────────────────────────────────────────────────────────────

const NUM_CHANNELS = 16;
const VU_HEIGHT = 120;
const FADER_HEIGHT = 100;
const SEND_CYCLE_VALUES = [0, 0.5, 0.75, 1];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDb(volume: number): string {
  if (volume <= 0) return '-\u221E';
  const db = 20 * Math.log10(volume);
  return `${Math.round(db)}`;
}

function vuColor(level: number): string {
  if (level > 0.9) return '#ff3333';
  if (level > 0.7) return '#ffcc00';
  return '#22dd66';
}

/** VU gradient: fill bar with CSS gradient from green (bottom) to yellow to red (top) */
function vuGradientStyle(level: number, height: number): React.CSSProperties {
  const fillH = Math.min(level * height, height);
  return {
    height: fillH,
    background: fillH > height * 0.9
      ? 'linear-gradient(to top, #22dd66, #ffcc00 60%, #ff3333 90%)'
      : fillH > height * 0.7
        ? 'linear-gradient(to top, #22dd66, #ffcc00 80%)'
        : '#22dd66',
    transition: 'height 40ms linear',
  };
}

// ─── FX Slot Dropdown ───────────────────────────────────────────────────────

const FX_TYPES = [
  null, 'reverb', 'delay', 'chorus', 'distortion', 'phaser', 'flanger', 'compressor', 'eq',
];

const FxSlotDropdown: React.FC<{
  value: string | null;
  onChange: (v: string | null) => void;
}> = ({ value, onChange }) => (
  <CustomSelect
    value={value ?? ''}
    onChange={(v) => onChange(v || null)}
    options={[
      { value: '', label: '---' },
      ...FX_TYPES.filter(Boolean).map((fx) => ({
        value: fx!,
        label: fx!.toUpperCase(),
      })),
    ]}
    className="bg-[#1a1a24] text-[8px] font-mono text-white/50 border border-white/10 rounded px-0.5 py-0 w-full cursor-pointer hover:border-white/20"
  />
);

// ─── ChannelFxPresetDropdown ─────────────────────────────────────────────────

const ChannelFxPresetDropdown: React.FC<{
  onSelect: (effects: import('@typedefs/instrument').EffectConfig[]) => void;
}> = ({ onSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => {
      document.removeEventListener('pointerdown', handler);
    };
  }, [open]);

  const grouped = getChannelFxPresetsByCategory();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-[8px] font-mono text-white/30 hover:text-white/60 border border-white/10 rounded px-1 py-0.5 leading-tight transition-colors w-full"
        title="Load channel FX preset"
      >
        FX
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 z-[100000] bg-[#1a1a24] border border-white/15 rounded shadow-xl py-1 max-h-[280px] overflow-y-auto scrollbar-none"
          style={{ width: 160 }}
        >
          {Object.entries(grouped).map(([category, presets]) => (
            <div key={category}>
              <div className="text-[8px] font-mono text-white/30 px-2 pt-1.5 pb-0.5 uppercase tracking-wider">
                {category}
              </div>
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  className="block w-full text-left text-[9px] font-mono text-white/70 hover:text-white hover:bg-white/5 px-2 py-0.5 transition-colors"
                  title={preset.description}
                  onClick={() => {
                    onSelect(preset.effects);
                    setOpen(false);
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── SendBusPresetDropdown ──────────────────────────────────────────────────

const SendBusPresetDropdown: React.FC<{
  onSelect: (effects: import('@typedefs/instrument').EffectConfig[]) => void;
}> = ({ onSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => {
      document.removeEventListener('pointerdown', handler);
    };
  }, [open]);

  const grouped = getSendBusPresetsByCategory();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-[8px] font-mono text-teal-400/60 hover:text-teal-400 border border-teal-400/20 rounded px-1 py-0.5 leading-tight transition-colors w-full"
        title="Load send bus preset"
      >
        FX
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 z-[100000] bg-[#1a1a24] border border-teal-400/20 rounded shadow-xl py-1 max-h-[280px] overflow-y-auto scrollbar-none"
          style={{ width: 180 }}
        >
          {Object.entries(grouped).map(([category, presets]) => (
            <div key={category}>
              <div className="text-[8px] font-mono text-teal-400/40 px-2 pt-1.5 pb-0.5 uppercase tracking-wider">
                {category}
              </div>
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  className="block w-full text-left text-[9px] font-mono text-white/70 hover:text-teal-300 hover:bg-teal-400/5 px-2 py-0.5 transition-colors"
                  title={preset.description}
                  onClick={() => {
                    onSelect(preset.effects);
                    setOpen(false);
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Send Bars ──────────────────────────────────────────────────────────────

const SendBars: React.FC<{
  levels: number[];
  onCycle: (idx: number) => void;
}> = ({ levels, onCycle }) => (
  <div className="flex flex-col items-center gap-0.5 w-full px-1">
    <div className="text-[7px] font-mono text-white/30 tracking-wider">SENDS</div>
    <div className="flex gap-0.5 w-full justify-center">
      {levels.slice(0, 4).map((lvl, i) => (
        <button
          key={i}
          className="relative bg-white/5 rounded-sm cursor-pointer hover:bg-white/10 transition-colors"
          style={{ width: 10, height: 20 }}
          onClick={() => onCycle(i)}
          title={`Send ${String.fromCharCode(65 + i)}: ${Math.round(lvl * 100)}% (click to cycle)`}
        >
          <div
            className="absolute bottom-0 left-0 right-0 rounded-sm"
            style={{
              height: `${lvl * 100}%`,
              backgroundColor: '#14b8a6',
              transition: 'height 100ms ease',
            }}
          />
        </button>
      ))}
    </div>
  </div>
);

// ─── Vertical Fader (styled) ────────────────────────────────────────────────

const verticalFaderStyle = `
  .dom-mixer-fader {
    -webkit-appearance: none;
    appearance: none;
    writing-mode: vertical-lr;
    direction: rtl;
    background: transparent;
    cursor: pointer;
  }
  .dom-mixer-fader::-webkit-slider-runnable-track {
    width: 4px;
    background: #2a2a3a;
    border-radius: 2px;
  }
  .dom-mixer-fader::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 8px;
    background: #d4a020;
    border-radius: 2px;
    margin-left: -6px;
    cursor: pointer;
  }
  .dom-mixer-fader::-moz-range-track {
    width: 4px;
    background: #2a2a3a;
    border-radius: 2px;
  }
  .dom-mixer-fader::-moz-range-thumb {
    width: 16px;
    height: 8px;
    background: #d4a020;
    border: none;
    border-radius: 2px;
    cursor: pointer;
  }
  .dom-mixer-fader-teal::-webkit-slider-thumb {
    background: #14b8a6;
  }
  .dom-mixer-fader-teal::-moz-range-thumb {
    background: #14b8a6;
  }
  .dom-mixer-pan {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    height: 12px;
  }
  .dom-mixer-pan::-webkit-slider-runnable-track {
    height: 3px;
    background: #2a2a3a;
    border-radius: 1px;
  }
  .dom-mixer-pan::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 8px;
    height: 10px;
    background: #60a5fa;
    border-radius: 2px;
    margin-top: -3.5px;
    cursor: pointer;
  }
  .dom-mixer-pan::-moz-range-track {
    height: 3px;
    background: #2a2a3a;
    border-radius: 1px;
  }
  .dom-mixer-pan::-moz-range-thumb {
    width: 8px;
    height: 10px;
    background: #60a5fa;
    border: none;
    border-radius: 2px;
    cursor: pointer;
  }
`;

// ─── DOMChannelStrip ─────────────────────────────────────────────────────────

interface DOMStripProps {
  index: number;
  name: string;
  instrumentName: string;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  level: number;
  peakLevel: number;
  dimmed: boolean;
  onVolumeChange: (v: number) => void;
  onPanChange: (p: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  sendLevels: number[];
  onSendLevelCycle: (sendIdx: number) => void;
  insertEffectCount: number;
  effects: [string | null, string | null];
  onEffectChange: (slot: 0 | 1, type: string | null) => void;
  onChannelFxPresetSelect: (presetEffects: import('@typedefs/instrument').EffectConfig[]) => void;
  onFxClick?: () => void;
}

const DOMChannelStrip: React.FC<DOMStripProps> = ({
  index,
  name,
  instrumentName,
  volume,
  pan,
  muted,
  soloed,
  level,
  peakLevel,
  dimmed,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  sendLevels,
  onSendLevelCycle,
  insertEffectCount,
  effects,
  onEffectChange,
  onChannelFxPresetSelect,
  onFxClick,
}) => {
  const peakY = Math.min(peakLevel * VU_HEIGHT, VU_HEIGHT);

  return (
    <div
      className="flex flex-col items-center gap-1 select-none"
      style={{
        width: 56,
        padding: '6px 2px',
        opacity: dimmed ? 0.35 : 1,
        transition: 'opacity 0.1s',
      }}
    >
      {/* 1. Channel name */}
      <div className="text-[9px] font-mono text-white/40 truncate text-center w-full leading-tight">
        {name}
      </div>

      {/* 2. Instrument name */}
      <div className="text-[7px] font-mono text-white/25 truncate text-center w-full leading-tight" title={instrumentName}>
        {instrumentName.slice(0, 8) || '---'}
      </div>

      {/* 3. VU meter */}
      <div
        className="relative rounded-sm bg-white/5 overflow-hidden"
        style={{ width: 10, height: VU_HEIGHT }}
      >
        {/* Fill */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-sm"
          style={vuGradientStyle(level, VU_HEIGHT)}
        />
        {/* Peak hold indicator */}
        {peakY > 1 && (
          <div
            className="absolute left-0 right-0"
            style={{
              bottom: peakY - 1,
              height: 2,
              backgroundColor: vuColor(peakLevel),
              transition: 'bottom 40ms linear',
            }}
          />
        )}
      </div>

      {/* 4. dB readout */}
      <div className="text-[7px] font-mono text-white/30 leading-tight text-center" style={{ minWidth: 28 }}>
        {formatDb(level)} dB
      </div>

      {/* 5. Two FX slot dropdowns */}
      <div className="flex flex-col gap-0.5 w-full px-0.5">
        <FxSlotDropdown value={effects[0]} onChange={(v) => onEffectChange(0, v)} />
        <FxSlotDropdown value={effects[1]} onChange={(v) => onEffectChange(1, v)} />
      </div>

      {/* 6. Volume fader */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        title={`Volume: ${formatDb(volume)} dB`}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        className="dom-mixer-fader touch-none"
        style={{ width: 20, height: FADER_HEIGHT }}
      />

      {/* 7. Pan knob */}
      <div className="flex flex-col items-center gap-0">
        <div className="text-[6px] font-mono text-white/20 tracking-wider">PAN</div>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={pan}
          title={`Pan: ${pan >= 0 ? '+' : ''}${pan.toFixed(2)}`}
          onChange={(e) => onPanChange(parseFloat(e.target.value))}
          className="dom-mixer-pan"
          style={{ width: 40 }}
        />
      </div>

      {/* 8. Channel indicator */}
      <div className="text-[7px] font-mono text-white/20 leading-tight">
        C{index + 1}
      </div>

      {/* 9. Mute button */}
      <button
        onClick={onMuteToggle}
        className="text-[9px] font-mono font-bold rounded leading-none border px-2 py-1 transition-colors"
        style={{
          backgroundColor: muted ? '#dc2626' : 'transparent',
          borderColor: muted ? '#dc2626' : 'rgba(255,255,255,0.15)',
          color: muted ? '#fff' : 'rgba(255,255,255,0.4)',
        }}
        title={muted ? 'Unmute' : 'Mute'}
      >
        M
      </button>

      {/* 10. Solo button */}
      <button
        onClick={onSoloToggle}
        className="text-[9px] font-mono font-bold rounded leading-none border px-2 py-1 transition-colors"
        style={{
          backgroundColor: soloed ? '#ca8a04' : 'transparent',
          borderColor: soloed ? '#ca8a04' : 'rgba(255,255,255,0.15)',
          color: soloed ? '#fff' : 'rgba(255,255,255,0.4)',
        }}
        title={soloed ? 'Unsolo' : 'Solo'}
      >
        S
      </button>

      {/* 11. Send bars */}
      <SendBars levels={sendLevels} onCycle={onSendLevelCycle} />

      {/* 12. Insert FX button — always clickable, opens per-channel effects dialog */}
      {onFxClick ? (
        <button
          onClick={onFxClick}
          className={`text-[8px] font-mono leading-tight cursor-pointer transition-colors px-1 py-0.5 rounded border ${
            insertEffectCount > 0
              ? 'text-teal-400 border-teal-400/40 hover:bg-teal-400/10'
              : 'text-text-muted border-border-primary hover:text-teal-400 hover:border-teal-400/30'
          }`}
          title={insertEffectCount > 0 ? `Edit ${insertEffectCount} insert effect(s)` : 'Add insert effects to this channel'}
        >
          FX{insertEffectCount > 0 ? `:${insertEffectCount}` : ''}
        </button>
      ) : (
        <div className="text-[7px] font-mono text-text-muted leading-tight">
          FX:{insertEffectCount}
        </div>
      )}

      {/* 13. Channel FX preset button */}
      <ChannelFxPresetDropdown onSelect={onChannelFxPresetSelect} />
    </div>
  );
};

// ─── DOMSendBusStrip ────────────────────────────────────────────────────────

interface SendBusStripProps {
  busIndex: number;
  bus: SendBusState;
}

const DOMSendBusStrip: React.FC<SendBusStripProps> = ({ busIndex, bus }) => {
  const busLetter = String.fromCharCode(65 + busIndex); // A, B, C, D

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useMixerStore.getState().setSendBusVolume(busIndex, parseFloat(e.target.value));
  }, [busIndex]);

  const handleMuteToggle = useCallback(() => {
    useMixerStore.getState().setSendBusMute(busIndex, !bus.muted);
  }, [busIndex, bus.muted]);

  const handlePresetSelect = useCallback((effects: import('@typedefs/instrument').EffectConfig[]) => {
    useMixerStore.getState().setSendBusEffects(busIndex, effects);
  }, [busIndex]);

  return (
    <div
      className="flex flex-col items-center gap-1 select-none"
      style={{
        width: 56,
        padding: '6px 2px',
        backgroundColor: 'rgba(20, 184, 166, 0.03)',
        borderRadius: 4,
      }}
    >
      {/* 1. Bus letter */}
      <div className="text-[18px] font-mono font-bold text-teal-400 leading-tight">
        {busLetter}
      </div>

      {/* 2. Bus name */}
      <div className="text-[7px] font-mono text-white/30 truncate text-center w-full leading-tight">
        {bus.name}
      </div>

      {/* 3. Effect count */}
      <div className="text-[8px] font-mono text-teal-400/70 leading-tight">
        FX:{bus.effects.length}
      </div>

      {/* 4. Volume fader */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={bus.volume}
        title={`${bus.name}: ${formatDb(bus.volume)} dB`}
        onChange={handleVolumeChange}
        className="dom-mixer-fader dom-mixer-fader-teal touch-none"
        style={{ width: 20, height: FADER_HEIGHT }}
      />

      {/* 5. Mute button */}
      <button
        onClick={handleMuteToggle}
        className="text-[9px] font-mono font-bold rounded leading-none border px-2 py-1 transition-colors"
        style={{
          backgroundColor: bus.muted ? '#dc2626' : 'transparent',
          borderColor: bus.muted ? '#dc2626' : 'rgba(20, 184, 166, 0.3)',
          color: bus.muted ? '#fff' : 'rgba(20, 184, 166, 0.6)',
        }}
        title={bus.muted ? 'Unmute' : 'Mute'}
      >
        M
      </button>

      {/* 6. FX preset button */}
      <SendBusPresetDropdown onSelect={handlePresetSelect} />
    </div>
  );
};

// ─── DOMMasterStrip ─────────────────────────────────────────────────────────

interface MasterStripProps {
  volume: number;
  level: number;
  peakLevel: number;
  onVolumeChange: (v: number) => void;
}

const DOMMasterStrip: React.FC<MasterStripProps> = ({
  volume,
  level,
  peakLevel,
  onVolumeChange,
}) => {
  const peakY = Math.min(peakLevel * VU_HEIGHT, VU_HEIGHT);

  return (
    <div
      className="flex flex-col items-center gap-1 select-none"
      style={{ width: 56, padding: '6px 2px' }}
    >
      {/* Name */}
      <div className="text-[9px] font-mono text-white/50 font-bold truncate text-center w-full leading-tight">
        MASTER
      </div>

      {/* Spacer to match instrument name row */}
      <div className="text-[7px] leading-tight">&nbsp;</div>

      {/* VU meter */}
      <div
        className="relative rounded-sm bg-white/5 overflow-hidden"
        style={{ width: 10, height: VU_HEIGHT }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 rounded-sm"
          style={vuGradientStyle(level, VU_HEIGHT)}
        />
        {peakY > 1 && (
          <div
            className="absolute left-0 right-0"
            style={{
              bottom: peakY - 1,
              height: 2,
              backgroundColor: vuColor(peakLevel),
              transition: 'bottom 40ms linear',
            }}
          />
        )}
      </div>

      {/* dB readout */}
      <div className="text-[7px] font-mono text-white/30 leading-tight text-center" style={{ minWidth: 28 }}>
        {formatDb(level)} dB
      </div>

      {/* Spacer to align with channel FX slots */}
      <div style={{ height: 34 }} />

      {/* Volume fader */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        title={`Master: ${formatDb(volume)} dB`}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        className="dom-mixer-fader touch-none"
        style={{ width: 20, height: FADER_HEIGHT }}
      />
    </div>
  );
};

// ─── MixerContent (shared strip area) ─────────────────────────────────────────

const MixerContent: React.FC = () => {
  const allChannels = useMixerStore(s => s.channels);
  const master = useMixerStore(s => s.master);
  const isSoloing = useMixerStore(s => s.isSoloing);
  const sendBuses = useMixerStore(s => s.sendBuses);
  const setChannelVolume = useMixerStore(s => s.setChannelVolume);
  const setChannelPan = useMixerStore(s => s.setChannelPan);
  const setMasterVolume = useMixerStore(s => s.setMasterVolume);
  const setChannelMute = useMixerStore(s => s.setChannelMute);
  const setChannelSolo = useMixerStore(s => s.setChannelSolo);
  const setChannelEffect = useMixerStore(s => s.setChannelEffect);

  const [channelFxModalIndex, setChannelFxModalIndex] = useState<number | null>(null);

  const instruments = useInstrumentStore(s => s.instruments);

  // Only show channels the current song uses
  const patternChannelCount = useTrackerStore(s => {
    if (s.patterns.length === 0) return 4;
    return s.patterns[0]?.channels.length ?? 4;
  });
  const visibleCount = Math.max(1, Math.min(patternChannelCount, allChannels.length));
  const channels = allChannels.slice(0, visibleCount);

  // Live VU levels + peak hold (rAF-driven)
  const [levels, setLevels] = useState<number[]>(() => new Array(NUM_CHANNELS).fill(0));
  const [peaks, setPeaks] = useState<number[]>(() => new Array(NUM_CHANNELS).fill(0));
  const prevLevelsRef = useRef(levels);
  const peaksRef = useRef(peaks);
  const peakDecayRef = useRef<number[]>(new Array(NUM_CHANNELS).fill(0));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const engine = getToneEngine();
      const patterns = useTrackerStore.getState().patterns;
      const patternIndex = useTrackerStore.getState().currentPatternIndex;
      const pattern = patterns[patternIndex];
      const numCh = pattern?.channels.length ?? NUM_CHANNELS;
      const allLevels = engine.getChannelLevels?.(numCh) ?? [];
      const nextLevels: number[] = [];
      const nextPeaks: number[] = [];
      for (let i = 0; i < numCh; i++) {
        const chLevel = allLevels[i] ?? 0;
        const prev = prevLevelsRef.current[i] ?? 0;
        // Smooth decay
        nextLevels.push(chLevel > prev ? chLevel : prev * 0.92);
        // Peak hold with slow decay
        const prevPeak = peaksRef.current[i] ?? 0;
        if (chLevel >= prevPeak) {
          nextPeaks.push(chLevel);
          peakDecayRef.current[i] = 30; // hold for ~30 frames (~0.5s)
        } else if (peakDecayRef.current[i] > 0) {
          peakDecayRef.current[i]--;
          nextPeaks.push(prevPeak);
        } else {
          nextPeaks.push(prevPeak * 0.97);
        }
      }
      prevLevelsRef.current = nextLevels;
      peaksRef.current = nextPeaks;
      setLevels(nextLevels);
      setPeaks(nextPeaks);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const masterLevel = Math.max(...levels, 0);
  const masterPeak = Math.max(...peaks, 0);

  const handleSendLevelCycle = useCallback((chIdx: number, sendIdx: number) => {
    const current = useMixerStore.getState().channels[chIdx]?.sendLevels?.[sendIdx] ?? 0;
    const cycleIdx = SEND_CYCLE_VALUES.indexOf(current);
    const next = SEND_CYCLE_VALUES[(cycleIdx + 1) % SEND_CYCLE_VALUES.length];
    useMixerStore.getState().setChannelSendLevel(chIdx, sendIdx, next);
  }, []);

  return (
    <>
    <div className="flex flex-row items-start overflow-x-auto pb-2 scrollbar-none">
      {/* ── Section: CHANNELS ── */}
      <div className="flex flex-col items-start">
        <div className="text-[7px] font-mono text-white/20 tracking-[0.2em] px-2 pt-1 pb-0.5">
          CHANNELS
        </div>
        <div className="flex flex-row">
          {channels.map((ch, i) => {
            const inst = instruments[i];
            const instName = inst?.name ?? '';
            return (
              <DOMChannelStrip
                key={i}
                index={i}
                name={ch.name}
                instrumentName={instName}
                volume={ch.volume}
                pan={ch.pan}
                muted={ch.muted}
                soloed={ch.soloed}
                level={levels[i] ?? 0}
                peakLevel={peaks[i] ?? 0}
                dimmed={isSoloing && !ch.soloed}
                onVolumeChange={(v) => setChannelVolume(i, v)}
                onPanChange={(p) => setChannelPan(i, p)}
                onMuteToggle={() => {
                  const c = useMixerStore.getState().channels[i];
                  if (c) setChannelMute(i, !c.muted);
                }}
                onSoloToggle={() => {
                  const c = useMixerStore.getState().channels[i];
                  if (c) setChannelSolo(i, !c.soloed);
                }}
                sendLevels={ch.sendLevels}
                onSendLevelCycle={(sendIdx) => handleSendLevelCycle(i, sendIdx)}
                insertEffectCount={ch.insertEffects?.length ?? 0}
                effects={ch.effects}
                onEffectChange={(slot, type) => setChannelEffect(i, slot, type)}
                onChannelFxPresetSelect={(fx) => useMixerStore.getState().loadChannelInsertPreset(i, fx)}
                onFxClick={() => setChannelFxModalIndex(i)}
              />
            );
          })}
        </div>
      </div>

      {/* Divider: channels | sends */}
      <div className="self-stretch flex flex-col items-center mx-0.5 my-2">
        <div className="flex-1 w-px bg-white/10" />
      </div>

      {/* ── Section: SENDS ── */}
      <div className="flex flex-col items-start">
        <div className="text-[7px] font-mono text-teal-400/30 tracking-[0.2em] px-2 pt-1 pb-0.5">
          SENDS
        </div>
        <div className="flex flex-row">
          {sendBuses.map((bus, i) => (
            <DOMSendBusStrip key={`send-${i}`} busIndex={i} bus={bus} />
          ))}
        </div>
      </div>

      {/* Divider: sends | master */}
      <div className="self-stretch flex flex-col items-center mx-0.5 my-2">
        <div className="flex-1 w-px" style={{ backgroundColor: 'rgba(20, 184, 166, 0.15)' }} />
      </div>

      {/* ── Section: MASTER ── */}
      <div className="flex flex-col items-start">
        <div className="text-[7px] font-mono text-white/20 tracking-[0.2em] px-2 pt-1 pb-0.5">
          MASTER
        </div>
        <DOMMasterStrip
          volume={master.volume}
          level={masterLevel}
          peakLevel={masterPeak}
          onVolumeChange={setMasterVolume}
        />
      </div>
    </div>

    {channelFxModalIndex !== null && (
      <ChannelInsertEffectsModal
        isOpen={true}
        onClose={() => setChannelFxModalIndex(null)}
        channelIndex={channelFxModalIndex}
      />
    )}
    </>
  );
};

// ─── MixerView — full-page view for the DOM UI ────────────────────────────────

export const MixerView: React.FC = () => {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0e0e14]">
      <style>{verticalFaderStyle}</style>
      <MixerContent />
    </div>
  );
};

// ─── MixerPanel ───────────────────────────────────────────────────────────────

export const MixerPanel: React.FC = () => {
  const domPanelVisible = useMixerStore(s => s.domPanelVisible);
  const toggleDomPanel  = useMixerStore(s => s.toggleDomPanel);

  if (!domPanelVisible) return null;

  return (
    <div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[99990] bg-[#0e0e14] border border-white/10 rounded-lg shadow-2xl"
      style={{ minWidth: 'min(98vw, 1100px)' }}
    >
      <style>{verticalFaderStyle}</style>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <span className="text-[10px] font-mono text-white/40 tracking-widest">
          MIXER
        </span>
        <button
          onClick={toggleDomPanel}
          className="text-[10px] text-white/30 hover:text-white/70 transition-colors leading-none px-1 font-mono"
          title="Close mixer"
        >
          X
        </button>
      </div>
      <MixerContent />
    </div>
  );
};
