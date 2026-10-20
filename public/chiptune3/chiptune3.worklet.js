/*
	AudioWorklet: DrSnuggles
*/

import libopenmptPromise from './libopenmpt.worklet.js'

// consts
const OPENMPT_MODULE_RENDER_STEREOSEPARATION_PERCENT = 2
const OPENMPT_MODULE_RENDER_INTERPOLATIONFILTER_LENGTH = 3

// vars
let libopenmpt

// init
// Suppress libopenmpt WASM stderr — "error loading file" is expected when OpenMPT
// tries Amiga/UADE formats before falling back, and floods the browser console.
libopenmptPromise({ print: () => {}, printErr: () => {} })
.then(res => {
	libopenmpt = res
	globalThis.__libopenmpt = res // tests read stackSave()

	if (!libopenmpt.stackSave) return
	// set libopenmpt version to display later
	let stack = libopenmpt.stackSave()
	libopenmpt.version = libopenmpt.UTF8ToString(libopenmpt._openmpt_get_string(asciiToStack('library_version')))
	libopenmpt.build = libopenmpt.UTF8ToString(libopenmpt._openmpt_get_string(asciiToStack('build')))
	libopenmpt.stackRestore(stack)

	warmUpLibopenmpt()
})
.catch(e => console.error(e))

//
// Helpers
//
function asciiToStack(str) {
	const stackStr = libopenmpt.stackAlloc(str.length + 1)			// DrS: needed to export in emscripten
	writeAsciiToMemory(str, stackStr)					// no longer in Emscripten, see below
	return stackStr
}
function writeAsciiToMemory(str,buffer,dontAddNull){for(let i=0;i<str.length;++i){libopenmpt.HEAP8[buffer++>>0]=str.charCodeAt(i)}if(!dontAddNull)libopenmpt.HEAP8[buffer>>0]=0}

// Set one libopenmpt ctl. Both strings live on the wasm stack only for the
// duration of the call: a stackAlloc without a matching stackRestore leaks
// stack space for the life of the wasm instance, and the pitch slider sends
// a setPitch + setTempo pair per input event, so a few thousand events
// overran the stack ("memory access out of bounds", 2026-10-19).
function ctlSet(modulePtr, key, value) {
	const stack = libopenmpt.stackSave()
	libopenmpt._openmpt_module_ctl_set(modulePtr, asciiToStack(key), asciiToStack(value))
	libopenmpt.stackRestore(stack)
}

// Every module instance (main, isolation slot, dub slot, oscilloscope copy)
// renders through the A1200 resampler model.
function setAmigaResampler(modulePtr) {
	if (!libopenmpt.stackSave) return
	const stack = libopenmpt.stackSave()
	libopenmpt._openmpt_module_ctl_set(modulePtr, asciiToStack('render.resampler.emulate_amiga'), asciiToStack('1'))
	libopenmpt._openmpt_module_ctl_set(modulePtr, asciiToStack('render.resampler.emulate_amiga_type'), asciiToStack('a1200'))
	libopenmpt.stackRestore(stack)
}

// The empty one-pattern XM the tracker engine sends for a synth-only song
// (OpenMPT 1.33 writer, 187 bytes).
const WARMUP_XM_HEX =
	'457874656e646564204d6f64756c653a2020202020202020202020202020202020202020201a4f70656e4d505420312e33332e30302e3233202004011500000001000000040001000000000006007d00000900000000400000005354504d2e4250520400040000002e4d50520400100000002e4d4d500400040000002e5657430400230033015657534c0400230033012e415053040030000000565453560400300000002e46534d1100010702000001f8ffff1f40270400010022'

// The first module libopenmpt creates after the wasm loads costs ~41 ms
// (measured with the real wasm: later creates take ~4 ms), and its first
// render ~4 ms against 0.1 ms. That one-time cost used to land in the 'play'
// handler of the first song after a page load: the handler runs on the audio
// thread, so every processor missed its deadline and the first play dropped
// out (DX7 song, reported 2026-10-15). Pay it here instead, at boot, while
// nothing is audible: create, configure and render one module the same way
// play() does, then throw it away. An XM is used because that is what the
// engine sends; a MOD warm-up still left ~10 ms on the first XM create.
function warmUpLibopenmpt() {
	const t0 = Date.now()
	let frames = 0
	try {
		const bytes = new Uint8Array(WARMUP_XM_HEX.length / 2)
		for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(WARMUP_XM_HEX.substr(i * 2, 2), 16)
		const filePtr = libopenmpt._malloc(bytes.length)
		libopenmpt.HEAPU8.set(bytes, filePtr)
		let extPtr = 0
		let modulePtr = 0
		if (libopenmpt._openmpt_module_ext_create_from_memory) {
			extPtr = libopenmpt._openmpt_module_ext_create_from_memory(filePtr, bytes.length, 0, 0, 0, 0, 0, 0, 0)
			if (extPtr) modulePtr = libopenmpt._openmpt_module_ext_get_module(extPtr)
		}
		if (!modulePtr) modulePtr = libopenmpt._openmpt_module_create_from_memory(filePtr, bytes.length, 0, 0, 0)
		libopenmpt._free(filePtr)
		if (modulePtr) {
			setAmigaResampler(modulePtr)
			libopenmpt._openmpt_module_set_repeat_count(modulePtr, -1)
			const leftPtr = libopenmpt._malloc(4 * 128)
			const rightPtr = libopenmpt._malloc(4 * 128)
			for (let i = 0; i < 4; i++) {
				frames += libopenmpt._openmpt_module_read_float_stereo(modulePtr, sampleRate, 128, leftPtr, rightPtr)
			}
			libopenmpt._free(leftPtr)
			libopenmpt._free(rightPtr)
			if (extPtr) libopenmpt._openmpt_module_ext_destroy(extPtr)
			else libopenmpt._openmpt_module_destroy(modulePtr)
		}
	} catch (e) {
		console.warn('[libopenmpt] warm-up failed', e)
	}
	// Read by the regression test and handy in a worklet debugger.
	globalThis.__libopenmptWarmup = { frames, ms: Date.now() - t0 }
}


//
// Processor
//
// Maximum number of isolation slots for per-channel effect routing.
// Output 0 = main mix, outputs 1..MAX = isolation slots.
const MAX_ISOLATION_SLOTS = 4
// Per-channel dub sends — lazily allocated secondary instances that solo
// one channel each and render into output[DUB_OUTPUT_BASE + ch].
// Must match DUB_OUTPUT_BASE + MAX_DUB_CHANNELS in ChannelRoutedEffects.ts.
const DUB_OUTPUT_BASE = 5
const MAX_DUB_CHANNELS = 32
// Per-channel oscilloscope instances: each is a full module copy rendered every quantum.
const MAX_OSC_CHANNELS = 32
const OSC_MEMORY_BUDGET = 96 * 1024 * 1024

class MPT extends AudioWorkletProcessor {
	constructor(options) {
		super()
		this.port.onmessage = this.handleMessage_.bind(this)
		this.paused = false
		this.config = {
			repeatCount: -1,		// -1 = play endless, 0 = play once, do not repeat
			stereoSeparation: 100,	// percents
			interpolationFilter: 0,	// https://lib.openmpt.org/doc/group__openmpt__module__render__param.html
		}
		this.channels = 0
		this.lastStateRow = -1
		this.lastStateOrder = -1
		// Per-channel effect isolation: secondary module instances that render
		// only specific channels. All share the same process() call for perfect sync.
		this.isolationSlots = new Array(MAX_ISOLATION_SLOTS).fill(null)
		// Per-channel dub sends — one secondary module instance per active dub
		// channel, soloing that channel and rendering into output[DUB_OUTPUT_BASE+ch].
		// Lazy: only populated for channels the UI has toggled on (amount > 0).
		this.dubSlots = new Array(MAX_DUB_CHANNELS).fill(null)
		this.moduleBuffer = null  // Cached ArrayBuffer for creating isolation instances
		// Dual mute mask tracking: user mute/solo vs isolation exclusion.
		// The effective main mask = userMuteMask & ~isolatedBits.
		this.userMuteMask = 0xFFFFFFFF  // all channels active (no user mute)
		this.isolatedBits = 0            // no channels isolated
		this._diagCounter = 0
		// Per-channel oscilloscope: one module instance per channel, soloed from creation
		this.oscModules = null  // [{ modulePtr, extPtr, leftPtr, rightPtr }] indexed by channel
		this.oscEnabled = false
		this.oscSnapshots = null // Int16Array[] per channel, each 256 samples
		this.oscWritePos = null  // number[] per channel write cursor
		this.oscLastSendTime = 0
	}

	process(inputList, outputList, parameters) {
		// A processor lives until process() returns false: 'dispose' ends it.
		if (this.disposed) return false
		// Why-silent bookkeeping. A hard-zero master with the transport still
		// ticking has cost two debugging sessions: every gain downstream reads
		// sane, so the answer is in here, and there was no way to ask. One
		// integer per render, read back via 'diagState'.
		this._renderCount = (this._renderCount || 0) + 1
		if (!this.modulePtr) { this._silentReason = 'no-module'; return true }
		if (!this.leftPtr || !this.rightPtr) { this._silentReason = 'no-buffers'; return true }
		if (this.paused) { this._silentReason = 'paused'; return true }

		// Re-apply main mute + volume every render to guard against loop/seek resets
		if (this.isolatedBits && this.muteFunc) {
			const effectiveMainMask = this.userMuteMask & ~this.isolatedBits
			this.applyChannelIsolation_(this.extPtr, this.muteFunc, this.volumeFunc, effectiveMainMask)
		}

		const left = outputList[0][0]
		const right = outputList[0][1]

		const actualFramesPerChunk = libopenmpt._openmpt_module_read_float_stereo(this.modulePtr, sampleRate, left.length, this.leftPtr, this.rightPtr)
		if (actualFramesPerChunk == 0) {
			//this.paused = true
			// modulePtr will be 0 on openmpt: error: openmpt_module_read_float_stereo: ERROR: module * not valid or other openmpt error
			const error = !this.modulePtr
			if (error) {
				this.port.postMessage({cmd:'err',val:'Process'})
			} else {
				this.port.postMessage({cmd:'end'})
			}
			return true
		}

		left.set(libopenmpt.HEAPF32.subarray(this.leftPtr / 4, this.leftPtr / 4 + actualFramesPerChunk))
		right.set(libopenmpt.HEAPF32.subarray(this.rightPtr / 4, this.rightPtr / 4 + actualFramesPerChunk))

		// Sampled RMS of what the module actually produced. Distinguishes
		// "rendering silence" (mask killed every channel at the source) from
		// "rendering audio that something downstream swallowed" — the two
		// cases look identical from the main thread. Every 16th render.
		if ((this._renderCount & 15) === 0) {
			let acc = 0
			for (let i = 0; i < left.length; i++) acc += left[i] * left[i]
			this._lastRenderRms = Math.sqrt(acc / left.length)
			this._silentReason = this._lastRenderRms > 1e-7 ? null : 'module-rendered-silence'
		}

		// post progress
		// 	openmpt_module_get_current_order

		let msg = {
			cmd: 'pos',
			pos: libopenmpt._openmpt_module_get_position_seconds(this.modulePtr),
			// pos in song
			order: libopenmpt._openmpt_module_get_current_order(this.modulePtr),
			pattern: libopenmpt._openmpt_module_get_current_pattern(this.modulePtr),
			row: libopenmpt._openmpt_module_get_current_row(this.modulePtr),
			audioTime: currentTime,
			// Speed/tempo for tick-level synth effect processing
			speed: libopenmpt._openmpt_module_get_current_speed(this.modulePtr),
			tempo: libopenmpt._openmpt_module_get_current_tempo(this.modulePtr),
		}

		// Per-channel VU levels (mono max of L/R)
		if (this.channels > 0) {
			const chLevels = new Float32Array(this.channels)
			for (let i = 0; i < this.channels; i++) {
				const l = libopenmpt._openmpt_module_get_current_channel_vu_left(this.modulePtr, i)
				const r = libopenmpt._openmpt_module_get_current_channel_vu_right(this.modulePtr, i)
				chLevels[i] = Math.max(l, r)
			}
			msg.chLevels = chLevels
		}

		// Per-channel state — sent once per row change
		// Layout per channel: [note, instrument, volcmd, vol, effect, param]
		const curRow = msg.row
		const curOrder = msg.order
		if (curRow !== this.lastStateRow || curOrder !== this.lastStateOrder) {
			this.lastStateRow = curRow
			this.lastStateOrder = curOrder

			// Extract per-channel pattern data at current position using existing API
			// get_pattern_row_channel_command(pattern, row, channel, command_index):
			//   0=note, 1=instrument, 2=volcmd, 3=vol, 4=effect, 5=param
			if (this.channels > 0 && libopenmpt._openmpt_module_get_pattern_row_channel_command) {
				const pat = msg.pattern
				const row = msg.row
				const chState = new Float64Array(this.channels * 6)
				for (let i = 0; i < this.channels; i++) {
					const base = i * 6
					chState[base + 0] = libopenmpt._openmpt_module_get_pattern_row_channel_command(this.modulePtr, pat, row, i, 0) // note
					chState[base + 1] = libopenmpt._openmpt_module_get_pattern_row_channel_command(this.modulePtr, pat, row, i, 1) // instrument
					chState[base + 2] = libopenmpt._openmpt_module_get_pattern_row_channel_command(this.modulePtr, pat, row, i, 2) // volcmd
					chState[base + 3] = libopenmpt._openmpt_module_get_pattern_row_channel_command(this.modulePtr, pat, row, i, 3) // vol
					chState[base + 4] = libopenmpt._openmpt_module_get_pattern_row_channel_command(this.modulePtr, pat, row, i, 4) // effect
					chState[base + 5] = libopenmpt._openmpt_module_get_pattern_row_channel_command(this.modulePtr, pat, row, i, 5) // param
				}
				msg.chState = chState
			}
		}

		this.port.postMessage( msg )

		// Render isolation slots directly to worklet outputs[1..4]
		for (let s = 0; s < MAX_ISOLATION_SLOTS; s++) {
			const slot = this.isolationSlots[s]
			if (!slot || !slot.modulePtr || !slot.leftPtr || !slot.rightPtr) continue
			const outSlot = outputList[s + 1]
			if (!outSlot || !outSlot[0] || !outSlot[1]) continue

			// Re-apply mute + volume EVERY render to guard against loop/seek resets
			const effectiveSlotMask = slot.channelMask & this.userMuteMask
			this.applyChannelIsolation_(slot.extPtr, slot.muteFunc, slot.volumeFunc, effectiveSlotMask)

			const bufLen = left.length // same size as main output
			const frames = libopenmpt._openmpt_module_read_float_stereo(
				slot.modulePtr, sampleRate, bufLen, slot.leftPtr, slot.rightPtr
			)
			if (frames > 0) {
				outSlot[0].set(libopenmpt.HEAPF32.subarray(slot.leftPtr / 4, slot.leftPtr / 4 + frames))
				outSlot[1].set(libopenmpt.HEAPF32.subarray(slot.rightPtr / 4, slot.rightPtr / 4 + frames))
			}
		}

		// Render per-channel dub sends into outputs[5..36]. Each dub slot is a
		// secondary module instance that solos one channel. Inactive slots leave
		// their output untouched — Web Audio guarantees zero-fill of unwritten
		// output buffers, so silent channels cost nothing in the render path.
		for (let ch = 0; ch < MAX_DUB_CHANNELS; ch++) {
			const slot = this.dubSlots[ch]
			if (!slot || !slot.modulePtr || !slot.leftPtr || !slot.rightPtr) continue
			const outIdx = DUB_OUTPUT_BASE + ch
			const outSlot = outputList[outIdx]
			if (!outSlot || !outSlot[0] || !outSlot[1]) continue

			// Solo channel `ch` — all other channels muted in this instance.
			// Re-apply every render in case a loop/seek reset cleared the mute.
			const soloMask = (1 << ch) & this.userMuteMask
			this.applyChannelIsolation_(slot.extPtr, slot.muteFunc, slot.volumeFunc, soloMask)

			const bufLen = left.length
			const frames = libopenmpt._openmpt_module_read_float_stereo(
				slot.modulePtr, sampleRate, bufLen, slot.leftPtr, slot.rightPtr
			)
			if (frames > 0) {
				outSlot[0].set(libopenmpt.HEAPF32.subarray(slot.leftPtr / 4, slot.leftPtr / 4 + frames))
				outSlot[1].set(libopenmpt.HEAPF32.subarray(slot.rightPtr / 4, slot.rightPtr / 4 + frames))
			}
		}

		// Periodic diagnostic logging (every ~2 seconds at 48kHz/128 = 375 renders/sec)
		if (this.isolatedBits && ++this._diagCounter >= 750) {
			this._diagCounter = 0
			const numSlots = this.isolationSlots.filter(Boolean).length
			const effMainMask = this.userMuteMask & ~this.isolatedBits
			// Compute RMS of main output to verify it's not silent
			let mainRms = 0
			for (let i = 0; i < left.length; i++) mainRms += left[i] * left[i]
			mainRms = Math.sqrt(mainRms / left.length)
			this.port.postMessage({
				cmd: 'isolationDiag',
				isolatedBits: this.isolatedBits,
				userMuteMask: this.userMuteMask,
				effectiveMainMask: effMainMask,
				channels: this.channels,
				activeSlots: numSlots,
				slotMasks: this.isolationSlots.map(s => s ? s.channelMask : null),
				mainRms: mainRms.toFixed(6),
			})
		}

		// Per-channel oscilloscope capture (one single-channel instance per channel)
		if (this.oscEnabled && this.oscModules) {
			this.captureOscChannel_()
		}

		return true // def. needed for Chrome
	}

	handleMessage_(msg) {
		//console.log('[Processor:Received]',msg.data)
		const v = msg.data.val
		switch (msg.data.cmd) {
			case 'config':
				Object.assign(this.config, v)
				// Apply stereo separation immediately to the running module
				if (v.stereoSeparation !== undefined && this.modulePtr) {
					libopenmpt._openmpt_module_set_render_param(this.modulePtr, OPENMPT_MODULE_RENDER_STEREOSEPARATION_PERCENT, v.stereoSeparation)
					this.forEachIsolationSlot_(s => {
						if (s.modulePtr) libopenmpt._openmpt_module_set_render_param(s.modulePtr, OPENMPT_MODULE_RENDER_STEREOSEPARATION_PERCENT, v.stereoSeparation)
					})
				}
				if (v.interpolationFilter !== undefined && this.modulePtr) {
					libopenmpt._openmpt_module_set_render_param(this.modulePtr, OPENMPT_MODULE_RENDER_INTERPOLATIONFILTER_LENGTH, v.interpolationFilter)
					this.forEachIsolationSlot_(s => {
						if (s.modulePtr) libopenmpt._openmpt_module_set_render_param(s.modulePtr, OPENMPT_MODULE_RENDER_INTERPOLATIONFILTER_LENGTH, v.interpolationFilter)
					})
				}
				break
			case 'play':
				this.play(v, false)
				break
			case 'pause':
				this.paused = true
				this.forEachIsolationSlot_(s => { s.paused = true })
				break
			case 'unpause':
				this.paused = false
				this.forEachIsolationSlot_(s => { s.paused = false })
				break
			case 'togglePause':
				this.paused = !this.paused
				break
			case 'stop':
				this.teardownAllIsolation_()
				this.teardownAllDubSlots_()
				this.stop()
				break
			case 'dispose':
				this.teardownAllIsolation_()
				this.teardownAllDubSlots_()
				this.stop()
				this.disposed = true
				break
			case 'meta':
				this.meta()
				break
			case 'repeatCount':
				this.config.repeatCount = v
				if (!this.modulePtr) return
				libopenmpt._openmpt_module_set_repeat_count(this.modulePtr, this.config.repeatCount)
				break
			case 'setPitch':
				if (!libopenmpt.stackSave || !this.modulePtr) return
				ctlSet(this.modulePtr, 'play.pitch_factor', v.toString())
				break
			case 'setTempo':
				if (!libopenmpt.stackSave || !this.modulePtr) return
				ctlSet(this.modulePtr, 'play.tempo_factor', v.toString())
				break
			case 'selectSubsong':
				if (!this.modulePtr) return
				libopenmpt._openmpt_module_select_subsong(this.modulePtr, v)
				//this.meta()
				break
			case 'setPos':
				if (!this.modulePtr) return
				libopenmpt._openmpt_module_set_position_seconds(this.modulePtr, v)
				this.forEachIsolationSlot_(s => {
					libopenmpt._openmpt_module_set_position_seconds(s.modulePtr, v)
				})
				this.seekOscModules_(m => libopenmpt._openmpt_module_set_position_seconds(m, v))
				break
			case 'setOrderRow':
				if (!this.modulePtr) return
				libopenmpt._openmpt_module_set_position_order_row(this.modulePtr, v.o, v.r)
				this.forEachIsolationSlot_(s => {
					libopenmpt._openmpt_module_set_position_order_row(s.modulePtr, v.o, v.r)
				})
				this.seekOscModules_(m => libopenmpt._openmpt_module_set_position_order_row(m, v.o, v.r))
				break
			case 'hotReload':
				// Reload module data while preserving playback position.
				// If no module is loaded yet, load PAUSED so we don't accidentally
				// start playback (which would emit position=0 and steal the cursor).
				if (!this.modulePtr) { this.play(v, true); break }
				this.hotReload_(v)
				break
			case 'setMuteMask':
				// User mute/solo mask — combine with isolation exclusion
				if (!this.modulePtr) break
				this.userMuteMask = v
				this.recomputeMainMask_()
				this.reapplyIsolationMasks_()
				break
			case 'addIsolation':
				// Create a secondary module instance for per-channel effect routing.
				// v = { slotIndex: number, channelMask: number }
				this.addIsolationSlot_(v.slotIndex, v.channelMask)
				break
			case 'removeIsolation':
				// Destroy an isolation slot. v = { slotIndex: number }
				this.removeIsolationSlot_(v.slotIndex)
				break
			case 'updateIsolationMask':
				// Change which channels an isolation slot renders.
				// v = { slotIndex: number, channelMask: number }
				this.updateIsolationMask_(v.slotIndex, v.channelMask)
				break
			case 'updateMainMask':
				// Update isolation bits from engine — v is the main mask (~isolatedBits)
				// Extract isolatedBits from the complement
				this.isolatedBits = ~v & ((1 << Math.min(this.channels || 32, 32)) - 1)
				this.recomputeMainMask_()
				break
			case 'dubChannelEnable':
				// Begin rendering channel `v.channel` into output[DUB_OUTPUT_BASE+channel].
				// Lazily allocates a secondary module instance soloing that channel.
				this.addDubSlot_(v.channel)
				break
			case 'dubChannelDisable':
				// Stop rendering channel `v.channel` — frees the secondary instance.
				this.removeDubSlot_(v.channel)
				break
			case 'dubChannelDisableAll':
				this.teardownAllDubSlots_()
				break
			case 'diagState':
				// On-demand answer to "why is the master silent?". The main
				// thread can read every gain in the graph but none of this.
				this.port.postMessage({
					cmd: 'diagState',
					hasModule: !!this.modulePtr,
					hasExt: !!this.extPtr,
					paused: !!this.paused,
					channels: this.channels,
					userMuteMask: this.userMuteMask,
					isolatedBits: this.isolatedBits,
					effectiveMainMask: this.userMuteMask & ~this.isolatedBits,
					activeIsolationSlots: this.isolationSlots.filter(Boolean).length,
					activeDubSlots: this.dubSlots.filter(Boolean).length,
					lastRenderRms: Number((this._lastRenderRms ?? 0).toFixed(6)),
					renderCount: this._renderCount ?? 0,
					silentReason: this._silentReason ?? null,
				})
				break
			case 'diagDub':
				// Diagnostic: report dub slot state. Mirrors diagIsolation's shape.
				this.port.postMessage({
					cmd: 'diagDub',
					channels: this.channels,
					hasModuleBuffer: !!this.moduleBuffer,
					mainMuteFunc: this.muteFunc,
					userMuteMask: this.userMuteMask,
					activeDubSlots: this.dubSlots.map((s, ch) => s ? {
						ch,
						hasModulePtr: !!s.modulePtr,
						hasExtPtr: !!s.extPtr,
						muteFunc: s.muteFunc,
						channelMask: s.channelMask,
					} : null).filter(Boolean),
					dubSlotCount: this.dubSlots.filter(Boolean).length,
				})
				break
			case 'diagIsolation':
				// Diagnostic: report current isolation state
				this.port.postMessage({
					cmd: 'diagIsolation',
					mainMuteFunc: this.muteFunc,
					userMuteMask: this.userMuteMask,
					isolatedBits: this.isolatedBits,
					effectiveMainMask: this.userMuteMask & ~this.isolatedBits,
					channels: this.channels,
					hasWasmTable: !!libopenmpt.wasmTable,
					hasModuleBuffer: !!this.moduleBuffer,
					hasExtCreate: !!libopenmpt._openmpt_module_ext_create_from_memory,
					hasExtGetInterface: !!libopenmpt._openmpt_module_ext_get_interface,
					slots: this.isolationSlots.map((s, i) => s ? {
						index: i,
						channelMask: s.channelMask,
						muteFunc: s.muteFunc,
						hasModulePtr: !!s.modulePtr,
						hasExtPtr: !!s.extPtr,
					} : null)
				})
				break
			case 'enableOsc':
				this.createOscModule_()
				break
			case 'disableOsc':
				this.destroyOscModule_()
				break
			case 'decodeAll':
				this.decodeAll(v)
				break
			default:
				console.log('Received unknown message',msg.data)
		}
	} // handleMessage_

	decodeAll(buffer) {
		this.play(buffer, true)
		
		// now build the full audioData
		const left = [], right = []
		const maxFramesPerChunk = 128
		let actualFramesPerChunk = libopenmpt._openmpt_module_read_float_stereo(this.modulePtr, sampleRate, maxFramesPerChunk, this.leftPtr, this.rightPtr)
		while (actualFramesPerChunk != 0) {
			left.push( ...libopenmpt.HEAPF32.subarray(this.leftPtr / 4, this.leftPtr / 4 + actualFramesPerChunk) )
			right.push( ...libopenmpt.HEAPF32.subarray(this.rightPtr / 4, this.rightPtr / 4 + actualFramesPerChunk) )
			actualFramesPerChunk = libopenmpt._openmpt_module_read_float_stereo(this.modulePtr, sampleRate, maxFramesPerChunk, this.leftPtr, this.rightPtr)
		}

		// post final data
		let msg = {
			cmd: 'fullAudioData',
			meta: this.getMeta(),
			data: [left,right]
		}
		this.port.postMessage( msg )

		this.stop()
	}

	/**
	 * Swap in the module rebuilt after an edit, keeping everything the song
	 * had around it.
	 *
	 * The edit bridge hot-reloads on every cell change. play() is the
	 * new-song path: it destroys the isolation slots, the dub slots and the
	 * oscilloscope instances, resets the user mute mask and announces
	 * 'playReady'. Run on every edit, that silently unmuted the channels the
	 * user had muted, froze the scopes (only the engine's play() asks for
	 * them again) and made the engine rebuild every insert effect and dub
	 * send per keystroke. Nothing about those changes when a cell does, so
	 * they are captured here and recreated at the restored position — the
	 * slots seek to the main module's position when they are created.
	 */
	hotReload_(buffer) {
		const stack = libopenmpt.stackSave ? libopenmpt.stackSave() : 0
		const curOrder = libopenmpt._openmpt_module_get_current_order(this.modulePtr)
		const curRow = libopenmpt._openmpt_module_get_current_row(this.modulePtr)
		const kept = {
			userMuteMask: this.userMuteMask,
			isolatedBits: this.isolatedBits,
			isolationMasks: this.isolationSlots.map(slot => slot ? slot.channelMask : null),
			dubChannels: this.dubSlots.map(slot => !!slot),
			osc: this.oscEnabled,
		}
		this.play(buffer, this.paused, false)
		if (this.modulePtr) {
			libopenmpt._openmpt_module_set_position_order_row(this.modulePtr, curOrder, curRow)
			// play() learns the channel count only through meta(), which a
			// paused load skips; the masks and the scopes need it.
			this.channels = libopenmpt._openmpt_module_get_num_channels(this.modulePtr)
			this.userMuteMask = kept.userMuteMask
			this.isolatedBits = kept.isolatedBits
			kept.isolationMasks.forEach((mask, i) => { if (mask !== null) this.addIsolationSlot_(i, mask) })
			kept.dubChannels.forEach((on, ch) => { if (on) this.addDubSlot_(ch) })
			this.recomputeMainMask_()
			this.reapplyIsolationMasks_()
			if (kept.osc) this.createOscModule_()
		}
		if (stack) libopenmpt.stackRestore(stack)
	}

	play(buffer, paused = false, announce = true) {
		this.teardownAllIsolation_()
		this.teardownAllDubSlots_()
		this.stop()
		this.lastStateRow = -1
		this.lastStateOrder = -1
		this.userMuteMask = 0xFFFFFFFF  // reset mute state for new song
		this.isolatedBits = 0

		// Cache the raw buffer so isolation slots can create their own module instances
		this.moduleBuffer = buffer.slice ? buffer.slice(0) : new Int8Array(buffer).buffer

		const maxFramesPerChunk = 128	// thats what worklet is using
		const byteArray = new Int8Array(buffer)
		const ptrToFile = libopenmpt._malloc(byteArray.byteLength)
		libopenmpt.HEAPU8.set(byteArray, ptrToFile)

		// Use ext module API for interactive features (channel mute/solo).
		// _openmpt_module_ext_create_from_memory returns an ext handle;
		// _openmpt_module_ext_get_module extracts the regular module ptr.
		this.extPtr = 0
		this.muteFunc = 0
		this.volumeFunc = 0
		if (libopenmpt._openmpt_module_ext_create_from_memory) {
			this.extPtr = libopenmpt._openmpt_module_ext_create_from_memory(ptrToFile, byteArray.byteLength, 0, 0, 0, 0, 0, 0, 0)
			if (this.extPtr) {
				this.modulePtr = libopenmpt._openmpt_module_ext_get_module(this.extPtr)
				// Get interactive interface — struct of 16 function pointers (64 bytes in WASM32)
				// set_channel_volume at index 8 (offset 32), set_channel_mute_status at index 10 (offset 40)
				if (libopenmpt._openmpt_module_ext_get_interface && libopenmpt.stackSave) {
					const INTERACTIVE_STRUCT_SIZE = 64 // 16 function pointers × 4 bytes
					const ifacePtr = libopenmpt._malloc(INTERACTIVE_STRUCT_SIZE)
					if (ifacePtr) {
						// Zero out the struct first
						for (let i = 0; i < INTERACTIVE_STRUCT_SIZE; i++) {
							libopenmpt.HEAPU8[ifacePtr + i] = 0
						}
						const stack = libopenmpt.stackSave()
						const ok = libopenmpt._openmpt_module_ext_get_interface(
							this.extPtr, asciiToStack('interactive'), ifacePtr, INTERACTIVE_STRUCT_SIZE
						)
						libopenmpt.stackRestore(stack)
						if (ok) {
							const read32 = libopenmpt.HEAPU32
								? (off) => libopenmpt.HEAPU32[(ifacePtr + off) >> 2]
								: (off) => new DataView(libopenmpt.HEAPU8.buffer).getUint32(ifacePtr + off, true)
							this.volumeFunc = read32(32) // set_channel_volume (i32,i32,f64)->i32
							this.muteFunc = read32(40)    // set_channel_mute_status (i32,i32,i32)->i32
						}
						libopenmpt._free(ifacePtr)
					}
				}
			}
		}
		// Fallback: if ext API unavailable, use regular module creation
		if (!this.modulePtr) {
			this.modulePtr = libopenmpt._openmpt_module_create_from_memory(ptrToFile, byteArray.byteLength, 0, 0, 0)
		}
		libopenmpt._free(ptrToFile)

		if(this.modulePtr === 0) {
			// could not create module
			this.port.postMessage({cmd:'err',val:'ptr'})
			return
		}

		setAmigaResampler(this.modulePtr)
		
		this.paused = paused
		this.leftPtr = libopenmpt._malloc(4 * maxFramesPerChunk)	// 4x = float
		this.rightPtr = libopenmpt._malloc(4 * maxFramesPerChunk)

		// set config options on module
		libopenmpt._openmpt_module_set_repeat_count(this.modulePtr, this.config.repeatCount)
		libopenmpt._openmpt_module_set_render_param(this.modulePtr, OPENMPT_MODULE_RENDER_STEREOSEPARATION_PERCENT, this.config.stereoSeparation)
		libopenmpt._openmpt_module_set_render_param(this.modulePtr, OPENMPT_MODULE_RENDER_INTERPOLATIONFILTER_LENGTH, this.config.interpolationFilter)

		// post back tracks metadata
		if (!paused) this.meta()

		// Tell the main thread the module EXISTS.
		//
		// `play()` begins by calling `teardownAllDubSlots_()`, so every
		// per-channel dub send is destroyed here. The engine used to restore
		// them on a blind `setTimeout(..., 100)` measured from when it POSTED
		// this message — and creating a 400 KB module takes longer than that,
		// so the teardown above wiped the slots the rebuild had just made.
		// The rebuild is single-shot, so nothing fed `bus.input` for the rest
		// of the song and every capture-and-play move (reverseEcho,
		// backwardReverb, delayTimeThrow) recorded silence. Reported
		// 2026-09-21 and again 2026-09-22.
		if (announce) this.port.postMessage({ cmd: 'playReady' })
	}
	stop() {
		this.destroyOscModule_()
		if (!this.modulePtr && !this.extPtr) return
		if (this.extPtr) {
			libopenmpt._openmpt_module_ext_destroy(this.extPtr)
			this.extPtr = 0
			this.modulePtr = 0 // owned by ext, already destroyed
		} else if (this.modulePtr != 0) {
			libopenmpt._openmpt_module_destroy(this.modulePtr)
			this.modulePtr = 0
		}
		this.muteFunc = 0
		if (this.leftPtr) {
			libopenmpt._free(this.leftPtr)
			this.leftPtr = 0
		}
		if (this.rightPtr) {
			libopenmpt._free(this.rightPtr)
			this.rightPtr = 0
		}
		this.channels = 0
		this.lastStateRow = -1
		this.lastStateOrder = -1
	}
	meta() {
		this.port.postMessage({cmd: 'meta', meta: this.getMeta()})
	}
	getSong() {
		if (!libopenmpt.UTF8ToString || !this.modulePtr) return false

		// https://lib.openmpt.org/doc/
		let song = {
			channels: [],
			instruments: [],
			samples: [],
			orders: [],
			numSubsongs: libopenmpt._openmpt_module_get_num_subsongs(this.modulePtr),
			patterns: [],
		}
		// channels
		const chNum = libopenmpt._openmpt_module_get_num_channels(this.modulePtr)
		this.channels = chNum
		for (let i = 0; i < chNum; i++) {
			song.channels.push( libopenmpt.UTF8ToString(libopenmpt._openmpt_module_get_channel_name(this.modulePtr, i)) )
		}
		// instruments
		for (let i = 0, e = libopenmpt._openmpt_module_get_num_instruments(this.modulePtr); i < e; i++) {
			song.instruments.push( libopenmpt.UTF8ToString(libopenmpt._openmpt_module_get_instrument_name(this.modulePtr, i)) )
		}
		// samples
		for (let i = 0, e = libopenmpt._openmpt_module_get_num_samples(this.modulePtr); i < e; i++) {
			song.samples.push( libopenmpt.UTF8ToString(libopenmpt._openmpt_module_get_sample_name(this.modulePtr, i)) )
		}
		// orders
		for (let i = 0, e = libopenmpt._openmpt_module_get_num_orders(this.modulePtr); i < e; i++) {
			song.orders.push( {
				name: libopenmpt.UTF8ToString(libopenmpt._openmpt_module_get_order_name(this.modulePtr, i)),
				pat: libopenmpt._openmpt_module_get_order_pattern(this.modulePtr, i),
			})
		}
		// patterns
		for (let patIdx = 0, patNum = libopenmpt._openmpt_module_get_num_patterns(this.modulePtr); patIdx < patNum; patIdx++) {
			const pattern = {
				name: libopenmpt.UTF8ToString(libopenmpt._openmpt_module_get_pattern_name(this.modulePtr, patIdx)),
				rows: [],
			}
			// rows
			for(let rowIdx = 0, rowNum = libopenmpt._openmpt_module_get_pattern_num_rows(this.modulePtr, patIdx); rowIdx < rowNum; rowIdx++) {
				const row = []
				// channels
				for (let chIdx = 0; chIdx < chNum; chIdx++) {
					const channel = []
					for (let comIdx = 0; comIdx < 6; comIdx++) {
						/* commands
						OPENMPT_MODULE_COMMAND_NOTE = 0
						OPENMPT_MODULE_COMMAND_INSTRUMENT = 1
						OPENMPT_MODULE_COMMAND_VOLUMEEFFECT = 2
						OPENMPT_MODULE_COMMAND_EFFECT = 3
						OPENMPT_MODULE_COMMAND_VOLUME = 4
						OPENMPT_MODULE_COMMAND_PARAMETER = 5
						*/
						channel.push( libopenmpt._openmpt_module_get_pattern_row_channel_command(this.modulePtr, patIdx, rowIdx, chIdx, comIdx) )
					}
					row.push( channel )
				}
				pattern.rows.push( row )
			}
			song.patterns.push( pattern )
		}


		return song
	}
	getMeta() {
		if (!libopenmpt.UTF8ToString || !this.modulePtr) return false

		const data = {}
		data.dur = libopenmpt._openmpt_module_get_duration_seconds(this.modulePtr)
		if (data.dur == 0) {
			// looks like an error occured reading the mod
			this.port.postMessage({cmd:'err',val:'dur'})
		}
		const keys = libopenmpt.UTF8ToString(libopenmpt._openmpt_module_get_metadata_keys(this.modulePtr)).split(';')
		for (let i = 0; i < keys.length; i++) {
			const keyNameBuffer = libopenmpt._malloc(keys[i].length + 1)
			writeAsciiToMemory(keys[i], keyNameBuffer)
			data[keys[i]] = libopenmpt.UTF8ToString(libopenmpt._openmpt_module_get_metadata(this.modulePtr, keyNameBuffer))
			libopenmpt._free(keyNameBuffer)
		}
		data.song = this.getSong()
		data.totalOrders = data.song.orders.length	// libopenmpt._openmpt_module_get_num_orders(this.modulePtr)
		data.totalPatterns = data.song.patterns.length// libopenmpt._openmpt_module_get_num_patterns(this.modulePtr)
		data.songs = this.getSongs()
		data.libopenmptVersion = libopenmpt.version
		data.libopenmptBuild = libopenmpt.build
		return data
	}
	getSongs() {
		if (!libopenmpt.UTF8ToString) return ''	// todo: ?? why string here

		const subsongs = libopenmpt._openmpt_module_get_num_subsongs(this.modulePtr)
		const names = []
		for (let i = 0; i < subsongs; i++) {
			const namePtr = libopenmpt._openmpt_module_get_subsong_name(this.modulePtr, i)
			const name = libopenmpt.UTF8ToString(namePtr)
			if(name != "") {
				names.push(name)
			} else {
				names.push("Subsong " + (i + 1))
			}
			libopenmpt._openmpt_free_string(namePtr)
		}
		return names
	}

	// ============================================
	// ISOLATION SLOT MANAGEMENT (per-channel FX)
	// ============================================

	/**
	 * Apply a mute mask to an ext module via its interactive interface.
	 * Shared by main module and isolation modules.
	 */
	applyMuteMask_(extPtr, muteFunc, mask) {
		if (!muteFunc || !extPtr || !libopenmpt.wasmTable) return false
		const fn = libopenmpt.wasmTable.get(muteFunc)
		if (!fn) return false
		for (let ch = 0; ch < Math.min(this.channels, 32); ch++) {
			const muted = (mask & (1 << ch)) === 0
			try { fn(extPtr, ch, muted ? 1 : 0) } catch(e) { return false }
		}
		return true
	}

	/**
	 * Belt-and-suspenders channel isolation: set BOTH mute status AND channel volume.
	 * Mute alone can be reset by libopenmpt on loop/seek; volume provides a second layer.
	 * Used for isolation modules; main module uses applyMuteMask_ only (volume stays at 1).
	 */
	applyChannelIsolation_(extPtr, muteFunc, volumeFunc, mask) {
		if (!muteFunc || !extPtr || !libopenmpt.wasmTable) return false
		const muteFn = libopenmpt.wasmTable.get(muteFunc)
		if (!muteFn) return false
		const volFn = volumeFunc ? libopenmpt.wasmTable.get(volumeFunc) : null
		for (let ch = 0; ch < Math.min(this.channels, 32); ch++) {
			const active = (mask & (1 << ch)) !== 0
			try {
				muteFn(extPtr, ch, active ? 0 : 1)
				if (volFn) volFn(extPtr, ch, active ? 1.0 : 0.0)
			} catch(e) { return false }
		}
		return true
	}

	/**
	 * Recompute and apply the combined mute mask for the main module.
	 * Effective mask = userMuteMask & ~isolatedBits — a channel is audible
	 * in main output ONLY if the user hasn't muted it AND it's not isolated.
	 */
	recomputeMainMask_() {
		if (!this.extPtr || !this.muteFunc) return
		const effectiveMask = this.userMuteMask & ~this.isolatedBits
		if (this.isolatedBits) {
			// While isolation is active, use both mute + volume for reliability
			this.applyChannelIsolation_(this.extPtr, this.muteFunc, this.volumeFunc, effectiveMask)
		} else {
			// No isolation active — only use mute, restore all volumes to 1.0
			this.applyMuteMask_(this.extPtr, this.muteFunc, effectiveMask)
			if (this.volumeFunc && libopenmpt.wasmTable) {
				const volFn = libopenmpt.wasmTable.get(this.volumeFunc)
				if (volFn) {
					for (let ch = 0; ch < Math.min(this.channels, 32); ch++) {
						try { volFn(this.extPtr, ch, 1.0) } catch { /* */ }
					}
				}
			}
		}
	}

	/**
	 * Reapply user mute mask to all active isolation slots.
	 * If the user mutes a channel, it should be silent in isolation too.
	 */
	reapplyIsolationMasks_() {
		for (let s = 0; s < MAX_ISOLATION_SLOTS; s++) {
			const slot = this.isolationSlots[s]
			if (!slot) continue
			const effectiveSlotMask = slot.channelMask & this.userMuteMask
			this.applyChannelIsolation_(slot.extPtr, slot.muteFunc, slot.volumeFunc, effectiveSlotMask)
		}
	}

	/**
	 * Create a secondary module instance in isolation slot N.
	 * The slot renders ONLY channels set in channelMask.
	 */
	addIsolationSlot_(slotIndex, channelMask) {
		if (slotIndex < 0 || slotIndex >= MAX_ISOLATION_SLOTS) return
		if (!this.moduleBuffer || !libopenmpt._openmpt_module_ext_create_from_memory) {
			this.port.postMessage({ cmd: 'isolationError', slotIndex, error: 'no moduleBuffer or ext API: buf=' + !!this.moduleBuffer + ' api=' + !!libopenmpt._openmpt_module_ext_create_from_memory })
			return
		}
		// Main module must have working mute, otherwise isolation can't exclude channels
		if (!this.muteFunc || !libopenmpt.wasmTable) {
			this.port.postMessage({ cmd: 'isolationError', slotIndex, error: 'no mute support' })
			return
		}

		// Tear down existing slot if any
		this.removeIsolationSlot_(slotIndex)

		const byteArray = new Int8Array(this.moduleBuffer)
		const ptrToFile = libopenmpt._malloc(byteArray.byteLength)
		libopenmpt.HEAPU8.set(byteArray, ptrToFile)

		let extPtr = libopenmpt._openmpt_module_ext_create_from_memory(
			ptrToFile, byteArray.byteLength, 0, 0, 0, 0, 0, 0, 0
		)
		libopenmpt._free(ptrToFile)
		if (!extPtr) {
			this.port.postMessage({ cmd: 'isolationError', slotIndex, error: 'ext create failed' })
			return
		}

		const modulePtr = libopenmpt._openmpt_module_ext_get_module(extPtr)
		if (!modulePtr) {
			libopenmpt._openmpt_module_ext_destroy(extPtr)
			this.port.postMessage({ cmd: 'isolationError', slotIndex, error: 'get module failed' })
			return
		}

		// Extract mute + volume function pointers from interactive interface
		let muteFunc = 0
		let volumeFunc = 0
		if (libopenmpt._openmpt_module_ext_get_interface && libopenmpt.stackSave) {
			const INTERACTIVE_STRUCT_SIZE = 64
			const ifacePtr = libopenmpt._malloc(INTERACTIVE_STRUCT_SIZE)
			if (ifacePtr) {
				for (let i = 0; i < INTERACTIVE_STRUCT_SIZE; i++) {
					libopenmpt.HEAPU8[ifacePtr + i] = 0
				}
				const stack = libopenmpt.stackSave()
				const ok = libopenmpt._openmpt_module_ext_get_interface(
					extPtr, asciiToStack('interactive'), ifacePtr, INTERACTIVE_STRUCT_SIZE
				)
				libopenmpt.stackRestore(stack)
				if (ok) {
					const read32 = libopenmpt.HEAPU32
						? (off) => libopenmpt.HEAPU32[(ifacePtr + off) >> 2]
						: (off) => new DataView(libopenmpt.HEAPU8.buffer).getUint32(ifacePtr + off, true)
					volumeFunc = read32(32) // set_channel_volume (i32,i32,f64)->i32
					muteFunc = read32(40)   // set_channel_mute_status (i32,i32,i32)->i32
				}
				libopenmpt._free(ifacePtr)
			}
		}

		// CRITICAL: if mute function extraction failed, abort — otherwise the
		// isolation module would render ALL channels through the effect chain
		if (!muteFunc) {
			libopenmpt._openmpt_module_ext_destroy(extPtr)
			this.port.postMessage({ cmd: 'isolationError', slotIndex, error: 'muteFunc extraction failed' })
			return
		}

		// Apply config to match main module
		libopenmpt._openmpt_module_set_repeat_count(modulePtr, this.config.repeatCount)
		libopenmpt._openmpt_module_set_render_param(modulePtr, OPENMPT_MODULE_RENDER_STEREOSEPARATION_PERCENT, this.config.stereoSeparation)
		libopenmpt._openmpt_module_set_render_param(modulePtr, OPENMPT_MODULE_RENDER_INTERPOLATIONFILTER_LENGTH, this.config.interpolationFilter)

		setAmigaResampler(modulePtr)

		// Seek to main module's current position for sync
		if (this.modulePtr) {
			const order = libopenmpt._openmpt_module_get_current_order(this.modulePtr)
			const row = libopenmpt._openmpt_module_get_current_row(this.modulePtr)
			libopenmpt._openmpt_module_set_position_order_row(modulePtr, order, row)
		}

		// Allocate render buffers
		const maxFramesPerChunk = 128
		const leftPtr = libopenmpt._malloc(4 * maxFramesPerChunk)
		const rightPtr = libopenmpt._malloc(4 * maxFramesPerChunk)

		const slot = {
			modulePtr,
			extPtr,
			muteFunc,
			volumeFunc,
			leftPtr,
			rightPtr,
			channelMask,
			paused: this.paused,
		}

		// Apply mute AND volume — belt-and-suspenders for reliable channel isolation.
		// Mute alone can be reset by libopenmpt loop/seek; volume provides a backup.
		const effectiveSlotMask = channelMask & this.userMuteMask
		const maskOk = this.applyChannelIsolation_(extPtr, muteFunc, volumeFunc, effectiveSlotMask)
		if (!maskOk) {
			// Muting failed — abort to prevent all channels going through effects
			libopenmpt._openmpt_module_ext_destroy(extPtr)
			if (leftPtr) libopenmpt._free(leftPtr)
			if (rightPtr) libopenmpt._free(rightPtr)
			this.port.postMessage({ cmd: 'isolationError', slotIndex, error: 'mute mask apply failed' })
			return
		}

		this.isolationSlots[slotIndex] = slot
		this.port.postMessage({
			cmd: 'isolationReady', slotIndex,
			channelMask, muteFunc, volumeFunc,
			effectiveSlotMask: effectiveSlotMask,
			userMuteMask: this.userMuteMask,
			isolatedBits: this.isolatedBits,
			channels: this.channels,
		})
	}

	/**
	 * Destroy an isolation slot and free its resources.
	 */
	removeIsolationSlot_(slotIndex) {
		if (slotIndex < 0 || slotIndex >= MAX_ISOLATION_SLOTS) return
		const slot = this.isolationSlots[slotIndex]
		if (!slot) return

		if (slot.extPtr) {
			libopenmpt._openmpt_module_ext_destroy(slot.extPtr)
		} else if (slot.modulePtr) {
			libopenmpt._openmpt_module_destroy(slot.modulePtr)
		}
		if (slot.leftPtr) libopenmpt._free(slot.leftPtr)
		if (slot.rightPtr) libopenmpt._free(slot.rightPtr)

		this.isolationSlots[slotIndex] = null
	}

	/**
	 * Update which channels an isolation slot renders.
	 */
	updateIsolationMask_(slotIndex, channelMask) {
		if (slotIndex < 0 || slotIndex >= MAX_ISOLATION_SLOTS) return
		const slot = this.isolationSlots[slotIndex]
		if (!slot) return
		slot.channelMask = channelMask
		const effectiveSlotMask = channelMask & this.userMuteMask
		this.applyChannelIsolation_(slot.extPtr, slot.muteFunc, slot.volumeFunc, effectiveSlotMask)
	}

	/**
	 * Tear down all isolation slots.
	 */
	teardownAllIsolation_() {
		for (let i = 0; i < MAX_ISOLATION_SLOTS; i++) {
			this.removeIsolationSlot_(i)
		}
	}

	/**
	 * Apply a callback to each active isolation slot AND every active dub
	 * slot. Used by transport handlers (pause/unpause/setPos) so secondary
	 * instances stay in lockstep with the main module.
	 */
	forEachIsolationSlot_(fn) {
		for (let i = 0; i < MAX_ISOLATION_SLOTS; i++) {
			const slot = this.isolationSlots[i]
			if (slot && slot.modulePtr) fn(slot)
		}
		for (let ch = 0; ch < MAX_DUB_CHANNELS; ch++) {
			const slot = this.dubSlots[ch]
			if (slot && slot.modulePtr) fn(slot)
		}
	}

	// ============================================
	// DUB SLOT MANAGEMENT (per-channel solo render)
	// ============================================

	/**
	 * Allocate a dub slot for `channelIndex` — a secondary module instance
	 * soloing that channel, rendered into output[DUB_OUTPUT_BASE+channelIndex].
	 * No-op if the slot is already allocated. Structurally identical to an
	 * isolation slot with channelMask = 1<<channelIndex.
	 */
	addDubSlot_(channelIndex) {
		if (channelIndex < 0 || channelIndex >= MAX_DUB_CHANNELS) return
		if (this.dubSlots[channelIndex]) return  // already allocated
		if (!this.moduleBuffer || !libopenmpt._openmpt_module_ext_create_from_memory) return
		if (!this.muteFunc || !libopenmpt.wasmTable) return

		const byteArray = new Int8Array(this.moduleBuffer)
		const ptrToFile = libopenmpt._malloc(byteArray.byteLength)
		libopenmpt.HEAPU8.set(byteArray, ptrToFile)

		const extPtr = libopenmpt._openmpt_module_ext_create_from_memory(
			ptrToFile, byteArray.byteLength, 0, 0, 0, 0, 0, 0, 0
		)
		libopenmpt._free(ptrToFile)
		if (!extPtr) return

		const modulePtr = libopenmpt._openmpt_module_ext_get_module(extPtr)
		if (!modulePtr) { libopenmpt._openmpt_module_ext_destroy(extPtr); return }

		// Extract mute + volume function pointers from interactive interface.
		let muteFunc = 0, volumeFunc = 0
		if (libopenmpt._openmpt_module_ext_get_interface && libopenmpt.stackSave) {
			const INTERACTIVE_STRUCT_SIZE = 64
			const ifacePtr = libopenmpt._malloc(INTERACTIVE_STRUCT_SIZE)
			if (ifacePtr) {
				for (let i = 0; i < INTERACTIVE_STRUCT_SIZE; i++) libopenmpt.HEAPU8[ifacePtr + i] = 0
				const stack = libopenmpt.stackSave()
				const ok = libopenmpt._openmpt_module_ext_get_interface(
					extPtr, asciiToStack('interactive'), ifacePtr, INTERACTIVE_STRUCT_SIZE
				)
				libopenmpt.stackRestore(stack)
				if (ok) {
					const read32 = libopenmpt.HEAPU32
						? (off) => libopenmpt.HEAPU32[(ifacePtr + off) >> 2]
						: (off) => new DataView(libopenmpt.HEAPU8.buffer).getUint32(ifacePtr + off, true)
					volumeFunc = read32(32)  // set_channel_volume
					muteFunc = read32(40)    // set_channel_mute_status
				}
				libopenmpt._free(ifacePtr)
			}
		}
		if (!muteFunc) { libopenmpt._openmpt_module_ext_destroy(extPtr); return }

		// Match main module config + Amiga resampler emulation.
		libopenmpt._openmpt_module_set_repeat_count(modulePtr, this.config.repeatCount)
		libopenmpt._openmpt_module_set_render_param(modulePtr, OPENMPT_MODULE_RENDER_STEREOSEPARATION_PERCENT, this.config.stereoSeparation)
		libopenmpt._openmpt_module_set_render_param(modulePtr, OPENMPT_MODULE_RENDER_INTERPOLATIONFILTER_LENGTH, this.config.interpolationFilter)
		setAmigaResampler(modulePtr)

		// Sync to main module's current position so audio is in lockstep.
		if (this.modulePtr) {
			const order = libopenmpt._openmpt_module_get_current_order(this.modulePtr)
			const row = libopenmpt._openmpt_module_get_current_row(this.modulePtr)
			libopenmpt._openmpt_module_set_position_order_row(modulePtr, order, row)
		}

		const maxFramesPerChunk = 128
		const leftPtr = libopenmpt._malloc(4 * maxFramesPerChunk)
		const rightPtr = libopenmpt._malloc(4 * maxFramesPerChunk)

		const soloMask = (1 << channelIndex) & this.userMuteMask
		this.applyChannelIsolation_(extPtr, muteFunc, volumeFunc, soloMask)

		this.dubSlots[channelIndex] = {
			modulePtr, extPtr, muteFunc, volumeFunc,
			leftPtr, rightPtr,
			channelMask: 1 << channelIndex,
			paused: this.paused,
		}
	}

	/**
	 * Free the dub slot for `channelIndex` — destroys the secondary module
	 * instance and frees its render buffers.
	 */
	removeDubSlot_(channelIndex) {
		if (channelIndex < 0 || channelIndex >= MAX_DUB_CHANNELS) return
		const slot = this.dubSlots[channelIndex]
		if (!slot) return
		if (slot.extPtr) libopenmpt._openmpt_module_ext_destroy(slot.extPtr)
		else if (slot.modulePtr) libopenmpt._openmpt_module_destroy(slot.modulePtr)
		if (slot.leftPtr) libopenmpt._free(slot.leftPtr)
		if (slot.rightPtr) libopenmpt._free(slot.rightPtr)
		this.dubSlots[channelIndex] = null
	}

	/** Free every dub slot (called on stop/dispose). */
	teardownAllDubSlots_() {
		for (let ch = 0; ch < MAX_DUB_CHANNELS; ch++) this.removeDubSlot_(ch)
	}

	/**
	 * Create the per-channel oscilloscope instances: one secondary module per
	 * channel, each with every OTHER channel muted from the moment it exists.
	 *
	 * libopenmpt applies a mute at the next tick, never mid-tick, and offers no
	 * per-channel audio output. The previous capture drove ONE instance and
	 * re-soloed a different channel every render quantum, so each 128-sample
	 * "solo" still held the previous channels' audio (silent channels peaked at
	 * 0.09 on ~35% of captures). A mute that is set before the first tick and
	 * never changes has no tick to wait for, so each instance renders its one
	 * channel exactly. All instances render in the same process() call, so the
	 * channels stay time-aligned with each other and with the main output.
	 *
	 * Cost is one extra module render per channel per quantum, so it is
	 * bounded: at most MAX_OSC_CHANNELS instances and OSC_MEMORY_BUDGET bytes
	 * of module copies. Channels past the bound send an empty waveform (no
	 * data) instead of a bleeding one.
	 */
	createOscModule_() {
		this.destroyOscModule_()
		if (!this.moduleBuffer || !this.channels || this.channels === 0) return
		if (!libopenmpt._openmpt_module_ext_create_from_memory) return
		if (!libopenmpt.wasmTable || !libopenmpt.stackSave) return

		const size = this.moduleBuffer.byteLength
		const count = Math.min(this.channels, MAX_OSC_CHANNELS, Math.max(1, Math.floor(OSC_MEMORY_BUDGET / Math.max(1, size))))
		const mainOrder = this.modulePtr ? libopenmpt._openmpt_module_get_current_order(this.modulePtr) : 0
		const mainRow = this.modulePtr ? libopenmpt._openmpt_module_get_current_row(this.modulePtr) : 0
		const modules = []

		for (let ch = 0; ch < count; ch++) {
			const inst = this.createOscInstance_(ch, mainOrder, mainRow)
			if (!inst) { // partial set is useless for the channels that failed, keep what exists
				break
			}
			modules.push(inst)
		}
		if (modules.length === 0) return

		this.oscModules = modules
		this.oscEnabled = true
		this.oscLastSendTime = 0
		this.oscSnapshots = new Array(this.channels)
		this.oscWritePos = new Array(this.channels)
		for (let i = 0; i < this.channels; i++) {
			this.oscSnapshots[i] = new Int16Array(256)
			this.oscWritePos[i] = 0
		}
	}

	/** One oscilloscope instance playing only channel `ch` (all others muted before its first tick). */
	createOscInstance_(ch, order, row) {
		const byteArray = new Int8Array(this.moduleBuffer)
		const ptrToFile = libopenmpt._malloc(byteArray.byteLength)
		libopenmpt.HEAPU8.set(byteArray, ptrToFile)
		const extPtr = libopenmpt._openmpt_module_ext_create_from_memory(
			ptrToFile, byteArray.byteLength, 0, 0, 0, 0, 0, 0, 0
		)
		libopenmpt._free(ptrToFile)
		if (!extPtr) return null
		const modulePtr = libopenmpt._openmpt_module_ext_get_module(extPtr)
		let muteFunc = 0
		if (modulePtr && libopenmpt._openmpt_module_ext_get_interface) {
			const INTERACTIVE_STRUCT_SIZE = 64
			const ifacePtr = libopenmpt._malloc(INTERACTIVE_STRUCT_SIZE)
			if (ifacePtr) {
				for (let i = 0; i < INTERACTIVE_STRUCT_SIZE; i++) libopenmpt.HEAPU8[ifacePtr + i] = 0
				const stack = libopenmpt.stackSave()
				const ok = libopenmpt._openmpt_module_ext_get_interface(
					extPtr, asciiToStack('interactive'), ifacePtr, INTERACTIVE_STRUCT_SIZE
				)
				libopenmpt.stackRestore(stack)
				if (ok) muteFunc = libopenmpt.HEAPU32[(ifacePtr + 40) >> 2]
				libopenmpt._free(ifacePtr)
			}
		}
		if (!modulePtr || !muteFunc) {
			libopenmpt._openmpt_module_ext_destroy(extPtr)
			return null
		}

		// Solo before anything renders. The mute lives in the channel settings,
		// so it survives seeks and song loops; it is never changed afterwards.
		const nc = this.channels
		for (let i = 0; i < nc; i++) {
			libopenmpt.wasmTable.get(muteFunc)(extPtr, i, i === ch ? 0 : 1)
		}

		libopenmpt._openmpt_module_set_repeat_count(modulePtr, this.config.repeatCount)
		libopenmpt._openmpt_module_set_render_param(modulePtr, OPENMPT_MODULE_RENDER_STEREOSEPARATION_PERCENT, this.config.stereoSeparation)
		libopenmpt._openmpt_module_set_render_param(modulePtr, OPENMPT_MODULE_RENDER_INTERPOLATIONFILTER_LENGTH, this.config.interpolationFilter)
		setAmigaResampler(modulePtr)

		if (order > 0 || row > 0) {
			libopenmpt._openmpt_module_set_position_order_row(modulePtr, order, row)
		}

		return {
			modulePtr, extPtr,
			leftPtr: libopenmpt._malloc(4 * 128),
			rightPtr: libopenmpt._malloc(4 * 128),
		}
	}

	/**
	 * Destroy the oscilloscope instances and free resources.
	 */
	destroyOscModule_() {
		if (this.oscModules) {
			for (const m of this.oscModules) {
				if (m.extPtr) libopenmpt._openmpt_module_ext_destroy(m.extPtr)
				if (m.leftPtr) libopenmpt._free(m.leftPtr)
				if (m.rightPtr) libopenmpt._free(m.rightPtr)
			}
			this.oscModules = null
		}
		this.oscEnabled = false
		this.oscSnapshots = null
		this.oscWritePos = null
	}

	/** Seek every oscilloscope instance with the main module. */
	seekOscModules_(fn) {
		if (!this.oscModules) return
		for (const m of this.oscModules) fn(m.modulePtr)
	}

	/**
	 * Capture every channel's waveform for this render quantum (called each
	 * process()): each instance renders its own single channel, so a channel's
	 * waveform contains that channel only.
	 */
	captureOscChannel_() {
		const mods = this.oscModules
		if (!mods || !this.oscSnapshots || this.channels === 0) return

		for (let ch = 0; ch < mods.length; ch++) {
			const osc = mods[ch]
			const frames = libopenmpt._openmpt_module_read_float_stereo(
				osc.modulePtr, sampleRate, 128, osc.leftPtr, osc.rightPtr
			)
			if (frames <= 0) continue
			const lBase = osc.leftPtr / 4
			const rBase = osc.rightPtr / 4
			const heap = libopenmpt.HEAPF32
			const snap = this.oscSnapshots[ch]
			let wp = this.oscWritePos[ch]
			for (let i = 0; i < frames; i++) {
				// Mix L+R to mono, convert to Int16
				const mono = (heap[lBase + i] + heap[rBase + i]) * 0.5
				snap[wp] = Math.max(-32768, Math.min(32767, (mono * 32767) | 0))
				wp = (wp + 1) & 255
			}
			this.oscWritePos[ch] = wp
		}

		// Send at ~30fps
		if (currentTime - this.oscLastSendTime > 0.033) {
			this.oscLastSendTime = currentTime
			const nc = this.channels
			const out = new Array(nc)
			for (let i = 0; i < nc; i++) {
				if (i >= mods.length) { out[i] = new Int16Array(0); continue } // past the capture bound: no data
				const snap = this.oscSnapshots[i]
				const wp = this.oscWritePos[i]
				const copy = new Int16Array(256)
				// Reorder from write position for contiguous waveform
				for (let j = 0; j < 256; j++) {
					copy[j] = snap[(wp + j) & 255]
				}
				out[i] = copy
			}
			this.port.postMessage({ cmd: 'oscData', channels: out }, out.map(a => a.buffer))
		}
	}

}

try { registerProcessor('libopenmpt-processor', MPT) } catch { /* already registered */ }