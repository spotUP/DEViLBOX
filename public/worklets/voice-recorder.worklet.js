// Posts every input block (mono, first channel) to the main thread.
class VoiceRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice());
    return true;
  }
}
registerProcessor('voice-recorder', VoiceRecorderProcessor);
