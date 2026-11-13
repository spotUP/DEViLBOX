/**
 * MedleyControls - the editor of a Medley (.mso) instrument.
 *
 * Every field the medley replayer reads from the instrument record (third-party/nuade/players/medley, offsets in
 * medleyInstrument.ts) has a control: type, window, phase, transpose, tone, the wave of each of the 8 note ranges,
 * the envelope and the 4 modulators; plus the octave and second-half flag of the wave a range plays. The module bytes
 * are the only copy: each control reads its value from them and writes it back (medleyInstrumentEdit), which reaches
 * the keyboard voice at the next key and the playing song through the engine swap.
 *
 * Layout and drawing follow SonicArrangerControls / SoundMonControls / HivelyControls: instrument colours, section
 * labels, knob rows, a curve drawn per tick from the replayer's own arithmetic.
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { InstrumentConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { CustomSelect } from '@components/common/CustomSelect';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared/SectionLabel';
import { WaveformLineCanvas } from '@components/instruments/shared/WaveformLineCanvas';
import { useFormatStore } from '@/stores/useFormatStore';
import {
  readMedleyInstrument, medleyWaveList, medleyWaveData, medleyEnvelopeCurve, medleyModulatorCurve,
  medleyInstrumentWrite, medleyWaveRegionWrite, medleyModulatorWrite, medleyWaveFieldWrite,
  MEDLEY_REGION_START, type MedleyInstrumentScalar, type MedleyModulatorKey, type MedleyWrite, type MedleyModulator,
} from '@/lib/import/formats/medleyInstrument';
import { applyMedleyInstrumentWrites, medleyEditableModule } from '@/engine/medley/medleyInstrumentEdit';

export interface MedleyControlsProps {
  instrument: InstrumentConfig;
}

const TYPE_OPTIONS = [
  { value: '0', label: 'Sample (whole wave, looped)' },
  { value: '1', label: 'Looped (window moved by a modulator)' },
  { value: '2', label: 'Synth (two reads of the wave added)' },
  { value: '3', label: 'One Shot (wave once, then silence)' },
];
const KIND_OPTIONS = [
  { value: '0', label: 'Off' }, { value: '1', label: 'Vibrato' }, { value: '2', label: 'Tremolo' },
  { value: '3', label: 'Window' }, { value: '4', label: 'Phase' }, { value: '5', label: 'Period Up' },
  { value: '6', label: 'Period Down' }, { value: '7', label: 'Tone' },
];
const VOICE_FLAG_OPTIONS = [
  { value: '0', label: 'Off' }, { value: '1', label: 'Voices 1 and 2' }, { value: '2', label: 'Voices 2 and 3' },
];
const ENVELOPE_HOLD_TICKS = 50;
const MODULATOR_TICKS = 200;

/** One curve, 0..max, drawn per tick (the replayer runs these once per tick). */
const TickCurve: React.FC<{ data: number[]; max: number; color: string; height?: number; marker?: number }> = ({ data, max, color, height = 64, marker }) => {
  const width = 320;
  const n = Math.max(2, data.length);
  const points = data.map((v, i) => `${(i / (n - 1)) * width},${height - 1 - (Math.min(v, max) / Math.max(1, max)) * (height - 2)}`).join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
      className="bg-dark-bg border border-dark-border rounded">
      {marker !== undefined && marker < n && (
        <line x1={(marker / (n - 1)) * width} x2={(marker / (n - 1)) * width} y1={0} y2={height}
          stroke={color} strokeOpacity={0.3} strokeDasharray="3 3" />
      )}
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const MedleyControls: React.FC<MedleyControlsProps> = ({ instrument }) => {
  const { knob, panelBg, panelStyle } = useInstrumentColors('#c08040', { knob: '#e0a060', dim: '#1a1008' });
  const number = (instrument.metadata as { medleyInstrument?: number } | undefined)?.medleyInstrument ?? 0;
  // The bytes change in place; `version` re-reads them after each write, the store field after a song change.
  const [version, setVersion] = useState(0);
  const moduleData = useFormatStore((s) => s.nuadeFileData);
  const playerId = useFormatStore((s) => s.nuadePlayerId);
  const [region, setRegion] = useState(0);

  const buf = useMemo(() => (moduleData && playerId === 'medley' ? medleyEditableModule() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [moduleData, playerId, version]);
  const ins = useMemo(() => (buf ? readMedleyInstrument(buf, number) : null), [buf, number]);
  const waves = useMemo(() => (buf ? medleyWaveList(buf) : []), [buf]);

  const write = useCallback((writes: MedleyWrite[]) => {
    if (applyMedleyInstrumentWrites(writes)) setVersion((v) => v + 1);
  }, []);
  const rec = ins?.offset ?? 0;
  const setField = useCallback((field: MedleyInstrumentScalar, value: number) => {
    if (rec) write([medleyInstrumentWrite(rec, field, value)]);
  }, [rec, write]);
  const setMod = useCallback((index: number, field: MedleyModulatorKey, value: number | boolean) => {
    if (rec) write([medleyModulatorWrite(rec, index, field, value)]);
  }, [rec, write]);

  const envelope = useMemo(() => (ins ? medleyEnvelopeCurve(ins, ENVELOPE_HOLD_TICKS) : []), [ins]);

  if (!buf || !ins) {
    return (
      <div className="p-4 text-[10px] font-mono text-text-muted">
        The instrument record is read from the Medley module playing on nuade. Load the song on the nuade engine to edit it.
      </div>
    );
  }

  // The wave the chosen note range plays (mdl_region_wave: 0 takes the range below).
  let effective = 0;
  for (let r = region; r >= 0 && effective === 0; r--) effective = ins.waves[r];
  const wave = waves.find((w) => w.number === effective) ?? null;
  const waveData = wave ? Array.from(medleyWaveData(buf, wave)) : [];
  const waveLabel = (n: number): string => {
    const w = waves.find((x) => x.number === n);
    return w ? `${n} ${w.name || 'Unnamed'} (${w.length} bytes, octave ${w.octave})` : `${n} (not in the wave table)`;
  };
  const toneA = ins.tone >> 4;
  const toneB = ins.tone & 0x0f;
  const panel = `rounded-lg border p-3 ${panelBg}`;

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">
      {/* Voice */}
      <div className={panel} style={panelStyle}>
        <SectionLabel label={`Instrument ${ins.number}: ${ins.name || 'Unnamed'}`} color={knob} />
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1 min-w-[240px]">
            <span className="text-[10px] font-mono text-text-secondary">Type</span>
            <CustomSelect value={String(Math.min(ins.type, 3))} options={TYPE_OPTIONS}
              onChange={(v) => setField('type', Number(v))} />
          </div>
          <Knob label="Transpose" value={ins.transpose} min={-128} max={127} step={1} color={knob} size="sm"
            onChange={(v) => setField('transpose', Math.round(v) & 0xff)} formatValue={(v) => `${Math.round(v)}`} />
          <Knob label="Window" value={ins.window} min={0} max={255} step={1} color={knob} size="sm"
            title="Looped: the window of the wave that plays (moved by a Window modulator)"
            onChange={(v) => setField('window', v)} formatValue={(v) => `${Math.round(v)}`} />
          <Knob label="Phase" value={ins.phase} min={0} max={255} step={1} color={knob} size="sm"
            title="Synth: where the first read of the wave starts (moved by a Phase modulator)"
            onChange={(v) => setField('phase', v)} formatValue={(v) => `${Math.round(v)}`} />
          <Knob label="Tone First Read" value={toneA} min={0} max={15} step={1} color={knob} size="sm"
            title="Synth: step of the first read through the wave (0 reads as 16)"
            onChange={(v) => setField('tone', (Math.round(v) << 4) | toneB)} formatValue={(v) => `${Math.round(v) || 16}`} />
          <Knob label="Tone Second Read" value={toneB} min={0} max={15} step={1} color={knob} size="sm"
            title="Synth: step of the second read through the wave (0 reads as 16)"
            onChange={(v) => setField('tone', (toneA << 4) | Math.round(v))} formatValue={(v) => `${Math.round(v) || 16}`} />
        </div>
      </div>

      {/* Waves per note range */}
      <div className={panel} style={panelStyle}>
        <SectionLabel label="Wave per Note Range" color={knob} />
        <div className="grid grid-cols-2 gap-2">
          {ins.waves.map((w, r) => (
            <div key={r} className={`flex items-center gap-2 p-1 rounded ${r === region ? 'bg-dark-bgActive' : ''}`}
              onClick={() => setRegion(r)}>
              <span className="text-[10px] font-mono text-text-secondary w-28 shrink-0">Range {r + 1} (note {MEDLEY_REGION_START[r]} up)</span>
              <CustomSelect className="flex-1" value={String(w)}
                options={[
                  { value: '0', label: r === 0 ? 'None' : 'Same as range below' },
                  ...waves.map((x) => ({ value: String(x.number), label: waveLabel(x.number) })),
                  ...(w !== 0 && !waves.some((x) => x.number === w) ? [{ value: String(w), label: waveLabel(w) }] : []),
                ]}
                onChange={(v) => { setRegion(r); if (rec) write([medleyWaveRegionWrite(rec, r, Number(v))]); }} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {wave ? (
            <>
              <WaveformLineCanvas data={waveData} width={320} height={72} color={knob} maxSamples={1024}
                label={`Range ${region + 1}: wave ${waveLabel(wave.number)}`} />
              <Knob label="Wave Octave" value={wave.octave} min={0} max={8} step={1} color={knob} size="sm"
                title="Shared by every instrument that plays this wave"
                onChange={(v) => write([medleyWaveFieldWrite(wave, 'octave', Math.round(v))])} formatValue={(v) => `${Math.round(v)}`} />
              <Toggle label="Second Half" value={wave.secondHalf} color={knob}
                onChange={(v) => write([medleyWaveFieldWrite(wave, 'secondHalf', v)])} />
              <span className="text-[10px] font-mono text-text-muted">Octave and Second Half belong to the wave: every instrument using it hears the change.</span>
            </>
          ) : (
            <span className="text-[10px] font-mono text-text-muted">Range {region + 1} plays no wave.</span>
          )}
        </div>
      </div>

      {/* Envelope */}
      <div className={panel} style={panelStyle}>
        <SectionLabel label="Volume Envelope" color={knob} />
        <div className="flex flex-wrap items-end gap-4 mb-2">
          {([['maxLevel', 'Maximum Level'], ['sustainLevel', 'Sustain Level'], ['attack', 'Attack'], ['decay', 'Decay'], ['release', 'Release']] as const).map(([f, label]) => (
            <Knob key={f} label={label} value={ins[f]} min={0} max={65535} step={1} color={knob} size="sm"
              title={f === 'attack' || f === 'decay' || f === 'release' ? 'Level change per tick' : 'Level, 0 to 65535'}
              onChange={(v) => setField(f, v)} formatValue={(v) => `${Math.round(v)}`} />
          ))}
        </div>
        <TickCurve data={envelope} max={65535} color={knob} marker={ENVELOPE_HOLD_TICKS} />
        <span className="text-[10px] font-mono text-text-muted">Per tick; key held for {ENVELOPE_HOLD_TICKS} ticks (dashed line), then released.</span>
      </div>

      {/* Modulators */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {ins.modulators.map((m, i) => (
          <ModulatorPanel key={i} index={i} m={m} color={knob} className={panel} style={panelStyle} onChange={setMod} />
        ))}
      </div>
    </div>
  );
};

interface ModulatorPanelProps {
  index: number; m: MedleyModulator; color: string; className: string; style: React.CSSProperties;
  onChange: (index: number, field: MedleyModulatorKey, value: number | boolean) => void;
}

const ModulatorPanel: React.FC<ModulatorPanelProps> = ({ index, m, color, className, style, onChange }) => {
  const curve = useMemo(() => medleyModulatorCurve(m, MODULATOR_TICKS), [m]);
  const off = m.kind === 0;
  return (
    <div className={className} style={style}>
      <SectionLabel label={`Modulator ${index + 1}`} color={color} />
      <div className="flex flex-wrap items-end gap-3 mb-2">
        <div className="flex flex-col gap-1 min-w-[130px]">
          <span className="text-[10px] font-mono text-text-secondary">Target</span>
          <CustomSelect value={String(Math.min(m.kind, 7))} options={KIND_OPTIONS} onChange={(v) => onChange(index, 'kind', Number(v))} />
        </div>
        <div className="flex flex-col gap-1 min-w-[130px]">
          <span className="text-[10px] font-mono text-text-secondary">Start at Top</span>
          <CustomSelect value={String(m.topStart)} disabled={off}
            options={[...VOICE_FLAG_OPTIONS, ...(m.topStart > 2 ? [{ value: String(m.topStart), label: `Flag ${m.topStart}` }] : [])]}
            onChange={(v) => onChange(index, 'topStart', Number(v))} />
        </div>
        <div className="flex flex-col gap-1 min-w-[130px]">
          <span className="text-[10px] font-mono text-text-secondary">Start at Half</span>
          <CustomSelect value={String(m.halfStart)} disabled={off}
            options={[...VOICE_FLAG_OPTIONS, ...(m.halfStart > 2 ? [{ value: String(m.halfStart), label: `Flag ${m.halfStart}` }] : [])]}
            onChange={(v) => onChange(index, 'halfStart', Number(v))} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <Toggle label="Gate" value={m.gate} color={color} onChange={(v) => onChange(index, 'gate', v)} />
        <Toggle label="Free Running" value={m.freeRunning} color={color} onChange={(v) => onChange(index, 'freeRunning', v)} />
        <Toggle label="One Shot" value={m.oneShot} color={color} onChange={(v) => onChange(index, 'oneShot', v)} />
        <Toggle label="Invert" value={m.invert} color={color} onChange={(v) => onChange(index, 'invert', v)} />
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-2">
        <Knob label="Delay" value={m.delay} min={0} max={255} step={1} color={color} size="sm" disabled={off}
          title="Ticks before the modulator starts" onChange={(v) => onChange(index, 'delay', Math.round(v))} formatValue={(v) => `${Math.round(v)}`} />
        <Knob label="Level" value={m.level} min={0} max={65535} step={1} color={color} size="sm" disabled={off}
          onChange={(v) => onChange(index, 'level', v)} formatValue={(v) => `${Math.round(v)}`} />
        <Knob label="Rise" value={m.rise} min={0} max={65535} step={1} color={color} size="sm" disabled={off}
          title="Change per tick while rising" onChange={(v) => onChange(index, 'rise', v)} formatValue={(v) => `${Math.round(v)}`} />
        <Knob label="Fall" value={m.fall} min={0} max={65535} step={1} color={color} size="sm" disabled={off}
          title="Change per tick while falling" onChange={(v) => onChange(index, 'fall', v)} formatValue={(v) => `${Math.round(v)}`} />
      </div>
      {!off && <TickCurve data={curve} max={Math.max(1, m.level)} color={color} height={48} />}
    </div>
  );
};

export default MedleyControls;
