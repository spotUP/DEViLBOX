/**
 * SCR-PHRASING-PARITY: plan-level lock-step with the Up Rough demo. The demo's own planners ran on the
 * same tracks and seeds (`fixtures/phrasing_parity.json`, made by
 * `tools/scratch-fixtures/gen_phrasing_parity.py` from `fixtures/phrasing_parity_spec.json`); here the
 * DEViLBOX planners run on them and every event must match: gesture per bar and step, velocity, the
 * record, the routine's bars - and the demo's 32-bar routines event for event.
 *
 * The one rule both sides share on top of the demo: one hand (an event that would start inside a
 * sounding one is dropped - inside a bar in the demo's priority order, across bars in time; the demo
 * sums both strokes) - applied to the demo's list here.
 */
import { describe, it, expect } from 'vitest';
import spec from './fixtures/phrasing_parity_spec.json';
import fixture from './fixtures/phrasing_parity.json';
import { planScratch, routineSlotRecord, type OverlaySection } from '../scratchPlanner';
import { oneHand, overlapsOneHand, type PlacedScratch } from '../scratchPlacement';
import { REFERENCE_GESTURE_IDS, getGesture } from '../scratchGestureCatalog';
import { CLEAN_CRATE_POOL, CRATE_LOAD_ORDER, CUE_ROLE_POOLS, type CueRole } from '../scratchCatalogue';
import { SCRATCH_PROFILES, type ScratchProfileId } from '../scratchStyles';
import { buildScratchDjRoutine, buildThreeDeckRoutine, validateScratchDjRoutine } from '../scratchDemoRoutines';
import { SECTION_OF_KIND, type ScratchPerformanceContext } from '../scratchContext';
import type { ScratchDJStyle, ScratchGestureId } from '../scratchTypes';
import type { SectionKind } from '../../autodj/types';

const gid = (ref: string): ScratchGestureId => (ref === 'needle_drop' ? 'needleDrop' : ref === 'needle_lift' ? 'needleLift' : REFERENCE_GESTURE_IDS[ref]!);
const profileOf = (reference: string): ScratchProfileId => (Object.values(SCRATCH_PROFILES).find((p) => p.reference === reference)!.id);

interface SpecTrack { name: string; style: string; profile: string; seed: number; sections: Array<{ kind: string; name: string; startBar: number; bars: number }> }
interface OverlayRow { track: string; routine: string | null; events: Array<{ bar: number; step: number; gesture: string; velocity: number; kind: string }>; records: Array<{ startBar: number; record: string }> }

function ctxFor(track: SpecTrack): ScratchPerformanceContext {
  return {
    masterBeat: 0, masterBar: 0, phrasePosition: 0, barInPhrase: 0, phraseBars: 4, bpm: 92, meter: 4, beatConfidence: 1, phraseConfidence: 1,
    section: undefined, sectionName: 'A', energy: 0.5, targetEnergy: 0.5, activeDeck: 'A', vocalActivity: 0, drumActivity: 0.5, bassActivity: 0.3,
    melodicActivity: 0.5, juggleIntensity: 0, transitionIntensity: 0, scratchPermission: 4, scratchIntensity: 0,
    recentGestures: [], recentSources: [], recentRoutines: [], style: track.style as ScratchDJStyle,
  };
}

/** The DEViLBOX overlay over the whole track, planned window by window (4 bars) as the controller plans it. */
function devilboxOverlay(track: SpecTrack, routine: string | null): PlacedScratch[] {
  const last = track.sections[track.sections.length - 1]!;
  const total = last.startBar + last.bars;
  const sectionAt = (bar: number): OverlaySection => {
    const s = track.sections.find((x) => bar >= x.startBar && bar < x.startBar + x.bars)!;
    return { name: s.name, startBar: s.startBar, bars: s.bars };
  };
  const out: PlacedScratch[] = [];
  for (let from = 0; from < total; from += 4) {
    const plan = planScratch(ctxFor(track), {
      mode: 'BATTLE', seed: track.seed, fromBar: from, bars: Math.min(4, total - from), sectionAt,
      profile: profileOf(track.profile), routine: routine as 'auto' | null, records: true,
    });
    out.push(...plan.events);
  }
  return oneHand(out);
}

describe('the scratch planners plan what the Up Rough demo plans (SCR-PHRASING-PARITY)', () => {
  it('the crate is the demo bank: its load order, the clean pool, the four cue-role pools', () => {
    expect(CRATE_LOAD_ORDER.map((r) => r.id)).toEqual(fixture.bankOrder);
    expect(CLEAN_CRATE_POOL).toEqual(fixture.cleanPool);
    for (const role of ['HOME', 'SECONDARY', 'ACCENT', 'FX'] as CueRole[]) expect(CUE_ROLE_POOLS[role]).toEqual((fixture.pools as Record<string, string[]>)[role]);
  });

  it('every gesture has the demo activity (the calm -> busy ranking) and every profile the demo gestures and ladder', () => {
    for (const [ref, activity] of Object.entries(fixture.activity)) expect([ref, getGesture(gid(ref)).activity]).toEqual([ref, activity]);
    for (const [ref, p] of Object.entries(fixture.profiles as Record<string, { gestures: string[]; scale: number }>)) {
      const mine = SCRATCH_PROFILES[profileOf(ref)];
      expect([ref, [...mine.gestures]]).toEqual([ref, p.gestures.map(gid)]);
      expect(mine.scale).toBe(p.scale);
    }
  });

  it('the spec sections are what the Auto DJ section kinds map to', () => {
    for (const t of spec.tracks) for (const s of t.sections) expect([s.kind, SECTION_OF_KIND[s.kind as SectionKind]]).toEqual([s.kind, s.name]);
  });

  for (const row of fixture.overlay as OverlayRow[]) {
    it(`the overlay on track ${row.track} (routine ${row.routine ?? 'none'}): every event, velocity and record`, () => {
      const track = spec.tracks.find((t) => t.name === row.track)! as SpecTrack;
      // one hand, as DEViLBOX performs it: inside a bar in the demo's own priority order (turnaround, answer,
      // accent - the clamped step 16 is a second stroke on step 15), then across bars in time
      const kept: Array<{ bar: number; step: number; beat: number; gesture: ScratchGestureId; velocity: number }> = [];
      for (const e of row.events) {
        const ev = { bar: e.bar, step: e.step, beat: e.bar * 4 + e.step / 4, gesture: gid(e.gesture), velocity: e.velocity };
        if (!kept.some((k) => k.bar === ev.bar && overlapsOneHand(k, ev))) kept.push(ev);
      }
      const demo = oneHand(kept);
      const mine = devilboxOverlay(track, row.routine);
      const key = (e: { bar: number; step: number; gesture: ScratchGestureId }): string => `${e.bar}:${e.step}:${e.gesture}`;
      expect(mine.map(key)).toEqual(demo.map(key));
      mine.forEach((e, i) => expect(e.velocity).toBeCloseTo(demo[i]!.velocity, 9));
      // one record per section, the demo's pick; a routine's strokes scratch their word slots' records
      // (`_routine_cues` with a record set, R12: slot i = the i-th sorted record), rendered from the routine's seed
      for (const r of row.records) {
        const inSection = mine.filter((e) => e.bar >= r.startBar && e.bar < r.startBar + (track.sections.find((s) => s.startBar === r.startBar)!.bars));
        for (const e of inSection) expect([e.bar, e.record]).toEqual([e.bar, e.routineSlot ? routineSlotRecord(e.routineSlot) : r.record]);
      }
    });
  }

  it('the 32-bar showcase (scratch_dj.build_routine) for every style and seed, with its validation', () => {
    for (const row of fixture.scratchDj as unknown as Array<{ style: string; seed: number; events: Array<[number, number, string, string, number]>; issues: string[] }>) {
      const style = ({ old_school: 'oldSchool', boombap: 'boomBap', electro: 'electro', battle: 'battle', lofi: 'loFi' } as Record<string, ScratchDJStyle>)[row.style]!;
      const mine = buildScratchDjRoutine(style, row.seed);
      expect(mine.map((e) => [e.bar, e.step, e.cueRole, e.gesture])).toEqual(row.events.map(([b, s, r, g]) => [b, s, r, gid(g)]));
      mine.forEach((e, i) => expect(e.velocity).toBeCloseTo(row.events[i]![4], 9));
      expect(validateScratchDjRoutine(mine)).toEqual(row.issues);
    }
  });

  it('the three-deck routine (three_deck.build_scratch_events) for every seed, with the record each event plays', () => {
    for (const row of fixture.threeDeck as unknown as Array<{ seed: number; events: Array<[number, number, string, string, number, string | null]> }>) {
      const mine = buildThreeDeckRoutine(row.seed);
      expect(mine.map((e) => [e.bar, e.step, e.cueRole, e.gesture, e.record ?? null])).toEqual(row.events.map(([b, s, r, g, , rec]) => [b, s, r, gid(g), rec]));
      mine.forEach((e, i) => expect(e.velocity).toBeCloseTo(row.events[i]![4], 9));
    }
  });
});
