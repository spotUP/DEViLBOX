/**
 * Loading many songs in a row made DEViLBOX slower and slower: every engine
 * start registered a position callback on a singleton engine and dropped the
 * unsubscriber, so callbacks piled up for the life of the page and each
 * position report ran all of them. Stopping the engines now releases them.
 */
import { describe, it, expect } from 'vitest';
import { trackSubscription, stopNativeEngines, engineSubscriptionCount } from '../NativeEngineRouting';

describe('engine position subscriptions', () => {
  it('are released when the engines stop, so song loads do not pile callbacks up', () => {
    let released = 0;
    for (let i = 0; i < 5; i++) trackSubscription(() => { released++; });
    expect(engineSubscriptionCount()).toBe(5);
    stopNativeEngines(null, new Set(), null);
    expect(released).toBe(5);
    expect(engineSubscriptionCount()).toBe(0);
  });
});
