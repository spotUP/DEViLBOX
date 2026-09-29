/**
 * The channel classifier, scored against the owner's labels.
 *
 * Every rule change is measured here, not guessed (plan:
 * thoughts/shared/plans/2026-09-29-channel-classifier.md, P0). Only songs the
 * owner labelled by ear are scored; silent channels are left out. The score
 * may only go up: channel-labels.baseline.json is raised with each
 * improvement and never lowered silently.
 *
 * Prints overall accuracy, drums-vs-not accuracy and a confusion matrix, and
 * writes them to test-data/classifier-score.json.
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCorpusSong, roleToLabel, REPO_ROOT, type LabelledSong, type ChannelLabel } from './classifierCorpus';

vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

const LABELS = resolve(__dirname, 'fixtures/channel-labels.json');
const BASELINE = resolve(__dirname, 'fixtures/channel-labels.baseline.json');
const SCORED: ChannelLabel[] = ['drums', 'bass', 'lead', 'harmony', 'fx-vocal'];

interface Score { songs: number; channels: number; accuracy: number; drumsAccuracy: number; confusion: Record<string, Record<string, number>> }

describe('channel classifier score', () => {
  it('does not fall below the recorded baseline on the owner-labelled corpus', async () => {
    const { classifySongRoles } = await import('../ChannelNaming');
    const labelled = (JSON.parse(readFileSync(LABELS, 'utf8')) as LabelledSong[]).filter((s) => s.labelledBy === 'owner');

    const confusion: Record<string, Record<string, number>> = {};
    let total = 0, right = 0, drumsRight = 0;
    for (const entry of labelled) {
      const song = await loadCorpusSong(entry.song);
      const lookup = new Map(song.instruments.map((i) => [i.id, i]));
      const predicted = classifySongRoles(song.patterns, lookup).map((r) => roleToLabel(r).label);
      entry.channels.forEach((truth, ch) => {
        if (!SCORED.includes(truth.label)) return;
        const guess = predicted[ch] ?? 'silent';
        total++;
        if (guess === truth.label) right++;
        if ((guess === 'drums') === (truth.label === 'drums')) drumsRight++;
        (confusion[truth.label] ??= {})[guess] = (confusion[truth.label][guess] ?? 0) + 1;
      });
    }
    const score: Score = {
      songs: labelled.length,
      channels: total,
      accuracy: total ? right / total : 0,
      drumsAccuracy: total ? drumsRight / total : 0,
      confusion,
    };
    console.log(`classifier: ${score.songs} owner-labelled songs, ${score.channels} channels, `
      + `accuracy ${(score.accuracy * 100).toFixed(1)} %, drums-vs-not ${(score.drumsAccuracy * 100).toFixed(1)} %`);
    console.log('confusion (truth -> guess):', JSON.stringify(confusion));
    const out = resolve(REPO_ROOT, 'test-data');
    if (!existsSync(out)) mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, 'classifier-score.json'), JSON.stringify(score, null, 2));

    const baseline = existsSync(BASELINE)
      ? JSON.parse(readFileSync(BASELINE, 'utf8')) as { accuracy: number; drumsAccuracy: number }
      : { accuracy: 0, drumsAccuracy: 0 };
    // A small epsilon: the same corpus scores the same, so any drop is real.
    expect(score.accuracy).toBeGreaterThanOrEqual(baseline.accuracy - 1e-9);
    expect(score.drumsAccuracy).toBeGreaterThanOrEqual(baseline.drumsAccuracy - 1e-9);
  }, 300000);
});
