/**
 * FurnaceEditor - Comprehensive Furnace chip instrument editor
 *
 * Based on deep research of Furnace tracker's insEdit.cpp (9041 lines)
 * Implements chip-specific parameter ranges, FM envelope visualization,
 * algorithm diagrams, and accurate operator controls.
 *
 * Research reference: /Users/spot/Code/DEViLBOX/third-party/furnace-master/src/gui/insEdit.cpp
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { FurnaceConfig, FurnaceOperatorConfig, FurnaceMacro, FurnaceAmigaConfig, FurnaceN163Config, FurnaceFDSConfig, FurnaceESFMConfig, FurnaceESFMOperatorConfig, FurnaceMultiPCMConfig, FurnaceSoundUnitConfig, FurnaceSID2Config, FurnaceES5506Config, FurnaceWaveSynthConfig, FurnaceSID3Config, FurnaceSID3Filter } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { CustomSelect } from '@components/common/CustomSelect';
import { Button } from '@components/ui/Button';
import { notify } from '@stores/useNotificationStore';
import { parseWavToAudioBuffer } from '@utils/audio/wavParser';
import { OPNB_VOICE_KINDS, SSG_MACRO_LABELS, isOpnbChipType, opnbFirstChannel, opnbVoiceKind, withSsgDefaultMacros } from '@engine/furnace-dispatch/opnbVoices';
import { TabStrip } from '@components/ui/TabStrip';
import { resolveColor, toneColor, type ControlTone } from '@components/ui/controlColor';
import {
  FM_FEEDBACK_OPERATOR,
  FM_OPERATOR_PARAMETER_LABELS,
  SSG_ENVELOPE_SHAPES,
  describeFmAlgorithm,
  fmAlgorithmCount,
  fmOperatorDisplayOrder,
  formatSignedValue,
  isFmCarrier,
  type FmOperatorParameter,
} from '@lib/furnace/fmOperatorModel';
import { Cpu, Activity, Zap, Waves, Volume2, Music, Settings, FileUp, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { InstrumentOscilloscope } from '@components/visualization';
import { VisualizerFrame } from '@components/visualization/VisualizerFrame';
import { MacroListEditor } from './MacroEditor';
import { WavetableListEditor, type WavetableData } from './WavetableEditor';
import { ScrollLockContainer } from '@components/ui/ScrollLockContainer';
import { EnvelopeVisualization, WaveformThumbnail, FMAlgorithmDiagram } from '@components/instruments/shared';
import { getToneEngine } from '@engine/ToneEngine';

// ============================================================================
// CHIP-SPECIFIC PARAMETER RANGES (from Furnace insEdit.cpp)
// ============================================================================

interface ChipParameterRanges {
  tl: { min: number; max: number };
  ar: { min: number; max: number };
  dr: { min: number; max: number };
  d2r: { min: number; max: number };
  rr: { min: number; max: number };
  sl: { min: number; max: number };
  mult: { min: number; max: number };
  dt: { min: number; max: number };
  dt2?: { min: number; max: number };
  rs: { min: number; max: number };
  ksl?: { min: number; max: number };
  ws?: { min: number; max: number };
  hasD2R: boolean;
  hasSSG: boolean;
  hasWS: boolean;
  hasDT2: boolean;
  isOPZ: boolean;
  opCount: number;
}

function getChipParameterRanges(chipType: number): ChipParameterRanges {
  // OPN/OPN2/OPNA/OPNB (YM2612, YM2608, YM2610)
  if ([0, 13, 14].includes(chipType)) {
    return {
      tl: { min: 0, max: 127 },
      ar: { min: 0, max: 31 },
      dr: { min: 0, max: 31 },
      d2r: { min: 0, max: 31 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: -3, max: 3 },
      rs: { min: 0, max: 3 },
      hasD2R: true,
      hasSSG: true,
      hasWS: false,
      hasDT2: false,
      isOPZ: false,
      opCount: 4,
    };
  }

  // OPM (YM2151)
  if (chipType === 1) {
    return {
      tl: { min: 0, max: 127 },
      ar: { min: 0, max: 31 },
      dr: { min: 0, max: 31 },
      d2r: { min: 0, max: 31 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: -3, max: 3 },
      dt2: { min: 0, max: 3 },
      rs: { min: 0, max: 3 },
      hasD2R: true,
      hasSSG: false,
      hasWS: false,
      hasDT2: true,
      isOPZ: false,
      opCount: 4,
    };
  }

  // OPL/OPL2/OPL3 (YMF262, YM3812)
  if ([2, 23, 26].includes(chipType)) {
    return {
      tl: { min: 0, max: 63 },
      ar: { min: 0, max: 15 },
      dr: { min: 0, max: 15 },
      d2r: { min: 0, max: 0 }, // OPL has no D2R
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: 0, max: 0 }, // OPL has no detune
      rs: { min: 0, max: 0 }, // OPL uses KSL instead
      ksl: { min: 0, max: 3 },
      ws: { min: 0, max: 7 },
      hasD2R: false,
      hasSSG: false,
      hasWS: true,
      hasDT2: false,
      isOPZ: false,
      opCount: 4,
    };
  }

  // OPLL (YM2413)
  if (chipType === 11) {
    return {
      tl: { min: 0, max: 63 }, // Modulator: 63, Carrier: 15
      ar: { min: 0, max: 15 },
      dr: { min: 0, max: 15 },
      d2r: { min: 0, max: 0 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: 0, max: 0 },
      rs: { min: 0, max: 0 },
      ksl: { min: 0, max: 3 },
      hasD2R: false,
      hasSSG: false,
      hasWS: false,
      hasDT2: false,
      isOPZ: false,
      opCount: 2,
    };
  }

  // OPZ (YM2414)
  if (chipType === 22) {
    return {
      tl: { min: 0, max: 127 },
      ar: { min: 0, max: 31 },
      dr: { min: 0, max: 31 },
      d2r: { min: 0, max: 31 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: -3, max: 3 },
      dt2: { min: 0, max: 3 },
      rs: { min: 0, max: 3 },
      hasD2R: true,
      hasSSG: false,
      hasWS: false,
      hasDT2: true,
      isOPZ: true,
      opCount: 4,
    };
  }

  // Default (OPN-style)
  return {
    tl: { min: 0, max: 127 },
    ar: { min: 0, max: 31 },
    dr: { min: 0, max: 31 },
    d2r: { min: 0, max: 31 },
    rr: { min: 0, max: 15 },
    sl: { min: 0, max: 15 },
    mult: { min: 0, max: 15 },
    dt: { min: -3, max: 3 },
    rs: { min: 0, max: 3 },
    hasD2R: true,
    hasSSG: true,
    hasWS: false,
    hasDT2: false,
    isOPZ: false,
    opCount: 4,
  };
}

// ============================================================================
// FM ALGORITHM DIAGRAM (from Furnace drawAlgorithm)
// ============================================================================

// ============================================================================
// MAIN FURNACE EDITOR COMPONENT
// ============================================================================

interface FurnaceEditorProps {
  config: FurnaceConfig;
  instrumentId: number;
  onChange: (updates: Partial<FurnaceConfig>) => void;
}

export const FurnaceEditor: React.FC<FurnaceEditorProps> = ({ config, instrumentId, onChange }) => {
  const [activeTab, setActiveTab] = useState<'fm' | 'macros' | 'chip'>('fm');
  // Operator whose macros are shown, as the displayed operator number (null = global macros)
  const [macroOperator, setMacroOperator] = useState<number | null>(null);
  // selectedOp: displayed operator number, 1-4 as on the chip (null = none)
  const [selectedOp, setSelectedOp] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleInputRef = useRef<HTMLInputElement>(null);
  const configRef = useRef(config);

  // Keep configRef in sync
  useEffect(() => { configRef.current = config; }, [config]);

  // Push config changes to live FurnaceSynth via register re-map
  const pushLiveUpdate = useCallback((updates: Partial<FurnaceConfig>) => {
    onChange(updates);
    // Fire-and-forget: re-map registers on the running synth
    try {
      const engine = getToneEngine();
      const synth = engine.instruments.get(instrumentId) as any;
      if (synth?.remapRegisters) {
        const merged = { ...configRef.current, ...updates };
        synth.remapRegisters(merged);
      }
    } catch { /* engine not ready */ }
  }, [onChange, instrumentId]);

  // Click an operator in the diagram → highlight its card
  const handleDiagramSelect = useCallback((opNum: number) => {
    setSelectedOp(prev => prev === opNum ? null : opNum);
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith('.fuw')) {
        // Parse Furnace .fuw (skipping header "-Furnace waveta-")
        const arrayBuffer = await file.arrayBuffer();
        const dataView = new DataView(arrayBuffer);
        const wavetableData: number[] = [];
        
        // Skip 32-byte header
        for (let i = 32; i < arrayBuffer.byteLength; i += 4) {
          if (i + 4 <= arrayBuffer.byteLength) {
            wavetableData.push(dataView.getUint32(i, true));
          }
        }
        
        if (wavetableData.length > 0) {
          const newWavetables = [...config.wavetables, { 
            id: config.wavetables.length, 
            data: wavetableData,
            len: wavetableData.length,
            max: Math.max(...wavetableData) 
          }];
          onChange({ wavetables: newWavetables });
        }
      } else {
        // Parse audio file
        // Reuse the shared ToneEngine AudioContext for decoding.
        // Creating throwaway contexts leaks them and iOS limits to ~4-6.
        const { getDevilboxAudioContext } = await import('@utils/audio-context');
        let audioCtx: AudioContext;
        try { audioCtx = getDevilboxAudioContext(); } catch { audioCtx = new AudioContext(); }
        const arrayBuffer = await file.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        const rawData = buffer.getChannelData(0);
        
        // Convert -1..1 float to 0..15 (standard 4-bit furnace height)
        const values = Array.from(rawData).map(v => Math.round((v + 1) / 2 * 15));
        
        const newWavetables = [...config.wavetables, { 
          id: config.wavetables.length, 
          data: values,
          len: values.length,
          max: 15
        }];
        onChange({ wavetables: newWavetables });
      }
    } catch (err) {
      console.error('Failed to import Furnace wavetable:', err);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateOperator = useCallback((idx: number, updates: Partial<FurnaceOperatorConfig>) => {
    const newOps = [...configRef.current.operators];
    newOps[idx] = { ...newOps[idx], ...updates };
    pushLiveUpdate({ operators: newOps });
  }, [pushLiveUpdate]);

  const chipName = getChipName(config.chipType);
  const category = getChipCategory(config.chipType);
  const paramRanges = useMemo(() => getChipParameterRanges(config.chipType), [config.chipType]);
  const hasOpMacros = config.opMacroArrays?.some(arr => arr && arr.length > 0) ?? false;

  // config.operators is in Furnace storage order; the editor shows operators 1-4 as on the chip.
  const operatorCount = paramRanges.opCount === 2 ? 2 : 4;
  const displayOrder = fmOperatorDisplayOrder(operatorCount);
  const algorithmCount = fmAlgorithmCount(operatorCount);
  // The two-operator diagram numbers its boxes 2 (modulator) and 1 (carrier).
  const diagramBox = (operatorNumber: number) => (operatorCount === 2 ? 3 - operatorNumber : operatorNumber);
  const diagramLabels = operatorCount === 2 ? TWO_OPERATOR_DIAGRAM_LABELS : undefined;
  const macroStorageIndex = macroOperator === null ? null : displayOrder[macroOperator - 1] ?? null;

  // YM2610 / YM2610B: one chip, four voice kinds. Only the FM kind has operators.
  const neoKind = isOpnbChipType(config.chipType) ? opnbVoiceKind(config.divInsType) : null;
  const showFmPanels = category === "FM" && (!neoKind || neoKind.id === 'fm');

  const setVoiceKind = (id: string) => {
    const kind = OPNB_VOICE_KINDS.find((k) => k.id === id);
    if (!kind) return;
    const updates: Partial<FurnaceConfig> = {
      divInsType: kind.divInsType,
      previewChannel: opnbFirstChannel(config.chipType, kind.divInsType),
    };
    if (kind.id === 'ssg') updates.macros = withSsgDefaultMacros(configRef.current.macros).macros;
    pushLiveUpdate(updates);
    if (kind.id === 'fm') setActiveTab('fm');
  };

  const loadAdpcmSample = async (file: File) => {
    try {
      const audio = parseWavToAudioBuffer(await file.arrayBuffer());
      const floats = audio.getChannelData(0);
      const data = Int16Array.from(floats, (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767))));
      pushLiveUpdate({ userSample: { data, rate: audio.sampleRate, name: file.name } });
    } catch (err) {
      notify.error(`Could not load sample: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const mainTabs: Array<{ id: 'fm' | 'macros' | 'chip'; label: string }> = [
    { id: 'fm', label: 'Operators' },
    { id: 'macros', label: 'Macros' },
    ...(paramRanges.hasDT2 ? [{ id: 'chip' as const, label: 'Chip Settings' }] : []),
  ];
  const macroTabs = [
    { id: 'global', label: 'Global' },
    ...displayOrder.map((_, position) => ({ id: String(position + 1), label: `Operator ${position + 1}` })),
  ];

  // Macro target tabs plus the macro list, shared by the FM macro tab and the non-FM macro panel
  const macroEditor = (
    <>
      {hasOpMacros && (
        <TabStrip
          tabs={macroTabs}
          active={macroOperator === null ? 'global' : String(macroOperator)}
          onChange={(id) => setMacroOperator(id === 'global' ? null : Number(id))}
          ariaLabel="Macro target"
          className="mb-3"
          dense
        />
      )}

      {macroStorageIndex === null || !hasOpMacros ? (
        <MacroListEditor
          macros={config.macros}
          onChange={(macros) => onChange({ macros: macros as FurnaceMacro[] })}
          chipType={config.chipType}
          labels={neoKind?.id === 'ssg' ? SSG_MACRO_LABELS : undefined}
        />
      ) : (
        <MacroListEditor
          macros={(config.opMacroArrays ?? [[], [], [], []])[macroStorageIndex] ?? []}
          onChange={(macros) => {
            const newOpArrays = [...(configRef.current.opMacroArrays ?? [[], [], [], []])];
            newOpArrays[macroStorageIndex] = macros as FurnaceMacro[];
            onChange({ opMacroArrays: newOpArrays });
          }}
          chipType={config.chipType}
        />
      )}
    </>
  );

  return (
    <ScrollLockContainer>
      <div className="space-y-4">
      {/* Chip Header */}
      <div className="flex items-center gap-4 bg-dark-bgSecondary p-3 rounded-lg border border-dark-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent-primary/15 border border-accent-primary/40 rounded flex items-center justify-center">
            <Cpu size={20} className="text-accent-primary" />
          </div>
          <div>
            <h2 className="font-bold text-text-primary text-sm tracking-tight">{chipName}</h2>
            <span className="text-[10px] text-text-muted font-mono bg-dark-bg px-1.5 py-0.5 rounded border border-dark-border">
              {category === 'FM' ? `FM, ${operatorCount} operators` : category}
            </span>
          </div>
        </div>

        {/* Live Oscilloscope */}
        <div className="flex-1">
          <VisualizerFrame variant="compact">
            <InstrumentOscilloscope
              instrumentId={instrumentId}
              width="auto"
              height={40}
              color={resolveColor(toneColor('primary'))}
              backgroundColor="transparent"
              className="w-full"
            />
          </VisualizerFrame>
        </div>
      </div>

      {/* Neo Geo voice kind */}
      {neoKind && (
        <div className="bg-dark-bgSecondary p-3 rounded-lg border border-dark-border flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-mono text-text-muted">Voice</span>
          <CustomSelect
            value={neoKind.id}
            onChange={setVoiceKind}
            options={OPNB_VOICE_KINDS.map((k) => ({ value: k.id, label: k.label }))}
            className="text-xs"
          />
          {(neoKind.id === 'adpcma' || neoKind.id === 'adpcmb') && (
            <>
              <Button variant="default" size="sm" onClick={() => sampleInputRef.current?.click()}>
                <FileUp size={14} /> Load Sample
              </Button>
              <input
                ref={sampleInputRef}
                type="file"
                accept=".wav"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void loadAdpcmSample(file);
                  e.target.value = '';
                }}
              />
              <span className="text-[10px] font-mono text-text-muted">
                {config.userSample
                  ? `${config.userSample.name} (${config.userSample.data.length} samples at ${config.userSample.rate} Hz)`
                  : 'No sample loaded. The voice is silent until a WAV file is loaded.'}
              </span>
            </>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      {showFmPanels && (
        <TabStrip tabs={mainTabs} active={activeTab} onChange={setActiveTab} ariaLabel="Instrument editor sections" />
      )}

      {/* FM OPERATOR PANEL */}
      {showFmPanels && activeTab === 'fm' && (
        <div className="space-y-3">
          {/* Algorithm: current routing, all routings to pick from, voice controls */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-dark-bgSecondary p-3 rounded-lg border border-dark-border flex flex-col gap-2">
              <PanelTitle>Algorithm {config.algorithm}</PanelTitle>
              <FMAlgorithmDiagram
                algorithm={config.algorithm}
                feedback={config.feedback}
                opCount={operatorCount}
                opLabels={diagramLabels}
                selectedOp={selectedOp === null ? null : diagramBox(selectedOp)}
                onSelectOp={(box) => handleDiagramSelect(diagramBox(box))}
                height={112}
              />
              <p className="text-[10px] font-mono text-text-muted">
                {describeFmAlgorithm(config.algorithm, operatorCount)}. Feedback {config.feedback} on operator {FM_FEEDBACK_OPERATOR}. Click an operator to find its card.
              </p>
            </div>

            <div className="bg-dark-bgSecondary p-3 rounded-lg border border-dark-border flex flex-col gap-2">
              <PanelTitle>All Algorithms</PanelTitle>
              <div className={`grid gap-1.5 ${algorithmCount > 2 ? 'grid-cols-4' : 'grid-cols-2'}`}>
                {Array.from({ length: algorithmCount }, (_, algorithm) => {
                  const active = algorithm === config.algorithm;
                  return (
                    <Button
                      key={algorithm}
                      variant="ghost"
                      onClick={() => pushLiveUpdate({ algorithm })}
                      title={`Algorithm ${algorithm}: ${describeFmAlgorithm(algorithm, operatorCount)}`}
                      aria-pressed={active}
                      className={`!h-auto !p-1 flex flex-col items-stretch gap-0.5 rounded border ${
                        active ? 'border-accent-primary bg-accent-primary/10' : 'border-dark-border bg-dark-bg'
                      }`}
                    >
                      <FMAlgorithmDiagram
                        algorithm={algorithm}
                        feedback={0}
                        opCount={operatorCount}
                        opLabels={diagramLabels}
                        compact
                      />
                      <span className={`text-[10px] font-mono ${active ? 'text-accent-primary' : 'text-text-muted'}`}>
                        {algorithm}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="bg-dark-bgSecondary p-3 rounded-lg border border-dark-border flex flex-col gap-3">
              <div>
                <PanelTitle>Voice</PanelTitle>
                <div className="flex flex-wrap gap-4 mt-2">
                  <Knob
                    label="Algorithm"
                    value={config.algorithm}
                    min={0}
                    max={algorithmCount - 1}
                    onChange={(v) => pushLiveUpdate({ algorithm: Math.round(v) })}
                    size="md"
                    tone="primary"
                    paramKey="furnace.algorithm"
                    formatValue={formatInteger}
                  />
                  <Knob
                    label="Feedback"
                    value={config.feedback}
                    min={0}
                    max={7}
                    onChange={(v) => pushLiveUpdate({ feedback: Math.round(v) })}
                    size="md"
                    tone="secondary"
                    paramKey="furnace.feedback"
                    formatValue={formatInteger}
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-dark-border">
                <PanelTitle>Low Frequency Oscillator</PanelTitle>
                <div className="flex flex-wrap gap-4 mt-2">
                  <Knob
                    label="Pitch Sensitivity"
                    value={config.fms ?? 0}
                    min={0}
                    max={7}
                    onChange={(v) => pushLiveUpdate({ fms: Math.round(v) })}
                    size="md"
                    tone="highlight"
                    paramKey="furnace.fms"
                    formatValue={formatInteger}
                  />
                  <Knob
                    label="Amplitude Sensitivity"
                    value={config.ams ?? 0}
                    min={0}
                    max={3}
                    onChange={(v) => pushLiveUpdate({ ams: Math.round(v) })}
                    size="md"
                    tone="highlight"
                    formatValue={formatInteger}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Operators, numbered 1-4 as on the chip */}
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${operatorCount >= 4 ? '2xl:grid-cols-4' : ''}`}>
            {displayOrder.map((storageIndex, position) => {
              const op = config.operators[storageIndex];
              if (!op) return null; // Skip missing operators (e.g. PSG instruments with no FM data)
              const operatorNumber = position + 1;
              return (
                <OperatorCard
                  key={storageIndex}
                  operatorNumber={operatorNumber}
                  op={op}
                  onUpdate={(u) => updateOperator(storageIndex, u)}
                  ranges={paramRanges}
                  isCarrier={isFmCarrier(config.algorithm, operatorNumber, operatorCount)}
                  hasFeedback={operatorNumber === FM_FEEDBACK_OPERATOR && config.feedback > 0}
                  isSelected={selectedOp === operatorNumber}
                  paramKeyPrefix={storageIndex === 0 ? 'furnace.op1' : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* MACROS TAB */}
      {showFmPanels && activeTab === 'macros' && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-accent-secondary" />
            <PanelTitle>Macro Editor</PanelTitle>
            <span className="text-[10px] font-mono text-text-muted">Draw to edit. Loop and release markers sit under each macro.</span>
          </div>

          {macroEditor}
        </div>
      )}

      {/* CHIP SETTINGS TAB */}
      {showFmPanels && activeTab === 'chip' && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-accent-highlight" />
            <PanelTitle>Chip Settings</PanelTitle>
          </div>

          <div className="flex flex-wrap gap-4">
            {paramRanges.hasDT2 && (
              <Knob
                label="Pitch Sensitivity 2"
                value={config.fms2 ?? 0}
                min={0}
                max={7}
                onChange={(v) => pushLiveUpdate({ fms2: Math.round(v) })}
                size="md"
                tone="highlight"
                formatValue={formatInteger}
              />
            )}
          </div>
        </div>
      )}

      {/* CHIP-SPECIFIC PANELS */}
      {/* Game Boy Panel (chipType 5) */}
      {config.chipType === 5 && (
        <GBPanel config={config} onChange={pushLiveUpdate} />
      )}

      {/* C64/SID Panel (chipType 10) */}
      {config.chipType === 10 && (
        <C64Panel config={config} onChange={pushLiveUpdate} />
      )}

      {/* SNES Panel (chipType 24) */}
      {config.chipType === 24 && (
        <SNESPanel config={config} onChange={pushLiveUpdate} />
      )}

      {/* Amiga Panel (when amiga config present) */}
      {config.amiga && (
        <AmigaPanel config={config} onChange={pushLiveUpdate} />
      )}

      {/* N163 Panel (chipType 8 or n163 config present) */}
      {(config.chipType === 8 || config.n163) && (
        <N163Panel config={config} onChange={pushLiveUpdate} />
      )}

      {/* FDS Panel (chipType 16 or fds config present) */}
      {(config.chipType === 16 || config.fds) && (
        <FDSPanel config={config} onChange={pushLiveUpdate} />
      )}

      {/* ESFM Panel (when esfm config present) */}
      {config.esfm && (
        <ESFMPanel config={config} onChange={pushLiveUpdate} />
      )}

      {/* MultiPCM Panel (when multipcm config present) */}
      {config.multipcm && (
        <MultiPCMPanel config={config} onChange={pushLiveUpdate} />
      )}

      {/* Sound Unit Panel (when soundUnit config present) */}
      {config.soundUnit && (
        <SoundUnitPanel config={config} onChange={pushLiveUpdate} />
      )}

      {/* ES5506 Panel (chipType 21 or es5506 config present) */}
      {(config.chipType === 21 || config.es5506) && (
        <ES5506Panel config={config} onChange={pushLiveUpdate} />
      )}

      {/* SID2 Panel (when sid2 config present) */}
      {config.sid2 && (
        <SID2Panel config={config} onChange={pushLiveUpdate} />
      )}

      {config.sid3 && (<SID3Panel config={config} onChange={pushLiveUpdate} />)}
      {config.fixedDrums != null && (<OPLDrumPanel config={config} onChange={pushLiveUpdate} />)}

      {/* PSG / PULSE PANEL (for other PSG chips) */}
      {category === "PSG" && ![5, 10, 24].includes(config.chipType) && (
        <PSGPanel config={config} onChange={pushLiveUpdate} />
      )}

      {/* NES DPCM NOTE MAP */}
      {config.nes?.dpcmNoteMap && config.nes.dpcmMap && config.nes.dpcmMap.length > 0 && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-3">
            <Music size={16} className="text-accent-highlight" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
              DPCM Note Map ({config.nes.dpcmMap.length} entries)
            </h3>
          </div>
          <div className="max-h-48 overflow-y-auto rounded border border-dark-border">
            <table className="w-full text-[10px] font-mono">
              <thead className="sticky top-0 bg-dark-bg">
                <tr className="text-text-muted">
                  <th className="px-2 py-1 text-left">Note</th>
                  <th className="px-2 py-1 text-right">Freq</th>
                  <th className="px-2 py-1 text-right">Delta</th>
                </tr>
              </thead>
              <tbody>
                {config.nes.dpcmMap.map((entry, i) => {
                  if (entry.freq === 0 && entry.delta === 0) return null;
                  const noteNames = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
                  const noteName = `${noteNames[i % 12]}${Math.floor(i / 12)}`;
                  return (
                    <tr key={i} className="border-t border-dark-border/50 hover:bg-dark-bg/50">
                      <td className="px-2 py-0.5 text-text-secondary">{noteName}</td>
                      <td className="px-2 py-0.5 text-right text-text-primary">{entry.freq}</td>
                      <td className="px-2 py-0.5 text-right text-accent-highlight">{entry.delta}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* WAVETABLE PANEL */}
      {(category === "Wavetable" || config.wavetables.length > 0) && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-4">
            <Waves size={16} className="text-accent-highlight" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
              Wavetable Editor ({config.wavetables.length} waves)
            </h3>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1 text-text-muted hover:text-accent-highlight transition-colors"
              title="Import .wav or .fuw wave"
            >
              <FileUp size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.fuw"
              onChange={handleImport}
              className="hidden"
            />
            <span className="text-[9px] text-text-muted">Draw to edit waveforms</span>
          </div>

          <WavetableListEditor
            wavetables={config.wavetables as WavetableData[]}
            onChange={(wavetables) => onChange({ wavetables })}
          />
        </div>
      )}

      {(category === "Wavetable" || config.wavetables.length > 0 || config.ws) && (
        <WaveSynthPanel config={config} onChange={pushLiveUpdate} />
      )}

      {/* MACROS PANEL (for non-FM categories) */}
      {!showFmPanels && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-accent-secondary" />
            <PanelTitle>Macros ({config.macros.length})</PanelTitle>
            <span className="text-[10px] font-mono text-text-muted">Draw to edit. Loop and release markers sit under each macro.</span>
          </div>

          {macroEditor}
        </div>
      )}

      {/* PCM / SAMPLE PANEL */}
      {category === "PCM" && (
        <PCMPanel config={config} onChange={pushLiveUpdate} />
      )}
      </div>
    </ScrollLockContainer>
  );
};

// ============================================================================
// OPERATOR CARD COMPONENT
// ============================================================================

interface OperatorCardProps {
  /** Operator number as on the chip and in the algorithm diagram (1-based). */
  operatorNumber: number;
  op: FurnaceOperatorConfig;
  onUpdate: (u: Partial<FurnaceOperatorConfig>) => void;
  ranges: ChipParameterRanges;
  isCarrier: boolean;
  /** This operator feeds back into itself (feedback above zero). */
  hasFeedback: boolean;
  /** Highlighted by clicking in the FMAlgorithmDiagram */
  isSelected?: boolean;
  /** MIDI parameter key prefix, set only for the operator the parameter router maps. */
  paramKeyPrefix?: string;
}

type FmNumericParameter = Exclude<FmOperatorParameter, 'am' | 'vib' | 'sus' | 'ksr' | 'egt'>;
type FmSwitchParameter = Extract<FmOperatorParameter, 'am' | 'vib' | 'sus' | 'ksr' | 'egt'>;

/** Operator parameters the MIDI parameter router maps, by key suffix. */
const OPERATOR_PARAM_KEY_SUFFIX: Partial<Record<FmNumericParameter, string>> = {
  tl: 'TL', ar: 'AR', dr: 'DR', sl: 'SL', rr: 'RR',
};

const TWO_OPERATOR_DIAGRAM_LABELS: Record<number, string> = { 2: '1', 1: '2' };

const formatInteger = (value: number): string => String(Math.round(value));

const PanelTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[10px] font-mono font-bold text-text-secondary uppercase tracking-wider">{children}</h3>
);

const OperatorGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="pt-2 border-t border-dark-border">
    <div className="text-[10px] font-mono text-text-muted mb-2">{title}</div>
    <div className="flex flex-wrap items-end gap-x-2 gap-y-3">{children}</div>
  </div>
);

const RoleBadge: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${className}`}>{children}</span>
);

interface OperatorKnobProps {
  parameter: FmNumericParameter;
  value: number;
  min: number;
  max: number;
  tone: ControlTone;
  onUpdate: (u: Partial<FurnaceOperatorConfig>) => void;
  paramKeyPrefix?: string;
  formatValue?: (value: number) => string;
}

const OperatorKnob: React.FC<OperatorKnobProps> = ({
  parameter, value, min, max, tone, onUpdate, paramKeyPrefix, formatValue = formatInteger,
}) => {
  const suffix = OPERATOR_PARAM_KEY_SUFFIX[parameter];
  return (
    <div className="flex justify-center min-w-[72px]">
      <Knob
        label={FM_OPERATOR_PARAMETER_LABELS[parameter]}
        value={value}
        min={min}
        max={max}
        onChange={(v) => onUpdate({ [parameter]: Math.round(v) } as Partial<FurnaceOperatorConfig>)}
        size="sm"
        tone={tone}
        paramKey={paramKeyPrefix && suffix ? `${paramKeyPrefix}${suffix}` : undefined}
        formatValue={formatValue}
      />
    </div>
  );
};

const OperatorSwitch: React.FC<{
  parameter: FmSwitchParameter;
  value: boolean;
  onUpdate: (u: Partial<FurnaceOperatorConfig>) => void;
}> = ({ parameter, value, onUpdate }) => (
  <Toggle
    label={FM_OPERATOR_PARAMETER_LABELS[parameter]}
    value={value}
    onChange={(v) => onUpdate({ [parameter]: v } as Partial<FurnaceOperatorConfig>)}
    tone="highlight"
    size="sm"
  />
);

const OperatorCard: React.FC<OperatorCardProps> = ({
  operatorNumber, op, onUpdate, ranges, isCarrier, hasFeedback, isSelected, paramKeyPrefix,
}) => {
  const border = isSelected
    ? 'border-accent-highlight'
    : isCarrier ? 'border-accent-primary/40' : 'border-dark-border';
  const roleTone: ControlTone = isCarrier ? 'primary' : 'secondary';
  const knob = { onUpdate, paramKeyPrefix };

  return (
    <div className={`bg-dark-bgSecondary p-3 rounded-lg border ${border} flex flex-col gap-3`}>
      {/* Header: number, role, switch */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-bold text-text-primary">Operator {operatorNumber}</span>
          {isCarrier ? (
            <RoleBadge className="border-accent-primary/50 bg-accent-primary/10 text-accent-primary">Carrier</RoleBadge>
          ) : (
            <RoleBadge className="border-dark-borderLight text-text-secondary">Modulator</RoleBadge>
          )}
          {hasFeedback && (
            <RoleBadge className="border-accent-secondary/50 text-accent-secondary">Feedback</RoleBadge>
          )}
        </div>
        <Toggle
          label="Enabled"
          value={op.enabled}
          onChange={(enabled) => onUpdate({ enabled })}
          tone="success"
          size="sm"
        />
      </div>

      {/* Envelope shape at full card width */}
      <EnvelopeVisualization
        mode="adsr"
        tl={op.tl}
        ar={op.ar}
        dr={op.dr}
        d2r={op.d2r ?? 0}
        rr={op.rr}
        sl={op.sl}
        maxTl={ranges.tl.max}
        maxRate={ranges.ar.max}
        color={resolveColor(toneColor(roleTone))}
        width="auto"
        height={72}
      />

      <OperatorGroup title="Level and Frequency">
        <OperatorKnob {...knob} parameter="tl" value={op.tl} min={ranges.tl.min} max={ranges.tl.max} tone={roleTone} />
        <OperatorKnob {...knob} parameter="mult" value={op.mult} min={ranges.mult.min} max={ranges.mult.max} tone="highlight" />
        {ranges.dt.max > ranges.dt.min && (
          <OperatorKnob {...knob} parameter="dt" value={op.dt} min={ranges.dt.min} max={ranges.dt.max} tone="highlight"
            formatValue={formatSignedValue} />
        )}
        {ranges.hasDT2 && (
          <OperatorKnob {...knob} parameter="dt2" value={op.dt2 ?? 0} min={ranges.dt2?.min ?? 0} max={ranges.dt2?.max ?? 3} tone="highlight" />
        )}
        {ranges.hasWS && (
          <OperatorKnob {...knob} parameter="ws" value={op.ws ?? 0} min={ranges.ws?.min ?? 0} max={ranges.ws?.max ?? 7} tone="highlight" />
        )}
        {ranges.ksl && (
          <OperatorKnob {...knob} parameter="ksl" value={op.ksl ?? 0} min={ranges.ksl.min} max={ranges.ksl.max} tone="neutral" />
        )}
      </OperatorGroup>

      <OperatorGroup title="Envelope">
        <OperatorKnob {...knob} parameter="ar" value={op.ar} min={ranges.ar.min} max={ranges.ar.max} tone={roleTone} />
        <OperatorKnob {...knob} parameter="dr" value={op.dr} min={ranges.dr.min} max={ranges.dr.max} tone={roleTone} />
        <OperatorKnob {...knob} parameter="sl" value={op.sl} min={ranges.sl.min} max={ranges.sl.max} tone={roleTone} />
        {ranges.hasD2R && (
          <OperatorKnob {...knob} parameter="d2r" value={op.d2r ?? 0} min={ranges.d2r.min} max={ranges.d2r.max} tone={roleTone} />
        )}
        <OperatorKnob {...knob} parameter="rr" value={op.rr} min={ranges.rr.min} max={ranges.rr.max} tone={roleTone} />
        {ranges.rs.max > 0 && (
          <OperatorKnob {...knob} parameter="rs" value={op.rs ?? 0} min={ranges.rs.min} max={ranges.rs.max} tone="neutral" />
        )}
      </OperatorGroup>

      <OperatorGroup title="Modulation">
        <OperatorSwitch parameter="am" value={op.am ?? false} onUpdate={onUpdate} />
        {ranges.hasWS && (
          <>
            <OperatorSwitch parameter="vib" value={op.vib ?? false} onUpdate={onUpdate} />
            <OperatorSwitch parameter="sus" value={op.sus ?? false} onUpdate={onUpdate} />
            <OperatorSwitch parameter="ksr" value={op.ksr ?? false} onUpdate={onUpdate} />
          </>
        )}
        {ranges.isOPZ && (
          <>
            <OperatorSwitch parameter="egt" value={op.egt ?? false} onUpdate={onUpdate} />
            <OperatorKnob {...knob} parameter="dam" value={op.dam ?? 0} min={0} max={7} tone="neutral" />
            <OperatorKnob {...knob} parameter="dvb" value={op.dvb ?? 0} min={0} max={7} tone="neutral" />
            <OperatorKnob {...knob} parameter="kvs" value={op.kvs ?? 0} min={0} max={3} tone="neutral" />
          </>
        )}
        {ranges.hasSSG && (
          <label className="flex flex-col gap-1 text-[10px] font-mono text-text-muted">
            {FM_OPERATOR_PARAMETER_LABELS.ssg}
            <CustomSelect
              value={String(op.ssg ?? 0)}
              onChange={(v) => onUpdate({ ssg: parseInt(v, 10) })}
              className="bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-2 py-1"
              title={FM_OPERATOR_PARAMETER_LABELS.ssg}
              options={SSG_ENVELOPE_SHAPES.map((shape) => ({ value: String(shape.value), label: shape.label }))}
            />
          </label>
        )}
      </OperatorGroup>
    </div>
  );
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const ToggleButton: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
      value
        ? 'bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight'
        : 'bg-dark-bg border-dark-border text-text-muted hover:text-text-primary'
    }`}
  >
    {label}
  </button>
);

// ============================================================================
// SUB-PANELS (PSG, Wavetable, PCM, GB, C64, SNES)
// ============================================================================

// Game Boy Panel - matches Furnace insEdit.cpp GB editor (lines 6991-7243)
const GB_DEFAULTS = { envVol: 15, envDir: 0, envLen: 2, soundLen: 0, softEnv: false, alwaysInit: true };

const GBPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const gb = useMemo(() => ({ ...GB_DEFAULTS, ...config.gb }), [config.gb]);

  const updateGB = useCallback((updates: Partial<typeof gb>) => {
    onChange({ gb: { ...config.gb, ...GB_DEFAULTS, ...updates } });
  }, [config.gb, onChange]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
      {/* Envelope Settings */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-emerald-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-emerald-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">GB Envelope</h3>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between gap-4">
            <Knob
              label="VOL"
              value={gb.envVol}
              min={0} max={15}
              onChange={(v) => updateGB({ envVol: Math.round(v) })}
              size="md" color="#34d399"
              formatValue={(v) => String(Math.round(v))}
            />
            <Knob
              label="LEN"
              value={gb.envLen}
              min={0} max={7}
              onChange={(v) => updateGB({ envLen: Math.round(v) })}
              size="md" color="#10b981"
              formatValue={(v) => String(Math.round(v))}
            />
            <Knob
              label="SND"
              value={gb.soundLen}
              min={0} max={64}
              onChange={(v) => updateGB({ soundLen: Math.round(v) })}
              size="md" color="#059669"
              formatValue={(v) => v === 0 || v > 63 ? '∞' : String(Math.round(v))}
            />
          </div>

          {/* Direction */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted font-mono">Direction:</span>
            <button
              onClick={() => updateGB({ envDir: 1 })}
              className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
                gb.envDir === 1
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-dark-bg border-dark-border text-text-muted hover:text-text-primary'
              }`}
            >
              ↑ UP
            </button>
            <button
              onClick={() => updateGB({ envDir: 0 })}
              className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
                gb.envDir === 0
                  ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                  : 'bg-dark-bg border-dark-border text-text-muted hover:text-text-primary'
              }`}
            >
              ↓ DOWN
            </button>
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-border">
            <button
              onClick={() => updateGB({ softEnv: !gb.softEnv })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                gb.softEnv
                  ? 'bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Soft Envelope
            </button>
            <button
              onClick={() => updateGB({ alwaysInit: !gb.alwaysInit })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                gb.alwaysInit
                  ? 'bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Always Init
            </button>
            <button
              onClick={() => updateGB({ hwSeqEnabled: !gb.hwSeqEnabled })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                gb.hwSeqEnabled
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              HW Sequence
            </button>
            <button
              onClick={() => updateGB({ doubleWave: !gb.doubleWave })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                gb.doubleWave
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
              title="Double wave length (GBA only)"
            >
              Double Wave (GBA)
            </button>
          </div>

          {/* Duty Cycle */}
          <div className="flex items-center gap-4 pt-2 border-t border-dark-border">
            <Knob
              label="DUTY"
              value={gb.duty ?? 2}
              min={0} max={3}
              onChange={(v) => updateGB({ duty: Math.round(v) })}
              size="sm" color="#6ee7b7"
              formatValue={(v) => ['12.5%', '25%', '50%', '75%'][Math.round(v)] ?? String(Math.round(v))}
            />
            {gb.hwSeqEnabled && (
              <Knob
                label="SEQ LEN"
                value={gb.hwSeqLen ?? 0}
                min={0} max={64}
                onChange={(v) => updateGB({ hwSeqLen: Math.round(v) })}
                size="sm" color="#34d399"
                formatValue={(v) => String(Math.round(v))}
              />
            )}
          </div>
        </div>
      </div>

      {/* Envelope Visualization */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Waves size={16} className="text-emerald-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Envelope Shape</h3>
        </div>
        <GBEnvelopeVisualization
          envVol={gb.envVol}
          envLen={gb.envLen}
          soundLen={gb.soundLen}
          envDir={gb.envDir}
        />
      </div>

      {/* HW Sequence Editor */}
      {gb.hwSeqEnabled && (
        <div className="col-span-1 md:col-span-2 bg-dark-bgSecondary p-4 rounded-lg border border-emerald-500/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-emerald-400" />
              <h3 className="font-mono text-xs font-bold text-text-primary uppercase">HW Sequence Commands</h3>
              <span className="text-[9px] text-text-muted font-mono">({(gb.hwSeq ?? []).length}/64)</span>
            </div>
            <button
              onClick={() => {
                const seq = [...(gb.hwSeq ?? [])];
                if (seq.length < 64) {
                  seq.push({ cmd: 0, data: 0 });
                  updateGB({ hwSeq: seq, hwSeqLen: seq.length });
                }
              }}
              disabled={(gb.hwSeq ?? []).length >= 64}
              className="p-1 text-emerald-400 hover:text-emerald-300 disabled:text-text-muted disabled:opacity-50 transition-colors"
              title="Add command"
            >
              <Plus size={14} />
            </button>
          </div>

          {(gb.hwSeq ?? []).length === 0 ? (
            <span className="text-[9px] text-text-muted font-mono">No commands. Click + to add.</span>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {(gb.hwSeq ?? []).map((entry, i) => (
                <GBHWSeqRow
                  key={i}
                  index={i}
                  cmd={entry.cmd}
                  data={entry.data}
                  totalCount={(gb.hwSeq ?? []).length}
                  onChange={(cmd, data) => {
                    const seq = [...(gb.hwSeq ?? [])];
                    seq[i] = { cmd, data };
                    updateGB({ hwSeq: seq });
                  }}
                  onMoveUp={() => {
                    if (i <= 0) return;
                    const seq = [...(gb.hwSeq ?? [])];
                    [seq[i - 1], seq[i]] = [seq[i], seq[i - 1]];
                    updateGB({ hwSeq: seq });
                  }}
                  onMoveDown={() => {
                    const seq = gb.hwSeq ?? [];
                    if (i >= seq.length - 1) return;
                    const newSeq = [...seq];
                    [newSeq[i], newSeq[i + 1]] = [newSeq[i + 1], newSeq[i]];
                    updateGB({ hwSeq: newSeq });
                  }}
                  onRemove={() => {
                    const seq = [...(gb.hwSeq ?? [])];
                    seq.splice(i, 1);
                    updateGB({ hwSeq: seq, hwSeqLen: seq.length });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Compact numeric input helper
const NumInput: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, onChange }) => (
  <div className="flex items-center gap-1">
    <span className="text-[8px] text-text-muted font-mono w-8 text-right">{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || 0)))}
      className="w-12 bg-dark-bg border border-dark-border text-[9px] text-text-primary rounded px-1 py-0.5 text-center font-mono"
    />
  </div>
);

// GB HW Sequence Row — bitpacking per Furnace insEdit.cpp
const GB_HWSEQ_CMD_NAMES = ['Envelope', 'Sweep', 'Wait', 'Wait for Release', 'Loop', 'Loop until Release'];

const GBHWSeqRow: React.FC<{
  index: number;
  cmd: number;
  data: number;
  totalCount: number;
  onChange: (cmd: number, data: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}> = ({ index, cmd, data, totalCount, onChange, onMoveUp, onMoveDown, onRemove }) => {
  // Bitpacking helpers per insEdit.cpp
  // Envelope (cmd 0): data = (len&7)|(dir?8:0)|(vol<<4)|(soundLen<<8)
  // Sweep (cmd 1): data = (shift&7)|(dir?8:0)|(speed<<4)
  // Wait (cmd 2): data = ticks-1
  // Wait for Release (cmd 3): no params
  // Loop (cmd 4): data = position
  // Loop until Release (cmd 5): data = position

  const renderParams = () => {
    switch (cmd) {
      case 0: { // Envelope
        const len = data & 7;
        const dir = (data & 8) !== 0;
        const vol = (data >> 4) & 0xF;
        const soundLen = (data >> 8) & 0xFF;
        const pack = (v: number, d: boolean, l: number, s: number) =>
          (l & 7) | (d ? 8 : 0) | ((v & 0xF) << 4) | ((s & 0xFF) << 8);
        return (
          <>
            <NumInput label="Vol" value={vol} min={0} max={15}
              onChange={(v) => onChange(cmd, pack(v, dir, len, soundLen))} />
            <button
              onClick={() => onChange(cmd, pack(vol, !dir, len, soundLen))}
              className={`px-1.5 py-0.5 text-[8px] font-mono rounded border transition-colors ${
                dir ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' : 'bg-rose-600/20 border-rose-500/50 text-rose-400'
              }`}
            >
              {dir ? '\u2191' : '\u2193'}
            </button>
            <NumInput label="Len" value={len} min={0} max={7}
              onChange={(v) => onChange(cmd, pack(vol, dir, v, soundLen))} />
            <NumInput label="Snd" value={soundLen} min={0} max={64}
              onChange={(v) => onChange(cmd, pack(vol, dir, len, v))} />
          </>
        );
      }
      case 1: { // Sweep
        const shift = data & 7;
        const dir = (data & 8) !== 0;
        const speed = (data >> 4) & 7;
        const pack = (sh: number, d: boolean, sp: number) =>
          (sh & 7) | (d ? 8 : 0) | ((sp & 7) << 4);
        return (
          <>
            <NumInput label="Shift" value={shift} min={0} max={7}
              onChange={(v) => onChange(cmd, pack(v, dir, speed))} />
            <button
              onClick={() => onChange(cmd, pack(shift, !dir, speed))}
              className={`px-1.5 py-0.5 text-[8px] font-mono rounded border transition-colors ${
                dir ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' : 'bg-rose-600/20 border-rose-500/50 text-rose-400'
              }`}
            >
              {dir ? '\u2191' : '\u2193'}
            </button>
            <NumInput label="Speed" value={speed} min={0} max={7}
              onChange={(v) => onChange(cmd, pack(shift, dir, v))} />
          </>
        );
      }
      case 2: // Wait
        return (
          <NumInput label="Ticks" value={(data & 0xFF) + 1} min={1} max={255}
            onChange={(v) => onChange(cmd, Math.max(0, v - 1))} />
        );
      case 3: // Wait for Release
        return <span className="text-[8px] text-text-muted font-mono italic">no params</span>;
      case 4: // Loop
      case 5: // Loop until Release
        return (
          <NumInput label="Pos" value={data & 0xFF} min={0} max={totalCount - 1}
            onChange={(v) => onChange(cmd, v)} />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center gap-1 py-0.5 px-1 rounded bg-dark-bg/50 border border-dark-border/50">
      <span className="text-[8px] text-emerald-400 font-mono w-4 text-right">{index}</span>
      <CustomSelect
        value={String(cmd)}
        onChange={(v) => onChange(parseInt(v), 0)}
        className="bg-dark-bg border border-dark-border rounded px-1 py-0.5 text-[9px] text-text-primary font-mono"
        options={GB_HWSEQ_CMD_NAMES.map((name, i) => ({ value: String(i), label: name }))}
      />
      <div className="flex items-center gap-1 flex-1">
        {renderParams()}
      </div>
      <button onClick={onMoveUp} disabled={index === 0}
        className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors">
        <ChevronUp size={10} />
      </button>
      <button onClick={onMoveDown} disabled={index >= totalCount - 1}
        className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors">
        <ChevronDown size={10} />
      </button>
      <button onClick={onRemove}
        className="p-0.5 text-text-muted hover:text-rose-400 transition-colors">
        <Trash2 size={10} />
      </button>
    </div>
  );
};

// GB Envelope Visualization (matches Furnace drawGBEnv)
const GBEnvelopeVisualization: React.FC<{
  envVol: number;
  envLen: number;
  soundLen: number;
  envDir: number;
}> = ({ envVol, envLen, soundLen, envDir }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = 200;
  const height = 80;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.setLineDash([2, 2]);
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw envelope
    ctx.beginPath();
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;

    const startVol = envDir === 1 ? 0 : envVol;
    const endVol = envDir === 1 ? envVol : 0;
    const decaySteps = envLen === 0 ? 1 : 16 - envVol;
    const totalLength = soundLen === 0 || soundLen > 63 ? width : (soundLen / 64) * width;

    const startY = height - (startVol / 15) * (height - 8) - 4;
    const endY = height - (endVol / 15) * (height - 8) - 4;

    ctx.moveTo(0, startY);

    if (envLen === 0) {
      // No decay - stay at initial level
      ctx.lineTo(totalLength, startY);
    } else {
      // Calculate decay time
      const decayX = Math.min((decaySteps * envLen * 4), totalLength);
      ctx.lineTo(decayX, endY);
      // Hold at final level
      if (decayX < totalLength) {
        ctx.lineTo(totalLength, endY);
      }
    }

    ctx.stroke();

    // Labels
    ctx.font = '9px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`V:${envVol}`, 4, 12);
    ctx.fillText(`L:${envLen}`, 4, 24);
    ctx.fillText(envDir === 1 ? '↑' : '↓', width - 12, 12);
  }, [envVol, envLen, soundLen, envDir]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full rounded border border-dark-border"
      style={{ height }}
    />
  );
};

// ============================================================================
// WAVE SYNTH PANEL
// ============================================================================

const WAVE_SYNTH_DEFAULTS: FurnaceWaveSynthConfig = {
  enabled: false, wave1: 0, wave2: 0, rateDivider: 1, effect: 0,
  oneShot: false, global: true, speed: 0, param1: 0, param2: 0, param3: 0, param4: 0,
};

const WAVE_SYNTH_SINGLE_EFFECTS = ['None', 'Invert', 'Add', 'Subtract', 'Average', 'Phase', 'Chorus'];
const WAVE_SYNTH_DUAL_EFFECTS = ['None (dual)', 'Wipe', 'Fade', 'Fade (ping-pong)', 'Overlay', 'Negative Overlay', 'Slide', 'Mix Chorus', 'Phase Modulation'];

const WaveSynthPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const ws = useMemo(() => ({ ...WAVE_SYNTH_DEFAULTS, ...config.ws }), [config.ws]);

  const updateWS = useCallback((updates: Partial<FurnaceWaveSynthConfig>) => {
    onChange({ ws: { ...config.ws, ...WAVE_SYNTH_DEFAULTS, ...updates } });
  }, [config.ws, onChange]);

  const isDual = ws.effect >= 128;
  const effectIndex = isDual ? ws.effect - 128 : ws.effect;
  const effectNames = isDual ? WAVE_SYNTH_DUAL_EFFECTS : WAVE_SYNTH_SINGLE_EFFECTS;

  return (
    <div className="bg-dark-bgSecondary p-4 rounded-lg border border-cyan-500/30 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Waves size={16} className="text-cyan-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Wave Synth</h3>
        </div>
        <button
          onClick={() => updateWS({ enabled: !ws.enabled })}
          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
            ws.enabled
              ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
              : 'bg-dark-bg border-dark-border text-text-muted'
          }`}
        >
          {ws.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {ws.enabled && (
        <div className="space-y-4">
          {/* Single / Dual mode */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted font-mono">Mode:</span>
            <button
              onClick={() => updateWS({ effect: effectIndex })}
              className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
                !isDual
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-dark-bg border-dark-border text-text-muted hover:text-text-primary'
              }`}
            >
              Single
            </button>
            <button
              onClick={() => updateWS({ effect: 128 + Math.min(effectIndex, WAVE_SYNTH_DUAL_EFFECTS.length - 1) })}
              className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
                isDual
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-dark-bg border-dark-border text-text-muted hover:text-text-primary'
              }`}
            >
              Dual
            </button>
          </div>

          {/* Effect selector */}
          <div>
            <label className="text-[10px] text-text-muted font-mono block mb-1">Effect</label>
            <CustomSelect
              value={String(effectIndex)}
              onChange={(v) => {
                const idx = parseInt(v);
                updateWS({ effect: isDual ? 128 + idx : idx });
              }}
              className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary w-full"
              options={effectNames.map((name, i) => ({ value: String(i), label: name }))}
            />
          </div>

          {/* Wave selectors and knobs */}
          <div className="flex flex-wrap gap-3">
            <Knob label="WAVE 1" value={ws.wave1} min={0} max={255}
              onChange={(v) => updateWS({ wave1: Math.round(v) })}
              size="sm" color="#06b6d4" formatValue={(v) => String(Math.round(v))} />
            {isDual && (
              <Knob label="WAVE 2" value={ws.wave2} min={0} max={255}
                onChange={(v) => updateWS({ wave2: Math.round(v) })}
                size="sm" color="#22d3ee" formatValue={(v) => String(Math.round(v))} />
            )}
            <Knob label="SPEED" value={ws.speed} min={0} max={255}
              onChange={(v) => updateWS({ speed: Math.round(v) })}
              size="sm" color="#67e8f9" formatValue={(v) => String(Math.round(v))} />
            <Knob label="RATE" value={ws.rateDivider} min={1} max={255}
              onChange={(v) => updateWS({ rateDivider: Math.round(v) })}
              size="sm" color="#a5f3fc" formatValue={(v) => String(Math.round(v))} />
            <Knob label="AMOUNT" value={ws.param1} min={0} max={255}
              onChange={(v) => updateWS({ param1: Math.round(v) })}
              size="sm" color="#0891b2" formatValue={(v) => String(Math.round(v))} />
            {isDual && ws.effect === 136 && (
              <Knob label="POWER" value={ws.param2} min={0} max={255}
                onChange={(v) => updateWS({ param2: Math.round(v) })}
                size="sm" color="#0e7490" formatValue={(v) => String(Math.round(v))} />
            )}
          </div>

          {/* Global / One-Shot */}
          <div className="flex gap-2 pt-2 border-t border-dark-border">
            <button
              onClick={() => updateWS({ global: !ws.global })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                ws.global
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Global
            </button>
            <button
              onClick={() => updateWS({ oneShot: !ws.oneShot })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                ws.oneShot
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              One-Shot
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SID3 PANEL
// ============================================================================

const SID3_DEFAULTS: FurnaceSID3Config = {
  triOn: false, sawOn: false, pulseOn: false, noiseOn: false,
  dutyIsAbs: false, a: 0, d: 0, s: 0, sr: 0, r: 0,
  mixMode: 0, duty: 0, ringMod: false, oscSync: false, phaseMod: false,
  specialWaveOn: false, oneBitNoise: false, separateNoisePitch: false,
  doWavetable: false, resetDuty: false,
  phaseModSource: 0, ringModSource: 0, syncSource: 0, specialWave: 0,
  phaseInv: 0, feedback: 0, filters: [],
};

const SID3_FILTER_DEFAULTS: FurnaceSID3Filter = {
  enabled: false, init: false, absoluteCutoff: false,
  bindCutoffToNote: false, bindCutoffToNoteDir: false, bindCutoffOnNote: false,
  bindResonanceToNote: false, bindResonanceToNoteDir: false, bindResonanceOnNote: false,
  cutoff: 0, resonance: 0, outputVolume: 0, distortion: 0, mode: 0, filterMatrix: 0,
  bindCutoffToNoteStrength: 0, bindCutoffToNoteCenter: 0,
  bindResonanceToNoteStrength: 0, bindResonanceToNoteCenter: 0,
};

const SID3Panel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const sid3 = useMemo(() => ({ ...SID3_DEFAULTS, ...config.sid3, filters: config.sid3?.filters ?? [] }), [config.sid3]);

  const updateSID3 = useCallback((updates: Partial<FurnaceSID3Config>) => {
    onChange({ sid3: { ...SID3_DEFAULTS, ...config.sid3, ...updates } });
  }, [config.sid3, onChange]);

  const updateFilter = useCallback((idx: number, updates: Partial<FurnaceSID3Filter>) => {
    const filters = [...(config.sid3?.filters ?? [])];
    filters[idx] = { ...SID3_FILTER_DEFAULTS, ...filters[idx], ...updates };
    updateSID3({ filters });
  }, [config.sid3, updateSID3]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      {/* Waveform & Modulation */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Waves size={16} className="text-violet-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">SID3 Waveform</h3>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {([
            { key: 'triOn', label: 'TRI' },
            { key: 'sawOn', label: 'SAW' },
            { key: 'pulseOn', label: 'PULSE' },
            { key: 'noiseOn', label: 'NOISE' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => updateSID3({ [key]: !sid3[key] })}
              className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
                sid3[key]
                  ? 'bg-violet-600/20 border-violet-500/50 text-violet-400'
                  : 'bg-dark-bg border-dark-border text-text-muted hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            { key: 'ringMod', label: 'RING' },
            { key: 'oscSync', label: 'SYNC' },
            { key: 'phaseMod', label: 'PHASE MOD' },
            { key: 'specialWaveOn', label: 'SPECIAL WAVE' },
            { key: 'resetDuty', label: 'RESET DUTY' },
            { key: 'oneBitNoise', label: '1-BIT NOISE' },
            { key: 'doWavetable', label: 'WAVETABLE' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => updateSID3({ [key]: !sid3[key] })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                sid3[key]
                  ? 'bg-violet-600/20 border-violet-500/50 text-violet-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ADSR + SR */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-violet-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">SID3 Envelope</h3>
        </div>
        <div className="flex flex-wrap justify-between gap-3">
          <Knob label="A" value={sid3.a} min={0} max={255}
            onChange={(v) => updateSID3({ a: Math.round(v) })}
            size="md" color="#8b5cf6" formatValue={(v) => String(Math.round(v))} />
          <Knob label="D" value={sid3.d} min={0} max={255}
            onChange={(v) => updateSID3({ d: Math.round(v) })}
            size="md" color="#7c3aed" formatValue={(v) => String(Math.round(v))} />
          <Knob label="S" value={sid3.s} min={0} max={255}
            onChange={(v) => updateSID3({ s: Math.round(v) })}
            size="md" color="#6d28d9" formatValue={(v) => String(Math.round(v))} />
          <Knob label="SR" value={sid3.sr} min={0} max={255}
            onChange={(v) => updateSID3({ sr: Math.round(v) })}
            size="md" color="#5b21b6" formatValue={(v) => String(Math.round(v))} />
          <Knob label="R" value={sid3.r} min={0} max={255}
            onChange={(v) => updateSID3({ r: Math.round(v) })}
            size="md" color="#4c1d95" formatValue={(v) => String(Math.round(v))} />
        </div>
      </div>

      {/* Duty, Mix, Feedback, Phase */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-violet-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">SID3 Controls</h3>
        </div>
        <div className="flex flex-wrap gap-3 mb-3">
          <Knob label="DUTY" value={sid3.duty} min={0} max={4095}
            onChange={(v) => updateSID3({ duty: Math.round(v) })}
            size="sm" color="#a78bfa" formatValue={(v) => String(Math.round(v))} />
          <Knob label="MIX" value={sid3.mixMode} min={0} max={3}
            onChange={(v) => updateSID3({ mixMode: Math.round(v) })}
            size="sm" color="#c4b5fd" formatValue={(v) => String(Math.round(v))} />
          <Knob label="FB" value={sid3.feedback} min={0} max={255}
            onChange={(v) => updateSID3({ feedback: Math.round(v) })}
            size="sm" color="#ddd6fe" formatValue={(v) => String(Math.round(v))} />
          <Knob label="PH INV" value={sid3.phaseInv} min={0} max={15}
            onChange={(v) => updateSID3({ phaseInv: Math.round(v) })}
            size="sm" color="#ede9fe" formatValue={(v) => String(Math.round(v))} />
        </div>

        {/* Modulation Sources */}
        <div className="flex flex-wrap gap-3 pt-2 border-t border-dark-border">
          <Knob label="PM SRC" value={sid3.phaseModSource} min={0} max={7}
            onChange={(v) => updateSID3({ phaseModSource: Math.round(v) })}
            size="sm" color="#8b5cf6" formatValue={(v) => String(Math.round(v))} />
          <Knob label="RM SRC" value={sid3.ringModSource} min={0} max={7}
            onChange={(v) => updateSID3({ ringModSource: Math.round(v) })}
            size="sm" color="#7c3aed" formatValue={(v) => String(Math.round(v))} />
          <Knob label="SYNC SRC" value={sid3.syncSource} min={0} max={7}
            onChange={(v) => updateSID3({ syncSource: Math.round(v) })}
            size="sm" color="#6d28d9" formatValue={(v) => String(Math.round(v))} />
          <Knob label="SPCL WAVE" value={sid3.specialWave} min={0} max={255}
            onChange={(v) => updateSID3({ specialWave: Math.round(v) })}
            size="sm" color="#5b21b6" formatValue={(v) => String(Math.round(v))} />
        </div>
      </div>

      {/* Filters */}
      {sid3.filters.map((filt, idx) => {
        const f = { ...SID3_FILTER_DEFAULTS, ...filt };
        return (
          <div key={idx} className="bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Volume2 size={16} className="text-violet-400" />
                <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Filter {idx + 1}</h3>
              </div>
              <button
                onClick={() => updateFilter(idx, { enabled: !f.enabled })}
                className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                  f.enabled
                    ? 'bg-violet-600/20 border-violet-500/50 text-violet-400'
                    : 'bg-dark-bg border-dark-border text-text-muted'
                }`}
              >
                {f.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
            {f.enabled && (
              <div className="flex flex-wrap gap-3">
                <Knob label="CUT" value={f.cutoff} min={0} max={65535}
                  onChange={(v) => updateFilter(idx, { cutoff: Math.round(v) })}
                  size="sm" color="#a78bfa" formatValue={(v) => String(Math.round(v))} />
                <Knob label="RES" value={f.resonance} min={0} max={255}
                  onChange={(v) => updateFilter(idx, { resonance: Math.round(v) })}
                  size="sm" color="#8b5cf6" formatValue={(v) => String(Math.round(v))} />
                <Knob label="VOL" value={f.outputVolume} min={0} max={255}
                  onChange={(v) => updateFilter(idx, { outputVolume: Math.round(v) })}
                  size="sm" color="#7c3aed" formatValue={(v) => String(Math.round(v))} />
                <Knob label="DIST" value={f.distortion} min={0} max={255}
                  onChange={(v) => updateFilter(idx, { distortion: Math.round(v) })}
                  size="sm" color="#6d28d9" formatValue={(v) => String(Math.round(v))} />
                <Knob label="MODE" value={f.mode} min={0} max={15}
                  onChange={(v) => updateFilter(idx, { mode: Math.round(v) })}
                  size="sm" color="#5b21b6" formatValue={(v) => String(Math.round(v))} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// OPL DRUM PANEL
// ============================================================================

const OPLDrumPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  return (
    <div className="bg-dark-bgSecondary p-4 rounded-lg border border-amber-500/30 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Music size={16} className="text-amber-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">OPL Drums</h3>
        </div>
        <button
          onClick={() => onChange({ fixedDrums: !config.fixedDrums })}
          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
            config.fixedDrums
              ? 'bg-amber-600/20 border-amber-500/50 text-amber-400'
              : 'bg-dark-bg border-dark-border text-text-muted'
          }`}
        >
          {config.fixedDrums ? 'FIXED ON' : 'FIXED OFF'}
        </button>
      </div>

      {config.fixedDrums && (
        <div className="flex flex-wrap gap-3">
          <Knob label="KICK" value={config.kickFreq ?? 0} min={0} max={65535}
            onChange={(v) => onChange({ kickFreq: Math.round(v) })}
            size="md" color="#f59e0b" formatValue={(v) => String(Math.round(v))} />
          <Knob label="SNARE/HAT" value={config.snareHatFreq ?? 0} min={0} max={65535}
            onChange={(v) => onChange({ snareHatFreq: Math.round(v) })}
            size="md" color="#fbbf24" formatValue={(v) => String(Math.round(v))} />
          <Knob label="TOM/TOP" value={config.tomTopFreq ?? 0} min={0} max={65535}
            onChange={(v) => onChange({ tomTopFreq: Math.round(v) })}
            size="md" color="#d97706" formatValue={(v) => String(Math.round(v))} />
        </div>
      )}
    </div>
  );
};

// C64/SID Panel - matches Furnace insEdit.cpp C64 editor (lines 7244-7400)
const C64_DEFAULTS = {
  triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
  a: 0, d: 8, s: 8, r: 4, duty: 2048, ringMod: false, oscSync: false,
  toFilter: false, filterCutoff: 1024, filterResonance: 0, filterLP: false, filterBP: false, filterHP: false
};

const C64Panel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const c64 = useMemo(() => ({ ...C64_DEFAULTS, ...config.c64 }), [config.c64]);

  const updateC64 = useCallback((updates: Partial<typeof c64>) => {
    onChange({ c64: { ...config.c64, ...C64_DEFAULTS, ...updates } });
  }, [config.c64, onChange]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      {/* Waveform Selection */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Waves size={16} className="text-violet-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Waveform</h3>
        </div>

        <div className="flex gap-2">
          {([
            { key: 'triOn',   label: 'TRI',   wfType: 'triangle', active: c64.triOn,   onColor: '#34d399', borderColor: 'border-emerald-500/50', textColor: 'text-emerald-400', bgColor: 'bg-emerald-600/20' },
            { key: 'sawOn',   label: 'SAW',   wfType: 'saw',      active: c64.sawOn,   onColor: '#fbbf24', borderColor: 'border-amber-500/50',   textColor: 'text-amber-400',   bgColor: 'bg-amber-600/20' },
            { key: 'pulseOn', label: 'PULSE', wfType: 'square',   active: c64.pulseOn, onColor: '#22d3ee', borderColor: 'border-accent-highlight/50',    textColor: 'text-accent-highlight',    bgColor: 'bg-accent-highlight/20' },
            { key: 'noiseOn', label: 'NOISE', wfType: 'noise',    active: c64.noiseOn, onColor: '#fb7185', borderColor: 'border-rose-500/50',    textColor: 'text-rose-400',    bgColor: 'bg-rose-600/20' },
          ] as const).map(({ key, label, wfType, active, onColor, borderColor, textColor, bgColor }) => (
            <button
              key={key}
              onClick={() => updateC64({ [key]: !active })}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded border transition-colors ${
                active
                  ? `${bgColor} ${borderColor} ${textColor}`
                  : 'bg-dark-bg border-dark-border text-text-muted hover:text-text-primary'
              }`}
            >
              <WaveformThumbnail
                type={wfType}
                width={40} height={16}
                color={active ? onColor : '#4b5563'}
                style="line"
              />
              <span className="text-[9px] font-mono">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ADSR Envelope */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-amber-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">ADSR Envelope</h3>
        </div>

        <div className="mb-3">
          <EnvelopeVisualization
            mode="adsr"
            ar={c64.a}
            dr={c64.d}
            rr={c64.r}
            sl={c64.s}
            tl={0}
            maxRate={15}
            maxTl={1}
            color="#f59e0b"
            width={260}
            height={52}
          />
        </div>

        <div className="flex justify-between gap-4">
          <Knob label="A" value={c64.a} min={0} max={15}
            onChange={(v) => updateC64({ a: Math.round(v) })}
            size="md" color="#f59e0b" formatValue={(v) => String(Math.round(v))} />
          <Knob label="D" value={c64.d} min={0} max={15}
            onChange={(v) => updateC64({ d: Math.round(v) })}
            size="md" color="#fb923c" formatValue={(v) => String(Math.round(v))} />
          <Knob label="S" value={c64.s} min={0} max={15}
            onChange={(v) => updateC64({ s: Math.round(v) })}
            size="md" color="#fbbf24" formatValue={(v) => String(Math.round(v))} />
          <Knob label="R" value={c64.r} min={0} max={15}
            onChange={(v) => updateC64({ r: Math.round(v) })}
            size="md" color="#facc15" formatValue={(v) => String(Math.round(v))} />
        </div>
      </div>

      {/* Duty & Modulation */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-accent-highlight" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Pulse Width</h3>
          </div>
          <Knob label="DUTY" value={c64.duty} min={0} max={4095}
            onChange={(v) => updateC64({ duty: Math.round(v) })}
            size="md" color="#22d3ee" formatValue={(v) => String(Math.round(v))} />
        </div>

        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-rose-400" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Modulation</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => updateC64({ ringMod: !c64.ringMod })}
              className={`flex-1 px-2 py-2 text-[10px] font-mono rounded border transition-colors ${
                c64.ringMod
                  ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              RING
            </button>
            <button
              onClick={() => updateC64({ oscSync: !c64.oscSync })}
              className={`flex-1 px-2 py-2 text-[10px] font-mono rounded border transition-colors ${
                c64.oscSync
                  ? 'bg-violet-600/20 border-violet-500/50 text-violet-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              SYNC
            </button>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Volume2 size={16} className="text-purple-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Filter</h3>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => updateC64({ toFilter: !c64.toFilter })}
            className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
              c64.toFilter
                ? 'bg-purple-600/20 border-purple-500/50 text-purple-400'
                : 'bg-dark-bg border-dark-border text-text-muted'
            }`}
          >
            Enable
          </button>

          {c64.toFilter && (
            <>
              <Knob label="CUT" value={c64.filterCutoff ?? 1024} min={0} max={2047}
                onChange={(v) => updateC64({ filterCutoff: Math.round(v) })}
                size="sm" color="#a855f7" formatValue={(v) => String(Math.round(v))} />
              <Knob label="RES" value={c64.filterResonance ?? 0} min={0} max={15}
                onChange={(v) => updateC64({ filterResonance: Math.round(v) })}
                size="sm" color="#c084fc" formatValue={(v) => String(Math.round(v))} />

              <div className="flex gap-1">
                <button
                  onClick={() => updateC64({ filterLP: !c64.filterLP })}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                    c64.filterLP
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-400'
                      : 'bg-dark-bg border-dark-border text-text-muted'
                  }`}
                >
                  LP
                </button>
                <button
                  onClick={() => updateC64({ filterBP: !c64.filterBP })}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                    c64.filterBP
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-400'
                      : 'bg-dark-bg border-dark-border text-text-muted'
                  }`}
                >
                  BP
                </button>
                <button
                  onClick={() => updateC64({ filterHP: !c64.filterHP })}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                    c64.filterHP
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-400'
                      : 'bg-dark-bg border-dark-border text-text-muted'
                  }`}
                >
                  HP
                </button>
                <button
                  onClick={() => updateC64({ filterCh3Off: !c64.filterCh3Off })}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                    c64.filterCh3Off
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-400'
                      : 'bg-dark-bg border-dark-border text-text-muted'
                  }`}
                >
                  CH3 OFF
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Advanced Options */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-text-muted" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Options</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => updateC64({ dutyIsAbs: !c64.dutyIsAbs })}
            className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
              c64.dutyIsAbs
                ? 'bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight'
                : 'bg-dark-bg border-dark-border text-text-muted'
            }`}
          >
            Absolute Duty
          </button>
          <button
            onClick={() => updateC64({ filterIsAbs: !c64.filterIsAbs })}
            className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
              c64.filterIsAbs
                ? 'bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight'
                : 'bg-dark-bg border-dark-border text-text-muted'
            }`}
          >
            Absolute Filter
          </button>
          <button
            onClick={() => updateC64({ noTest: !c64.noTest })}
            className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
              c64.noTest
                ? 'bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight'
                : 'bg-dark-bg border-dark-border text-text-muted'
            }`}
          >
            No Test Bit
          </button>
          <button
            onClick={() => updateC64({ resetDuty: !c64.resetDuty })}
            className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
              c64.resetDuty
                ? 'bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight'
                : 'bg-dark-bg border-dark-border text-text-muted'
            }`}
          >
            Reset Duty
          </button>
          <button
            onClick={() => updateC64({ initFilter: !c64.initFilter })}
            className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
              c64.initFilter
                ? 'bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight'
                : 'bg-dark-bg border-dark-border text-text-muted'
            }`}
          >
            Init Filter
          </button>
        </div>
      </div>
    </div>
  );
};

// SNES Panel - matches Furnace insEdit.cpp SNES editor (lines 7978-8093)
const SNES_DEFAULTS = { useEnv: true, gainMode: 0, gain: 127, a: 15, d: 7, s: 7, r: 0 };

const SNESPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const snes = useMemo(() => ({ ...SNES_DEFAULTS, ...config.snes }), [config.snes]);

  const updateSNES = useCallback((updates: Partial<typeof snes>) => {
    onChange({ snes: { ...config.snes, ...SNES_DEFAULTS, ...updates } });
  }, [config.snes, onChange]);

  const gainModes = ['Direct', 'Inc Linear', 'Inc Bent', 'Dec Linear', 'Dec Exp'];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      {/* Envelope Mode */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-accent-highlight/30">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-accent-highlight" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">SNES Envelope</h3>
          <button
            onClick={() => updateSNES({ useEnv: !snes.useEnv })}
            className={`ml-auto px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
              snes.useEnv
                ? 'bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight'
                : 'bg-dark-bg border-dark-border text-text-muted'
            }`}
          >
            {snes.useEnv ? 'ADSR' : 'GAIN'}
          </button>
        </div>

        {snes.useEnv ? (
          <div className="space-y-3">
            <div className="flex justify-between gap-4">
              <Knob label="A" value={snes.a} min={0} max={15}
                onChange={(v) => updateSNES({ a: Math.round(v) })}
                size="md" color="#06b6d4" formatValue={(v) => String(Math.round(v))} />
              <Knob label="D" value={snes.d} min={0} max={7}
                onChange={(v) => updateSNES({ d: Math.round(v) })}
                size="md" color="#22d3ee" formatValue={(v) => String(Math.round(v))} />
              <Knob label="S" value={snes.s} min={0} max={7}
                onChange={(v) => updateSNES({ s: Math.round(v) })}
                size="md" color="#67e8f9" formatValue={(v) => String(Math.round(v))} />
              <Knob label="R" value={snes.r} min={0} max={31}
                onChange={(v) => updateSNES({ r: Math.round(v) })}
                size="md" color="#a5f3fc" formatValue={(v) => String(Math.round(v))} />
            </div>
            <div className="flex items-center gap-4 pt-2 border-t border-dark-border">
              <Knob label="D2" value={snes.d2 ?? 0} min={0} max={31}
                onChange={(v) => updateSNES({ d2: Math.round(v) })}
                size="sm" color="#0891b2" formatValue={(v) => String(Math.round(v))} />
              <button
                onClick={() => updateSNES({ sus: (snes.sus ?? 0) ? 0 : 1 })}
                className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                  (snes.sus ?? 0)
                    ? 'bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight'
                    : 'bg-dark-bg border-dark-border text-text-muted'
                }`}
              >
                Sustain Mode
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div>
              <label className="text-[10px] text-text-muted font-mono block mb-1">Gain Mode</label>
              <CustomSelect
                value={String(typeof snes.gainMode === 'number' ? snes.gainMode : 0)}
                onChange={(v) => updateSNES({ gainMode: parseInt(v) })}
                className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
                options={gainModes.map((mode, i) => ({ value: String(i), label: mode }))}
              />
            </div>
            <Knob label="GAIN" value={snes.gain} min={0} max={127}
              onChange={(v) => updateSNES({ gain: Math.round(v) })}
              size="md" color="#06b6d4" formatValue={(v) => String(Math.round(v))} />
          </div>
        )}
      </div>
    </div>
  );
};

// PSG Panel - fixed to use actual config values
const PSG_DEFAULTS = { duty: 50, width: 50, noiseMode: 'white' as const, attack: 0, decay: 8, sustain: 10, release: 5 };

const PSGPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const psg = useMemo(() => ({ ...PSG_DEFAULTS, ...config.psg }), [config.psg]);

  const updatePSG = useCallback((updates: Partial<typeof psg>) => {
    onChange({ psg: { ...config.psg, ...PSG_DEFAULTS, ...updates } });
  }, [config.psg, onChange]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2">
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Music size={16} className="text-sky-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Pulse Control</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <Knob label="DUTY" value={psg.duty} min={0} max={100}
            onChange={(v) => updatePSG({ duty: Math.round(v) })}
            size="md" color="#38bdf8" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob label="WIDTH" value={psg.width} min={0} max={100}
            onChange={(v) => updatePSG({ width: Math.round(v) })}
            size="md" color="#0ea5e9" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </div>

      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-rose-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Noise Mode</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => updatePSG({ noiseMode: 'white' })}
            className={`py-2 font-mono text-[10px] rounded border transition-colors ${
              psg.noiseMode === 'white'
                ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                : 'bg-dark-bg border-dark-border text-text-muted hover:bg-rose-950/20'
            }`}
          >
            WHITE
          </button>
          <button
            onClick={() => updatePSG({ noiseMode: 'periodic' })}
            className={`py-2 font-mono text-[10px] rounded border transition-colors ${
              psg.noiseMode === 'periodic'
                ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                : 'bg-dark-bg border-dark-border text-text-muted hover:bg-rose-950/20'
            }`}
          >
            PERIODIC
          </button>
        </div>
      </div>

      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-emerald-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Envelope</h3>
        </div>
        <div className="flex justify-between gap-2">
          <Knob label="ATK" value={psg.attack} min={0} max={15}
            onChange={(v) => updatePSG({ attack: Math.round(v) })}
            size="sm" color="#34d399" formatValue={(v) => String(Math.round(v))} />
          <Knob label="DEC" value={psg.decay} min={0} max={15}
            onChange={(v) => updatePSG({ decay: Math.round(v) })}
            size="sm" color="#10b981" formatValue={(v) => String(Math.round(v))} />
          <Knob label="SUS" value={psg.sustain} min={0} max={15}
            onChange={(v) => updatePSG({ sustain: Math.round(v) })}
            size="sm" color="#059669" formatValue={(v) => String(Math.round(v))} />
          <Knob label="REL" value={psg.release} min={0} max={15}
            onChange={(v) => updatePSG({ release: Math.round(v) })}
            size="sm" color="#047857" formatValue={(v) => String(Math.round(v))} />
        </div>
      </div>
    </div>
  );
};

// PCM Panel - fixed to use actual config values
const PCM_DEFAULTS = { sampleRate: 44100, loopStart: 0, loopEnd: 65535, loopPoint: 0, bitDepth: 8, loopEnabled: false };

const PCMPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const pcm = useMemo(() => ({ ...PCM_DEFAULTS, ...config.pcm }), [config.pcm]);

  const updatePCM = useCallback((updates: Partial<typeof pcm>) => {
    onChange({ pcm: { ...config.pcm, ...PCM_DEFAULTS, ...updates } });
  }, [config.pcm, onChange]);

  const bitDepths = [8, 16];

  return (
    <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-2 mb-4">
        <Volume2 size={16} className="text-violet-400" />
        <h3 className="font-mono text-xs font-bold text-text-primary uppercase">PCM Sample Properties</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Knob label="RATE" value={pcm.sampleRate} min={4000} max={48000}
          onChange={(v) => updatePCM({ sampleRate: Math.round(v) })}
          size="sm" color="#a78bfa" formatValue={(v) => `${Math.round(v/1000)}k`} />
        <Knob label="START" value={pcm.loopStart} min={0} max={65535}
          onChange={(v) => updatePCM({ loopStart: Math.round(v) })}
          size="sm" color="#8b5cf6" formatValue={(v) => String(Math.round(v))} />
        <Knob label="END" value={pcm.loopEnd} min={0} max={65535}
          onChange={(v) => updatePCM({ loopEnd: Math.round(v) })}
          size="sm" color="#7c3aed" formatValue={(v) => String(Math.round(v))} />
        <Knob label="LOOP" value={pcm.loopPoint} min={0} max={65535}
          onChange={(v) => updatePCM({ loopPoint: Math.round(v) })}
          size="sm" color="#6d28d9" formatValue={(v) => String(Math.round(v))} />
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-[9px] font-bold text-text-muted uppercase">Bit Depth</span>
          <CustomSelect
            value={String(pcm.bitDepth)}
            onChange={(v) => updatePCM({ bitDepth: parseInt(v) })}
            className="bg-dark-bg px-2 py-1 rounded border border-dark-border text-xs font-mono text-violet-400"
            options={bitDepths.map((d) => ({ value: String(d), label: `${d}-BIT` }))}
          />
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-dark-border">
        <button
          onClick={() => updatePCM({ loopEnabled: !pcm.loopEnabled })}
          className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
            pcm.loopEnabled
              ? 'bg-violet-600/20 border-violet-500/50 text-violet-400'
              : 'bg-dark-bg border-dark-border text-text-muted'
          }`}
        >
          {pcm.loopEnabled ? '🔁 Loop Enabled' : 'Loop Disabled'}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// AMIGA PANEL
// ============================================================================

const AMIGA_DEFAULTS: FurnaceAmigaConfig = { initSample: -1, useNoteMap: false, useSample: true, useWave: false, waveLen: 32, noteMap: [] };

const AmigaPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const amiga = useMemo(() => ({ ...AMIGA_DEFAULTS, ...config.amiga }), [config.amiga]);

  const updateAmiga = useCallback((updates: Partial<FurnaceAmigaConfig>) => {
    onChange({ amiga: { ...config.amiga, ...AMIGA_DEFAULTS, ...updates } });
  }, [config.amiga, onChange]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-amber-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Music size={16} className="text-amber-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Amiga / Sample</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Knob label="SAMPLE" value={amiga.initSample} min={-1} max={255}
              onChange={(v) => updateAmiga({ initSample: Math.round(v) })}
              size="md" color="#f59e0b"
              formatValue={(v) => Math.round(v) === -1 ? 'OFF' : String(Math.round(v))} />
            <Knob label="WAVE LEN" value={amiga.waveLen} min={1} max={256}
              onChange={(v) => updateAmiga({ waveLen: Math.round(v) })}
              size="md" color="#fbbf24"
              formatValue={(v) => String(Math.round(v))} />
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-border">
            <button
              onClick={() => updateAmiga({ useSample: !amiga.useSample })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                amiga.useSample
                  ? 'bg-amber-600/20 border-amber-500/50 text-amber-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Use Sample
            </button>
            <button
              onClick={() => updateAmiga({ useWave: !amiga.useWave })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                amiga.useWave
                  ? 'bg-amber-600/20 border-amber-500/50 text-amber-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Use Wavetable
            </button>
            <button
              onClick={() => updateAmiga({ useNoteMap: !amiga.useNoteMap })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                amiga.useNoteMap
                  ? 'bg-amber-600/20 border-amber-500/50 text-amber-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Note Map
            </button>
          </div>

          {amiga.useNoteMap && amiga.noteMap.length > 0 && (
            <div className="pt-2 border-t border-dark-border">
              <span className="text-[9px] text-text-muted font-mono">
                {amiga.noteMap.length} note mapping(s) configured
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// N163 PANEL (Namco 163 Wavetable)
// ============================================================================

const N163_DEFAULTS: FurnaceN163Config = { wave: 0, wavePos: 0, waveLen: 32, waveMode: 0, perChPos: false };

const N163Panel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const n163 = useMemo(() => ({ ...N163_DEFAULTS, ...config.n163 }), [config.n163]);

  const updateN163 = useCallback((updates: Partial<FurnaceN163Config>) => {
    onChange({ n163: { ...config.n163, ...N163_DEFAULTS, ...updates } });
  }, [config.n163, onChange]);

  const waveModes = ['Load on playback', 'Load when changed', 'Load on note-on', 'Manual write'];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-teal-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Waves size={16} className="text-teal-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">N163 Wavetable</h3>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between gap-4">
            <Knob label="WAVE" value={n163.wave} min={0} max={255}
              onChange={(v) => updateN163({ wave: Math.round(v) })}
              size="md" color="#14b8a6"
              formatValue={(v) => String(Math.round(v))} />
            <Knob label="POS" value={n163.wavePos} min={0} max={255}
              onChange={(v) => updateN163({ wavePos: Math.round(v) })}
              size="md" color="#2dd4bf"
              formatValue={(v) => String(Math.round(v))} />
            <Knob label="LEN" value={n163.waveLen} min={0} max={252}
              onChange={(v) => updateN163({ waveLen: Math.round(v) & ~3 })}
              size="md" color="#5eead4"
              formatValue={(v) => String(Math.round(v) & ~3)} />
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-dark-border">
            <div>
              <label className="text-[10px] text-text-muted font-mono block mb-1">Wave Mode</label>
              <CustomSelect
                value={String(n163.waveMode)}
                onChange={(v) => updateN163({ waveMode: parseInt(v) })}
                className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
                options={waveModes.map((mode, i) => ({ value: String(i), label: mode }))}
              />
            </div>
            <button
              onClick={() => updateN163({ perChPos: !n163.perChPos })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                n163.perChPos
                  ? 'bg-teal-600/20 border-teal-500/50 text-teal-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Per-Channel Position
            </button>
          </div>

          {/* Per-Channel Position/Length Tables */}
          {n163.perChPos && (
            <div className="pt-2 border-t border-dark-border">
              <span className="text-[9px] text-text-muted font-mono block mb-2">Per-Channel Wave Position / Length</span>
              <div className="grid grid-cols-8 gap-1">
                {Array.from({ length: 8 }, (_, ch) => {
                  const pos = n163.chPos?.[ch] ?? 0;
                  const len = n163.chLen?.[ch] ?? 0;
                  return (
                    <div key={ch} className="flex flex-col items-center gap-1 p-1 rounded bg-dark-bg border border-dark-border">
                      <span className="text-[8px] text-teal-400 font-mono">CH{ch + 1}</span>
                      <input
                        type="number" value={pos} min={0} max={255}
                        onChange={(e) => {
                          const arr = [...(n163.chPos ?? [0,0,0,0,0,0,0,0])];
                          arr[ch] = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                          updateN163({ chPos: arr });
                        }}
                        className="w-full bg-dark-bgSecondary border border-dark-border text-[9px] text-text-primary rounded px-1 py-0.5 text-center"
                        title={`Position CH${ch + 1}`}
                      />
                      <input
                        type="number" value={len} min={0} max={252} step={4}
                        onChange={(e) => {
                          const arr = [...(n163.chLen ?? [0,0,0,0,0,0,0,0])];
                          arr[ch] = Math.max(0, Math.min(252, (parseInt(e.target.value) || 0) & ~3));
                          updateN163({ chLen: arr });
                        }}
                        className="w-full bg-dark-bgSecondary border border-dark-border text-[9px] text-text-primary rounded px-1 py-0.5 text-center"
                        title={`Length CH${ch + 1}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[8px] text-text-muted font-mono mt-1">
                <span>Position (0-255)</span>
                <span>Length (0-252, 4-aligned)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// FDS PANEL (Famicom Disk System Modulation)
// ============================================================================

const FDS_DEFAULTS: FurnaceFDSConfig = { modSpeed: 0, modDepth: 0, modTable: new Array(32).fill(0), initModTableWithFirstWave: false };

const FDSPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const fds = useMemo(() => ({ ...FDS_DEFAULTS, ...config.fds }), [config.fds]);

  const updateFDS = useCallback((updates: Partial<FurnaceFDSConfig>) => {
    onChange({ fds: { ...config.fds, ...FDS_DEFAULTS, ...updates } });
  }, [config.fds, onChange]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-red-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-red-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">FDS Modulation</h3>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between gap-4">
            <Knob label="SPEED" value={fds.modSpeed} min={0} max={4095}
              onChange={(v) => updateFDS({ modSpeed: Math.round(v) })}
              size="md" color="#ef4444"
              formatValue={(v) => String(Math.round(v))} />
            <Knob label="DEPTH" value={fds.modDepth} min={0} max={63}
              onChange={(v) => updateFDS({ modDepth: Math.round(v) })}
              size="md" color="#f87171"
              formatValue={(v) => String(Math.round(v))} />
          </div>

          <div className="pt-2 border-t border-dark-border">
            <div className="flex gap-2">
              <button
                onClick={() => updateFDS({ initModTableWithFirstWave: !fds.initModTableWithFirstWave })}
                className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                  fds.initModTableWithFirstWave
                    ? 'bg-red-600/20 border-red-500/50 text-red-400'
                    : 'bg-dark-bg border-dark-border text-text-muted'
                }`}
              >
                Init Mod Table from Wave
              </button>
              <button
                onClick={() => updateFDS({ compat: !fds.compat })}
                className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                  fds.compat
                    ? 'bg-red-600/20 border-red-500/50 text-red-400'
                    : 'bg-dark-bg border-dark-border text-text-muted'
                }`}
              >
                Compat Mode
              </button>
            </div>
          </div>

          {/* Mod Table Visualization */}
          <div className="pt-2 border-t border-dark-border">
            <span className="text-[9px] text-text-muted font-mono block mb-2">Modulation Table (32 steps, -4 to +3)</span>
            <div className="flex gap-px h-12 bg-dark-bg rounded border border-dark-border p-1">
              {(fds.modTable || []).slice(0, 32).map((val, i) => {
                const normalized = (val + 4) / 7;
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col-reverse"
                  >
                    <div
                      className="bg-red-500/60 rounded-sm"
                      style={{ height: `${normalized * 100}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ESFM PANEL (Enhanced FM)
// ============================================================================

const ESFM_OP_DEFAULTS = {
  delay: 0, outLvl: 0, modIn: 0, left: true, right: true, ct: 0, fixed: false, fixedFreq: 0,
};

const ESFMPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const esfm = useMemo(() => ({
    operators: config.esfm?.operators ?? [],
    noise: config.esfm?.noise ?? 0,
  }), [config.esfm]);

  const updateESFM = useCallback((updates: Partial<FurnaceESFMConfig>) => {
    onChange({ esfm: { ...config.esfm, operators: config.esfm?.operators ?? [], noise: config.esfm?.noise ?? 0, ...updates } });
  }, [config.esfm, onChange]);

  const updateESFMOp = useCallback((idx: number, updates: Partial<FurnaceESFMOperatorConfig>) => {
    const ops = [...(config.esfm?.operators ?? [])];
    ops[idx] = { ...ESFM_OP_DEFAULTS, ...ops[idx], ...updates } as FurnaceESFMOperatorConfig;
    updateESFM({ operators: ops });
  }, [config.esfm, updateESFM]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-orange-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-orange-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">ESFM Extensions</h3>
        </div>

        <div className="space-y-4">
          <Knob label="NOISE" value={esfm.noise} min={0} max={7}
            onChange={(v) => updateESFM({ noise: Math.round(v) })}
            size="sm" color="#f97316"
            formatValue={(v) => String(Math.round(v))} />

          {esfm.operators.map((op, idx) => {
            const opData = { ...ESFM_OP_DEFAULTS, ...op };
            return (
              <div key={idx} className="p-3 rounded border border-orange-500/20 bg-dark-bg/50">
                <div className="font-mono text-[10px] font-bold text-orange-400 mb-2">OP{idx + 1} ESFM</div>
                <div className="flex flex-wrap gap-3 mb-2">
                  <Knob label="DELAY" value={opData.delay} min={0} max={7}
                    onChange={(v) => updateESFMOp(idx, { delay: Math.round(v) })}
                    size="sm" color="#fb923c" formatValue={(v) => String(Math.round(v))} />
                  <Knob label="OUT" value={opData.outLvl} min={0} max={7}
                    onChange={(v) => updateESFMOp(idx, { outLvl: Math.round(v) })}
                    size="sm" color="#f97316" formatValue={(v) => String(Math.round(v))} />
                  <Knob label="MOD IN" value={opData.modIn} min={0} max={7}
                    onChange={(v) => updateESFMOp(idx, { modIn: Math.round(v) })}
                    size="sm" color="#ea580c" formatValue={(v) => String(Math.round(v))} />
                  <Knob label="CT" value={opData.ct} min={-128} max={127}
                    onChange={(v) => updateESFMOp(idx, { ct: Math.round(v) })}
                    size="sm" color="#c2410c" formatValue={(v) => String(Math.round(v))} />
                  <Knob label="DT" value={opData.dt} min={-128} max={127}
                    onChange={(v) => updateESFMOp(idx, { dt: Math.round(v) })}
                    size="sm" color="#9a3412" formatValue={(v) => String(Math.round(v))} />
                </div>
                {opData.fixed && (
                  <Knob label="FREQ" value={opData.fixedFreq} min={0} max={1023}
                    onChange={(v) => updateESFMOp(idx, { fixedFreq: Math.round(v) })}
                    size="sm" color="#fdba74" formatValue={(v) => String(Math.round(v))} />
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <ToggleButton label="LEFT" value={opData.left} onChange={(v) => updateESFMOp(idx, { left: v })} />
                  <ToggleButton label="RIGHT" value={opData.right} onChange={(v) => updateESFMOp(idx, { right: v })} />
                  <ToggleButton label="FIXED" value={opData.fixed} onChange={(v) => updateESFMOp(idx, { fixed: v })} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MULTIPCM PANEL
// ============================================================================

const MULTIPCM_DEFAULTS: FurnaceMultiPCMConfig = {
  ar: 15, d1r: 0, dl: 0, d2r: 0, rr: 15, rc: 0, lfo: 0, vib: 0, am: 0,
  damp: false, pseudoReverb: false, lfoReset: false, levelDirect: false,
};

const MultiPCMPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const mpcm = useMemo(() => ({ ...MULTIPCM_DEFAULTS, ...config.multipcm }), [config.multipcm]);

  const updateMultiPCM = useCallback((updates: Partial<FurnaceMultiPCMConfig>) => {
    onChange({ multipcm: { ...config.multipcm, ...MULTIPCM_DEFAULTS, ...updates } });
  }, [config.multipcm, onChange]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-pink-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-pink-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">MultiPCM Envelope</h3>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-3">
            <Knob label="AR" value={mpcm.ar} min={0} max={15}
              onChange={(v) => updateMultiPCM({ ar: Math.round(v) })}
              size="sm" color="#ec4899" formatValue={(v) => String(Math.round(v))} />
            <Knob label="D1R" value={mpcm.d1r} min={0} max={15}
              onChange={(v) => updateMultiPCM({ d1r: Math.round(v) })}
              size="sm" color="#f472b6" formatValue={(v) => String(Math.round(v))} />
            <Knob label="DL" value={mpcm.dl} min={0} max={15}
              onChange={(v) => updateMultiPCM({ dl: Math.round(v) })}
              size="sm" color="#f9a8d4" formatValue={(v) => String(Math.round(v))} />
            <Knob label="D2R" value={mpcm.d2r} min={0} max={15}
              onChange={(v) => updateMultiPCM({ d2r: Math.round(v) })}
              size="sm" color="#db2777" formatValue={(v) => String(Math.round(v))} />
            <Knob label="RR" value={mpcm.rr} min={0} max={15}
              onChange={(v) => updateMultiPCM({ rr: Math.round(v) })}
              size="sm" color="#be185d" formatValue={(v) => String(Math.round(v))} />
            <Knob label="RC" value={mpcm.rc} min={0} max={15}
              onChange={(v) => updateMultiPCM({ rc: Math.round(v) })}
              size="sm" color="#9d174d" formatValue={(v) => String(Math.round(v))} />
          </div>

          <div className="flex flex-wrap gap-3 pt-2 border-t border-dark-border">
            <Knob label="LFO" value={mpcm.lfo} min={0} max={7}
              onChange={(v) => updateMultiPCM({ lfo: Math.round(v) })}
              size="sm" color="#d946ef" formatValue={(v) => String(Math.round(v))} />
            <Knob label="VIB" value={mpcm.vib} min={0} max={7}
              onChange={(v) => updateMultiPCM({ vib: Math.round(v) })}
              size="sm" color="#c026d3" formatValue={(v) => String(Math.round(v))} />
            <Knob label="AM" value={mpcm.am} min={0} max={7}
              onChange={(v) => updateMultiPCM({ am: Math.round(v) })}
              size="sm" color="#a21caf" formatValue={(v) => String(Math.round(v))} />
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-border">
            <button
              onClick={() => updateMultiPCM({ damp: !mpcm.damp })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                mpcm.damp
                  ? 'bg-pink-600/20 border-pink-500/50 text-pink-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Damp
            </button>
            <button
              onClick={() => updateMultiPCM({ pseudoReverb: !mpcm.pseudoReverb })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                mpcm.pseudoReverb
                  ? 'bg-pink-600/20 border-pink-500/50 text-pink-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Pseudo Reverb
            </button>
            <button
              onClick={() => updateMultiPCM({ lfoReset: !mpcm.lfoReset })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                mpcm.lfoReset
                  ? 'bg-pink-600/20 border-pink-500/50 text-pink-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              LFO Reset
            </button>
            <button
              onClick={() => updateMultiPCM({ levelDirect: !mpcm.levelDirect })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                mpcm.levelDirect
                  ? 'bg-pink-600/20 border-pink-500/50 text-pink-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Level Direct
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SOUND UNIT PANEL
// ============================================================================

const SU_DEFAULTS: FurnaceSoundUnitConfig = { switchRoles: false, hwSeqLen: 0, hwSeq: [] };

const SoundUnitPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const su = useMemo(() => ({ ...SU_DEFAULTS, ...config.soundUnit }), [config.soundUnit]);

  const updateSU = useCallback((updates: Partial<FurnaceSoundUnitConfig>) => {
    onChange({ soundUnit: { ...config.soundUnit, ...SU_DEFAULTS, ...updates } });
  }, [config.soundUnit, onChange]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-lime-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Cpu size={16} className="text-lime-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Sound Unit</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Knob label="SEQ LEN" value={su.hwSeqLen} min={0} max={255}
              onChange={(v) => updateSU({ hwSeqLen: Math.round(v) })}
              size="md" color="#84cc16"
              formatValue={(v) => String(Math.round(v))} />
            <button
              onClick={() => updateSU({ switchRoles: !su.switchRoles })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                su.switchRoles
                  ? 'bg-lime-600/20 border-lime-500/50 text-lime-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Switch Roles
            </button>
          </div>

          {su.hwSeq.length > 0 && (
            <div className="pt-2 border-t border-dark-border">
              <span className="text-[9px] text-text-muted font-mono block mb-1">
                Hardware Sequence ({su.hwSeq.length} step{su.hwSeq.length !== 1 ? 's' : ''})
              </span>
              <div className="max-h-32 overflow-y-auto">
                {su.hwSeq.map((step, i) => (
                  <div key={i} className="flex gap-2 text-[9px] font-mono text-text-muted py-0.5">
                    <span className="text-lime-400 w-6">{i}</span>
                    <span>cmd={step.cmd}</span>
                    <span>val={step.val}</span>
                    <span>bound={step.bound}</span>
                    <span>spd={step.speed}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ES5506 PANEL (Ensoniq)
// ============================================================================

const ES5506_DEFAULTS: FurnaceES5506Config = {
  filter: { mode: 0, k1: 0xFFFF, k2: 0xFFFF },
  envelope: { ecount: 0, lVRamp: 0, rVRamp: 0, k1Ramp: 0, k2Ramp: 0, k1Slow: false, k2Slow: false },
};

const ES5506Panel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const es = useMemo(() => ({
    filter: { ...ES5506_DEFAULTS.filter, ...config.es5506?.filter },
    envelope: { ...ES5506_DEFAULTS.envelope, ...config.es5506?.envelope },
  }), [config.es5506]);

  const updateFilter = useCallback((updates: Partial<FurnaceES5506Config['filter']>) => {
    const cur = { ...ES5506_DEFAULTS.filter, ...config.es5506?.filter, ...updates };
    onChange({ es5506: { filter: cur, envelope: config.es5506?.envelope ?? ES5506_DEFAULTS.envelope } });
  }, [config.es5506, onChange]);

  const updateEnvelope = useCallback((updates: Partial<FurnaceES5506Config['envelope']>) => {
    const cur = { ...ES5506_DEFAULTS.envelope, ...config.es5506?.envelope, ...updates };
    onChange({ es5506: { filter: config.es5506?.filter ?? ES5506_DEFAULTS.filter, envelope: cur } });
  }, [config.es5506, onChange]);

  const filterModes = ['Off', 'LP', 'K2', 'HP', 'BP'];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      {/* Filter */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-indigo-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Volume2 size={16} className="text-indigo-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">ES5506 Filter</h3>
        </div>

        <div className="flex items-center gap-4">
          <div>
            <label className="text-[10px] text-text-muted font-mono block mb-1">Mode</label>
            <CustomSelect
              value={String(es.filter.mode)}
              onChange={(v) => updateFilter({ mode: parseInt(v) })}
              className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
              options={filterModes.map((mode, i) => ({ value: String(i), label: mode }))}
            />
          </div>
          <Knob label="K1" value={es.filter.k1} min={0} max={0xFFFF}
            onChange={(v) => updateFilter({ k1: Math.round(v) })}
            size="sm" color="#818cf8" formatValue={(v) => Math.round(v).toString(16).toUpperCase()} />
          <Knob label="K2" value={es.filter.k2} min={0} max={0xFFFF}
            onChange={(v) => updateFilter({ k2: Math.round(v) })}
            size="sm" color="#6366f1" formatValue={(v) => Math.round(v).toString(16).toUpperCase()} />
        </div>
      </div>

      {/* Envelope */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-indigo-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-indigo-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">ES5506 Envelope</h3>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Knob label="ECOUNT" value={es.envelope.ecount} min={0} max={511}
              onChange={(v) => updateEnvelope({ ecount: Math.round(v) })}
              size="sm" color="#a5b4fc" formatValue={(v) => String(Math.round(v))} />
            <Knob label="L RAMP" value={es.envelope.lVRamp} min={-128} max={127}
              onChange={(v) => updateEnvelope({ lVRamp: Math.round(v) })}
              size="sm" color="#818cf8" formatValue={(v) => String(Math.round(v))} />
            <Knob label="R RAMP" value={es.envelope.rVRamp} min={-128} max={127}
              onChange={(v) => updateEnvelope({ rVRamp: Math.round(v) })}
              size="sm" color="#6366f1" formatValue={(v) => String(Math.round(v))} />
            <Knob label="K1 RAMP" value={es.envelope.k1Ramp} min={-128} max={127}
              onChange={(v) => updateEnvelope({ k1Ramp: Math.round(v) })}
              size="sm" color="#4f46e5" formatValue={(v) => String(Math.round(v))} />
            <Knob label="K2 RAMP" value={es.envelope.k2Ramp} min={-128} max={127}
              onChange={(v) => updateEnvelope({ k2Ramp: Math.round(v) })}
              size="sm" color="#4338ca" formatValue={(v) => String(Math.round(v))} />
          </div>

          <div className="flex gap-2 pt-2 border-t border-dark-border">
            <button
              onClick={() => updateEnvelope({ k1Slow: !es.envelope.k1Slow })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                es.envelope.k1Slow
                  ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              K1 Slow
            </button>
            <button
              onClick={() => updateEnvelope({ k2Slow: !es.envelope.k2Slow })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                es.envelope.k2Slow
                  ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              K2 Slow
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SID2 PANEL
// ============================================================================

const SID2_DEFAULTS: FurnaceSID2Config = { volume: 15, mixMode: 0, noiseMode: 0 };

const SID2Panel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const sid2 = useMemo(() => ({ ...SID2_DEFAULTS, ...config.sid2 }), [config.sid2]);

  const updateSID2 = useCallback((updates: Partial<FurnaceSID2Config>) => {
    onChange({ sid2: { ...config.sid2, ...SID2_DEFAULTS, ...updates } });
  }, [config.sid2, onChange]);

  const mixModes = ['Normal', 'Mode 1', 'Mode 2', 'Mode 3'];
  const noiseModes = ['Normal', 'Mode 1', 'Mode 2', 'Mode 3'];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-fuchsia-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Music size={16} className="text-fuchsia-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">SID2</h3>
        </div>

        <div className="flex items-center gap-4">
          <Knob label="VOL" value={sid2.volume} min={0} max={15}
            onChange={(v) => updateSID2({ volume: Math.round(v) })}
            size="md" color="#d946ef"
            formatValue={(v) => String(Math.round(v))} />
          <div>
            <label className="text-[10px] text-text-muted font-mono block mb-1">Mix Mode</label>
            <CustomSelect
              value={String(sid2.mixMode)}
              onChange={(v) => updateSID2({ mixMode: parseInt(v) })}
              className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
              options={mixModes.map((mode, i) => ({ value: String(i), label: mode }))}
            />
          </div>
          <div>
            <label className="text-[10px] text-text-muted font-mono block mb-1">Noise Mode</label>
            <CustomSelect
              value={String(sid2.noiseMode)}
              onChange={(v) => updateSID2({ noiseMode: parseInt(v) })}
              className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
              options={noiseModes.map((mode, i) => ({ value: String(i), label: mode }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getChipCategory(id: number): "FM" | "PSG" | "Wavetable" | "PCM" | "Other" {
  if ([0, 1, 2, 11, 13, 14, 22, 23, 26, 47, 48].includes(id)) return "FM";
  if ([3, 4, 5, 12, 15, 16, 17, 18, 33, 34, 35, 43, 44].includes(id)) return "PSG";
  if ([6, 7, 8, 9, 19, 36, 37, 38].includes(id)) return "Wavetable";
  if ([10, 20, 21, 24, 25, 27, 28, 29, 30, 31, 32, 39, 40, 41, 42].includes(id)) return "PCM";
  return "Other";
}

function getChipName(id: number): string {
  // Descriptive names with console/platform info
  const names: Record<number, string> = {
    0: "Sega Genesis (YM2612)",
    1: "Arcade / X68000 (YM2151)",
    2: "AdLib / Sound Blaster (OPL3)",
    3: "Sega Master System (SN76489)",
    4: "Nintendo NES (2A03)",
    5: "Nintendo Game Boy (LR35902)",
    6: "PC Engine / TurboGrafx (HuC6280)",
    7: "Konami MSX (SCC)",
    8: "Namco Arcade (N163)",
    9: "Famicom (VRC6)",
    10: "Commodore 64 (SID)",
    11: "MSX / Sega (OPLL)",
    12: "ZX Spectrum / Amstrad (AY-3-8910)",
    13: "NEC PC-98 (OPNA)",
    14: "Neo Geo (OPNB)",
    15: "Atari 2600 (TIA)",
    16: "Famicom Disk System",
    17: "Famicom (MMC5)",
    18: "SAM Coupe (SAA1099)",
    19: "Bandai WonderSwan",
    20: "Arcade (OKI MSM6295)",
    21: "Ensoniq (ES5506)",
    22: "Yamaha TX81Z (OPZ)",
    23: "MSX-Audio (Y8950)",
    24: "Super Nintendo (SPC700)",
    25: "Atari Lynx",
    26: "Yamaha (OPL4)",
    27: "Sega Arcade (SegaPCM)",
    28: "Yamaha (YMZ280B)",
    29: "Sega CD (RF5C68)",
    30: "Irem Arcade (GA20)",
    31: "Namco Arcade (C140)",
    32: "Capcom Arcade (QSound)",
    33: "Commodore VIC-20",
    34: "Commodore Plus/4 (TED)",
    35: "Watara Supervision",
    36: "Commander X16 (VERA)",
    37: "Game Gear (SM8521)",
    38: "Konami Bubble System",
    39: "Konami Arcade (K007232)",
    40: "Konami Arcade (K053260)",
    41: "Seta Arcade (X1-010)",
    42: "NEC (μPD1771)",
    43: "Toshiba (T6W28)",
    44: "Nintendo Virtual Boy",
    47: "NEC PC-88 (YM2203)",
    48: "Neo Geo (YM2610B)",
  };
  return names[id] || `Unknown Chip (${id})`;
}

// OPLL hardware presets moved to factory presets (src/constants/furnacePresets.ts)
