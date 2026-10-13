/**
 * DJ-IDLE-CPU: Chrome processes every AnalyserNode each audio quantum, with
 * everything upstream of it, whether anything reads it. Measured 2026-10-12
 * on a silent app: cutting the whole graph from the output still left 17 % of
 * a core, pulled by 22 analysers - 15 of them the dub bus's probes, which kept
 * a switched-off bus running. A measuring tap now joins the graph only while
 * the app sounds (engine/audio/signalPresence.ts tapWhileSounding).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tapWhileSounding, _setSoundingForTest } from '../audio/signalPresence';

afterEach(() => _setSoundingForTest(false));

describe('a measuring tap', () => {
  it('is out of the graph while the app is silent, joins on the first sound, leaves after silence', () => {
    const log: string[] = [];
    _setSoundingForTest(false);
    const dispose = tapWhileSounding(() => log.push('connect'), () => log.push('disconnect'));
    expect(log).toEqual([]);
    _setSoundingForTest(true);
    expect(log).toEqual(['connect']);
    _setSoundingForTest(true);
    expect(log).toEqual(['connect']);
    _setSoundingForTest(false);
    expect(log).toEqual(['connect', 'disconnect']);
    _setSoundingForTest(true);
    dispose();
    expect(log).toEqual(['connect', 'disconnect', 'connect', 'disconnect']);
    _setSoundingForTest(false);
    _setSoundingForTest(true);
    expect(log).toHaveLength(4);   // disposed: never rejoins
  });
});

describe('every always-on analyser goes through it', () => {
  const src = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('the dub bus probes', () => {
    const s = src('src/engine/dub/DubBus.ts');
    for (const probe of ['phaserInProbe', 'phaserOutProbe', 'sweepOutProbe', '_inputProbe', '_returnProbe', '_clipInProbe', '_clipRefProbe']) {
      expect(s, probe).not.toMatch(new RegExp(`\\.connect\\(this\\.${probe}\\)`));
    }
    expect(s).toMatch(/this\._tap\(node, analyser, this\._stageUntaps\)/);
    expect(s).toMatch(/this\._preInsertUntap = tapWhileSounding/);
  });

  it('the master analysers a visualizer holds (the tracker scope strip holds them while mounted)', () => {
    expect(src('src/engine/ToneEngine.ts')).toMatch(/const want = this\.analyserHolds\.held && isSounding\(\);/);
  });

  it('the deck scopes and meter, the DJ master meter and the master effect taps', () => {
    expect(src('src/engine/dj/DeckEngine.ts')).toMatch(/this\._untapScope = tapWhileSounding/);
    expect(src('src/engine/dj/DeckEngine.ts')).toMatch(/this\._untapMeter = tapWhileSounding/);
    expect(src('src/engine/dj/DJMixerEngine.ts')).toMatch(/this\.untapMasterMeter = tapWhileSounding/);
    expect(src('src/engine/tone/MasterEffectsChain.ts')).toMatch(/tapWhileSounding\(\(\) => preNative\.connect\(pre\)/);
    expect(src('src/engine/tone/MasterEffectsChain.ts')).toMatch(/tapWhileSounding\(\(\) => postNative\.connect\(post\)/);
  });

  it('a switched-off dub bus leaves the graph while the app is silent, and returns on sound or on switch-on', () => {
    const s = src('src/engine/dub/DubBus.ts');
    expect(s).toMatch(/const detach = !this\.enabled && !isSounding\(\) && !this\._disposed;/);
    expect(s).toMatch(/this\._unsubReturnAttach = subscribeSounding\(\(\) => this\._syncReturnAttached\(\)\);/);
    expect(s).toMatch(/this\.enabled = settings\.enabled;\n\s*this\._syncReturnAttached\(\);/);
  });

  it('the reverse-echo capture and the move audit meters (they kept the bus input and every channel send running)', () => {
    const bus = src('src/engine/dub/DubBus.ts');
    expect(bus).toMatch(/\(\) => \{ this\.input\.connect\(node\); silencer\.connect\(destination\); \}/);
    expect(bus).not.toMatch(/silencer\.connect\(this\.context\.destination\)/);
    const audit = src('src/engine/dub/moveAudibilityLog.ts');
    expect(audit).toMatch(/joinMeters\(want\);/);
    expect(audit).not.toMatch(/node\.connect\(an\);\n\s*return/);
  });
});
