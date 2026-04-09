/**
 * InstrumentKnobPanel — Unified synth parameter panel that follows the cursor channel.
 * Replaces the old TB303KnobPanel + SCKnobPanel: shows appropriate controls
 * based on the instrument assigned to the channel under the cursor.
 *
 * - TB303 → Full JC303StyledKnobPanel (hardware UI)
 * - SuperCollider → SC parameter sliders
 * - Other synths → Generic oscillator/envelope/filter knobs
 */

import React, { useCallback, useRef, memo, useState, useMemo, Suspense, lazy } from 'react';
import { useInstrumentStore, useUIStore, useMIDIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp, X, ExternalLink, Undo2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { JC303StyledKnobPanel } from '@components/instruments/controls/JC303StyledKnobPanel';
import { PopOutWindow, focusPopout } from '@components/ui/PopOutWindow';
import { ScrollLockContainer } from '@components/ui/ScrollLockContainer';
import { Knob } from '@components/controls/Knob';
import { SynthControlsRouter } from './SynthControlsRouter';
import type { TB303Config, EffectConfig, InstrumentConfig, SynthType } from '@typedefs/instrument';
import type { InstrumentEffectsPanelHandle } from '@components/effects/InstrumentEffectsPanel';
import type { MasterEffectsPanelHandle } from '@components/effects/MasterEffectsPanel';

// Lazy-load FX panels (heavy: DnD kit, visual effect editors, etc.)
const InstrumentEffectsPanel = lazy(() =>
  import('@components/effects/InstrumentEffectsPanel').then((m) => ({ default: m.InstrumentEffectsPanel }))
);
const MasterEffectsPanel = lazy(() =>
  import('@components/effects/MasterEffectsPanel').then((m) => ({ default: m.MasterEffectsPanel }))
);

// Synth types that have the full JC303 hardware UI
const TB303_TYPES: SynthType[] = ['TB303'];

// Synth types that use the SC parameter slider panel
const SC_TYPES: SynthType[] = ['SuperCollider'];

// Height constants
const COLLAPSED_HEIGHT = 40;
const SECTION_HEADER_HEIGHT = 24;
const TB303_EXPANDED_HEIGHT = 512;
const DEFAULT_EXPANDED_HEIGHT = 200;

// For FX tabs and most synth types, return a fixed height
// TB303 has its own large hardware UI height
function getExpandedHeight(synthType: SynthType | undefined): number {
  if (synthType && TB303_TYPES.includes(synthType)) return TB303_EXPANDED_HEIGHT;
  return DEFAULT_EXPANDED_HEIGHT;
}

// ─── Generic Synth Knobs ─────────────────────────────────────────────────────
// Shows oscillator, envelope, filter knobs for Tone.js-based synths
const GenericSynthKnobs: React.FC<{
  instrument: InstrumentConfig;
  onUpdate: (updates: Partial<InstrumentConfig>) => void;
}> = memo(({ instrument, onUpdate }) => {
  const osc = instrument.oscillator;
  const env = instrument.envelope;
  const filter = instrument.filter;
  const filterEnv = instrument.filterEnvelope;

  const updateOsc = useCallback((key: string, value: number | string) => {
    onUpdate({ oscillator: { ...instrument.oscillator!, [key]: value } });
  }, [instrument.oscillator, onUpdate]);

  const updateEnv = useCallback((key: string, value: number) => {
    onUpdate({ envelope: { ...instrument.envelope!, [key]: value } });
  }, [instrument.envelope, onUpdate]);

  const updateFilter = useCallback((key: string, value: number) => {
    onUpdate({ filter: { ...instrument.filter!, [key]: value } });
  }, [instrument.filter, onUpdate]);

  const updateFilterEnv = useCallback((key: string, value: number) => {
    onUpdate({ filterEnvelope: { ...instrument.filterEnvelope!, [key]: value } });
  }, [instrument.filterEnvelope, onUpdate]);

  const hasOsc = !!osc;
  const hasEnv = !!env;
  const hasFilter = !!filter;
  const hasFilterEnv = !!filterEnv;

  if (!hasOsc && !hasEnv && !hasFilter) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-xs">
        No editable parameters for {instrument.synthType}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-6 px-4 py-3 overflow-x-auto">
      {/* Oscillator section */}
      {hasOsc && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-accent-highlight font-bold uppercase tracking-wider">Oscillator</span>
          <div className="flex items-end gap-3">
            <Knob
              value={osc.detune ?? 0}
              min={-100} max={100}
              onChange={(v) => updateOsc('detune', v)}
              label="Detune"
              color="#22d3ee"
              size="sm"
              formatValue={(v) => `${Math.round(v)}¢`}
            />
          </div>
        </div>
      )}

      {/* Envelope section */}
      {hasEnv && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">Envelope</span>
          <div className="flex items-end gap-3">
            <Knob
              value={env.attack ?? 10}
              min={0} max={2000}
              onChange={(v) => updateEnv('attack', v)}
              label="Attack"
              color="#4ade80"
              size="sm"
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`}
            />
            <Knob
              value={env.decay ?? 100}
              min={0} max={2000}
              onChange={(v) => updateEnv('decay', v)}
              label="Decay"
              color="#4ade80"
              size="sm"
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`}
            />
            <Knob
              value={env.sustain ?? 70}
              min={0} max={100}
              onChange={(v) => updateEnv('sustain', v)}
              label="Sustain"
              color="#4ade80"
              size="sm"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={env.release ?? 200}
              min={0} max={5000}
              onChange={(v) => updateEnv('release', v)}
              label="Release"
              color="#4ade80"
              size="sm"
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`}
            />
          </div>
        </div>
      )}

      {/* Filter section */}
      {hasFilter && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Filter</span>
          <div className="flex items-end gap-3">
            <Knob
              value={filter.frequency ?? 2000}
              min={20} max={20000}
              onChange={(v) => updateFilter('frequency', v)}
              label="Cutoff"
              color="#fb923c"
              size="sm"
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
            />
            <Knob
              value={filter.Q ?? 1}
              min={0} max={100}
              onChange={(v) => updateFilter('Q', v)}
              label="Resonance"
              color="#fb923c"
              size="sm"
              formatValue={(v) => v.toFixed(1)}
            />
          </div>
        </div>
      )}

      {/* Filter Envelope section */}
      {hasFilterEnv && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Filter Env</span>
          <div className="flex items-end gap-3">
            <Knob
              value={filterEnv.octaves ?? 2}
              min={0} max={8}
              onChange={(v) => updateFilterEnv('octaves', v)}
              label="Amount"
              color="#c084fc"
              size="sm"
              formatValue={(v) => v.toFixed(1)}
            />
            <Knob
              value={filterEnv.attack ?? 10}
              min={0} max={2000}
              onChange={(v) => updateFilterEnv('attack', v)}
              label="Attack"
              color="#c084fc"
              size="sm"
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`}
            />
            <Knob
              value={filterEnv.decay ?? 200}
              min={0} max={2000}
              onChange={(v) => updateFilterEnv('decay', v)}
              label="Decay"
              color="#c084fc"
              size="sm"
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`}
            />
          </div>
        </div>
      )}
    </div>
  );
});
GenericSynthKnobs.displayName = 'GenericSynthKnobs';

// ─── SuperCollider Param Sliders ─────────────────────────────────────────────
const SCParamSliders: React.FC<{
  instrument: InstrumentConfig;
  onUpdate: (updates: Partial<InstrumentConfig>) => void;
}> = memo(({ instrument, onUpdate }) => {
  const scConfig = instrument.superCollider;
  const params = scConfig?.params ?? [];
  const synthDefName = scConfig?.synthDefName ?? 'SC';

  const [paramPage, setParamPage] = useState(0);
  const KNOBS_PER_PAGE = 8;
  const totalPages = Math.max(1, Math.ceil(params.length / KNOBS_PER_PAGE));
  const visibleParams = params.slice(
    paramPage * KNOBS_PER_PAGE,
    (paramPage + 1) * KNOBS_PER_PAGE
  );

  const handleParamChange = useCallback(
    (paramName: string, value: number) => {
      if (!scConfig) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === instrument.id);
      if (!latest?.superCollider) return;
      const updatedParams = latest.superCollider.params.map((p) =>
        p.name === paramName ? { ...p, value } : p
      );
      onUpdate({
        superCollider: { ...latest.superCollider, params: updatedParams },
      });
    },
    [scConfig, instrument.id, onUpdate]
  );

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#00cc66', color: 'var(--color-text-inverse)' }}>
          SC
        </span>
        <span className="text-xs text-text-primary font-bold">{synthDefName}</span>
        <span className="text-[10px] text-text-muted">{params.length} params</span>
        <div className="flex-1" />
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button className="text-text-secondary hover:text-text-primary disabled:opacity-30 p-0.5"
              onClick={() => setParamPage(Math.max(0, paramPage - 1))} disabled={paramPage === 0}>
              <ChevronLeft size={12} />
            </button>
            <span className="text-[10px] text-text-muted">{paramPage + 1}/{totalPages}</span>
            <button className="text-text-secondary hover:text-text-primary disabled:opacity-30 p-0.5"
              onClick={() => setParamPage(Math.min(totalPages - 1, paramPage + 1))} disabled={paramPage >= totalPages - 1}>
              <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 overflow-x-auto">
        {visibleParams.map((param) => (
          <div key={param.name} className="flex flex-col items-center gap-1 min-w-[64px]">
            <input
              type="range"
              className="w-14 accent-green-500"
              min={param.min}
              max={param.max}
              step={(param.max - param.min) / 127}
              value={param.value}
              onChange={(e) => handleParamChange(param.name, parseFloat(e.target.value))}
            />
            <span className="text-[10px] text-text-secondary truncate max-w-[64px] text-center">{param.name}</span>
            <span className="text-[9px] text-text-muted">{Number(param.value.toPrecision(3))}</span>
          </div>
        ))}
        {params.length === 0 && (
          <span className="text-xs text-text-muted">Compile SynthDef to see params</span>
        )}
      </div>
    </div>
  );
});
SCParamSliders.displayName = 'SCParamSliders';

// ─── Synth badge color ───────────────────────────────────────────────────────
function getSynthColor(synthType: SynthType | undefined): string {
  if (!synthType) return '#666';
  if (TB303_TYPES.includes(synthType)) return '#ff6600';
  if (SC_TYPES.includes(synthType)) return '#00cc66';
  if (synthType.startsWith('Furnace')) return '#ff4444';
  if (synthType.startsWith('MAME')) return '#aa44ff';
  if (synthType.startsWith('Buzz')) return '#ffcc00';
  // Tone.js synths
  switch (synthType) {
    case 'FMSynth': return '#22d3ee';
    case 'ToneAM': return '#14b8a6';
    case 'MonoSynth': return '#a78bfa';
    case 'DuoSynth': return '#f472b6';
    case 'PluckSynth': return '#f59e0b';
    case 'MetalSynth': return '#94a3b8';
    case 'MembraneSynth': return '#ef4444';
    case 'NoiseSynth': return '#6b7280';
    case 'Sampler': case 'Player': return '#3b82f6';
    default: return '#8b5cf6';
  }
}

// ─── Section Header ──────────────────────────────────────────────────────────
const SectionHeader: React.FC<{
  label: string;
  badge?: string;
  color?: string;
  actions?: React.ReactNode;
}> = memo(({ label, badge, color, actions }) => (
  <div
    className="flex items-center gap-1.5 px-2 border-b border-dark-border flex-shrink-0 select-none"
    style={{ height: `${SECTION_HEADER_HEIGHT}px` }}
  >
    {color && (
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    )}
    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
    {badge && (
      <span className="px-1 py-0 text-[9px] rounded font-bold bg-accent-highlight/20 text-accent-highlight">{badge}</span>
    )}
    {actions && <><div className="flex-1" />{actions}</>}
  </div>
));
SectionHeader.displayName = 'SectionHeader';

// ─── FX Loading Fallback ─────────────────────────────────────────────────────
const FxLoadingFallback = () => (
  <div className="flex items-center justify-center h-full text-text-muted text-xs">Loading effects...</div>
);

// ─── Main Component ──────────────────────────────────────────────────────────
export const InstrumentKnobPanel: React.FC = memo(() => {
  // ALL HOOKS AT THE TOP
  const { instruments, updateInstrument, currentInstrumentId } = useInstrumentStore(
    useShallow((state) => ({
      instruments: state.instruments,
      updateInstrument: state.updateInstrument,
      currentInstrumentId: state.currentInstrumentId,
    }))
  );

  const { tb303Collapsed, toggleTB303Collapsed, tb303PoppedOut, setTB303PoppedOut } = useUIStore(
    useShallow((state) => ({
      tb303Collapsed: state.tb303Collapsed,
      toggleTB303Collapsed: state.toggleTB303Collapsed,
      tb303PoppedOut: state.tb303PoppedOut,
      setTB303PoppedOut: state.setTB303PoppedOut,
    }))
  );

  const { controlledInstrumentId } = useMIDIStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const instFxRef = useRef<InstrumentEffectsPanelHandle>(null);
  const masterFxRef = useRef<MasterEffectsPanelHandle>(null);

  // Determine which instrument to show — follows the selected instrument
  const targetInstrument = useMemo(() => {
    // MIDI-controlled instrument takes priority
    if (controlledInstrumentId) {
      const midiInst = instruments.find((i) => i.id === controlledInstrumentId);
      if (midiInst) return midiInst;
    }

    // Follow the currently selected instrument in the instrument list
    if (currentInstrumentId != null) {
      const inst = instruments.find((i) => i.id === currentInstrumentId);
      if (inst) return inst;
    }

    // Fallback: first instrument
    return instruments[0] ?? null;
  }, [controlledInstrumentId, currentInstrumentId, instruments]);

  const synthType = targetInstrument?.synthType;
  const isTB303 = synthType ? TB303_TYPES.includes(synthType) : false;
  const isSC = synthType ? SC_TYPES.includes(synthType) : false;

  // TB-303 config change handler
  const handleTB303ConfigChange = useCallback((updates: Partial<TB303Config>) => {
    if (!targetInstrument) return;
    const latest = useInstrumentStore.getState().instruments.find((i) => i.id === targetInstrument.id);
    if (!latest?.tb303) return;
    updateInstrument(targetInstrument.id, {
      tb303: { ...latest.tb303, ...updates },
    });
  }, [targetInstrument, updateInstrument]);

  // TB-303 preset load handler
  const handlePresetLoad = useCallback(async (preset: { tb303?: Partial<TB303Config>; effects?: Array<Record<string, unknown>> }) => {
    if (!targetInstrument) return;
    if (preset.tb303) {
      handleTB303ConfigChange(preset.tb303);
    }
    if (preset.effects !== undefined) {
      const effects = preset.effects.map((fx: Record<string, unknown>, i: number) => ({
        ...fx,
        id: (fx.id as string) || `tb303-fx-${Date.now()}-${i}`,
      })) as EffectConfig[];
      updateInstrument(targetInstrument.id, { effects });
      const { getToneEngine } = await import('@engine/ToneEngine');
      const engine = getToneEngine();
      await engine.rebuildInstrumentEffects(targetInstrument.id, effects);
    }
  }, [targetInstrument, handleTB303ConfigChange, updateInstrument]);

  // Generic instrument update handler
  const handleGenericUpdate = useCallback((updates: Partial<InstrumentConfig>) => {
    if (!targetInstrument) return;
    updateInstrument(targetInstrument.id, updates);
  }, [targetInstrument, updateInstrument]);

  // Right-side content for tab bar — action buttons for FX tabs
  const instFxActions = useMemo(() => (
    <button
      onClick={() => instFxRef.current?.toggleBrowser()}
      className="flex items-center gap-1 px-1.5 py-0 text-[9px] font-bold uppercase rounded
               bg-accent-highlight/10 text-accent-highlight hover:bg-accent-highlight/20 transition-colors"
    >
      <Plus size={9} />
      Add
    </button>
  ), []);

  const masterFxActions = useMemo(() => (
    <div className="flex items-center gap-1">
      <button
        onClick={() => masterFxRef.current?.togglePresetMenu()}
        className="px-1.5 py-0 text-[9px] font-medium rounded bg-dark-bgTertiary text-text-secondary
                 hover:bg-dark-bgHover transition-colors border border-dark-borderLight"
      >
        Presets
      </button>
      <button
        onClick={() => masterFxRef.current?.toggleAddMenu()}
        className="flex items-center gap-1 px-1.5 py-0 text-[9px] font-bold uppercase rounded
                 bg-accent-highlight/10 text-accent-highlight hover:bg-accent-highlight/20 transition-colors"
      >
        <Plus size={9} />
        Add
      </button>
    </div>
  ), []);

  // Calculate popout dimensions based on content
  const getPopoutDimensions = useCallback(() => {
    if (isTB303) {
      return { width: 1400, height: TB303_EXPANDED_HEIGHT + SECTION_HEADER_HEIGHT + 60 };
    }
    return { width: 1200, height: 400 };
  }, [isTB303]);

  // No instrument on this channel — render nothing
  if (!targetInstrument) {
    if (tb303PoppedOut) {
      return (
        <PopOutWindow
          isOpen={true}
          onClose={() => setTB303PoppedOut(false)}
          title="DEViLBOX — Synth Panel"
          width={400}
          height={200}
        >
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            No instrument selected
          </div>
        </PopOutWindow>
      );
    }
    return null;
  }

  const expandedHeight = getExpandedHeight(synthType);
  const instNum = String(targetInstrument.id).padStart(2, '0');
  const instrumentName = `${instNum}: ${targetInstrument.name || synthType}`;
  const fxCount = targetInstrument.effects?.length ?? 0;

  // ─── Popped-out mode ───────────────────────────────────────────────────────
  if (tb303PoppedOut) {
    const { width: popoutWidth, height: popoutHeight } = getPopoutDimensions();
    return (
      <>
        <PopOutWindow
          isOpen={true}
          onClose={() => setTB303PoppedOut(false)}
          title={`DEViLBOX — ${targetInstrument.name || synthType}`}
          width={popoutWidth}
          height={popoutHeight}
        >
          <div style={{ background: 'var(--color-bg-tertiary)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Popout header */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-dark-border flex-shrink-0">
              <span className="font-bold px-1.5 py-0.5 rounded text-[10px]"
                style={{ backgroundColor: getSynthColor(synthType), color: 'var(--color-text-inverse)' }}>
                {synthType}
              </span>
              <span className="text-xs text-text-secondary truncate">{instrumentName}</span>
            </div>
            {/* Horizontal layout */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              <div className="flex-[2] min-w-0 flex flex-col overflow-hidden">
                <SectionHeader label={synthType === 'TB303' ? 'TB-303' : (synthType || 'Synth')} color={getSynthColor(synthType)} />
                <div className="flex-1 min-h-0 overflow-auto">
                  <ScrollLockContainer>
                    {isTB303 && targetInstrument.tb303 ? (
                      <JC303StyledKnobPanel
                        key={targetInstrument.id}
                        config={targetInstrument.tb303}
                        onChange={handleTB303ConfigChange}
                        onPresetLoad={handlePresetLoad}
                        instrumentId={targetInstrument.id}
                      />
                    ) : (
                      <SynthControlsRouter instrument={targetInstrument} onUpdate={handleGenericUpdate} fallback={isSC ? <SCParamSliders instrument={targetInstrument} onUpdate={handleGenericUpdate} /> : <GenericSynthKnobs instrument={targetInstrument} onUpdate={handleGenericUpdate} />} />
                    )}
                  </ScrollLockContainer>
                </div>
              </div>
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-l border-dark-border">
                <SectionHeader label="Inst FX" badge={fxCount > 0 ? String(fxCount) : undefined} actions={instFxActions} />
                <div className="flex-1 min-h-0 overflow-auto">
                  <Suspense fallback={<FxLoadingFallback />}>
                    <div className="fx-horizontal-layout p-2 h-full">
                      <InstrumentEffectsPanel
                        ref={instFxRef}
                        instrumentId={targetInstrument.id}
                        instrumentName={instrumentName}
                        effects={targetInstrument.effects || []}
                        hideHeader
                      />
                    </div>
                  </Suspense>
                </div>
              </div>
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-l border-dark-border">
                <SectionHeader label="Master FX" actions={masterFxActions} />
                <div className="flex-1 min-h-0 overflow-auto">
                  <Suspense fallback={<FxLoadingFallback />}>
                    <div className="fx-horizontal-layout p-2 h-full">
                      <MasterEffectsPanel ref={masterFxRef} hideHeader />
                    </div>
                  </Suspense>
                </div>
              </div>
            </div>
          </div>
        </PopOutWindow>

        {/* Placeholder strip in main window */}
        <div
          className="tb303-knob-panel"
          style={{
            position: 'relative',
            width: '100%',
            height: '40px',
            background: 'var(--color-bg-tertiary)',
            borderTop: '1px solid var(--color-border-light)',
          }}
        >
          <div className="absolute top-0 left-0 p-2 text-xs font-mono flex items-center gap-2">
            <span className="font-bold px-1 py-0.5 rounded text-[10px]"
              style={{ backgroundColor: getSynthColor(synthType), color: 'var(--color-text-inverse)' }}>
              {synthType}
            </span>
            <span className="text-text-muted">Popped Out</span>
          </div>
          <div className="absolute top-0 right-0 z-[99990]">
            <button
              className="p-2 text-text-secondary hover:text-text-primary bg-black/50 hover:bg-black/80 rounded-bl-lg flex items-center gap-1 text-xs"
              onClick={() => setTB303PoppedOut(false)}
              title="Restore panel inline"
            >
              <Undo2 size={14} />
              Restore
            </button>
          </div>
        </div>
      </>
    );
  }

  // ─── Inline panel with collapse/expand animation ───────────────────────────

  return (
    <div
      className="tb303-knob-panel"
      style={{
        position: 'relative',
        width: '100%',
        height: tb303Collapsed ? `${COLLAPSED_HEIGHT}px` : `${expandedHeight}px`,
        background: 'var(--color-bg-tertiary)',
        borderTop: '1px solid var(--color-border-light)',
        overflow: 'hidden',
        transition: 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Collapsed header — always visible */}
      <div
        className="absolute top-0 left-0 p-2 text-xs font-mono flex items-center gap-2 cursor-pointer select-none"
        style={{ opacity: tb303Collapsed ? 1 : 0, transition: 'opacity 200ms ease', pointerEvents: tb303Collapsed ? 'auto' : 'none' }}
        onClick={toggleTB303Collapsed}
      >
        <span className="font-bold px-1 py-0.5 rounded text-[10px]"
          style={{ backgroundColor: getSynthColor(synthType), color: 'var(--color-text-inverse)' }}>
          {synthType}
        </span>
        <span className="text-text-muted">#{instNum}</span>
        <span className="text-text-secondary">{targetInstrument.name}</span>
      </div>

      {/* Action buttons — always pinned to top-right */}
      <div className="absolute top-1 right-1 z-[99990] flex items-center gap-1">
        {tb303Collapsed ? (
          <button
            className="p-2 text-text-secondary hover:text-text-primary bg-black/50 hover:bg-black/80 rounded-bl-lg"
            onClick={toggleTB303Collapsed}
            title="Expand synth panel"
          >
            <ChevronDown size={16} />
          </button>
        ) : (
          <>
            <button
              className="p-1.5 text-text-muted hover:text-accent-highlight bg-black/40 hover:bg-black/70 rounded transition-colors"
              onClick={() => {
                if (tb303PoppedOut) {
                  focusPopout(`DEViLBOX — ${targetInstrument.name || synthType}`);
                } else {
                  setTB303PoppedOut(true);
                }
              }}
              title="Pop out to separate window"
            >
              <ExternalLink size={14} />
            </button>
            <button
              className="p-1.5 text-text-muted hover:text-text-primary bg-black/40 hover:bg-black/70 rounded transition-colors"
              onClick={toggleTB303Collapsed}
              title="Collapse synth panel"
            >
              <ChevronUp size={14} />
            </button>
            <button
              className="p-1.5 text-text-muted hover:text-red-400 bg-black/40 hover:bg-black/70 rounded transition-colors"
              onClick={() => useUIStore.getState().setTB303Collapsed(true)}
              title="Close synth panel"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>

      {/* Full panel content — always in DOM, clipped when collapsed */}
      <div ref={contentRef} style={{
        opacity: tb303Collapsed ? 0 : 1,
        transition: 'opacity 200ms ease',
        pointerEvents: tb303Collapsed ? 'none' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        height: `${expandedHeight}px`,
      }}>
        {/* Horizontal layout — synth controls, inst FX, master FX side by side */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Synth controls — takes more space */}
          <div className="flex-[2] min-w-0 flex flex-col overflow-hidden">
            <SectionHeader label={synthType === 'TB303' ? 'TB-303' : (synthType || 'Synth')} color={getSynthColor(synthType)} />
            <div className="flex-1 min-h-0 overflow-auto">
              {isTB303 && targetInstrument.tb303 ? (
                <ScrollLockContainer className="w-full">
                  <JC303StyledKnobPanel
                    key={targetInstrument.id}
                    config={targetInstrument.tb303}
                    onChange={handleTB303ConfigChange}
                    onPresetLoad={handlePresetLoad}
                    instrumentId={targetInstrument.id}
                  />
                </ScrollLockContainer>
              ) : (
                <SynthControlsRouter instrument={targetInstrument} onUpdate={handleGenericUpdate} fallback={isSC ? <SCParamSliders instrument={targetInstrument} onUpdate={handleGenericUpdate} /> : <GenericSynthKnobs instrument={targetInstrument} onUpdate={handleGenericUpdate} />} />
              )}
            </div>
          </div>

          {/* Instrument FX */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-l border-dark-border">
            <SectionHeader label="Inst FX" badge={fxCount > 0 ? String(fxCount) : undefined} actions={instFxActions} />
            <div className="flex-1 min-h-0 overflow-auto">
              <Suspense fallback={<FxLoadingFallback />}>
                <div className="fx-horizontal-layout p-2 h-full">
                  <InstrumentEffectsPanel
                    ref={instFxRef}
                    instrumentId={targetInstrument.id}
                    instrumentName={instrumentName}
                    effects={targetInstrument.effects || []}
                    hideHeader
                  />
                </div>
              </Suspense>
            </div>
          </div>

          {/* Master FX */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-l border-dark-border">
            <SectionHeader label="Master FX" actions={masterFxActions} />
            <div className="flex-1 min-h-0 overflow-auto">
              <Suspense fallback={<FxLoadingFallback />}>
                <div className="fx-horizontal-layout p-2 h-full">
                  <MasterEffectsPanel ref={masterFxRef} hideHeader />
                </div>
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

InstrumentKnobPanel.displayName = 'InstrumentKnobPanel';
