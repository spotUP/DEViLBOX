import { describe, it, expect } from 'vitest';
import {
  markKeyHandled,
  isKeyHandled,
  KEY_HANDLED_PROP,
} from '../keyHandledSentinel';

/**
 * The two capture-phase window keydown pipelines (useGlobalKeyboardHandler and
 * useTrackerInput/useNoteInput/useEffectInput/useNavigationInput) coordinate ONLY
 * through this sentinel. If the producer's flag and the consumer's check ever used
 * different property names, every global shortcut would double-fire in the tracker
 * view with no compile error to catch it. These tests pin the contract.
 */

// jsdom-free: a bare object with the KeyboardEvent shape the helpers actually touch.
function fakeEvent(): KeyboardEvent {
  return {} as unknown as KeyboardEvent;
}

describe('keyHandledSentinel — cross-pipeline dedup contract', () => {
  it('a fresh event is not handled', () => {
    expect(isKeyHandled(fakeEvent())).toBe(false);
  });

  it('the global pipeline marking an event makes the tracker pipeline skip it', () => {
    const e = fakeEvent();
    // Producer (global handler) stamps the event.
    markKeyHandled(e);
    // Consumer (tracker input) sees the stamp and must bail.
    expect(isKeyHandled(e)).toBe(true);
  });

  it('marking is idempotent', () => {
    const e = fakeEvent();
    markKeyHandled(e);
    markKeyHandled(e);
    expect(isKeyHandled(e)).toBe(true);
  });

  it('the stamp is per-event, not global — an unmarked event stays unhandled', () => {
    const marked = fakeEvent();
    markKeyHandled(marked);
    const other = fakeEvent();
    expect(isKeyHandled(marked)).toBe(true);
    expect(isKeyHandled(other)).toBe(false);
  });

  it('producer and consumer share the exact same property name', () => {
    // Guards against a rename on one side silently reintroducing the double-fire.
    const e = fakeEvent();
    markKeyHandled(e);
    expect((e as unknown as Record<string, unknown>)[KEY_HANDLED_PROP]).toBe(true);
  });
});
