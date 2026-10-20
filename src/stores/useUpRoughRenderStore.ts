/** Render state of the loaded Up Rough song, for a status display (plan 2026-10-20 O6k2). */
import { create } from 'zustand';

export type UpRoughRenderStatus = 'idle' | 'rendering' | 'ready' | 'error';

interface UpRoughRenderState {
  status: UpRoughRenderStatus;
  /** Sections finished by the render in flight (R2 progress). */
  sectionsDone: number;
  sectionCount: number;
  /** Bumped each time a new mix lands. */
  version: number;
  error: string | null;
  set: (patch: Partial<Omit<UpRoughRenderState, 'set'>>) => void;
}

export const useUpRoughRenderStore = create<UpRoughRenderState>((set) => ({
  status: 'idle', sectionsDone: 0, sectionCount: 0, version: 0, error: null,
  set: (patch) => set(patch),
}));
