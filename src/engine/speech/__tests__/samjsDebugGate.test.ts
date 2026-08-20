/**
 * samjsDebugGate.test.ts — SamJs.convert() must not print debug output.
 *
 * The vendored SamJs documents `options.debug` (default false) but shipped with
 * the debug prints unconditional — every textToPhonemes call spammed the
 * browser console and broke headless tools that parse stdout. The gate must
 * stay off by default.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-expect-error -- SamJs is a JavaScript library without types
import SamJs from '../../sam/samjs';

describe('SamJs debug gate', () => {
  afterEach(() => vi.restoreAllMocks());

  it('convert() prints nothing by default', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    SamJs.convert('HELLO WORLD ZEBRA QUICK VEX BOY JUDGE');
    expect(spy).not.toHaveBeenCalled();
  });

  it('convert() prints phoneme tables when debug is requested', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    new SamJs({ debug: true });
    SamJs.convert('HELLO');
    expect(spy).toHaveBeenCalled();
  });
});