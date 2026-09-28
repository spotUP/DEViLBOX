/**
 * idle-gate.js — effect processors stop computing silence.
 *
 * An AudioWorkletProcessor whose process() returns true runs every audio
 * quantum for as long as its node exists, whether anything reaches it. The
 * dub bus's effects are built at boot and live for the session, so with the
 * bus off and the song stopped they processed silence continuously: the
 * RE-201 alone took 35-43 ms of every second of the audio thread (measured
 * 2026-09-28, MCP get_audio_worklet_profile).
 *
 * Loaded before any other module (src/engine/audio/idleGate.ts). It wraps
 * registerProcessor for the effect processors named below: once a
 * processor's input AND its own output have been silent for a second, it
 * writes silence and skips its DSP. It resumes on the first input sample, or
 * on any message to its port (a parameter change can make a generator such
 * as vinyl noise sound without input). Requiring the output to be silent too
 * keeps a ringing reverb or a self-oscillating echo running.
 */
if (!globalThis.__dbxIdleGate) {
  const GATED = new Set([
    're201-processor', 'fil4-processor', 'aelapse-processor', 'tonearm-processor',
    'calf-phaser-processor', 'dattorro-plate-processor', 'ring-mod-processor',
    'bitta-processor', 'vinyl-noise-processor',
  ]);
  // -80 dBFS. Not lower: the dub bus's external feedback loop keeps a floor
  // near -91 dBFS circulating with nothing playing (measured), which would
  // hold every effect awake. Nothing at -80 dBFS is audible in a mix.
  const SILENT = 1e-4;
  const QUIET_QUANTA = 375;     // ~1 s at 48 kHz

  const silent = (ports) => {
    for (const port of ports) {
      if (!port) continue;
      for (const ch of port) {
        for (let i = 0; i < ch.length; i++) {
          const v = ch[i];
          if (v > SILENT || v < -SILENT) return false;
        }
      }
    }
    return true;
  };

  const zero = (outputs) => {
    for (const port of outputs) for (const ch of port) ch.fill(0);
  };

  const originalRegister = globalThis.registerProcessor;
  globalThis.registerProcessor = function (name, cls) {
    if (!GATED.has(name) || typeof cls?.prototype?.process !== 'function') {
      return originalRegister.call(this, name, cls);
    }
    const process = cls.prototype.process;
    class Gated extends cls {
      constructor(...args) {
        super(...args);
        this.__quiet = 0;
        this.__idle = false;
        const port = this.port;
        const handler = port.onmessage;
        port.onmessage = (e) => {
          this.__idle = false;
          this.__quiet = 0;
          if (handler) handler.call(port, e);
        };
      }
    }
    Gated.prototype.process = function (inputs, outputs, parameters) {
      const quietIn = silent(inputs);
      if (this.__idle) {
        if (quietIn) { zero(outputs); return true; }
        this.__idle = false;
        this.__quiet = 0;
      }
      const keep = process.call(this, inputs, outputs, parameters);
      if (quietIn && silent(outputs)) {
        if (++this.__quiet >= QUIET_QUANTA) this.__idle = true;
      } else {
        this.__quiet = 0;
      }
      return keep;
    };
    return originalRegister.call(this, name, Gated);
  };
  globalThis.__dbxIdleGate = true;
}
