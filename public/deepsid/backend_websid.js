// "fix-chrome-consolelog" (or else some idiot chrome versions may crash with "Illegal invokation")
(function(){ var c = window.console.log; window.console.log = function() {c.apply(window.console, arguments); };
window.printErr= window.console.log;
})();

// create separate namespace for all the Emscripten stuff.. otherwise naming clashes may occur especially when 
// optimizing using closure compiler..

window.spp_backend_state_SID= {
	locateFile: function(path, scriptDirectory) { return (typeof window.WASM_SEARCH_PATH == 'undefined') ? path : window.WASM_SEARCH_PATH + path; },
	notReady: true,
	adapterCallback: function(){}	// overwritten later	
};
window.spp_backend_state_SID["onRuntimeInitialized"] = function() {	// emscripten callback needed in case async init is used (e.g. for WASM)
	this.notReady= false;
	this.adapterCallback();
}.bind(window.spp_backend_state_SID);

var backend_SID = (function(Module) {
var b;b||=typeof Module != 'undefined' ? Module : {};var aa=!!globalThis.window,t=!!globalThis.WorkerGlobalScope,u=globalThis.document?.currentScript?.src;t&&(u=self.location.href);var v="",x,y;
if(aa||t){try{v=(new URL(".",u)).href}catch{}t&&(y=c=>{var d=new XMLHttpRequest;d.open("GET",c,!1);d.responseType="arraybuffer";d.send(null);return new Uint8Array(d.response)});x=async c=>{c=await fetch(c,{credentials:"same-origin"});if(c.ok)return c.arrayBuffer();throw Error(c.status+" : "+c.url);}}var z=console.log.bind(console),B=console.error.bind(console),C,D=!1,E,F,G,H,I,J;
function K(c){b.onAbort?.(c);c="Aborted("+c+")";B(c);D=!0;throw new WebAssembly.RuntimeError(c+". Build with -sASSERTIONS for more info.");}var L;async function ba(c){if(!C)try{var d=await x(c);return new Uint8Array(d)}catch{}if(c==L&&C)c=new Uint8Array(C);else if(y)c=y(c);else throw"both async and sync fetching of the wasm failed";return c}async function ca(c,d){try{var a=await ba(c);return await WebAssembly.instantiate(a,d)}catch(e){B(`failed to asynchronously prepare wasm: ${e}`),K(e)}}
async function da(c){var d=L;if(!C)try{var a=fetch(d,{credentials:"same-origin"});return await WebAssembly.instantiateStreaming(a,c)}catch(e){B(`wasm streaming compile failed: ${e}`),B("falling back to ArrayBuffer instantiation")}return ca(d,c)}
var M=c=>{for(;0<c.length;)c.shift()(b)},N=[],O=[],ea=()=>{var c=b.preRun.shift();O.push(c)},P=0,Q=null,R=[],fa=[null,[],[]],S=globalThis.TextDecoder&&new TextDecoder,T=(c,d=0,a,e)=>{var g=d;a=g+a;if(e)e=a;else{for(;c[g]&&!(g>=a);)++g;e=g}if(16<e-d&&c.buffer&&S)return S.decode(c.subarray(d,e));for(g="";d<e;)if(a=c[d++],a&128){var n=c[d++]&63;if(192==(a&224))g+=String.fromCharCode((a&31)<<6|n);else{var q=c[d++]&63;a=224==(a&240)?(a&15)<<12|n<<6|q:(a&7)<<18|n<<12|q<<6|c[d++]&63;65536>a?g+=String.fromCharCode(a):
(a-=65536,g+=String.fromCharCode(55296|a>>10,56320|a&1023))}}else g+=String.fromCharCode(a);return g};b.print&&(z=b.print);b.printErr&&(B=b.printErr);b.wasmBinary&&(C=b.wasmBinary);if(b.preInit)for("function"==typeof b.preInit&&(b.preInit=[b.preInit]);0<b.preInit.length;)b.preInit.shift()();
b.ccall=(c,d,a,e)=>{var g={string:h=>{var l=0;if(null!==h&&void 0!==h&&0!==h){for(var f=l=0;f<h.length;++f){var k=h.charCodeAt(f);127>=k?l++:2047>=k?l+=2:55296<=k&&57343>=k?(l+=4,++f):l+=3}var r=l+1;f=l=U(r);k=F;if(0<r){r=f+r-1;for(var A=0;A<h.length;++A){var m=h.codePointAt(A);if(127>=m){if(f>=r)break;k[f++]=m}else if(2047>=m){if(f+1>=r)break;k[f++]=192|m>>6;k[f++]=128|m&63}else if(65535>=m){if(f+2>=r)break;k[f++]=224|m>>12;k[f++]=128|m>>6&63;k[f++]=128|m&63}else{if(f+3>=r)break;k[f++]=240|m>>18;
k[f++]=128|m>>12&63;k[f++]=128|m>>6&63;k[f++]=128|m&63;A++}}k[f]=0}}return l},array:h=>{var l=U(h.length);E.set(h,l);return l}};c=b["_"+c];var n=[],q=0;if(e)for(var p=0;p<e.length;p++){var w=g[a[p]];w?(0===q&&(q=V()),n[p]=w(e[p])):n[p]=e[p]}a=c(...n);return a=function(h){0!==q&&W(q);return"string"===d?h?T(F,h):"":"boolean"===d?!!h:h}(a)};b.UTF8ToString=(c,d,a)=>c?T(F,c,d,a):"";
var ha={20232:()=>{console.log("info cannot be retrieved  from corrupt .mus file")},20300:()=>{console.log("FATAL ERROR: This BASIC song requires emulator to be configured with optional KERNAL ROM and BASIC ROM")},20422:()=>{console.log("FATAL ERROR: no free memory for driver")},20480:()=>{console.log("ERROR: PSID INIT hangs")},20522:c=>{console.log("JAM 0:  $"+c.toString(16))}},W,U,V,X,ia={c:()=>K(""),a:(c,d,a)=>{R.length=0;for(var e;e=F[d++];){var g=105!=e;g&=112!=e;a+=g&&a%8?4:0;R.push(112==e?
H[a>>2]:106==e?J[a>>3]:105==e?G[a>>2]:I[a>>3]);a+=g?8:4}return ha[c](...R)},d:()=>{K("OOM")},e:()=>52,b:(c,d,a,e)=>{for(var g=0,n=0;n<a;n++){var q=H[d>>2],p=H[d+4>>2];d+=8;for(var w=0;w<p;w++){var h=c,l=F[q+w],f=fa[h];0===l||10===l?((1===h?z:B)(T(f)),f.length=0):f.push(l)}g+=p}H[e>>2]=g;return 0}};
function Y(){function c(){b.calledRun=!0;if(!D){Z.g();b.onRuntimeInitialized?.();if(b.postRun)for("function"==typeof b.postRun&&(b.postRun=[b.postRun]);b.postRun.length;){var d=b.postRun.shift();N.push(d)}M(N)}}if(0<P)Q=Y;else{if(b.preRun)for("function"==typeof b.preRun&&(b.preRun=[b.preRun]);b.preRun.length;)ea();M(O);0<P?Q=Y:b.setStatus?(b.setStatus("Running..."),setTimeout(()=>{setTimeout(()=>b.setStatus(""),1);c()},1)):c()}}var Z;
(async function(){function c(a){a=Z=a.exports;b._malloc=a.h;b._free=a.i;b._emu_load_file=a.j;b._emu_teardown=a.k;b._emu_get_sample_rate=a.l;b._emu_set_subsong=a.m;b._emu_get_track_info=a.n;b._emu_compute_audio_samples=a.o;b._emu_get_audio_buffer=a.p;b._emu_get_audio_buffer_length=a.q;b._emu_get_current_position=a.r;b._emu_seek_position=a.s;b._emu_get_max_position=a.t;b._emu_number_trace_streams=a.u;b._emu_get_trace_streams=a.v;b._emu_set_panning_cfg=a.w;b._emu_get_panning=a.x;b._emu_set_panning=a.y;
b._emu_get_stereo_level=a.z;b._emu_set_stereo_level=a.A;b._emu_get_reverb=a.B;b._emu_set_reverb=a.C;b._emu_get_headphone_mode=a.D;b._emu_set_headphone_mode=a.E;b._emu_get_sid_register=a.F;b._emu_read_voice_level=a.G;b._emu_set_sid_register=a.H;b._emu_is_6581=a.I;b._emu_set_6581=a.J;b._emu_is_ntsc=a.K;b._emu_set_ntsc=a.L;b._emu_enable_voice=a.M;b._emu_enable_stems=a.N;b._emu_get_stem_buffers=a.O;b._emu_get_irq_calls=a.P;b._emu_get_irq_last_cycle=a.Q;b._emu_get_clock_rate=a.R;b._emu_sid_count=a.S;b._emu_get_sid_base=
a.T;b._emu_read_ram=a.U;b._emu_write_ram=a.V;b._emu_get_digi_type=a.W;b._emu_get_digi_desc=a.X;b._emu_get_digi_rate=a.Y;b._emu_set_filter_config_6581=a.Z;b._emu_get_filter_cfg_6581=a._;b._emu_get_filter_cutoff_6581=a.$;W=a.aa;U=a.ba;V=a.ca;X=a.f;a=X.buffer;b.HEAP8=E=new Int8Array(a);b.HEAP16=new Int16Array(a);b.HEAPU8=F=new Uint8Array(a);new Uint16Array(a);b.HEAP32=G=new Int32Array(a);H=new Uint32Array(a);b.HEAPF32=new Float32Array(a);b.HEAPF64=I=new Float64Array(a);J=new BigInt64Array(a);new BigUint64Array(a);
P--;b.monitorRunDependencies?.(P);0==P&&Q&&(a=Q,Q=null,a());return Z}P++;b.monitorRunDependencies?.(P);var d={a:ia};if(b.instantiateWasm)return new Promise(a=>{b.instantiateWasm(d,(e,g)=>{a(c(e,g))})});L??=b.locateFile?b.locateFile("websid.wasm",v):v+"websid.wasm";return c((await da(d)).instance)})();Y();
  return {
	Module: Module,  // expose original Module
  };
})(window.spp_backend_state_SID);
/*
 tinyrsid_adapter.js: Adapts WebSid (aka Tiny'R'Sid) backend to generic WebAudio/ScriptProcessor player.

 version 1.1

 	Copyright (C) 2020-2023 Juergen Wothke

 LICENSE

 This software is licensed under a CC BY-NC-SA
 (http://creativecommons.org/licenses/by-nc-sa/4.0/).
*/
class SIDBackendAdapter extends EmsHEAP16BackendAdapter {
	constructor(basicROM, charROM, kernalROM, nextFrameCB, enableMd5)
	{
		super(backend_SID.Module, 2, new SimpleFileMapper(backend_SID.Module),
				new HEAP16ScopeProvider(backend_SID.Module, 0x8000));	// use stereo (for the benefit of multi-SID songs)

		this._scopeEnabled = false;

		this._ROM_SIZE = 0x2000;
		this._CHAR_ROM_SIZE = 0x1000;

		this._nextFrameCB = (typeof nextFrameCB == 'undefined') ? function() {} : nextFrameCB;

		this._basicROM = this._base64DecodeROM(basicROM, this._ROM_SIZE);
		this._charROM = this._base64DecodeROM(charROM, this._CHAR_ROM_SIZE);
		this._kernalROM = this._base64DecodeROM(kernalROM, this._ROM_SIZE);

		this._enableMd5 = (typeof enableMd5 == 'undefined') ? false : enableMd5;

		this._digiShownLabel = "";
		this._digiShownRate = 0;

		this._resetDigiMeta();

		this.ensureReadyNotification();
	}

	enableScope(enable)
	{
		this._scopeEnabled = enable;
	}

	computeAudioSamples()
	{
		if (typeof window.sid_measure_runs == 'undefined' || !window.sid_measure_runs)
		{
			window.sid_measure_sum = window.sid_measure_runs = 0;
		}
		this._nextFrameCB(this);	// used for "interactive mode"

		let t = performance.now();
//			console.profile(); // if compiled using "emcc.bat --profiling"

		if (this.Module.ccall('emu_compute_audio_samples', 'number'))
		{
			this._resetDigiMeta();
			return 1; // >0 means "end song"
		}
//			console.profileEnd();
		window.sid_measure_sum+= performance.now() - t;

		if (window.sid_measure_runs++ == 100)
		{
			window.sid_measure = window.sid_measure_sum / window.sid_measure_runs;

			window.sid_measure_sum = window.sid_measure_runs = 0;

			if (typeof window.sid_measure_avg_runs == 'undefined' || !window.sid_measure_avg_runs)
			{
				window.sid_measure_avg_sum = window.sid_measure;
				window.sid_measure_avg_runs = 1;
			}
			else
			{
				window.sid_measure_avg_sum += window.sid_measure;
				window.sid_measure_avg_runs += 1;
			}
			window.sid_measure_avg = window.sid_measure_avg_sum / window.sid_measure_avg_runs;
		}
		this._updateDigiMeta();
		return 0;
	}

	loadMusicData(sampleRate, path, filename, data, options)
	{
		this._setPanningConfig(this._panArray);

		let scopeEnabled = (typeof options.traceSID != 'undefined') ? options.traceSID : this._scopeEnabled;
		let procBufSize = this.getProcessorBufSize();

		let basicBuf= 0;
		if (this._basicROM) { basicBuf = this.Module._malloc(this._ROM_SIZE); this.Module.HEAPU8.set(this._basicROM, basicBuf);}

		let charBuf= 0;
		if (this._charROM) { charBuf = this.Module._malloc(this._CHAR_ROM_SIZE); this.Module.HEAPU8.set(this._charROM, charBuf);}

		let kernalBuf= 0;
		if (this._kernalROM) { kernalBuf = this.Module._malloc(this._ROM_SIZE); this.Module.HEAPU8.set(this._kernalROM, kernalBuf);}

		let buf = this.Module._malloc(data.length);
		this.Module.HEAPU8.set(data, buf);

		let ret = this.Module.ccall('emu_load_file', 'number',
							['string', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
							[ filename, buf, data.length, ScriptNodePlayer.getWebAudioSampleRate(), procBufSize, scopeEnabled, basicBuf, charBuf, kernalBuf, this._enableMd5]);

		this.Module._free(buf);

		if (kernalBuf) this.Module._free(kernalBuf);
		if (charBuf) this.Module._free(charBuf);
		if (basicBuf) this.Module._free(basicBuf);

		if (ret == 0)
		{
			this._setupOutputResampling(sampleRate);
		}
		return ret;
	}

	evalTrackOptions(options)
	{
		super.evalTrackOptions(options);

		this._resetDigiMeta();

		let track = (typeof options.track == 'undefined') ? -1 : options.track;
		return this.Module.ccall('emu_set_subsong', 'number', ['number'], [track]);
	}

	getSongInfoMeta()
	{
		return {
			loadAddr: Number,
			playSpeed: Number,
			maxSubsong: Number,
			actualSubsong: Number,
			songName: String,
			songAuthor: String,
			songReleased: String,
			md5: String				// optional: must be enabled via enableMd5 param
		};
	}

	updateSongInfo(filename)
	{
		let result = this._songInfo;
		
		let numAttr = 8;
		let ret = this.Module.ccall('emu_get_track_info', 'number');

		let array = this.Module.HEAP32.subarray(ret>>2, (ret>>2) + numAttr);

		result.loadAddr = this.Module.HEAP32[((array[0])>>2)]; // i32
		result.playSpeed = this.Module.HEAP32[((array[1])>>2)]; // i32
		result.maxSubsong = this.Module.HEAP8[(array[2])]; // i8
		result.actualSubsong = this.Module.HEAP8[(array[3])]; // i8
		result.songName = this._getExtAsciiString(array[4]);
		result.songAuthor = this._getExtAsciiString(array[5]);
		result.songReleased = this._getExtAsciiString(array[6]);
		result.md5 = this.Module.UTF8ToString(array[7]);
	}

	_resetDigiMeta()
	{
		this._digiTypes = {};
		this._digiRate = 0;
		this._digiBatches = 0;
		this._digiEmuCalls = 0;
	}

	_getExtAsciiString(heapPtr)
	{
		// Pointer_stringify cannot be used here since UTF-8 parsing
		// messes up original extASCII content
		let text = "";
		for (let j = 0; j < 32; j++) {
			let b = this.Module.HEAP8[heapPtr+j] & 0xff;
			if(b == 0) break;

			text += (b < 128) ? String.fromCharCode(b) : ("&#" + b + ";");
		}
		return text;
	}

	_base64DecodeROM(encoded, romSize)
	{
		if (typeof encoded == 'undefined') return 0;

		const binString = atob(encoded);
		let r = Uint8Array.from(binString, (m) => m.codePointAt(0));

		return (r.length == romSize) ? r : 0;
	}

	_updateDigiMeta()
	{
		// get a "not so jumpy" status describing digi output

		let dTypeStr = this._getExtAsciiString(this.Module.ccall('emu_get_digi_desc', 'number'));
		let dRate = this.Module.ccall('emu_get_digi_rate', 'number');
		// "emu_compute_audio_samples" correspond to 50/60Hz, i.e. to show some
		// status for at least half a second, labels should only be updated every
		// 25/30 calls..

		if (!isNaN(dRate) && dRate)
		{
			this._digiBatches++;
			this._digiRate += dRate;
			this._digiTypes[dTypeStr] = 1;
		}

		this._digiEmuCalls++;
		if (this._digiEmuCalls == 20)
		{
			this._digiShownLabel = "";

			if (!this._digiBatches)
			{
				this._digiShownRate = 0;
			}
			else
			{
				this._digiShownRate = Math.round(this._digiRate / this._digiBatches);

				const arr = Object.keys(this._digiTypes).sort();
				let c = 0;
				for (const key of arr) {
					if (key.length && (key != "NONE"))
						c++;
				}
				for (const key of arr) {
					if (key.length && (key != "NONE")  && ((c == 1) || (key != "D418")))	// ignore combinations with D418
						this._digiShownLabel+= (this._digiShownLabel.length ? "&" + key : key);
				}
			}
			this._resetDigiMeta();
		}
	}

// ---- postprocessing features

	_setPanningConfig(panArray)
	{
		if (typeof panArray != 'undefined')
		{
			this.Module.ccall('emu_set_panning_cfg',
								'number', ['number','number','number','number','number','number','number','number','number','number',
								'number','number','number','number','number','number','number','number','number','number',
								'number','number','number','number','number','number','number','number','number','number'],
								[panArray[0],panArray[1],panArray[2],panArray[3],panArray[4],panArray[5],panArray[6],panArray[7],panArray[8],panArray[9],
								panArray[10],panArray[11],panArray[12],panArray[13],panArray[14],panArray[15],panArray[16],panArray[17],panArray[18],panArray[19],
								panArray[20],panArray[21],panArray[22],panArray[23],panArray[24],panArray[25],panArray[26],panArray[27],panArray[28],panArray[29],]);
		}
	}

	/**
	* @param panArray 30-entry array with float-values ranging from 0.0 (100% left channel) to 1.0 (100% right channel) .. one value for each voice of the max 10 SIDs
	*/
	initPanningCfg(panArray)
	{
		if (panArray.length != 30)
		{
			console.log("error: initPanningCfg requires an array with panning-values for each of 10 SIDs that WebSid potentially supports.");
		}
		else
		{
			// note: this might be called before the WASM is ready
			this._panArray = panArray;

			if (!backend_SID.Module.notReady)
			{
				this._setPanningConfig(this._panArray);
			}
		}
	}

	getPanning(sidIdx, voiceIdx)
	{
		return this.Module.ccall('emu_get_panning', 'number', ['number', 'number'], [sidIdx, voiceIdx]);
	}

	setPanning(sidIdx, voiceIdx, panning)
	{
		this.Module.ccall('emu_set_panning', 'number',  ['number','number','number'], [sidIdx, voiceIdx, panning]);
	}

	getStereoLevel()
	{
		if (!this.isAdapterReady()) return 0;

		return this.Module.ccall('emu_get_stereo_level', 'number');
	}

	/**
	* @param effect_level -1=stereo completely disabled (no panning), 0=no stereo enhance disabled (only panning); >0= stereo enhance enabled: 16384=low 24576=medium 32767=high
	*/
	setStereoLevel(effect_level)
	{
		if (!this.isAdapterReady()) return 0;

		return this.Module.ccall('emu_set_stereo_level', 'number', ['number'], [effect_level]);
	}

	getReverbLevel()
	{
		if (!this.isAdapterReady()) return 0;

		return this.Module.ccall('emu_get_reverb', 'number');
	}

	/**
	* @param level 0..100
	*/
	setReverbLevel(level)
	{
		if (!this.isAdapterReady()) return 0;

		return this.Module.ccall('emu_set_reverb', 'number', ['number'], [level]);
	}

	getHeadphoneMode()
	{
		if (!this.isAdapterReady()) return 0;

		return this.Module.ccall('emu_get_headphone_mode', 'number');
	}

	/**
	* @param mode 0=headphone 1=ext-headphone
	*/
	setHeadphoneMode(mode)
	{
		if (!this.isAdapterReady()) return 0;

		return this.Module.ccall('emu_set_headphone_mode', 'number', ['number'], [mode]);
	}

// ---- 6581 SID filter configuration

	setFilterConfig6581(base, max, steepness, x_offset, distort, distortOffset, distortScale, distortThreshold, kink)
	{
		if (!this.isAdapterReady()) return;

		return this.Module.ccall('emu_set_filter_config_6581', 'number',
									['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
									[base, max, steepness, x_offset, distort, distortOffset, distortScale, distortThreshold, kink]);
	}

	getFilterConfig6581()
	{
		if (!this.isAdapterReady()) return {};

		let heapPtr = this.Module.ccall('emu_get_filter_cfg_6581', 'number') >> 3;	// 64-bit

		let result = {
			"base": this.Module.HEAPF64[heapPtr+0],
			"max": this.Module.HEAPF64[heapPtr+1],
			"steepness": this.Module.HEAPF64[heapPtr+2],
			"x_offset": this.Module.HEAPF64[heapPtr+3],
			"distort": this.Module.HEAPF64[heapPtr+4],
			"distortOffset": this.Module.HEAPF64[heapPtr+5],
			"distortScale": this.Module.HEAPF64[heapPtr+6],
			"distortThreshold": this.Module.HEAPF64[heapPtr+7],
			"kink": this.Module.HEAPF64[heapPtr+8],
		};
		return result;
	}

	getCutoffsLength()
	{
		return 1024;
	}

	fetchCutoffs6581(distortLevel, destinationArray)
	{
		if (!this.isAdapterReady()) return;
		let heapPtr = this.Module.ccall('emu_get_filter_cutoff_6581', 'number', ['number'], [distortLevel]) >> 3;	// 64-bit

		for (let i = 0; i < this.getCutoffsLength(); i++) {
			destinationArray[i] = this.Module.HEAPF64[heapPtr+i];
		}
	}

// ---- access to "historic" SID data

	/**
	* Gets a specific SID voice's output level (aka envelope) with about ~1 frame precison - using the actual position played
	* by the WebAudio infrastructure.
	*
	* prerequisite: ScriptNodePlayer must be configured with an "external ticker" for precisely timed access.
	*/
	readVoiceLevel(sidIdx, voiceIdx)
	{
		if (!this.isAdapterReady()) return 0;

		let p = ScriptNodePlayer.getInstance();
		let bufIdx = p.getTickToggle();
		let tick = p.getCurrentTick();

		return this.Module.ccall('emu_read_voice_level', 'number', ['number', 'number', 'number', 'number'], [sidIdx, voiceIdx, bufIdx, tick]);
	}

	/**
	* Gets a SID's register with about ~1 frame precison - using the actual position played
	* by the WebAudio infrastructure.
	*
	* prerequisite: ScriptNodePlayer must be configured with an "external ticker" for precisely timed access.
	*/
	getSIDRegister(sidIdx, reg)
	{
		if (!this.isAdapterReady()) return 0;

		let p = ScriptNodePlayer.getInstance();
		let bufIdx = p.getTickToggle();
		let tick = p.getCurrentTick();

		return this.Module.ccall('emu_get_sid_register', 'number', ['number', 'number', 'number', 'number'], [sidIdx, reg, bufIdx, tick]);
	}

// ---- manipulation of emulator state

	enableVoice(sidIdx, voice, on)
	{
		if (!this.isAdapterReady()) return;
		this.Module.ccall('emu_enable_voice', 'number', ['number', 'number', 'number'], [sidIdx, voice, on]);
	}

	setSIDRegister(sidIdx, reg, value)
	{
		if (!this.isAdapterReady()) return;
		return this.Module.ccall('emu_set_sid_register', 'number', ['number', 'number', 'number'], [sidIdx, reg, value]);
	}

	isSID6581()
	{
		if (!this.isAdapterReady()) return 0;
		return this.Module.ccall('emu_is_6581', 'number');
	}

	setSID6581(is6581)
	{
		if (!this.isAdapterReady()) return;
		this.Module.ccall('emu_set_6581', 'number', ['number'], [is6581]);
	}

	isNTSC()
	{
		if (!this.isAdapterReady()) return 0;
		return this.Module.ccall('emu_is_ntsc', 'number');
	}

	setNTSC(ntsc)
	{
		if (!this.isAdapterReady()) return;
		this.Module.ccall('emu_set_ntsc', 'number', ['number'], [ntsc]);
	}

	countSIDs()
	{
		if (!this.isAdapterReady()) return 0;
		return this.Module.ccall('emu_sid_count', 'number');
	}

	getSIDBaseAddr(sidIdx)
	{
		if (!this.isAdapterReady()) return 0;
		return this.Module.ccall('emu_get_sid_base', 'number', ['number'], [sidIdx]);
	}

	getRAM(offset)
	{
		if (!this.isAdapterReady()) return 0;
		return this.Module.ccall('emu_read_ram', 'number', ['number'], [offset]);
	}

	setRAM(offset, value)
	{
		if (!this.isAdapterReady()) return;
		this.Module.ccall('emu_write_ram', 'number', ['number', 'number'], [offset, value]);
	}

// ---- digi playback status

	getDigiType()
	{
		if (!this.isAdapterReady()) return 0;
		return this.Module.ccall('emu_get_digi_type', 'number');
	}

	getDigiTypeDesc()
	{
		if (!this.isAdapterReady()) return 0;
		return this._digiShownLabel;
	}

	getDigiRate()
	{
		if (!this.isAdapterReady()) return 0;
		return this._digiShownRate;
	}

// ---- util for debugging

	printMemDump(name, startAddr, endAddr)
	{
		let text = "const unsigned char "+name+"[] =\n{\n";
		let line = "";
		let j = 0;
		for (let i = 0; i < (endAddr - startAddr + 1); i++) {
			let d = this.Module.ccall('emu_read_ram', 'number', ['number'], [startAddr+i]);
			line += "0x"+(("00" + d.toString(16)).substr(-2).toUpperCase())+", ";
			if (j  == 11)
			{
				text += (line + "\n");
				line = "";
				j = 0;
			}
			else
			{
				j++;
			}
		}
		text += (j?(line+"\n"):"")+"}\n";
		console.log(text);
	}
};

// Expose adapter class on window for dynamic lookup by ScriptNodePlayerEngine
window.SIDBackendAdapter = SIDBackendAdapter;
