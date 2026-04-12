/**
 * PreTrackerControls.tsx - PreTracker instrument/wave editor
 *
 * PreTracker by Pink/Abyss — 4-channel Amiga synth tracker with wavetable
 * oscillators, filters, ADSR envelopes, chord support, and instrument command
 * sequences. Architecturally similar to AHX/HivelyTracker.
 *
 * Tabs: Waves | Instruments | Info
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { PreTrackerConfig, PreTrackerWaveConfig, PreTrackerInstConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { EnvelopeVisualization, SectionLabel } from '@components/instruments/shared';
import { PreTrackerEngine } from '@/engine/pretracker/PreTrackerEngine';
import type { PreTrackerInstPattern } from '@/engine/pretracker/PreTrackerEngine';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import {
  PRETRACKER_INSTSEQ_COLUMNS,
  instPatternToFormatChannel,
  makeInstSeqCellChange,
} from '@/components/pretracker/pretrackerAdapter';

interface PreTrackerControlsProps {
  config: PreTrackerConfig;
  instrumentId: number;
  onChange: (updates: Partial<PreTrackerConfig>) => void;
}

type PrtTab = 'waves' | 'instruments' | 'instseq' | 'info';

const OSC_LABELS = ['Saw', 'Tri', 'Sqr', 'Noise'];
const FLT_LABELS = ['Off', 'LP', 'HP', 'BP', 'Notch'];

export const PreTrackerControls: React.FC<PreTrackerControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<PrtTab>('waves');
  const [selectedWave, setSelectedWave] = useState(0);
  const [selectedInst, setSelectedInst] = useState(0);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const [instPatterns, setInstPatterns] = useState<(PreTrackerInstPattern | null)[]>([]);

  // Auto-fetch wave/inst data from WASM engine if config is empty
  useEffect(() => {
    if (config.waves.length > 0) return;
    if (!PreTrackerEngine.hasInstance()) return;

    const engine = PreTrackerEngine.getInstance();
    let cancelled = false;

    (async () => {
      const [meta, waves, instruments, patterns] = await Promise.all([
        engine.requestMetadata(),
        engine.requestAllWaveInfo(),
        engine.requestAllInstInfo(),
        engine.requestAllInstPatterns(),
      ]);
      if (cancelled) return;

      setInstPatterns(patterns);
      onChange({
        title: meta.title,
        author: meta.author,
        numPositions: meta.numPositions,
        numSteps: meta.numSteps,
        subsongCount: meta.subsongCount,
        waveNames: meta.waveNames,
        instrumentNames: meta.instrumentNames,
        waves: waves.filter((w): w is NonNullable<typeof w> => w !== null),
        instruments: instruments.filter((i): i is NonNullable<typeof i> => i !== null),
      });
    })();

    return () => { cancelled = true; };
  }, [config.waves.length, onChange]);

  const { accent: accentColor, knob: knobColor, dim: dimColor, panelBg, panelStyle } =
    useInstrumentColors('#ff8844', { knob: '#ddaa66', dim: '#332811' });

  const wave: PreTrackerWaveConfig | undefined = config.waves[selectedWave];
  const inst: PreTrackerInstConfig | undefined = config.instruments[selectedInst];

  const updateWave = useCallback((key: keyof PreTrackerWaveConfig, value: number | boolean) => {
    const waves = [...configRef.current.waves];
    if (!waves[selectedWave]) return;
    const updated = { ...waves[selectedWave], [key]: value };
    waves[selectedWave] = updated;
    onChange({ waves });
    // Push to WASM for live sound update
    if (PreTrackerEngine.hasInstance()) {
      PreTrackerEngine.getInstance().setWaveInfo(selectedWave, updated);
    }
  }, [onChange, selectedWave]);

  const updateInst = useCallback((key: keyof PreTrackerInstConfig, value: number) => {
    const instruments = [...configRef.current.instruments];
    if (!instruments[selectedInst]) return;
    const updated = { ...instruments[selectedInst], [key]: value };
    instruments[selectedInst] = updated;
    onChange({ instruments });
    if (PreTrackerEngine.hasInstance()) {
      PreTrackerEngine.getInstance().setInstInfo(selectedInst, updated);
    }
  }, [onChange, selectedInst]);

  const NumberBox: React.FC<{
    label: string; value: number; min: number; max: number;
    onValueChange: (v: number) => void; width?: string;
  }> = ({ label, value, min, max, onValueChange, width = '48px' }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-secondary w-16 text-right whitespace-nowrap">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          if (!isNaN(v)) onValueChange(Math.max(min, Math.min(max, v)));
        }}
        className="text-xs font-mono text-center border rounded px-1 py-0.5"
        style={{
          width,
          background: '#0f0a05',
          borderColor: dimColor,
          color: accentColor,
        }}
      />
    </div>
  );

  // ── WAVES TAB ──
  const renderWavesTab = () => {
    if (!wave) {
      return (
        <div className="p-4 text-text-muted text-sm">
          No wave data loaded. Load a .prt file to see wave parameters.
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* Wave selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {config.waves.map((_, i) => (
            <button key={i}
              onClick={() => setSelectedWave(i)}
              className="px-2 py-1 text-xs font-mono rounded transition-colors"
              style={{
                background: selectedWave === i ? accentColor : '#111',
                color: selectedWave === i ? '#000' : '#666',
                border: `1px solid ${selectedWave === i ? accentColor : 'var(--color-border-light)'}`,
              }}>
              {config.waveNames[i] || `W${i}`}
            </button>
          ))}
        </div>

        {/* Oscillator */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="Oscillator" />
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1">
              {OSC_LABELS.map((label, i) => (
                <button key={i}
                  onClick={() => updateWave('oscType', i)}
                  className="px-2 py-1 text-xs font-mono rounded transition-colors"
                  style={{
                    background: wave.oscType === i ? accentColor : '#111',
                    color: wave.oscType === i ? '#000' : '#666',
                    border: `1px solid ${wave.oscType === i ? accentColor : 'var(--color-border-light)'}`,
                  }}>
                  {label}
                </button>
              ))}
            </div>
            <Knob value={wave.oscGain} min={0} max={255} step={1}
              onChange={(v) => updateWave('oscGain', Math.round(v))}
              label="Gain" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.oscBasenote} min={0} max={60} step={1}
              onChange={(v) => updateWave('oscBasenote', Math.round(v))}
              label="Base" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.oscPhaseSpd} min={0} max={255} step={1}
              onChange={(v) => updateWave('oscPhaseSpd', Math.round(v))}
              label="Ph.Spd" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.oscPhaseMin} min={0} max={255} step={1}
              onChange={(v) => updateWave('oscPhaseMin', Math.round(v))}
              label="Ph.Min" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.oscPhaseMax} min={0} max={255} step={1}
              onChange={(v) => updateWave('oscPhaseMax', Math.round(v))}
              label="Ph.Max" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => updateWave('boost', !wave.boost)}
              className="px-2 py-1 text-xs font-mono rounded transition-colors"
              style={{
                background: wave.boost ? accentColor : '#111',
                color: wave.boost ? '#000' : '#666',
                border: `1px solid ${wave.boost ? accentColor : 'var(--color-border-light)'}`,
              }}>
              Boost
            </button>
            <button
              onClick={() => updateWave('pitchLinear', !wave.pitchLinear)}
              className="px-2 py-1 text-xs font-mono rounded transition-colors"
              style={{
                background: wave.pitchLinear ? accentColor : '#111',
                color: wave.pitchLinear ? '#000' : '#666',
                border: `1px solid ${wave.pitchLinear ? accentColor : 'var(--color-border-light)'}`,
              }}>
              Lin.Pitch
            </button>
            <button
              onClick={() => updateWave('volFast', !wave.volFast)}
              className="px-2 py-1 text-xs font-mono rounded transition-colors"
              style={{
                background: wave.volFast ? accentColor : '#111',
                color: wave.volFast ? '#000' : '#666',
                border: `1px solid ${wave.volFast ? accentColor : 'var(--color-border-light)'}`,
              }}>
              Fast Vol
            </button>
            <button
              onClick={() => updateWave('extraOctaves', !wave.extraOctaves)}
              className="px-2 py-1 text-xs font-mono rounded transition-colors"
              style={{
                background: wave.extraOctaves ? accentColor : '#111',
                color: wave.extraOctaves ? '#000' : '#666',
                border: `1px solid ${wave.extraOctaves ? accentColor : 'var(--color-border-light)'}`,
              }}>
              +Oct
            </button>
          </div>
        </div>

        {/* Volume Envelope */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="Volume Envelope" />
          <div className="flex items-center gap-3">
            <Knob value={wave.volAttack} min={0} max={255} step={1}
              onChange={(v) => updateWave('volAttack', Math.round(v))}
              label="Attack" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.volDelay} min={0} max={255} step={1}
              onChange={(v) => updateWave('volDelay', Math.round(v))}
              label="Delay" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.volDecay} min={0} max={255} step={1}
              onChange={(v) => updateWave('volDecay', Math.round(v))}
              label="Decay" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.volSustain} min={0} max={255} step={1}
              onChange={(v) => updateWave('volSustain', Math.round(v))}
              label="Sustain" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="mt-2">
            <EnvelopeVisualization
              mode="steps"
              attackVol={64}
              attackSpeed={wave.volAttack || 1}
              decayVol={wave.volSustain}
              decaySpeed={wave.volDecay || 1}
              sustainVol={wave.volSustain}
              sustainLen={32}
              releaseVol={0}
              releaseSpeed={16}
              maxVol={255}
              color={knobColor}
              width={320}
              height={56}
            />
          </div>
        </div>

        {/* Filter */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="Filter" />
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1">
              {FLT_LABELS.map((label, i) => (
                <button key={i}
                  onClick={() => updateWave('fltType', i)}
                  className="px-2 py-1 text-xs font-mono rounded transition-colors"
                  style={{
                    background: wave.fltType === i ? accentColor : '#111',
                    color: wave.fltType === i ? '#000' : '#666',
                    border: `1px solid ${wave.fltType === i ? accentColor : 'var(--color-border-light)'}`,
                  }}>
                  {label}
                </button>
              ))}
            </div>
            <Knob value={wave.fltResonance} min={0} max={255} step={1}
              onChange={(v) => updateWave('fltResonance', Math.round(v))}
              label="Reso" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.fltStart} min={0} max={255} step={1}
              onChange={(v) => updateWave('fltStart', Math.round(v))}
              label="Start" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.fltMin} min={0} max={255} step={1}
              onChange={(v) => updateWave('fltMin', Math.round(v))}
              label="Min" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.fltMax} min={0} max={255} step={1}
              onChange={(v) => updateWave('fltMax', Math.round(v))}
              label="Max" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.fltSpeed} min={0} max={255} step={1}
              onChange={(v) => updateWave('fltSpeed', Math.round(v))}
              label="Speed" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>

        {/* Pitch */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="Pitch" />
          <div className="flex items-center gap-3">
            <Knob value={wave.pitchRamp} min={0} max={255} step={1}
              onChange={(v) => updateWave('pitchRamp', Math.round(v))}
              label="Ramp" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>

        {/* Chords */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="Chords" />
          <div className="flex items-center gap-3">
            <Knob value={wave.chordNote1} min={0} max={60} step={1}
              onChange={(v) => updateWave('chordNote1', Math.round(v))}
              label="Note 1" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.chordNote2} min={0} max={60} step={1}
              onChange={(v) => updateWave('chordNote2', Math.round(v))}
              label="Note 2" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.chordNote3} min={0} max={60} step={1}
              onChange={(v) => updateWave('chordNote3', Math.round(v))}
              label="Note 3" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.chordShift} min={0} max={255} step={1}
              onChange={(v) => updateWave('chordShift', Math.round(v))}
              label="Shift" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>

        {/* Loop & Sample */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="Loop & Sample" />
          <div className="grid grid-cols-3 gap-2">
            <NumberBox label="Loop Start" value={wave.loopStart} min={0} max={65535} onValueChange={(v) => updateWave('loopStart', v)} width="56px" />
            <NumberBox label="Loop End" value={wave.loopEnd} min={0} max={65535} onValueChange={(v) => updateWave('loopEnd', v)} width="56px" />
            <NumberBox label="Loop Offs" value={wave.loopOffset} min={0} max={65535} onValueChange={(v) => updateWave('loopOffset', v)} width="56px" />
            <NumberBox label="Sub Len" value={wave.subloopLen} min={0} max={65535} onValueChange={(v) => updateWave('subloopLen', v)} width="56px" />
            <NumberBox label="Sub Wait" value={wave.subloopWait} min={0} max={255} onValueChange={(v) => updateWave('subloopWait', v)} width="56px" />
            <NumberBox label="Sub Step" value={wave.subloopStep} min={0} max={65535} onValueChange={(v) => updateWave('subloopStep', v)} width="56px" />
            <NumberBox label="Sam Len" value={wave.samLen} min={0} max={255} onValueChange={(v) => updateWave('samLen', v)} width="56px" />
            <NumberBox label="Mix Wave" value={wave.mixWave} min={0} max={23} onValueChange={(v) => updateWave('mixWave', v)} width="56px" />
            <NumberBox label="Chip RAM" value={wave.chipram} min={0} max={65535} onValueChange={(v) => updateWave('chipram', v)} width="56px" />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => updateWave('allow9xx', wave.allow9xx ? 0 : 1)}
              className="px-2 py-1 text-xs font-mono rounded transition-colors"
              style={{
                background: wave.allow9xx ? accentColor : '#111',
                color: wave.allow9xx ? '#000' : '#666',
                border: `1px solid ${wave.allow9xx ? accentColor : 'var(--color-border-light)'}`,
              }}>
              9xx Offset
            </button>
          </div>
        </div>

        {/* Modulation */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="Modulation" />
          <div className="flex items-center gap-3">
            <Knob value={wave.modWetness} min={0} max={255} step={1}
              onChange={(v) => updateWave('modWetness', Math.round(v))}
              label="Wet" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.modLength} min={0} max={255} step={1}
              onChange={(v) => updateWave('modLength', Math.round(v))}
              label="Length" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.modPredelay} min={0} max={255} step={1}
              onChange={(v) => updateWave('modPredelay', Math.round(v))}
              label="Pre-Dly" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={wave.modDensity} min={0} max={255} step={1}
              onChange={(v) => updateWave('modDensity', Math.round(v))}
              label="Density" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>
      </div>
    );
  };

  // ── INSTRUMENTS TAB ──
  const renderInstrumentsTab = () => {
    if (!inst) {
      return (
        <div className="p-4 text-text-muted text-sm">
          No instrument data loaded. Load a .prt file to see instrument parameters.
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* Instrument selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {config.instruments.map((_, i) => (
            <button key={i}
              onClick={() => setSelectedInst(i)}
              className="px-2 py-1 text-xs font-mono rounded transition-colors"
              style={{
                background: selectedInst === i ? accentColor : '#111',
                color: selectedInst === i ? '#000' : '#666',
                border: `1px solid ${selectedInst === i ? accentColor : 'var(--color-border-light)'}`,
              }}>
              {config.instrumentNames[i] || `I${i + 1}`}
            </button>
          ))}
        </div>

        {/* ADSR Envelope */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="ADSR Envelope" />
          <div className="flex items-center gap-3">
            <Knob value={inst.adsrAttack} min={0} max={255} step={1}
              onChange={(v) => updateInst('adsrAttack', Math.round(v))}
              label="Attack" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={inst.adsrDecay} min={0} max={255} step={1}
              onChange={(v) => updateInst('adsrDecay', Math.round(v))}
              label="Decay" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={inst.adsrSustain} min={0} max={255} step={1}
              onChange={(v) => updateInst('adsrSustain', Math.round(v))}
              label="Sustain" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={inst.adsrRelease} min={0} max={255} step={1}
              onChange={(v) => updateInst('adsrRelease', Math.round(v))}
              label="Release" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="mt-2">
            <EnvelopeVisualization
              mode="steps"
              attackVol={255}
              attackSpeed={inst.adsrAttack || 1}
              decayVol={inst.adsrSustain}
              decaySpeed={inst.adsrDecay || 1}
              sustainVol={inst.adsrSustain}
              sustainLen={32}
              releaseVol={0}
              releaseSpeed={inst.adsrRelease || 1}
              maxVol={255}
              color={knobColor}
              width={320}
              height={56}
            />
          </div>
        </div>

        {/* Vibrato */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="Vibrato" />
          <div className="flex items-center gap-3">
            <Knob value={inst.vibratoDelay} min={0} max={255} step={1}
              onChange={(v) => updateInst('vibratoDelay', Math.round(v))}
              label="Delay" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={inst.vibratoDepth} min={0} max={255} step={1}
              onChange={(v) => updateInst('vibratoDepth', Math.round(v))}
              label="Depth" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={inst.vibratoSpeed} min={0} max={255} step={1}
              onChange={(v) => updateInst('vibratoSpeed', Math.round(v))}
              label="Speed" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>

        {/* Pattern Steps */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="Instrument Sequence" />
          <NumberBox label="Steps" value={inst.patternSteps} min={0} max={255} onValueChange={(v) => updateInst('patternSteps', v)} />
        </div>
      </div>
    );
  };

  // ── INST COMMAND SEQUENCE TAB (editable via PatternEditorCanvas) ──
  const INST_CMD_NAMES: Record<number, string> = {
    0x0: 'Sel Wave', 0x1: 'Slide Up', 0x2: 'Slide Dn', 0x3: 'ADSR',
    0x4: 'Sel W.NS', 0xA: 'Vol Slide', 0xB: 'Jump', 0xC: 'Set Vol',
    0xE: 'Pat Arp', 0xF: 'Speed',
  };

  const handleInstPatternUpdate = useCallback((updated: PreTrackerInstPattern) => {
    const newPatterns = [...instPatterns];
    newPatterns[selectedInst] = updated;
    setInstPatterns(newPatterns);
  }, [instPatterns, selectedInst]);

  const instSeqChannels = useMemo(() => {
    const pat = instPatterns[selectedInst] ?? null;
    const name = config.instrumentNames[selectedInst] || `Inst ${selectedInst + 1}`;
    return instPatternToFormatChannel(pat, name);
  }, [instPatterns, selectedInst, config.instrumentNames]);

  const instSeqCellChange = useMemo(() => {
    const pat = instPatterns[selectedInst] ?? null;
    return makeInstSeqCellChange(selectedInst, pat, handleInstPatternUpdate);
  }, [instPatterns, selectedInst, handleInstPatternUpdate]);

  const renderInstSeqTab = () => {
    const pat = instPatterns[selectedInst];

    return (
      <div className="flex flex-col gap-2 p-3" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* Instrument selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {config.instruments.map((_, i) => (
            <button key={i}
              onClick={() => setSelectedInst(i)}
              className="px-2 py-1 text-xs font-mono rounded transition-colors"
              style={{
                background: selectedInst === i ? accentColor : '#111',
                color: selectedInst === i ? '#000' : '#666',
                border: `1px solid ${selectedInst === i ? accentColor : 'var(--color-border-light)'}`,
              }}>
              {config.instrumentNames[i] || `I${i + 1}`}
            </button>
          ))}
        </div>

        {!pat ? (
          <div className="p-4 text-text-muted text-sm">
            {instPatterns.length === 0
              ? 'Loading instrument patterns...'
              : 'No command sequence for this instrument.'}
          </div>
        ) : (
          <>
            <div className="text-xs text-text-secondary mb-1">
              {pat.steps} steps — click cells to edit
            </div>

            <div style={{ flex: 1, minHeight: 300 }}>
              <PatternEditorCanvas
                formatColumns={PRETRACKER_INSTSEQ_COLUMNS}
                formatChannels={instSeqChannels}
                formatCurrentRow={0}
                formatIsPlaying={false}
                onFormatCellChange={instSeqCellChange}
                hideVUMeters={true}
              />
            </div>

            {/* Command reference */}
            <div className="mt-2 p-2 rounded border text-[10px] font-mono grid grid-cols-3 gap-x-3 gap-y-0.5"
              style={{ borderColor: dimColor, color: 'var(--color-text-muted)' }}>
              {Object.entries(INST_CMD_NAMES).map(([code, name]) => (
                <span key={code}>
                  <span style={{ color: '#8cf' }}>{parseInt(code).toString(16).toUpperCase()}</span>
                  ={name}
                </span>
              ))}
              <span><span style={{ color: '#ff8' }}>S</span>=Stitch (chain)</span>
              <span><span style={{ color: '#f88' }}>P</span>=Pin pitch</span>
            </div>
          </>
        )}
      </div>
    );
  };

  // ── INFO TAB ──
  const renderInfoTab = () => (
    <div className="flex flex-col gap-3 p-3">
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accentColor} label="Song Info" />
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <span className="text-text-secondary">Title:</span>
          <span style={{ color: accentColor }}>{config.title || '(untitled)'}</span>
          <span className="text-text-secondary">Author:</span>
          <span style={{ color: accentColor }}>{config.author || '(unknown)'}</span>
          <span className="text-text-secondary">Waves:</span>
          <span style={{ color: accentColor }}>{config.waves.length}</span>
          <span className="text-text-secondary">Instruments:</span>
          <span style={{ color: accentColor }}>{config.instruments.length}</span>
          <span className="text-text-secondary">Positions:</span>
          <span style={{ color: accentColor }}>{config.numPositions}</span>
          <span className="text-text-secondary">Steps/Track:</span>
          <span style={{ color: accentColor }}>{config.numSteps}</span>
          <span className="text-text-secondary">Subsongs:</span>
          <span style={{ color: accentColor }}>{config.subsongCount}</span>
        </div>
      </div>

      {/* Subsong selector (v1.5 files with multiple subsongs) */}
      {config.subsongCount > 1 && (
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accentColor} label="Subsong" />
          <div className="flex items-center gap-2 flex-wrap">
            {Array.from({ length: config.subsongCount }, (_, i) => (
              <button key={i}
                onClick={() => {
                  if (PreTrackerEngine.hasInstance()) {
                    PreTrackerEngine.getInstance().setSubsong(i);
                  }
                }}
                className="px-3 py-1.5 text-xs font-mono rounded transition-colors"
                style={{
                  background: '#111',
                  color: accentColor,
                  border: `1px solid ${accentColor}44`,
                }}>
                Subsong {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Effect reference */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accentColor} label="Pattern Effects" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {[
            ['0xx', '2nd Inst'], ['1xx', 'Slide Up'], ['2xx', 'Slide Down'], ['3xx', 'Porta'],
            ['4xx', 'Vibrato'], ['5xy', 'Track Dly'], ['9xx', 'Wave Ofs'], ['Axy', 'Vol Ramp'],
            ['Bxx', 'Pos Jump'], ['Cxx', 'Set Vol'], ['Dxx', 'Break'], ['E1x', 'Fine Up'],
            ['E2x', 'Fine Down'], ['EAx', 'NoteOff Dly'], ['EDx', 'Note Dly'], ['Fxx', 'Speed'],
          ].map(([code, name]) => (
            <span key={code}>
              <span style={{ color: accentColor }}>{code}</span> {name}
            </span>
          ))}
        </div>
      </div>

      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accentColor} label="Inst. Commands" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {[
            ['0xx', 'Sel Wave'], ['1xx', 'Slide Up'], ['2xx', 'Slide Down'], ['301', 'Release'],
            ['302', 'Restart'], ['4xx', 'Sel Wave NS'], ['Axy', 'Vol Slide'], ['Bxx', 'Jump Step'],
            ['Cxx', 'Set Vol'], ['E0x', 'Pat Arp'], ['Fxx', 'Speed'],
          ].map(([code, name]) => (
            <span key={code}>
              <span style={{ color: accentColor }}>{code}</span> {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: dimColor }}>
        {([['waves', 'Waves'], ['instruments', 'Instruments'], ['instseq', 'Cmd Seq'], ['info', 'Info']] as const).map(([id, label]) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accentColor : '#666',
              borderBottom: activeTab === id ? `2px solid ${accentColor}` : '2px solid transparent',
              background: activeTab === id ? '#1a0f05' : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'waves' && renderWavesTab()}
      {activeTab === 'instruments' && renderInstrumentsTab()}
      {activeTab === 'instseq' && renderInstSeqTab()}
      {activeTab === 'info' && renderInfoTab()}
    </div>
  );
};
