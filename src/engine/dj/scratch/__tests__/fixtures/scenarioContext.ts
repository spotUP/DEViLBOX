/** Contexts for the planner tests: the 120 BPM fixture analysis moved to a section kind, a tempo and a mood. */
import { buildScratchContext, type ScratchPerformanceContext } from '../../scratchContext';
import { fixtureAnalysis, fixturePerf } from './analysisFixture';
import type { SectionKind } from '../../../autodj/types';
import type { ScratchDJStyle } from '../../scratchTypes';

export interface ScenarioInput {
  style: ScratchDJStyle;
  kind: SectionKind;
  bpm: number;
  energy: number;
  vocal?: number;
  beatConfidence?: number;
  meter?: number;
  permission?: number;
}

export function scenarioContext(s: ScenarioInput): ScratchPerformanceContext {
  const track = fixtureAnalysis();
  // the kind of the section the position falls in (bars 16-32 of the fixture)
  track.sections[1]!.kind = s.kind;
  const t = 0.18 + 16 * 2 + 0.01;
  const ctx = buildScratchContext({ perf: fixturePerf(track, t), style: s.style })!;
  return { ...ctx, bpm: s.bpm, energy: s.energy, vocalActivity: s.vocal ?? 0, beatConfidence: s.beatConfidence ?? 0.9, meter: s.meter ?? 4, scratchPermission: s.permission ?? 1 };
}
