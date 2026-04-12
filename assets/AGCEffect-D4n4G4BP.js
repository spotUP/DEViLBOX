import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
class AGCEffect extends ToneAudioNode {
  name = "AGC";
  _input;
  _output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _target;
  _speed;
  _maxGain;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._target = options.target ?? -12;
    this._speed = options.speed ?? 0.1;
    this._maxGain = options.maxGain ?? 12;
    this._mix = options.mix ?? 1;
    this._wet = options.wet ?? 1;
    this._input = new Gain(1);
    this._output = new Gain(1);
    this.dryGain = new Gain(1 - this._wet);
    this.wetGain = new Gain(this._wet);
    this._input.connect(this.dryGain);
    this.dryGain.connect(this._output);
    this.wetGain.connect(this._output);
    this._input.connect(this.wetGain);
    void this._initWorklet();
  }
  get input() {
    return this._input;
  }
  get output() {
    return this._output;
  }
  async _initWorklet() {
    try {
      const rawCtx = getContext().rawContext;
      console.log("[AGC] ⚡ _initWorklet starting");
      await AGCEffect.ensureInitialized(rawCtx);
      console.log("[AGC] ⚡ ensureInitialized done, wasmBinary:", !!AGCEffect.wasmBinary, "jsCode:", !!AGCEffect.jsCode);
      this.workletNode = new AudioWorkletNode(rawCtx, "agc-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      console.log("[AGC] ⚡ AudioWorkletNode created, sending init message");
      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === "ready") {
          console.log("[AGC] ⚡ WASM ready! Connecting worklet to audio chain");
          this.isWasmReady = true;
          for (const p of this.pendingParams) {
            this.workletNode.port.postMessage({ type: "parameter", param: p.param, value: p.value });
          }
          this.pendingParams = [];
          try {
            const rawInput = getNativeAudioNode(this._input);
            const rawWet = getNativeAudioNode(this.wetGain);
            console.log("[AGC] ⚡ rawInput:", !!rawInput, "rawWet:", !!rawWet);
            rawInput.connect(this.workletNode);
            this.workletNode.connect(rawWet);
            try {
              this._input.disconnect(this.wetGain);
            } catch {
            }
            const rawCtx2 = getContext().rawContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
            console.log("[AGC] ⚡ WASM swap complete — effect should be active!");
          } catch (swapErr) {
            console.error("[AGC] WASM swap failed, staying on passthrough:", swapErr);
          }
        } else if (e.data.type === "error") {
          console.error("[AGC] WASM worklet error:", e.data.error);
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: AGCEffect.wasmBinary, jsCode: AGCEffect.jsCode },
        [AGCEffect.wasmBinary.slice(0)]
      );
      this.sendParam("target", this._target);
      this.sendParam("speed", this._speed);
      this.sendParam("maxGain", this._maxGain);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[AGC] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}agc/AGC.wasm`),
        fetch(`${base}agc/AGC.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}agc/AGC.worklet.js`);
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
  setTarget(v) {
    this._target = Math.max(-24, Math.min(0, v));
    this.sendParam("target", this._target);
  }
  setSpeed(v) {
    this._speed = Math.max(0.01, Math.min(1, v));
    this.sendParam("speed", this._speed);
  }
  setMaxGain(v) {
    this._maxGain = Math.max(0, Math.min(24, v));
    this.sendParam("maxGain", this._maxGain);
  }
  setMix(v) {
    this._mix = Math.max(0, Math.min(1, v));
    this.sendParam("mix", this._mix);
  }
  get target() {
    return this._target;
  }
  get speed() {
    return this._speed;
  }
  get maxGain() {
    return this._maxGain;
  }
  get mix() {
    return this._mix;
  }
  get wet() {
    return this._wet;
  }
  set wet(value) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }
  setParam(param, value) {
    switch (param) {
      case "target":
        this.setTarget(value);
        break;
      case "speed":
        this.setSpeed(value);
        break;
      case "maxGain":
        this.setMaxGain(value);
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
    this._input.dispose();
    this._output.dispose();
    super.dispose();
    return this;
  }
}
export {
  AGCEffect
};
