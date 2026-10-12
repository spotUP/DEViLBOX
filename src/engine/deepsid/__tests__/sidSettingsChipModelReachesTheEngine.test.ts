/**
 * The SID Settings chip model reaches the engine that plays the tune.
 *
 * Bug (SID-DECK-AUDIT 3 finding, owner 2026-10-12): "Chip Model Override" in
 * SID Settings was local component state - no engine ever read it, so every
 * tune played on its header's model whatever the user chose.
 *
 * Drives C64SIDEngine.init (the playback entry point) with the setting from
 * the settings store: jsSID through the real library (its synthesis model,
 * getmodel()), WebSID through its engine contract (the model forced after the
 * load, and a change while playing). Commando's header says 6581.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const holder = vi.hoisted(() => ({ module: null as unknown, websid: [] as Array<{ config: Record<string, unknown>; models: string[] }> }));

vi.mock('../DeepSIDEngineManager', async (orig) => ({
  ...(await orig<typeof import('../DeepSIDEngineManager')>()),
  deepSIDManager: { loadEngine: async () => holder.module },
}));
vi.mock('../engines/ScriptNodePlayerEngine', () => ({
  ScriptNodePlayerEngine: class {
    rec: { config: Record<string, unknown>; models: string[] };
    constructor(_data: Uint8Array, _type: string, config: Record<string, unknown>) { this.rec = { config, models: [] }; holder.websid.push(this.rec); }
    async init() {}
    setChipModel(m: string) { this.rec.models.push(m); }
    dispose() {}
  },
}));

import { C64SIDEngine } from '../../C64SIDEngine';
import { useSettingsStore } from '@/stores/useSettingsStore';

const commando = () => new Uint8Array(readFileSync(join(__dirname, '../../../lib/sid/__tests__/fixtures/Commando.sid')));

function stubContext(): AudioContext {
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1 }, delayTime: { value: 0 }, onaudioprocess: null });
  return { sampleRate: 44100, state: 'running', destination: node(), createGain: node, createChannelSplitter: node, createChannelMerger: node, createDelay: node, createScriptProcessor: node } as unknown as AudioContext;
}

let jsSIDModule: unknown;
beforeAll(() => {
  class StubAudioContext {
    sampleRate = 44100;
    state = 'running';
    createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
  }
  vi.stubGlobal('AudioContext', StubAudioContext);
  const code = readFileSync(join(__dirname, '../../../../public/deepsid/jsSID-modified.js'), 'utf8');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  jsSIDModule = { jsSID: new Function(`${code}\nreturn jsSID;`)() };
});

afterEach(() => {
  useSettingsStore.getState().setSidChipModel('auto');
  holder.websid = [];
});

describe('SID Settings chip model reaches the playing engine', () => {
  it('jsSID: a forced 8580 synthesises a 6581 tune as an 8580, and switching back while loaded reaches it', async () => {
    useSettingsStore.setState({ sidEngine: 'jssid' });
    holder.module = jsSIDModule;
    useSettingsStore.getState().setSidChipModel('8580');
    const engine = new C64SIDEngine(commando());
    await engine.init(stubContext());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jssid = (engine as any).engine;
    expect(jssid.getMetadata().sidModel).toBe(8580);
    useSettingsStore.getState().setSidChipModel('auto');
    expect(jssid.getMetadata().sidModel).toBe(6581);
    engine.dispose();
  });

  it('WebSID: a forced model is applied after the load; auto leaves the header to WebSID; a change while playing reaches it', async () => {
    useSettingsStore.setState({ sidEngine: 'websid' });
    holder.module = {};
    const auto = new C64SIDEngine(commando());
    await auto.init(stubContext());
    expect(holder.websid[0].config.forceChipModel).toBeUndefined();
    auto.dispose();

    useSettingsStore.getState().setSidChipModel('8580');
    const forced = new C64SIDEngine(commando());
    await forced.init(stubContext());
    expect(holder.websid[1].config).toMatchObject({ chipModel: '8580', forceChipModel: '8580' });
    useSettingsStore.getState().setSidChipModel('6581');
    expect(holder.websid[1].models).toEqual(['6581']);
    forced.dispose();
    // A disposed engine no longer follows the setting.
    useSettingsStore.getState().setSidChipModel('8580');
    expect(holder.websid[1].models).toEqual(['6581']);
  });
});
