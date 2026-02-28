/**
 * Symphonie.worklet.js — AudioWorklet processor for Symphonie Pro
 *
 * Ported from Patrick Meng's VoiceExpander Java source (via VoiceExpander.ts).
 * No imports, no TypeScript — pure AudioWorklet-scope JavaScript.
 *
 * Classes (in order):
 *   SymphonieDSPType  — constants namespace (Off=0, CrEcho=1, Echo=2, Delay=3, CrDelay=4)
 *   SymphonieDSP      — ring-buffer echo/delay/cross effects processor
 *   VoiceSmoother     — declicking fade-in / crossfade / fade-out
 *   VoiceLFO          — volume/pitch slide LFO
 *   Voice             — single channel voice state
 *   VoiceExpander     — main mixer/sequencer engine
 *   SymphonieProcessor — AudioWorkletProcessor wrapper
 */

'use strict';

// ---------------------------------------------------------------------------
// SymphonieDSPType constants
// ---------------------------------------------------------------------------
const SymphonieDSPType = {
  Off:     0,
  CrEcho:  1,
  Echo:    2,
  Delay:   3,
  CrDelay: 4,
};

// ---------------------------------------------------------------------------
// SymphonieDSP
// Port of VoiceExpander.ts lines 26-258
// ---------------------------------------------------------------------------
class SymphonieDSP {
  constructor(NumbOfInputChannels) {
    this.Running            = false;
    this.NumbOfChannels     = 2;
    this.InputChannels      = NumbOfInputChannels;

    // Ring buffer length: 64000 samples × 2 channels
    this.RingBufferLenSamples = 64000 * this.NumbOfChannels;

    this.NewFXLength        = this.RingBufferLenSamples;
    this.FXLength           = this.RingBufferLenSamples;

    this.RingBuffer         = new Float32Array(this.RingBufferLenSamples + 2); // +2 reserve

    this.readPtrDelay       = 100;
    this.readPtrIndex       = 0;
    this.writePtrIndex      = 0;

    this.DSPIntensity       = 0.5;
    this.WetMixVolume       = 0.75; // 1 = Max

    this.FxType             = 0;
    this.OverWritePrevSample = false;
    this.BufferLenSub       = 1;    // 1=Normal, 2=Cross

    this.LengthInBeats      = false;
    this.BeatLength         = 0;
    this.MaxBeatsDspLen     = 0;

    this.allocMemory();
    this.emptyRingBuffers();
    this.setDelay(this.RingBufferLenSamples);
    this.setSyncToBeat(false);
  }

  // ---- management ----

  allocMemory() {
    this.RingBuffer = new Float32Array(this.RingBufferLenSamples + 2);
  }

  init() {
    this.allocMemory();
    this.SetFxClass(0);
  }

  setBeatLength(len) {
    this.BeatLength = len;
    this.recalcNumbOfBeats();
  }

  recalcNumbOfBeats() {
    if (this.BeatLength === 0) {
      this.BeatLength = 600;
    }
    this.MaxBeatsDspLen = this.RingBufferLenSamples / this.BeatLength;
  }

  setSyncToBeat(b) {
    this.LengthInBeats = b;
    this.recalcNumbOfBeats();
  }

  getMaxBeatsDspLen() {
    this.recalcNumbOfBeats();
    return this.MaxBeatsDspLen;
  }

  // ---- Init DSP Fx ----

  SetFxClass(myFxType) {
    this.stop();
    this.FxType = myFxType;
    this.OverWritePrevSample = true;
    if ((this.FxType === SymphonieDSPType.CrEcho) || (this.FxType === SymphonieDSPType.Echo)) {
      this.OverWritePrevSample = false;
    }
    if (this.FxType === SymphonieDSPType.Echo) {
      this.BufferLenSub = 1;
    } else {
      this.BufferLenSub = 2;
    }
    if (this.FxType !== SymphonieDSPType.Off) {
      this.start();
    }
  }

  emptyRingBuffers() {
    this.RingBuffer.fill(0);
  }

  setNewLength(len) {
    if (this.Running) {
      this.stop();
      if (this.LengthInBeats === false) {
        this.NewFXLength = (this.RingBufferLenSamples * len) / 100;
      } else {
        this.NewFXLength = this.BeatLength * len;
      }
      this.start();
    }
  }

  initLenghts() {
    // init fx total length
    this.FXLength = this.NewFXLength;

    // read ptr to start
    this.readPtrIndex = 0;

    // offset write ptr to first delay length
    let NewDelayLen = Math.floor(((this.FXLength - 2) * this.readPtrDelay) / 100);
    NewDelayLen = NewDelayLen & 0xfffffffe; // force even

    // force initial delay in even or odd channel
    if ((this.FxType === SymphonieDSPType.CrDelay) || (this.FxType === SymphonieDSPType.Echo)) {
      this.writePtrIndex = NewDelayLen - 1; // Even Length with 2 Channels
    } else {
      this.writePtrIndex = NewDelayLen;     // Even Length with 2 Channels
    }

    if (this.writePtrIndex < 0) {
      this.writePtrIndex = 0;
    }
  }

  setDelay(len) {
    if (this.Running) {
      this.stop();
      this.readPtrDelay = len;
      this.start();
    }
  }

  // ---- activation ----

  start() {
    this.stop();
    this.emptyRingBuffers();
    this.initLenghts();
    if (this.NewFXLength > 0) {
      this.Running = true;
    }
  }

  stop() {
    this.Running = false;
  }

  // ---- DSP processing ----

  doDSP() {
    if (this.Running && (this.FxType !== SymphonieDSPType.Off)) {
      switch (this.FxType) {
        case SymphonieDSPType.CrEcho:
          this.RingBuffer[this.readPtrIndex] = this.RingBuffer[this.readPtrIndex] * this.DSPIntensity;
          break;
        case SymphonieDSPType.Echo:
          this.RingBuffer[this.readPtrIndex] = this.RingBuffer[this.readPtrIndex] * this.DSPIntensity;
          break;
        case SymphonieDSPType.Delay:
          this.RingBuffer[this.readPtrIndex] = this.RingBuffer[this.readPtrIndex] * this.DSPIntensity;
          break;
        case SymphonieDSPType.CrDelay:
          this.RingBuffer[this.readPtrIndex] = this.RingBuffer[this.readPtrIndex] * this.DSPIntensity;
          break;
        default:
          break;
      }
    }
  }

  // ---- Add source samples into DSP ----

  advanceWritePtr() {
    if (this.Running) {
      if (this.writePtrIndex === 0) {
        this.FXLength = this.NewFXLength;
      }
      this.writePtrIndex = this.advanceRingBufferPtr(this.writePtrIndex);
    }
  }

  addVoiceSampleIntoDSP(Sample) {
    if (this.Running) {
      this.RingBuffer[this.writePtrIndex] += Sample;
    }
  }

  // ---- Read samples after DSP processing ----

  getWetMixSample() {
    if (this.Running) {
      this.doDSP();
      const Sample = this.RingBuffer[this.readPtrIndex];
      if (this.OverWritePrevSample === true) {
        this.RingBuffer[this.readPtrIndex] = 0.0;
      }
      return Sample * this.WetMixVolume;
    } else {
      return 0.0;
    }
  }

  advanceRingBufferPtr(myptr) {
    myptr++;
    if (myptr >= (this.FXLength - this.BufferLenSub)) {
      myptr = 0;
    }
    return myptr;
  }

  advanceReadPtr() {
    if (this.Running) {
      this.readPtrIndex = this.advanceRingBufferPtr(this.readPtrIndex);
    }
  }
}

// ---------------------------------------------------------------------------
// VoiceSmoother — Declicking system
// Port of VoiceExpander.ts lines 260-330
// ---------------------------------------------------------------------------
class VoiceSmoother {
  constructor() {
    this.SampleSmoothing          = false;
    this.FadeOut                  = false;
    this.SampleSmoothingRemaining = 0;
    this.PrevSample               = 0.0;
    this.SmoothNumbOfSamples      = 25;
  }

  setSmoothingLen(len) {
    this.SmoothNumbOfSamples = len;
  }

  stop() {
    this.SampleSmoothing = false;
    this.FadeOut         = false;
  }

  activateSampleSmoothing() {
    this.SampleSmoothing          = false;
    this.SampleSmoothingRemaining = this.SmoothNumbOfSamples;
    this.SampleSmoothing          = true;
    this.FadeOut                  = false;
  }

  activateFadeOut() {
    this.SampleSmoothing          = false;
    this.SampleSmoothingRemaining = this.SmoothNumbOfSamples;
    this.SampleSmoothing          = true;
    this.FadeOut                  = true;
  }

  activateFadeIn() {
    this.SampleSmoothing          = false;
    this.SampleSmoothingRemaining = this.SmoothNumbOfSamples;
    this.PrevSample               = 0.0;
    this.SampleSmoothing          = true;
    this.FadeOut                  = false;
  }

  isFadeingOut() {
    return this.SampleSmoothing && this.FadeOut;
  }

  getSmoothedSample(Sample) {
    if ((this.SampleSmoothing === true) && (this.SampleSmoothingRemaining > 0)) {
      if (this.FadeOut === true) {
        Sample = 0.0;
      }
      let OriginalPart = this.SampleSmoothingRemaining;
      OriginalPart = OriginalPart / this.SmoothNumbOfSamples;
      Sample = (OriginalPart * this.PrevSample) + (Sample * (1 - OriginalPart));
      this.SampleSmoothingRemaining--;
      if (this.SampleSmoothingRemaining <= 0) {
        this.SampleSmoothing = false;
      }
    } else {
      this.SampleSmoothing = false;
      this.PrevSample      = Sample;
    }
    return Sample;
  }
}

// ---------------------------------------------------------------------------
// VoiceLFO — Volume/Pitch LFO with slide and fade-to-value
// Port of VoiceExpander.ts lines 332-447
// ---------------------------------------------------------------------------
class VoiceLFO {
  constructor(Min, Max) {
    this.Running          = false;
    this.BPMrelative      = true;
    this.FadeToValue      = false;
    this.MinValue         = Min;
    this.MaxValue         = Max;
    this.FadeToValueSpeed = 0.0;
    this.DestValue        = 0.0;
    this.dValue           = 0.0;

    // Sinus (not yet implemented in original)
    this.SinusRunning   = false;
    this.SinusIntensity = 100.0;
    this.SinusSpeed     = 1.0;
  }

  // Sinus section (stub — original also just returns Value unchanged)
  applySinusToValue(Value) {
    if (this.SinusRunning === true) {
      // Value += sinus() — not yet implemented in original
    }
    return Value;
  }

  // Slide section
  checkLimits(Value) {
    if ((Value >= this.MaxValue) && (this.dValue > 0)) {
      this.stop();
      Value = this.MaxValue;
    }
    if ((Value <= this.MinValue) && (this.dValue < 0)) {
      this.stop();
      Value = this.MinValue;
    }
    return Value;
  }

  applyToValue(Value) {
    if (this.Running === true) {
      if (this.FadeToValue === false) {
        // Fade Up / Down
        Value += this.dValue;
        Value  = this.checkLimits(Value);
      } else {
        // Fade To Value
        this.dValue = (this.DestValue - Value) / this.FadeToValueSpeed;
        if (this.dValue === 0) {
          this.Running = false;
        } else {
          if (this.dValue > 0) {
            if ((Value + this.dValue) >= this.DestValue) {
              Value        = this.DestValue;
              this.Running = false;
            }
          } else {
            if ((Value + this.dValue) <= this.DestValue) {
              Value        = this.DestValue;
              this.Running = false;
            }
          }
          if (this.Running === true) {
            Value += this.dValue;
          }
          Value = this.checkLimits(Value);
        }
      }
    }
    return Value;
  }

  initSlide(NewdValue) {
    this.Running = false;
    if (NewdValue !== 0) {
      this.FadeToValue = false;
      this.dValue      = NewdValue;
      this.Running     = true;
    }
  }

  initSlideToValue(NewDestValue, Speed) {
    this.Running = false;
    if ((this.DestValue >= this.MinValue) && (this.DestValue <= this.MaxValue) && (Speed !== 0)) {
      this.FadeToValue      = true;
      this.DestValue        = NewDestValue;
      this.FadeToValueSpeed = Speed;
      this.Running          = true;
    }
  }

  isRunning() {
    return this.Running;
  }

  stop() {
    this.Running = false;
  }
}

// ---------------------------------------------------------------------------
// Voice — single channel voice state
// Port of VoiceExpander.ts lines 449-504
// ---------------------------------------------------------------------------
class Voice {
  constructor() {
    this.inUse           = false;
    this.ChannelVolume   = 0.0;
    this.PlayFrequency   = 440.0;
    this.SourceFrequency = 44100.0;
    this.SamplePtr       = 0.0;
    this.SampleEndPtr    = 0.0;

    this.NumbOfLoopsRemaining = 0;
    this.LastSample           = 0.0;
    this.isPausing            = false;
    this.si                   = null;

    // LFOs
    this.LFOChannelVol = new VoiceLFO(0, 100);
    this.LFOPitch      = new VoiceLFO(100, 200);
    this.LFOSample     = new VoiceLFO(0, 255);

    // Anti-click
    this.Smoother = new VoiceSmoother();
  }

  processAllLFOs() {
    if (this.LFOChannelVol.isRunning() === true) {
      this.ChannelVolume = this.LFOChannelVol.applyToValue(this.ChannelVolume);
    }
  }

  pausePlaying() {
    this.isPausing = true;
  }

  continuePlaying() {
    this.isPausing = false;
  }

  setNumbOfLoopsRemaining(NumbOfLoops) {
    this.NumbOfLoopsRemaining = NumbOfLoops;
  }

  getNumbOfLoopsRemaining() {
    return this.NumbOfLoopsRemaining;
  }

  decNumbOfLoopsRemaining() {
    if (this.NumbOfLoopsRemaining > 0) {
      this.NumbOfLoopsRemaining--;
    }
  }
}

// ---------------------------------------------------------------------------
// VoiceExpander — main mixer and sequencer engine
// Port of VoiceExpander.ts lines 506-1253 (excluding PlayActualMixThread,
// OpenMixSystem, OpenMixSystemSafe, SampleToBuffer).
// loadSong(), checkSongEvent(), and _playRow() are new additions.
// ---------------------------------------------------------------------------
class VoiceExpander {
  constructor() {
    this.isReady   = false;
    this.InitError = false;
    this.ErrorString = '';

    this.MixFrequency = 44100.0;   // Output mix frequency
    this.BPM          = 120.0;     // Used for beat-synced FX
    this.NewBPM       = 120.0;
    this.BPMTune      = 100;       // 100% = original speed

    this.MasterVolume = 100.0;     // Global mix volume (0-100)
    this.MasterTune   = 0.0;
    this.NumbOfVoices = 64;        // Number of sound channels

    this.MinPitch       = 0;
    this.MaxPitch       = 257;
    this.BasePitchOffset = 24;
    this.FreqTableFactor = 0.095;

    this.MixChannels         = 2;
    this.MixBufferLenSamples = 1024 * this.MixChannels;

    this.Declicking        = true;
    this.InterpolationType = 1;    // 0 = none, 1 = linear
    this.Dithering         = 0;
    this.DSPFxIndex        = 0;

    // Frequency table (equal temperament)
    this.FreqBase = new Float32Array([
      1.0000, 1.0595, 1.1225, 1.1892, 1.2599, 1.3348,
      1.4142, 1.4983, 1.5874, 1.6818, 1.7818, 1.8878,
    ]);
    this.FreqTable = new Float32Array(this.MaxPitch + 1);

    // Global DSP (initialised with 16 channels like original)
    this.DSP = new SymphonieDSP(16);

    // Song state (set by setSong / loadSong)
    this._linkedSong              = null;
    this.InitSamplesTillSongEvent = 5000;
    this.SamplesTillSongEvent     = 0;

    this.LogEvents    = true;
    this.EventCounter = 0;

    // Internal sequencer state (loadSong populates these)
    this._orderList   = null;
    this._patterns    = null;
    this._instruments = null;
    this._orderPos    = 0;
    this._rowPos      = 0;

    // Initialise voices array and frequency table
    this.Voices = new Array(this.NumbOfVoices);
    for (let i = 0; i < this.NumbOfVoices; i++) {
      this.Voices[i] = new Voice();
    }
    this.InitFreqTable();
  }

  // ---- System parameters ----

  getInitSamplesTillSongEvent() {
    return Math.floor((this.InitSamplesTillSongEvent * 100) / this.BPMTune);
  }

  setDeclicking(b) {
    this.Declicking = b;
  }

  setDSPFxIndex(myDSP) {
    this.DSPFxIndex = myDSP;
    this.DSP.setBeatLength(this.getInitSamplesTillSongEvent());
    if (this.DSPFxIndex === 0) {
      this.DSP.stop();
    } else {
      this.DSP.stop();
      this.DSP.SetFxClass(this.DSPFxIndex);
      this.DSP.start();
    }
  }

  setWetMixVolume(DSPVolume) {
    this.DSP.WetMixVolume = DSPVolume / 100;
  }

  setDSPPreDelay(len) {
    this.DSP.setDelay(len);
  }

  setDSPLength(len) {
    this.DSP.setNewLength(len);
  }

  setDSPFeedback(DSPVolume) {
    this.DSP.DSPIntensity = DSPVolume / 100;
  }

  setBPMTune(myBPM) {
    this.BPMTune = myBPM;
  }

  // ---- Song interface ----

  setSong(s) {
    this._linkedSong          = s;
    this.SamplesTillSongEvent = this.getInitSamplesTillSongEvent();
  }

  setSongSpeed(BPM, Cycle) {
    const NewSpeed = 178900 * Cycle / BPM;
    this.InitSamplesTillSongEvent = Math.floor(NewSpeed);
    this.DSP.setBeatLength(this.getInitSamplesTillSongEvent());
  }

  // ---- loadSong — called from SymphonieProcessor with SymphoniePlaybackData ----

  loadSong(data) {
    this._orderList = data.orderList;
    this._patterns  = data.patterns;
    this._orderPos  = 0;
    this._rowPos    = 0;

    this.NumbOfVoices = data.numChannels;
    this.MixChannels  = 2;

    // Set timing
    this.setSongSpeed(data.bpm, data.cycle);
    this.SamplesTillSongEvent = this.getInitSamplesTillSongEvent();

    // Build internal instrument objects
    this._instruments = data.instruments.map((inst) => {
      const hasLoop = (inst.loopLen > 0) && (inst.type === 4 || inst.type === 8);

      let sp = null;
      if (inst.samples && inst.samples.length > 0) {
        const N              = inst.samples.length;
        const loopStartSample = Math.floor((inst.loopStart * N) / (100 * 65536));
        const loopLenSamples  = Math.floor((inst.loopLen  * N) / (100 * 65536));
        const loopEnd         = loopStartSample + loopLenSamples;
        const endlessLoop     = inst.numLoops === 0 && hasLoop;

        sp = {
          Samples:      inst.samples,
          NumbOfSamples: N,
          LoopStart:    loopStartSample,
          LoopEnd:      loopEnd,
          EndlessLoop:  endlessLoop,
          // Number of finite loops (0 for endless)
          _numLoops:    inst.numLoops,

          hasLoop()                { return hasLoop; },
          getLoopStart()           { return this.LoopStart; },
          getLoopEndSampleIndex()  { return this.LoopEnd; },
          getEndlessLoop()         { return this.EndlessLoop; },
          getNumbOfSamples()       { return this.NumbOfSamples; },
          getNumbOfLoops()         { return this._numLoops; },
        };
      }

      return {
        // Raw data fields (mirrors SymphonieInstrumentData)
        name:          inst.name,
        type:          inst.type,
        volume:        inst.volume,
        tune:          inst.tune,
        fineTune:      inst.fineTune,
        noDsp:         inst.noDsp,
        multiChannel:  inst.multiChannel,
        loopStart:     inst.loopStart,
        loopLen:       inst.loopLen,
        numLoops:      inst.numLoops,
        sampledFrequency: inst.sampledFrequency,

        // Aliased fields used by VoiceExpander logic
        NoDsp:     inst.noDsp,
        Volume:    inst.volume,
        Tune:      inst.tune,
        FineTune:  inst.fineTune,

        // Allow position detune (not used in basic port)
        AllowPosDetune: false,

        // Sample object (or null)
        sp,

        // ImportSample shim: provides SampledFrequency
        ImportSample: {
          SampledFrequency: inst.sampledFrequency > 0 ? inst.sampledFrequency : 8363,
        },

        checkReady() {
          return (this.type !== -8) && (this.type !== -4) && (this.sp !== null);
        },
      };
    });

    // Init voices — pairs: even index = L, odd = R (stride = MixChannels = 2)
    this.Voices = [];
    for (let i = 0; i < this.NumbOfVoices * 2; i++) {
      this.Voices.push(new Voice());
    }

    // Apply global DSP from song header
    if (data.globalDspType !== 0) {
      this.setDSPFxIndex(data.globalDspType);
      this.DSP.DSPIntensity = data.globalDspFeedback / 127.0;
      const maxBufLen = this.DSP.FXLength - 2;
      const bufLen    = Math.round((maxBufLen * data.globalDspBufLen) / 100);
      if (bufLen > 0) {
        this.DSP.readPtrDelay = bufLen;
        this.DSP.start(); // re-init lengths with new delay
      }
      this.DSP.start();
    }

    this.isReady = true;
  }

  // ---- Sequencer event dispatch ----

  // Replaces Java checkSongEvent() — uses internal _orderList/_patterns
  checkSongEvent() {
    // If we have an attached Java-style LinkedSong, use original logic
    if (this._linkedSong !== null) {
      if (this._linkedSong.SongPlaying) {
        if (this.SamplesTillSongEvent > 0) {
          this.SamplesTillSongEvent--;
          if (this.SamplesTillSongEvent <= 0) {
            const tempSamples = this._linkedSong.PlaySongEvent(this);
            if (tempSamples !== 0) {
              this.InitSamplesTillSongEvent = tempSamples;
            }
            this.SamplesTillSongEvent = this.getInitSamplesTillSongEvent();
          }
        }
      }
      return;
    }

    // Native sequencer path (loadSong)
    if (!this._orderList || this._orderList.length === 0) return;

    this.SamplesTillSongEvent--;
    if (this.SamplesTillSongEvent <= 0) {
      this.SamplesTillSongEvent = this.getInitSamplesTillSongEvent();
      this._playRow();
    }
  }

  _playRow() {
    if (!this._orderList || this._orderList.length === 0) return;

    const patIdx = this._orderList[this._orderPos];
    const pat    = this._patterns[patIdx];
    if (!pat) return;

    const row = this._rowPos;

    // Fire instrument/note events for this row
    for (const ev of pat.events) {
      if (ev.row !== row) continue;
      if (ev.instrument <= 0) continue; // 1-based; 0 = no instrument
      const inst = this._instruments[ev.instrument - 1];
      if (!inst || !inst.checkReady()) continue;
      if (ev.note > 0) {
        const vol = (ev.volume > 0 && ev.volume !== 255) ? ev.volume : inst.Volume;
        // PlayInstrumentNote equivalent (using channel-based voice allocation)
        const voiceNr = ev.channel * 2; // L voice for this channel; R = voiceNr+1
        const freq    = this.getPitchToFreq(ev.note - 1 + inst.Tune, inst.FineTune);

        // Play into the L voice slot of the channel
        this.PlayInstrumentIntoVoice(inst, voiceNr, freq, vol);
        // R voice mirrors L but is offset by 1 (stereo pair)
        this.PlayInstrumentIntoVoice(inst, voiceNr + 1, freq, vol);
      }
      // Handle volume-only events (note === 0, volume change)
      if (ev.note === 0 && ev.volume !== 255 && ev.volume >= 0) {
        const voiceNr = ev.channel * 2;
        this.SongEventSetVolume(voiceNr,     ev.volume);
        this.SongEventSetVolume(voiceNr + 1, ev.volume);
      }
    }

    // Fire DSP events for this row
    for (const dspEv of pat.dspEvents) {
      if (dspEv.row !== row) continue;

      if (dspEv.type === 0) {
        this.DSP.stop();
      } else {
        const fb     = dspEv.feedback / 127.0;
        const maxBuf = this.DSP.FXLength - 2;
        const len    = Math.round((maxBuf * dspEv.bufLen) / 100);
        this.DSP.DSPIntensity = fb;
        this.DSP.SetFxClass(dspEv.type);
        if (len > 0) {
          this.DSP.readPtrDelay = len;
          this.DSP.start();
        }
        this.DSP.start();
      }
    }

    // Advance sequencer position
    this._rowPos++;
    if (this._rowPos >= pat.numRows) {
      this._rowPos = 0;
      this._orderPos++;
      if (this._orderPos >= this._orderList.length) {
        this._orderPos = 0; // loop song
      }
    }
  }

  // ---- Frequency table ----

  getNumbOfPitches() {
    return this.MaxPitch - this.MinPitch;
  }

  InitFreqTable() {
    let counter = 0;
    let factor  = this.FreqTableFactor;
    for (let i = 0; i < this.getNumbOfPitches(); i++) {
      this.FreqTable[i] = this.FreqBase[counter] * factor;
      counter++;
      if (counter > this.FreqBase.length - 1) {
        factor  = factor * 2;
        counter = 0;
      }
    }
  }

  getPitchToFreq(Pitch, Finetune) {
    Pitch += this.BasePitchOffset;
    if (Pitch < this.MinPitch)     Pitch = this.MinPitch;
    if (Pitch > this.MaxPitch - 1) Pitch = this.MaxPitch - 1;

    let f = this.FreqTable[Pitch] * 110.0;
    if (Finetune > 0) {
      const f1 = this.FreqTable[Pitch + 1] * 110.0;
      f = f + ((f1 - f) * (Finetune / 127));
    }
    if (Finetune < 0) {
      const f1 = this.FreqTable[Pitch - 1] * 110.0;
      f = f + ((f - f1) * (Finetune / 128));
    }
    return f;
  }

  // ---- Voice allocation ----

  getFreeVoice() {
    for (let i = 0; i < this.NumbOfVoices; i++) {
      if (this.Voices[i] === null || this.Voices[i] === undefined) {
        this.Voices[i] = new Voice();
        return this.Voices[i];
      } else if (this.Voices[i].inUse === false) {
        return this.Voices[i];
      }
    }
    return null;
  }

  getVoiceNr(i) {
    if (this.Voices[i] === null || this.Voices[i] === undefined) {
      this.Voices[i] = new Voice();
    }
    return this.Voices[i];
  }

  // ---- Instrument playback ----

  // Free-voice variant (3 args): si, freq, vol
  PlayInstrumentFree(si, freq, vol) {
    const v = this.getFreeVoice();
    if ((v !== null) && (si !== null)) {
      v.si = si;
      if ((v.si.sp !== null) && (v.si.sp.getNumbOfSamples() > 1)) {
        v.SampleEndPtr    = v.si.sp.getNumbOfSamples() - 1;
        v.ChannelVolume   = vol;
        v.PlayFrequency   = freq;
        v.SourceFrequency = v.si.ImportSample.SampledFrequency;
        v.inUse           = true;
        v.SamplePtr       = 0.0;
        v.Smoother.activateFadeIn();
        return true;
      }
    }
    return false;
  }

  // Forced-channel variant (4 args): si, VoiceNr, freq, vol
  PlayInstrumentIntoVoice(si, VoiceNr, freq, vol) {
    const v = this.getVoiceNr(VoiceNr);
    if ((v !== null) && si.checkReady()) {
      if (v.inUse === true) {
        v.Smoother.activateSampleSmoothing();
      } else {
        v.Smoother.activateFadeIn();
      }
      v.continuePlaying();
      v.si              = si;
      v.SampleEndPtr    = v.si.sp.getNumbOfSamples() - 1;
      v.setNumbOfLoopsRemaining(v.si.sp.getNumbOfLoops());
      v.ChannelVolume   = vol;
      v.PlayFrequency   = freq;
      v.SourceFrequency = v.si.ImportSample.SampledFrequency;
      v.SamplePtr       = 0.0;
      v.isPausing       = false;
      v.inUse           = true;
    }
  }

  // Alias used by SongEventKeyOn / PlayInstrumentNote paths
  PlayInstrument(si, ...rest) {
    if (rest.length === 2) {
      // (si, freq, vol)
      return this.PlayInstrumentFree(si, rest[0], rest[1]);
    } else {
      // (si, VoiceNr, freq, vol)
      return this.PlayInstrumentIntoVoice(si, rest[0], rest[1], rest[2]);
    }
  }

  // ---- Song event helpers ----

  SongEventVSlide(VoiceNr, VolChangeSpeed) {
    this.SetVoiceVSlide(VoiceNr, VolChangeSpeed);
  }

  SongEventSetVolume(VoiceNr, vol) {
    const oldvol = this.GetVoiceVolume(VoiceNr);
    this.stopVolumeLFO(VoiceNr);
    if (Math.abs(vol - oldvol) > 40.0) {
      const v = this.getVoiceNr(VoiceNr);
      v.Smoother.activateSampleSmoothing();
    }
    this.SetVoiceVolume(VoiceNr, vol);
  }

  SongEventAddVolume(VoiceNr, vol) {
    this.stopVolumeLFO(VoiceNr);
    this.SetVoiceVolume(VoiceNr, this.GetVoiceVolume(VoiceNr) + vol);
  }

  SongEventKeyOn(si, VoiceNr, NoteIndex, vol) {
    this.stopVolumeLFO(VoiceNr);
    const PosTuneOffset = 0; // AllowPosDetune not used in JS port
    this.SongEventKeyOnFreq(si, VoiceNr, this.getPitchToFreq(NoteIndex + si.Tune + PosTuneOffset, si.FineTune), vol);
  }

  SongEventSetPitch(si, VoiceNr, NoteIndex) {
    const PosTuneOffset = 0;
    this.SetVoiceFreq(si, VoiceNr, this.getPitchToFreq(NoteIndex + si.Tune + PosTuneOffset, si.FineTune));
  }

  SongEventKeyOnSamplePos(si, VoiceNr, NoteIndex, SamplePos) {
    const PosTuneOffset = 0;
    this.SongEventContinue(VoiceNr, false);
    this.SetVoiceSamplePos(si, VoiceNr, this.getPitchToFreq(NoteIndex + si.Tune + PosTuneOffset, si.FineTune), SamplePos);
  }

  SongEventPausePlaying(VoiceNr) {
    const v = this.getVoiceNr(VoiceNr);
    if (v !== null) {
      v.pausePlaying();
      v.Smoother.activateFadeOut();
    }
  }

  SongEventContinue(VoiceNr, ActivateFadeIn) {
    const v = this.getVoiceNr(VoiceNr);
    if (v !== null) {
      if (ActivateFadeIn) {
        v.Smoother.activateFadeIn();
      }
      v.continuePlaying();
    }
  }

  SongEventKeyOnFreq(si, VoiceNr, Freq, vol) {
    this.PlayInstrumentIntoVoice(si, VoiceNr, Freq, vol);
  }

  GetVoiceVolume(VoiceNr) {
    const v = this.getVoiceNr(VoiceNr);
    if (v !== null) return v.ChannelVolume;
    return 0.0;
  }

  SetVoiceVolume(VoiceNr, Vol) {
    const v = this.getVoiceNr(VoiceNr);
    if (v !== null) {
      if ((Vol >= 0) && (Vol <= 100)) {
        v.ChannelVolume = Vol;
      }
    }
  }

  SetVoiceVSlide(VoiceNr, VolChangeSpeed) {
    const v = this.getVoiceNr(VoiceNr);
    if (v !== null) {
      v.LFOChannelVol.initSlide(VolChangeSpeed / 6500);
    }
  }

  stopVolumeLFO(VoiceNr) {
    const v = this.getVoiceNr(VoiceNr);
    if (v !== null) {
      v.LFOChannelVol.stop();
    }
  }

  SetVoiceFreq(si, VoiceNr, freq) {
    const v = this.getVoiceNr(VoiceNr);
    if ((v !== null) && si.checkReady()) {
      v.si             = si;
      v.PlayFrequency  = freq;
    }
  }

  SetVoiceSamplePos(si, VoiceNr, freq, SamplePos) {
    const v = this.getVoiceNr(VoiceNr);
    if ((v !== null) && si.checkReady()) {
      v.si = si;
      if (v.inUse === true) {
        v.Smoother.activateSampleSmoothing();
      } else {
        v.Smoother.activateFadeIn();
      }
      v.SampleEndPtr    = v.si.sp.getNumbOfSamples() - 1;
      v.ChannelVolume   = 100.0;
      v.PlayFrequency   = freq;
      v.SourceFrequency = v.si.ImportSample.SampledFrequency;
      v.inUse           = true;
      if ((SamplePos >= 0) && (SamplePos <= 255.0)) {
        v.SamplePtr = (SamplePos / 255) * (v.SampleEndPtr - 1);
      } else {
        v.SamplePtr = 0.0;
      }
    }
  }

  PlayInstrumentNote(si, NoteIndex, vol) {
    const f = this.getPitchToFreq(NoteIndex + si.Tune, si.FineTune);
    this.PlayInstrumentFree(si, f, vol);
  }

  // ---- Voice lifecycle ----

  stopVoice(index) {
    const v = this.Voices[index];
    if (!v) return;
    v.LFOChannelVol.stop();
    v.LFOPitch.stop();
    v.LFOSample.stop();
    v.inUse        = false;
    v.Smoother.stop();
    v.isPausing    = false;
    v.LastSample   = 0.0;
  }

  stopAll() {
    for (let i = 0; i < this.NumbOfVoices; i++) {
      if (this.isVoicePlaying(i) === true) {
        this.stopVoice(i);
      }
    }
  }

  setVoiceSmoothingLen(len) {
    for (let i = 0; i < this.NumbOfVoices; i++) {
      if (this.Voices[i]) {
        this.Voices[i].Smoother.setSmoothingLen(len);
      }
    }
  }

  endVoice(v, LastSamplePlayed) {
    v.inUse = false;
    if (LastSamplePlayed !== 0.0) {
      v.LastSample = LastSamplePlayed;
      v.Smoother.activateFadeOut();
    }
  }

  isVoicePlaying(i) {
    const v = this.Voices[i];
    if (v !== null && v !== undefined && v.si !== null &&
        ((v.inUse === true) || (v.Smoother.isFadeingOut() === true))) {
      return true;
    }
    return false;
  }

  isVoicePausing(i) {
    if (this.Declicking === true) {
      const v = this.Voices[i];
      if (v !== null && v !== undefined && v.isPausing && !v.Smoother.isFadeingOut()) {
        return true;
      }
      return false;
    } else {
      const v = this.Voices[i];
      if (v !== null && v !== undefined && v.isPausing) {
        return true;
      }
      return false;
    }
  }

  getNumbOfVoicesPlaying() {
    let counter = 0;
    for (let i = 0; i < this.NumbOfVoices; i++) {
      if (this.isVoicePlaying(i) === true) counter++;
    }
    return counter;
  }

  // ---- Per-sample mixing ----

  getNextMixSample(ChannelNr) { // 0 = Left, 1 = Right
    let SampleMix  = 0.0;
    const ChannelStep = this.MixChannels;

    for (let i = 0; i < this.NumbOfVoices; i += ChannelStep) {
      const idx = i + ChannelNr;
      if (this.isVoicePlaying(idx) === true && this.isVoicePausing(idx) === false) {
        SampleMix += this.getNextVoiceSample(idx);
      }
    }
    return SampleMix;
  }

  getNextVoiceSample(i) {
    const v = this.Voices[i];
    if (!v) return 0.0;

    let Sample = 0.0;
    let dSample;

    v.processAllLFOs();
    const vol = v.ChannelVolume;

    if (v.inUse === true) {
      switch (this.InterpolationType) {
        case 0: {
          // No interpolation
          Sample = v.si.sp.Samples[v.SamplePtr | 0];
          break;
        }
        case 1: {
          // Linear interpolation
          const ptr   = v.SamplePtr | 0;
          if ((ptr + 1) <= v.SampleEndPtr) {
            const fract = v.SamplePtr - ptr;
            Sample  = v.si.sp.Samples[ptr + 1] * fract;
            Sample += v.si.sp.Samples[ptr] * (1 - fract);
          } else {
            Sample = v.si.sp.Samples[ptr];
          }
          break;
        }
        default:
          break;
      }

      // Apply channel volume then instrument volume
      Sample = (Sample * vol) / 100;
      Sample = (Sample * v.si.Volume) / 100;

      // Declicking
      if (this.Declicking) {
        Sample = v.Smoother.getSmoothedSample(Sample);
      }

      // Advance sample pointer (1.1 factor from original, apply master tune)
      dSample = (1.1 + (this.MasterTune / 50)) * v.PlayFrequency / 440.0;
      v.SamplePtr += dSample;

      // Loop system
      if (v.si.sp.hasLoop() === true) {
        this.ProcessLoopSystem(v);
      }

      // End of sample
      if (v.SamplePtr > v.SampleEndPtr) {
        this.endVoice(v, Sample);
      }
      if (v.SamplePtr < 0.0) {
        this.endVoice(v, Sample);
      }
    }

    // Add into DSP ring buffer (unless NoDsp is set)
    if (v.si && v.si.NoDsp === false) {
      this.DSP.addVoiceSampleIntoDSP(Sample);
    }

    return Sample;
  }

  ProcessLoopSystem(v) {
    if ((v.getNumbOfLoopsRemaining() > 0) || (v.si.sp.getEndlessLoop() === true)) {
      if (v.SamplePtr > v.si.sp.getLoopEndSampleIndex()) {
        v.SamplePtr = v.si.sp.getLoopStart();
        v.Smoother.activateSampleSmoothing();
        if (v.si.sp.getEndlessLoop() === false) {
          v.decNumbOfLoopsRemaining();
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SymphonieProcessor — AudioWorkletProcessor wrapper
// Mirrors PlayActualMixThread per-sample loop, driven by process()
// ---------------------------------------------------------------------------
class SymphonieProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._expander     = new VoiceExpander();
    this._ready        = false;
    this._masterVolume = 0.8;

    this.port.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'load':
          try {
            this._expander.loadSong(msg.playbackData);
            this._ready = true;
            this.port.postMessage({ type: 'ready' });
          } catch (err) {
            this.port.postMessage({ type: 'error', message: String(err) });
          }
          break;

        case 'stop':
          this._expander.stopAll();
          this._ready = false;
          break;

        case 'volume':
          this._masterVolume = msg.value;
          break;

        default:
          break;
      }
    };
  }

  process(_inputs, outputs) {
    if (!this._ready) return true;
    const out = outputs[0];
    if (!out || !out[0]) return true;

    const L   = out[0];
    const R   = out[1] || out[0];
    const len = L.length;

    for (let i = 0; i < len; i++) {
      // Advance sequencer once per output sample (not once per channel)
      this._expander.checkSongEvent();

      // Mirror PlayActualMixThread (VoiceExpander.ts lines 1229-1245):
      // Left channel
      const dryL = this._expander.getNextMixSample(0);
      this._expander.DSP.advanceWritePtr();
      const wetL = this._expander.DSP.getWetMixSample();
      this._expander.DSP.advanceReadPtr();

      // Right channel
      const dryR = this._expander.getNextMixSample(1);
      this._expander.DSP.advanceWritePtr();
      const wetR = this._expander.DSP.getWetMixSample();
      this._expander.DSP.advanceReadPtr();

      L[i] = Math.max(-1, Math.min(1, (dryL + wetL) * this._masterVolume));
      R[i] = Math.max(-1, Math.min(1, (dryR + wetR) * this._masterVolume));
    }

    return true;
  }
}

registerProcessor('symphonie-processor', SymphonieProcessor);
