/**
 * speechChain.test.ts — a new utterance must silence the previous one.
 *
 * The Speak & Spell synth plays multi-word text one word at a time, scheduling the
 * next word on a timer. Each step used to guard itself with `if (!this._speakingChain)
 * return`, which cannot tell "no chain" from "a NEWER chain": retriggering while a
 * sentence was still playing left the previous sentence's timer pending, and when it
 * fired it saw the *new* chain's truthy flag and resumed the OLD word list on top of
 * the new one. Two voices at once, and roughly double amplitude where they overlapped
 * — which is exactly what "it sounds like it plays two things at the same time"
 * describes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeechChain } from '../SpeechChain';

describe('SpeechChain', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('drops a pending step once a new utterance has begun', () => {
    const chain = new SpeechChain();
    const oldWords = vi.fn();
    const newWords = vi.fn();

    const first = chain.begin();
    chain.schedule(first, oldWords, 500);

    // Retrigger before the first utterance finished.
    const second = chain.begin();
    chain.schedule(second, newWords, 500);

    vi.advanceTimersByTime(2000);

    expect(oldWords).not.toHaveBeenCalled();
    expect(newWords).toHaveBeenCalledTimes(1);
  });

  it('runs steps belonging to the current utterance', () => {
    const chain = new SpeechChain();
    const step = vi.fn();

    const generation = chain.begin();
    chain.schedule(generation, step, 300);
    vi.advanceTimersByTime(299);
    expect(step).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('cancel() stops everything pending and leaves no timers behind', () => {
    const chain = new SpeechChain();
    const step = vi.fn();

    const generation = chain.begin();
    chain.schedule(generation, step, 100);
    chain.schedule(generation, step, 200);
    expect(chain.pendingCount).toBe(2);

    chain.cancel();
    expect(chain.pendingCount).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(step).not.toHaveBeenCalled();
  });

  it('keeps chained steps running across a whole utterance', () => {
    const chain = new SpeechChain();
    const spoken: string[] = [];
    const words = ['hello', 'world', 'again'];

    const generation = chain.begin();
    let i = 0;
    const playNext = () => {
      if (!chain.isCurrent(generation)) return;
      if (i >= words.length) return;
      spoken.push(words[i++]);
      chain.schedule(generation, playNext, 250);
    };
    playNext();

    vi.advanceTimersByTime(1000);
    expect(spoken).toEqual(words);
  });
});
