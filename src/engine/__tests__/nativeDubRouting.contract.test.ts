import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');

function read(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

describe('native dub routing contracts', () => {
  it('bootstraps dub wiring from DrumPadEngine instead of waiting for DubDeckStrip', () => {
    const source = read('engine/drumpad/DrumPadEngine.ts');
    expect(source).toContain('mgr.setupDubBusWiring(this.dubBus.inputNode, this.dubBus);');
    expect(source).toContain("this.dubBus.registerWholeMixTap('tracker-master-input', trackerMix);");
    expect(source).toContain('this.dubBus.setChannelActivationCallback((ch, amt) => {');
  });

  it('registers whole-mix dub sends for stereo-only native players', () => {
    const source = read('engine/replayer/NativeEngineRouting.ts');
    expect(source).toContain('function registerWholeMixDubSend(');
    expect(source).toContain('registerWholeMixDubSend(`native:${desc.synthType}`, instance.output);');
    expect(source).toContain("registerWholeMixDubSend('native:CheeseCutterSynth', cc.output);");
    expect(source).toContain("registerWholeMixDubSend('native:SymphonieSynth', node);");
    expect(source).toContain("registerWholeMixDubSend(`native:${inst.synthType}`, toneEngine.getNativeEngineOutput(inst.synthType));");
    expect(source).toContain('unregisterWholeMixDubSend(`native:${st}`);');
  });

  it('falls back to whole-mix taps instead of retrying dead isolation routes forever', () => {
    const source = read('engine/tone/ChannelRoutedEffects.ts');
    // Gated on a USABLE fallback, not merely a registered tap object.
    //
    // The original intent holds: an engine that will never expose per-channel
    // outputs should stop trying and let the shared tap carry the send.
    // `hasWholeMixTap()` could not express that, because a tap is registered
    // unconditionally at DrumPadEngine construction ('tracker-master-input'),
    // so it is effectively always true — every engine hit the bailout, and a
    // transient "not ready yet" became permanent. That is why AHX reported
    // registeredChannelTaps: 0 while Hively is fully isolation-capable
    // (37 worklet outputs); libopenmpt only escaped it by already being
    // instantiated as the main playback engine when the first fader moved.
    //
    // On an isolation-capable engine the shared tap is deliberately silenced,
    // so bailing out leaves the channel with NO audio rather than a degraded
    // path — activation must retry instead.
    expect(source).toContain('if (getActiveDubBus()?.hasUsableWholeMixFallback()) {');
    expect(source).not.toContain('if (getActiveDubBus()?.hasWholeMixTap()) {');
    expect(source).toContain('if (TFMXEngine.hasInstance()) return null;');
  });

  it('mirrors mixer dub-send writes into the whole-mix fallback path', () => {
    const source = read('stores/useMixerStore.ts');
    expect(source).toContain('getActiveDubBus()?.setWholeMixDubSend(ch, clamped);');
  });
});
