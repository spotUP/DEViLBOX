// Posts every input block (mono, first channel) to the main thread. A 'flush'
// message is answered with 'flushed': the port delivers in order, so every
// block posted before the answer reaches the main thread before it does.
class VoiceRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (e) => {
      if (e.data === 'flush') this.port.postMessage('flushed');
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice());
    return true;
  }
}
registerProcessor('voice-recorder', VoiceRecorderProcessor);
