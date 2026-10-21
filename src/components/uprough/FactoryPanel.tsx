/**
 * The synth factory (R2f): a live show of a softsynth song being built. It reads the factory event store, which every
 * R2 event source feeds through `factoryOnEvent`; nothing here pretends work, every visual is set by an event.
 * Act 1 (the drum bank) is paced for the eye from the voices' real stage buffers; acts 2 and 3 show events as they land.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { useFactoryStore } from '@/lib/uprough/factory/useFactoryStore';
import { actOneSchedule, stageAtTime, type VoiceTimeline } from '@/lib/uprough/factory/pacing';
import { bandBusy, CONVEYOR_SPEED, chipPosition, growHeights, popIn, prefersReducedMotion, SETTLE, Spring, stampBounce } from '@/lib/uprough/factory/motion';
import { drawConveyor, drawEnvelope, drawEyes, drawGear, drawWave, fitCanvas, readTokens, type FactoryColors } from '@/lib/uprough/factory/draw';
import { playCue, type Cue } from '@/lib/uprough/factory/factorySfx';
import { hasLocalPreview, playVoice } from '@/lib/uprough/factory/voiceAudition';
import { Button } from '@components/ui/Button';
import { useUpRoughRenderStore } from '@stores/useUpRoughRenderStore';
import { onUpRoughPreviewState, setListenWhileBuilding, upRoughPreviewState } from '@/lib/uprough/upRoughSongPlayer';
import { SLOT_OF_VOICE, spoken, STEM_LANES, type FactoryState, type SectionView, type SlotView, type VoiceView } from '@/lib/uprough/factory/factoryModel';
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

/** Re-renders when the canvas's displayed width changes, so its draw effect refits the backing store to the new width. */
function useRedrawOnResize(ref: React.RefObject<HTMLCanvasElement | null>): void {
  const [, setWidth] = useState(0);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(cv.clientWidth));
    ro.observe(cv);
    return () => ro.disconnect();
  }, [ref]);
}

function Wave(props: { a?: Peaks; b?: Peaks; frac?: number; reveal?: number; reference?: number; height?: number; final?: boolean; env?: { values: number[]; n: number }; envLabel?: string; eyes?: number }): React.ReactElement {
  const { a, b, frac = 0, reveal = 1, reference, height = 56, final = false, env, envLabel, eyes } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const c: FactoryColors = readTokens(cv);
    const { w, h } = fitCanvas(cv, ctx, height, 240);
    drawWave(ctx, w, h, a, b, frac, final ? c.final : c.wave, c.line, reveal, reference);
    if (env) drawEnvelope(ctx, w, h, env, envLabel ?? '', c);
    if (eyes !== undefined) drawEyes(ctx, w - 22, 10, eyes, 0, c);
  });
  useRedrawOnResize(ref);
  return <canvas ref={ref} width={240} height={height} className="w-full block" style={{ height }} />;
}

export const PREVIEW_CAPTION = 'Preview before mastering';

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

function SlotCard(props: { register: (id: string, el: HTMLDivElement | null) => void; slot: SlotView; lines: Map<string, VoiceTimeline>; t: number; reduced: boolean; timeSec: number; preview: boolean }): React.ReactElement {
  const { slot, lines, t, reduced, timeSec, preview, register } = props;
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
      data-testid={`factory-slot-${slot.id}`} ref={(el) => register(slot.id, el)}
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

/** A section chip on the conveyor: born when its real `section` event was first seen. */
export interface RidingChip { id: number; label: string; bornAtSec: number }

function Machinery(props: { timeSec: number; busy: boolean; bandBusy: boolean; chips: readonly RidingChip[] }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const c = readTokens(cv);
    const { w, h } = fitCanvas(cv, ctx, 40, 240);
    ctx.clearRect(0, 0, w, h);
    const spin = props.busy ? props.timeSec : 0;
    drawGear(ctx, 16, 18, 11, 8, spin * 2, c.dim);
    drawGear(ctx, 36, 24, 8, 6, -spin * 2.6, c.line);
    const riding = props.chips.map((k) => ({ k, x: chipPosition(k.bornAtSec, props.timeSec, w, CONVEYOR_SPEED) }))
      .filter(({ k }) => (props.timeSec - k.bornAtSec) * CONVEYOR_SPEED < w)
      .map(({ k, x }) => ({ x, label: k.label }));
    drawConveyor(ctx, w, 34, props.bandBusy ? props.timeSec * 30 : 0, c.dim, riding, c.plate, c.text);
  });
  useRedrawOnResize(ref);
  return <canvas ref={ref} width={240} height={40} className="w-full block" style={{ height: 40 }} />;
}

/** Tooltip and aria-label of a host-only strip cell (the plan's wording). */
const chopsLabel = (bar: number, c: NonNullable<SectionView['chops'][number]>): string =>
  c.kind === 'break' ? `Bar ${bar + 1}: 1 break loop` : `Bar ${bar + 1}: ${c.triggers} triggers, operation ${c.op ?? 'none'}`;
const vocalsLabel = (bar: number, v: NonNullable<SectionView['vocals'][number]>): string =>
  `Bar ${bar + 1}: ${v.words} words${v.first ? `, starting "${v.first}"` : ''}`;

/** One strip row of a section: a cell per bar, filled when that bar's decide event carried data. Never touches the tracker. */
function StripRow(props: { testId: string; title: string; bars: number; labels: Record<number, string> }): React.ReactElement {
  return (
    <div data-testid={props.testId} className="flex items-center gap-1 mt-1">
      <div className="text-[10px] w-20 shrink-0 text-text-muted">{props.title}</div>
      <div className="flex gap-0.5">
        {Array.from({ length: props.bars }, (_, bar) => {
          const label = props.labels[bar];
          return (
            <div key={bar} data-filled={label !== undefined} title={label} aria-label={label ?? `Bar ${bar + 1}: empty`} role="img"
              className={`h-3 w-3 rounded-sm border ${label !== undefined ? 'bg-accent-primary/60 border-accent-primary' : 'bg-dark-bgTertiary border-dark-border'}`} />
          );
        })}
      </div>
    </div>
  );
}

/** The master waveform growing out of the texture waveform on a spring (R2f-32); reduced motion shows the master at once. */
function GrowWave(props: { from?: Peaks; to: Peaks; reduced: boolean; reference?: number }): React.ReactElement {
  const { from, to, reduced, reference } = props;
  const [t, setT] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { setT(1); return; }
    const spring = new Spring(0, SETTLE);
    spring.to(1);
    setT(0);
    let raf = 0;
    let last = performance.now();
    const loop = (): void => {
      const now = performance.now();
      const v = spring.step((now - last) / 1000);
      last = now;
      if (spring.settled) { setT(1); return; }
      setT(v);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [to, reduced]);
  return <Wave a={growHeights(from ?? to, to, t, reduced)} height={36} final reference={reference} />;
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
  const listen = useUpRoughRenderStore((x) => x.listenWhileBuilding);
  const rendering = useUpRoughRenderStore((x) => x.status === 'rendering');
  const previewState = useSyncExternalStore(onUpRoughPreviewState, upRoughPreviewState);

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

  // Auto-scroll (R2f-59a): each voice's slot card scrolls into view once, when that voice starts building (act 1), and a
  // bass or melody slot when its first bar is born (act 3). Never after done, never within 2 s of the user scrolling.
  const slotEls = useRef(new Map<string, HTMLDivElement>());
  const registerSlot = useCallback((id: string, el: HTMLDivElement | null): void => {
    if (el) slotEls.current.set(id, el); else slotEls.current.delete(id);
  }, []);
  const userScrolledAt = useRef(-Infinity);
  const scrolled = useRef(new Set<string>());
  useEffect(() => { scrolled.current.clear(); }, [startedAt]);
  useEffect(() => {
    if (state.done) return;
    const go = (key: string, slotId: string): void => {
      if (scrolled.current.has(key)) return;
      scrolled.current.add(key);
      if (performance.now() - userScrolledAt.current < 2000) return;
      slotEls.current.get(slotId)?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    };
    [...lines.values()].filter((l) => t >= l.start).sort((a, b) => a.start - b.start)
      .forEach((l) => go(`voice:${l.voice}`, SLOT_OF_VOICE[l.voice] ?? l.voice));
    state.slots.filter((s) => s.born).forEach((s) => go(`born:${s.id}`, s.id));
  }, [t, lines, state.slots, state.done, reduced]);

  // Conveyor (R2f-56): one chip per real section event, born when the panel first sees it; the band moves only for an
  // event that arrived in the last BAND_IDLE_MS.
  const lastEventAt = useRef<number | undefined>(undefined);
  const [chips, setChips] = useState<RidingChip[]>([]);
  useEffect(() => {
    if (state.eventCount === 0) { lastEventAt.current = undefined; setChips([]); return; }
    const nowMs = performance.now();
    lastEventAt.current = nowMs;
    setChips((prev) => (state.sectionEvents.length > prev.length
      ? [...prev, ...state.sectionEvents.slice(prev.length).map((s, i) => ({ id: prev.length + i, label: s.name, bornAtSec: nowMs / 1000 }))]
      : state.sectionEvents.length < prev.length ? [] : prev));
  }, [state.eventCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const timeSec = performance.now() / 1000;
  return (
    <div className={className} data-testid="factory-panel"
      onWheel={() => { userScrolledAt.current = performance.now(); }} onTouchMove={() => { userScrolledAt.current = performance.now(); }}
      onKeyDown={() => { userScrolledAt.current = performance.now(); }} style={{ color: 'var(--color-text)' }}>
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
          <Button
            variant="ghost" size="sm" aria-pressed={listen} disabled={!rendering && !listen}
            onClick={() => setListenWhileBuilding(!listen)}
            title="Play the song's sections as they are rendered, before texture and mastering"
          >
            Listen while building
          </Button>
          <button
            type="button" aria-pressed={sound} onClick={() => setSound((v) => !v)}
            className="px-2 py-1 rounded text-xs flex items-center gap-1" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
          >
            {sound ? <Volume2 size={12} /> : <VolumeX size={12} />} Factory sounds {sound ? 'on' : 'off'}
          </button>
        </div>
      </div>
      {previewState === 'preview' && (
        <div data-testid="factory-preview-caption" className="text-xs text-accent-warning mb-1">{PREVIEW_CAPTION}</div>
      )}
      {!preview && state.eventCount > 0 && (
        <div data-testid="factory-no-preview" className="text-xs text-text-muted mb-1">{NO_PREVIEW}</div>
      )}
      <Machinery timeSec={timeSec} busy={active} bandBusy={bandBusy(performance.now(), lastEventAt.current)} chips={chips} />
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {state.slots.map((slot) => <SlotCard key={slot.id} register={registerSlot} slot={slot} lines={lines} t={t} reduced={reduced} timeSec={timeSec} preview={preview} />)}
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
                    {sec.layers.includes('sample') && (
                      <StripRow testId={`factory-chops-${sec.index}`} title="Sample chops" bars={sec.bars}
                        labels={Object.fromEntries(Object.entries(sec.chops).map(([b, c]) => [b, chopsLabel(Number(b), c)]))} />
                    )}
                    {(sec.layers.includes('vocal') || sec.layers.includes('vocals')) && (
                      <StripRow testId={`factory-vocals-${sec.index}`} title="Vocals" bars={sec.bars}
                        labels={Object.fromEntries(Object.entries(sec.vocals).map(([b, v]) => [b, vocalsLabel(Number(b), v)]))} />
                    )}
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
                {state.press[k] ? (k === 'master' ? <GrowWave from={state.press.texture} to={state.press[k]!} reduced={reduced} reference={state.press.master?.scale} /> : <Wave a={state.press[k]} height={36} reference={state.press.master?.scale} />) : <div style={{ height: 36, border: '1px dashed var(--color-border)', borderRadius: 6 }} />}
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
