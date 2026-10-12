/**
 * Scratch performance states (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 50, 51; ledger SCR-P6.4): the performer is a state machine, not a timer.
 *
 *   IDLE -> LISTENING -> (opportunity, source, anchor, gesture) SETUP -> THROW -> SCRATCHING
 *   -> REST -> EVALUATE -> { REST, ANSWER (RESPONSE), ESCALATE (ESCALATING), RESOLVE (RESOLVING) }
 *
 * plus CALL / RESPONSE for a call and its answer and FEATURE for an arc. ABORTING is reachable
 * from every state and always ends in IDLE after the restore it is handed (section 60).
 * An illegal transition throws: a performer that jumps states is a bug, not a style.
 */

export type ScratchState =
  | 'IDLE' | 'LISTENING' | 'SETUP' | 'THROW' | 'SCRATCHING' | 'CALL' | 'RESPONSE'
  | 'ESCALATING' | 'FEATURE' | 'RESOLVING' | 'REST' | 'ABORTING';

export const SCRATCH_STATES: readonly ScratchState[] = [
  'IDLE', 'LISTENING', 'SETUP', 'THROW', 'SCRATCHING', 'CALL', 'RESPONSE', 'ESCALATING', 'FEATURE', 'RESOLVING', 'REST', 'ABORTING',
];

/** Section 51 transitions (ABORTING is added for every state; ABORTING only leads to IDLE). */
export const SCRATCH_TRANSITIONS: Readonly<Record<ScratchState, readonly ScratchState[]>> = {
  IDLE: ['LISTENING'],
  LISTENING: ['SETUP', 'REST', 'IDLE'],
  SETUP: ['THROW', 'SCRATCHING', 'CALL', 'FEATURE', 'LISTENING'],
  THROW: ['SCRATCHING', 'CALL', 'FEATURE'],
  SCRATCHING: ['REST', 'RESPONSE', 'ESCALATING', 'RESOLVING'],
  CALL: ['RESPONSE', 'REST'],
  RESPONSE: ['REST', 'CALL', 'ESCALATING', 'RESOLVING'],
  ESCALATING: ['FEATURE', 'SCRATCHING', 'RESOLVING'],
  FEATURE: ['RESOLVING', 'ESCALATING', 'REST'],
  RESOLVING: ['REST', 'LISTENING'],
  // EVALUATE happens on the way out of REST: rest on, answer, escalate, resolve - or listen again
  REST: ['LISTENING', 'SETUP', 'RESPONSE', 'ESCALATING', 'RESOLVING', 'IDLE'],
  ABORTING: ['IDLE'],
};

export interface StateChange { from: ScratchState; to: ScratchState; reason: string; bar?: number }

export class IllegalScratchTransition extends Error {
  constructor(from: ScratchState, to: ScratchState) {
    super(`[scratch] illegal state change ${from} -> ${to}`);
  }
}

export class ScratchStateMachine {
  private current: ScratchState = 'IDLE';
  readonly history: StateChange[] = [];
  private readonly limit: number;

  constructor(opts: { historyLimit?: number } = {}) {
    this.limit = opts.historyLimit ?? 64;
  }

  get state(): ScratchState { return this.current; }

  can(to: ScratchState): boolean {
    return to === 'ABORTING' ? this.current !== 'ABORTING' : SCRATCH_TRANSITIONS[this.current].includes(to);
  }

  go(to: ScratchState, reason: string, bar?: number): void {
    if (to === this.current) return;
    if (!this.can(to)) throw new IllegalScratchTransition(this.current, to);
    this.history.push({ from: this.current, to, reason, bar });
    if (this.history.length > this.limit) this.history.shift();
    this.current = to;
  }

  /** Walk a legal path (each step checked), e.g. SETUP -> THROW -> SCRATCHING. */
  path(states: readonly ScratchState[], reason: string, bar?: number): void {
    for (const s of states) this.go(s, reason, bar);
  }

  /** From any state: ABORTING, the restore, then IDLE (also when the restore throws). */
  abort(reason: string, restore: () => void, bar?: number): void {
    if (this.current === 'IDLE') return;
    this.go('ABORTING', reason, bar);
    try { restore(); } finally { this.go('IDLE', 'aborted', bar); }
  }
}
