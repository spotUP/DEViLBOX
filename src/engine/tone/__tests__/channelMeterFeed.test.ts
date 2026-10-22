import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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
    expect(src).toContain('meterFeed.reportAt(chLevels, this._noteStarts,');
    expect(src).not.toContain('meterFeed.feed(');
  });
});

describe('ChannelMeterFeed.reportFromWorklet', () => {
  it('holds a worklet report until its block is heard, and feeds it on arrival with no context', () => {
    const { levels, triggerChannelMeter, updateRealtimeChannelLevels } = sink();
    registerChannelMeterSink({ triggerChannelMeter, updateRealtimeChannelLevels });
    try {
      const feed = new ChannelMeterFeed();
      // The block was read at audio time 1.0 and takes 50 ms to reach the speakers.
      feed.reportFromWorklet({ levels: [0.4], audioTime: 1.0 }, { currentTime: 1.0, outputLatency: 0.05 } as AudioContext);
      expect(levels).toEqual([]);
      // At 1.06 the first block is heard; the second (read at 1.06) is still held.
      feed.reportFromWorklet({ levels: [0.2], audioTime: 1.06 }, { currentTime: 1.06, outputLatency: 0.05 } as AudioContext);
      expect(levels).toEqual([[0.4]]);
      feed.clearHeld();
      const noContext = new ChannelMeterFeed();
      noContext.reportFromWorklet({ levels: [0.7], audioTime: 5 }, null);
      expect(levels[levels.length - 1]).toEqual([0.7]);
    } finally {
      registerChannelMeterSink(null);
    }
  });
});

describe('UADE meters show a block when it is heard', () => {
  it('the engine routes each level report through the shared hold and clears it on stop', () => {
    const src = readFileSync(resolve(__dirname, '../../uade/UADEEngine.ts'), 'utf8');
    expect(src).toContain('meterFeed.reportFromWorklet(data, this.audioContext)');
    expect(src).toMatch(/stop\(\): void \{\n    meterFeed\.clearHeld\(\);/);
  });
});

/** Every format engine under src/engine that takes channel levels from a worklet message. */
function levelEngineFiles(): string[] {
  const root = resolve(__dirname, '../..');
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full); }
      else if (/\.tsx?$/.test(entry.name) && /case '(chLevels|vu)'/.test(readFileSync(full, 'utf8'))) out.push(full);
    }
  };
  walk(root);
  return out;
}

describe('worklet level reports show a block when it is heard, in every engine', () => {
  const engines = levelEngineFiles().filter((f) => /new ChannelMeterFeed\(\)/.test(readFileSync(f, 'utf8')));

  it('finds the engines from the sources', () => {
    expect(engines.length).toBeGreaterThanOrEqual(11);
  });

  it('each routes its level message through reportFromWorklet, never report() on arrival', () => {
    for (const file of engines) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).toContain('.reportFromWorklet(');
      expect(src, file).not.toMatch(/[mM]eterFeed\.report\(/);
    }
  });

  it('each clears the held reports on stop and on load', () => {
    for (const file of engines) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).toMatch(/stop\(\): void \{\s*(\/\/[^\n]*\n\s*)?(this\.)?[mM]eterFeed\.clearHeld\(\)/);
      expect(src, file).toMatch(/async load(Tune|Song)\([^\n]*\{[^]*?[mM]eterFeed\.clearHeld\(\)/);
    }
  });

  it('each worklet stamps its level posts with audioTime', () => {
    const worklets = new Set<string>();
    for (const file of engines) {
      for (const m of readFileSync(file, 'utf8').matchAll(/[A-Za-z0-9]+\.worklet\.js/g)) worklets.add(m[0]);
    }
    const publicDir = resolve(__dirname, '../../../../public');
    let checked = 0;
    for (const dir of readdirSync(publicDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      for (const name of readdirSync(resolve(publicDir, dir.name))) {
        if (!worklets.has(name)) continue;
        const lines = readFileSync(resolve(publicDir, dir.name, name), 'utf8').split('\n')
          .filter((l) => /postMessage\(\{ type: '(chLevels|vu)'/.test(l));
        for (const line of lines) expect(line, `${dir.name}/${name}`).toContain('audioTime: currentTime');
        checked += lines.length;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(engines.length);
  });
});

describe('engines feed per-frame levels through the split feed, never as note triggers', () => {
  it.each(ENGINES)('%s', (name) => {
    const src = readFileSync(resolve(__dirname, '../../', `${name}.ts`), 'utf8');
    expect(src).toMatch(/eterFeed\.reportFromWorklet\(/);
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
