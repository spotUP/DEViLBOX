/**
 * The synth factory (R2f): a live show of a softsynth song being built. It reads the factory event store, which every
 * R2 event source feeds through `factoryOnEvent`; nothing here pretends work, every visual is set by an event.
 * Act 1 (the drum bank) is paced for the eye from the voices' real stage buffers; acts 2 and 3 show events as they land.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { useFactoryStore } from '@/lib/uprough/factory/useFactoryStore';
import { actOneSchedule, FAN_SECONDS, stageAtTime, type VoiceTimeline } from '@/lib/uprough/factory/pacing';
import { bandBusy, CONVEYOR_SPEED, chipPosition, growHeights, popIn, prefersReducedMotion, SETTLE, Spring, stampBounce } from '@/lib/uprough/factory/motion';
import { fidgetOffset, gazeAt, gazeFocus } from '@/lib/uprough/factory/eyeMotion';
import { drawConveyor, drawEnvelope, drawEyes, drawGear, drawPlayhead, PLATE_SECONDS, drawStamp, drawWave, fitCanvas, readTokens, type FactoryColors } from '@/lib/uprough/factory/draw';
import { actOneEnd, actOneStatus, hatFanStart } from '@/lib/uprough/factory/statusLine';
import { slotGrid, SLOT_GAP, WAVE_MIN, type SlotGrid } from '@/lib/uprough/factory/layout';
import { playCue, type Cue } from '@/lib/uprough/factory/factorySfx';
import { hasLocalPreview, playVoice } from '@/lib/uprough/factory/voiceAudition';
import { Button } from '@components/ui/Button';
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

function Wave(props: { a?: Peaks; b?: Peaks; frac?: number; reveal?: number; reference?: number; height?: number; final?: boolean; env?: { values: number[]; n: number }; envLabel?: string; eyes?: number; eyeSeed?: number; gaze?: { x: number; y: number }; idle?: boolean; plate?: { name: string; since: number; squash: number }; playhead?: number }): React.ReactElement {
  const { a, b, frac = 0, reveal = 1, reference, height = 56, final = false, env, envLabel, eyes, eyeSeed = 0, gaze, idle = false, plate, playhead } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const c: FactoryColors = readTokens(cv);
    const { w, h } = fitCanvas(cv, ctx, height, 240);
    drawWave(ctx, w, h, a, b, frac, final ? c.final : c.wave, c.line, reveal, reference);
    if (env) drawEnvelope(ctx, w, h, env, envLabel ?? '', c);
    if (playhead !== undefined) drawPlayhead(ctx, w, h, playhead, c.text);
    if (plate) drawStamp(ctx, w, plate.name, plate.since, plate.squash, c);
    if (eyes !== undefined) drawEyes(ctx, w - 24, 12, eyes, eyeSeed, c, idle, gaze);
  });
  useRedrawOnResize(ref);
  return <canvas ref={ref} width={240} height={height} className="w-full block" style={{ height }} />;
}

/** The slot grid's columns, rows and waveform height, derived from the room its element has (no scrolling, ever). */
function useSlotGrid(ref: React.RefObject<HTMLDivElement | null>, count: number): SlotGrid {
  const [size, setSize] = useState<{ w: number; h: number } | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize((p) => (p && p.w === r.width && p.h === r.height ? p : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return useMemo(() => (size ? slotGrid(size.w, size.h, count) : { cols: 1, rows: Math.max(1, count), wave: WAVE_MIN }), [size, count]);
}

/** The finished voice is drawn this much below the box edge (the draft's +15 percent), leaving headroom for the pump-up. */
export const ABSOLUTE_HEADROOM = 1.15;


/** Chip thumbnail height in CSS pixels (the draft's 22 px, G11). */
export const CHIP_THUMB_HEIGHT = 22;

export const NO_PREVIEW = 'No local preview for this style';

/** A finished one-shot: a native button, so the keyboard reaches it. Click plays the kept local audio (R2f-61). */
function Chip(props: { voice: string; label: string; peaks: Peaks; accent?: boolean; alpha: number; scale: number; preview: boolean }): React.ReactElement {
  const { voice, label, preview } = props;
  return (
    <Button
      variant="ghost" size="sm" aria-label={`Play ${label}`} aria-disabled={!preview} title={preview ? `Play ${label}` : NO_PREVIEW}
      onClick={() => { if (preview) playVoice(voice); }}
      className={`flex-col min-w-0 overflow-hidden !px-1 !py-0.5 text-xs bg-dark-bgTertiary text-text-secondary border-[3px] ${props.accent ? 'border-accent-secondary' : 'border-dark-border'} ${preview ? '' : 'cursor-not-allowed'}`}
      style={{ opacity: preview ? props.alpha : 0.6, transform: `scale(${props.scale})` }}
    >
      <Wave a={props.peaks} height={CHIP_THUMB_HEIGHT} />
      <span className="block w-full truncate">{label}</span>
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

/** The voice a slot shows at clock `t`, and whether it is stamped (finished) or building right now. */
function slotProgress(slot: SlotView, lines: Map<string, VoiceTimeline>, t: number): { voice: VoiceView | undefined; line: VoiceTimeline | undefined; stamped: boolean; building: boolean } {
  const voice: VoiceView | undefined = slot.voices.find((v) => {
    const line = lines.get(v.voice);
    return !line || t >= line.start;
  }) ?? slot.voices[0];
  const line = voice ? lines.get(voice.voice) : undefined;
  const stamped = !!voice?.bank && (!line || t >= line.stampAt);
  return { voice, line, stamped, building: !!line && t >= line.start && !stamped };
}

function SlotCard(props: { register: (id: string, el: HTMLDivElement | null) => void; slot: SlotView; lines: Map<string, VoiceTimeline>; t: number; reduced: boolean; timeSec: number; preview: boolean; waveHeight: number; rate: number; finaleAt?: number; slotIndex: number; cols: number; buildingIndex?: number; chipRiding: boolean }): React.ReactElement {
  const { slot, lines, t, reduced, timeSec, preview, register, waveHeight, rate, finaleAt, slotIndex, cols, buildingIndex, chipRiding } = props;
  const { voice, line, stamped, building } = slotProgress(slot, lines, t);
  const shown = line ? stageAtTime(line, t) : { index: voice ? voice.stages.length - 1 : -1, frac: 1 };
  const stages = voice?.stages ?? [];
  const cur = stages[Math.max(0, shown.index)];
  const next = stages[shown.index + 1];
  const bounce = line && stamped ? stampBounce(t - line.stampAt, reduced) : 0;
  // Absolute scale (G2): every stage is drawn against the finished voice's peak plus 15 percent, so early stages are small and grow.
  const reference = voice?.bank ? voice.bank.scale * ABSOLUTE_HEADROOM : undefined;
  const chip = line ? popIn(t - line.chipAt, reduced) : { scale: 1, alpha: 1 };
  // Card state (G10): waiting (dim, dashed), building (glowing), built. Squash and stretch kicks when the build starts.
  const state = stamped || slot.born ? 'built' : building ? 'building' : 'waiting';
  // Finale (G20): at the act-1 clock's end every slot kicks together.
  const kick = finaleAt !== undefined && t >= finaleAt ? popIn(t - finaleAt, reduced).scale : line ? popIn(t - line.start, reduced).scale : 1;
  // Bass and melody wait for the first rendered bar (G18).
  const placeholder = !cur && !slot.born && /^(bass|melody)/.test(slot.id);
  // Playhead (G5): sweeps the finished one-shot while its audition plays.
  const playLen = voice?.bank && rate > 0 ? voice.bank.len / rate : 0;
  const playhead = preview && line && stamped && playLen > 0 && t - line.stampAt < playLen ? (t - line.stampAt) / playLen : undefined;
  const plate = line && voice && stamped && t - line.stampAt < PLATE_SECONDS ? { name: spoken(voice.voice), since: t - line.stampAt, squash: bounce } : undefined;
  // Chip pop-in (G15) and hat fan-out (G14): attachment and hat chips pop like the voice chips, one FAN_SECONDS after each other.
  const fanBase = Math.max(0, ...slot.voices.map((v) => lines.get(v.voice)?.chipAt ?? 0));
  const fanned = (i: number): { scale: number; alpha: number } => (fanBase > 0 ? popIn(t - fanBase - i * FAN_SECONDS, reduced) : { scale: 1, alpha: 1 });
  // Eyes (R2f): each slot blinks, glances and fidgets on its own seed (its index); gaze goes to what is happening.
  const gaze = gazeAt(timeSec, slotIndex, gazeFocus({ slotIndex, cols, buildingIndex, playhead, chipRiding }));
  const fidget = reduced ? { x: 0, y: 0, rot: 0 } : fidgetOffset(timeSec, slotIndex);
  return (
    <div
      data-testid={`factory-slot-${slot.id}`} data-state={state} ref={(el) => register(slot.id, el)}
      style={{ transform: `translate(${fidget.x.toFixed(2)}px, ${fidget.y.toFixed(2)}px) rotate(${fidget.rot.toFixed(3)}deg) scale(${1 - (1 - kick) * 0.08})` }}
      className={`rounded-md p-2 flex flex-col gap-1 min-h-0 min-w-0 overflow-hidden bg-dark-bgSecondary border ${state === 'waiting' ? 'border-dashed border-dark-borderLight opacity-[.55]' : state === 'building' ? 'border-solid border-accent-primary ring-1 ring-accent-primary' : 'border-solid border-accent-primary'}`}
    >
      <div data-testid={`factory-heading-${slot.id}`} className="text-lg font-extrabold leading-tight text-text-primary truncate">{slot.label}</div>
      {slot.born ? (
        <Wave a={slot.born} height={waveHeight} eyes={timeSec} eyeSeed={slotIndex} gaze={gaze} final />
      ) : (
        <Wave a={stamped ? voice?.bank : cur?.peaks} height={waveHeight} b={stamped ? undefined : next?.peaks} frac={shown.frac} final={stamped} eyes={timeSec} eyeSeed={slotIndex} gaze={gaze} reference={reference} idle={state === 'waiting'} plate={plate} playhead={playhead}
          env={cur?.env} envLabel={cur ? spoken(cur.stage) : ''} />
      )}
      <div data-testid={`factory-caption-${slot.id}`} className="text-[13px] font-mono text-text-secondary min-h-[2.6em] line-clamp-2" style={{ transform: `translateY(${bounce * 4}px)` }}>
        {placeholder && <Lock size={10} className="inline mr-1 align-[-1px]" aria-hidden />}
        {stamped && voice ? `Stamped ${spoken(voice.voice)}` : cur ? spoken(cur.stage) : slot.born ? 'First bar rendered with the song' : placeholder ? 'Comes alive at the first rendered bar' : 'Empty'}
      </div>
      {/* One row whatever the count (a hat pool brings eight): chips share the width, so a slot never grows taller. */}
      <div data-testid={`factory-chips-${slot.id}`} className="grid grid-flow-col auto-cols-fr gap-1 min-h-[40px]">
        {stamped && voice?.bank && slot.voices.filter((v) => v.bank).map((v) => (
          <Chip key={v.voice} voice={v.voice} label={spoken(v.voice)} peaks={v.bank!} alpha={chip.alpha} scale={chip.scale} preview={preview} />
        ))}
        {slot.attachments.map((a, i) => <Chip key={a.voice} voice={a.voice} label={spoken(a.voice)} peaks={a.peaks} accent alpha={fanned(i).alpha} scale={fanned(i).scale} preview={preview} />)}
        {slot.hatVariants.map((h, i) => <Chip key={h.name} voice={h.name} label={spoken(h.name)} peaks={h.peaks} alpha={fanned(i).alpha} scale={fanned(i).scale} preview={preview} />)}
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
  const [sound, setSound] = useState(true);
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
    const once = (key: string, cue: Cue, step = 0): void => { if (!cued.current.has(key)) { cued.current.add(key); playCue(cue, step); } };
    lines.forEach((l, v) => {
      if (t >= l.start) once(`${v}:start`, 'pop');
      if (t >= l.stampAt) once(`${v}:stamp`, 'stamp');
      l.stageAt.forEach((at, j) => { if (t >= at) once(`${v}:s${j}`, 'stage', j); });
    });
    // Hat fan-out (G14, G16): one tick per variant, FAN_SECONDS apart.
    const fan = hatFanStart(lines, state);
    const variants = state.slots.find((s) => s.hatVariants.length > 0)?.hatVariants.length ?? 0;
    if (fan !== undefined) for (let i = 0; i < variants; i++) if (t >= fan + i * FAN_SECONDS) once(`hat:${i}`, 'tick');
  }, [t, lines, sound, state.slots]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Finale (G20): when the act-1 clock ends, every slot kicks (finaleAt) and the view scrolls back to the first slot, once.
  const finaleAt = useMemo(() => actOneEnd(lines, state), [lines, state]);
  const finaleScrolled = useRef(false);
  useEffect(() => { finaleScrolled.current = false; }, [startedAt]);
  useEffect(() => {
    if (finaleAt === undefined || t < finaleAt || finaleScrolled.current) return;
    finaleScrolled.current = true;
    const first = state.slots[0] && slotEls.current.get(state.slots[0].id);
    first?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }, [t, finaleAt, state.slots, reduced]);

  const gridRef = useRef<HTMLDivElement>(null);
  const grid = useSlotGrid(gridRef, state.slots.length);
  const timeSec = performance.now() / 1000;
  const buildingIndex = state.slots.findIndex((s) => slotProgress(s, lines, t).building);
  return (
    <div className={`h-full flex flex-col min-h-0 ${className ?? ''}`} data-testid="factory-panel"
      onWheel={() => { userScrolledAt.current = performance.now(); }} onTouchMove={() => { userScrolledAt.current = performance.now(); }}
      onKeyDown={() => { userScrolledAt.current = performance.now(); }} style={{ color: 'var(--color-text)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 shrink-0">
        <div role="status" aria-live="polite" data-testid="factory-status" className="text-sm font-bold text-accent-highlight min-h-[1.5em]">
          {actOneStatus(lines, state, t) ?? state.caption}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onReplay && (
            <Button variant="default" size="sm" icon={<RotateCcw size={12} />} onClick={onReplay}>Replay scripted run</Button>
          )}
          <Button
            variant={sound ? 'primary' : 'default'} size="sm" aria-pressed={sound} onClick={() => setSound((v) => !v)}
            icon={sound ? <Volume2 size={12} /> : <VolumeX size={12} />}
          >
            Factory sounds {sound ? 'on' : 'off'}
          </Button>
        </div>
      </div>
      {!preview && state.eventCount > 0 && (
        <div data-testid="factory-no-preview" className="text-xs text-text-muted mb-1">{NO_PREVIEW}</div>
      )}
      <div className="shrink-0"><Machinery timeSec={timeSec} busy={active} bandBusy={bandBusy(performance.now(), lastEventAt.current)} chips={chips} /></div>
      <div ref={gridRef} data-testid="factory-slots" className="flex-1 min-h-0 grid"
        style={{ gap: SLOT_GAP, gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))` }}>
        {state.slots.map((slot, i) => <SlotCard key={slot.id} slotIndex={i} cols={grid.cols} buildingIndex={buildingIndex >= 0 ? buildingIndex : undefined} chipRiding={chips.length > 0 && bandBusy(performance.now(), lastEventAt.current)} finaleAt={finaleAt} register={registerSlot} slot={slot} lines={lines} t={t} reduced={reduced} timeSec={timeSec} preview={preview} waveHeight={grid.wave} rate={state.rate} />)}
      </div>
      {state.sections.length > 0 && (
        <div className="mt-2 shrink-0" data-testid="factory-sections">
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Sections</div>
          <div className="flex gap-2 overflow-hidden">
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
        <div className="mt-2 shrink-0" data-testid="factory-press">
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
      <div className="mt-1 text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }} data-testid="factory-cells">
        {state.cellsWritten > 0 ? `${state.cellsWritten} pattern cells written` : ''}
      </div>
    </div>
  );
};
