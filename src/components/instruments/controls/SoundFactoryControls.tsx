/**
 * SoundFactoryControls.tsx - effect flags and parameters of a Sound Factory (.psf) DefineInstr record.
 *
 * Reads and writes metadata.soundFactoryInstrument (field layout: soundFactoryInstrumentParams.ts). A change goes
 * to the instrument store (the exporter patches the record bytes from it) and, when the WASM replayer is loaded,
 * to the engine through its existing setInstrumentParam worklet message. Current state is read through a ref
 * (docs/CONTROL_PATTERNS.md) so fast knob input never works from a stale closure.
 */
import React, { useCallback, useRef } from 'react';
import type { InstrumentConfig } from '@/types';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { SoundFactory2Engine } from '@/engine/soundfactory/SoundFactory2Engine';
import { SF_FLAG, type SfFlagKey, type SfInstrParamKey, type SfInstrParams } from '@/lib/import/formats/soundFactoryInstrumentParams';

interface SoundFactoryControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

interface KnobDef { key: SfInstrParamKey; label: string; max: number; min?: number }
interface Group { flag: SfFlagKey; title: string; knobs: KnobDef[] }

const GROUPS: Group[] = [
  { flag: 'vibrato', title: 'Vibrato', knobs: [
    { key: 'vibratoDelay', label: 'Delay', max: 255 }, { key: 'vibratoSpeed', label: 'Speed', max: 255 },
    { key: 'vibratoStep', label: 'Step', min: -128, max: 127 }, { key: 'vibratoAmount', label: 'Amount', max: 255 } ] },
  { flag: 'arpeggio', title: 'Arpeggio', knobs: [{ key: 'arpeggioSpeed', label: 'Speed', max: 255 }] },
  { flag: 'portamento', title: 'Portamento', knobs: [
    { key: 'portamentoStep', label: 'Step', max: 65535 }, { key: 'portamentoSpeed', label: 'Speed', max: 255 } ] },
  { flag: 'tremolo', title: 'Tremolo', knobs: [
    { key: 'tremoloSpeed', label: 'Speed', max: 255 }, { key: 'tremoloStep', label: 'Step', max: 255 }, { key: 'tremoloRange', label: 'Range', max: 255 } ] },
  { flag: 'phasing', title: 'Phasing', knobs: [
    { key: 'phasingStart', label: 'Start', max: 255 }, { key: 'phasingEnd', label: 'End', max: 255 },
    { key: 'phasingSpeed', label: 'Speed', max: 255 }, { key: 'phasingStep', label: 'Step', min: -128, max: 127 } ] },
  { flag: 'release', title: 'Release', knobs: [
    { key: 'attackTime', label: 'Attack', max: 255 }, { key: 'decayTime', label: 'Decay', max: 255 },
    { key: 'sustainLevel', label: 'Sustain', max: 255 }, { key: 'releaseTime', label: 'Release', max: 255 },
    { key: 'dasrSustainOffset', label: 'Sustain Offset', max: 65535 }, { key: 'dasrReleaseOffset', label: 'Release Offset', max: 65535 } ] },
  { flag: 'filter', title: 'Filter', knobs: [
    { key: 'filterFrequency', label: 'Frequency', max: 255 }, { key: 'filterEnd', label: 'End', max: 255 }, { key: 'filterSpeed', label: 'Speed', max: 255 } ] },
];

export const SoundFactoryControls: React.FC<SoundFactoryControlsProps> = ({ instrument, onChange }) => {
  const meta = instrument.metadata?.soundFactoryInstrument;
  const instrumentRef = useRef(instrument);
  instrumentRef.current = instrument;

  const commit = useCallback((patch: Partial<SfInstrParams>) => {
    const cur = instrumentRef.current;
    const m = cur.metadata?.soundFactoryInstrument;
    if (!m) return;
    const params: Record<string, number> = { ...m.params };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) params[k] = v;
    instrumentRef.current = { ...cur, metadata: { ...cur.metadata, soundFactoryInstrument: { ...m, params } } };
    onChange({ metadata: instrumentRef.current.metadata });
    // Keyed by the DefineInstr record's file offset: list position in the replayer can differ from the parser's.
    if (SoundFactory2Engine.hasInstance()) {
      const engine = SoundFactory2Engine.getInstance();
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) engine.setInstrumentParam(m.recordOffset, k, v);
    }
  }, [onChange]);

  if (!meta) return null;
  const effectByte = meta.params.effectByte ?? 0;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <div className="text-[10px] font-mono text-text-muted mb-2">Playback</div>
        <div className="flex flex-wrap gap-3">
          <Toggle label="One Shot" value={(effectByte & SF_FLAG.oneShot) !== 0}
            onChange={(on) => commit({ effectByte: on ? effectByte | SF_FLAG.oneShot : effectByte & ~SF_FLAG.oneShot })} />
        </div>
      </div>
      {GROUPS.map((g) => {
        const on = (effectByte & SF_FLAG[g.flag]) !== 0;
        return (
          <div key={g.flag} className="border border-dark-border rounded p-2 bg-dark-bgSecondary">
            <div className="flex items-center gap-3 mb-2">
              <Toggle label={g.title} value={on}
                onChange={(next) => commit({ effectByte: next ? effectByte | SF_FLAG[g.flag] : effectByte & ~SF_FLAG[g.flag] })} />
            </div>
            <div className={`flex flex-wrap gap-3 ${on ? '' : 'opacity-50'}`}>
              {g.knobs.map((k) => (
                <Knob key={k.key} label={k.label} size="sm" min={k.min ?? 0} max={k.max} step={1}
                  value={meta.params[k.key] ?? 0} onChange={(v) => commit({ [k.key]: Math.round(v) })} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
