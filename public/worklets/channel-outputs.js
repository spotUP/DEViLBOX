/**
 * channel-outputs.js — per-channel dub sends and isolation slots for engines
 * that render each voice into its own buffer.
 *
 * Output contract (shared with libopenmpt, Hively, UADE, Furnace; see
 * src/engine/tone/ChannelRoutedEffects.ts):
 *   outputs[0]      main mix — the worklet mixes it, leaving out every voice
 *                   this helper reports as isolated
 *   outputs[1..4]   isolation slots: the voices in the slot's mask, summed by
 *                   side (the channel is REMOVED from the main mix)
 *   outputs[5..36]  dub sends: a COPY of voice ch, mono on both sides (the
 *                   channel stays in the main mix)
 *
 * Messages handled (engine → worklet), matching dubChannelMessage():
 *   { type|cmd: 'dubChannelEnable'|'dubChannelDisable', channel | val.channel }
 *   { type: 'dubChannelDisableAll' }
 *   { type: 'addIsolation', slotIndex, channelMask }
 *   { type: 'removeIsolation', slotIndex }
 *
 * Loaded before the engine worklet (WASMSingletonBase.loadWASMAssets), like
 * worklets/channel-stream.js, so the engine's processor finds it on the
 * global scope.
 */
if (!globalThis.DevilboxChannelOutputs) {
  const ISOLATION_SLOTS = 4;
  const DUB_OUTPUT_BASE = 5;
  const MAX_DUB_CHANNELS = 32;

  class DevilboxChannelOutputs {
    constructor() {
      this.dubEnabled = new Array(MAX_DUB_CHANNELS).fill(false);
      this.slotMasks = new Array(ISOLATION_SLOTS).fill(0);
      this.isolatedMask = 0;
    }

    /** Handle a dub/isolation message; true when it was one. */
    handleMessage(data) {
      const kind = data && (data.type || data.cmd);
      switch (kind) {
        case 'dubChannelEnable':
        case 'dubChannelDisable': {
          const ch = data.channel ?? data.val?.channel;
          if (Number.isInteger(ch) && ch >= 0 && ch < MAX_DUB_CHANNELS) {
            this.dubEnabled[ch] = kind === 'dubChannelEnable';
          }
          return true;
        }
        case 'dubChannelDisableAll':
          this.dubEnabled.fill(false);
          return true;
        case 'addIsolation': {
          const s = data.slotIndex;
          if (Number.isInteger(s) && s >= 0 && s < ISOLATION_SLOTS) {
            this.slotMasks[s] = data.channelMask >>> 0;
            this._updateIsolated();
          }
          return true;
        }
        case 'removeIsolation': {
          const s = data.slotIndex;
          if (Number.isInteger(s) && s >= 0 && s < ISOLATION_SLOTS) {
            this.slotMasks[s] = 0;
            this._updateIsolated();
          }
          return true;
        }
        default:
          return false;
      }
    }

    _updateIsolated() {
      let m = 0;
      for (const mask of this.slotMasks) m |= mask;
      this.isolatedMask = m >>> 0;
    }

    /** Whether voice ch is taken out of the main mix (it is in an isolation slot). */
    isIsolated(ch) {
      return ch < 32 && (this.isolatedMask & (1 << ch)) !== 0;
    }

    /**
     * Fill the slot and dub outputs from this render's voice buffers.
     *
     * @param outputs   the processor's outputs array
     * @param voices    one Float32Array (or Int16-scaled Float32 view) per voice
     * @param n         frames rendered
     * @param sideOf    (ch) => 0 for left, 1 for right, 0.5 for centre
     * @param gain      scale applied to each voice to match its level in the main mix
     */
    write(outputs, voices, n, sideOf, gain = 1) {
      // Isolation slots: the voices in each mask, placed on their side.
      for (let s = 0; s < ISOLATION_SLOTS; s++) {
        const mask = this.slotMasks[s];
        if (!mask) continue;
        const out = outputs[1 + s];
        if (!out || out.length < 2) continue;
        const L = out[0], R = out[1];
        for (let ch = 0; ch < voices.length && ch < 32; ch++) {
          if (!(mask & (1 << ch))) continue;
          const buf = voices[ch];
          if (!buf) continue;
          const side = sideOf(ch);
          const gl = gain * (1 - side), gr = gain * side;
          for (let i = 0; i < n; i++) { const v = buf[i]; L[i] += v * gl; R[i] += v * gr; }
        }
      }
      // Dub sends: a copy of each enabled voice, mono on both sides.
      for (let ch = 0; ch < voices.length && ch < MAX_DUB_CHANNELS; ch++) {
        if (!this.dubEnabled[ch]) continue;
        const out = outputs[DUB_OUTPUT_BASE + ch];
        const buf = voices[ch];
        if (!out || out.length < 2 || !buf) continue;
        const L = out[0], R = out[1];
        for (let i = 0; i < n; i++) { const v = buf[i] * gain; L[i] = v; R[i] = v; }
      }
    }
  }

  globalThis.DevilboxChannelOutputs = DevilboxChannelOutputs;
}
