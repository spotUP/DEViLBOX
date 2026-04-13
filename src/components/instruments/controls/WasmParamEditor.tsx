/**
 * WasmParamEditor.tsx — Generic interactive editor for WASM replayer formats
 *
 * All Phase 2 WASM replayer formats (FutureComposer, ActivisionPro, Actionamics,
 * SoundControl, FaceTheMusic, QuadraComposer, etc.) share the same string-based
 * instrument parameter API: _xxx_get_instrument_param(handle, inst, "paramName")
 *
 * This component takes a list of parameter descriptors and renders knobs/selectors
 * for each, pushing changes to the WASM engine in real-time.
 */

import React, { useState, useEffect } from 'react';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared';

// ── Param descriptor types ──────────────────────────────────────────────

export interface WasmParamDescriptor {
  /** WASM param name string (e.g. "volume", "vibSpeed") */
  key: string;
  /** Display label */
  label: string;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Step increment (default 1) */
  step?: number;
  /** Display type: 'knob' (default) or 'select' with options */
  type?: 'knob' | 'select' | 'checkbox';
  /** Options for 'select' type */
  options?: { value: number; label: string }[];
  /** Section header to show before this param */
  section?: string;
}

export interface WasmFormatDescriptor {
  /** Format display name */
  name: string;
  /** Brand color for the editor */
  brandColor: string;
  /** Parameter descriptors */
  params: WasmParamDescriptor[];
  /** Number of instruments (if known statically) */
  numInstruments?: number;
}

// ── Engine interface for string-param formats ───────────────────────────

export interface WasmParamEngine {
  /** Send a param request to the worklet */
  requestParam(inst: number, param: string): void;
  /** Set a param value */
  setParam(inst: number, param: string, value: number): void;
  /** Subscribe to param value responses */
  onParamValue(callback: (inst: number, param: string, value: number) => void): () => void;
}

// ── Component ───────────────────────────────────────────────────────────

interface WasmParamEditorProps {
  descriptor: WasmFormatDescriptor;
  /** Number of instruments in the loaded module */
  instrumentCount: number;
  /** Get a param value (cached) */
  getParam: (inst: number, param: string) => number | undefined;
  /** Set a param value (pushes to WASM) */
  setParam: (inst: number, param: string, value: number) => void;
  /** Request all params for an instrument from WASM */
  requestAllParams: (inst: number) => void;
  /** Instrument names (optional) */
  instrumentNames?: string[];
}

export const WasmParamEditor: React.FC<WasmParamEditorProps> = ({
  descriptor,
  instrumentCount,
  getParam,
  setParam,
  requestAllParams,
  instrumentNames,
}) => {
  const [selectedInst, setSelectedInst] = useState(0);
  const { accent, knob, panelStyle } = useInstrumentColors(descriptor.brandColor);

  // Request params when instrument changes
  useEffect(() => {
    if (instrumentCount > 0) {
      requestAllParams(selectedInst);
    }
  }, [selectedInst, instrumentCount, requestAllParams]);

  if (instrumentCount === 0) {
    return (
      <div className="p-4 text-text-muted text-sm" style={panelStyle}>
        No instrument data. Load a {descriptor.name} file first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 text-xs" style={panelStyle}>
      {/* Instrument selector */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-text-muted">Inst:</span>
        <select
          className="bg-surface-secondary text-text-primary border border-border-primary rounded px-2 py-0.5 text-xs"
          value={selectedInst}
          onChange={(e) => setSelectedInst(Number(e.target.value))}
        >
          {Array.from({ length: instrumentCount }, (_, i) => (
            <option key={i} value={i}>
              {instrumentNames?.[i] || `Instrument ${i}`}
            </option>
          ))}
        </select>
      </div>

      {/* Parameters */}
      <div className="flex flex-col gap-2">
        {descriptor.params.map((p, idx) => (
          <React.Fragment key={p.key}>
            {p.section && <SectionLabel label={p.section} color={accent} />}
            <ParamControl
              descriptor={p}
              value={getParam(selectedInst, p.key)}
              onChange={(v) => setParam(selectedInst, p.key, v)}
              knobColor={knob}
              idx={idx}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ── Individual param control ────────────────────────────────────────────

interface ParamControlProps {
  descriptor: WasmParamDescriptor;
  value: number | undefined;
  onChange: (value: number) => void;
  knobColor: string;
  idx: number;
}

const ParamControl: React.FC<ParamControlProps> = ({ descriptor, value, onChange, knobColor }) => {
  const val = value ?? descriptor.min;

  if (descriptor.type === 'select' && descriptor.options) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-text-muted text-[10px] w-24">{descriptor.label}</span>
        <select
          className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 py-0.5 text-xs"
          value={val}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {descriptor.options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (descriptor.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-[10px] text-text-muted">
        <input
          type="checkbox"
          checked={val !== 0}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          className="accent-accent-primary"
        />
        {descriptor.label}
      </label>
    );
  }

  // Default: knob
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <Knob
        value={val}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step ?? 1}
        size="sm"
        color={knobColor}
        onChange={(v) => onChange(Math.round(v))}
      />
      <span className="text-text-muted text-[10px]">{descriptor.label}</span>
    </div>
  );
};

// ── Format descriptors ──────────────────────────────────────────────────

export const WASM_FORMAT_DESCRIPTORS: Record<string, WasmFormatDescriptor> = {
  ActivisionProWasmSynth: {
    name: 'Activision Pro',
    brandColor: '#ff4466',
    params: [
      { key: 'volume', label: 'Volume', min: 0, max: 64, section: 'Sample' },
      { key: 'sampleNumber', label: 'Sample #', min: 0, max: 255 },
      { key: 'sampleNumber2', label: 'Sample #2', min: 0, max: 255 },
      { key: 'sampleStartOffset', label: 'Start Ofs', min: 0, max: 65535 },
      { key: 'fineTune', label: 'Fine Tune', min: -128, max: 127 },
      { key: 'envelopeNumber', label: 'Envelope', min: 0, max: 255, section: 'Envelope' },
      { key: 'portamentoAdd', label: 'Portamento', min: 0, max: 255, section: 'Effects' },
      { key: 'enabledEffectFlags', label: 'FX Flags', min: 0, max: 255 },
      { key: 'stopResetEffectDelay', label: 'FX Delay', min: 0, max: 255 },
      { key: 'arpeggioTable0', label: 'Arp 0', min: -128, max: 127, section: 'Arpeggio' },
      { key: 'arpeggioTable1', label: 'Arp 1', min: -128, max: 127 },
      { key: 'arpeggioTable2', label: 'Arp 2', min: -128, max: 127 },
      { key: 'arpeggioTable3', label: 'Arp 3', min: -128, max: 127 },
      { key: 'fixedOrTransposedNote', label: 'Fixed Note', min: 0, max: 255, section: 'Pitch' },
      { key: 'transpose', label: 'Transpose', min: -128, max: 127 },
      { key: 'vibratoNumber', label: 'Vibrato #', min: 0, max: 255, section: 'Vibrato' },
      { key: 'vibratoDelay', label: 'Vib Delay', min: 0, max: 255 },
    ],
  },

  FutureComposerWasmSynth: {
    name: 'Future Composer',
    brandColor: '#44aaff',
    params: [
      { key: 'speed', label: 'Speed', min: 0, max: 255, section: 'Voice' },
      { key: 'frqNumber', label: 'Frq Table', min: 0, max: 255 },
      { key: 'vibSpeed', label: 'Vib Speed', min: -128, max: 127, section: 'Vibrato' },
      { key: 'vibDepth', label: 'Vib Depth', min: -128, max: 127 },
      { key: 'vibDelay', label: 'Vib Delay', min: 0, max: 255 },
    ],
  },

  ActionamicsWasmSynth: {
    name: 'Actionamics',
    brandColor: '#ff8844',
    params: [
      { key: 'noteTranspose', label: 'Transpose', min: -128, max: 127, section: 'Pitch' },
      { key: 'portamentoIncrement', label: 'Porta Inc', min: 0, max: 255 },
      { key: 'portamentoDelay', label: 'Porta Delay', min: 0, max: 255 },
      { key: 'attackEndVolume', label: 'Atk Vol', min: 0, max: 255, section: 'ADSR' },
      { key: 'attackSpeed', label: 'Atk Speed', min: 0, max: 255 },
      { key: 'decayEndVolume', label: 'Dec Vol', min: 0, max: 255 },
      { key: 'decaySpeed', label: 'Dec Speed', min: 0, max: 255 },
      { key: 'sustainDelay', label: 'Sus Delay', min: 0, max: 255 },
      { key: 'releaseEndVolume', label: 'Rel Vol', min: 0, max: 255 },
      { key: 'releaseSpeed', label: 'Rel Speed', min: 0, max: 255 },
      { key: 'sampleNumberListNumber', label: 'Samp List', min: 0, max: 255, section: 'Lists' },
      { key: 'arpeggioListNumber', label: 'Arp List', min: 0, max: 255 },
      { key: 'frequencyListNumber', label: 'Freq List', min: 0, max: 255 },
    ],
  },

  SoundControlWasmSynth: {
    name: 'Sound Control',
    brandColor: '#66cc44',
    params: [
      { key: 'attackSpeed', label: 'Atk Speed', min: 0, max: 255, section: 'Envelope' },
      { key: 'attackIncrement', label: 'Atk Inc', min: 0, max: 255 },
      { key: 'decaySpeed', label: 'Dec Speed', min: 0, max: 255 },
      { key: 'decayDecrement', label: 'Dec Dec', min: 0, max: 255 },
      { key: 'decayValue', label: 'Dec Value', min: 0, max: 65535 },
      { key: 'releaseSpeed', label: 'Rel Speed', min: 0, max: 255 },
      { key: 'releaseDecrement', label: 'Rel Dec', min: 0, max: 255 },
      { key: 'sampleCommandCount', label: 'Cmd Count', min: 0, max: 255, section: 'Script' },
    ],
  },

  FaceTheMusicWasmSynth: {
    name: 'Face The Music',
    brandColor: '#cc44ff',
    params: [
      { key: 'oneshotLength', label: 'Oneshot Len', min: 0, max: 65535, section: 'Sample' },
      { key: 'loopStart', label: 'Loop Start', min: 0, max: 65535 },
      { key: 'loopLength', label: 'Loop Len', min: 0, max: 65535 },
      { key: 'totalLength', label: 'Total Len', min: 0, max: 65535 },
    ],
  },

  QuadraComposerWasmSynth: {
    name: 'QuadraComposer',
    brandColor: '#44ffaa',
    params: [
      { key: 'volume', label: 'Volume', min: 0, max: 64, section: 'Sample' },
      { key: 'length', label: 'Length', min: 0, max: 131072 },
      { key: 'loopStart', label: 'Loop Start', min: 0, max: 131072 },
      { key: 'loopLength', label: 'Loop Len', min: 0, max: 131072 },
      { key: 'fineTune', label: 'Fine Tune', min: 0, max: 15 },
      { key: 'controlByte', label: 'Control', min: 0, max: 255 },
    ],
  },

  // ArtOfNoise, MusicAssembler, BenDaglish don't have string-param API
  // They'll get minimal editors showing what's available

  MusicAssemblerSynth: {
    name: 'Music-Assembler',
    brandColor: '#aaaa44',
    params: [
      { key: 'sampleNumber', label: 'Sample #', min: 0, max: 255, section: 'Sample' },
      { key: 'attack', label: 'Attack', min: 0, max: 255, section: 'ADSR' },
      { key: 'decaySustain', label: 'Decay/Sus', min: 0, max: 255 },
      { key: 'release', label: 'Release', min: 0, max: 255 },
      { key: 'hold', label: 'Hold', min: 0, max: 255 },
      { key: 'vibratoDelay', label: 'Vib Delay', min: 0, max: 255, section: 'Vibrato' },
      { key: 'vibratoSpeed', label: 'Vib Speed', min: 0, max: 255 },
      { key: 'vibratoLevel', label: 'Vib Level', min: 0, max: 255 },
      { key: 'arpeggio', label: 'Arpeggio', min: 0, max: 255, section: 'Effects' },
      { key: 'fxArpSpdlp', label: 'FX/Arp Spd', min: 0, max: 255 },
      { key: 'keyWaveRate', label: 'Key/Wave', min: 0, max: 255 },
      { key: 'waveLevelSpeed', label: 'Wave Lvl/Spd', min: 0, max: 255 },
    ],
  },

  BenDaglishSynth: {
    name: 'Ben Daglish',
    brandColor: '#44aaaa',
    params: [
      { key: 'sampleNumber', label: 'Sample #', min: -32768, max: 32767, section: 'Sample' },
      { key: 'length', label: 'Length', min: 0, max: 65535 },
      { key: 'loopOffset', label: 'Loop Ofs', min: 0, max: 131072 },
      { key: 'loopLength', label: 'Loop Len', min: 0, max: 65535 },
      { key: 'volume', label: 'Volume', min: 0, max: 64 },
      { key: 'volumeFadeSpeed', label: 'Vol Fade', min: -32768, max: 32767, section: 'Volume' },
      { key: 'portamentoDuration', label: 'Porta Dur', min: -32768, max: 32767, section: 'Portamento' },
      { key: 'portamentoAddValue', label: 'Porta Add', min: -32768, max: 32767 },
      { key: 'vibratoDepth', label: 'Vib Depth', min: 0, max: 65535, section: 'Vibrato' },
      { key: 'vibratoAddValue', label: 'Vib Add', min: 0, max: 65535 },
      { key: 'noteTranspose', label: 'Transpose', min: -32768, max: 32767, section: 'Pitch' },
      { key: 'fineTunePeriod', label: 'Fine Tune', min: 0, max: 65535 },
    ],
  },

  ArtOfNoiseSynth: {
    name: 'Art of Noise',
    brandColor: '#aa44aa',
    params: [
      { key: 'type', label: 'Type', min: 0, max: 1, type: 'select', section: 'General',
        options: [{ value: 0, label: 'Sample' }, { value: 1, label: 'Synth' }] },
      { key: 'volume', label: 'Volume', min: 0, max: 64 },
      { key: 'fineTune', label: 'Fine Tune', min: 0, max: 15 },
      { key: 'waveform', label: 'Waveform', min: 0, max: 255 },
      { key: 'envelopeStart', label: 'Env Start', min: 0, max: 255, section: 'Envelope' },
      { key: 'envelopeAdd', label: 'Env Add', min: 0, max: 255 },
      { key: 'envelopeEnd', label: 'Env End', min: 0, max: 255 },
      { key: 'envelopeSub', label: 'Env Sub', min: 0, max: 255 },
      { key: 'startOffset', label: 'Start Ofs', min: 0, max: 131072, section: 'Sample' },
      { key: 'length', label: 'Length', min: 0, max: 131072 },
      { key: 'loopStart', label: 'Loop Start', min: 0, max: 131072 },
      { key: 'loopLength', label: 'Loop Len', min: 0, max: 131072 },
      { key: 'synthLength', label: 'Synth Len', min: 0, max: 255, section: 'Synth' },
      { key: 'vibParam', label: 'Vib Param', min: 0, max: 255 },
      { key: 'vibDelay', label: 'Vib Delay', min: 0, max: 255 },
      { key: 'vibWave', label: 'Vib Wave', min: 0, max: 3, type: 'select',
        options: [{ value: 0, label: 'Sine' }, { value: 1, label: 'Triangle' }, { value: 2, label: 'Rectangle' }, { value: 3, label: 'Off' }] },
      { key: 'waveSpeed', label: 'Wave Speed', min: 0, max: 255, section: 'Wavetable' },
      { key: 'waveLength', label: 'Wave Len', min: 0, max: 255 },
      { key: 'waveLoopStart', label: 'Wave Loop', min: 0, max: 255 },
      { key: 'waveLoopLength', label: 'Wave Rpt', min: 0, max: 255 },
      { key: 'waveLoopControl', label: 'Loop Ctrl', min: 0, max: 2, type: 'select',
        options: [{ value: 0, label: 'Normal' }, { value: 1, label: 'Backwards' }, { value: 2, label: 'Ping-Pong' }] },
    ],
  },

  DssWasmSynth: {
    name: 'Digital Sound Studio',
    brandColor: '#66aacc',
    params: [
      { key: 'volume', label: 'Volume', min: 0, max: 64, section: 'Sample' },
      { key: 'length', label: 'Length', min: 0, max: 131072 },
      { key: 'loopStart', label: 'Loop Start', min: 0, max: 131072 },
      { key: 'loopLength', label: 'Loop Len', min: 0, max: 131072 },
      { key: 'fineTune', label: 'Fine Tune', min: -8, max: 7 },
      { key: 'frequency', label: 'Frequency', min: 0, max: 65535 },
      { key: 'startOffset', label: 'Start Ofs', min: 0, max: 65535 },
    ],
  },

  SynthesisWasmSynth: {
    name: 'Synthesis',
    brandColor: '#cc66aa',
    params: [
      { key: 'volume', label: 'Volume', min: 0, max: 64, section: 'Sample' },
      { key: 'waveformNumber', label: 'Waveform', min: 0, max: 255 },
      { key: 'waveformLength', label: 'Wave Len', min: 0, max: 65535 },
      { key: 'synthesisEnabled', label: 'Synth On', min: 0, max: 1, type: 'checkbox' },
      { key: 'adsrEnabled', label: 'ADSR On', min: 0, max: 1, type: 'checkbox', section: 'ADSR' },
      { key: 'adsrTableNumber', label: 'ADSR Tbl', min: 0, max: 255 },
      { key: 'adsrTableLength', label: 'ADSR Len', min: 0, max: 255 },
      { key: 'egcMode', label: 'EGC Mode', min: 0, max: 3, section: 'EGC' },
      { key: 'egcTableNumber', label: 'EGC Tbl', min: 0, max: 255 },
      { key: 'egcTableLength', label: 'EGC Len', min: 0, max: 255 },
      { key: 'egcOffset', label: 'EGC Ofs', min: 0, max: 255 },
      { key: 'arpeggioStart', label: 'Arp Start', min: 0, max: 255, section: 'Arpeggio' },
      { key: 'arpeggioLength', label: 'Arp Len', min: 0, max: 255 },
      { key: 'arpeggioRepeatLength', label: 'Arp Rpt', min: 0, max: 255 },
      { key: 'vibratoSpeed', label: 'Vib Speed', min: 0, max: 255, section: 'Vibrato' },
      { key: 'vibratoLevel', label: 'Vib Level', min: 0, max: 255 },
      { key: 'vibratoDelay', label: 'Vib Delay', min: 0, max: 255 },
      { key: 'portamentoSpeed', label: 'Porta', min: 0, max: 255, section: 'Effects' },
      { key: 'effect', label: 'Effect', min: 0, max: 255 },
      { key: 'effectArg1', label: 'FX Arg 1', min: 0, max: 255 },
      { key: 'effectArg2', label: 'FX Arg 2', min: 0, max: 255 },
      { key: 'effectArg3', label: 'FX Arg 3', min: 0, max: 255 },
    ],
  },

  SoundFactory2WasmSynth: {
    name: 'Sound Factory',
    brandColor: '#aacc66',
    params: [
      { key: 'instrumentNumber', label: 'Inst #', min: 0, max: 255, section: 'General' },
      { key: 'octave', label: 'Octave', min: 0, max: 7 },
      { key: 'sampleLength', label: 'Samp Len', min: 0, max: 65535 },
      { key: 'samplingPeriod', label: 'Period', min: 0, max: 65535 },
      { key: 'attackTime', label: 'Attack', min: 0, max: 255, section: 'ADSR' },
      { key: 'decayTime', label: 'Decay', min: 0, max: 255 },
      { key: 'sustainLevel', label: 'Sustain', min: 0, max: 255 },
      { key: 'releaseTime', label: 'Release', min: 0, max: 255 },
      { key: 'dasrSustainOffset', label: 'Sus Ofs', min: 0, max: 255 },
      { key: 'dasrReleaseOffset', label: 'Rel Ofs', min: 0, max: 255 },
      { key: 'vibratoSpeed', label: 'Vib Speed', min: 0, max: 255, section: 'Vibrato' },
      { key: 'vibratoAmount', label: 'Vib Amt', min: 0, max: 255 },
      { key: 'vibratoDelay', label: 'Vib Delay', min: 0, max: 255 },
      { key: 'vibratoStep', label: 'Vib Step', min: 0, max: 255 },
      { key: 'tremoloSpeed', label: 'Trem Speed', min: 0, max: 255, section: 'Tremolo' },
      { key: 'tremoloRange', label: 'Trem Range', min: 0, max: 255 },
      { key: 'tremoloStep', label: 'Trem Step', min: 0, max: 255 },
      { key: 'portamentoSpeed', label: 'Porta Speed', min: 0, max: 255, section: 'Effects' },
      { key: 'portamentoStep', label: 'Porta Step', min: 0, max: 255 },
      { key: 'arpeggioSpeed', label: 'Arp Speed', min: 0, max: 255 },
      { key: 'filterFrequency', label: 'Filter Freq', min: 0, max: 255, section: 'Filter' },
      { key: 'filterSpeed', label: 'Filter Speed', min: 0, max: 255 },
      { key: 'filterEnd', label: 'Filter End', min: 0, max: 255 },
      { key: 'phasingStart', label: 'Phase Start', min: 0, max: 255, section: 'Phasing' },
      { key: 'phasingEnd', label: 'Phase End', min: 0, max: 255 },
      { key: 'phasingSpeed', label: 'Phase Speed', min: 0, max: 255 },
      { key: 'phasingStep', label: 'Phase Step', min: 0, max: 255 },
      { key: 'waveCount', label: 'Waves', min: 0, max: 255 },
      { key: 'effectByte', label: 'FX Byte', min: 0, max: 255 },
    ],
  },

  OktalyzerWasmSynth: {
    name: 'Oktalyzer',
    brandColor: '#cc8844',
    params: [
      { key: 'volume', label: 'Volume', min: 0, max: 64, section: 'Sample' },
      { key: 'length', label: 'Length', min: 0, max: 131072 },
      { key: 'repeatStart', label: 'Rpt Start', min: 0, max: 131072 },
      { key: 'repeatLength', label: 'Rpt Len', min: 0, max: 131072 },
      { key: 'mode', label: 'Mode', min: 0, max: 3 },
    ],
  },

  FredReplayerWasmSynth2: {
    name: 'Fred Editor',
    brandColor: '#ff6644',
    params: [
      { key: 'envVol', label: 'Volume', min: 0, max: 64, section: 'Sample' },
      { key: 'instrumentNumber', label: 'Inst #', min: 0, max: 255 },
      { key: 'instType', label: 'Type', min: 0, max: 3, type: 'select', options: [
        { value: 0, label: 'Sample' }, { value: 1, label: 'Synth' },
        { value: 2, label: 'Hybrid' }, { value: 3, label: 'Sync' },
      ]},
      { key: 'period', label: 'Period', min: 0, max: 65535 },
      { key: 'sampleSize', label: 'Sample Size', min: 0, max: 65535 },
      { key: 'repeatLen', label: 'Repeat Len', min: 0, max: 65535 },
      { key: 'length', label: 'Length', min: 0, max: 65535 },
      { key: 'attackSpeed', label: 'Atk Speed', min: 0, max: 255, section: 'ADSR' },
      { key: 'attackVolume', label: 'Atk Vol', min: 0, max: 255 },
      { key: 'decaySpeed', label: 'Dec Speed', min: 0, max: 255 },
      { key: 'decayVolume', label: 'Dec Vol', min: 0, max: 255 },
      { key: 'sustainDelay', label: 'Sus Delay', min: 0, max: 255 },
      { key: 'releaseSpeed', label: 'Rel Speed', min: 0, max: 255 },
      { key: 'releaseVolume', label: 'Rel Vol', min: 0, max: 255 },
      { key: 'vibDelay', label: 'Vib Delay', min: 0, max: 255, section: 'Vibrato' },
      { key: 'vibSpeed', label: 'Vib Speed', min: 0, max: 255 },
      { key: 'vibAmpl', label: 'Vib Ampl', min: 0, max: 255 },
      { key: 'arpSpeed', label: 'Arp Speed', min: 0, max: 255, section: 'Arpeggio' },
      { key: 'arpCount', label: 'Arp Count', min: 0, max: 255 },
      { key: 'pulseStart', label: 'Pulse Start', min: 0, max: 255, section: 'Pulse' },
      { key: 'pulseEnd', label: 'Pulse End', min: 0, max: 255 },
      { key: 'pulseSpeed', label: 'Pulse Speed', min: 0, max: 255 },
      { key: 'pulseDelay', label: 'Pulse Delay', min: 0, max: 255 },
      { key: 'pulseRateMin', label: 'Rate Min', min: 0, max: 255 },
      { key: 'pulseRatePlus', label: 'Rate Plus', min: 0, max: 255 },
      { key: 'pulseShotCounter', label: 'Shot Count', min: 0, max: 255 },
      { key: 'blend', label: 'Blend', min: 0, max: 255, section: 'Blend' },
      { key: 'blendDelay', label: 'Blend Delay', min: 0, max: 255 },
      { key: 'blendShotCounter', label: 'Blend Shot', min: 0, max: 255 },
      { key: 'instSync', label: 'Sync', min: 0, max: 1, type: 'checkbox', section: 'Misc' },
      { key: 'fineTune', label: 'Fine Tune', min: -128, max: 127 },
    ],
  },

  GmcWasmSynth: {
    name: 'Game Music Creator',
    brandColor: '#88aa44',
    params: [
      { key: 'volume', label: 'Volume', min: 0, max: 64, section: 'Sample' },
      { key: 'length', label: 'Length', min: 0, max: 131072 },
      { key: 'loopStart', label: 'Loop Start', min: 0, max: 131072 },
      { key: 'loopLength', label: 'Loop Len', min: 0, max: 131072 },
    ],
  },

  SoundFxWasmSynth: {
    name: 'SoundFX',
    brandColor: '#44aa88',
    params: [
      { key: 'volume', label: 'Volume', min: 0, max: 64, section: 'Sample' },
      { key: 'length', label: 'Length', min: 0, max: 131072 },
      { key: 'loopStart', label: 'Loop Start', min: 0, max: 131072 },
      { key: 'loopLength', label: 'Loop Len', min: 0, max: 131072 },
    ],
  },

  VoodooWasmSynth: {
    name: 'Voodoo Supreme',
    brandColor: '#aa4488',
    params: [
      { key: 'isSample', label: 'Is Sample', min: 0, max: 1, type: 'checkbox', section: 'Waveform' },
      { key: 'dataLength', label: 'Data Len', min: 0, max: 65535 },
      { key: 'sampleLength', label: 'Sample Len', min: 0, max: 65535 },
      { key: 'offset', label: 'Offset', min: 0, max: 65535 },
    ],
  },
};
