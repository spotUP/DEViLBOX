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

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import type { DubBusSettings } from '@/types/dub';
import { Speaker } from 'lucide-react';

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}> = ({ label, value, min, max, step, onChange, format, disabled }) => (
  <label className={`flex items-center gap-3 text-[11px] font-mono ${disabled ? 'text-text-muted opacity-50' : 'text-text-secondary'}`}>
    <span className="w-24 shrink-0">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1 accent-accent-primary disabled:cursor-not-allowed"
    />
    <span className="w-14 shrink-0 text-right text-text-primary">
      {format ? format(value) : value.toFixed(2)}
    </span>
  </label>
);

const Choice = <V extends string>({ label, value, options, onChange }: {
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (v: V) => void;
}) => (
  <label className="flex items-center gap-3 text-[11px] font-mono text-text-secondary">
    <span className="w-24 shrink-0">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as V)}
      className="flex-1 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary px-2 py-0.5 text-[11px] font-mono"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);

export const DubBusPanel: React.FC = () => {
  const dubBus = useDrumPadStore((s) => s.dubBus);
  const setDubBus = useDrumPadStore((s) => s.setDubBus);
  const applySoundSystemToBank = useDrumPadStore((s) => s.applySoundSystemToBank);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const patch = useCallback((p: Partial<DubBusSettings>) => setDubBus(p), [setDubBus]);

  // Close on click/tap outside, and on Esc. Only wire listeners while open so
  // we're not paying for a global mousedown listener when the panel is closed.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (target && wrapperRef.current && !wrapperRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
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
              {/* KILL — hard-flush the bus. Fires the `dub-panic` event which
                  the engines' mount-useEffects listen to; they run
                  engine.dubPanic() which closes every tap, zeroes feedback,
                  opens the LPF, and drains the SpaceEcho + SpringReverb
                  internal delay lines. Rescues the set when a hold pad got
                  stuck or the echo feedback ran away. Also disables the bus
                  in the store so the UI reflects the kill. */}
              <button
                onClick={() => {
                  window.dispatchEvent(new Event('dub-panic'));
                }}
                className="px-2 py-0.5 text-[10px] font-mono bg-accent-error/10 border border-accent-error/50 text-accent-error rounded hover:bg-accent-error/20"
                title="Kill the dub bus — drains echo + spring, resets taps, disables bus"
              >
                KILL
              </button>
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
          <div className="h-px bg-dark-borderLight my-1" />
          {/* Plate-stage insert — optional post-processing plate reverb
              fed from stereoMerge. Adds a colored tail on top of the
              spring+echo chain; doesn't replace either. Pairs with the
              corresponding Master FX preset for max character. */}
          <Choice
            label="Plate stage"
            value={dubBus.plateStage}
            options={[
              { value: 'off',          label: 'Off' },
              { value: 'madprofessor', label: 'Mad Professor (PCM-70)' },
              { value: 'dattorro',     label: 'Dattorro (metallic plate)' },
            ] as const}
            onChange={(v) => patch({ plateStage: v })}
          />
          <Slider
            label="Plate mix"
            value={dubBus.plateStageMix}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => patch({ plateStageMix: v })}
            format={(v) => `${Math.round(v * 100)}%`}
            disabled={dubBus.plateStage === 'off'}
          />
          <div className="h-px bg-dark-borderLight my-1" />
          <Choice
            label="Echo sync"
            value={dubBus.echoSyncDivision}
            options={[
              { value: 'off',  label: 'Off (manual ms)' },
              { value: '1/2',  label: 'Half note (long)' },
              { value: '1/4',  label: 'Quarter (on-beat)' },
              { value: '1/8D', label: 'Dotted 1/8 (dub skank)' },
              { value: '1/8',  label: 'Eighth' },
              { value: '1/16', label: 'Sixteenth (dense)' },
            ] as const}
            onChange={(v) => patch({ echoSyncDivision: v })}
          />
          <Slider
            label="Echo rate"
            value={dubBus.echoRateMs}
            min={80}
            max={800}
            step={5}
            onChange={(v) => patch({ echoRateMs: v })}
            disabled={dubBus.echoSyncDivision !== 'off'}
            format={(v) =>
              dubBus.echoSyncDivision === 'off' ? `${Math.round(v)} ms` : 'synced'
            }
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
          {/* G13: sidechain source selector. 'bus' = self-compression
              (classic pumping dub); 'channel' = a specific tracker channel
              triggers the duck, so a kick on ch1 can pump the dub return
              even when it isn't in the bus mix. */}
          <Choice
            label="SC source"
            value={dubBus.sidechainSource}
            options={[
              { value: 'bus', label: 'Bus (self)' },
              { value: 'channel', label: 'Channel…' },
            ] as const}
            onChange={(v) => patch({ sidechainSource: v })}
          />
          {dubBus.sidechainSource === 'channel' && (
            <label className="flex items-center gap-3 text-[11px] font-mono text-text-secondary">
              <span className="w-24 shrink-0">SC channel</span>
              <input
                type="number"
                min={1}
                max={32}
                value={dubBus.sidechainChannelIndex + 1}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) {
                    patch({ sidechainChannelIndex: Math.max(0, Math.min(31, n - 1)) });
                  }
                }}
                className="flex-1 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary px-2 py-0.5 text-[11px] font-mono"
              />
            </label>
          )}

          {/* ── Engineer character preset — curated snapshot of coloring ── */}
          <div className="h-px bg-dark-borderLight my-1" />
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Engineer voicing
          </div>
          <Choice
            label="Character"
            value={dubBus.characterPreset}
            options={[
              { value: 'custom',       label: 'Custom (manual)' },
              { value: 'tubby',        label: 'King Tubby (weight)' },
              { value: 'scientist',    label: 'Scientist (hollow)' },
              { value: 'perry',        label: 'Lee Perry (wild)' },
              { value: 'madProfessor', label: 'Mad Professor (wide)' },
              { value: 'gatedFlanger', label: 'Gated Flanger (80s)' },
            ] as const}
            onChange={(v) => patch({ characterPreset: v })}
          />

          {/* ── Sound coloring — bass shelf + mid scoop + stereo width ── */}
          <div className="h-px bg-dark-borderLight my-1" />
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Sound coloring
          </div>
          <Slider
            label="Bass shelf"
            value={dubBus.bassShelfGainDb}
            min={-6}
            max={12}
            step={0.5}
            onChange={(v) => patch({ bassShelfGainDb: v })}
            format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
          />
          <Slider
            label="Mid scoop"
            value={dubBus.midScoopGainDb}
            min={-12}
            max={3}
            step={0.5}
            onChange={(v) => patch({ midScoopGainDb: v })}
            format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
          />
          <Slider
            label="Stereo width"
            value={dubBus.stereoWidth}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => patch({ stereoWidth: v })}
            format={(v) => v === 0 ? 'mono' : v === 1 ? 'stereo' : `${v.toFixed(2)}×`}
          />
          <Choice
            label="Tape sat mode"
            value={dubBus.tapeSatMode}
            options={[
              { value: 'single',    label: 'Single (30 ips)' },
              { value: 'stack',     label: 'Stack (Perry 4-track)' },
              { value: 'tape15ips', label: 'Tape 15 ips (heavier)' },
            ] as const}
            onChange={(v) => patch({ tapeSatMode: v })}
          />
          <label className="flex items-center gap-3 text-[11px] font-mono text-text-secondary">
            <span className="w-24 shrink-0">HPF stepped</span>
            <input
              type="checkbox"
              checked={dubBus.hpfStepped}
              onChange={(e) => patch({ hpfStepped: e.target.checked })}
              className="accent-accent-primary"
            />
            <span className="text-[10px] text-text-muted">
              {dubBus.hpfStepped ? 'Altec "Big Knob" — snaps to 11 positions' : 'continuous sweep'}
            </span>
          </label>

          {/* ── Liquid sweep — parallel short-delay comb filter (flanger) ── */}
          <div className="h-px bg-dark-borderLight my-1" />
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Liquid sweep (flanger)
          </div>
          <Slider
            label="Sweep amount"
            value={dubBus.sweepAmount}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => patch({ sweepAmount: v })}
            format={(v) => v === 0 ? 'off' : `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Sweep rate"
            value={dubBus.sweepRateHz}
            min={0.05}
            max={5}
            step={0.05}
            onChange={(v) => patch({ sweepRateHz: v })}
            format={(v) => `${v.toFixed(2)} Hz`}
            disabled={dubBus.sweepAmount === 0}
          />
          <Slider
            label="Sweep depth"
            value={dubBus.sweepDepthMs}
            min={0.5}
            max={10}
            step={0.1}
            onChange={(v) => patch({ sweepDepthMs: v })}
            format={(v) => `${v.toFixed(1)} ms`}
            disabled={dubBus.sweepAmount === 0}
          />
          <Slider
            label="Sweep feedback"
            value={dubBus.sweepFeedback}
            min={0}
            max={0.85}
            step={0.01}
            onChange={(v) => patch({ sweepFeedback: v })}
            format={(v) => `${Math.round(v * 100)}%`}
            disabled={dubBus.sweepAmount === 0}
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
          <Choice
            label="Throw quantize"
            value={dubBus.throwQuantize}
            options={[
              { value: 'off',     label: 'Off (immediate)' },
              { value: '1/16',    label: '1/16 (tight grid)' },
              { value: '1/8',     label: '1/8 (half beat)' },
              { value: 'offbeat', label: 'Offbeat (King Tubby)' },
              { value: 'bar',     label: 'Bar (downbeat)' },
            ] as const}
            onChange={(v) => patch({ throwQuantize: v })}
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
