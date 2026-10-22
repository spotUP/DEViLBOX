/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * ReBirth's compressor as an AudioWorklet (re-rebirth src/audio/compressor.js, processor verbatim):
 * a mean-square level detector feeding a soft-knee static curve, gain smoothed in dB.
 * The processor source is a string so it can be loaded from a Blob URL (dev, production, headless).
 */
export const COMPRESSOR_PROCESSOR = 'rebirth-compressor';

export const COMPRESSOR_SOURCE = `
function registerCompressor() {
  const PARAMS = [
    ['thresholdDb', -20],
    ['kneeDb', 7],
    ['slope', 0], // 1 - 1/ratio
    ['makeupDb', 0],
    ['offsetDb', 0],
    ['detector', 0.015], // seconds: mean-square averaging
    ['attack', 0.03], // seconds: gain falling
    ['release', 0.037], // seconds: gain rising
  ];

  class Compressor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return PARAMS.map(([name, defaultValue]) => ({ name, defaultValue, automationRate: 'k-rate' }));
    }

    constructor() {
      super();
      this.ms = 0;
      this.g = 0; // current gain, dB
      this.sinceReport = 0;
    }

    process(inputs, outputs, p) {
      const input = inputs[0];
      const output = outputs[0];
      const nch = input.length;
      if (!nch) return true;
      const n = input[0].length;
      const coef = (t) => 1 - Math.exp(-1 / (Math.max(t, 1e-4) * sampleRate));
      const kd = coef(p.detector[0]);
      const ka = coef(p.attack[0]);
      const kr = coef(p.release[0]);
      const T = p.thresholdDb[0];
      const knee = Math.max(p.kneeDb[0], 1e-6);
      const slope = p.slope[0];
      const makeup = p.makeupDb[0];
      const offset = p.offsetDb[0];
      let { ms, g } = this;
      for (let i = 0; i < n; i++) {
        let pw = 0;
        for (let c = 0; c < nch; c++) pw += input[c][i] * input[c][i];
        ms += (pw / nch - ms) * kd;
        const over = 10 * Math.log10(ms + 1e-20) + offset - T;
        const red = over > knee / 2 ? over : over < -knee / 2 ? 0 : (over + knee / 2) ** 2 / (2 * knee);
        const target = makeup - slope * red;
        g += (target - g) * (target < g ? ka : kr);
        const gain = 10 ** (g / 20);
        for (let c = 0; c < nch; c++) output[c][i] = input[c][i] * gain;
      }
      this.ms = ms;
      this.g = g;
      // For the panel, ~40 times a second: detected level (export dB) and gain (dB).
      this.sinceReport += n;
      if (this.sinceReport >= 1024) {
        this.sinceReport = 0;
        this.port.postMessage({ level: 10 * Math.log10(ms + 1e-20) + offset, gain: g, makeup });
      }
      return true;
    }
  }

  registerProcessor('rebirth-compressor', Compressor);
}
`;

const loaded = new WeakSet<BaseAudioContext>();
const pending = new WeakMap<BaseAudioContext, Promise<void>>();

/** Registers the processor once per context. */
export function loadRebirthCompressor(ctx: BaseAudioContext): Promise<void> {
  if (loaded.has(ctx)) return Promise.resolve();
  const existing = pending.get(ctx);
  if (existing) return existing;
  const url = URL.createObjectURL(new Blob([`(${COMPRESSOR_SOURCE})();`], { type: 'text/javascript' }));
  const p = ctx.audioWorklet.addModule(url).then(() => { loaded.add(ctx); }).finally(() => { URL.revokeObjectURL(url); pending.delete(ctx); });
  pending.set(ctx, p);
  return p;
}
