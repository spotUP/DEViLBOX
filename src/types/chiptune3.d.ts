/**
 * Type declarations for chiptune3 library
 */

declare module 'chiptune3' {
  interface ChiptuneJsConfig {
    repeatCount?: number; // -1 = endless, 0 = play once
    stereoSeparation?: number; // percent
    interpolationFilter?: number;
    context?: AudioContext;
  }

  interface ChiptuneMetadata {
    dur: number;
    title?: string;
    type?: string;
    channels?: number;
    patterns?: number;
    orders?: number;
    instruments?: number;
    samples?: number;
    message?: string;
    totalOrders?: number;
    totalPatterns?: number;
    song?: {
      channels: string[];
      instruments: string[];
      samples: string[];
      orders: { name: string; pat: number }[];
      patterns: {
        name: string;
        rows: number[][][]; // rows[rowIndex][channelIndex][commandIndex]
      }[];
      numSubsongs: number;
    };
    [key: string]: unknown;
  }

  interface ProgressData {
    pos: number;
    order: number;
    pattern: number;
    row: number;
  }

  export class ChiptuneJsPlayer {
    constructor(config?: ChiptuneJsConfig);

    // Event handlers
    onInitialized(handler: () => void): void;
    onEnded(handler: () => void): void;
    onError(handler: (error: { type: string }) => void): void;
    onMetadata(handler: (meta: ChiptuneMetadata) => void): void;
    onProgress(handler: (progress: ProgressData) => void): void;
    onFullAudioData(handler: (data: { meta: ChiptuneMetadata; data: [number[], number[]] }) => void): void;

    // Playback controls
    load(url: string): void;
    play(buffer: ArrayBuffer): void;
    stop(): void;
    pause(): void;
    unpause(): void;
    togglePause(): void;

    // Settings
    setRepeatCount(count: number): void;
    setPitch(pitch: number): void;
    setTempo(tempo: number): void;
    setPos(seconds: number): void;
    setOrderRow(order: number, row: number): void;
    setVol(volume: number): void;
    selectSubsong(index: number): void;

    // Compatibility
    seek(seconds: number): void;
    getCurrentTime(): number;
    decodeAll(buffer: ArrayBuffer): void;

    // Properties
    duration: number;
    currentTime: number;
    order: number;
    pattern: number;
    row: number;
    meta: ChiptuneMetadata;
  }
}
