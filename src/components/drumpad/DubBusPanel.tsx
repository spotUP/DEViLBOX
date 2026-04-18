/**
 * DubBusPanel — shared send-FX bus for the drumpad.
 *
 * One SpringReverb + one SpaceEcho for the entire kit. Each pad's
 * `dubSend` feeds post-fader signal into this chain. Designed so dub /
 * sound-system tails can't stack into runaway feedback like per-pad
 * echo chains do.
 *
 * Rendered as a collapsible inline panel — click the "Dub Bus" button to
 * open. Emits no audio of its own until a pad with dubSend > 0 triggers.
 */

import React, { useState, useCallback } from 'react';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import type { DubBusSettings } from '@/types/drumpad';
import { Speaker } from 'lucide-react';

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}> = ({ label, value, min, max, step, onChange, format }) => (
  <label className="flex items-center gap-3 text-[11px] font-mono text-text-secondary">
    <span className="w-24 shrink-0">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1 accent-accent-primary"
    />
    <span className="w-14 shrink-0 text-right text-text-primary">
      {format ? format(value) : value.toFixed(2)}
    </span>
  </label>
);

export const DubBusPanel: React.FC = () => {
  const dubBus = useDrumPadStore((s) => s.dubBus);
  const setDubBus = useDrumPadStore((s) => s.setDubBus);
  const applySoundSystemToBank = useDrumPadStore((s) => s.applySoundSystemToBank);
  const [open, setOpen] = useState(false);

  const patch = useCallback((p: Partial<DubBusSettings>) => setDubBus(p), [setDubBus]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Dub Bus — shared send FX for all pads"
        className={`px-2 py-1 text-[10px] font-mono flex items-center gap-1 rounded border transition-colors ${
          dubBus.enabled
            ? 'bg-accent-primary/10 border-accent-primary text-accent-primary'
            : 'bg-dark-surface border-dark-border text-text-muted hover:text-text-primary'
        }`}
      >
        <Speaker size={12} />
        Dub Bus{dubBus.enabled ? ' · ON' : ''}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-80 bg-dark-bgSecondary border border-dark-border rounded shadow-xl p-3 flex flex-col gap-2"
          // Clicking inside the panel shouldn't close it
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-1 border-b border-dark-borderLight">
            <span className="text-xs font-bold text-text-primary">Dub Bus</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => applySoundSystemToBank()}
                className="px-2 py-0.5 text-[10px] font-mono bg-accent-primary/10 border border-accent-primary/50 text-accent-primary rounded hover:bg-accent-primary/20"
                title="Enable bus + set send=40% on every non-empty pad in this bank (kicks get 20%)"
              >
                Apply Sound System
              </button>
              <label className="flex items-center gap-1 text-[10px] font-mono text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={dubBus.enabled}
                  onChange={(e) => patch({ enabled: e.target.checked })}
                  className="accent-accent-primary"
                />
                Enabled
              </label>
            </div>
          </div>

          <Slider
            label="Return gain"
            value={dubBus.returnGain}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => patch({ returnGain: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="HPF cutoff"
            value={dubBus.hpfCutoff}
            min={20}
            max={600}
            step={5}
            onChange={(v) => patch({ hpfCutoff: v })}
            format={(v) => `${Math.round(v)} Hz`}
          />
          <div className="h-px bg-dark-borderLight my-1" />
          <Slider
            label="Spring wet"
            value={dubBus.springWet}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => patch({ springWet: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Echo intensity"
            value={dubBus.echoIntensity}
            min={0}
            max={0.85}
            step={0.01}
            onChange={(v) => patch({ echoIntensity: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Echo wet"
            value={dubBus.echoWet}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => patch({ echoWet: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Echo rate"
            value={dubBus.echoRateMs}
            min={80}
            max={800}
            step={5}
            onChange={(v) => patch({ echoRateMs: v })}
            format={(v) => `${Math.round(v)} ms`}
          />
          <Slider
            label="Sidechain duck"
            value={dubBus.sidechainAmount}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => patch({ sidechainAmount: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />

          {/* ── Dub Action settings — how much dub-throw/hold/mute pads inject ── */}
          <div className="h-px bg-dark-borderLight my-1" />
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Dub actions (deck taps)
          </div>
          <Slider
            label="Deck tap amount"
            value={dubBus.deckTapAmount}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => patch({ deckTapAmount: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Throw length"
            value={dubBus.throwBeats}
            min={0.125}
            max={4}
            step={0.125}
            onChange={(v) => patch({ throwBeats: v })}
            format={(v) => `${v.toFixed(2)} beats`}
          />
          <Slider
            label="Siren feedback"
            value={dubBus.sirenFeedback}
            min={0.5}
            max={0.95}
            step={0.01}
            onChange={(v) => patch({ sirenFeedback: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Filter drop"
            value={dubBus.filterDropHz}
            min={80}
            max={800}
            step={5}
            onChange={(v) => patch({ filterDropHz: v })}
            format={(v) => `${Math.round(v)} Hz`}
          />
        </div>
      )}
    </div>
  );
};
