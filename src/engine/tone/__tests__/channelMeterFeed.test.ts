import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ChannelMeterFeed } from '../channelMeterFeed';
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
  'libopenmpt/LibopenmptEngine',
];

describe('engines feed per-frame levels through the split feed, never as note triggers', () => {
  it.each(ENGINES)('%s', (name) => {
    const src = readFileSync(resolve(__dirname, '../../', `${name}.ts`), 'utf8');
    expect(src).toContain('meterFeed.feed(');
    expect(src).not.toMatch(/engine\.triggerChannelMeter\(/);
  });
});
