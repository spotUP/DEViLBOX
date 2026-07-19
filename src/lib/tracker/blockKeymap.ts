/**
 * FT2-scheme Alt block-operation keymap (pure decider).
 *
 * Historically these bindings lived in a THIRD window-level keydown listener
 * inside `useBlockOperations`, running in parallel with the per-view capture
 * handler in `useTrackerInput`. That listener neither set nor respected the
 * `__handled` sentinel, so in IT/Schism mode Alt+C/etc. double-fired, and its
 * `Alt+Shift+T` (transpose down) branch was unreachable because the earlier
 * `Alt+T` case did not exclude Shift.
 *
 * The mapping now lives here as a single pure function consumed only by
 * `useTrackerInput` (the one authoritative keyboard pipeline). Keeping it pure
 * lets it be unit-tested without a DOM (jsdom has no layout, Playwright is
 * forbidden in this project).
 *
 * FT2 block keys only fire when the IT scheme is INACTIVE — IT owns its own,
 * richer Alt map in `useTrackerInput`.
 */

export type BlockKeyAction =
  | { kind: 'markStart' }
  | { kind: 'markEnd' }
  | { kind: 'copy' }
  | { kind: 'paste' }
  | { kind: 'cut' }
  | { kind: 'transpose'; semitones: 1 | -1 }
  | { kind: 'reverse' };

export interface BlockKeyInput {
  /** The raw `KeyboardEvent.key` (case-insensitive here). */
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** IT/Schism scheme active — FT2 block keys are suppressed when true. */
  isIT: boolean;
}

/**
 * Resolve an FT2 Alt block shortcut. Returns null when the event is not an
 * FT2 block operation (wrong modifiers, IT mode active, or an unmapped key).
 */
export function resolveFt2BlockKey(input: BlockKeyInput): BlockKeyAction | null {
  if (!input.altKey || input.ctrlKey || input.metaKey) return null;
  if (input.isIT) return null; // IT scheme owns its own Alt map

  const k = input.key.toLowerCase();
  switch (k) {
    case 'b': return input.shiftKey ? null : { kind: 'markStart' };
    case 'e': return input.shiftKey ? null : { kind: 'markEnd' };
    case 'c': return input.shiftKey ? null : { kind: 'copy' };
    case 'v':
    case 'p': return input.shiftKey ? null : { kind: 'paste' };
    case 'x': return input.shiftKey ? null : { kind: 'cut' };
    // Alt+Shift+T = transpose down, Alt+T = transpose up. The Shift variant was
    // previously dead code; it is now reachable via the same case.
    case 't': return { kind: 'transpose', semitones: input.shiftKey ? -1 : 1 };
    case 'r': return input.shiftKey ? null : { kind: 'reverse' };
    default:  return null;
  }
}
