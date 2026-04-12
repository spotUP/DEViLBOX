import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
class BeatBreatherEffect extends ToneAudioNode {
  name = "BeatBreather";
  _input;
  _output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _transientBoost;
  _sustainBoost;
  _sensitivity;
  _attack;
  _release;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._transientBoost = options.transientBoost ?? 0;
    this._sustainBoost = options.sustainBoost ?? 0;
    this._sensitivity = options.sensitivity ?? 0.5;
    this._attack = options.attack ?? 5;
    this._release = options.release ?? 100;
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
      await BeatBreatherEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "beat-breather-processor", {
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
            const rawInput = getNativeAudioNode(this._input);
            const rawWet = getNativeAudioNode(this.wetGain);
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
          } catch (swapErr) {
            console.warn("[BeatBreather] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: BeatBreatherEffect.wasmBinary, jsCode: BeatBreatherEffect.jsCode },
        [BeatBreatherEffect.wasmBinary.slice(0)]
      );
      this.sendParam("transientBoost", this._transientBoost);
      this.sendParam("sustainBoost", this._sustainBoost);
      this.sendParam("sensitivity", this._sensitivity);
      this.sendParam("attack", this._attack);
      this.sendParam("release", this._release);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[BeatBreather] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}beat-breather/BeatBreather.wasm`),
        fetch(`${base}beat-breather/BeatBreather.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}beat-breather/BeatBreather.worklet.js`);
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
  setTransientBoost(v) {
    this._transientBoost = Math.max(-1, Math.min(1, v));
    this.sendParam("transientBoost", this._transientBoost);
  }
  setSustainBoost(v) {
    this._sustainBoost = Math.max(-1, Math.min(1, v));
    this.sendParam("sustainBoost", this._sustainBoost);
  }
  setSensitivity(v) {
    this._sensitivity = Math.max(0, Math.min(1, v));
    this.sendParam("sensitivity", this._sensitivity);
  }
  setAttack(v) {
    this._attack = Math.max(0.1, Math.min(50, v));
    this.sendParam("attack", this._attack);
  }
  setRelease(v) {
    this._release = Math.max(10, Math.min(500, v));
    this.sendParam("release", this._release);
  }
  setMix(v) {
    this._mix = Math.max(0, Math.min(1, v));
    this.sendParam("mix", this._mix);
  }
  get transientBoost() {
    return this._transientBoost;
  }
  get sustainBoost() {
    return this._sustainBoost;
  }
  get sensitivity() {
    return this._sensitivity;
  }
  get attack() {
    return this._attack;
  }
  get release() {
    return this._release;
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
      case "transientBoost":
        this.setTransientBoost(value);
        break;
      case "sustainBoost":
        this.setSustainBoost(value);
        break;
      case "sensitivity":
        this.setSensitivity(value);
        break;
      case "attack":
        this.setAttack(value);
        break;
      case "release":
        this.setRelease(value);
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
  BeatBreatherEffect
};
