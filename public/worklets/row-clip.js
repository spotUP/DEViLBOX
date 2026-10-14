/**
 * row-clip.js - plays a row clip (src/engine/rowPreview/rowClip.ts) through an engine worklet's own output code.
 *
 * The row preview renders a grid row in a worker, with a private instance of the engine's player, and sends the
 * result here. The engine worklet calls pull() once per render quantum while it is not playing and hands what comes
 * back to the same emit() playback uses (main mix, isolation slots, dub sends, scope stream, meters), so a previewed
 * row goes the way a played one goes.
 *
 * A clip's last `fadeFrames` frames fade linearly to silence (no click at the cut). A clip that replaces a sounding
 * one lets that one fade out over the same length first, then starts.
 *
 * Messages posted to the main thread: { type: 'rowClipStarted', frames }, { type: 'rowClipDone' }.
 * Loaded before the engine worklet (WASMSingletonBase.loadWASMAssets), like channel-outputs.js.
 */
if (!globalThis.DevilboxRowClip) {
  const QUANTUM = 128;

  class DevilboxRowClip {
    /** @param port the worklet's port; @param rate the context's sample rate */
    constructor(port, rate) {
      this.port = port;
      this.rate = rate || 48000;
      this.cur = null;       // the clip sounding
      this.pos = 0;          // frames of `cur` played
      this.cutEnd = -1;      // frame of `cur` where a replaced clip is silent (-1: plays to its end)
      this.cutFade = 0;
      this.pending = null;   // the clip that starts when `cur` is done
      this.out = { n: 0, stereo: new Float32Array(QUANTUM * 2), voices: [], pans: null };
    }

    get active() { return this.cur !== null || this.pending !== null; }

    /** Queue a clip: it starts now, or after the sounding one has faded out. */
    play(clip) {
      if (!clip || !clip.frames) return;
      if (!this.cur) { this._start(clip); return; }
      const fade = Math.round(0.005 * this.rate);
      const remaining = this.cur.frames - this.pos;
      // Already inside its own end fade: let it finish, it fades by itself.
      if (this.cutEnd < 0 && remaining > fade) { this.cutEnd = this.pos + fade; this.cutFade = fade; }
      this.pending = clip;
    }

    /** Silence at once (a song starting or loading takes the output). */
    drop() {
      if (this.cur) this.port.postMessage({ type: 'rowClipDone' });
      this.cur = null; this.pending = null; this.pos = 0; this.cutEnd = -1;
    }

    _start(clip) {
      this.cur = clip; this.pos = 0; this.cutEnd = -1; this.cutFade = 0; this.pending = null;
      this.port.postMessage({ type: 'rowClipStarted', frames: clip.frames });
    }

    _gain(i) {
      const c = this.cur;
      let g = 1;
      if (c.fadeFrames > 0 && i >= c.frames - c.fadeFrames) g = (c.frames - i) / c.fadeFrames;
      if (this.cutEnd >= 0 && i >= this.cutEnd - this.cutFade) g = Math.min(g, (this.cutEnd - i) / this.cutFade);
      return g;
    }

    /**
     * The next `n` (up to 128) frames: { n, stereo (interleaved), voices (one array per voice), pans } with n frames
     * filled, fewer when the clip ends inside the quantum; null when nothing is sounding. The object and its buffers
     * are reused by the next call.
     */
    pull(n) {
      if (!this.cur) return null;
      n = Math.min(n | 0, QUANTUM);
      const o = this.out;
      const first = this.cur;
      const voiceCount = first.voices ? first.voices.length : 0;
      while (o.voices.length < voiceCount) o.voices.push(new Float32Array(QUANTUM));
      o.voices.length = voiceCount;
      let filled = 0;
      while (filled < n && this.cur) {
        const c = this.cur;
        const end = this.cutEnd >= 0 ? this.cutEnd : c.frames;
        const m = Math.min(n - filled, end - this.pos);
        for (let k = 0; k < m; k++) {
          const i = this.pos + k, g = this._gain(i), j = filled + k;
          o.stereo[j * 2] = c.stereo[i * 2] * g;
          o.stereo[j * 2 + 1] = c.stereo[i * 2 + 1] * g;
          for (let v = 0; v < voiceCount; v++) o.voices[v][j] = c.voices && c.voices[v] ? c.voices[v][i] * g : 0;
        }
        if (filled === 0) {
          let pans = null;
          for (const step of c.panSteps || []) { if (step.at <= this.pos) pans = step.pans; else break; }
          o.pans = pans;
        }
        this.pos += m; filled += m;
        if (this.pos >= end) {
          this.cur = null; this.cutEnd = -1;
          const next = this.pending;
          this.pending = null;
          if (next) this._start(next);
          else this.port.postMessage({ type: 'rowClipDone' });
        }
      }
      o.n = filled;
      return o;
    }
  }

  globalThis.DevilboxRowClip = DevilboxRowClip;
}
