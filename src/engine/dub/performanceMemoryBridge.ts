/**
 * Wires the Gate D `PerformanceMemory` to the live `DubRouter` stream.
 *
 * Kept out of `src/lib/dub/` so the context itself stays pure and testable
 * without an engine. This is the only place that knows the memory and the
 * router exist in the same program.
 *
 * The memory listens to the ROUTER, not to AutoDub, because the router is the
 * single execution path for every surface — hands, MIDI, pads, lane playback,
 * MCP and the AI. A performer that only remembered its own fires would keep
 * throwing echo into a channel the user just threw echo into.
 */

import { subscribeDubRouter, subscribeDubRelease } from './DubRouter';
import { PerformanceMemory } from '@/lib/dub/performanceContext';

let _memory: PerformanceMemory | null = null;
let _detach: (() => void) | null = null;

/**
 * The process-wide performance memory, attached to the router on first use.
 *
 * One memory, because there is one performer and one dub bus; a second one
 * would see half the moves.
 */
export function getPerformanceMemory(): PerformanceMemory {
  if (!_memory) {
    _memory = new PerformanceMemory();
    attachPerformanceMemory(_memory);
  }
  return _memory;
}

/** Subscribe a memory to the router. Returns an unsubscribe fn. */
export function attachPerformanceMemory(memory: PerformanceMemory): () => void {
  const offFire = subscribeDubRouter(event => {
    memory.noteFire({
      invocationId: event.invocationId,
      moveId: event.moveId,
      channelId: event.channelId,
      row: event.row,
      timeSec: event.timeSec,
      source: event.source,
      isHold: event.isHold,
    });
  });
  const offRelease = subscribeDubRelease(event => {
    memory.noteRelease({
      invocationId: event.invocationId,
      row: event.row,
      timeSec: event.timeSec,
    });
  });
  const detach = () => { offFire(); offRelease(); };
  _detach = detach;
  return detach;
}

/** Drop the singleton and its subscriptions — song change, teardown, tests. */
export function resetPerformanceMemory(): void {
  _detach?.();
  _detach = null;
  _memory = null;
}
