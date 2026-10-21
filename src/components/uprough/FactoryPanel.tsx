/**
 * The synth factory (R2f): a live show of a softsynth song being built. It reads the factory event store, which every
 * R2 event source feeds through `factoryOnEvent`; nothing here pretends work, every visual is set by an event.
 * Act 1 (the drum bank) is paced for the eye from the voices' real stage buffers; acts 2 and 3 show events as they land.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { useFactoryStore } from '@/lib/uprough/factory/useFactoryStore';
import { actOneSchedule, stageAtTime, type VoiceTimeline } from '@/lib/uprough/factory/pacing';
import { popIn, prefersReducedMotion, stampBounce } from '@/lib/uprough/factory/motion';
import { drawConveyor, drawEnvelope, drawEyes, drawGear, drawWave, readTokens, type FactoryColors } from '@/lib/uprough/factory/draw';
import { playCue, type Cue } from '@/lib/uprough/factory/factorySfx';
import { hasLocalPreview, playVoice } from '@/lib/uprough/factory/voiceAudition';
import { Button } from '@components/ui/Button';
import { spoken, STEM_LANES, type FactoryState, type SlotView, type VoiceView } from '@/lib/uprough/factory/factoryModel';
import type { Peaks } from '@/engine/uprough/r2Peaks';

export interface FactoryPanelProps {
  /** Called by the Replay button; omit to hide it. */
  onReplay?: () => void;
  className?: string;
}

/** Seconds since the act-1 start, ticking while events arrive or the act-1 timeline (`until` seconds) still plays. */
function useClock(done: boolean, startedAt: number, until: number, eventCount: number): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    let raf = 0;
    const loop = (): void => {
      const t = (performance.now() - startedAt) / 1000;
      setNow(t);
      if (!done || t < until + 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [startedAt, done, until, eventCount]);
  return now;
}

function Wave(props: { a?: Peaks; b?: Peaks; frac?: number; reveal?: number; height?: number; final?: boolean; env?: { values: number[]; n: number }; envLabel?: string; eyes?: number }): React.ReactElement {
  const { a, b, frac = 0, reveal = 1, height = 56, final = false, env, envLabel, eyes } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const c: FactoryColors = readTokens(cv);
    drawWave(ctx, cv.width, cv.height, a, b, frac, final ? c.final : c.wave, c.line, reveal);
    if (env) drawEnvelope(ctx, cv.width, cv.height, env, envLabel ?? '', c);
    if (eyes !== undefined) drawEyes(ctx, cv.width - 22, 10, eyes, 0, c);
  });
  return <canvas ref={ref} width={240} height={height} className="w-full" style={{ height }} />;
}

export const NO_PREVIEW = 'No local preview for this style';

/** A finished one-shot: a native button, so the keyboard reaches it. Click plays the kept local audio (R2f-61). */
function Chip(props: { voice: string; label: string; peaks: Peaks; accent?: boolean; alpha: number; scale: number; preview: boolean }): React.ReactElement {
  const { voice, label, preview } = props;
  return (
    <Button
      variant="ghost" size="sm" aria-label={`Play ${label}`} aria-disabled={!preview} title={preview ? `Play ${label}` : NO_PREVIEW}
      onClick={() => { if (preview) playVoice(voice); }}
      className={`flex-col !px-1 !py-0.5 text-xs bg-dark-bgTertiary text-text-secondary border ${props.accent ? 'border-accent-secondary' : 'border-dark-border'} ${preview ? '' : 'cursor-not-allowed'}`}
      style={{ opacity: preview ? props.alpha : 0.6, transform: `scale(${props.scale})` }}
    >
      <Wave a={props.peaks} height={18} />
      {label}
    </Button>
  );
}

function voiceTimelines(state: FactoryState): Map<string, VoiceTimeline> {
  const voices = state.voiceOrder.map((v) => {
    const view = state.slots.flatMap((s) => s.voices).find((x) => x.voice === v);
    return view?.bank ? { voice: v, stageCount: view.stages.length, bank: view.bank } : undefined;
  }).filter((x): x is { voice: string; stageCount: number; bank: Peaks } => x !== undefined);
  return new Map(actOneSchedule(voices, state.rate).map((l) => [l.voice, l]));
}

function SlotCard(props: { slot: SlotView; lines: Map<string, VoiceTimeline>; t: number; reduced: boolean; timeSec: number; preview: boolean }): React.ReactElement {
  const { slot, lines, t, reduced, timeSec, preview } = props;
  const voice: VoiceView | undefined = slot.voices.find((v) => {
    const line = lines.get(v.voice);
    return !line || t >= line.start;
  }) ?? slot.voices[0];
  const line = voice ? lines.get(voice.voice) : undefined;
  const shown = line ? stageAtTime(line, t) : { index: voice ? voice.stages.length - 1 : -1, frac: 1 };
  const stages = voice?.stages ?? [];
  const cur = stages[Math.max(0, shown.index)];
  const next = stages[shown.index + 1];
  const stamped = !!voice?.bank && (!line || t >= line.stampAt);
  const bounce = line && stamped ? stampBounce(t - line.stampAt, reduced) : 0;
  const lit = slot.alive && (!line || t >= line.start || !!slot.born);
  const chip = line ? popIn(t - line.chipAt, reduced) : { scale: 1, alpha: 1 };
  return (
    <div
      data-testid={`factory-slot-${slot.id}`}
      className="rounded p-2 flex flex-col gap-1"
      style={{
        background: 'var(--color-bg-secondary)', borderRadius: 6,
        border: `1px ${lit ? 'solid' : 'dashed'} var(${lit ? '--color-accent' : '--color-border'})`, opacity: lit ? 1 : 0.55,
      }}
    >
      <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{slot.label}</div>
      {slot.born ? (
        <Wave a={slot.born} eyes={timeSec} final />
      ) : (
        <Wave a={stamped ? voice?.bank : cur?.peaks} b={stamped ? undefined : next?.peaks} frac={shown.frac} final={stamped} eyes={timeSec}
          env={cur?.env} envLabel={cur ? spoken(cur.stage) : ''} />
      )}
      <div className="text-xs" style={{ color: 'var(--color-text-muted)', transform: `translateY(${bounce * 4}px)` }}>
        {stamped && voice ? `Stamped ${spoken(voice.voice)}` : cur ? spoken(cur.stage) : slot.born ? 'First bar rendered with the song' : 'Empty'}
      </div>
      <div className="flex flex-wrap gap-1">
        {stamped && voice?.bank && slot.voices.filter((v) => v.bank).map((v) => (
          <Chip key={v.voice} voice={v.voice} label={spoken(v.voice)} peaks={v.bank!} alpha={chip.alpha} scale={chip.scale} preview={preview} />
        ))}
        {slot.attachments.map((a) => <Chip key={a.voice} voice={a.voice} label={spoken(a.voice)} peaks={a.peaks} accent alpha={1} scale={1} preview={preview} />)}
        {slot.hatVariants.map((h) => <Chip key={h.name} voice={h.name} label={spoken(h.name)} peaks={h.peaks} alpha={1} scale={1} preview={preview} />)}
      </div>
    </div>
  );
}

function Machinery(props: { timeSec: number; busy: boolean }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const c = readTokens(cv);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const spin = props.busy ? props.timeSec : 0;
    drawGear(ctx, 16, 18, 11, 8, spin * 2, c.dim);
    drawGear(ctx, 36, 24, 8, 6, -spin * 2.6, c.line);
    drawConveyor(ctx, cv.width, 34, props.busy ? props.timeSec * 30 : 0, c.dim);
  });
  return <canvas ref={ref} width={240} height={40} className="w-full" style={{ height: 40 }} />;
}

export const FactoryPanel: React.FC<FactoryPanelProps> = ({ onReplay, className }) => {
  const state = useFactoryStore((s) => s.state);
  const startedAt = useFactoryStore((s) => s.startedAt);
  const [sound, setSound] = useState(false);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const lines = useMemo(() => voiceTimelines(state), [state]);
  const until = useMemo(() => Math.max(0, ...[...lines.values()].map((l) => l.chipAt)), [lines]);
  const t = useClock(state.done, startedAt, until, state.eventCount);
  const active = state.eventCount > 0 && !state.done;

  // Cues: act 1 on timeline crossings, the other acts on the event that arrived.
  const cued = useRef(new Set<string>());
  useEffect(() => { cued.current.clear(); }, [startedAt]);
  useEffect(() => {
    if (!sound) return;
    const once = (key: string, cue: Cue): void => { if (!cued.current.has(key)) { cued.current.add(key); playCue(cue); } };
    lines.forEach((l, v) => {
      if (t >= l.stampAt) once(`${v}:stamp`, 'stamp');
      l.stageAt.forEach((at, j) => { if (t >= at) once(`${v}:s${j}`, 'stage'); });
    });
  }, [t, lines, sound]);
  useEffect(() => {
    if (!sound) return;
    const cue: Partial<Record<NonNullable<FactoryState['lastType']>, Cue>> = {
      attach: 'attach', decide: 'gear', section: 'conveyor', texture: 'stamp', master: 'stamp', join: 'stamp', done: 'finish',
    };
    const c = state.lastType ? cue[state.lastType] : undefined;
    if (c) playCue(c);
  }, [state.eventCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Audition: each voice plays once when its slot presents it (the stamp), the snare variants right after the snare.
  // Independent of the sound toggle; the cues above sit 10 dB under these. Bass and melody have no one-shot.
  const preview = hasLocalPreview(state.style);
  const played = useRef(new Set<string>());
  useEffect(() => { played.current.clear(); }, [startedAt]);
  useEffect(() => {
    if (!preview) return;
    const once = (v: string): void => { if (!played.current.has(v)) { played.current.add(v); playVoice(v); } };
    lines.forEach((l, v) => {
      if (t < l.stampAt) return;
      once(v);
      if (v === 'snare') state.slots.find((s) => s.id === 'snare')?.attachments.forEach((a) => once(a.voice));
    });
  }, [t, lines, preview, state.slots]);

  const timeSec = performance.now() / 1000;
  return (
    <div className={className} data-testid="factory-panel" style={{ color: 'var(--color-text)' }}>
      <div className="flex items-center justify-between mb-2">
        <div role="status" aria-live="polite" data-testid="factory-status" className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {state.caption}
        </div>
        <div className="flex gap-1">
          {onReplay && (
            <button type="button" onClick={onReplay} className="px-2 py-1 rounded text-xs flex items-center gap-1" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
              <RotateCcw size={12} /> Replay scripted run
            </button>
          )}
          <button
            type="button" aria-pressed={sound} onClick={() => setSound((v) => !v)}
            className="px-2 py-1 rounded text-xs flex items-center gap-1" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
          >
            {sound ? <Volume2 size={12} /> : <VolumeX size={12} />} Factory sounds {sound ? 'on' : 'off'}
          </button>
        </div>
      </div>
      {!preview && state.eventCount > 0 && (
        <div data-testid="factory-no-preview" className="text-xs text-text-muted mb-1">{NO_PREVIEW}</div>
      )}
      <Machinery timeSec={timeSec} busy={active} />
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {state.slots.map((slot) => <SlotCard key={slot.id} slot={slot} lines={lines} t={t} reduced={reduced} timeSec={timeSec} preview={preview} />)}
      </div>
      {state.sections.length > 0 && (
        <div className="mt-3" data-testid="factory-sections">
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Sections</div>
          <div className="flex flex-wrap gap-2">
            {state.sections.map((sec) => {
              const decidedBars = Math.max(0, ...Object.values(sec.decided));
              return (
                <div key={sec.index} data-testid={`factory-section-${sec.index}`} className="rounded p-2 text-xs"
                  style={{ background: 'var(--color-bg-secondary)', border: `1px solid var(${sec.lit ? '--color-accent' : '--color-border'})`, minWidth: 120 }}>
                  <div style={{ color: 'var(--color-text)' }}>{sec.name}</div>
                  <div style={{ color: 'var(--color-text-muted)' }}>{decidedBars} of {sec.bars} bars decided</div>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {STEM_LANES.map((lane) => sec.stems[lane] && <Wave key={lane} a={sec.stems[lane]} height={14} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {(state.press.join || state.press.texture || state.press.master) && (
        <div className="mt-3" data-testid="factory-press">
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Record press</div>
          <div className="grid grid-cols-3 gap-2">
            {(['join', 'texture', 'master'] as const).map((k) => (
              <div key={k}>
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{k === 'join' ? 'Joined' : k === 'texture' ? 'Texture' : 'Master'}</div>
                {state.press[k] ? <Wave a={state.press[k]} height={36} final={k === 'master'} /> : <div style={{ height: 36, border: '1px dashed var(--color-border)', borderRadius: 6 }} />}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }} data-testid="factory-cells">
        {state.cellsWritten > 0 ? `${state.cellsWritten} pattern cells written` : ''}
      </div>
    </div>
  );
};
