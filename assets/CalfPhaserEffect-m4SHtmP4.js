import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
class CalfPhaserEffect extends ToneAudioNode {
  name = "CalfPhaser";
  _input;
  _output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _rate;
  _depth;
  _stages;
  _feedback;
  _stereoPhase;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._rate = options.rate ?? 0.5;
    this._depth = options.depth ?? 0.7;
    this._stages = options.stages ?? 6;
    this._feedback = options.feedback ?? 0.5;
    this._stereoPhase = options.stereoPhase ?? 90;
    this._mix = options.mix ?? 0.5;
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
      await CalfPhaserEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "calf-phaser-processor", {
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
            console.warn("[CalfPhaser] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: CalfPhaserEffect.wasmBinary, jsCode: CalfPhaserEffect.jsCode },
        [CalfPhaserEffect.wasmBinary.slice(0)]
      );
      this.sendParam("rate", this._rate);
      this.sendParam("depth", this._depth);
      this.sendParam("stages", this._stages);
      this.sendParam("feedback", this._feedback);
      this.sendParam("stereoPhase", this._stereoPhase);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[CalfPhaser] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}calf-phaser/CalfPhaser.wasm`),
        fetch(`${base}calf-phaser/CalfPhaser.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}calf-phaser/CalfPhaser.worklet.js`);
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
    this._rate = Math.max(0.01, Math.min(10, v));
    this.sendParam("rate", this._rate);
  }
  setDepth(v) {
    this._depth = Math.max(0, Math.min(1, v));
    this.sendParam("depth", this._depth);
  }
  setStages(v) {
    this._stages = Math.max(2, Math.min(12, v));
    this.sendParam("stages", this._stages);
  }
  setFeedback(v) {
    this._feedback = Math.max(-0.95, Math.min(0.95, v));
    this.sendParam("feedback", this._feedback);
  }
  setStereoPhase(v) {
    this._stereoPhase = Math.max(0, Math.min(360, v));
    this.sendParam("stereoPhase", this._stereoPhase);
  }
  setMix(v) {
    this._mix = Math.max(0, Math.min(1, v));
    this.sendParam("mix", this._mix);
  }
  get rate() {
    return this._rate;
  }
  get depth() {
    return this._depth;
  }
  get stages() {
    return this._stages;
  }
  get feedback() {
    return this._feedback;
  }
  get stereoPhase() {
    return this._stereoPhase;
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
      case "rate":
        this.setRate(value);
        break;
      case "depth":
        this.setDepth(value);
        break;
      case "stages":
        this.setStages(value);
        break;
      case "feedback":
        this.setFeedback(value);
        break;
      case "stereoPhase":
        this.setStereoPhase(value);
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
  CalfPhaserEffect
};
