/**
 * JxsControls.tsx - JayTrax (.jxs) instrument editor.
 *
 * The module bytes are the only state: every control reads the instrument out of useFormatStore.jxsFileData
 * (readJxsInstrument) and writes a JxsEdit that editJxsInstrument turns into new module bytes and commits to
 * the song, the format store and the running engine (commitJxsModule). Keyboard audition is the J1d preview
 * voice (JxsSynth), which reloads when the committed module changes.
 *
 * Sections: Main, Waves, Envelopes, Arpeggio, Effects, Sample (3457 files that carry a sample).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { Button } from '@components/ui/Button';
import { CustomSelect } from '@components/common/CustomSelect';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { useFormatStore } from '@stores/useFormatStore';
import { BarChart, NumBox, SectionLabel, SegmentButton, WaveformLineCanvas } from '@components/instruments/shared';
import {
  JXS_EFFECT_TYPES,
  JXS_RANGES,
  JXS_WAVES,
  JXS_WAVE_LENGTH,
  jxsEnvelopeCurve,
  readJxsArpeggio,
  readJxsInstrument,
  readJxsSample,
  type JxsEdit,
  type JxsInstrument,
  type JxsScalars,
  type JxsSlot,
  type JxsSlotParam,
} from '@/lib/import/formats/jxsInstrument';

export interface JxsControlsProps {
  /** Grid instrument number (1-based). */
  instrumentId: number;
  /** Receives every edit. Default: write it into the playing song's module and commit it. */
  onChange?: (edit: JxsEdit) => void;
}

const BRAND = '#44ddaa';
const SECTIONS = ['Main', 'Waves', 'Envelopes', 'Arpeggio', 'Effects', 'Sample'];
const WAVE_VIEW_W = 512;
const WAVE_VIEW_H = 160;

async function commitToSong(instrumentId: number, edit: JxsEdit): Promise<void> {
  const [{ getTrackerReplayer }, { editJxsInstrument }] = await Promise.all([
    import('@/engine/TrackerReplayer'),
    import('@/engine/jxs/jxsModuleEdits'),
  ]);
  const song = getTrackerReplayer().getSong();
  if (song) await editJxsInstrument(song, instrumentId, edit);
}

/** int16 wave to the int8 range the shared canvases draw. */
const toInt8 = (w: ArrayLike<number>): number[] => Array.from({ length: w.length }, (_, k) => w[k] >> 8);

const waveOf = (inst: JxsInstrument, w: number): Int16Array =>
  inst.waves.slice(w * JXS_WAVE_LENGTH, (w + 1) * JXS_WAVE_LENGTH);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------------------------------------------
// Drawable wave

interface WaveDrawProps {
  data: Int16Array;
  color: string;
  onCommit: (next: Int16Array) => void;
}

/** 256 samples drawn with the pointer; the edit is committed once, when the pointer is released. */
const WaveDraw: React.FC<WaveDrawProps> = ({ data, color, onCommit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draft = useRef<Int16Array | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const d = draft.current ?? data;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, WAVE_VIEW_W, WAVE_VIEW_H);
    ctx.strokeStyle = 'rgba(128,128,128,0.3)';
    ctx.beginPath();
    ctx.moveTo(0, WAVE_VIEW_H / 2);
    ctx.lineTo(WAVE_VIEW_W, WAVE_VIEW_H / 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < JXS_WAVE_LENGTH; k++) {
      const x = ((k + 0.5) / JXS_WAVE_LENGTH) * WAVE_VIEW_W;
      const y = WAVE_VIEW_H / 2 - (d[k] / 32768) * (WAVE_VIEW_H / 2);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [data, color, tick]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = clamp(Math.floor(((e.clientX - r.left) / (r.width || WAVE_VIEW_W)) * JXS_WAVE_LENGTH), 0, JXS_WAVE_LENGTH - 1);
    const y = clamp(Math.round((1 - 2 * ((e.clientY - r.top) / (r.height || WAVE_VIEW_H))) * 32768), -32768, 32767);
    return { x, y };
  };

  const paint = (p: { x: number; y: number }): void => {
    const d = draft.current;
    if (!d) return;
    const from = last.current ?? p;
    const span = Math.max(1, Math.abs(p.x - from.x));
    for (let s = 0; s <= span; s++) {
      const x = Math.round(from.x + ((p.x - from.x) * s) / span);
      d[x] = Math.round(from.y + ((p.y - from.y) * s) / span);
    }
    last.current = p;
    setTick((t) => t + 1);
  };

  return (
    <canvas
      ref={canvasRef}
      width={WAVE_VIEW_W}
      height={WAVE_VIEW_H}
      className="rounded border border-dark-border cursor-crosshair touch-none"
      data-testid="jxs-wave-draw"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        draft.current = data.slice();
        last.current = null;
        paint(point(e));
      }}
      onPointerMove={(e) => { if (draft.current) paint(point(e)); }}
      onPointerUp={() => {
        const d = draft.current;
        draft.current = null;
        last.current = null;
        if (d) onCommit(d);
      }}
    />
  );
};

// ---------------------------------------------------------------------------------------------------------------
// Small controls

interface ScalarKnobProps {
  inst: JxsInstrument;
  field: keyof JxsScalars;
  label: string;
  color: string;
  edit: (e: JxsEdit) => void;
  title?: string;
}

const ScalarKnob: React.FC<ScalarKnobProps> = ({ inst, field, label, color, edit, title }) => {
  const [min, max] = JXS_RANGES[field];
  return (
    <Knob
      label={label}
      value={inst[field]}
      min={min}
      max={max}
      step={1}
      size="sm"
      color={color}
      title={title}
      formatValue={(v) => String(Math.round(v))}
      onChange={(v) => edit({ [field]: Math.round(v) })}
    />
  );
};

const ScalarNum: React.FC<{ inst: JxsInstrument; field: keyof JxsScalars; label: string; edit: (e: JxsEdit) => void }> = (
  { inst, field, label, edit },
) => {
  const [min, max] = JXS_RANGES[field];
  return <NumBox label={label} value={inst[field]} min={min} max={max} onValueChange={(v) => edit({ [field]: v })} />;
};

// ---------------------------------------------------------------------------------------------------------------
// Sections

interface SectionProps {
  inst: JxsInstrument;
  color: string;
  edit: (e: JxsEdit) => void;
}

const MainSection: React.FC<SectionProps> = ({ inst, color, edit }) => (
  <div className="flex flex-col gap-3">
    <SectionLabel label="Instrument" color={color} />
    <label className="flex items-center gap-2 text-[10px] text-text-secondary">
      Name
      <input
        type="text"
        maxLength={31}
        value={inst.name}
        onChange={(e) => edit({ name: e.target.value })}
        className="bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5 w-64"
      />
    </label>
    <div className="flex gap-4 flex-wrap">
      <ScalarKnob inst={inst} field="volume" label="Volume" color={color} edit={edit} title="Instrument volume (256 is full scale)" />
      <ScalarKnob inst={inst} field="finetune" label="Fine Tune" color={color} edit={edit} />
    </div>
    <NumBox
      label="Start Wave"
      value={inst.wave + 1}
      min={1}
      max={JXS_WAVES}
      onValueChange={(v) => edit({ wave: v - 1 })}
    />
    <ScalarNum inst={inst} field="wavelen" label="Wave Length" edit={edit} />
    <p className="text-[9px] text-text-muted">
      Wave Length is the number of consecutive waves, starting at the start wave, that make up the oscillator cycle.
    </p>
  </div>
);

const WavesSection: React.FC<SectionProps> = ({ inst, color, edit }) => {
  const [sel, setSel] = useState(0);
  const [clip, setClip] = useState<Int16Array | null>(null);
  const wave = waveOf(inst, sel);
  const put = (w: number, data: ArrayLike<number>): void => edit({ waves: { [w]: data } });
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel label="Waves" color={color} />
      <div className="grid grid-cols-8 gap-1">
        {Array.from({ length: JXS_WAVES }, (_, w) => (
          <button
            key={w}
            type="button"
            aria-label={`Wave ${w + 1}`}
            onClick={() => setSel(w)}
            className={`rounded border p-0.5 ${w === sel ? 'border-accent-primary bg-dark-bgActive' : 'border-dark-border bg-dark-bgSecondary'}`}
          >
            <WaveformLineCanvas data={toInt8(waveOf(inst, w))} width={64} height={28} color={color} />
            <div className="text-[9px] font-mono text-text-muted">{w + 1}</div>
          </button>
        ))}
      </div>
      <div className="text-[10px] text-text-secondary">Wave {sel + 1}. Draw with the pointer.</div>
      <WaveDraw data={wave} color={color} onCommit={(d) => put(sel, d)} />
      <div className="flex gap-2 flex-wrap items-center">
        <Button size="sm" onClick={() => {
          let peak = 0;
          for (const v of wave) peak = Math.max(peak, Math.abs(v));
          if (peak > 0) put(sel, wave.map((v) => clamp(Math.round((v * 32767) / peak), -32768, 32767)));
        }}>Normalize</Button>
        <Button size="sm" onClick={() => put(sel, wave.map((v) => clamp(-v, -32768, 32767)))}>Invert</Button>
        <Button size="sm" onClick={() => put(sel, new Int16Array(JXS_WAVE_LENGTH))}>Clear</Button>
        <Button size="sm" onClick={() => setClip(wave.slice())}>Copy</Button>
        <Button size="sm" disabled={!clip} onClick={() => clip && put(sel, clip)}>Paste</Button>
        <Toggle
          label="Restore On Every Note"
          value={inst.resetwave[sel] !== 0}
          onChange={(v) => edit({ resetwave: { [sel]: v ? 1 : 0 } })}
          color={color}
          title="Copy this wave from the file at every note, discarding what the effect slots did to it"
        />
      </div>
    </div>
  );
};

type EnvelopeKind = 'vol' | 'pitch' | 'pan';

const EnvelopeBlock: React.FC<SectionProps & { kind: EnvelopeKind; title: string }> = ({ inst, color, edit, kind, title }) => {
  const waveKey = `${kind}wave` as keyof JxsScalars;
  const speedKey = `${kind}speed` as keyof JxsScalars;
  const loopKey = `${kind}loop` as keyof JxsScalars;
  const src = inst[waveKey];
  const curve = useMemo(
    () => (src === 0 ? [] : toInt8(jxsEnvelopeCurve(waveOf(inst, src - 1), inst[speedKey], inst[loopKey], 128))),
    [inst, src, speedKey, loopKey],
  );
  return (
    <div className="flex flex-col gap-2 border border-dark-border rounded p-2 bg-dark-bgSecondary">
      <SectionLabel label={title} color={color} />
      <div className="flex gap-4 flex-wrap items-center">
        <NumBox label="Source Wave" value={src} min={0} max={JXS_WAVES} onValueChange={(v) => edit({ [waveKey]: v })} />
        <ScalarKnob inst={inst} field={speedKey} label="Speed" color={color} edit={edit} />
        <ScalarKnob inst={inst} field={loopKey} label="Loop Point" color={color} edit={edit} />
        {kind === 'pitch' && <ScalarKnob inst={inst} field="pitchdelay" label="Delay" color={color} edit={edit} title="Ticks before the pitch envelope starts" />}
      </div>
      <div className="text-[9px] text-text-muted">
        {src === 0 ? 'No source wave: envelope off (0 = none).' : `Reads wave ${src}, 128 ticks from the note start.`}
      </div>
      {src !== 0 && <WaveformLineCanvas data={curve} width={WAVE_VIEW_W} height={64} color={color} maxSamples={128} />}
    </div>
  );
};

const EnvelopesSection: React.FC<SectionProps> = (p) => (
  <div className="flex flex-col gap-3">
    <EnvelopeBlock {...p} kind="vol" title="Volume Envelope" />
    <EnvelopeBlock {...p} kind="pitch" title="Pitch Envelope" />
    <EnvelopeBlock {...p} kind="pan" title="Pan Envelope" />
  </div>
);

const ARP_RANGE = 48;

const ArpeggioSection: React.FC<SectionProps & { arp: number[] }> = ({ inst, color, edit, arp }) => {
  const table = inst.arp;
  const base = table * 16;
  const slice = arp.slice(base, base + 16);
  const draft = useRef<number[] | null>(null);
  const [, setTick] = useState(0);
  const shown = draft.current ?? slice;
  const setStep = (e: React.PointerEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    const step = clamp(Math.floor(((e.clientX - r.left) / (r.width || 1)) * 16), 0, 15);
    const semi = clamp(Math.round((0.5 - (e.clientY - r.top) / (r.height || 1)) * 2 * ARP_RANGE), -ARP_RANGE, ARP_RANGE);
    if (draft.current) { draft.current[step] = semi; setTick((t) => t + 1); }
  };
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel label="Arpeggio" color={color} />
      <ScalarNum inst={inst} field="arp" label="Arpeggio Table" edit={edit} />
      <div className="text-[10px] text-accent-warning">
        The 16 arpeggio tables are shared by every instrument in the song. Editing a table changes all instruments that use it.
      </div>
      <div
        className="relative w-fit touch-none cursor-crosshair"
        data-testid="jxs-arp-draw"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); draft.current = slice.slice(); setStep(e); }}
        onPointerMove={setStep}
        onPointerUp={() => {
          const d = draft.current;
          draft.current = null;
          if (d) edit({ arpeggio: Object.fromEntries(d.map((v, k) => [base + k, v])) });
          setTick((t) => t + 1);
        }}
      >
        <BarChart data={shown} width={WAVE_VIEW_W} height={120} color={color} signed maxValues={16} />
      </div>
      <div className="flex gap-1 flex-wrap">
        {shown.map((v, k) => (
          <input
            key={k}
            type="number"
            aria-label={`Arpeggio step ${k + 1}`}
            min={-128}
            max={127}
            value={v}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) edit({ arpeggio: { [base + k]: clamp(n, -128, 127) } });
            }}
            className="w-12 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs text-center"
          />
        ))}
      </div>
    </div>
  );
};

const PARAM_LABEL: Record<JxsSlotParam, string> = {
  dest: 'Destination Wave', src1: 'First Source Wave', src2: 'Second Source Wave', osc: 'Oscillator Wave (0 = none)',
  oscspeed: 'Oscillator Speed', oscflag: 'Oscillator Drives Second Parameter', var1: 'First Value', var2: 'Second Value',
  speed: 'Speed',
};

const SLOT_OPTIONS = [
  { value: '0', label: 'Off' },
  ...JXS_EFFECT_TYPES.map((t) => ({ value: String(t.type), label: `${t.type}. ${t.name}` })),
];

const SlotParam: React.FC<{ slot: JxsSlot; param: JxsSlotParam; set: (p: Partial<JxsSlot>) => void }> = ({ slot, param, set }) => {
  if (param === 'dest' || param === 'src1' || param === 'src2') {
    return <NumBox label={PARAM_LABEL[param]} value={slot[param] + 1} min={1} max={JXS_WAVES} onValueChange={(v) => set({ [param]: v - 1 })} />;
  }
  if (param === 'osc') {
    return <NumBox label={PARAM_LABEL[param]} value={slot.osc} min={0} max={JXS_WAVES} onValueChange={(v) => set({ osc: v })} />;
  }
  if (param === 'oscflag') {
    return <Toggle label={PARAM_LABEL[param]} value={slot.oscflag !== 0} onChange={(v) => set({ oscflag: v ? 1 : 0 })} />;
  }
  if (param === 'var1' || param === 'var2') {
    return <NumBox label={PARAM_LABEL[param]} value={slot[param]} min={-32768} max={65535} width="64px" onValueChange={(v) => set({ [param]: v })} />;
  }
  return <NumBox label={PARAM_LABEL[param]} value={slot[param]} min={0} max={65535} width="64px" onValueChange={(v) => set({ [param]: v })} />;
};

const EffectsSection: React.FC<SectionProps> = ({ inst, color, edit }) => (
  <div className="flex flex-col gap-3">
    <SectionLabel label="Effect Slots" color={color} />
    <p className="text-[9px] text-text-muted">
      The four slots run in order every tick and reshape the waves. Only the parameters the chosen effect reads are shown.
    </p>
    {inst.slots.map((slot, k) => {
      const def = JXS_EFFECT_TYPES.find((t) => t.type === slot.type);
      const set = (p: Partial<JxsSlot>): void => edit({ slots: { [k]: p } });
      return (
        <div key={k} className="flex flex-col gap-1 border border-dark-border rounded p-2 bg-dark-bgSecondary" data-testid={`jxs-slot-${k}`}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text-secondary w-14">Slot {k + 1}</span>
            <CustomSelect
              value={String(slot.type)}
              options={SLOT_OPTIONS}
              onChange={(v) => set({ type: parseInt(v, 10) })}
              title={def?.help}
            />
          </div>
          {def && (
            <>
              <div className="text-[9px] text-text-muted">{def.help}</div>
              {def.params.map((param) => <SlotParam key={param} slot={slot} param={param} set={set} />)}
              {def.stateful && (
                <Toggle
                  label="Clear Slot State On Every Note"
                  value={slot.reset !== 0}
                  onChange={(v) => set({ reset: v ? 1 : 0 })}
                  title="Restart the effect's running state at each note"
                />
              )}
            </>
          )}
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------------------------------------------
// Sample

const SAMPLE_W = 640;
const SAMPLE_H = 120;
type Marker = 'start' | 'loop' | 'end';

const SampleSection: React.FC<SectionProps & { sample: Int16Array | null }> = ({ inst, color, edit, sample }) => {
  const frames = sample?.length ?? 0;
  const [draft, setDraft] = useState<Record<Marker, number> | null>(null);
  const drag = useRef<Marker | null>(null);
  const pos = draft ?? { start: inst.start, loop: inst.loop, end: inst.end };
  const peaks = useMemo(() => {
    const out = new Array<number>(SAMPLE_W).fill(0);
    if (!sample || frames === 0) return out;
    for (let x = 0; x < SAMPLE_W; x++) {
      const a = Math.floor((x / SAMPLE_W) * frames);
      const b = Math.max(a + 1, Math.floor(((x + 1) / SAMPLE_W) * frames));
      let m = 0;
      for (let k = a; k < b && k < frames; k++) if (Math.abs(sample[k]) > Math.abs(m)) m = sample[k];
      out[x] = m >> 8;
    }
    return out;
  }, [sample, frames]);
  const xOf = (f: number): number => (frames ? (f / frames) * SAMPLE_W : 0);
  const at = (e: React.PointerEvent<HTMLDivElement>): number => {
    const r = e.currentTarget.getBoundingClientRect();
    return clamp(Math.round(((e.clientX - r.left) / (r.width || SAMPLE_W)) * frames), 0, frames);
  };
  const MARK_COLOR: Record<Marker, string> = { start: '#44aaff', loop: '#ffcc44', end: '#ff5555' };
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel label="Sample" color={color} />
      {!sample ? (
        <div className="text-[10px] text-text-muted">This instrument has no sample.</div>
      ) : (
        <>
          <div className="text-[10px] text-text-secondary">{frames} frames. Drag the start, loop and end markers.</div>
          <div
            className="relative touch-none cursor-col-resize"
            style={{ width: SAMPLE_W, height: SAMPLE_H }}
            data-testid="jxs-sample-view"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              const f = at(e);
              const names: Marker[] = ['start', 'loop', 'end'];
              drag.current = names.reduce((best, n) => (Math.abs(pos[n] - f) < Math.abs(pos[best] - f) ? n : best), 'start' as Marker);
              setDraft({ ...pos, [drag.current]: f });
            }}
            onPointerMove={(e) => {
              if (drag.current) setDraft({ ...pos, [drag.current]: at(e) });
            }}
            onPointerUp={() => {
              if (draft) edit({ start: draft.start, loop: draft.loop, end: draft.end });
              drag.current = null;
              setDraft(null);
            }}
          >
            <WaveformLineCanvas data={peaks} width={SAMPLE_W} height={SAMPLE_H} color={color} maxSamples={SAMPLE_W} />
            {(['start', 'loop', 'end'] as Marker[]).map((m) => (
              <div
                key={m}
                title={m}
                className="absolute top-0 bottom-0 w-px pointer-events-none"
                style={{ left: xOf(pos[m]), background: MARK_COLOR[m] }}
              />
            ))}
          </div>
          <div className="flex gap-4 flex-wrap">
            <NumBox label="Start" value={pos.start} min={0} max={frames} width="72px" onValueChange={(v) => edit({ start: v })} />
            <NumBox label="Loop" value={pos.loop} min={0} max={frames} width="72px" onValueChange={(v) => edit({ loop: v })} />
            <NumBox label="End" value={pos.end} min={0} max={frames} width="72px" onValueChange={(v) => edit({ end: v })} />
          </div>
        </>
      )}
      <div className="flex gap-4 flex-wrap items-center">
        <Toggle label="Loop" value={inst.loops !== 0} onChange={(v) => edit({ loops: v ? 1 : 0 })} color={color} />
        <Toggle label="Bidirectional" value={inst.bidi !== 0} onChange={(v) => edit({ bidi: v ? 1 : 0 })} color={color} />
        <NumBox
          label="Share Sample Of"
          value={inst.sharing}
          min={0}
          max={JXS_RANGES.sharing[1]}
          onValueChange={(v) => edit({ sharing: v })}
        />
      </div>
      <p className="text-[9px] text-text-muted">Sharing 0 plays this instrument's own sample; a number plays that instrument's sample.</p>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------------

export const JxsControls: React.FC<JxsControlsProps> = ({ instrumentId, onChange }) => {
  const module = useFormatStore((s) => s.jxsFileData);
  const { accent } = useInstrumentColors(BRAND);
  const [section, setSection] = useState(0);
  const bytes = useMemo(() => (module ? new Uint8Array(module) : null), [module]);
  const inst = useMemo(() => (bytes ? readJxsInstrument(bytes, instrumentId - 1) : null), [bytes, instrumentId]);
  const arp = useMemo(() => (bytes ? readJxsArpeggio(bytes) : null), [bytes]);
  const sample = useMemo(() => (bytes ? readJxsSample(bytes, instrumentId - 1) : null), [bytes, instrumentId]);

  // Callbacks read the latest handler from a ref so a knob drag never captures a stale one.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const idRef = useRef(instrumentId);
  idRef.current = instrumentId;
  const edit = useCallback((e: JxsEdit): void => {
    if (onChangeRef.current) onChangeRef.current(e);
    else void commitToSong(idRef.current, e);
  }, []);

  if (!inst || !arp) {
    return <div className="p-4 text-xs text-text-muted">No JayTrax module loaded for instrument {instrumentId}.</div>;
  }
  const hasSample = inst.version === 3457 && (sample !== null || inst.sampleFrames > 0 || inst.sharing > 0);
  const sections = hasSample ? SECTIONS : SECTIONS.slice(0, 5);
  const common = { inst, color: accent, edit };
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="jxs-controls">
      <SegmentButton labels={sections} value={Math.min(section, sections.length - 1)} onChange={setSection} />
      {section === 0 && <MainSection {...common} />}
      {section === 1 && <WavesSection {...common} />}
      {section === 2 && <EnvelopesSection {...common} />}
      {section === 3 && <ArpeggioSection {...common} arp={arp} />}
      {section === 4 && <EffectsSection {...common} />}
      {section === 5 && hasSample && <SampleSection {...common} sample={sample} />}
    </div>
  );
};
