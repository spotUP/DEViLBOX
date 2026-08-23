/**
 * textToTokensSmartAsync.test.ts — the async G2P router.
 *
 * Typed words go through the best converter available (eSpeak-NG in the app,
 * injected here); bracketed phoneme notation NEVER goes through a converter —
 * it is an explicit instruction to speak exactly that sequence. A converter
 * miss falls back to skipping the word, and the SAM fallback is exercised via
 * the default converter in an espeak-less environment (this test process).
 */
import { describe, it, expect } from 'vitest';
import { textToTokensSmartAsync, type PhonemeToken } from '../Reciter';

const converterOf = (map: Record<string, string[]>, calls: string[]) =>
  async (word: string): Promise<PhonemeToken[] | null> => {
    calls.push(word);
    const codes = map[word];
    return codes ? codes.map(code => ({ code, stress: 1 })) : null;
  };

describe('textToTokensSmartAsync', () => {
  it('routes plain words through the converter', async () => {
    const calls: string[] = [];
    const tokens = await textToTokensSmartAsync(
      'HELLO WORLD',
      converterOf({ HELLO: ['/H', 'EH', 'L*', 'OW'], WORLD: ['W*', 'ER', 'L*', 'D*'] }, calls),
    );
    expect(calls).toEqual(['HELLO', 'WORLD']);
    expect(tokens?.map(t => t.code)).toEqual(
      ['/H', 'EH', 'L*', 'OW', ' ', 'W*', 'ER', 'L*', 'D*'],
    );
  });

  it('never sends bracketed notation to the converter', async () => {
    const calls: string[] = [];
    const tokens = await textToTokensSmartAsync(
      'MACHINE [DH* AH N*]',
      converterOf({ MACHINE: ['M*', 'AH'] }, calls),
    );
    expect(calls).toEqual(['MACHINE']); // the bracketed span parsed literally
    expect(tokens?.map(t => t.code)).toContain('DH');
  });

  it('skips a word the converter cannot resolve, keeps the rest', async () => {
    const calls: string[] = [];
    const tokens = await textToTokensSmartAsync(
      'XYZZY HELLO',
      converterOf({ HELLO: ['/H', 'EH'] }, calls),
    );
    expect(tokens?.map(t => t.code)).toEqual(['/H', 'EH']);
  });

  it('falls back to SAM rules when eSpeak-NG is not loaded (default converter)', async () => {
    // This process has no espeak worker, so the default converter must still
    // produce tokens via SAM.
    const tokens = await textToTokensSmartAsync('HELLO');
    expect(tokens).not.toBeNull();
    expect(tokens!.length).toBeGreaterThan(0);
  });

  it('returns null for empty input', async () => {
    expect(await textToTokensSmartAsync('', async () => null)).toBeNull();
  });
});
