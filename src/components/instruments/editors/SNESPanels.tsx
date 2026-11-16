/**
 * SNES (S-DSP) instrument panels for the Furnace editor.
 *
 * SNESPanel edits the instrument: envelope (ADSR or GAIN) with the level curve the DSP rate
 * table gives, and the sound source (sample or wavetable).
 * SNESEchoPanel edits the song-wide echo unit: it is one unit per chip, shared by every SNES
 * instrument, and lives in the Furnace chip flags (`useFormatStore.furnaceNative.chipFlags`).
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FurnaceConfig, FurnaceAmigaConfig, FurnaceSNESConfig } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { CustomSelect } from '@components/common/CustomSelect';
import { Button } from '@components/ui/Button';
import { useFormatStore } from '@stores';
import { FURNACE_NOTE_COUNT, furnaceNoteName, readNoteMapEntry, withNoteMapEntry } from '@/lib/furnace/noteMap';
import { FurnaceDispatchPlatform } from '@engine/furnace-dispatch/platforms';
import {
  SNES_AUDIO_RAM_BYTES,
  SNES_FIR_PRESETS,
  SNES_GAIN_MODE,
  readSnesChipFlags,
  snesAdsrCurve,
  snesEchoBufferBytes,
  snesEchoDelayMs,
  snesFirResponseDb,
  snesFirSum,
  snesGainCurve,
  snesGainMax,
  type EnvelopeCurve,
  type SnesChipFlags,
} from '@/lib/furnace/snesDsp';

type PanelProps = { config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void };

const SNES_DEFAULTS: Required<FurnaceSNESConfig> = { useEnv: true, gainMode: 0, gain: 127, a: 15, d: 7, s: 7, r: 0, d2: 0, sus: 0 };
const AMIGA_DEFAULTS: FurnaceAmigaConfig = { initSample: -1, useNoteMap: false, useSample: true, useWave: false, waveLen: 32, noteMap: [] };

const PANEL = 'bg-dark-bgSecondary border border-dark-border rounded p-3 mb-3';
const TITLE = 'text-[10px] font-mono font-bold text-text-secondary uppercase tracking-wider';
const LABEL = 'text-[10px] font-mono text-text-secondary';
const HINT = 'text-[10px] font-mono text-text-muted leading-snug';
const BADGE = 'text-[9px] font-mono text-text-secondary bg-dark-bgTertiary border border-dark-borderLight rounded px-1.5 py-0.5';
const GRAPH = 'w-full bg-dark-bg border border-dark-borderLight rounded';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'never ends';
  if (seconds < 0.001) return 'instant';
  return seconds < 1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
}

/** A line graph of points given in 0..1 on both axes (y 1 = top); colour comes from the text class. */
const LineGraph: React.FC<{
  points: Array<{ x: number; y: number }>;
  className: string;
  height: number;
  fill?: boolean;
  markerX?: number;
  baselineY?: number;
  label: string;
}> = ({ points, className, height, fill, markerX, baselineY, label }) => {
  const W = 400;
  const H = 100;
  const line = points.map((p) => `${(p.x * W).toFixed(1)},${(H - 2 - p.y * (H - 4)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={`${GRAPH} ${className}`} style={{ height }}>
      {baselineY !== undefined && (
        <line x1={0} x2={W} y1={H - 2 - baselineY * (H - 4)} y2={H - 2 - baselineY * (H - 4)} className="text-dark-borderLight" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {fill && points.length > 1 && <polygon points={`0,${H} ${line} ${W},${H}`} fill="currentColor" fillOpacity={0.12} />}
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {markerX !== undefined && (
        <line x1={markerX * W} x2={markerX * W} y1={0} y2={H} className="text-accent-warning" stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
};

const EnvelopeGraph: React.FC<{ curve: EnvelopeCurve }> = ({ curve }) => {
  const total = Math.max(curve.points[curve.points.length - 1]?.t ?? 0, 0.001);
  return (
    <LineGraph
      label="Volume over time: key pressed at the left, key released at the dashed line"
      className="text-accent-primary"
      height={96}
      fill
      points={curve.points.map((p) => ({ x: p.t / total, y: p.level }))}
      markerX={curve.keyOff !== undefined ? curve.keyOff / total : undefined}
    />
  );
};

const KEY_RELEASE_MODES: Array<{ value: string; label: string; help: string }> = [
  { value: '0', label: 'Cut on release', help: 'While the key is held, the sound fades at the Sustain Rate. Releasing the key cuts the sound in about 8 milliseconds.' },
  { value: '1', label: 'Fade out, straight line', help: 'While the key is held, the sound fades at the Decay 2 rate. Releasing the key fades the sound in a straight line at the Release rate.' },
  { value: '2', label: 'Fade out, fast then slow', help: 'While the key is held, the sound fades at the Decay 2 rate. Releasing the key fades the sound quickly at first and then slowly, at the Release rate.' },
  { value: '3', label: 'Change fade speed on release', help: 'While the key is held, the sound fades at the Decay 2 rate. Releasing the key only changes that fade to the Release rate, so a long tail keeps the natural curve of the chip.' },
];

const GAIN_MODES: Array<{ value: string; label: string; help: string }> = [
  { value: String(SNES_GAIN_MODE.DIRECT), label: 'Fixed level', help: 'The volume stays at the Gain value for the whole note.' },
  { value: String(SNES_GAIN_MODE.INC_LINEAR), label: 'Rise, straight line', help: 'The volume rises from silence in a straight line. Gain sets the speed.' },
  { value: String(SNES_GAIN_MODE.INC_INVLOG), label: 'Rise, bent line', help: 'The volume rises fast to three quarters and then slowly to full. Gain sets the speed.' },
  { value: String(SNES_GAIN_MODE.DEC_LINEAR), label: 'Fall, straight line', help: 'The volume falls in a straight line. Gain sets the speed.' },
  { value: String(SNES_GAIN_MODE.DEC_LOG), label: 'Fall, fast then slow', help: 'The volume falls quickly at first and then slowly. Gain sets the speed.' },
];

// ── Instrument panel ────────────────────────────────────────────────────────────

export const SNESPanel: React.FC<PanelProps> = ({ config, onChange }) => {
  // Knob callbacks read the newest config through the ref (docs/CONTROL_PATTERNS.md).
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const updateSNES = useCallback((updates: Partial<FurnaceSNESConfig>) => {
    onChange({ snes: { ...SNES_DEFAULTS, ...configRef.current.snes, ...updates } });
  }, [onChange]);
  const updateAmiga = useCallback((updates: Partial<FurnaceAmigaConfig>) => {
    onChange({ amiga: { ...AMIGA_DEFAULTS, ...configRef.current.amiga, ...updates } });
  }, [onChange]);

  const snes = { ...SNES_DEFAULTS, ...config.snes };
  const amiga = { ...AMIGA_DEFAULTS, ...config.amiga };
  const gainMode = typeof snes.gainMode === 'number' ? snes.gainMode : 0;
  const gainMax = snesGainMax(gainMode);
  const gain = Math.min(snes.gain, gainMax);
  const sus = snes.sus & 3;
  const curve = snes.useEnv
    ? snesAdsrCurve({ a: snes.a, d: snes.d, s: snes.s, r: snes.r, d2: snes.d2, sus })
    : snesGainCurve(gainMode, gain);
  const gainFalls = gainMode === SNES_GAIN_MODE.DEC_LINEAR || gainMode === SNES_GAIN_MODE.DEC_LOG;

  const samples = useFormatStore((s) => s.furnaceSamples);
  const sample = amiga.initSample >= 0 ? samples?.[amiga.initSample] : undefined;
  // Samples can be long: reduce to one peak per column once per sample.
  const samplePoints = useMemo(() => {
    const data = sample?.data;
    if (!data || data.length === 0) return [];
    const full = data instanceof Int16Array ? 32768 : 128;
    const offset = data instanceof Uint8Array ? 128 : 0;
    const columns = Math.min(200, data.length);
    const out: Array<{ x: number; y: number }> = [];
    for (let c = 0; c < columns; c++) {
      const from = Math.floor((c * data.length) / columns);
      const to = Math.max(from + 1, Math.floor(((c + 1) * data.length) / columns));
      let peak = data[from] - offset;
      for (let i = from; i < to; i++) if (Math.abs(data[i] - offset) > Math.abs(peak)) peak = data[i] - offset;
      out.push({ x: c / (columns - 1 || 1), y: 0.5 + peak / full / 2 });
    }
    return out;
  }, [sample]);
  const wave = config.wavetables?.[0];
  const wavePoints = wave
    ? wave.data.map((v, i) => ({ x: i / (wave.data.length - 1 || 1), y: v / (wave.max || 15) }))
    : [];

  const mappedNotes = (amiga.noteMap ?? []).filter((e, i) => readNoteMapEntry(e, i).map >= 0).length;
  const sampleOptions = [
    { value: '-1', label: 'No sample' },
    ...(samples ?? []).map((s, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')} ${s.name || 'unnamed'}` })),
  ];

  return (
    <>
      <div className={PANEL}>
        <div className="flex items-center justify-between mb-2">
          <h3 className={TITLE}>SNES Envelope</h3>
          <div className="flex items-center gap-2" title="ADSR shapes each note with attack, decay, sustain and release. Gain holds or ramps one level and is simpler.">
            <span className={LABEL}>{snes.useEnv ? 'ADSR envelope' : 'Gain'}</span>
            <Toggle label="Use ADSR" value={snes.useEnv} onChange={(v) => updateSNES({ useEnv: v })} size="sm" />
          </div>
        </div>

        <EnvelopeGraph curve={curve} />

        {snes.useEnv ? (
          <>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className={BADGE}>Attack {formatTime(curve.attackTime)}</span>
              <span className={BADGE}>Decay {formatTime(curve.decayTime)}</span>
              <span className={BADGE}>Sustain level {Math.round(((snes.s + 1) / 8) * 100)} %</span>
              <span className={BADGE}>After key release {formatTime(curve.releaseTime)}</span>
            </div>
            <div className="flex flex-wrap items-start gap-4 mt-3">
              <Knob label="Attack" value={snes.a} min={0} max={15} step={1} defaultValue={15} size="md" tone="primary"
                title="How fast the note reaches full volume. 15 is instant, 0 takes about 4 seconds."
                onChange={(v) => updateSNES({ a: Math.round(v) })} />
              <Knob label="Decay" value={snes.d} min={0} max={7} step={1} defaultValue={7} size="md" tone="primary"
                title="How fast the volume falls from full to the sustain level. Higher is faster."
                onChange={(v) => updateSNES({ d: Math.round(v) })} />
              <Knob label="Sustain" value={snes.s} min={0} max={7} step={1} defaultValue={7} size="md" tone="primary"
                title="The level where the decay stops, in eighths of full volume. 7 is full volume."
                onChange={(v) => updateSNES({ s: Math.round(v) })} />
              {sus !== 0 && (
                <Knob label="Decay 2" value={snes.d2} min={0} max={31} step={1} defaultValue={0} size="md" tone="secondary"
                  title="How fast the sound fades while the key stays held. 0 holds the sustain level forever."
                  onChange={(v) => updateSNES({ d2: Math.round(v) })} />
              )}
              <Knob label={sus === 0 ? 'Sustain Rate' : 'Release'} value={snes.r} min={0} max={31} step={1} defaultValue={0} size="md" tone="secondary"
                title={sus === 0
                  ? 'How fast the sound fades while the key stays held. 0 holds the sustain level forever.'
                  : 'How fast the sound fades after the key is released. 0 never fades; 31 is fastest.'}
                onChange={(v) => updateSNES({ r: Math.round(v) })} />
              <div className="flex-1 min-w-[220px]">
                <div className={`${LABEL} mb-1`}>When the key is released</div>
                <CustomSelect
                  value={String(sus)}
                  onChange={(v) => updateSNES({ sus: Number(v) })}
                  options={KEY_RELEASE_MODES.map(({ value, label }) => ({ value, label }))}
                  title="What the envelope does when the note ends"
                />
                <p className={`${HINT} mt-1`}>{KEY_RELEASE_MODES[sus].help}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-start gap-4 mt-3">
            <Knob label={gainMode === SNES_GAIN_MODE.DIRECT ? 'Gain' : 'Speed'} value={gain} min={0} max={gainMax} step={1} defaultValue={gainMax} size="md" tone="primary"
              title={gainMode === SNES_GAIN_MODE.DIRECT ? 'The fixed volume of the note, 0 to 127.' : 'How fast the volume moves, 0 (stopped) to 31 (fastest).'}
              onChange={(v) => updateSNES({ gain: Math.round(v) })} />
            <div className="flex-1 min-w-[220px]">
              <div className={`${LABEL} mb-1`}>Gain shape</div>
              <CustomSelect
                value={String(gainMode)}
                onChange={(v) => {
                  const mode = Number(v);
                  updateSNES({ gainMode: mode, gain: Math.min(configRef.current.snes?.gain ?? 127, snesGainMax(mode)) });
                }}
                options={GAIN_MODES.map(({ value, label }) => ({ value, label }))}
                title="How the volume moves during the note"
              />
              <p className={`${HINT} mt-1`}>{GAIN_MODES.find((m) => m.value === String(gainMode))?.help}</p>
              {gainFalls && (
                <p className="text-[10px] font-mono text-accent-warning leading-snug mt-1">
                  A falling gain starts from the level the voice already has. A new note starts silent, so this shape alone gives no sound. Use the Gain macro to start loud and then fall.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={PANEL}>
        <div className="flex items-center justify-between mb-2">
          <h3 className={TITLE}>Sound Source</h3>
          <div className="flex items-center gap-2" title="A sample is a recording. A wavetable is one short drawn wave cycle that the Waveform macro can swap while the note plays.">
            <span className={LABEL}>{amiga.useWave ? 'Wavetable' : 'Sample'}</span>
            <Toggle label="Use Wavetable" value={amiga.useWave} onChange={(v) => updateAmiga({ useWave: v, useSample: !v })} size="sm" />
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          {amiga.useWave ? (
            <>
              <Knob label="Wave Length" value={amiga.waveLen + 1} min={1} max={256} step={1} defaultValue={32} size="md" tone="highlight"
                title="How many points of the wavetable make one cycle. Longer waves sound lower and smoother."
                onChange={(v) => updateAmiga({ waveLen: Math.round(v) - 1 })} />
              <div className="flex-1 min-w-[220px]">
                <div className={`${LABEL} mb-1`}>First wavetable of this instrument</div>
                {wavePoints.length > 0
                  ? <LineGraph label="Wavetable shape" className="text-accent-highlight" height={56} points={wavePoints} />
                  : <p className={HINT}>This instrument has no wavetable yet. Add one in the wavetable list below.</p>}
              </div>
            </>
          ) : (
            <div className="flex-1 min-w-[220px]">
              <div className={`${LABEL} mb-1`}>Sample</div>
              <CustomSelect
                value={String(amiga.initSample)}
                onChange={(v) => updateAmiga({ initSample: Number(v) })}
                options={sampleOptions}
                title="The recording this instrument plays"
              />
              {samplePoints.length > 0 && sample && (
                <div className="mt-2">
                  <LineGraph label="Sample waveform" className="text-accent-highlight" height={56} points={samplePoints} baselineY={0.5} />
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className={BADGE}>{sample.data.length} samples</span>
                    <span className={BADGE}>{sample.rate} Hz</span>
                    <span className={BADGE}>{sample.loopEnd > sample.loopStart ? `Loop ${sample.loopStart} to ${sample.loopEnd}` : 'No loop'}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2" title="A note map plays a different sample for each note, for example a drum kit on one instrument.">
                <Toggle label="Use Note Map" value={amiga.useNoteMap} onChange={(v) => updateAmiga({ useNoteMap: v })} size="sm" />
                <span className={LABEL}>Note map{amiga.useNoteMap ? `: ${mappedNotes} of ${FURNACE_NOTE_COUNT} notes have a sample` : ''}</span>
              </div>
              {amiga.useNoteMap && (
                <SNESNoteMap
                  noteMap={amiga.noteMap}
                  sampleOptions={sampleOptions}
                  onEntry={(index, patch) => updateAmiga({ noteMap: withNoteMapEntry(configRef.current.amiga?.noteMap, index, patch) })}
                />
              )}
            </div>
          )}
        </div>
        <p className={`${HINT} mt-2`}>
          Noise: the SNES has one noise generator for all 8 channels. Turn it on for this instrument with the first step value 1 of the Special macro, and set its pitch with the Noise Frequency macro.
        </p>
      </div>
    </>
  );
};

// ── Note map table ──────────────────────────────────────────────────────────────

const NOTE_ROW_HEIGHT = 26;
const NOTE_VIEW_ROWS = 10;

/** 180 rows, only the visible ones rendered. Each row: note played, sample, note the sample sounds at. */
const SNESNoteMap: React.FC<{
  noteMap: FurnaceAmigaConfig['noteMap'];
  sampleOptions: Array<{ value: string; label: string }>;
  onEntry: (index: number, patch: { freq?: number; map?: number }) => void;
}> = ({ noteMap, sampleOptions, onEntry }) => {
  const [top, setTop] = React.useState(0);
  const first = Math.max(0, Math.floor(top / NOTE_ROW_HEIGHT) - 2);
  const last = Math.min(FURNACE_NOTE_COUNT, first + NOTE_VIEW_ROWS + 4);
  const rows = [];
  for (let i = first; i < last; i++) {
    const e = readNoteMapEntry(noteMap[i], i);
    rows.push(
      <div key={i} className="absolute left-0 right-0 flex items-center gap-2 px-1" style={{ top: i * NOTE_ROW_HEIGHT, height: NOTE_ROW_HEIGHT }}>
        <span className="w-10 text-[10px] font-mono text-text-primary">{furnaceNoteName(i)}</span>
        <div className="flex-1 min-w-0">
          <CustomSelect value={String(e.map)} onChange={(v) => onEntry(i, { map: Number(v) })} options={sampleOptions} title={`Sample played for ${furnaceNoteName(i)}`} />
        </div>
        <input
          type="number" min={0} max={FURNACE_NOTE_COUNT - 1} value={e.freq}
          onChange={(ev) => onEntry(i, { freq: Math.max(0, Math.min(FURNACE_NOTE_COUNT - 1, Math.round(Number(ev.target.value) || 0))) })}
          aria-label={`Sounding note number for ${furnaceNoteName(i)}`}
          title="The note the sample is played at. It starts as the same note, so the sample is not shifted."
          className="w-14 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-[10px] px-1 focus:ring-1 focus:ring-accent-primary"
        />
        <span className="w-10 text-[10px] font-mono text-text-secondary">{furnaceNoteName(e.freq)}</span>
      </div>,
    );
  }
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 px-1 text-[9px] font-mono text-text-muted">
        <span className="w-10">Note</span><span className="flex-1">Sample</span><span className="w-14">Plays at</span><span className="w-10" />
      </div>
      <div
        className="relative overflow-y-auto bg-dark-bg border border-dark-borderLight rounded"
        style={{ height: NOTE_ROW_HEIGHT * NOTE_VIEW_ROWS }}
        onScroll={(ev) => setTop(ev.currentTarget.scrollTop)}
        data-testid="snes-note-map"
      >
        <div className="relative" style={{ height: NOTE_ROW_HEIGHT * FURNACE_NOTE_COUNT }}>{rows}</div>
      </div>
    </div>
  );
};

// ── Song echo panel ─────────────────────────────────────────────────────────────

export const SNESEchoPanel: React.FC = () => {
  const chipIds = useFormatStore((s) => s.furnaceNative?.chipIds);
  const chipIndex = chipIds ? chipIds.indexOf(FurnaceDispatchPlatform.SNES) : -1;
  const flagsStr = useFormatStore((s) => (chipIndex >= 0 ? s.furnaceNative?.chipFlags?.[chipIndex] : undefined));
  const setSnesChipFlags = useFormatStore((s) => s.setSnesChipFlags);

  const flags = readSnesChipFlags(flagsStr);
  const flagsRef = useRef(flags);
  useEffect(() => { flagsRef.current = flags; });

  const update = useCallback((updates: Partial<SnesChipFlags>) => {
    setSnesChipFlags(chipIndex, updates);
  }, [setSnesChipFlags, chipIndex]);
  const setTap = useCallback((tap: number, value: number) => {
    const echoFilter = [...flagsRef.current.echoFilter];
    echoFilter[tap] = Math.round(value);
    update({ echoFilter });
  }, [update]);

  if (chipIndex < 0) {
    return (
      <div className={PANEL}>
        <h3 className={TITLE}>Song Echo</h3>
        <p className={`${HINT} mt-2`}>
          The echo belongs to the song, not to one instrument. This song is not a Furnace SNES song, so it has no place to store echo settings.
        </p>
      </div>
    );
  }

  const bufferBytes = snesEchoBufferBytes(flags.echoDelay);
  const fir = snesFirSum(flags.echoFilter);
  const response = snesFirResponseDb(flags.echoFilter, 64);
  const DB_TOP = 12;
  const DB_BOTTOM = -48;
  const dbToY = (db: number) => (Math.max(DB_BOTTOM, Math.min(DB_TOP, db)) - DB_BOTTOM) / (DB_TOP - DB_BOTTOM);

  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className={TITLE}>Song Echo</h3>
          <p className={HINT}>One echo unit for the whole song, shared by all SNES instruments.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={LABEL}>{flags.echo ? 'Echo on' : 'Echo off'}</span>
          <Toggle label="Echo" value={flags.echo} onChange={(v) => update({ echo: v })} size="sm" />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Knob label="Delay" value={flags.echoDelay} min={0} max={15} step={1} defaultValue={0} size="md" tone="primary"
          formatValue={(v) => `${snesEchoDelayMs(Math.round(v))} ms`}
          title="Time between repeats, in steps of 16 milliseconds. Each step uses 2048 bytes of sound memory."
          onChange={(v) => update({ echoDelay: Math.round(v) })} />
        <Knob label="Feedback" value={flags.echoFeedback} min={-128} max={127} step={1} defaultValue={0} bipolar size="md" tone="primary"
          title="How much of each repeat goes back into the echo. Higher gives more repeats. Negative values flip the wave on each repeat."
          onChange={(v) => update({ echoFeedback: Math.round(v) })} />
        <Knob label="Echo Left" value={flags.echoVolL} min={-128} max={127} step={1} defaultValue={127} bipolar size="md" tone="secondary"
          title="Echo loudness on the left. Negative flips the wave, which makes the echo sound wide."
          onChange={(v) => update({ echoVolL: Math.round(v) })} />
        <Knob label="Echo Right" value={flags.echoVolR} min={-128} max={127} step={1} defaultValue={127} bipolar size="md" tone="secondary"
          title="Echo loudness on the right. Negative flips the wave, which makes the echo sound wide."
          onChange={(v) => update({ echoVolR: Math.round(v) })} />
        <Knob label="Dry Left" value={flags.dryVolL} min={0} max={127} step={1} defaultValue={127} size="md" tone="neutral"
          title="Loudness of the sound without echo, on the left."
          onChange={(v) => update({ dryVolL: Math.round(v) })} />
        <Knob label="Dry Right" value={flags.dryVolR} min={0} max={127} step={1} defaultValue={127} size="md" tone="neutral"
          title="Loudness of the sound without echo, on the right."
          onChange={(v) => update({ dryVolR: Math.round(v) })} />
      </div>

      <div className="mt-3" title="The echo buffer takes memory away from samples. The SNES has 65536 bytes for the sound driver, samples and echo together.">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Echo buffer: {bufferBytes} of {SNES_AUDIO_RAM_BYTES} bytes of sound memory</span>
          <span className={BADGE}>{Math.round((bufferBytes / SNES_AUDIO_RAM_BYTES) * 100)} %</span>
        </div>
        <div className="h-1.5 mt-1 bg-dark-bgTertiary border border-dark-borderLight rounded overflow-hidden">
          <div className="h-full bg-accent-primary" style={{ width: `${(bufferBytes / SNES_AUDIO_RAM_BYTES) * 100}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-4 mb-2">
        <div>
          <h3 className={TITLE}>Echo Filter</h3>
          <p className={HINT}>Shapes the tone of every repeat. Eight taps; the graph shows which pitches pass.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {SNES_FIR_PRESETS.map((preset) => (
            <Button key={preset.name} variant="default" size="sm" onClick={() => update({ echoFilter: [...preset.taps] })}>
              {preset.name}
            </Button>
          ))}
        </div>
      </div>

      <LineGraph
        label="Echo filter frequency response from 0 to 16 kilohertz"
        className={fir.overflow ? 'text-accent-warning' : 'text-accent-highlight'}
        height={88}
        points={response.map((db, i) => ({ x: i / (response.length - 1), y: dbToY(db) }))}
        baselineY={dbToY(0)}
      />
      <div className="flex items-center justify-between mt-1">
        <span className={HINT}>0 Hz</span>
        <span className={HINT}>Line = unchanged loudness (0 dB)</span>
        <span className={HINT}>16 kHz</span>
      </div>

      <div className="flex flex-wrap items-start gap-3 mt-3">
        {flags.echoFilter.map((tap, i) => (
          <Knob key={i} label={`Tap ${i + 1}`} value={tap} min={-128} max={127} step={1} defaultValue={i === 0 ? 127 : 0} bipolar size="sm" tone="highlight"
            title={`Filter tap ${i + 1} of 8: the weight of the echo sample ${i} steps back. Tap 1 at 127 and the rest at 0 leaves the echo unfiltered.`}
            onChange={(v) => setTap(i, v)} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <span className={BADGE}>Tap sum {fir.sum}</span>
        {fir.overflow && (
          <span className="text-[10px] font-mono text-accent-warning leading-snug">
            The taps add up outside -128 to 127. The echo can overflow and crackle on real hardware. Lower the taps or the feedback.
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className={`${LABEL} mb-1`} title="Which of the 8 channels send sound into the echo when the song starts. Effect 12xx changes it per channel during the song.">
          Channels with echo at song start
        </div>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 8 }, (_, ch) => (
            <div key={ch} className="flex items-center gap-1">
              <span className={LABEL}>{ch + 1}</span>
              <Toggle label={`Channel ${ch + 1}`} value={((flags.echoMask >> ch) & 1) === 1} size="sm"
                onChange={(v) => update({ echoMask: v ? flagsRef.current.echoMask | (1 << ch) : flagsRef.current.echoMask & ~(1 << ch) })} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-6 mt-4">
        <div className="flex items-center gap-2" title="The SNES smooths samples between points. Off gives a harsher, more aliased sound. Applies when the song next starts.">
          <Toggle label="Smooth Samples" value={!flags.interpolationOff} onChange={(v) => update({ interpolationOff: !v })} size="sm" />
          <span className={LABEL}>Smooth samples (Gaussian interpolation)</span>
        </div>
        <div className="flex items-center gap-2" title="Removes the click when a note restarts. Real hardware does not do this. Applies when the song next starts.">
          <Toggle label="Anti-Click" value={flags.antiClick} onChange={(v) => update({ antiClick: v })} size="sm" />
          <span className={LABEL}>Anti-click (not on real hardware)</span>
        </div>
      </div>
    </div>
  );
};
