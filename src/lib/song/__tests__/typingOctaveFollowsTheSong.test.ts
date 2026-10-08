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
import { noteToPeriod, typingOctaveFor, songUsesAmigaPeriods } from '@/lib/amiga/periodNotes';

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

  it('the rule: only the note-number formats keep octave 4', () => {
    for (const f of ['XM', 'IT', 'S3M', 'AdPlug']) { expect(songUsesAmigaPeriods(f)).toBe(false); expect(typingOctaveFor(f)).toBe(4); }
    for (const f of ['MOD', 'UADE', 'OKT']) { expect(songUsesAmigaPeriods(f)).toBe(true); expect(typingOctaveFor(f)).toBe(2); }
  });
});
