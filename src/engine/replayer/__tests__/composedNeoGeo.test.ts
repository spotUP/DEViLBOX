/**
 * Play gate for a composed Neo Geo song, on the real fixture (no mocks): the song takes the
 * sequencer route through a derived native, and the hybrid rule leaves its instruments alone.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decompressProject } from '@/lib/projectCompression';
import type { TrackerSong } from '../../TrackerReplayer';
import { composedNeoGeoSequencerRoute, composedNeoGeoModuleSong, deriveComposedNeoGeo, isReplacedForDerivedSong } from '../composedNeoGeo';
import { isReplacedInstrument } from '../hybridInstruments';
import type { InstrumentConfig } from '@typedefs/instrument';

interface Dbx { bpm: number; speed?: number; patterns: TrackerSong['patterns']; patternOrder: number[]; instruments: InstrumentConfig[] }

function trialSong(): TrackerSong {
  const buf = readFileSync(resolve(__dirname, '../../../lib/export/__tests__/fixtures/neo_geo_composer_trial.dbx'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const d = JSON.parse(decompressProject(ab)) as Dbx;
  return {
    name: 'trial', format: 'XM', patterns: d.patterns, instruments: d.instruments, songPositions: d.patternOrder,
    songLength: d.patternOrder.length, restartPosition: 0, numChannels: 8, initialSpeed: d.speed ?? 6, initialBPM: d.bpm,
  } as TrackerSong;
}

describe('composed Neo Geo play gate', () => {
  it('routes the composed song to the sequencer, not an imported or mixed one', () => {
    const song = trialSong();
    expect(composedNeoGeoSequencerRoute(song)).toBe(true);
    expect(composedNeoGeoSequencerRoute({ ...song, furnaceNative: {} as never })).toBe(false);
    const mixed = [...song.instruments, { id: 99, name: 'x', synthType: 'Synth' } as unknown as InstrumentConfig];
    expect(composedNeoGeoSequencerRoute({ ...song, instruments: mixed })).toBe(false);
    expect(composedNeoGeoSequencerRoute({ ...song, instruments: [] })).toBe(false);
  });

  it('derives native data and keeps the instruments out of the hybrid set', async () => {
    const song = trialSong();
    const d = await deriveComposedNeoGeo(song);
    expect(d.native.chipIds).toContain(57);
    expect(d.native.subsongs[0].channels.length).toBeGreaterThan(0);
    expect(d.ins2.length).toBe(d.instrumentIds.length);
    expect(d.instrumentIds.length).toBe(song.instruments.length);
    const ids = new Set(d.instrumentIds);
    // Without the derived-song rule the normal one counts them as replaced (double playback).
    expect(song.instruments.some((i) => isReplacedInstrument(i, true))).toBe(true);
    expect(song.instruments.some((i) => isReplacedForDerivedSong(i, ids))).toBe(false);
    expect(composedNeoGeoModuleSong(song).songPositions).toBe(song.songPositions);
  });
});
