/**
 * IsolationPlayerProcessor — Receives per-channel isolation audio from
 * the main libopenmpt worklet via a MessagePort and outputs it.
 *
 * Architecture:
 *   Main worklet renders isolation module → sends Float32Arrays via MessagePort
 *   → This processor receives and outputs them → connected to Tone.js effect chain
 *
 * This avoids multi-output AudioWorkletNode (which has browser issues)
 * and keeps everything in the AudioWorklet thread for low latency.
 */
class IsolationPlayerProcessor extends AudioWorkletProcessor {
	constructor() {
		super()
		this.leftBuf = null
		this.rightBuf = null
		this.port.onmessage = (e) => {
			const { cmd } = e.data
			if (cmd === 'setSourcePort') {
				// Receive the MessagePort from the main worklet
				this.sourcePort = e.data.port
				this.sourcePort.onmessage = (ev) => {
					// Audio data from main worklet
					if (ev.data.left && ev.data.right) {
						this.leftBuf = ev.data.left
						this.rightBuf = ev.data.right
					}
				}
			}
		}
	}

	process(inputs, outputs) {
		const outL = outputs[0][0]
		const outR = outputs[0][1]
		if (!outL || !outR) return true

		if (this.leftBuf && this.rightBuf) {
			const len = Math.min(outL.length, this.leftBuf.length)
			outL.set(this.leftBuf.subarray(0, len))
			outR.set(this.rightBuf.subarray(0, len))
			this.leftBuf = null
			this.rightBuf = null
		} else {
			outL.fill(0)
			outR.fill(0)
		}
		return true
	}
}

registerProcessor('isolation-player', IsolationPlayerProcessor)
