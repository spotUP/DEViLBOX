/**
 * The shared DrumPadEngine and NoteRepeatEngine, if created - a leaf module
 * (type-only imports).
 *
 * useMIDIPadRouting creates and disposes the singletons. parameterRouter,
 * DJActions and DjFxActions only read them, but used to import the hook for
 * that; the hook imports DrumPadEngine, the dub router and its moves, so those
 * edges put the whole drum pad / dub layer (~14 modules) into the static import
 * cycle of useInstrumentStore and ToneEngine. Inside a cycle the module runner
 * hands a racing load half-initialised modules ("reading 'prototype'" of
 * undefined). Readers now import the getters from here.
 * See src/lib/song/__tests__/songPersistenceImportCycle.test.ts.
 */
import type { DrumPadEngine } from './DrumPadEngine';
import type { NoteRepeatEngine } from './NoteRepeatEngine';

let engine: DrumPadEngine | null = null;
let noteRepeat: NoteRepeatEngine | null = null;

/** Called by useMIDIPadRouting when it creates (or disposes: nulls) the singletons. */
export function setDrumPadInstances(e: DrumPadEngine | null, n: NoteRepeatEngine | null): void {
  engine = e;
  noteRepeat = n;
}

/** Returns the singleton DrumPadEngine instance (for direct voice filter modulation) */
export function getDrumPadEngine(): DrumPadEngine | null {
  return engine;
}

/** Returns the singleton NoteRepeatEngine instance (for panic / shared access). */
export function getNoteRepeatEngine(): NoteRepeatEngine | null {
  return noteRepeat;
}
