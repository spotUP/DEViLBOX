import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ChannelMeterFeed, registerChannelMeterSink } from '../channelMeterFeed';
import { countRowNoteStarts } from '../../libopenmpt/LibopenmptEngine';
import { engineFedMeterTarget } from '@/components/tracker/waveformVuLevel';

function sink() {
  const triggers: Array<[number, number]> = [];
  const levels: number[][] = [];
  return {
    triggers, levels,
    triggerChannelMeter: (i: number, v: number) => { triggers.push([i, v]); },
    updateRealtimeChannelLevels: (l: number[]) => { levels.push([...l]); },
  };
}

describe('engine channel level feed with counted note starts', () => {
  it('a rise in the count flashes even when the level never moved', () => {
    const s = sink(); const f = new ChannelMeterFeed();
    f.feedCounted(s, [0.5], [1]); f.feedCounted(s, [0.5], [1]); f.feedCounted(s, [0.5], [2]);
    expect(s.triggers).toEqual([[0, 0.5], [0, 0.5]]);
  });
  it('a new song counting from zero again still flashes on its first note', () => {
    const s = sink(); const f = new ChannelMeterFeed();
    f.feedCounted(s, [0.5], [7]); f.feedCounted(s, [0.5], [1]);
    expect(s.triggers).toEqual([[0, 0.5], [0, 0.5]]);
  });
  it('a counted note still silent at its report flashes when it first sounds', () => {
    const s = sink(); const f = new ChannelMeterFeed();
    f.feedCounted(s, [0], [1]); f.feedCounted(s, [0], [1]); f.feedCounted(s, [0.4], [1]); f.feedCounted(s, [0.4], [1]);
    expect(s.triggers).toEqual([[0, 0.4]]);
  });
  it('a silent channel stays dark even if its count rises', () => {
    const s = sink(); const f = new ChannelMeterFeed();
    f.feedCounted(s, [0], [3]);
    expect(s.triggers).toEqual([]);
    expect(s.levels).toEqual([[0]]);
  });
});

describe('engine channel level feed', () => {
  it('a steady level gives no new note flashes in trigger mode', () => {
    const s = sink(); const f = new ChannelMeterFeed();
    for (let k = 0; k < 10; k++) f.feed(s, [0.6, 0.4]);
    expect(s.triggers).toEqual([[0, 0.6], [1, 0.4]]); // the first frame is the note start; nothing after
  });
  it('a note start flashes again after the level dropped', () => {
    const s = sink(); const f = new ChannelMeterFeed();
    f.feed(s, [0.6]); f.feed(s, [0.1]); f.feed(s, [0.8]);
    expect(s.triggers).toEqual([[0, 0.6], [0, 0.8]]);
  });
  it('live mode always receives the level, every frame', () => {
    const s = sink(); const f = new ChannelMeterFeed();
    f.feed(s, new Float32Array([0.5, 0]));
    f.feed(s, new Float32Array([0.5, 0]));
    expect(s.levels).toEqual([[0.5, 0], [0.5, 0]]);
  });
  it('a silent channel stays dark: no flash at all', () => {
    const s = sink(); const f = new ChannelMeterFeed();
    for (let k = 0; k < 5; k++) f.feed(s, [0, 0.01]);
    expect(s.triggers).toEqual([]);
  });
  it('meter target: steady level is dark in trigger mode, follows in live mode', () => {
    expect(engineFedMeterTarget('trigger', 0.6, 0.6)).toBe(0);
    expect(engineFedMeterTarget('realtime', 0.6, 0.6)).toBe(0.6);
  });
});

const ENGINES = [
  'jamcracker/JamCrackerEngine', 'uade/UADEEngine', 'ma/MaEngine', 'sidmon1/SidMon1ReplayerEngine',
  'pumatracker/PumaTrackerEngine', 'futureplayer/FuturePlayerEngine', 'klystrack/KlysEngine',
  'pretracker/PreTrackerEngine', 'steveturner/SteveTurnerEngine', 'artofnoise/ArtOfNoiseEngine',
];

describe('libopenmpt flashes on the pattern rows, not on VU jumps', () => {
  it('counts a note per channel row, ignoring empty cells, note cut and note off', () => {
    const counts: number[] = [];
    // two channels, six numbers each, note first: C-5 (61) | note cut (254)
    countRowNoteStarts(counts, [61, 1, 0, 0, 0, 0, 254, 0, 0, 0, 0, 0]);
    countRowNoteStarts(counts, [0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0]);
    countRowNoteStarts(counts, [48, 1, 0, 0, 0, 0, 60, 2, 0, 0, 0, 0]);
    expect(counts).toEqual([2, 1]);
  });
  it('the engine reports the counts with its levels', () => {
    const src = readFileSync(resolve(__dirname, '../../libopenmpt/LibopenmptEngine.ts'), 'utf8');
    expect(src).toContain('meterFeed.report(chLevels, this._noteStarts)');
    expect(src).not.toContain('meterFeed.feed(');
  });
});

describe('engines feed per-frame levels through the split feed, never as note triggers', () => {
  it.each(ENGINES)('%s', (name) => {
    const src = readFileSync(resolve(__dirname, '../../', `${name}.ts`), 'utf8');
    expect(src).toContain('meterFeed.report(');
    expect(src).not.toMatch(/engine\.triggerChannelMeter\(/);
  });
});

// The engines report to the meters ToneEngine registers, not to a ToneEngine
// they import (that import put them in the store import cycle).
describe('an engine level report reaches the registered meters', () => {
  it('counted when the engine reports note starts, by level jump otherwise', () => {
    const s = sink();
    registerChannelMeterSink(s);
    try {
      const counted = new ChannelMeterFeed();
      counted.report([0.5], [1]); counted.report([0.5], [2]);
      expect(s.triggers).toEqual([[0, 0.5], [0, 0.5]]); // a retrigger at the same level still flashes
      const byLevel = new ChannelMeterFeed();
      byLevel.report([0.5]); byLevel.report([0.5], null);
      expect(s.triggers.length).toBe(3); // a steady level flashes once
      expect(s.levels).toEqual([[0.5], [0.5], [0.5], [0.5]]);
    } finally { registerChannelMeterSink(null); }
  });
  it('ToneEngine registers itself as the meters when it is created', () => {
    const src = readFileSync(resolve(__dirname, '../../ToneEngine.ts'), 'utf8');
    expect(src).toContain('registerChannelMeterSink(this);');
  });
  it('before ToneEngine exists there are no meters, and nothing is fed', () => {
    registerChannelMeterSink(null);
    expect(() => new ChannelMeterFeed().report([0.5], [1])).not.toThrow();
  });
});
