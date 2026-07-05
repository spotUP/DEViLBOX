/**
 * Sonix synth registration — makes SonixSynth a first-class editable voice, and wires
 * the WASM→store param bridge.
 *
 * Faithful Sonix synthesis runs in the WASM replayer (note-suppressed during song
 * playback, so this voice is only used for editor auditioning). The param bridge mirrors
 * the WASM's parsed per-instrument synth params into config.parameters.sonix after each
 * module loads, so the SonixControls editor can read/edit them; edits flow back to the
 * live WASM via SonixSynth.applyConfig → SonixEngine.setSynthParams.
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { SonixSynth } from '../../sonix/SonixSynth';
import { SonixEngine, type SonixSynthParams } from '../../sonix/SonixEngine';

const sonixDesc: SynthDescriptor = {
  id: 'SonixSynth',
  name: 'Sonix Synthesizer',
  category: 'native',
  loadMode: 'eager',
  useSynthBus: true,
  controlsComponent: 'SonixControls',
  create: (config) => {
    const synth = new SonixSynth(config);
    synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);
    return synth;
  },
  onTriggerAttack: (synth, note, time, velocity) => {
    (synth as SonixSynth).triggerAttack(note, time, velocity);
    return true;
  },
  onTriggerRelease: (synth, note, time) => {
    (synth as SonixSynth).triggerRelease(note, time);
    return true;
  },
};

SynthRegistry.register(sonixDesc);

// ── WASM → store param bridge ────────────────────────────────────────────────
// When the SonixEngine reports its parsed synth params (after load_instruments),
// merge each into the matching instrument config (tagged with parameters.sonixIndex
// by IffSmusParser) and mark it as a first-class SonixSynth so the editor picks it up.
let bridgeRegistered = false;
function registerSonixSynthParamBridge(): void {
  if (bridgeRegistered) return;
  bridgeRegistered = true;
  SonixEngine.onSynthParams = async (params: SonixSynthParams[]) => {
    if (!params.length) return;
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const store = useInstrumentStore.getState();
    for (const p of params) {
      const inst = store.instruments.find(
        (c) => (c.parameters as Record<string, unknown> | undefined)?.sonixIndex === p.index,
      );
      if (!inst) continue;
      store.updateInstrument(inst.id, {
        type: 'synth',
        synthType: 'SonixSynth',
        parameters: { sonixIndex: p.index, sonix: p },
      } as Parameters<typeof store.updateInstrument>[1]);
    }
  };
}

registerSonixSynthParamBridge();
