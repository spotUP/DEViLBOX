/**
 * Compliance Test Harness
 * 
 * Helper functions to simulate tracker playback tick-by-tick
 * and verify the state of effect handlers.
 */

import { type FormatHandler, type ChannelState } from '../types';

export interface TestStep {
  note?: string | null;
  instrument?: number | null;
  volume?: number | null;
  effect?: string | null;
}

export interface ExpectedState {
  period?: number;
  volume?: number;
  pan?: number;
  triggerNote?: boolean;
  cutNote?: boolean;
  frequency?: number;
}

/**
 * Run a single row through the handler and return the state after N ticks
 */
export function runRow(
  handler: FormatHandler,
  channel: number,
  step: TestStep,
  ticks: number,
  initialState?: Partial<ChannelState>
) {
  const state = handler.getChannelState(channel);
  if (initialState) {
    Object.assign(state, initialState);
  }

  // Tick 0
  const tick0Result = handler.processRowStart(
    channel,
    step.note ?? null,
    step.instrument ?? null,
    step.volume ?? null,
    step.effect ?? null,
    state
  );

  const results = [tick0Result];

  // Ticks 1 to N-1
  for (let t = 1; t < ticks; t++) {
    results.push(handler.processTick(channel, t, state));
  }

  return { state, results };
}

/**
 * Mock context for handlers
 */
export const mockConfig = {
  initialSpeed: 6,
  initialTempo: 125,
  numChannels: 4,
};
