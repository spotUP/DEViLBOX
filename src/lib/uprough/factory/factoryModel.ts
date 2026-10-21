/**
 * The factory view model (R2f): R2 events in, what the panel shows out. Pure; the store feeds it, the canvases read it.
 * Nothing here invents work: every field is set by an event, so every visual is driven by a real event.
 */
import type { Env, Peaks } from '@/engine/uprough/r2Peaks';
import type { R2Event, R2Mode } from '@/engine/uprough/r2Events';
import { chopsSummary, vocalsSummary, type ChopsSummary, type VocalsSummary } from './decideToCells';
import { LANE_LABEL, LANES, type Lane } from '../songFile';

/** The slot a drum voice lives in (the golden draft's grouping; hat holds the open hat, ride and the hat pool). */
export const SLOT_OF_VOICE: Record<string, Lane> = {
  kick: 'kick', snare: 'snare', snare_accent: 'snare', snare_ghost: 'snare', clap: 'clap',
  ch: 'hat', oh: 'hat', ride: 'hat', rim: 'perc1', tom: 'perc1', conga: 'perc1',
  cowbell: 'perc2', shaker: 'perc2', tamb: 'perc2', metal: 'perc2',
};

export interface StageView { stage: string; index: number; peaks: Peaks; env?: Env }
export interface VoiceView { voice: string; stages: StageView[]; bank?: Peaks; len?: number }
export interface Attachment { voice: string; peaks: Peaks }
export interface HatVariant { name: string; peaks: Peaks }

export interface SlotView {
  id: Lane;
  label: string;
  voices: VoiceView[];
  attachments: Attachment[];
  hatVariants: HatVariant[];
  /** Bass and melody slots: the first rendered bar (the `born` summary of the first lane event). */
  born?: Peaks;
  alive: boolean;
}

export type StemLane = 'drums' | 'bass' | 'melody' | 'scratch';
export const STEM_LANES: readonly StemLane[] = ['drums', 'bass', 'melody', 'scratch'];

export interface SectionView {
  index: number;
  name: string;
  bars: number;
  layers: string[];
  cached: boolean;
  /** Bars whose decide events arrived (act 2), per lane. */
  decided: Record<string, number>;
  /** The section strip lights when its section event arrives (act 3). */
  lit: boolean;
  /** Host-only lanes (no TS renderer, no tracker home): a summary per bar whose decide event was non-empty. */
  chops: Record<number, ChopsSummary>;
  vocals: Record<number, VocalsSummary>;
  stems: Partial<Record<StemLane, Peaks>>;
  buses: Record<string, Peaks>;
  mix?: Peaks;
}

export interface PressView { join?: Peaks; texture?: Peaks; master?: Peaks }

export interface FactoryState {
  mode: R2Mode | null;
  rate: number;
  style: string;
  seed: number;
  slots: SlotView[];
  /** Voices in build order (act 1). */
  voiceOrder: string[];
  sections: SectionView[];
  press: PressView;
  /** The last event's kind, for the caption. */
  caption: string;
  /** Count of events folded in: the sentinel the reachability test reads. */
  eventCount: number;
  /** The kind of the last event folded in, for the sound cue. */
  lastType: R2Event['type'] | null;
  /** One entry per real `section` event, in arrival order: what the conveyor chips are made from (R2f-56). */
  sectionEvents: { index: number; name: string }[];
  cellsWritten: number;
  done: boolean;
}

const newSlots = (): SlotView[] =>
  LANES.map((id) => ({ id, label: LANE_LABEL[id], voices: [], attachments: [], hatVariants: [], alive: false }));

export const initialFactoryState = (): FactoryState => ({
  mode: null, rate: 22050, style: '', seed: 0, slots: newSlots(), voiceOrder: [], sections: [],
  press: {}, caption: 'Waiting for a song', eventCount: 0, lastType: null, sectionEvents: [], cellsWritten: 0, done: false,
});

/** Word-case a stage or voice name for a caption: tape_sat -> tape sat. */
export const spoken = (name: string): string => name.replace(/_/g, ' ');

function voiceView(slot: SlotView, voice: string): VoiceView {
  let v = slot.voices.find((x) => x.voice === voice);
  if (!v) { v = { voice, stages: [] }; slot.voices.push(v); }
  return v;
}

/** Fold one event in. Returns a new state; slots and sections touched are copied, the rest is shared. */
export function reduceFactory(prev: FactoryState, ev: R2Event, cellsWritten = 0): FactoryState {
  const s: FactoryState = {
    ...prev, eventCount: prev.eventCount + 1, lastType: ev.type, cellsWritten: prev.cellsWritten + cellsWritten,
    slots: prev.slots.map((x) => ({ ...x, voices: x.voices.map((v) => ({ ...v, stages: [...v.stages] })), attachments: [...x.attachments], hatVariants: [...x.hatVariants] })),
    sections: prev.sections.map((x) => ({ ...x, decided: { ...x.decided }, chops: { ...x.chops }, vocals: { ...x.vocals }, stems: { ...x.stems }, buses: { ...x.buses } })),
  };
  const slotOf = (voice: string): SlotView | undefined => s.slots.find((x) => x.id === SLOT_OF_VOICE[voice]);
  switch (ev.type) {
    case 'start':
      // A new run starts from empty slots.
      return {
        ...initialFactoryState(),
        mode: ev.mode, rate: ev.rate, style: ev.style, seed: ev.seed,
        eventCount: 1, lastType: 'start', caption: `Starting ${ev.style}, seed ${ev.seed}`,
        sections: ev.sections.map((x, index) => ({
          index, name: x.name, bars: x.bars, layers: x.layers, cached: false, decided: {}, lit: false, chops: {}, vocals: {}, stems: {}, buses: {},
        })),
      };
    case 'stage': {
      const slot = slotOf(ev.voice);
      if (!slot) return s;
      slot.alive = true;
      const view = voiceView(slot, ev.voice);
      // A repeated stage (the same bank announced twice) replaces, so the view never doubles.
      view.stages = [...view.stages.filter((x) => x.index !== ev.index), { stage: ev.stage, index: ev.index, peaks: ev.peaks, ...(ev.env && { env: ev.env }) }]
        .sort((a, b) => a.index - b.index);
      if (!s.voiceOrder.includes(ev.voice)) s.voiceOrder.push(ev.voice);
      s.caption = `${spoken(ev.voice)}: ${spoken(ev.stage)}`;
      return s;
    }
    case 'bank': {
      const slot = slotOf(ev.voice);
      if (!slot) return s;
      slot.alive = true;
      const v = voiceView(slot, ev.voice);
      v.bank = ev.peaks; v.len = ev.len;
      if (!s.voiceOrder.includes(ev.voice)) s.voiceOrder.push(ev.voice);
      s.caption = `${spoken(ev.voice)} is built`;
      return s;
    }
    case 'attach': {
      const slot = s.slots.find((x) => x.id === 'snare')!;
      slot.attachments = [...slot.attachments.filter((a) => a.voice !== ev.voice), { voice: ev.voice, peaks: ev.peaks }];
      s.caption = `${spoken(ev.voice)} fitted onto the snare`;
      return s;
    }
    case 'hatpool': {
      const slot = s.slots.find((x) => x.id === 'hat')!;
      if (slot.hatVariants.length === 0) slot.hatVariants = ev.variants;
      s.caption = `Hat pool: ${ev.variants.length} variants`;
      return s;
    }
    case 'decide': {
      const sec = s.sections[ev.section];
      if (sec) sec.decided[ev.lane] = Math.max(sec.decided[ev.lane] ?? 0, ev.bar + 1);
      if (sec && ev.lane === 'chops') { const c = chopsSummary(ev.cells); if (c) sec.chops[ev.bar] = c; }
      if (sec && ev.lane === 'vocals') { const v = vocalsSummary(ev.cells); if (v) sec.vocals[ev.bar] = v; }
      s.caption = `Deciding ${sec?.name ?? 'section'} bar ${ev.bar + 1}: ${ev.lane}`;
      return s;
    }
    case 'scratchplan':
      s.caption = `Planning the scratches for ${s.sections[ev.section]?.name ?? 'section'}`;
      return s;
    case 'section': {
      const sec = s.sections[ev.section];
      if (sec) { sec.lit = true; sec.cached = ev.cached; }
      s.sectionEvents = [...s.sectionEvents, { index: ev.section, name: ev.name }];
      s.caption = `Rendering ${ev.name}`;
      return s;
    }
    case 'lane': {
      const sec = s.sections[ev.section];
      if (sec) sec.stems[ev.lane] = ev.peaks;
      const target = ev.lane === 'bass' ? 'bass' : ev.lane === 'melody' ? 'melody1' : undefined;
      const slot = target ? s.slots.find((x) => x.id === target) : undefined;
      if (slot && !slot.alive) { slot.alive = true; slot.born = ev.born; }
      s.caption = `${spoken(ev.lane)} rendered for ${sec?.name ?? 'section'}`;
      return s;
    }
    case 'bus': {
      const sec = s.sections[ev.section];
      if (sec) sec.buses[ev.bus] = ev.peaks;
      s.caption = `${ev.bus} bus`;
      return s;
    }
    case 'mix': {
      const sec = s.sections[ev.section];
      if (sec) sec.mix = ev.peaks;
      s.caption = `${sec?.name ?? 'Section'} mixed`;
      return s;
    }
    case 'join': s.press = { ...s.press, join: ev.peaks }; s.caption = 'Sections joined'; return s;
    case 'texture': s.press = { ...s.press, texture: ev.peaks }; s.caption = 'Texture'; return s;
    case 'master': s.press = { ...s.press, master: ev.peaks }; s.caption = 'Master bus'; return s;
    case 'done': s.done = true; s.caption = ev.mode === 'generate' ? 'Song generated' : 'Song rendered'; return s;
  }
}
