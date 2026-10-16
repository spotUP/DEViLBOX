/**
 * takeHistory.ts - the last few takes of this session, kept in memory only
 * (no project schema change), so an earlier take can be committed again.
 */
import type { PitchModelOutput } from './pitchNotes';

export const MAX_TAKES = 8;

export interface Take {
  id: number;
  output: PitchModelOutput;
  seconds: number;
  recordedAt: number;
}

let takes: Take[] = [];
let nextId = 1;

/** Newest first. */
export function listTakes(): readonly Take[] {
  return takes;
}

export function addTake(output: PitchModelOutput, seconds: number): Take {
  const take: Take = { id: nextId++, output, seconds, recordedAt: Date.now() };
  takes = [take, ...takes].slice(0, MAX_TAKES);
  return take;
}

export function clearTakes(): void {
  takes = [];
}
