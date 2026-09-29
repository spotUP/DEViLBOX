/**
 * The song analyzer's instrument verdicts against the owner's ear.
 *
 * fixtures/instrument-labels.json holds what the owner heard, per song and
 * instrument (pulled from the instrument list's role picker, or given in
 * conversation). Every labelled instrument the song plays must get the
 * owner's role and drum part; an instrument the song never plays has no
 * verdict and is not scored.
 *
 * First entries, 2026-09-29, micro15.mod: 0A read "kick" and 0B "snare"
 * because their spectra were judged at the samples' recorded speed; the song
 * plays them an octave up, where 0A is the snare and 0B a rimshot.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCorpusSong } from './classifierCorpus';
import type { InstrumentRole, DrumPart } from '../songAnalyzer';

vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

interface LabelledInstrument { role: InstrumentRole; drumPart?: DrumPart; note?: string }
interface LabelledSongInstruments { song: string; labelledBy: 'owner'; date: string; instruments: Record<string, LabelledInstrument> }

const LABELS = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/instrument-labels.json'), 'utf8')) as LabelledSongInstruments[];

describe('instrument verdicts match the owner\'s ear', () => {
  for (const entry of LABELS) {
    it(entry.song.split('/').pop()!, async () => {
      const { analyzeSong } = await import('../songAnalyzer');
      const song = await loadCorpusSong(entry.song);
      const a = analyzeSong(song.patterns, song.songPositions ?? [], new Map(song.instruments.map((i) => [i.id, i])));
      for (const [id, truth] of Object.entries(entry.instruments)) {
        const v = a.instruments.get(Number(id));
        if (!v) continue; // not played in the song
        expect({ id, role: v.role, drumPart: v.drumPart }).toEqual({ id, role: truth.role, drumPart: truth.drumPart });
      }
    }, 120000);
  }
});
