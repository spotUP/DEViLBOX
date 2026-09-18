import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PerformanceJournalRecorder,
  parseJournal,
  emptyJournal,
  formatJournal,
  JOURNAL_VERSION,
  type JournalEntry,
} from '../performanceJournal';

function entry(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    invocationId: 'inv-1',
    moveId: 'echoThrow',
    channelId: 1,
    row: 44,
    timeSec: 12,
    origin: 'ai',
    intention: 'ANSWER',
    reason: 'answering the phrase on channel 1',
    state: 'ACT',
    bar: 2,
    barInPhrase: 2,
    ...over,
  };
}

describe('PerformanceJournalRecorder', () => {
  it('records what was played and why', () => {
    const r = new PerformanceJournalRecorder();
    r.record(entry());
    const [e] = r.snapshot().entries;
    expect(e.moveId).toBe('echoThrow');
    expect(e.intention).toBe('ANSWER');
    expect(e.reason).toMatch(/answering/);
  });

  it('stamps the release onto the fire that caused it', () => {
    const r = new PerformanceJournalRecorder();
    r.record(entry());
    r.noteRelease('inv-1', 60);
    expect(r.snapshot().entries[0].releasedRow).toBe(60);
  });

  it('ignores a release for something it never saw', () => {
    const r = new PerformanceJournalRecorder();
    expect(() => r.noteRelease('ghost', 10)).not.toThrow();
  });

  it('caps itself so a long session does not grow without bound', () => {
    const r = new PerformanceJournalRecorder(3);
    for (let i = 0; i < 10; i++) r.record(entry({ invocationId: `i${i}`, row: i }));
    expect(r.size).toBe(3);
    expect(r.snapshot().entries.map(e => e.row)).toEqual([7, 8, 9]);
  });

  it('hands out copies, so a reader cannot edit the record', () => {
    const r = new PerformanceJournalRecorder();
    r.record(entry());
    const snap = r.snapshot();
    snap.entries[0].moveId = 'tampered';
    expect(r.snapshot().entries[0].moveId).toBe('echoThrow');
  });
});

describe('parseJournal — commentary never stops a song loading', () => {
  it('reads a journal it wrote', () => {
    const r = new PerformanceJournalRecorder();
    r.record(entry());
    const round = parseJournal(JSON.parse(JSON.stringify(r.snapshot())));
    expect(round.entries).toHaveLength(1);
    expect(round.version).toBe(JOURNAL_VERSION);
  });

  it('turns junk into an empty journal rather than throwing', () => {
    for (const junk of [null, undefined, 42, 'nope', {}, { entries: 'no' }]) {
      expect(parseJournal(junk).entries).toEqual([]);
    }
  });

  it('drops malformed entries and keeps the good ones', () => {
    const parsed = parseJournal({
      version: 1,
      entries: [entry(), { moveId: 'missing everything else' }, entry({ invocationId: 'b' })],
    });
    expect(parsed.entries).toHaveLength(2);
  });

  it('an empty journal is a valid journal', () => {
    expect(emptyJournal().entries).toEqual([]);
    expect(emptyJournal().version).toBe(JOURNAL_VERSION);
  });
});

describe('formatJournal', () => {
  it('reads musically — bars, who did it, and why', () => {
    const r = new PerformanceJournalRecorder();
    r.record(entry());
    r.noteRelease('inv-1', 60);
    const text = formatJournal(r.snapshot());
    expect(text).toMatch(/bar\s+2/);
    expect(text).toMatch(/AI/);
    expect(text).toMatch(/echoThrow ch1/);
    expect(text).toMatch(/\[ANSWER\]/);
    expect(text).toMatch(/held 16 rows/);
    expect(text).toMatch(/answering the phrase/);
  });

  it('marks the user\'s own moves as theirs', () => {
    const r = new PerformanceJournalRecorder();
    r.record(entry({ origin: 'user', intention: undefined, reason: undefined }));
    expect(formatJournal(r.snapshot())).toMatch(/YOU/);
  });
});

describe('M1 wiring contract', () => {
  const bridge = readFileSync(
    join(__dirname, '..', '..', '..', 'engine', 'dub', 'performanceJournalBridge.ts'), 'utf8',
  );
  const autoDub = readFileSync(
    join(__dirname, '..', '..', '..', 'engine', 'dub', 'AutoDub.ts'), 'utf8',
  );

  it('records from the ROUTER, so the user\'s moves are in the same document', () => {
    expect(bridge).toContain('subscribeDubRouter');
    expect(bridge).toContain('subscribeDubRelease');
  });

  it('only annotates the AI\'s own fires', () => {
    expect(bridge).toContain("event.origin === 'ai'");
  });

  it('is additive — AutoDub registers an annotator rather than the journal importing it', () => {
    expect(autoDub).toContain('setPerformanceAnnotator(');
    expect(bridge).not.toContain("from './AutoDub'");
  });
});

describe('M1 persistence — additive in both directions', () => {
  const persistence = readFileSync(
    join(__dirname, '..', '..', '..', 'hooks', 'useProjectPersistence.ts'), 'utf8',
  );
  const migrations = readFileSync(
    join(__dirname, '..', '..', 'persistence', 'migrations', 'index.ts'), 'utf8',
  );

  it('saves the journal beside the project, not inside the lanes', () => {
    expect(persistence).toContain('performanceJournal?: import(');
    expect(persistence).toContain('performanceJournal: (() => {');
  });

  it('does not write an empty journal into every project file', () => {
    expect(persistence).toContain('journal.entries.length > 0 ? journal : undefined');
  });

  it('restores through the forgiving parser, so bad notes cannot break a load', () => {
    expect(persistence).toContain('loadPerformanceJournal(parseJournal(project.performanceJournal))');
  });

  it('bumps the schema without raising the minimum loadable version', () => {
    expect(migrations).toContain('export const CURRENT_SCHEMA = 23;');
    // A purely additive field must NOT make older projects unloadable.
    expect(migrations).toContain('export const MIN_LOADABLE_SCHEMA = 21;');
  });

  it('documents the migration as additive and forward-compatible', () => {
    expect(migrations).toMatch(/22 → 23[\s\S]*performanceJournal/);
  });
});
