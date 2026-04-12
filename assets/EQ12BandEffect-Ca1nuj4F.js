import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class EQ12BandEffect extends ToneAudioNode {
  name = "EQ12Band";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _mix;
  _wet;
  bandFreqs = [30, 80, 160, 400, 800, 1500, 3e3, 5e3, 8e3, 12e3, 14e3, 18e3];
  bandGains = new Array(12).fill(0);
  bandQs = new Array(12).fill(1);
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._mix = options.mix ?? 1;
    this._wet = options.wet ?? 1;
    this.input = new Gain(1);
    this.output = new Gain(1);
    this.dryGain = new Gain(1 - this._wet);
    this.wetGain = new Gain(this._wet);
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.input.connect(this.wetGain);
    void this._initWorklet();
  }
  async _initWorklet() {
    try {
      const rawCtx = getContext().rawContext;
      await EQ12BandEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "eq12-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === "ready") {
          this.isWasmReady = true;
          for (const p of this.pendingParams)
            this.workletNode.port.postMessage({ type: "parameter", param: p.param, value: p.value });
          this.pendingParams = [];
          try {
            const rawInput = getNativeAudioNode(this.input);
            const rawWet = getNativeAudioNode(this.wetGain);
            rawInput.connect(this.workletNode);
            this.workletNode.connect(rawWet);
            try {
              this.input.disconnect(this.wetGain);
            } catch {
            }
            const rawCtx2 = getContext().rawContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
          } catch (swapErr) {
            console.warn("[EQ12Band] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: EQ12BandEffect.wasmBinary, jsCode: EQ12BandEffect.jsCode },
        [EQ12BandEffect.wasmBinary.slice(0)]
      );
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[EQ12Band] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}eq12/EQ12Band.wasm`),
        fetch(`${base}eq12/EQ12Band.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}eq12/EQ12Band.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }
  sendParam(param, value) {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: "parameter", param, value });
    } else {
      this.pendingParams = this.pendingParams.filter((p) => p.param !== param);
      this.pendingParams.push({ param, value });
    }
  }
  setBandFreq(band, freq) {
    if (band < 0 || band > 11) return;
    this.bandFreqs[band] = clamp(freq, 20, 2e4);
    this.sendParam(`freq_${band}`, this.bandFreqs[band]);
  }
  setBandGain(band, gain) {
    if (band < 0 || band > 11) return;
    this.bandGains[band] = clamp(gain, -36, 36);
    this.sendParam(`gain_${band}`, this.bandGains[band]);
  }
  setBandQ(band, q) {
    if (band < 0 || band > 11) return;
    this.bandQs[band] = clamp(q, 0.1, 10);
    this.sendParam(`q_${band}`, this.bandQs[band]);
  }
  getBandFreq(band) {
    return this.bandFreqs[band] ?? 0;
  }
  getBandGain(band) {
    return this.bandGains[band] ?? 0;
  }
  getBandQ(band) {
    return this.bandQs[band] ?? 1;
  }
  setMix(v) {
    this._mix = clamp(v, 0, 1);
    this.sendParam("mix", this._mix);
  }
  get mix() {
    return this._mix;
  }
  get wet() {
    return this._wet;
  }
  set wet(value) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }
  setParam(param, value) {
    if (param === "wet") {
      this.wet = value;
      return;
    }
    if (param === "mix") {
      this.setMix(value);
      return;
    }
    const idx = param.lastIndexOf("_");
    if (idx >= 0) {
      const name = param.substring(0, idx);
      const band = parseInt(param.substring(idx + 1));
      if (!isNaN(band)) {
        if (name === "freq") this.setBandFreq(band, value);
        else if (name === "gain") this.setBandGain(band, value);
        else if (name === "q") this.setBandQ(band, value);
      }
    }
  }
  dispose() {
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: "dispose" });
      } catch {
      }
      try {
        this.workletNode.disconnect();
      } catch {
      }
      this.workletNode = null;
    }
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
export {
  EQ12BandEffect
};
