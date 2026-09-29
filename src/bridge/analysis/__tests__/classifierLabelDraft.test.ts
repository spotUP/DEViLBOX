/**
 * Writes the draft labels: the classifier's current verdict for every channel
 * of every corpus song, for the owner to correct by ear. Owner-labelled
 * entries already in the file are kept as they are (resumable).
 *
 * Runs only on demand:
 *   CLASSIFIER_DRAFT=1 npx vitest run src/bridge/analysis/__tests__/classifierLabelDraft.test.ts
 */
import { it, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CORPUS, loadCorpusSong, roleToLabel, type LabelledSong } from './classifierCorpus';

vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

const LABELS = resolve(__dirname, 'fixtures/channel-labels.json');

it.runIf(process.env.CLASSIFIER_DRAFT === '1')('writes draft labels for the corpus', async () => {
  const { classifySongRoles } = await import('../ChannelNaming');
  const existing: LabelledSong[] = existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, 'utf8')) : [];
  const owner = new Map(existing.filter((s) => s.labelledBy === 'owner').map((s) => [s.song, s]));
  const out: LabelledSong[] = [];
  for (const path of CORPUS) {
    const kept = owner.get(path);
    if (kept) { out.push(kept); continue; }
    const song = await loadCorpusSong(path);
    const lookup = new Map(song.instruments.map((i) => [i.id, i]));
    const roles = classifySongRoles(song.patterns, lookup);
    out.push({ song: path, channels: roles.map(roleToLabel), labelledBy: 'draft', date: new Date().toISOString().slice(0, 10) });
  }
  writeFileSync(LABELS, JSON.stringify(out, null, 1) + '\n');
  console.log(`channel-labels.json: ${out.length} songs, ${out.filter((s) => s.labelledBy === 'owner').length} owner-labelled`);
}, 300000);
