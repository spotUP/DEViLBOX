import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class PulsatorEffect extends ToneAudioNode {
  name = "Pulsator";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _rate;
  _depth;
  _waveform;
  _stereoPhase;
  _offset;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._rate = options.rate ?? 2;
    this._depth = options.depth ?? 0.5;
    this._waveform = options.waveform ?? 0;
    this._stereoPhase = options.stereoPhase ?? 180;
    this._offset = options.offset ?? 0;
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
      await PulsatorEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "pulsator-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === "ready") {
          this.isWasmReady = true;
          for (const p of this.pendingParams) {
            this.workletNode.port.postMessage({ type: "parameter", param: p.param, value: p.value });
          }
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
            console.warn("[Pulsator] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: PulsatorEffect.wasmBinary, jsCode: PulsatorEffect.jsCode },
        [PulsatorEffect.wasmBinary.slice(0)]
      );
      this.sendParam("rate", this._rate);
      this.sendParam("depth", this._depth);
      this.sendParam("waveform", this._waveform);
      this.sendParam("stereoPhase", this._stereoPhase);
      this.sendParam("offset", this._offset);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[Pulsator] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}pulsator/Pulsator.wasm`),
        fetch(`${base}pulsator/Pulsator.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}pulsator/Pulsator.worklet.js`);
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
  setRate(v) {
    this._rate = clamp(v, 0.01, 20);
    this.sendParam("rate", this._rate);
  }
  setDepth(v) {
    this._depth = clamp(v, 0, 1);
    this.sendParam("depth", this._depth);
  }
  setWaveform(v) {
    this._waveform = clamp(Math.round(v), 0, 4);
    this.sendParam("waveform", this._waveform);
  }
  setStereoPhase(v) {
    this._stereoPhase = clamp(v, 0, 360);
    this.sendParam("stereoPhase", this._stereoPhase);
  }
  setOffset(v) {
    this._offset = clamp(v, 0, 1);
    this.sendParam("offset", this._offset);
  }
  setMix(v) {
    this._mix = clamp(v, 0, 1);
    this.sendParam("mix", this._mix);
  }
  get wet() {
    return this._wet;
  }
  set wet(value) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }
  get rate() {
    return this._rate;
  }
  get depth() {
    return this._depth;
  }
  get waveform() {
    return this._waveform;
  }
  get stereoPhase() {
    return this._stereoPhase;
  }
  get offset() {
    return this._offset;
  }
  get mix() {
    return this._mix;
  }
  setParam(param, value) {
    switch (param) {
      case "rate":
        this.setRate(value);
        break;
      case "depth":
        this.setDepth(value);
        break;
      case "waveform":
        this.setWaveform(value);
        break;
      case "stereoPhase":
        this.setStereoPhase(value);
        break;
      case "offset":
        this.setOffset(value);
        break;
      case "mix":
        this.setMix(value);
        break;
      case "wet":
        this.wet = value;
        break;
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
  PulsatorEffect
};
