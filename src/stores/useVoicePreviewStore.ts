/**
 * useVoicePreviewStore - the Voice to Notes take shown in the pattern before
 * it is committed.
 *
 * The Voice to Notes panel sets it while recording (live notes) and while a
 * take waits for commit; the pattern editor draws it as ghost notes over the
 * target channel. Cells come from writeToPattern.takeCells, the same function
 * the commit writes with.
 */

import { create } from 'zustand';
import type { PatternPreviewSnapshot } from '@/engine/renderer/worker-types';

interface VoicePreviewState {
  preview: PatternPreviewSnapshot | null;
  setPreview: (preview: PatternPreviewSnapshot | null) => void;
}

export const useVoicePreviewStore = create<VoicePreviewState>((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
}));
