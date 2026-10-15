/**
 * CZ-101 user patch LIBRARY: the sounds a user imported from Casio CZ SysEx dumps, listed in the
 * instrument editor's User category. The sound itself lives in the instrument (its `_cz101Tone`
 * parameter travels inside saved songs); this library is filled from instruments as they load, so
 * a song opened on another browser puts its patches here too. Entries are keyed by content: the
 * 128 tone bytes (base64), so the same sound is never listed twice.
 *
 * Persisted in localStorage under 'devilbox-cz101-user-patches', version 2:
 *  - v1 stored the decoded patch ({ id, name, patch }); v2 stores the tone bytes ({ id, name, tone }).
 *    migrate() re-encodes v1 patches to tone bytes, so nothing a user imported is lost.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CZPatch } from '@engine/cz101/cz101Types';
import { CZ101_TONE_NAME_PARAM, CZ101_TONE_PARAM, czToneFromBase64, czToneFromPatch, czToneToBase64, decodeCzTone } from '@engine/cz101/cz101Sysex';

export interface Cz101UserPatch {
  id: number;
  name: string;
  /** The 128 tone bytes, base64. */
  tone: string;
}

interface Cz101UserPatchState {
  patches: Cz101UserPatch[];
  nextId: number;
  /** Add sounds not already listed (by content); returns the ids of the entries holding them, in order. Names of known sounds are kept. */
  addTones: (entries: { name: string; tone: string }[]) => number[];
  removePatch: (id: number) => void;
}

export const CZ101_USER_PATCH_STORE_VERSION = 2;

export const useCz101UserPatchStore = create<Cz101UserPatchState>()(
  persist(
    (set, get) => ({
      patches: [],
      nextId: 1,
      addTones: (entries) => {
        const ids: number[] = [];
        const added: Cz101UserPatch[] = [];
        let next = get().nextId;
        for (const entry of entries) {
          const known = get().patches.find((p) => p.tone === entry.tone) ?? added.find((p) => p.tone === entry.tone);
          if (known) { ids.push(known.id); continue; }
          const created = { id: next++, name: entry.name || `CZ patch ${next - 1}`, tone: entry.tone };
          added.push(created);
          ids.push(created.id);
        }
        if (added.length > 0) set((state) => ({ patches: [...state.patches, ...added], nextId: next }));
        return ids;
      },
      removePatch: (id) => set((state) => ({ patches: state.patches.filter((entry) => entry.id !== id) })),
    }),
    {
      name: 'devilbox-cz101-user-patches',
      version: CZ101_USER_PATCH_STORE_VERSION,
      migrate: (persisted, version) => {
        const state = persisted as { patches?: { id: number; name: string; patch?: CZPatch; tone?: string }[]; nextId?: number };
        if (version < 2 && Array.isArray(state.patches)) {
          state.patches = state.patches.flatMap((entry) => {
            try { return [{ id: entry.id, name: entry.name, tone: czToneToBase64(czToneFromPatch(entry.patch!)) }]; } catch { return []; }
          });
        }
        return state as Cz101UserPatchState;
      },
      partialize: (state) => ({ patches: state.patches, nextId: state.nextId }),
    },
  ),
);

/** Library entry by id, with its decoded patch. */
export function getCz101UserPatch(id: number): (Cz101UserPatch & { patch: CZPatch }) | undefined {
  const entry = useCz101UserPatchStore.getState().patches.find((candidate) => candidate.id === id);
  if (!entry) return undefined;
  try {
    return { ...entry, patch: decodeCzTone(czToneFromBase64(entry.tone), entry.name).patch };
  } catch {
    return undefined;
  }
}

/** Make sure a sound an instrument carries is in the library (idempotent: by content). */
export function adoptCz101Tone(name: string, tone: string): void {
  useCz101UserPatchStore.getState().addTones([{ name, tone }]);
}

/**
 * List the patches that CZ-101 instruments carry (a song being loaded) in the library. The instrument is
 * the source; this only fills the User list, once per sound, and skips anything that is not a usable tone.
 */
export function adoptCz101TonesFrom(instruments: { synthType?: string; parameters?: Record<string, unknown> }[]): void {
  const found: { name: string; tone: string }[] = [];
  for (const inst of instruments) {
    const tone = inst.parameters?.[CZ101_TONE_PARAM];
    if (inst.synthType !== 'CZ101' || typeof tone !== 'string' || tone === '') continue;
    try { czToneFromBase64(tone); } catch { continue; }
    const name = inst.parameters?.[CZ101_TONE_NAME_PARAM];
    found.push({ name: typeof name === 'string' && name ? name : 'CZ patch', tone });
  }
  if (found.length > 0) useCz101UserPatchStore.getState().addTones(found);
}
