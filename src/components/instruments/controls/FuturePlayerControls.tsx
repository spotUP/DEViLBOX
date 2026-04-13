/**
 * FuturePlayerControls.tsx — Future Player instrument editor
 *
 * Exposes all FuturePlayerConfig parameters: volume, 4-phase envelope
 * (attack/decay/sustain/release), pitch modulation 1 & 2 settings,
 * and sample modulation 1 & 2 settings.
 *
 * ─── Live edit ────────────────────────────────────────────────────────────────
 *
 * Every parameter knob writes through to the running FuturePlayer WASM via

 * `FuturePlayerEngine.writeByte(detailPtr + offset, value)`. The C side
 * (`fp_wasm_write_byte`) patches the same module_copy buffer that fp_init
 * runs against, and update_audio() reads the new value on the next tick.
 *
 * The address comes from FuturePlayerConfig.detailPtr (set by the parser)
 * plus the byte offset for each parameter (FP_DETAIL_OFFSET below). These
 * offsets match the ones the parser uses to READ the same fields, so the
 * read/write paths can never drift apart.
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { FuturePlayerConfig } from '@/types/instrument/exotic';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { EnvelopeVisualization, SampleBrowserPane } from '@components/instruments/shared';
import { FuturePlayerEngine } from '@/engine/futureplayer/FuturePlayerEngine';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { FP_DETAIL_OFFSET, FP_NEGATE_OFFSET } from '@/lib/futureplayer/detailOffsets';
import { CustomSelect } from '@components/common/CustomSelect';

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

  const { isCyan, knob, panelBg, panelStyle } = useInstrumentColors('#ffbb66');

  const upd = useCallback(<K extends keyof FuturePlayerConfig>(key: K, value: FuturePlayerConfig[K]) => {
    onChange({ [key]: value } as Partial<FuturePlayerConfig>);

    // Live-write to the running FuturePlayer WASM. The detail struct's byte
    // offset for this field is in FP_DETAIL_OFFSET; the absolute write
    // address is detailPtr + offset. detailPtr is set by the parser when
    // the instrument was discovered. Negate is a boolean and lives next to
    // the mode byte — encoded as 0/1.
    const cur = configRef.current;
    if (cur.detailPtr !== undefined && FuturePlayerEngine.hasInstance()) {
      const offset = FP_DETAIL_OFFSET[key];
      if (offset !== undefined && typeof value === 'number') {
        FuturePlayerEngine.getInstance().writeByte(cur.detailPtr + offset, value & 0xFF);
      }
      // Negate flags don't have a single offset entry but live at known
      // positions (pitchMod1Negate=detail+0x21, pitchMod2Negate=detail+0x29).
      else if (key === 'pitchMod1Negate' && typeof value === 'boolean') {
        FuturePlayerEngine.getInstance().writeByte(cur.detailPtr + FP_NEGATE_OFFSET.pitchMod1Negate, value ? 1 : 0);
      }
      else if (key === 'pitchMod2Negate' && typeof value === 'boolean') {
        FuturePlayerEngine.getInstance().writeByte(cur.detailPtr + FP_NEGATE_OFFSET.pitchMod2Negate, value ? 1 : 0);
      }
    }

    // Also push via setInstrumentParam (no-op until C side handles it)
    if (typeof value === 'number' && FuturePlayerEngine.hasInstance()) {
      FuturePlayerEngine.getInstance().setInstrumentParam(0, key, value);
    }
  }, [onChange]);

  // ── Tab buttons ─────────────────────────────────────────────────────────

  const tabs: { id: FPTab; label: string }[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'pitchMod', label: 'Pitch Mod' },
    { id: 'sampleMod', label: 'Sample Mod' },
  ];

  // ── Sample browser pane ──────────────────────────────────────────────────
  // Future Player stores its sample data off-module (pointed at by
  // instr_ptr + 8). What the config actually carries is `sampleSize` and
  // `isWavetable` — enough for a cross-instrument summary. Walk every
  // FuturePlayerSynth instrument in the store and emit one row each.
  const [showSamplePane, setShowSamplePane] = useState(false);
  const allInstruments = useInstrumentStore((s) => s.instruments);
  const sampleRows = useMemo(() => {
    return allInstruments
      .filter((inst) => inst.synthType === 'FuturePlayerSynth' && inst.futurePlayer)
      .map((inst) => {
        const c = inst.futurePlayer!;
        return {
          id: inst.id,
          instrName: inst.name || `#${inst.id}`,
          size: c.sampleSize,
          isWavetable: c.isWavetable,
          isCurrent: c === config,
        };
      });
  }, [allInstruments, config]);

  return (
    <div className="flex h-full">
      <div className="p-3 space-y-3 flex-1 min-w-0 overflow-y-auto">
      {/* Type badge */}
      <div className="flex items-center gap-2 text-xs">
        <span className={`px-2 py-0.5 rounded ${isCyan ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-orange-900/30 text-orange-300'}`}>
          {config.isWavetable ? 'Wavetable' : 'PCM Sample'}
        </span>
        {config.sampleSize > 0 && (
          <span className="text-text-muted">{config.sampleSize} bytes</span>
        )}
        <button
          onClick={() => setShowSamplePane((v) => !v)}
          title={`${showSamplePane ? 'Hide' : 'Show'} sample browser`}
          className={`ml-auto px-2 py-0.5 rounded text-[10px] font-mono border ${
            showSamplePane
              ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/60'
              : 'bg-dark-bg text-text-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50'
          }`}
        >
          SMP
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-dark-border pb-1">
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
          {/* Volume */}
          <div className={`rounded border p-3 ${panelBg}`} style={panelStyle}>
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
          <div className={`rounded border p-3 ${panelBg}`} style={panelStyle}>
            <div className="text-xs font-semibold text-text-secondary mb-2">Envelope</div>
            <div className="grid grid-cols-4 gap-3">
              <Knob label="Atk Rate" value={config.attackRate} min={0} max={255} step={1}
                onChange={(v) => upd('attackRate', v)} color={knob} />
              <Knob label="Atk Peak" value={config.attackPeak} min={0} max={255} step={1}
                onChange={(v) => upd('attackPeak', v)} color={knob} />
              <Knob label="Dec Rate" value={config.decayRate} min={0} max={255} step={1}
                onChange={(v) => upd('decayRate', v)} color={knob} />
              <Knob label="Sus Level" value={config.sustainLevel} min={0} max={255} step={1}
                onChange={(v) => upd('sustainLevel', v)} color={knob} />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3">
              <Knob label="Sus Rate" value={config.sustainRate & 0x7F} min={0} max={127} step={1}
                onChange={(v) => upd('sustainRate', (config.sustainRate & 0x80) | (v & 0x7F))} color={knob} />
              <Knob label="Sus Target" value={config.sustainTarget} min={0} max={255} step={1}
                onChange={(v) => upd('sustainTarget', v)} color={knob} />
              <Knob label="Rel Rate" value={config.releaseRate} min={0} max={255} step={1}
                onChange={(v) => upd('releaseRate', v)} color={knob} />
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

          {/* Envelope visualization */}
          <div className={`rounded border p-2 ${panelBg}`} style={{ ...panelStyle, height: 96 }}>
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
        </div>
      )}

      {/* ═══════════ PITCH MOD TAB ═══════════ */}
      {activeTab === 'pitchMod' && (
        <div className="space-y-3">
          {/* Pitch Mod 1 */}
          <div className={`rounded border p-3 ${panelBg}`} style={panelStyle}>
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
                  onChange={(v) => upd('pitchMod1Delay', v)} color={knob} />
                <Knob label="Shift" value={config.pitchMod1Shift} min={0} max={7} step={1}
                  onChange={(v) => upd('pitchMod1Shift', v)} color={knob} />
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Mode</div>
                  <CustomSelect
                    className="bg-dark-bg border border-dark-border text-text-primary text-xs rounded px-1 py-0.5 focus:outline-none focus:border-accent-primary"
                    value={String(config.pitchMod1Mode === 0 ? 0 : config.pitchMod1Mode === 1 ? 1 : 128)}
                    onChange={(v) => upd('pitchMod1Mode', Number(v))}
                    options={[
                      { value: '0', label: 'Loop' },
                      { value: '1', label: 'Continue' },
                      { value: '128', label: 'One-shot' },
                    ]}
                  />
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Negate</div>
                  <button
                    onClick={() => upd('pitchMod1Negate', !config.pitchMod1Negate)}
                    className={`px-2 py-1 text-xs rounded ${
                      config.pitchMod1Negate
                        ? 'bg-accent-error/40 text-accent-error'
                        : (isCyan ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-accent-success/40 text-accent-success')
                    }`}
                  >
                    {config.pitchMod1Negate ? 'Yes' : 'No'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pitch Mod 2 */}
          <div className={`rounded border p-3 ${panelBg}`} style={panelStyle}>
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
                  onChange={(v) => upd('pitchMod2Delay', v)} color={knob} />
                <Knob label="Shift" value={config.pitchMod2Shift} min={0} max={7} step={1}
                  onChange={(v) => upd('pitchMod2Shift', v)} color={knob} />
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Mode</div>
                  <CustomSelect
                    className="bg-dark-bg border border-dark-border text-text-primary text-xs rounded px-1 py-0.5 focus:outline-none focus:border-accent-primary"
                    value={String(config.pitchMod2Mode === 0 ? 0 : config.pitchMod2Mode === 1 ? 1 : 128)}
                    onChange={(v) => upd('pitchMod2Mode', Number(v))}
                    options={[
                      { value: '0', label: 'Loop' },
                      { value: '1', label: 'Continue' },
                      { value: '128', label: 'One-shot' },
                    ]}
                  />
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Negate</div>
                  <button
                    onClick={() => upd('pitchMod2Negate', !config.pitchMod2Negate)}
                    className={`px-2 py-1 text-xs rounded ${
                      config.pitchMod2Negate
                        ? 'bg-accent-error/40 text-accent-error'
                        : (isCyan ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-accent-success/40 text-accent-success')
                    }`}
                  >
                    {config.pitchMod2Negate ? 'Yes' : 'No'}
                  </button>
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
          <div className={`rounded border p-3 ${panelBg}`} style={panelStyle}>
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
              <div className="grid grid-cols-4 gap-3">
                <Knob label="Delay" value={config.sampleMod1Delay} min={0} max={255} step={1}
                  onChange={(v) => upd('sampleMod1Delay', v)} color={knob} />
                <Knob label="Shift" value={config.sampleMod1Shift} min={0} max={7} step={1}
                  onChange={(v) => upd('sampleMod1Shift', v)} color={knob} />
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Mode</div>
                  <CustomSelect
                    className="bg-dark-bg border border-dark-border text-text-primary text-xs rounded px-1 py-0.5 focus:outline-none focus:border-accent-primary"
                    value={String(config.sampleMod1Mode === 0 ? 0 : (config.sampleMod1Mode & 0x80) ? 128 : 1)}
                    onChange={(v) => upd('sampleMod1Mode', Number(v))}
                    options={[
                      { value: '0', label: 'Loop' },
                      { value: '1', label: 'Continue' },
                      { value: '128', label: 'One-shot' },
                    ]}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sample Mod 2 */}
          <div className={`rounded border p-3 ${panelBg}`} style={panelStyle}>
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
              <div className="grid grid-cols-4 gap-3">
                <Knob label="Delay" value={config.sampleMod2Delay} min={0} max={255} step={1}
                  onChange={(v) => upd('sampleMod2Delay', v)} color={knob} />
                <Knob label="Shift" value={config.sampleMod2Shift} min={0} max={7} step={1}
                  onChange={(v) => upd('sampleMod2Shift', v)} color={knob} />
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-text-muted mb-1">Mode</div>
                  <CustomSelect
                    className="bg-dark-bg border border-dark-border text-text-primary text-xs rounded px-1 py-0.5 focus:outline-none focus:border-accent-primary"
                    value={String(config.sampleMod2Mode === 0 ? 0 : (config.sampleMod2Mode & 0x80) ? 128 : 1)}
                    onChange={(v) => upd('sampleMod2Mode', Number(v))}
                    options={[
                      { value: '0', label: 'Loop' },
                      { value: '1', label: 'Continue' },
                      { value: '128', label: 'One-shot' },
                    ]}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Sample browser pane (toggle via SMP button) */}
      {showSamplePane && (
        <SampleBrowserPane
          entries={sampleRows.map((s) => ({
            id: s.id,
            name: `${String(s.id).padStart(2, '0')}. ${s.instrName}`,
            sizeBytes: s.size,
            isCurrent: s.isCurrent,
          }))}
          emptyMessage="No Future Player instruments loaded."
          renderEntry={(entry) => {
            const s = sampleRows.find((r) => r.id === entry.id)!;
            return (
              <>
                <div className={`font-mono truncate ${s.isCurrent ? 'text-accent-primary' : 'text-text-primary'}`}>
                  {String(s.id).padStart(2, '0')}. {s.instrName}
                </div>
                <div className="text-text-muted mt-0.5">
                  {s.size > 0 ? `${s.size} bytes` : '\u2014'}
                </div>
                <div className="mt-0.5 text-[9px]">
                  <span className={s.isWavetable ? 'text-accent-highlight' : 'text-accent-secondary'}>
                    {s.isWavetable ? 'WAVETABLE' : 'PCM'}
                  </span>
                  {s.isCurrent && <span className="ml-1 text-accent-primary">(this instrument)</span>}
                </div>
              </>
            );
          }}
        />
      )}
    </div>
  );
};
