import type { EditorMode } from '@/types/tracker';

/**
 * Editor modes whose "pattern" is a synthetic stub: the engine plays a
 * program (SC68, SNDH), there are no rows to edit, and the view is a scope.
 * The dub lane, the smoke test and the UI all ask this one list.
 */
export const NON_EDITABLE_MODES: readonly EditorMode[] = ['sc68'];

export function isNonEditableMode(mode: string | null | undefined): boolean {
  return !!mode && (NON_EDITABLE_MODES as readonly string[]).includes(mode);
}
