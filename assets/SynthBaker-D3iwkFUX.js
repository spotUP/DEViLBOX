import { getContext, Context, setContext } from "./vendor-tone-48TQc1H3.js";
import { c1 as InstrumentFactory } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
class SynthBaker {
  /**
   * Bake a synth instrument to a sample (AudioBuffer)
   * Renders a single C-4 note for 2 seconds.
   */
  static async bakeToSample(config, duration = 2, note = "C4") {
    const sampleRate = 44100;
    const offlineContext = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
    const originalContext = getContext();
    const offlineToneContext = new Context(offlineContext);
    setContext(offlineToneContext);
    try {
      const instrument = InstrumentFactory.createInstrument(config);
      if (instrument.connect) {
        instrument.connect(getContext().destination);
      }
      if (instrument.triggerAttackRelease) {
        instrument.triggerAttackRelease(note, duration * 0.8, 0);
      } else if (instrument.triggerAttack) {
        instrument.triggerAttack(note, 0);
        setTimeout(() => {
          if (instrument.triggerRelease) instrument.triggerRelease(note, duration * 0.8);
        }, duration * 800);
      }
      const renderedBuffer = await offlineContext.startRendering();
      if (instrument.dispose) instrument.dispose();
      return renderedBuffer;
    } finally {
      setContext(originalContext);
    }
  }
  /**
   * Compute smart duration from instrument envelope config.
   * Uses attack + decay + 0.3s sustain + release, clamped to 0.5s–4s.
   */
  static getSmartDuration(config) {
    const env = config.envelope;
    if (!env) return 2;
    const attackS = (env.attack ?? 10) / 1e3;
    const decayS = (env.decay ?? 500) / 1e3;
    const releaseS = (env.release ?? 100) / 1e3;
    const total = attackS + decayS + 0.3 + releaseS;
    return Math.max(0.5, Math.min(4, total));
  }
  /**
   * Bake a chord — render multiple notes through the same instrument,
   * mix into a single AudioBuffer, and normalize.
   */
  static async bakeChord(config, notes) {
    const duration = SynthBaker.getSmartDuration(config);
    const buffers = [];
    for (const note of notes) {
      buffers.push(await SynthBaker.bakeToSample(config, duration, note));
    }
    const sampleRate = buffers[0].sampleRate;
    const maxLength = Math.max(...buffers.map((b) => b.length));
    const mixed = new Float32Array(maxLength);
    for (const buf of buffers) {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        mixed[i] += data[i];
      }
    }
    let peak = 0;
    for (let i = 0; i < mixed.length; i++) {
      const abs = Math.abs(mixed[i]);
      if (abs > peak) peak = abs;
    }
    if (peak > 0) {
      const scale = 1 / peak;
      for (let i = 0; i < mixed.length; i++) {
        mixed[i] *= scale;
      }
    }
    const output = new AudioBuffer({
      length: maxLength,
      numberOfChannels: 1,
      sampleRate
    });
    output.copyToChannel(mixed, 0);
    return output;
  }
}
export {
  SynthBaker
};
