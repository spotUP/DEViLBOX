/**
 * A scripted generate run as NDJSON (R2f): the stand-in for the host's streamed events until R2c lands. Act 1 events are
 * the real ones (the TS drum bank with every stage observed); the decide events carry host-shaped cells; `done` carries
 * no song, so replaying it never replaces the loaded song. One JSON event per line, in the order the host streams them.
 */
import { createEmitter, type R2Event } from '@/engine/uprough/r2Events';
import { buildBank } from '@/engine/uprough/songRender';
import type { HipHopStyle } from '@/engine/uprough/drumBank';
import { peaks } from '@/engine/uprough/r2Peaks';
import { FACTORY_RATE } from './actOne';

const SECTIONS = [
  { name: 'intro', bars: 2, layers: ['drums', 'bass'] },
  { name: 'verse', bars: 4, layers: ['drums', 'bass', 'melody', 'sample'] },
  { name: 'hook', bars: 2, layers: ['drums', 'bass', 'melody', 'vocal'] },
];

/** Host-shaped drum cells [voice, step, velocity, role] for one bar. */
function drumCells(bar: number): unknown[] {
  const cells: unknown[] = [['kick', 0, 1, 'main'], ['snare', 8, 0.9, 'main'], ['clap', 8, 0.6, 'main']];
  if (bar % 2 === 1) cells.push(['kick', 10, 0.8, 'main']);
  for (let step = 0; step < 16; step += 2) cells.push(['ch', step, 0.5 + (step % 4 === 0 ? 0.2 : 0), 'main']);
  cells.push(['rim', 14, 0.4, 'main']);
  return cells;
}

export function scriptedGenerateEvents(style: HipHopStyle, seed: number): R2Event[] {
  const out: R2Event[] = [];
  const em = createEmitter((e) => out.push(e))!;
  em.emit({ type: 'start', mode: 'generate', rate: FACTORY_RATE, style, seed, sections: SECTIONS });
  const bank = buildBank(em, style, FACTORY_RATE, seed);
  em.emit({
    type: 'hatpool', section: 0,
    variants: ['closed_a', 'closed_b', 'closed_c'].map((name, i) => ({ name, peaks: peaks((bank.ch ?? new Float64Array(64)).subarray(0, 600 + i * 300)) })),
  });
  SECTIONS.forEach((sec, section) => {
    for (let bar = 0; bar < sec.bars; bar++) {
      em.emit({ type: 'decide', section, bar, lane: 'drums', cells: drumCells(bar) });
      if (sec.layers.includes('bass')) em.emit({ type: 'decide', section, bar, lane: 'bass', cells: [[0, 0, 4, null, 1], [7, 8, 4, null, 1]] });
      // Host-shaped chops (a real-break bar, then chopped bars; bar 3 has no sample) and vocals (bar 1 of the hook is empty).
      if (sec.layers.includes('sample') && bar < 3) {
        em.emit({
          type: 'decide', section, bar, lane: 'chops',
          cells: [bar === 0 ? { length: 57520, brk_seed: 2991, kick_steps: [0, 8] } : { triggers: [{ slice_index: 0 }, { slice_index: 1 }], offers: [], ops: ['reverse', 0, false] }],
        });
      }
      if (sec.layers.includes('vocal')) {
        em.emit({ type: 'decide', section, bar, lane: 'vocals', cells: bar === 0 ? [['she', [6], 1, false, true, 0, 0], ['said', [4], 1, false, true, 6, 0]] : [] });
      }
      if (sec.layers.includes('melody')) em.emit({ type: 'decide', section, bar, lane: 'melody', cells: [[60, 0, 4], [63, 8, 4]] });
    }
  });
  em.emit({ type: 'done', mode: 'generate', samples: 0 });
  return out;
}

export const toNdjson = (events: readonly R2Event[]): string => events.map((e) => JSON.stringify(e)).join('\n') + '\n';

export function parseNdjson(text: string): R2Event[] {
  return text.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as R2Event);
}

/** Milliseconds the host takes between two events of a kind: decide events stream per bar, the rest arrive at once. */
const GAP_MS: Partial<Record<R2Event['type'], number>> = { decide: 90 };

/** Replays events through `onEvent` with the host's pacing. Returns the cancel function. */
export function replayEvents(events: readonly R2Event[], onEvent: (e: R2Event) => void, speed = 1): () => void {
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const next = (): void => {
    const ev = events[i++];
    if (!ev) return;
    onEvent(ev);
    timer = setTimeout(next, (GAP_MS[ev.type] ?? 0) / speed);
  };
  next();
  return () => { if (timer) clearTimeout(timer); i = events.length; };
}
