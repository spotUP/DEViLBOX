/**
 * SIDStereoTab — per-voice stereo panning + reverb send for SID playback.
 *
 * Pan sliders set the voice's stereo position in the dub bus effects chain
 * (via DubBus.setSidVoicePan). Reverb slider sets the dry spring reverb
 * send level for all voices equally (via DubBus.setSidVoiceReverbSend).
 *
 * Settings apply immediately to the audio graph and persist until the
 * SID dialog is closed (voices re-register on next song load).
 */

import React, { useState, useCallback } from 'react';
import { Headphones, RotateCcw } from 'lucide-react';
import { CustomSelect } from '@components/common/CustomSelect';
import { getActiveDubBus } from '@/engine/dub/DubBus';

interface SIDStereoTabProps {
  className?: string;
}

interface VoicePan {
  label: string;
  pan: number;
  color: string;
}

const VOICE_COLORS = ['#00ff88', '#6699ff', '#ff6644'];

function makeVoices(): VoicePan[] {
  return [
    { label: 'Voice 1', pan: 0, color: VOICE_COLORS[0] },
    { label: 'Voice 2', pan: 0, color: VOICE_COLORS[1] },
    { label: 'Voice 3', pan: 0, color: VOICE_COLORS[2] },
  ];
}

function formatPan(value: number): string {
  if (Math.abs(value) < 0.01) return 'C  0.00';
  const dir = value < 0 ? 'L' : 'R';
  return `${dir}  ${Math.abs(value).toFixed(2)}`;
}

const MONO_PRESET = [0, 0, 0];
const WIDE_PRESET = [-0.8, 0, 0.8];
const CROSSFEED_PRESET = [-0.3, 0.3, 0];

const STEREO_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const SIDStereoTab: React.FC<SIDStereoTabProps> = ({ className }) => {
  const [voices, setVoices] = useState<VoicePan[]>(makeVoices);
  const [stereoMode, setStereoMode] = useState('none');
  const [headphones, setHeadphones] = useState(false);
  const [reverb, setReverb] = useState(0);

  const updateVoicePan = useCallback((index: number, pan: number) => {
    setVoices(prev => prev.map((v, i) => i === index ? { ...v, pan } : v));
    try { getActiveDubBus()?.setSidVoicePan(index, pan); } catch { /* ok */ }
  }, []);

  const applyPreset = useCallback((preset: number[]) => {
    setVoices(prev => prev.map((v, i) => ({ ...v, pan: preset[i] ?? 0 })));
    preset.forEach((pan, i) => {
      try { getActiveDubBus()?.setSidVoicePan(i, pan); } catch { /* ok */ }
    });
  }, []);

  const handleReverb = useCallback((value: number) => {
    setReverb(value);
    const amount = value / 100;
    try {
      const bus = getActiveDubBus();
      if (bus) {
        for (let i = 0; i < 3; i++) bus.setSidVoiceReverbSend(i, amount);
      }
    } catch { /* ok */ }
  }, []);

  return (
    <div className={`flex flex-col gap-3 p-3 h-full ${className ?? ''}`}>
      {/* Top row: Stereo mode + Headphones */}
      <div className="flex items-center gap-3">
        <label className="text-[10px] font-mono text-text-secondary shrink-0">Stereo Enhance</label>
        <CustomSelect
          value={stereoMode}
          onChange={(v) => setStereoMode(v)}
          options={STEREO_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          className="bg-dark-bg border border-dark-border text-text-primary text-[10px] font-mono
                     px-2 py-1 rounded"
        />

        <div className="flex-1" />

        <label className="flex items-center gap-1.5 text-[10px] font-mono text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={headphones}
            onChange={e => setHeadphones(e.target.checked)}
            className="accent-accent-primary"
          />
          <Headphones size={12} />
          Headphones
        </label>
      </div>

      {/* Section header */}
      <div className="text-[10px] font-mono text-text-muted uppercase tracking-wide">
        Per-Voice Panning
      </div>

      {/* Voice sliders */}
      <div className="flex flex-col gap-2 flex-1">
        {voices.map((voice, i) => (
          <div key={voice.label} className="flex items-center gap-2">
            <span
              className="text-[10px] font-mono w-14 shrink-0"
              style={{ color: voice.color }}
            >
              {voice.label}
            </span>
            <span className="text-[9px] font-mono text-text-muted w-3">L</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={voice.pan}
              onChange={e => updateVoicePan(i, parseFloat(e.target.value))}
              className="flex-1 h-1 cursor-pointer"
              style={{ accentColor: voice.color }}
            />
            <span className="text-[9px] font-mono text-text-muted w-3">R</span>
            <span className="text-[10px] font-mono text-text-secondary w-14 text-right tabular-nums">
              {formatPan(voice.pan)}
            </span>
            <button
              onClick={() => updateVoicePan(i, 0)}
              className="text-text-muted hover:text-text-primary transition-colors p-0.5"
              title="Center"
            >
              <RotateCcw size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* Reverb slider — routes all voices to dry spring send */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-mono text-text-secondary w-14 shrink-0">Reverb</label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={reverb}
          onChange={e => handleReverb(parseInt(e.target.value))}
          className="flex-1 h-1 accent-accent-primary cursor-pointer"
        />
        <span className="text-[10px] font-mono text-accent-primary w-10 text-right tabular-nums">
          {reverb}%
        </span>
      </div>

      {/* Preset buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-dark-border/50">
        <span className="text-[10px] font-mono text-text-muted">Presets:</span>
        {[
          { label: 'Mono', preset: MONO_PRESET },
          { label: 'Wide', preset: WIDE_PRESET },
          { label: 'Crossfeed', preset: CROSSFEED_PRESET },
        ].map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.preset)}
            className="px-2 py-0.5 text-[10px] font-mono text-text-secondary
                       border border-dark-border rounded hover:bg-dark-bgHover
                       hover:text-text-primary transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};
