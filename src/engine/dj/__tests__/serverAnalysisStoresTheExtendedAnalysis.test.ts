/**
 * The server analysis cache kept only the base analysis, so a new browser
 * re-analysed every track for the Auto DJ's extended analysis (owner
 * 2026-10-14: "why do i need to re-analyze?"). song_analysis now carries it:
 * a packed blob + its version. These cover the server half: the codec round
 * trip, the migration of an old table, and that a base-only upload never
 * wipes (nor an older version overwrites) the stored extended analysis.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { corpusTrack } from '../autodj/testing/corpus';
import { computeExtendedAnalysis } from '../autodj/activityTimelines';
import type { ExtendedAnalysis } from '../autodj/types';

type CacheModule = typeof import('../../../../server/src/services/analysisCache');
type DbModule = typeof import('../../../../server/src/db/database');
type CodecModule = typeof import('../../../../server/src/services/extendedAnalysisCodec');

let cache: CacheModule;
let dbm: DbModule;
let codec: CodecModule;
let extended: ExtendedAnalysis;
const HASH = 'a'.repeat(64);

function base(hash: string, over: Partial<import('../../../../server/src/services/analysisCache').SongAnalysis> = {}) {
  return {
    hash, bpm: 126, bpmConfidence: 0.9, timeSignature: 4, musicalKey: 'A minor', keyConfidence: 0.8,
    rmsDb: -14, peakDb: -1, genrePrimary: 'Electronic', genreSubgenre: 'House', genreConfidence: 0.7,
    mood: 'Energetic', energy: 0.8, danceability: 0.9, duration: 120,
    beats: [0.5, 0.98, 1.46], downbeats: [0.5], waveformPeaks: [0.1, 0.5, 1], frequencyPeaks: [[0.1], [0.2], [0.3]],
    analysisVersion: 1, ...over,
  };
}

beforeAll(async () => {
  process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'devilbox-analysis-'));
  dbm = await import('../../../../server/src/db/database');
  dbm.initDatabase();
  cache = await import('../../../../server/src/services/analysisCache');
  codec = await import('../../../../server/src/services/extendedAnalysisCodec');
  const t = corpusTrack('steady');
  extended = computeExtendedAnalysis(t.pcm, t.sampleRate, { beats: t.beats });
});

describe('the server stores the extended analysis', () => {
  it('a stored extended analysis comes back from the lookup: version, shape and values within the 8-bit quantisation', () => {
    cache.storeAnalysis({ ...base(HASH), extended });
    const got = cache.lookupAnalysis(HASH)!.extended!;
    expect(got.version).toBe(extended.version);
    for (const k of ['bass', 'drums', 'harmonic', 'vocal', 'brightness', 'onsetFlux'] as const) {
      expect(got[k]).toHaveLength(extended[k].length);
      got[k].forEach((v, i) => expect(Math.abs(v - extended[k][i])).toBeLessThanOrEqual(1 / 255));
    }
    got.loudnessShortTermDb.forEach((v, i) => expect(Math.abs(v - extended.loudnessShortTermDb[i])).toBeLessThanOrEqual(0.006));
    expect(got.chroma).toHaveLength(extended.chroma.length);
    got.chroma.forEach((row, r) => row.forEach((v, i) => expect(Math.abs(v - extended.chroma[r][i])).toBeLessThanOrEqual(1 / 255)));
    expect(got.loudness.integratedDb).toBeCloseTo(extended.loudness.integratedDb, 4);
    expect(got.spectral.centroidHz).toBeCloseTo(extended.spectral.centroidHz, 3);
    expect(got.bassSummary.melodic).toBe(extended.bassSummary.melodic);
    expect(got.firstTransient).toBeCloseTo(extended.firstTransient, 5);
    expect(got.hopSec).toBe(extended.hopSec);
    // The base analysis is untouched by the new columns.
    expect(cache.lookupAnalysis(HASH)!.bpm).toBe(126);
  });

  it('decoding then re-encoding gives the same bytes (the quantisation is stable)', () => {
    const once = codec.packExtended(extended);
    const twice = codec.packExtended(codec.unpackExtended(once)!);
    expect(twice.equals(once)).toBe(true);
  });

  it('is much smaller than the JSON of the same analysis', () => {
    const packed = codec.packExtended(extended).length;
    const json = JSON.stringify(extended).length;
    const secs = extended.bass.length * extended.hopSec;
    console.log(`[extended] ${Math.round(secs)} s track: ${packed} bytes packed vs ${json} bytes JSON`);
    expect(packed).toBeLessThan(json / 4);
  });

  it('a base-only upload keeps the stored extended analysis, and an older version never replaces a newer one', () => {
    cache.storeAnalysis({ ...base(HASH, { bpm: 127 }) });
    const kept = cache.lookupAnalysis(HASH)!;
    expect(kept.bpm).toBe(127);
    expect(kept.extended?.version).toBe(extended.version);
    cache.storeAnalysis({ ...base(HASH), extended: { ...extended, version: extended.version - 1 } });
    expect(cache.lookupAnalysis(HASH)!.extended?.version).toBe(extended.version);
    cache.storeAnalysis({ ...base(HASH), extended: { ...extended, version: extended.version + 1 } });
    expect(cache.lookupAnalysis(HASH)!.extended?.version).toBe(extended.version + 1);
  });

  it('a malformed or truncated extended analysis is rejected, not stored', () => {
    expect(codec.isExtendedAnalysis({ ...extended, bass: 'x' })).toBe(false);
    expect(codec.isExtendedAnalysis({ ...extended, chroma: [[1, 2]] })).toBe(false);
    expect(codec.isExtendedAnalysis(extended)).toBe(true);
    expect(codec.unpackExtended(codec.packExtended(extended).subarray(0, 100))).toBeNull();
  });
});

describe('the song_analysis migration', () => {
  it('an old table gains the columns, keeps its rows (a partial hit: extended null) and migrates again as a no-op', () => {
    const db = dbm.default;
    db.exec('DROP TABLE song_analysis');
    db.exec(`CREATE TABLE song_analysis (
      hash TEXT PRIMARY KEY, bpm REAL, bpm_confidence REAL, time_signature INTEGER DEFAULT 4,
      musical_key TEXT, key_confidence REAL, rms_db REAL, peak_db REAL, genre_primary TEXT, genre_subgenre TEXT,
      genre_confidence REAL, mood TEXT, energy REAL, danceability REAL, duration REAL,
      beats BLOB, downbeats BLOB, waveform_peaks BLOB, frequency_peaks BLOB, analysis_version INTEGER DEFAULT 1, created_at INTEGER NOT NULL)`);
    db.prepare('INSERT INTO song_analysis (hash, bpm, beats, downbeats, waveform_peaks, frequency_peaks, created_at) VALUES (?, 120, x\'\', x\'\', x\'\', x\'\', 1)').run('b'.repeat(64));
    expect(dbm.migrateSongAnalysisExtended(db)).toBe(true);
    expect(dbm.migrateSongAnalysisExtended(db)).toBe(false);
    const old = db.prepare('SELECT hash, bpm, extended, extended_version FROM song_analysis').get() as Record<string, unknown>;
    expect(old).toMatchObject({ hash: 'b'.repeat(64), bpm: 120, extended: null, extended_version: null });
  });
});
