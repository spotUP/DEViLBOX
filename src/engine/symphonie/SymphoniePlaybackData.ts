// src/engine/symphonie/SymphoniePlaybackData.ts

export interface SymphonieInstrumentData {
  name: string;
  type: number;              // 0=None, 4=Loop, 8=Sustain, -4=Kill, -8=Silent
  volume: number;            // 0-100
  tune: number;              // signed semitone offset (already includes downsample correction)
  fineTune: number;          // signed fine tune
  noDsp: boolean;            // if true, voice bypasses DSP ring buffer
  multiChannel: number;      // 0=mono, 1=stereoL, 2=stereoR, 3=lineSrc
  loopStart: number;         // raw file value (percentage × 100×256×256) — loop calc in worklet
  loopLen: number;           // raw file value
  numLoops: number;          // 0=infinite
  newLoopSystem: boolean;    // bit 4 of LineSampleFlags
  samples: Float32Array | null;       // null if type is -8/-4/0 (no PCM)
  sampledFrequency: number;  // original sample rate in Hz (0 if unknown → assume 8363)
}

export interface SymphonieDSPEvent {
  row: number;
  channel: number;
  type: number;      // 0=Off, 1=CrEcho, 2=Echo, 3=Delay, 4=CrDelay
  feedback: number;  // 0-127
  bufLen: number;    // 0-127 (percentage of max buffer)
}

export interface SymphoniePatternEvent {
  row: number;
  channel: number;
  note: number;       // 0=no note, 1-127=pitch index
  instrument: number; // 1-based, 0=no instrument change
  volume: number;     // 0-100; 255=no volume change
  cmd: number;
  param: number;
}

export interface SymphoniePattern {
  numRows: number;
  events: SymphoniePatternEvent[];
  dspEvents: SymphonieDSPEvent[];
}

export interface SymphoniePlaybackData {
  title: string;
  bpm: number;
  cycle: number;           // rows per pattern tick (1-8 typical)
  numChannels: number;
  orderList: number[];     // indices into patterns[]
  patterns: SymphoniePattern[];
  instruments: SymphonieInstrumentData[];
  globalDspType: number;   // song-level DSP type (0-4) from header
  globalDspFeedback: number;
  globalDspBufLen: number;
}
