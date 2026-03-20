/**
 * FuturePlayerControls.tsx — Future Player instrument editor
 *
 * Exposes all FuturePlayerConfig parameters: volume, 4-phase envelope
 * (attack/decay/sustain/release), pitch modulation 1 & 2 settings,
 * and sample modulation 1 & 2 settings.
 *
 * Future Player is a WASM-only synth — parameter edits update the config
 * for display purposes. Live playback uses the original binary instrument
 * data via the FuturePlayerEngine WASM.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { FuturePlayerConfig } from '@/types/instrument/exotic';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { EnvelopeVisualization } from '@components/instruments/shared';

// ── Tab type ────────────────────────────────────────────────────────────────

type FPTab = 'envelope' | 'pitchMod' | 'sampleMod';

// ── Props ───────────────────────────────────────────────────────────────────

interface FuturePlayerControlsProps {
  config: FuturePlayerConfig;
  onChange: (updates: Partial<FuturePlayerConfig>) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export const FuturePlayerControls: React.FC<FuturePlayerControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<FPTab>('envelope');

  // configRef pattern: prevents stale closures in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const knob    = isCyan ? '#00ffff' : '#ffbb66';
  const panelBg = isCyan ? 'bg-[#041510] border-accent-highlight/20' : 'bg-[#1a0e00] border-orange-900/30';

  const upd = useCallback(<K extends keyof FuturePlayerConfig>(key: K, value: FuturePlayerConfig[K]) => {
    onChange({ [key]: value } as Partial<FuturePlayerConfig>);
  }, [onChange]);

  // ── Tab buttons ─────────────────────────────────────────────────────────

  const tabs: { id: FPTab; label: string }[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'pitchMod', label: 'Pitch Mod' },
    { id: 'sampleMod', label: 'Sample Mod' },
  ];

  return (
    <div className="p-3 space-y-3">
      {/* Type badge */}
      <div className="flex items-center gap-2 text-xs">
        <span className={`px-2 py-0.5 rounded ${isCyan ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-orange-900/30 text-orange-300'}`}>
          {config.isWavetable ? 'Wavetable' : 'PCM Sample'}
        </span>
        {config.sampleSize > 0 && (
          <span className="text-text-muted">{config.sampleSize} bytes</span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border-subtle pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1 text-xs rounded-t transition-colors ${
              activeTab === t.id
                ? (isCyan ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-orange-900/40 text-orange-300')
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ ENVELOPE TAB ═══════════ */}
      {activeTab === 'envelope' && (
        <div className="space-y-3">
          {/* Envelope visualization */}
          <div className={`rounded border p-2 ${panelBg}`} style={{ height: 96 }}>
            <EnvelopeVisualization
              mode="steps"
              attackVol={config.attackPeak}
              attackSpeed={config.attackRate || 1}
              decayVol={config.sustainLevel}
              decaySpeed={config.decayRate || 1}
              sustainVol={config.sustainTarget}
              sustainLen={16}
              releaseVol={0}
              releaseSpeed={config.releaseRate || 1}
              maxVol={255}
              color={knob}
              height={72}
            />
          </div>

          {/* Volume */}
          <div className={`rounded border p-3 ${panelBg}`}>
            <div className="text-xs font-semibold text-text-secondary mb-2">Volume</div>
            <div className="flex justify-center">
              <Knob
                label="Volume"
                value={config.volume}
                min={0} max={255} step={1}
                onChange={(v) => upd('volume', v)}
                size="md"
                color={knob}
              />
            </div>
          </div>

          {/* ADSR */}
          <div className={`rounded border p-3 ${panelBg}`}>
            <div className="text-xs font-semibold text-text-secondary mb-2">Envelope</div>
            <div className="grid grid-cols-4 gap-3">
              <Knob label="Atk Rate" value={config.attackRate} min={0} max={255} step={1}
                onChange={(v) => upd('attackRate', v)} size="sm" color={knob} />
              <Knob label="Atk Peak" value={config.attackPeak} min={0} max={255} step={1}
                onChange={(v) => upd('attackPeak', v)} size="sm" color={knob} />
              <Knob label="Dec Rate" value={config.decayRate} min={0} max={255} step={1}
                onChange={(v) => upd('decayRate', v)} size="sm" color={knob} />
              <Knob label="Sus Level" value={config.sustainLevel} min={0} max={255} step={1}
                onChange={(v) => upd('sustainLevel', v)} size="sm" color={knob} />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3">
              <Knob label="Sus Rate" value={config.sustainRate & 0x7F} min={0} max={127} step={1}
                onChange={(v) => upd('sustainRate', (config.sustainRate & 0x80) | (v & 0x7F))} size="sm" color={knob} />
              <Knob label="Sus Target" value={config.sustainTarget} min={0} max={255} step={1}
                onChange={(v) => upd('sustainTarget', v)} size="sm" color={knob} />
              <Knob label="Rel Rate" value={config.releaseRate} min={0} max={255} step={1}
                onChange={(v) => upd('releaseRate', v)} size="sm" color={knob} />
              <div className="flex flex-col items-center">
                <div className="text-[9px] text-text-muted mb-1">Sus Dir</div>
                <button
                  onClick={() => upd('sustainRate', config.sustainRate ^ 0x80)}
                  className={`px-2 py-1 text-xs rounded ${
                    config.sustainRate & 0x80
                      ? 'bg-red-900/40 text-red-300'
                      : (isCyan ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-green-900/40 text-green-300')
                  }`}
                >
                  {config.sustainRate & 0x80 ? 'Down' : 'Up'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ PITCH MOD TAB ═══════════ */}
      {activeTab === 'pitchMod' && (
        <div className="space-y-3">
          {/* Pitch Mod 1 */}
          <div className={`rounded border p-3 ${panelBg}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xs font-semibold text-text-secondary">Pitch Mod 1</div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                config.hasPitchMod1
                  ? (isCyan ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-green-900/40 text-green-300')
                  : 'bg-bg-tertiary text-text-muted'
              }`}>
                {config.hasPitchMod1 ? 'Active' : 'None'}
              </span>
            </div>
            {config.hasPitchMod1 && (
              <div className="grid grid-cols-4 gap-3">
                <Knob label="Delay" value={config.pitchMod1Delay} min={0} max={255} step={1}
                  onChange={(v) => upd('pitchMod1Delay', v)} size="sm" color={knob} />
                <Knob label="Shift" value={config.pitchMod1Shift} min={0} max={7} step={1}
                  onChange={(v) => upd('pitchMod1Shift', v)} size="sm" color={knob} />
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Mode</div>
                  <div className="text-xs text-text-primary">
                    {config.pitchMod1Mode === 0 ? 'Loop' : config.pitchMod1Mode === 1 ? 'Continue' : 'One-shot'}
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Negate</div>
                  <div className={`text-xs ${config.pitchMod1Negate ? 'text-red-300' : 'text-text-muted'}`}>
                    {config.pitchMod1Negate ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pitch Mod 2 */}
          <div className={`rounded border p-3 ${panelBg}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xs font-semibold text-text-secondary">Pitch Mod 2</div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                config.hasPitchMod2
                  ? (isCyan ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-green-900/40 text-green-300')
                  : 'bg-bg-tertiary text-text-muted'
              }`}>
                {config.hasPitchMod2 ? 'Active' : 'None'}
              </span>
            </div>
            {config.hasPitchMod2 && (
              <div className="grid grid-cols-4 gap-3">
                <Knob label="Delay" value={config.pitchMod2Delay} min={0} max={255} step={1}
                  onChange={(v) => upd('pitchMod2Delay', v)} size="sm" color={knob} />
                <Knob label="Shift" value={config.pitchMod2Shift} min={0} max={7} step={1}
                  onChange={(v) => upd('pitchMod2Shift', v)} size="sm" color={knob} />
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Mode</div>
                  <div className="text-xs text-text-primary">
                    {config.pitchMod2Mode === 0 ? 'Loop' : config.pitchMod2Mode === 1 ? 'Continue' : 'One-shot'}
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Negate</div>
                  <div className={`text-xs ${config.pitchMod2Negate ? 'text-red-300' : 'text-text-muted'}`}>
                    {config.pitchMod2Negate ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ SAMPLE MOD TAB ═══════════ */}
      {activeTab === 'sampleMod' && (
        <div className="space-y-3">
          {/* Sample Mod 1 */}
          <div className={`rounded border p-3 ${panelBg}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xs font-semibold text-text-secondary">Sample Mod 1</div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                config.hasSampleMod1
                  ? (isCyan ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-green-900/40 text-green-300')
                  : 'bg-bg-tertiary text-text-muted'
              }`}>
                {config.hasSampleMod1 ? 'Active' : 'None'}
              </span>
            </div>
            {config.hasSampleMod1 && (
              <div className="grid grid-cols-3 gap-3">
                <Knob label="Delay" value={config.sampleMod1Delay} min={0} max={255} step={1}
                  onChange={(v) => upd('sampleMod1Delay', v)} size="sm" color={knob} />
                <Knob label="Shift" value={config.sampleMod1Shift} min={0} max={7} step={1}
                  onChange={(v) => upd('sampleMod1Shift', v)} size="sm" color={knob} />
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Mode</div>
                  <div className="text-xs text-text-primary">
                    {config.sampleMod1Mode === 0 ? 'Loop' : config.sampleMod1Mode & 0x80 ? 'One-shot' : 'Continue'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sample Mod 2 */}
          <div className={`rounded border p-3 ${panelBg}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xs font-semibold text-text-secondary">Sample Mod 2</div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                config.hasSampleMod2
                  ? (isCyan ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-green-900/40 text-green-300')
                  : 'bg-bg-tertiary text-text-muted'
              }`}>
                {config.hasSampleMod2 ? 'Active' : 'None'}
              </span>
            </div>
            {config.hasSampleMod2 && (
              <div className="grid grid-cols-3 gap-3">
                <Knob label="Delay" value={config.sampleMod2Delay} min={0} max={255} step={1}
                  onChange={(v) => upd('sampleMod2Delay', v)} size="sm" color={knob} />
                <Knob label="Shift" value={config.sampleMod2Shift} min={0} max={7} step={1}
                  onChange={(v) => upd('sampleMod2Shift', v)} size="sm" color={knob} />
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Mode</div>
                  <div className="text-xs text-text-primary">
                    {config.sampleMod2Mode === 0 ? 'Loop' : config.sampleMod2Mode & 0x80 ? 'One-shot' : 'Continue'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
