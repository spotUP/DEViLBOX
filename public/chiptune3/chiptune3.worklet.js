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

	if (!libopenmpt.stackSave) return
	// set libopenmpt version to display later
	let stack = libopenmpt.stackSave()
	libopenmpt.version = libopenmpt.UTF8ToString(libopenmpt._openmpt_get_string(asciiToStack('library_version')))
	libopenmpt.build = libopenmpt.UTF8ToString(libopenmpt._openmpt_get_string(asciiToStack('build')))
	libopenmpt.stackRestore(stack)
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


//
// Processor
//
class MPT extends AudioWorkletProcessor {
	constructor() {
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
	}

	process(inputList, outputList, parameters) {
		if (!this.modulePtr || !this.leftPtr || !this.rightPtr || this.paused) return true	//silence

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

		// Per-channel state (note, instrument, volume, frequency, panning, active) — once per row
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
					chState[base + 2] = libopenmpt._openmpt_module_get_pattern_row_channel_command(this.modulePtr, pat, row, i, 3) // vol
					chState[base + 3] = 0 // frequency not available without new API
					chState[base + 4] = 0 // panning not available without new API
					const vu = Math.max(
						libopenmpt._openmpt_module_get_current_channel_vu_left(this.modulePtr, i),
						libopenmpt._openmpt_module_get_current_channel_vu_right(this.modulePtr, i)
					)
					chState[base + 5] = vu > 0 ? 1 : 0 // active = has VU output
				}
				msg.chState = chState
			}
		}

		this.port.postMessage( msg )

		return true // def. needed for Chrome
	}

	handleMessage_(msg) {
		//console.log('[Processor:Received]',msg.data)
		const v = msg.data.val
		switch (msg.data.cmd) {
			case 'config':
				this.config = v
				break
			case 'play':
				this.play(v, false)
				break
			case 'pause':
				this.paused = true
				break
			case 'unpause':
				this.paused = false
				break
			case 'togglePause':
				this.paused = !this.paused
				break
			case 'stop':
				this.stop()
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
				libopenmpt._openmpt_module_ctl_set(this.modulePtr, asciiToStack('play.pitch_factor'), asciiToStack(v.toString()))
				break
			case 'setTempo':
				if (!libopenmpt.stackSave || !this.modulePtr) return
				libopenmpt._openmpt_module_ctl_set(this.modulePtr, asciiToStack('play.tempo_factor'), asciiToStack(v.toString()))
				break
			case 'selectSubsong':
				if (!this.modulePtr) return
				libopenmpt._openmpt_module_select_subsong(this.modulePtr, v)
				//this.meta()
				break
			case 'setPos':
				if (!this.modulePtr) return
				libopenmpt._openmpt_module_set_position_seconds(this.modulePtr, v)
				break
			case 'setOrderRow':
				if (!this.modulePtr) return
				libopenmpt._openmpt_module_set_position_order_row(this.modulePtr, v.o, v.r)
				break
			case 'hotReload':
				// Reload module data while preserving playback position.
				// If no module is loaded yet, load PAUSED so we don't accidentally
				// start playback (which would emit position=0 and steal the cursor).
				if (!this.modulePtr) { this.play(v, true); break }
				{
					const stack = libopenmpt.stackSave ? libopenmpt.stackSave() : 0
					// Save current position
					const curOrder = libopenmpt._openmpt_module_get_current_order(this.modulePtr)
					const curRow = libopenmpt._openmpt_module_get_current_row(this.modulePtr)
					const wasPaused = this.paused
					// Reload (preserve paused/playing state)
					this.play(v, wasPaused)
					// Restore position
					if (this.modulePtr) {
						libopenmpt._openmpt_module_set_position_order_row(this.modulePtr, curOrder, curRow)
					}
					if (stack) libopenmpt.stackRestore(stack)
				}
				break
			case 'setMuteMask':
				// Set mute state for all channels via ext interactive interface
				if (!this.modulePtr) break
				if (this.muteFunc && this.extPtr && libopenmpt.wasmTable) {
					const fn = libopenmpt.wasmTable.get(this.muteFunc)
					for (let ch = 0; ch < Math.min(this.channels, 16); ch++) {
						const muted = (v & (1 << ch)) === 0
						try { fn(this.extPtr, ch, muted ? 1 : 0) } catch(e) { /* ignore */ }
					}
				}
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

	play(buffer, paused = false) {
		this.stop()
		this.lastStateRow = -1
		this.lastStateOrder = -1

		const maxFramesPerChunk = 128	// thats what worklet is using
		const byteArray = new Int8Array(buffer)
		const ptrToFile = libopenmpt._malloc(byteArray.byteLength)
		libopenmpt.HEAPU8.set(byteArray, ptrToFile)

		// Use ext module API for interactive features (channel mute/solo).
		// _openmpt_module_ext_create_from_memory returns an ext handle;
		// _openmpt_module_ext_get_module extracts the regular module ptr.
		this.extPtr = 0
		this.muteFunc = 0
		if (libopenmpt._openmpt_module_ext_create_from_memory) {
			this.extPtr = libopenmpt._openmpt_module_ext_create_from_memory(ptrToFile, byteArray.byteLength, 0, 0, 0, 0, 0, 0, 0)
			if (this.extPtr) {
				this.modulePtr = libopenmpt._openmpt_module_ext_get_module(this.extPtr)
				// Get interactive interface — struct of 16 function pointers (64 bytes in WASM32)
				// set_channel_mute_status is at index 10 (offset 40)
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
							// Read set_channel_mute_status function pointer (index 10, offset 40)
							this.muteFunc = libopenmpt.HEAPU32
								? libopenmpt.HEAPU32[(ifacePtr + 40) >> 2]
								: new DataView(libopenmpt.HEAPU8.buffer).getUint32(ifacePtr + 40, true)
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

		if (libopenmpt.stackSave) {
			const stack = libopenmpt.stackSave()
			libopenmpt._openmpt_module_ctl_set(this.modulePtr, asciiToStack('render.resampler.emulate_amiga'), asciiToStack('1'))
			libopenmpt._openmpt_module_ctl_set(this.modulePtr, asciiToStack('render.resampler.emulate_amiga_type'), asciiToStack('a1200'))
			libopenmpt.stackRestore(stack)
		}
		
		this.paused = paused
		this.leftPtr = libopenmpt._malloc(4 * maxFramesPerChunk)	// 4x = float
		this.rightPtr = libopenmpt._malloc(4 * maxFramesPerChunk)

		// set config options on module
		libopenmpt._openmpt_module_set_repeat_count(this.modulePtr, this.config.repeatCount)
		libopenmpt._openmpt_module_set_render_param(this.modulePtr, OPENMPT_MODULE_RENDER_STEREOSEPARATION_PERCENT, this.config.stereoSeparation)
		libopenmpt._openmpt_module_set_render_param(this.modulePtr, OPENMPT_MODULE_RENDER_INTERPOLATIONFILTER_LENGTH, this.config.interpolationFilter)

		// post back tracks metadata
		if (!paused) this.meta()
	}
	stop() {
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

}

registerProcessor('libopenmpt-processor', MPT)