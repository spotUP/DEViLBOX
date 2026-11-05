/**
 * Sound Factory voice walk follows the replayer (soundfactory.c:744-757): Goto/GoSub targets are relative to the end of
 * the 4-byte operand, and a voice ends at the song's loop point (a Goto that lands on an already walked command).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSoundFactoryWithEffects } from '../SoundFactoryParser';
import { tokenizeSoundFactory } from '../soundFactoryStream';

const DIRS: Record<string, string> = { 'goldrunner.psf': 'formats', 'oriental.psf': 'soundfactory' };
const load = (n: string) => new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs', DIRS[n], n)));
/** Notes on the replayer's single pass (findings file: 2078 note tokens in the whole opcode region, all reachable). */
const GOLDRUNNER_NOTES = 2078;

function walk(name: string) {
  const bytes = load(name);
  const parse = parseSoundFactoryWithEffects(bytes, name)!;
  const starts = new Set(tokenizeSoundFactory(bytes)!.tokens.map((t) => t.start));
  const events = parse.voiceEvents.flat().filter((e) => e.fileOffset >= 0);
  return { parse, starts, events };
}

describe('Sound Factory voice walk', () => {
  for (const name of Object.keys(DIRS)) {
    it(`${name}: every event sits on a token start`, () => {
      const { starts, events } = walk(name);
      expect(events.length).toBeGreaterThan(0);
      expect(events.filter((e) => !starts.has(e.fileOffset))).toEqual([]);
    });
  }

  it('goldrunner: one pass of the song, no phantom 0x8000 durations, 6 effects', () => {
    const { parse, events } = walk('goldrunner.psf');
    expect(events.filter((e) => e.duration >= 0x8000)).toEqual([]);
    expect(events.filter((e) => e.isNote).length).toBe(GOLDRUNNER_NOTES);
    expect(parse.effectsSeen).toBe(6);
  });
});
