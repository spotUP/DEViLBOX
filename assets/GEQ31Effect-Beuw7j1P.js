import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
const GEQ31_ISO_FREQS = [
  20,
  25,
  31.5,
  40,
  50,
  63,
  80,
  100,
  125,
  160,
  200,
  250,
  315,
  400,
  500,
  630,
  800,
  1e3,
  1250,
  1600,
  2e3,
  2500,
  3150,
  4e3,
  5e3,
  6300,
  8e3,
  1e4,
  12500,
  16e3,
  2e4
];
class GEQ31Effect extends ToneAudioNode {
  name = "GEQ31";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _mix;
  _wet;
  bandGains = new Array(31).fill(0);
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
      await GEQ31Effect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "geq31-processor", {
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
            console.warn("[GEQ31] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: GEQ31Effect.wasmBinary, jsCode: GEQ31Effect.jsCode },
        [GEQ31Effect.wasmBinary.slice(0)]
      );
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[GEQ31] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}geq31/GEQ31.wasm`),
        fetch(`${base}geq31/GEQ31.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}geq31/GEQ31.worklet.js`);
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
  setBandGain(band, gain) {
    if (band < 0 || band > 30) return;
    this.bandGains[band] = clamp(gain, -12, 12);
    this.sendParam(`band_${band}`, this.bandGains[band]);
  }
  getBandGain(band) {
    return this.bandGains[band] ?? 0;
  }
  getBandFreq(band) {
    return GEQ31_ISO_FREQS[band] ?? 0;
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
    if (param.startsWith("band_")) {
      const idx = parseInt(param.substring(5));
      if (!isNaN(idx)) this.setBandGain(idx, value);
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
  GEQ31Effect,
  GEQ31_ISO_FREQS
};
