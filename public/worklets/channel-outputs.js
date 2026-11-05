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
 *   { type: 'seekFrames', frame }            start-at-position (not 'seek', which Nuade and Cinter4 own): the next play renders and discards `frame` frames
 *   { type: 'setStereoSeparation', value }   value 0-100 (%), the app setting; narrowStereo() applies it
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
      // DEViLBOX stereo separation 0..1 (1 = full Amiga hard L/R, 0 = mono); the engine pushes the app setting.
      this.stereoSep = 1;
      // Start-at-position target in output frames, held until the next play (discardSeek).
      this.seekFrames = 0;
    }

    /**
     * Run on 'play': render and throw away the frames up to the seek target, so the song plays on from there. Silent
     * (the render buffers are discarded), shape of UADE.worklet.js's uade_wasm_skip_frames. renderBlock(n) renders n
     * frames and returns how many it produced (<= 0: song ended). The target is consumed.
     */
    discardSeek(renderBlock, blockSize) {
      let left = this.seekFrames;
      this.seekFrames = 0;
      while (left > 0) {
        const n = Math.min(left, blockSize);
        if (!(renderBlock(n) > 0)) break;
        left -= n;
      }
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
        case 'seekFrames':
          this.seekFrames = Math.max(0, Math.floor(+data.frame) || 0);
          return true;
        case 'setStereoSeparation':
          this.stereoSep = Math.max(0, Math.min(1, (+data.value) / 100));
          return true;
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

    /**
     * Narrow a hard-panned main mix toward mono per the stereo separation setting (mid/side):
     * side scaled by the setting, mid kept. Call right after the worklet's L/R mix, in place.
     */
    narrowStereo(outputL, outputR, n) {
      const sep = this.stereoSep;
      if (sep >= 1) return;
      for (let i = 0; i < n; i++) {
        const mid = (outputL[i] + outputR[i]) * 0.5;
        const side = (outputL[i] - outputR[i]) * 0.5 * sep;
        outputL[i] = mid + side;
        outputR[i] = mid - side;
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
     * @param dubGain   the same for the dub sends (mono on both sides); defaults to gain
     */
    write(outputs, voices, n, sideOf, gain = 1, dubGain = gain) {
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
        for (let i = 0; i < n; i++) { const v = buf[i] * dubGain; L[i] = v; R[i] = v; }
      }
    }
  }

  globalThis.DevilboxChannelOutputs = DevilboxChannelOutputs;
}
