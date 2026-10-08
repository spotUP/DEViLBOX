/**
 * Gate A - baseline lock (plan section 2). Freezes the legacy Auto DJ
 * behaviour so a change is a decision, not an accident: the legacy Smart Sort
 * order of the 15-track corpus, the legacy transition-type thresholds, the
 * timing constants and the bar options. Documented in
 * thoughts/shared/research/2026-10-08_auto-dj-baseline.md.
 */
import { describe, it, expect } from 'vitest';
import { smartSort } from '../DJPlaylistSort';
import { keyCompatibility } from '../DJKeyUtils';
import { computeMaxPatternDefers, HARD_MAX_PATTERN_DEFERS, PATTERN_DEFER_BUDGET_RATIO, MIN_TRANSITION_FOR_DEFER_SEC } from '../DJAutoDJ';
import { CORPUS_IDS, corpusSummary } from '../autodj/testing/corpus';
import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function corpusAsPlaylist(): PlaylistTrack[] {
  return CORPUS_IDS.map((id, i) => {
    const s = corpusSummary(id);
    return {
      id, fileName: `${id}.wav`, trackName: id, format: 'WAV', bpm: s.bpm, duration: s.durationSec, addedAt: i,
      musicalKey: s.key ?? 'Unknown', energy: s.energy.loudnessEnergy, djSummary: s,
    };
  });
}

describe('Auto DJ baseline (Gate A)', () => {
  it('A1.2 legacy Smart Sort order of the corpus is frozen', () => {
    const order = smartSort(corpusAsPlaylist()).map((t) => t.id);
    expect(order).toEqual([
      'uncertainKey', 'steady', 'silence', 'variableEnergy', 'short', 'drops', 'longOutro', 'compatibleKey',
      'breakdowns', 'tracker', 'longIntro', 'vocals', 'unusual', 'clashKey', 'fastBpm',
    ]);
  }, 60_000);

  it('A1.9 legacy key handling: Unknown scores as a clash, a fifth up is energy-boost', () => {
    expect(keyCompatibility('A minor', 'Unknown')).toBe('clash');
    expect(keyCompatibility('A minor', 'E minor')).toBe('energy-boost');
    expect(keyCompatibility('A minor', 'C major')).toBe('mood-change');
    expect(keyCompatibility('A minor', 'F# major')).toBe('clash');
  });

  it('A1.16 legacy timing: chord deferral budget 15 % of the fade, hard cap 5, none under 2 s', () => {
    expect(PATTERN_DEFER_BUDGET_RATIO).toBe(0.15);
    expect(HARD_MAX_PATTERN_DEFERS).toBe(5);
    expect(MIN_TRANSITION_FOR_DEFER_SEC).toBe(2);
    expect(computeMaxPatternDefers(10)).toBe(3);
    expect(computeMaxPatternDefers(20)).toBe(5);
  });

  it('A1.4/A1.5/A1.13/A1.17 legacy constants are what the baseline document says', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/engine/dj/DJAutoDJ.ts'), 'utf8');
    expect(src).toMatch(/POLL_INTERVAL_MS = 500/);
    expect(src).toMatch(/PRELOAD_LEAD_TIME_SEC = 60/);
    expect(src).toMatch(/TRANSITION_TIMEOUT_MS = 45_000/);
    expect(src).toMatch(/MAX_PRELOAD_RETRIES = 10/);
    const fx = readFileSync(resolve(process.cwd(), 'src/engine/dj/DJQuantizedFX.ts'), 'utf8');
    expect(fx).toMatch(/HUMANIZE_JITTER_MS = 30/);
    const panel = readFileSync(resolve(process.cwd(), 'src/components/dj/DJAutoDJPanel.tsx'), 'utf8');
    expect(panel).toMatch(/TRANSITION_BAR_OPTIONS = \[2, 4, 8, 16, 32\]/);
  });

  it('A2 the corpus covers every track type the plan lists, with ground truth', () => {
    expect(CORPUS_IDS.length).toBe(15);
    for (const id of CORPUS_IDS) {
      const s = corpusSummary(id);
      expect(s.bpm, id).toBeGreaterThan(0);
      expect(s.durationSec, id).toBeGreaterThan(5);
    }
    expect(corpusSummary('uncertainKey').key).toBeNull();
    expect(corpusSummary('fastBpm').bpm).toBe(174);
    expect(corpusSummary('short').durationSec).toBeLessThan(20);
    expect(corpusSummary('tracker').tracker).toBe(true);
    expect(corpusSummary('silence').sectionKinds).toContain('silence');
  }, 60_000);
});
