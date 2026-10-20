/**
 * The R2a render event protocol, TypeScript side (spec thoughts/shared/research/2026-10-20_r2a-event-protocol.md
 * section 3.3). Every emit site is `if (em)`: with no listener nothing is summarised, copied or allocated.
 */
import type { Env, Peaks } from './r2Peaks';

export type R2Mode = 'generate' | 'render';

export type R2Event =
  | { seq: number; type: 'start'; mode: R2Mode; rate: number; style: string; seed: number; sections: { name: string; bars: number; layers: string[] }[] }
  | { seq: number; type: 'stage'; voice: string; stage: string; index: number; peaks: Peaks; env?: Env }
  | { seq: number; type: 'bank'; voice: string; peaks: Peaks; len: number }
  | { seq: number; type: 'attach'; voice: 'snare_accent' | 'snare_ghost'; parent: 'snare'; peaks: Peaks }
  | { seq: number; type: 'hatpool'; section: number; variants: { name: string; peaks: Peaks }[] }
  | { seq: number; type: 'decide'; section: number; bar: number; lane: string; cells: unknown[] }
  | { seq: number; type: 'scratchplan'; section: number; cells: unknown[] }
  | { seq: number; type: 'section'; section: number; name: string; bars: number; cached: boolean }
  | { seq: number; type: 'lane'; section: number; lane: 'drums' | 'bass' | 'melody' | 'scratch'; peaks: Peaks; born: Peaks }
  | { seq: number; type: 'bus'; section: number; bus: 'drums' | 'sample' | 'bass' | 'melody' | 'vocal'; peaks: Peaks }
  | { seq: number; type: 'mix'; section: number; peaks: Peaks }
  | { seq: number; type: 'join' | 'texture' | 'master'; peaks: Peaks }
  | { seq: number; type: 'done'; mode: R2Mode; samples: number; song?: unknown };

export type OnEvent = (e: R2Event) => void;

type WithoutSeq<T> = T extends unknown ? Omit<T, 'seq'> : never;
/** An event before the emitter numbers it. */
export type R2Body = WithoutSeq<R2Event>;

/** Numbers events 0, 1, 2 ... and hands them to the listener. One emitter per render. */
export interface Emitter { emit(body: R2Body): void }

/** The emitter for a listener, or undefined without one (callers test `if (em)`). */
export function createEmitter(onEvent?: OnEvent): Emitter | undefined {
  if (!onEvent) return undefined;
  let seq = 0;
  return { emit: (body) => onEvent({ ...body, seq: seq++ } as R2Event) };
}

/**
 * A voice's stage tap: called with a stage name and the buffer right after that stage. The listener summarises the
 * buffer at once (peaks), so the voice never copies. `isEnv` marks an envelope curve, which also gets an Env summary.
 */
export type Tap = (stage: string, buf: ArrayLike<number>, isEnv?: boolean) => void;
