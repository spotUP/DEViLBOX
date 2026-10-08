/**
 * K12: opening an Amiga-period song sets the editor's typing octave to
 * ProTracker's (pt2-clone keyOctave = OCTAVE_HIGH: Z = C-2 = period 428), an XM
 * keeps the old default, and a change made by hand survives until the next
 * song is opened. One test through openSong; the rule itself is tested in place.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(), ensureInstrumentReady: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

import { openSong } from '@/lib/song/openSong';
import { useEditorStore } from '@/stores/useEditorStore';
import { NOTE_MAP } from '@/hooks/tracker/input/inputConstants';
import { gridNoteOfName } from '@/engine/keyboardPeriod';
import { noteToPeriod, typingOctaveFor, songUsesAmigaPeriods, NOTE_NUMBER_FORMATS } from '@/lib/amiga/periodNotes';
import { FORMAT_REGISTRY } from '@/lib/import/FormatRegistry';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const open = (rel: string) => {
  const b = readFileSync(resolve(ROOT, rel));
  return openSong({ kind: 'bytes', name: basename(rel), bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }, { origin: 'mcp' });
};
/** The period the Z key writes at the editor's current octave. */
const periodOfZ = (): number => {
  const { note, octaveOffset } = NOTE_MAP.z;
  return noteToPeriod(gridNoteOfName(`${note}${useEditorStore.getState().currentOctave + octaveOffset}`));
};

describe('the typing octave follows the opened song', { timeout: 120000 }, () => {
  it('MOD and Jeroen Tel types ProTracker notes, XM keeps its default, a hand change lasts until the next load', async () => {
    useEditorStore.getState().setCurrentOctave(4);
    expect((await open('public/data/songs/formats/a sleep so deep.mod')).ok).toBe(true);
    expect(useEditorStore.getState().currentOctave).toBe(2);
    expect(periodOfZ()).toBe(428); // pt2-clone: Z = C-2 = 428
    expect(noteToPeriod(gridNoteOfName(`C${2 + NOTE_MAP.q.octaveOffset}`))).toBe(214); // Q = C-3

    useEditorStore.getState().setCurrentOctave(3);
    expect(useEditorStore.getState().currentOctave).toBe(3);

    expect((await open('public/data/songs/jeroen-tel/stormlord title.jt')).ok).toBe(true);
    expect(useEditorStore.getState().currentOctave).toBe(2);
    expect(periodOfZ()).toBe(428);

    expect((await open('public/data/songs/formats/flo boarding - level 1.xm')).ok).toBe(true);
    expect(useEditorStore.getState().currentOctave).toBe(4);
  });

  // K12b: the rule had been "everything but XM / IT / S3M / AdPlug", so a SID, a game-music dump or a Hively song
  // opened two octaves down too, with ProTracker period semantics in the replayer.
  it.each([
    ['SID', 'public/data/songs/sid/abaddon-starfish-test.sid'],
    ['HVL', 'public/data/songs/hivelytracker/waiting for a message.hvl'],
    ['AHX', 'public/data/songs/ahx/amanda.ahx'],
    ['NSF', 'public/data/songs/nsf/dr mario.nsf'],
    ['VGM', 'public/data/songs/vgm/BeyondSN.vgm'],
    ['KT', 'public/data/songs/klystrack/Ocean Loader III.kt'],
    ['Furnace', 'public/data/songs/furnace/amiga/bruno_time.fur'],
  ])('%s keeps typing octave 4', async (_label, rel) => {
    useEditorStore.getState().setCurrentOctave(2);
    expect((await open(rel)).ok).toBe(true);
    expect(useEditorStore.getState().currentOctave).toBe(4);
  });

  // The replayer cannot be built in node (Tone needs a browser): its period mode is the same rule by reference.
  it('TrackerReplayer takes its period mode from the same rule', () => {
    const tr = readFileSync(resolve(ROOT, 'src/engine/TrackerReplayer.ts'), 'utf8');
    expect(tr).toContain('this.useXMPeriods = !songUsesAmigaPeriods(song.format);');
  });

  it('the rule: only the note-number and chip formats keep octave 4', () => {
    for (const f of ['XM', 'IT', 'S3M', 'AdPlug', 'SID', 'HVL', 'AHX', 'NSF', 'VGM']) { expect(songUsesAmigaPeriods(f)).toBe(false); expect(typingOctaveFor(f)).toBe(4); }
    for (const f of ['MOD', 'UADE', 'OKT', 'MED', 'FC', 'JamCracker', 'ML']) { expect(songUsesAmigaPeriods(f)).toBe(true); expect(typingOctaveFor(f)).toBe(2); }
  });

  // The table is read off the registry: every parser of a chip-dump / C64 entry names its format in it.
  it('every chip-dump and C64 registry parser names a format the table lists', () => {
    const modules = new Set<string>();
    for (const f of FORMAT_REGISTRY) {
      if ((f.family === 'chip-dump' || f.family === 'c64-chip') && f.nativeParser) modules.add(f.nativeParser.module.replace(/^@lib\/import\/formats\//, ''));
    }
    expect(modules.size).toBeGreaterThanOrEqual(15);
    const missing: string[] = [];
    for (const m of modules) {
      const src = readFileSync(resolve(ROOT, 'src/lib/import/formats', `${m}.ts`), 'utf8');
      for (const [, fmt] of src.matchAll(/\bformat: ?'([A-Za-z0-9 ]+)'/g)) {
        // QSF dumps are named 'MOD' by their parser - a parser naming open item, not this table's.
        if (fmt !== 'MOD' && !NOTE_NUMBER_FORMATS.has(fmt)) missing.push(`${m}: ${fmt}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
