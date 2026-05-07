/**
 * KKLightGuidePanel — compact settings panel for configuring the KK keyboard
 * Light Guide (key LED colors).
 *
 * Can be embedded in NKSSetupWizard or the Settings modal.
 */

import React, { useState, useCallback } from 'react';
import { setKKLightGuide } from '@hooks/useKKDawIntegration';
import {
  LGColor, SCALE_NAMES,
  type LGMode, type LGConfig,
  DEFAULT_LG_CONFIG,
} from '@/midi/kk/KKLightGuide';
import { getKKDawSurface } from '@/midi/kk/KKDawSurface';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const COLOR_OPTIONS: { value: LGColor; label: string; swatch: string }[] = [
  { value: LGColor.Off,          label: 'Off',         swatch: '#111' },
  { value: LGColor.DarkBlue,     label: 'Dark Blue',   swatch: '#003080' },
  { value: LGColor.Blue,         label: 'Blue',        swatch: '#2060ff' },
  { value: LGColor.Cyan,         label: 'Cyan',        swatch: '#00c8c8' },
  { value: LGColor.Green,        label: 'Green',       swatch: '#00c040' },
  { value: LGColor.YellowGreen,  label: 'Yellow-Green',swatch: '#80c000' },
  { value: LGColor.Yellow,       label: 'Yellow',      swatch: '#c0c000' },
  { value: LGColor.Orange,       label: 'Orange',      swatch: '#c06000' },
  { value: LGColor.Red,          label: 'Red',         swatch: '#c00000' },
  { value: LGColor.Pink,         label: 'Pink',        swatch: '#c03070' },
  { value: LGColor.Magenta,      label: 'Magenta',     swatch: '#a000a0' },
  { value: LGColor.Purple,       label: 'Purple',      swatch: '#6000c0' },
  { value: LGColor.White,        label: 'White',       swatch: '#c0c0c0' },
  { value: LGColor.LightBlue,    label: 'Light Blue',  swatch: '#4090ff' },
  { value: LGColor.LightGreen,   label: 'Light Green', swatch: '#40d080' },
  { value: LGColor.LightOrange,  label: 'Light Orange',swatch: '#d08040' },
];

const SCALE_DISPLAY: Record<string, string> = {
  major: 'Major',
  minor: 'Minor',
  harmonicMinor: 'Harmonic Minor',
  melodicMinor: 'Melodic Minor',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  pentatonicMajor: 'Pentatonic Major',
  pentatonicMinor: 'Pentatonic Minor',
  blues: 'Blues',
  chromatic: 'Chromatic',
};

export const KKLightGuidePanel: React.FC = () => {
  const [cfg, setCfg] = useState<LGConfig>({ ...DEFAULT_LG_CONFIG });

  const update = useCallback((patch: Partial<LGConfig>) => {
    setCfg(prev => {
      const next = { ...prev, ...patch };
      setKKLightGuide(next);
      return next;
    });
  }, []);

  const connected = getKKDawSurface().lightGuide.connected;

  return (
    <div className="space-y-3">
      {/* Connection indicator */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-accent-success' : 'bg-dark-borderLight'}`} />
        <span className="text-[10px] font-mono text-text-muted">
          {connected ? 'Light Guide connected' : 'No KK keyboard detected'}
        </span>
      </div>

      {/* Mode */}
      <div>
        <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-1">Mode</label>
        <div className="flex gap-1 flex-wrap">
          {(['off', 'scale', 'chord', 'playing'] as LGMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => update({ mode })}
              className={`px-2 py-1 rounded text-[10px] font-mono capitalize transition-colors ${
                cfg.mode === mode
                  ? 'bg-accent-primary/30 text-accent-primary border border-accent-primary/50'
                  : 'bg-dark-bgTertiary text-text-secondary border border-dark-borderLight hover:text-text-primary'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Scale settings (shown when mode = scale or chord) */}
      {(cfg.mode === 'scale' || cfg.mode === 'chord') && (
        <>
          <div className="flex gap-2">
            {/* Root note */}
            <div className="flex-1">
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-1">Root</label>
              <select
                value={cfg.root}
                onChange={e => update({ root: parseInt(e.target.value) })}
                className="w-full bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-1 text-[11px] text-text-primary font-mono focus:outline-none"
              >
                {NOTE_NAMES.map((n, i) => (
                  <option key={i} value={i}>{n}</option>
                ))}
              </select>
            </div>

            {/* Scale type */}
            <div className="flex-2 min-w-0">
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-1">Scale</label>
              <select
                value={cfg.scale}
                onChange={e => update({ scale: e.target.value })}
                className="w-full bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-1 text-[11px] text-text-primary font-mono focus:outline-none"
              >
                {SCALE_NAMES.map(s => (
                  <option key={s} value={s}>{SCALE_DISPLAY[s] ?? s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Colors */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-1">Scale Color</label>
              <ColorPicker value={cfg.scaleColor} onChange={v => update({ scaleColor: v })} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-1">Root Color</label>
              <ColorPicker value={cfg.rootColor} onChange={v => update({ rootColor: v })} />
            </div>
          </div>
        </>
      )}

      {/* Playing color */}
      {cfg.mode !== 'off' && (
        <div>
          <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-1">Playing Color</label>
          <ColorPicker value={cfg.playingColor} onChange={v => update({ playingColor: v })} />
        </div>
      )}
    </div>
  );
};

// ── Color picker ──────────────────────────────────────────────────────────────

const ColorPicker: React.FC<{ value: LGColor; onChange: (v: LGColor) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-1">
    {COLOR_OPTIONS.map(opt => (
      <button
        key={opt.value}
        title={opt.label}
        onClick={() => onChange(opt.value)}
        className={`w-4 h-4 rounded-sm transition-all ${value === opt.value ? 'ring-1 ring-white scale-125' : 'opacity-70 hover:opacity-100'}`}
        style={{ background: opt.swatch }}
      />
    ))}
  </div>
);
