/**
 * channel-stream.js — every sample a song engine renders, per voice, to the
 * main thread.
 *
 * Loaded into the AudioWorkletGlobalScope before an engine's own worklet
 * (WASMSingletonBase does it), so every engine shares one definition. An
 * engine creates one stream, writes each render's per-voice output, and the
 * stream posts it in chunks:
 *
 *   { type: 'oscData', channels: Int16Array[], frame, sampleRate }
 *
 * `channels[v]` holds every sample rendered since the previous message and
 * `frame` is the engine's running sample index of its first sample, so the
 * receiver can tell contiguous audio from a gap. The runtime channel
 * classifiers need contiguous audio: short display snapshots glued together
 * read as clicks, and every channel then classified as percussion.
 *
 * The oscilloscopes show the last 256 samples of each chunk, as before.
 */
if (!globalThis.DevilboxChannelStream) {
  globalThis.DevilboxChannelStream = class DevilboxChannelStream {
    /**
     * @param {MessagePort} port   the engine processor's port
     * @param {number} sampleRate  the context's sample rate
     * @param {number} chunk       samples per voice per message
     */
    constructor(port, sampleRate, chunk = 1024) {
      this.port = port;
      this.sampleRate = sampleRate;
      this.chunk = chunk;
      this.voices = 0;
      this.bufs = [];
      this.fill = 0;
      this.frame = 0;       // running index of the next sample written
      this.chunkStart = 0;  // running index of bufs[*][0]
    }

    _ensure(voices) {
      if (voices === this.voices) return;
      this.voices = voices;
      this.bufs = Array.from({ length: voices }, () => new Int16Array(this.chunk));
      this.fill = 0;
      this.chunkStart = this.frame;
    }

    /**
     * Append `n` samples per voice. `read(voice, i)` returns sample i of the
     * voice as a float in -1..1.
     */
    write(voices, n, read) {
      this._ensure(voices);
      let i = 0;
      while (i < n) {
        const take = Math.min(n - i, this.chunk - this.fill);
        for (let v = 0; v < voices; v++) {
          const buf = this.bufs[v];
          for (let k = 0; k < take; k++) {
            const s = read(v, i + k);
            buf[this.fill + k] = s >= 1 ? 32767 : s <= -1 ? -32768 : (s * 32767) | 0;
          }
        }
        this.fill += take;
        this.frame += take;
        i += take;
        if (this.fill === this.chunk) this._flush();
      }
    }

    /** As write(), from per-voice Float32Array views holding at least n samples. */
    writeFloat32(views, n) {
      this.write(views.length, n, (v, i) => views[v][i]);
    }

    /** As write(), from per-voice Int16Array views holding at least n samples. */
    writeInt16(views, n) {
      this._ensure(views.length);
      let i = 0;
      while (i < n) {
        const take = Math.min(n - i, this.chunk - this.fill);
        for (let v = 0; v < views.length; v++) {
          this.bufs[v].set(views[v].subarray(i, i + take), this.fill);
        }
        this.fill += take;
        this.frame += take;
        i += take;
        if (this.fill === this.chunk) this._flush();
      }
    }

    _flush() {
      const channels = this.bufs;
      this.port.postMessage(
        { type: 'oscData', channels, frame: this.chunkStart, sampleRate: this.sampleRate },
        channels.map((b) => b.buffer),
      );
      this.bufs = Array.from({ length: this.voices }, () => new Int16Array(this.chunk));
      this.fill = 0;
      this.chunkStart = this.frame;
    }

    /**
     * The audio stops being one stream (new song, seek, stop): drop the
     * partial chunk and leave a gap in `frame`, so the receiver never joins
     * the two.
     */
    discontinue() {
      this.frame += this.chunk + 1;
      this.fill = 0;
      this.chunkStart = this.frame;
    }
  };
}
