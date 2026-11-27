/**
 * voice-recorder worklet - sends the microphone input to the main thread.
 *
 * Blocks of 128 samples are batched to BATCH_SAMPLES (about 93 ms at 22050 Hz)
 * before they are posted: one message per 128-sample block (172 per second)
 * flooded the main thread, so its queue fell behind the recording and the
 * flush on stop timed out before the end of the take arrived (VNR-18).
 * On 'flush' the partial batch is posted first, then 'flushed'.
 */
const BATCH_SAMPLES = 2048;

class VoiceRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batch = new Float32Array(BATCH_SAMPLES);
    this.fill = 0;
    this.port.onmessage = (e) => {
      if (e.data !== 'flush') return;
      this.post();
      this.port.postMessage('flushed');
    };
  }

  post() {
    if (this.fill === 0) return;
    this.port.postMessage(this.batch.slice(0, this.fill));
    this.fill = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let i = 0;
    while (i < channel.length) {
      const n = Math.min(channel.length - i, BATCH_SAMPLES - this.fill);
      this.batch.set(channel.subarray(i, i + n), this.fill);
      this.fill += n;
      i += n;
      if (this.fill === BATCH_SAMPLES) this.post();
    }
    return true;
  }
}

registerProcessor('voice-recorder', VoiceRecorderProcessor);
